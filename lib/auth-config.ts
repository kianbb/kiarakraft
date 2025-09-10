import { NextAuthConfig } from 'next-auth';
import { getSecureSessionConfig } from './security-config';

// Get secure session configuration based on environment
const sessionConfig = getSecureSessionConfig();

// Shared auth configuration (Edge-compatible)
export const authConfig: Omit<NextAuthConfig, 'providers'> = {
  session: {
    strategy: 'jwt',
    maxAge: sessionConfig.maxAge, // 8 hours in production, 24 hours in development
    updateAge: sessionConfig.updateAge, // 30 minutes in production, 1 hour in development
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sellerProfile = user.sellerProfile;
        token.iat = Math.floor(Date.now() / 1000); // Track token issue time
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
