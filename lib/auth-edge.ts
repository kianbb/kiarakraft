import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth-config';

// Edge-compatible auth instance for middleware
// This doesn't include providers that use bcrypt
export const { auth } = NextAuth({
  ...authConfig,
  providers: [], // No providers needed for session checks in middleware
});
