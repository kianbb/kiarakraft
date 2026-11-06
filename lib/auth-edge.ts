import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth-config';

// Coarse routing check only: Edge cannot revalidate the database account/role.
// Every protected API and server authorization must use lib/auth instead.
// Immutable session claims survive Edge renewal; Node rejects revoked tokens.
export const { auth } = NextAuth({
  ...authConfig,
  providers: [], // No providers needed for session checks in middleware
});
