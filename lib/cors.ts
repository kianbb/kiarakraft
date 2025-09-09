/**
 * CORS Configuration
 * Provides Cross-Origin Resource Sharing protection with origin whitelist
 */

import { NextRequest, NextResponse } from 'next/server';

// Get allowed origins from environment or use defaults
function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  
  // Add production domain
  origins.push('https://www.kiarakraft.com');
  origins.push('https://kiarakraft.com');
  
  // Add Vercel preview domains if configured
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }
  
  // Add custom allowed origins from environment
  const customOrigins = process.env.ALLOWED_CORS_ORIGINS;
  if (customOrigins) {
    customOrigins.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) {
        origins.push(trimmed);
      }
    });
  }
  
  // In development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000');
    origins.push('http://127.0.0.1:3000');
  }
  
  return origins;
}

/**
 * CORS configuration options
 */
export interface CorsOptions {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * Apply CORS headers to response
 */
export function applyCorsHeaders(
  request: NextRequest,
  response: NextResponse,
  options?: CorsOptions
): NextResponse {
  const origin = request.headers.get('origin');
  
  // Get configuration
  const allowedOrigins = options?.allowedOrigins || getAllowedOrigins();
  const allowedMethods = options?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const allowedHeaders = options?.allowedHeaders || [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
  ];
  const exposedHeaders = options?.exposedHeaders || [
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ];
  const credentials = options?.credentials !== false;
  const maxAge = options?.maxAge || 86400; // 24 hours
  
  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.includes('*')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  
  // Set other CORS headers
  if (credentials && origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  response.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  response.headers.set('Access-Control-Expose-Headers', exposedHeaders.join(', '));
  response.headers.set('Access-Control-Max-Age', maxAge.toString());
  
  // Add Vary header for proper caching
  response.headers.set('Vary', 'Origin');
  
  return response;
}

/**
 * CORS middleware for API routes
 */
export function withCORS<T extends unknown[]>(
  handler: (request: NextRequest, ...rest: T) => Promise<Response>,
  options?: CorsOptions
) {
  return async (request: NextRequest, ...rest: T): Promise<Response> => {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(request, response, options);
    }
    
    // Process actual request
    const response = await handler(request, ...rest);
    
    // Apply CORS headers to response
    if (response instanceof NextResponse) {
      return applyCorsHeaders(request, response, options);
    }
    
    // For regular Response objects, create a new NextResponse with CORS headers
    const nextResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    
    return applyCorsHeaders(request, nextResponse, options);
  };
}

/**
 * Strict CORS configuration for sensitive endpoints
 */
export const strictCorsOptions: CorsOptions = {
  allowedOrigins: ['https://www.kiarakraft.com', 'https://kiarakraft.com'],
  allowedMethods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 3600, // 1 hour
};

/**
 * Public API CORS configuration
 */
export const publicApiCorsOptions: CorsOptions = {
  allowedOrigins: getAllowedOrigins(),
  allowedMethods: ['GET'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 86400, // 24 hours
};