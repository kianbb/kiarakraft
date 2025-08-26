import { NextRequest } from 'next/server';
import { withRateLimit, createRateLimiter } from '@/lib/rateLimit';
import { isValidEmail, sendEmail } from '@/lib/email';
import {
  sanitizeAndValidate,
  SanitizationLevel,
  escapeHtml,
} from '@/lib/input-sanitization';

// Specific rate limiter for contact endpoint: 5 requests per 10 minutes per IP
const contactRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
});

export const POST = withRateLimit(
  contactRateLimit,
  async (req: NextRequest) => {
    try {
      const contentType = req.headers.get('content-type') || '';
      let payload: { name?: string; email?: string; message?: string } = {};

      if (contentType.includes('application/json')) {
        payload = await req.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const form = await req.formData();
        payload = {
          name: String(form.get('name') || ''),
          email: String(form.get('email') || ''),
          message: String(form.get('message') || ''),
        };
      } else {
        return new Response(
          JSON.stringify({ error: 'Unsupported content type' }),
          {
            status: 415,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Sanitize and validate all inputs
      const nameValidation = sanitizeAndValidate(payload.name || '', {
        maxLength: 100,
        minLength: 1,
        sanitizationLevel: SanitizationLevel.STRICT,
        allowEmpty: false,
        detectThreats: true,
      });

      const emailInput = (payload.email || '').trim();

      const messageValidation = sanitizeAndValidate(payload.message || '', {
        maxLength: 2000,
        minLength: 10,
        sanitizationLevel: SanitizationLevel.STRICT,
        allowEmpty: false,
        detectThreats: true,
      });

      // Check for validation errors
      const validationErrors: string[] = [];

      if (!nameValidation.isValid) {
        validationErrors.push(
          'Invalid name: ' + nameValidation.errors.join(', ')
        );
      }

      if (!emailInput) {
        validationErrors.push('Email is required');
      }

      if (!messageValidation.isValid) {
        validationErrors.push(
          'Invalid message: ' + messageValidation.errors.join(', ')
        );
      }

      if (validationErrors.length > 0) {
        return new Response(
          JSON.stringify({ error: validationErrors.join('; ') }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const name = nameValidation.sanitized;
      const email = emailInput;
      const message = messageValidation.sanitized;

      // Log security threats if detected
      if (nameValidation.threats && nameValidation.threats.length > 0) {
        console.warn(
          'Security threats detected in contact name:',
          nameValidation.threats
        );
      }

      if (messageValidation.threats && messageValidation.threats.length > 0) {
        console.warn(
          'Security threats detected in contact message:',
          messageValidation.threats
        );
      }

      if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ error: 'Invalid email' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const to = process.env.CONTACT_RECIPIENT || 'info@kiarakraft.com';
      const subject = `New contact message from ${name}`;
      const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <div style="white-space: pre-wrap; border: 1px solid #eee; padding: 12px; border-radius: 8px;">${escapeHtml(
          message
        )}</div>
      </div>
    `;

      const result = await sendEmail({
        to,
        subject,
        html,
        text: `${name} <${email}>\n\n${message}`,
      });

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error || 'Failed to send message' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Unexpected error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
);

// escapeHtml function now imported from input-sanitization module
