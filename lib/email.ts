import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { ReactElement } from 'react';

// Email configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Force use of custom domain when Resend is available, ignore system EMAIL_FROM override
const EMAIL_FROM = RESEND_API_KEY
  ? 'noreply@kiarakraft.com'
  : process.env.EMAIL_FROM || 'noreply@kiarakraft.com';

// SMTP fallback configuration
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

// Initialize Resend client if API key is available
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Initialize SMTP transporter as fallback
const smtpTransporter =
  SMTP_CONFIG.host && SMTP_CONFIG.auth.user && SMTP_CONFIG.auth.pass
    ? nodemailer.createTransport(SMTP_CONFIG)
    : null;

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: ReactElement;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: 'resend' | 'smtp';
}

/**
 * Send email using Resend or SMTP fallback
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const { to, subject, html, text, react } = options;

    // Convert React component to HTML if provided
    let finalHtml = html;
    if (react) {
      // Dynamic import to avoid SSR issues
      const { renderToStaticMarkup } = await import('react-dom/server');
      finalHtml = renderToStaticMarkup(react);
    }

    if (!finalHtml && !text) {
      throw new Error('Either html, text, or react content must be provided');
    }

    // Try Resend first
    if (resend) {
      try {
        let result;

        if (react) {
          // Use React component directly with Resend
          result = await resend.emails.send({
            from: EMAIL_FROM,
            to: Array.isArray(to) ? to : [to],
            subject,
            react,
          });
        } else {
          // Use HTML/text content
          const emailOptions = {
            from: EMAIL_FROM,
            to: Array.isArray(to) ? to : [to],
            subject,
            ...(finalHtml ? { html: finalHtml } : {}),
            ...(text ? { text: text } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any; // Resend types are too restrictive for HTML/text mode

          result = await resend.emails.send(emailOptions);
        }

        console.log(`Email sent via Resend: ${result.data?.id}`);
        return {
          success: true,
          messageId: result.data?.id,
          provider: 'resend',
        };
      } catch (resendError) {
        console.error('🚨 RESEND FAILED - Details:');
        console.error(
          'Error message:',
          resendError instanceof Error ? resendError.message : 'Unknown error'
        );
        console.error('Full error object:', resendError);
        console.error('EMAIL_FROM being used:', EMAIL_FROM);
        console.error('Resend options that failed:', {
          from: EMAIL_FROM,
          to: '[REDACTED]',
          subject,
          hasHtml: !!finalHtml,
          hasText: !!text,
        });
        console.error('Falling back to SMTP...');

        // Fall through to SMTP if Resend fails
        if (!smtpTransporter) {
          throw resendError;
        }
      }
    }

    // SMTP fallback
    if (smtpTransporter) {
      const result = await smtpTransporter.sendMail({
        from: EMAIL_FROM,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html: finalHtml,
        text,
      });

      console.log(`Email sent via SMTP: ${result.messageId}`);
      return {
        success: true,
        messageId: result.messageId,
        provider: 'smtp',
      };
    }

    throw new Error(
      'No email provider configured. Please set RESEND_API_KEY or SMTP credentials.'
    );
  } catch (error) {
    console.error('Email sending failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    };
  }
}

/**
 * Generate secure password reset token
 */
export function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get reset URL for password reset emails
 */
export function getResetUrl(token: string, locale: string = 'fa'): string {
  const baseUrl = process.env.PUBLIC_APP_BASE || 'http://localhost:3000';
  return `${baseUrl}/${locale}/reset-password?token=${token}`;
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Rate limiting for email sending (in-memory, use Redis in production)
 */
const emailRateLimit = new Map<string, { count: number; resetTime: number }>();
const EMAIL_RATE_LIMIT = 3; // Max 3 emails per hour per email address
const EMAIL_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

export function checkEmailRateLimit(email: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const key = email.toLowerCase();
  const existing = emailRateLimit.get(key);

  if (!existing || now > existing.resetTime) {
    const resetTime = now + EMAIL_RATE_WINDOW;
    emailRateLimit.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: EMAIL_RATE_LIMIT - 1, resetTime };
  }

  if (existing.count >= EMAIL_RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: existing.resetTime };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: EMAIL_RATE_LIMIT - existing.count,
    resetTime: existing.resetTime,
  };
}

// Cleanup old rate limit entries
setInterval(
  () => {
    const now = Date.now();
    const keysToDelete: string[] = [];

    emailRateLimit.forEach((data, key) => {
      if (now > data.resetTime) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => emailRateLimit.delete(key));
  },
  5 * 60 * 1000
); // Cleanup every 5 minutes
