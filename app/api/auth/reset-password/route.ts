import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import { validatePasswordComplexity } from '@/lib/auth-security';
import {
  consumePasswordReset,
  validatePasswordReset,
  readResetBody,
  ResetInputError,
  withinBcryptLimit,
} from '@/lib/password-reset';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const noStore = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};
const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(80),
    // bcrypt truncates at 72 UTF-8 bytes, not 72 JavaScript characters.
    password: z.string().min(8).max(72).refine(withinBcryptLimit),
    confirmPassword: z.string().min(1).max(72),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

function invalidToken() {
  return NextResponse.json(
    { valid: false, error: 'Invalid or expired reset token' },
    { status: 400, headers: noStore }
  );
}

export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const { token, password } = resetPasswordSchema.parse(
        await readResetBody(request)
      );
      const passwordValidation = validatePasswordComplexity(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          {
            error: 'Password does not meet security requirements',
            details: passwordValidation.errors,
          },
          { status: 400, headers: noStore }
        );
      }
      if (!(await validatePasswordReset(prisma, token))) return invalidToken();
      const hashedPassword = await bcrypt.hash(password, 12);
      if (!(await consumePasswordReset(prisma, token, hashedPassword)))
        return invalidToken();
      return NextResponse.json(
        {
          success: true,
          message:
            'Password has been reset successfully. You can now log in with your new password.',
        },
        { headers: noStore }
      );
    } catch (error) {
      if (error instanceof ResetInputError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status, headers: noStore }
        );
      }
      if (error instanceof z.ZodError) {
        // Do not serialize token/password inputs, even in validation errors.
        return NextResponse.json(
          { error: 'Invalid request data' },
          { status: 400, headers: noStore }
        );
      }
      console.error('Password reset failed');
      return NextResponse.json(
        { error: 'An error occurred while resetting your password' },
        { status: 500, headers: noStore }
      );
    }
  })
);

// Advisory UI check only; POST claims/revalidates under a database row lock.
export const GET = withRateLimit(
  authRateLimit,
  async function (request: NextRequest) {
    try {
      const token = new URL(request.url).searchParams.get('token');
      if (!token || token.length > 80) return invalidToken();
      const valid = await validatePasswordReset(prisma, token);
      if (!valid) return invalidToken();
      return NextResponse.json(
        {
          valid: true,
          email: valid.email,
          expiresAt: valid.expiresAt.toISOString(),
        },
        { headers: noStore }
      );
    } catch {
      console.error('Reset token validation failed');
      return NextResponse.json(
        { valid: false, error: 'An error occurred while validating the token' },
        { status: 500, headers: noStore }
      );
    }
  }
);
