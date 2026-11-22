import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth-config';

// Coarse routing check only. Proxy reads the signed session claims without a
// database lookup. Protected APIs and server authorization use lib/auth to
// revalidate the account, role and session.
export const { auth } = NextAuth({
  ...authConfig,
  providers: [], // Proxy only reads sessions
});
