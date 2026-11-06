import type { NextAuthConfig } from 'next-auth';
import { getSecureSessionConfig } from './security-config';

// Get secure session configuration based on environment
const sessionConfig = getSecureSessionConfig();

// Only these fields belong in a browser-visible session. In particular, never
// serialize the full seller record (identity and verification data live there).
export const sessionUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  image: true,
  passwordChangedAt: true,
  sellerProfile: {
    select: {
      id: true,
      shopName: true,
      displayName: true,
      bio: true,
      region: true,
      avatarUrl: true,
    },
  },
} as const;

type SessionSeller = {
  id: string;
  shopName: string;
  displayName: string;
  bio?: string | null;
  region?: string | null;
  avatarUrl?: string | null;
};

export type VerifiedSessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
  passwordChangedAt: Date | null;
  sellerProfile: SessionSeller | null;
};

type JwtCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['jwt']>;
type RedirectCallback = NonNullable<
  NonNullable<NextAuthConfig['callbacks']>['redirect']
>;

// NextRequest normalizes loopback hosts to localhost. Use the configured app
// origin for redirects, while still rejecting every cross-origin destination.
export function createCanonicalRedirect(
  canonicalUrl?: string
): RedirectCallback {
  return async ({ url, baseUrl }) => {
    const base = new URL(canonicalUrl || baseUrl);
    if (!['http:', 'https:'].includes(base.protocol)) {
      throw new Error('Authentication requires an HTTP(S) application origin');
    }
    try {
      const destination = new URL(url, base.origin);
      return destination.origin === base.origin &&
        !destination.username &&
        !destination.password
        ? destination.href
        : base.origin;
    } catch {
      return base.origin;
    }
  };
}

function sessionSeller(seller: SessionSeller | null | undefined) {
  return seller
    ? {
        id: seller.id,
        shopName: seller.shopName,
        displayName: seller.displayName,
        bio: seller.bio,
        region: seller.region,
        avatarUrl: seller.avatarUrl,
      }
    : null;
}

/** Node authorization: revalidate account existence, credentials and roles. */
export function createVerifiedJwtCallback(
  loadUser: (id: string) => Promise<VerifiedSessionUser | null>
): JwtCallback {
  return async context => {
    const token = await authConfig.callbacks!.jwt!(context);
    if (!token?.sub) return null;
    try {
      const current = await loadUser(token.sub);
      if (
        !current ||
        current.id !== token.sub ||
        token.authVersion !== (current.passwordChangedAt?.getTime() ?? 0) ||
        !['BUYER', 'SELLER', 'ADMIN'].includes(current.role)
      ) {
        return null;
      }
      token.email = current.email;
      token.name = current.name;
      token.picture = current.image;
      token.role = current.role;
      token.sellerProfile = sessionSeller(current.sellerProfile);
      return token;
    } catch {
      // Returning null makes Auth.js clear the cookie. Clearing session.user in
      // the session callback still renews a JWT and is not revocation.
      return null;
    }
  };
}

// Shared auth configuration (Edge-compatible)
export const authConfig: Omit<NextAuthConfig, 'providers'> = {
  session: {
    strategy: 'jwt',
    maxAge: sessionConfig.maxAge, // 8 hours in production, 24 hours in development
    updateAge: sessionConfig.updateAge, // 30 minutes in production, 1 hour in development
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    redirect: createCanonicalRedirect(
      process.env.AUTH_URL || process.env.NEXTAUTH_URL
    ),
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.sellerProfile = sessionSeller(user.sellerProfile);
        token.authVersion = (
          user as typeof user & { authVersion?: number }
        ).authVersion;
        token.authStartedAt = Date.now();
      }
      // Auth.js rewrites `iat` whenever it renews a cookie. These application
      // claims remain unchanged across renewal, including Edge middleware.
      // Old tokens without the claims must authenticate again.
      if (
        !token.sub ||
        typeof token.authVersion !== 'number' ||
        !Number.isSafeInteger(token.authVersion) ||
        token.authVersion < 0 ||
        typeof token.authStartedAt !== 'number' ||
        !Number.isSafeInteger(token.authStartedAt) ||
        token.authStartedAt > Date.now() ||
        token.authStartedAt <= Date.now() - sessionConfig.maxAge * 1000
      ) {
        return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.sellerProfile = token.sellerProfile as {
          id: string;
          shopName: string;
          displayName: string;
          bio?: string | null;
          region?: string | null;
          avatarUrl?: string | null;
        } | null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
  },
};
