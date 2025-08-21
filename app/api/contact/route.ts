import { NextRequest } from 'next/server';
import { withRateLimit, createRateLimiter } from '@/lib/rateLimit';
import { isValidEmail, sendEmail } from '@/lib/email';

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

      const name = (payload.name || '').trim();
      const email = (payload.email || '').trim();
      const message = (payload.message || '').trim();

      if (!name || !email || !message) {
        return new Response(
          JSON.stringify({ error: 'All fields are required' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
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

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
