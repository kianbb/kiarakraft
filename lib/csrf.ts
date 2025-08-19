import { NextRequest } from 'next/server';

/**
 * Basic CSRF protection by validating origin and referer headers
 * For production, consider using a more robust CSRF token system
 */
export function validateCSRF(request: NextRequest): boolean {
  // Skip CSRF check for GET requests (they should be idempotent)
  if (request.method === 'GET') {
    return true;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // Check if request has origin header
  if (origin) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      console.warn(`CSRF: Origin mismatch - Origin: ${originHost}, Host: ${host}`);
      return false;
    }
  }

  // Check referer header as fallback
  if (referer) {
    const refererHost = new URL(referer).host;
    if (refererHost !== host) {
      console.warn(`CSRF: Referer mismatch - Referer: ${refererHost}, Host: ${host}`);
      return false;
    }
  }

  // If neither origin nor referer is present for non-GET requests, it's suspicious
  if (!origin && !referer) {
    console.warn('CSRF: Missing both origin and referer headers');
    return false;
  }

  return true;
}

/**
 * Middleware helper to add CSRF validation to API routes
 */
export function withCSRF<T extends unknown[]>(handler: (request: NextRequest, ...rest: T) => Promise<Response>) {
  return async (request: NextRequest, ...rest: T): Promise<Response> => {
    if (!validateCSRF(request)) {
      return new Response(
        JSON.stringify({ error: 'CSRF validation failed' }),
        { 
          status: 403, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    return handler(request, ...rest);
  };
}