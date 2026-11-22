/**
 * Session Management
 * Handles session invalidation and tracking for security events
 */

import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Invalidate all sessions for a user (e.g., after password reset)
 * Since NextAuth uses JWT tokens, we track a "passwordChangedAt" timestamp
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  try {
    // Share the account lock with password/reset writers. JWTs compare the
    // immutable millisecond credential version, never Auth.js's rolling iat.
    await prisma.$transaction(async tx => {
      const [user] = await tx.$queryRaw<
        Array<{ passwordChangedAt: Date | null }>
      >`SELECT "passwordChangedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user) throw new Error('Account not found');
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordChangedAt: new Date(
            Math.max(Date.now(), (user.passwordChangedAt?.getTime() ?? 0) + 1)
          ),
        },
      });

      // Log security event
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.auditLog.create({
        data: {
          action: 'sessions_invalidated',
          userId,
          targetId: userId,
          targetType: 'user',
          metadata: {
            reason: 'password_reset',
            timestamp: new Date().toISOString(),
          },
          success: true,
        },
      });
    });
  } catch (error) {
    console.error('Failed to invalidate user sessions');
    throw error;
  }
}

/**
 * Check if a session is still valid
 * Used in auth callbacks to verify JWT hasn't been invalidated
 */
export async function isSessionValid(
  userId: string,
  credentialVersion: number
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordChangedAt: true },
    });

    if (!user) {
      return false;
    }

    return (
      Number.isSafeInteger(credentialVersion) &&
      credentialVersion >= 0 &&
      credentialVersion === (user.passwordChangedAt?.getTime() ?? 0)
    );
  } catch {
    console.error('Failed to check session validity');
    // Fail closed - treat as invalid if we can't verify
    return false;
  }
}

/**
 * Clear authentication cookies (client-side logout helper)
 */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  // NextAuth session cookies
  const authCookies = [
    'authjs.callback-url',
    'authjs.csrf-token',
    'authjs.session-token',
    '__Secure-authjs.callback-url',
    '__Secure-authjs.csrf-token',
    '__Secure-authjs.session-token',
  ];

  for (const cookieName of authCookies) {
    cookieStore.delete(cookieName);
  }
}
