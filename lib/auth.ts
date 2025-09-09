import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  getClientIP,
  validateEmail,
} from '@/lib/auth-security';
import { authConfig } from '@/lib/auth-config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Validate email format
        if (!validateEmail(email)) {
          return null;
        }

        // Get client IP for rate limiting
        const clientIP = req ? getClientIP(req as Request) : 'unknown';

        // Check rate limiting and account lockout
        const rateLimitCheck = await checkLoginRateLimit(email, clientIP);

        if (!rateLimitCheck.allowed) {
          // Record the failed attempt
          await recordLoginAttempt(email, clientIP, false);

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

        // Find user
        const user = await prisma.user.findUnique({
          where: {
            email: email,
          },
          include: {
            sellerProfile: true,
          },
        });

        if (!user) {
          // Record failed attempt
          await recordLoginAttempt(email, clientIP, false);
          return null;
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          // Record failed attempt
          await recordLoginAttempt(email, clientIP, false);
          return null;
        }

        // Record successful attempt
        await recordLoginAttempt(email, clientIP, true);

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
});
