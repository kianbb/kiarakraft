import createMiddleware from 'next-intl/middleware';
import { withAuth } from 'next-auth/middleware';
import { NextRequest } from 'next/server';

const intlMiddleware = createMiddleware({
  locales: ['fa', 'en'],
  defaultLocale: 'fa', // Persian remains the default
  localePrefix: 'always',
  localeDetection: true
});

const authMiddleware = withAuth(
  function onSuccess(req) {
    return intlMiddleware(req);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Check if the route requires seller role
        if (req.nextUrl.pathname.includes('/seller')) {
          return token?.role === 'SELLER';
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
  // Apply auth middleware only to protected routes
  const protectedPaths = ['/seller'];
  const isProtectedPath = protectedPaths.some(path => 
    req.nextUrl.pathname.includes(path)
  );

  if (isProtectedPath) {
    return (authMiddleware as any)(req);
  }

  return intlMiddleware(req);
}

export const config = {
  // exclude static assets and ALL APIs from locale handling
  matcher: ['/((?!_next|.*\\..*|api).*)']
};