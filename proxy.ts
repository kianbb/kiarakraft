import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-proxy';

const intlMiddleware = createMiddleware({
  locales: ['fa', 'en'],
  defaultLocale: 'fa', // Persian remains the default
  localePrefix: 'always',
  localeDetection: false,
});

export default async function proxy(req: NextRequest) {
  // Apply auth check only to protected routes
  const pathname = req.nextUrl.pathname;
  const normalizedPath = pathname.replace(/\/+/g, '/').replace(/\.\./g, '');
  const pathSegments = normalizedPath.split('/').filter(Boolean);

  const isProtectedPath =
    pathSegments.length >= 2 &&
    (pathSegments[0].toLowerCase() === 'fa' ||
      pathSegments[0].toLowerCase() === 'en') &&
    (pathSegments[1].toLowerCase() === 'seller' ||
      pathSegments[1].toLowerCase() === 'admin');

  // If the URL contains an explicit locale prefix
  const isLocalePrefixed =
    pathname === '/fa' ||
    pathname === '/en' ||
    pathname.startsWith('/fa/') ||
    pathname.startsWith('/en/');

  if (isLocalePrefixed && isProtectedPath) {
    // Check authentication for protected paths
    const session = await auth();

    if (!session?.user) {
      // Redirect to login with callback
      const locale = pathSegments[0];
      const loginUrl = new URL(`/${locale}/auth/login`, req.url);
      // Relative path: req.url's host can differ from the browser's
      // (for example localhost versus 127.0.0.1), which made the login
      // page discard the callback as cross-origin.
      loginUrl.searchParams.set(
        'callbackUrl',
        `${req.nextUrl.pathname}${req.nextUrl.search}`
      );
      return NextResponse.redirect(loginUrl);
    }

    // Check role-based access
    const isSellerPath = pathSegments[1].toLowerCase() === 'seller';
    const isAdminPath = pathSegments[1].toLowerCase() === 'admin';

    if (isSellerPath && session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (isAdminPath && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  // Apply intl middleware for locale handling
  if (!isLocalePrefixed) {
    return intlMiddleware(req);
  }

  return NextResponse.next();
}

export const config = {
  // exclude static assets and ALL APIs from locale handling
  matcher: ['/((?!_next|.*\\..*|api).*)'],
};
