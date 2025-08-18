import { NextRequest } from 'next/server';

// In-memory rate limiting (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  rateLimitMap.forEach((data, key) => {
    if (now > data.resetTime) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => rateLimitMap.delete(key));
}, 5 * 60 * 1000); // Cleanup every 5 minutes

export function createRateLimiter(config: RateLimitConfig) {
  return function rateLimit(request: NextRequest): { allowed: boolean; remainingRequests: number; resetTime: number } {
  const ip = request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         request.headers.get('cf-connecting-ip') || 
               'unknown';
    
    // Create a unique key for this IP and endpoint
    const endpoint = new URL(request.url).pathname;
    const key = `${ip}:${endpoint}`;
    
    const now = Date.now();
    const windowEnd = now + config.windowMs;
    
    const existingEntry = rateLimitMap.get(key);
    
    if (!existingEntry || now > existingEntry.resetTime) {
      // First request or window expired
      rateLimitMap.set(key, {
        count: 1,
        resetTime: windowEnd
      });
      
      return {
        allowed: true,
        remainingRequests: config.maxRequests - 1,
        resetTime: windowEnd
      };
    }
    
    if (existingEntry.count >= config.maxRequests) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: existingEntry.resetTime
      };
    }
    
    existingEntry.count++;
    
    return {
      allowed: true,
      remainingRequests: config.maxRequests - existingEntry.count,
      resetTime: existingEntry.resetTime
    };
  };
}

// Pre-configured rate limiters for different endpoint types
export const paymentRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5 // 5 payment attempts per 15 minutes
});

export const adminRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute  
  maxRequests: 30 // 30 admin actions per minute
});

export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10 // 10 auth attempts per 15 minutes
});

export const orderRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3 // 3 orders per 5 minutes
});

export const uploadRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10 // 10 uploads per minute
});

/**
 * Middleware helper to add rate limiting to API routes
 */
export function withRateLimit(
  rateLimiter: ReturnType<typeof createRateLimiter>,
  handler: (request: NextRequest) => Promise<Response>
) {
  return async (request: NextRequest): Promise<Response> => {
    const { allowed, remainingRequests, resetTime } = rateLimiter(request);
    
    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      
  console.warn(`Rate limit exceeded for ${request.url} from IP ${request.headers.get('x-forwarded-for') || 'unknown'}`);
      
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: retryAfter
        }),
        { 
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString()
          } 
        }
      );
    }
    
    const response = await handler(request);
    
    // Add rate limit headers to successful responses
    response.headers.set('X-RateLimit-Remaining', remainingRequests.toString());
    response.headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
    
    return response;
  };
}