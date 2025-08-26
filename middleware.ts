import createMiddleware from 'next-intl/middleware';
import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware({
  locales: ['fa', 'en'],
  defaultLocale: 'fa', // Persian remains the default
  localePrefix: 'always',
  localeDetection: false,
});

const authMiddleware = withAuth(
  function onSuccess(req) {
    return intlMiddleware(req);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname.toLowerCase();

        // Secure path matching to prevent traversal attacks
        const normalizedPath = pathname
          .replace(/\/+/g, '/')
          .replace(/\.\./g, '');
        const pathSegments = normalizedPath.split('/').filter(Boolean);

        const isSellerPath =
          pathSegments.length >= 2 &&
          (pathSegments[0] === 'fa' || pathSegments[0] === 'en') &&
          pathSegments[1] === 'seller';
        const isAdminPath =
          pathSegments.length >= 2 &&
          (pathSegments[0] === 'fa' || pathSegments[0] === 'en') &&
          pathSegments[1] === 'admin';

        // Check if the route requires seller role
        if (isSellerPath) {
          return token?.role === 'SELLER';
        }
        // Check if the route requires admin role
        if (isAdminPath) {
          return token?.role === 'ADMIN';
        }
        return !!token;
      },
    },
    pages: {
      // Use locale-aware signIn path; next-intl middleware will prefix
      signIn: '/auth/login',
    },
  }
);

export default function middleware(req: NextRequest) {
  // Apply auth middleware only to protected routes - secure matching to prevent traversal
  const pathname = req.nextUrl.pathname.toLowerCase();
  const normalizedPath = pathname.replace(/\/+/g, '/').replace(/\.\./g, '');
  const pathSegments = normalizedPath.split('/').filter(Boolean);

  const isProtectedPath =
    pathSegments.length >= 2 &&
    (pathSegments[0] === 'fa' || pathSegments[0] === 'en') &&
    (pathSegments[1] === 'seller' || pathSegments[1] === 'admin');

  // If the URL already contains an explicit locale prefix, avoid rewriting to preserve
  // correct status codes (e.g., ensure notFound() yields HTTP 404 instead of a soft 200).
  const isLocalePrefixed =
    pathname === '/fa' ||
    pathname === '/en' ||
    pathname.startsWith('/fa/') ||
    pathname.startsWith('/en/');

  if (isLocalePrefixed) {
    if (isProtectedPath) {
      return (authMiddleware as (req: NextRequest) => Promise<NextResponse>)(
        req
      );
    }
    return NextResponse.next();
  }

  // For non-locale-prefixed paths (e.g., "/"), apply locale middleware to redirect/rewrite
  return intlMiddleware(req);
}

export const config = {
  // exclude static assets and ALL APIs from locale handling
  matcher: ['/((?!_next|.*\\..*|api).*)'],
};
