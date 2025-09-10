import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { validatePasswordComplexity } from '@/lib/auth-security';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const body = await request.json();
      const { token, password } = resetPasswordSchema.parse(body);

      // Validate password complexity
      const passwordValidation = validatePasswordComplexity(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          {
            error: 'Password does not meet security requirements',
            details: passwordValidation.errors,
          },
          { status: 400 }
        );
      }

      // Find valid reset token
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token,
          used: false,
          expiresAt: { gt: new Date() }, // Not expired
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!resetToken) {
        return NextResponse.json(
          {
            error: 'Invalid or expired reset token',
          },
          { status: 400 }
        );
      }

      // Hash the new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Update user password and mark token as used in a transaction
      await prisma.$transaction(async tx => {
        // Update user password and invalidate all sessions
        await tx.user.update({
          where: { id: resetToken.userId },
          data: {
            password: hashedPassword,
            passwordChangedAt: new Date(), // Invalidate all existing sessions
          },
        });

        // Mark token as used
        await tx.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true },
        });

        // Clean up old expired or used tokens for this user
        await tx.passwordResetToken.deleteMany({
          where: {
            userId: resetToken.userId,
            OR: [
              { expiresAt: { lt: new Date() } }, // Expired tokens
              { used: true, id: { not: resetToken.id } }, // Other used tokens (keep current one for audit)
            ],
          },
        });
      });

      console.log('Password reset completed successfully');

      return NextResponse.json({
        success: true,
        message:
          'Password has been reset successfully. You can now log in with your new password.',
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

      console.error('Error in reset password API:', error);
      return NextResponse.json(
        {
          error: 'An error occurred while resetting your password',
        },
        { status: 500 }
      );
    }
  })
);

// GET route to validate reset token
export const GET = withRateLimit(
  authRateLimit,
  async function (request: NextRequest) {
    try {
      const { searchParams } = new URL(request.url);
      const token = searchParams.get('token');

      if (!token) {
        return NextResponse.json(
          {
            error: 'Reset token is required',
          },
          { status: 400 }
        );
      }

      // Check if token exists and is valid
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token,
          used: false,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          expiresAt: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      });

      if (!resetToken) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Invalid or expired reset token',
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        valid: true,
        email: resetToken.user.email,
        expiresAt: resetToken.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Error validating reset token:', error);
      return NextResponse.json(
        {
          valid: false,
          error: 'An error occurred while validating the token',
        },
        { status: 500 }
      );
    }
  }
);
