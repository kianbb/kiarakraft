import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  getClientIP,
  validateEmail,
} from '@/lib/auth-security';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        console.log(`[AUTH DEBUG] authorize() called`);
        console.log(`[AUTH DEBUG] Has credentials: ${!!credentials}`);
        console.log(`[AUTH DEBUG] Has email: ${!!credentials?.email}`);
        console.log(`[AUTH DEBUG] Has password: ${!!credentials?.password}`);

        if (!credentials?.email || !credentials?.password) {
          console.log(`[AUTH DEBUG] FAIL: Missing credentials`);
          return null;
        }

        // Validate email format
        if (!validateEmail(credentials.email)) {
          console.log(`[AUTH DEBUG] FAIL: Invalid email format`);
          return null;
        }

        // Get client IP for rate limiting
        const clientIP = req ? getClientIP(req as Request) : 'unknown';
        console.log(`[AUTH DEBUG] Client IP: ${clientIP}`);

        // Check rate limiting and account lockout
        console.log(`[AUTH DEBUG] Checking rate limits...`);
        const rateLimitCheck = await checkLoginRateLimit(
          credentials.email,
          clientIP
        );

        if (!rateLimitCheck.allowed) {
          console.log(
            `[AUTH DEBUG] FAIL: Rate limit exceeded - ${rateLimitCheck.reason}`
          );
          // Record the failed attempt
          await recordLoginAttempt(credentials.email, clientIP, false);

          // Return specific error information (NextAuth will handle this)
          const error = new Error('Rate limit exceeded');
          if (rateLimitCheck.reason === 'account_locked') {
            error.message = `Account locked. Try again in ${rateLimitCheck.retryAfter} seconds.`;
          } else if (rateLimitCheck.reason === 'too_many_attempts') {
            error.message = `Too many login attempts. Try again in ${rateLimitCheck.retryAfter} seconds.`;
          } else if (rateLimitCheck.reason === 'ip_blocked') {
            error.message = `IP blocked due to too many attempts. Try again later.`;
          }
          throw error;
        }
        console.log(`[AUTH DEBUG] Rate limits OK`);

        // Find user
        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
          include: {
            sellerProfile: true,
          },
        });

        // DEBUG: Log authentication attempt details
        console.log(`[AUTH DEBUG] Login attempt for: ${credentials.email}`);
        console.log(`[AUTH DEBUG] User found: ${user ? 'YES' : 'NO'}`);
        if (user) {
          console.log(`[AUTH DEBUG] User ID: ${user.id}`);
          console.log(
            `[AUTH DEBUG] Password hash first 20 chars: ${user.password.substring(0, 20)}...`
          );
        }

        if (!user) {
          console.log(`[AUTH DEBUG] FAIL: User not found`);
          // Record failed attempt
          await recordLoginAttempt(credentials.email, clientIP, false);
          return null;
        }

        // Check password
        console.log(`[AUTH DEBUG] Comparing password...`);
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );
        console.log(`[AUTH DEBUG] Password valid: ${isPasswordValid}`);

        if (!isPasswordValid) {
          console.log(`[AUTH DEBUG] FAIL: Password mismatch`);
          // Record failed attempt
          await recordLoginAttempt(credentials.email, clientIP, false);
          return null;
        }

        // Record successful attempt
        await recordLoginAttempt(credentials.email, clientIP, true);

        console.log(
          `[AUTH DEBUG] SUCCESS: Authentication successful for ${user.email}`
        );

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
          sellerProfile: user.sellerProfile,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours session timeout
    updateAge: 60 * 60, // Update session every 1 hour if user is active
  },
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
  secret: process.env.NEXTAUTH_SECRET,
};
