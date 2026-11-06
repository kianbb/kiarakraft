import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import {
  sendEmail,
  getResetUrl,
  isValidEmail,
  checkEmailRateLimit,
} from '@/lib/email';
import { z } from 'zod';
import PasswordResetEmail from '@/lib/email-templates/PasswordResetEmail';
import {
  issuePasswordReset,
  readResetBody,
  ResetInputError,
} from '@/lib/password-reset';

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email('Invalid email address'),
  locale: z.enum(['fa', 'en']).optional().default('fa'),
});

const handleForgotPassword = withCSRF(async function (
  request: NextRequest,
  requestStartedAt: number
) {
  try {
    const body = await readResetBody(request);
    const { email, locale } = forgotPasswordSchema.parse(body);

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        {
          error: 'Invalid email address format',
        },
        { status: 400 }
      );
    }

    // Check email-specific rate limiting
    const rateLimitResult = checkEmailRateLimit(normalizedEmail);
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil(
        (rateLimitResult.resetTime - Date.now()) / 1000
      );
      return NextResponse.json(
        {
          error: 'Too many password reset attempts. Please try again later.',
          retryAfter,
        },
        { status: 429 }
      );
    }

    // Failures below retain the same response as a nonexistent account.
    try {
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          name: true,
          email: true,
          passwordChangedAt: true,
        },
      });

      // Always return success to prevent email enumeration attacks
      // But only send email if user exists
      if (user) {
        try {
          const token = await issuePasswordReset(
            prisma,
            user.id,
            user.passwordChangedAt?.getTime() ?? 0,
            requestStartedAt
          );

          // A concurrent password change can supersede this request.
          if (token) {
            const resetUrl = getResetUrl(token, locale);

            // Send password reset email
            const emailResult = await sendEmail({
              to: user.email,
              subject:
                locale === 'fa'
                  ? 'بازیابی رمز عبور - کیارا کرافت'
                  : 'Password Reset - Kiara Kraft',
              react: PasswordResetEmail({
                userName: user.name || user.email.split('@')[0],
                resetUrl,
                locale,
              }),
            });

            if (!emailResult.success) {
              console.error('Password reset email delivery failed');
              // Don't expose email sending failure to user for security
            } else {
              console.log('Password reset email submitted');
            }
          }
        } catch {
          console.error('Password reset issuance failed');
          // Don't expose internal errors to user
        }
      }
    } catch {
      console.error('Password reset account lookup failed');
    }

    // Always return success message
    const successMessage =
      locale === 'fa'
        ? 'اگر این ایمیل در سیستم ما موجود باشد، لینک بازیابی رمز عبور به آن ارسال خواهد شد.'
        : 'If this email exists in our system, a password reset link will be sent to it.';

    return NextResponse.json(
      {
        success: true,
        message: successMessage,
        remainingAttempts: rateLimitResult.remaining,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof ResetInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error('Forgot password request failed');
    return NextResponse.json(
      {
        error: 'An error occurred while processing your request',
      },
      { status: 500 }
    );
  }
});

export async function POST(request: NextRequest) {
  // Capture before any limiter/CSRF/database await, not after a queued request
  // has already been overtaken by a completed password recovery.
  const requestStartedAt = Date.now();
  return withRateLimit(authRateLimit, (limitedRequest: NextRequest) =>
    handleForgotPassword(limitedRequest, requestStartedAt)
  )(request);
}
