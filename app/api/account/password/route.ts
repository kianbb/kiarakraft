import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { validatePasswordComplexity } from '@/lib/auth-security';
import { invalidateUserSessions } from '@/lib/session-manager';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long'),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

/**
 * Change password for authenticated users
 * Invalidates all existing sessions after password change
 */
export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      // Check authentication
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const body = await request.json();
      const { currentPassword, newPassword } = changePasswordSchema.parse(body);

      // Validate new password complexity
      const passwordValidation = validatePasswordComplexity(newPassword);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          {
            error: 'New password does not meet security requirements',
            details: passwordValidation.errors,
          },
          { status: 400 }
        );
      }

      // Get user with current password
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          password: true,
          email: true,
          name: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordValid) {
        // Log failed attempt for security monitoring
        console.warn(`Failed password change attempt for user ${user.id}`);

        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 401 }
        );
      }

      // Hash the new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password and invalidate all sessions in a transaction
      await prisma.$transaction(async tx => {
        // Update password
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            passwordChangedAt: new Date(), // This invalidates all existing sessions
          },
        });

        // Log the security event
        await tx.auditLog.create({
          data: {
            action: 'password_changed',
            userId: user.id,
            targetId: user.id,
            targetType: 'user',
            metadata: {
              timestamp: new Date().toISOString(),
              ip: request.headers.get('x-forwarded-for') || 'unknown',
              userAgent: request.headers.get('user-agent') || 'unknown',
            },
            success: true,
          },
        });
      });

      // Invalidate all user sessions (additional cleanup)
      await invalidateUserSessions(user.id);

      console.log(`Password changed successfully for user ${user.id}`);

      return NextResponse.json({
        success: true,
        message:
          'Password has been changed successfully. Please log in again with your new password.',
        requiresReauth: true, // Client should redirect to login
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'Invalid request data',
            details: error.issues,
          },
          { status: 400 }
        );
      }

      console.error('Error in change password API:', error);
      return NextResponse.json(
        { error: 'An error occurred while changing your password' },
        { status: 500 }
      );
    }
  })
);

/**
 * GET endpoint to check password requirements
 */
export const GET = async function (_request: NextRequest) {
  // Check authentication
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Return password requirements for the UI
  return NextResponse.json({
    requirements: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      specialChars: '!@#$%^&*(),.?":{}|<>',
    },
    message:
      'Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters.',
  });
};
