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
    // Update the user's passwordChangedAt timestamp
    // This will be checked against the JWT's issued time
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordChangedAt: new Date(),
      },
    });

    // Log security event
    await prisma.auditLog.create({
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
  } catch (error) {
    console.error('Failed to invalidate user sessions:', error);
    throw error;
  }
}

/**
 * Check if a session is still valid
 * Used in auth callbacks to verify JWT hasn't been invalidated
 */
export async function isSessionValid(
  userId: string,
  tokenIssuedAt: number
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordChangedAt: true },
    });

    if (!user) {
      return false;
    }

    // If no passwordChangedAt, session is valid (legacy users)
    if (!user.passwordChangedAt) {
      return true;
    }

    // Check if token was issued after the last password change
    const passwordChangedTimestamp = Math.floor(
      user.passwordChangedAt.getTime() / 1000
    );
    
    return tokenIssuedAt >= passwordChangedTimestamp;
  } catch (error) {
    console.error('Failed to check session validity:', error);
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