import { NextAuthConfig } from 'next-auth';

// Shared auth configuration (Edge-compatible)
export const authConfig: Omit<NextAuthConfig, 'providers'> = {
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours session timeout
    updateAge: 60 * 60, // Update session every 1 hour if user is active
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sellerProfile = user.sellerProfile;
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
