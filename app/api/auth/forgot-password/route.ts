import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, authRateLimit } from '@/lib/rateLimit';
import {
  sendEmail,
  generateResetToken,
  getResetUrl,
  isValidEmail,
  checkEmailRateLimit,
} from '@/lib/email';
import { z } from 'zod';
import PasswordResetEmail from '@/lib/email-templates/PasswordResetEmail';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  locale: z.string().min(2).max(5).optional().default('fa'),
});

export const POST = withRateLimit(
  authRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const body = await request.json();
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

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, name: true, email: true },
      });

      // Always return success to prevent email enumeration attacks
      // But only send email if user exists
      if (user) {
        try {
          // Generate secure reset token
          const token = generateResetToken();
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

          // Clean up old unused tokens for this user
          await prisma.passwordResetToken.deleteMany({
            where: {
              userId: user.id,
              OR: [
                { expiresAt: { lt: new Date() } }, // Expired tokens
                { used: true }, // Used tokens
              ],
            },
          });

          // Create new reset token
          await prisma.passwordResetToken.create({
            data: {
              token,
              userId: user.id,
              expiresAt,
              used: false,
            },
          });

          // Generate reset URL
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
            console.error(
              'Failed to send password reset email:',
              emailResult.error
            );
            // Don't expose email sending failure to user for security
          } else {
            console.log(
              `Password reset email sent to ${user.email} via ${emailResult.provider}`
            );
          }
        } catch (error) {
          console.error('Error processing password reset:', error);
          // Don't expose internal errors to user
        }
      }

      // Always return success message
      const successMessage =
        locale === 'fa'
          ? 'اگر این ایمیل در سیستم ما موجود باشد، لینک بازیابی رمز عبور به آن ارسال خواهد شد.'
          : 'If this email exists in our system, a password reset link will be sent to it.';

      return NextResponse.json({
        success: true,
        message: successMessage,
        remainingAttempts: rateLimitResult.remaining,
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

      console.error('Error in forgot password API:', error);
      return NextResponse.json(
        {
          error: 'An error occurred while processing your request',
        },
        { status: 500 }
      );
    }
  })
);
