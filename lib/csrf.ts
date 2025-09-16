import { NextRequest } from 'next/server';

// Normalize host for comparisons: strip port and leading www.
function normalizeHost(input?: string | null): string | null {
  if (!input) return null;
  const raw = input.split(':')[0].trim().toLowerCase();
  return raw.startsWith('www.') ? raw.slice(4) : raw;
}

function buildAllowedHosts(currentHost: string | null): Set<string> {
  const allowed = new Set<string>();
  const norm = normalizeHost(currentHost);
  if (norm) {
    allowed.add(norm);
    allowed.add(`www.${norm}`); // accept both apex and www
  }

  // Allow configured extra hosts, e.g., preview domains or alternate domains
  const envHosts =
    process.env.ALLOWED_CSRF_HOSTS ||
    process.env.NEXT_PUBLIC_ALLOWED_CSRF_HOSTS;
  if (envHosts) {
    envHosts
      .split(',')
      .map(h => h.trim())
      .filter(Boolean)
      .forEach(h => {
        const n = normalizeHost(h);
        if (n) {
          allowed.add(n);
          allowed.add(`www.${n}`);
        }
      });
  }

  // Common allowance for Vercel preview/production domains if applicable
  // We don't know the exact subdomain; accept *.vercel.app only if explicitly added via env
  return allowed;
}

/**
 * Basic CSRF protection by validating origin or referer hosts against an allowed list.
 * For production, consider synchronizer tokens if making cross-site POSTs.
 */
export function validateCSRF(request: NextRequest): boolean {
  // Skip CSRF check for GET requests (they should be idempotent)
  if (request.method === 'GET') {
    return true;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // SECURITY: Validate URL parsing to prevent bypass attacks
  let originHost: string | null = null;
  let refererHost: string | null = null;

  if (origin) {
    try {
      originHost = normalizeHost(new URL(origin).host);
    } catch {
      console.warn('CSRF: Invalid origin URL format:', origin);
      return false; // Reject invalid URLs immediately
    }
  }

  if (referer) {
    try {
      refererHost = normalizeHost(new URL(referer).host);
    } catch {
      console.warn('CSRF: Invalid referer URL format:', referer);
      return false; // Reject invalid URLs immediately
    }
  }

  const hostNorm = normalizeHost(host);
  const allowed = buildAllowedHosts(hostNorm);

  // If neither origin nor referer is present for non-GET requests, it's suspicious
  if (!originHost && !refererHost) {
    console.warn('CSRF: Missing both origin and referer headers');
    return false;
  }

  const originOk = originHost ? allowed.has(originHost) : false;
  const refererOk = refererHost ? allowed.has(refererHost) : false;

  if (!originOk && !refererOk) {
    console.warn(
      `CSRF: Host mismatch - Origin: ${originHost ?? 'n/a'}, Referer: ${refererHost ?? 'n/a'}, Allowed: ${Array.from(allowed).join(', ')}`
    );
    return false;
  }

  return true;
}

/**
 * Middleware helper to add CSRF validation to API routes
 */
export function withCSRF<T extends unknown[]>(
  handler: (request: NextRequest, ...rest: T) => Promise<Response>
) {
  return async (request: NextRequest, ...rest: T): Promise<Response> => {
    if (!validateCSRF(request)) {
      return new Response(JSON.stringify({ error: 'CSRF validation failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return handler(request, ...rest);
  };
}
