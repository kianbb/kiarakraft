/**
 * Payment Webhook Signature Validation
 * Validates payment gateway webhook signatures to prevent fraud
 */

import crypto from 'crypto';

/**
 * Validate ZarinPal webhook signature
 * ZarinPal uses HMAC-SHA256 for webhook validation
 */
export function validateZarinPalSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  try {
    // ZarinPal sends signature in header as: sha256=<signature>
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      console.warn('Invalid ZarinPal signature format');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const sig1 = Buffer.from(parts[1], 'hex');
      const sig2 = Buffer.from(expectedSignature, 'hex');

      // Buffers must be same length for timingSafeEqual
      if (sig1.length !== sig2.length) {
        return false;
      }

      return crypto.timingSafeEqual(sig1, sig2);
    } catch {
      return false;
    }
  } catch (error) {
    console.error('ZarinPal signature validation error:', error);
    return false;
  }
}

/**
 * Validate IDPay webhook signature
 * IDPay uses different signature method
 */
export function validateIDPaySignature(
  payload: Record<string, unknown>,
  signature: string,
  apiKey: string
): boolean {
  try {
    // IDPay signature is typically: HMAC-SHA256(order_id + amount + status, api_key)
    const signatureData = `${payload.order_id}${payload.amount}${payload.status}`;

    const expectedSignature = crypto
      .createHmac('sha256', apiKey)
      .update(signatureData)
      .digest('hex');

    // Use timing-safe comparison
    try {
      const sig1 = Buffer.from(signature, 'hex');
      const sig2 = Buffer.from(expectedSignature, 'hex');

      // Buffers must be same length for timingSafeEqual
      if (sig1.length !== sig2.length) {
        return false;
      }

      return crypto.timingSafeEqual(sig1, sig2);
    } catch {
      return false;
    }
  } catch (error) {
    console.error('IDPay signature validation error:', error);
    return false;
  }
}

/**
 * Generic webhook signature validation using HMAC
 */
export function validateWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      const sig1 = Buffer.from(signature, 'hex');
      const sig2 = Buffer.from(expectedSignature, 'hex');

      // Buffers must be same length for timingSafeEqual
      if (sig1.length !== sig2.length) {
        return false;
      }

      return crypto.timingSafeEqual(sig1, sig2);
    } catch {
      return false;
    }
  } catch (error) {
    console.error('Webhook signature validation error:', error);
    return false;
  }
}

/**
 * Validate request timestamp to prevent replay attacks
 * Ensures webhook was sent recently (within tolerance window)
 */
export function validateTimestamp(
  timestamp: number | string,
  toleranceSeconds: number = 300 // 5 minutes default
): boolean {
  try {
    const webhookTime =
      typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;

    if (isNaN(webhookTime)) {
      console.warn('Invalid webhook timestamp');
      return false;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - webhookTime);

    if (timeDiff > toleranceSeconds) {
      console.warn(`Webhook timestamp too old: ${timeDiff}s difference`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Timestamp validation error:', error);
    return false;
  }
}

/**
 * Extract and validate webhook headers
 */
export function extractWebhookHeaders(headers: Headers): {
  signature?: string;
  timestamp?: string;
  webhookId?: string;
} {
  return {
    signature:
      headers.get('x-zarinpal-signature') ||
      headers.get('x-idpay-signature') ||
      headers.get('x-webhook-signature') ||
      undefined,
    timestamp:
      headers.get('x-webhook-timestamp') ||
      headers.get('x-timestamp') ||
      undefined,
    webhookId:
      headers.get('x-webhook-id') || headers.get('x-request-id') || undefined,
  };
}

/**
 * Middleware to validate payment webhook
 */
export async function validatePaymentWebhook(
  request: Request,
  provider: 'zarinpal' | 'idpay',
  secret?: string
): Promise<{
  valid: boolean;
  error?: string;
  payload?: Record<string, unknown>;
}> {
  try {
    // Get webhook secret from environment if not provided
    const webhookSecret =
      secret ||
      (provider === 'zarinpal'
        ? process.env.ZARINPAL_WEBHOOK_SECRET
        : process.env.IDPAY_WEBHOOK_SECRET);

    if (!webhookSecret) {
      return {
        valid: false,
        error: `No webhook secret configured for ${provider}`,
      };
    }

    // Extract headers
    const { signature, timestamp } = extractWebhookHeaders(request.headers);

    if (!signature) {
      return {
        valid: false,
        error: 'Missing webhook signature in headers',
      };
    }

    // Validate timestamp if present (prevent replay attacks)
    if (timestamp && !validateTimestamp(timestamp)) {
      return {
        valid: false,
        error: 'Webhook timestamp validation failed (possible replay attack)',
      };
    }

    // Get raw body for signature validation
    const rawBody = await request.text();
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return {
        valid: false,
        error: 'Invalid JSON payload',
      };
    }

    // Validate signature based on provider
    let isValid = false;
    if (provider === 'zarinpal') {
      isValid = validateZarinPalSignature(rawBody, signature, webhookSecret);
    } else if (provider === 'idpay') {
      isValid = validateIDPaySignature(payload, signature, webhookSecret);
    }

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid webhook signature (possible forgery attempt)',
      };
    }

    return {
      valid: true,
      payload,
    };
  } catch (error) {
    console.error('Payment webhook validation error:', error);
    return {
      valid: false,
      error: 'Webhook validation failed',
    };
  }
}

/**
 * Log webhook validation attempts for audit
 */
export function logWebhookValidation(
  provider: string,
  valid: boolean,
  metadata?: Record<string, unknown>
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    provider,
    valid,
    ...metadata,
  };

  if (!valid) {
    console.warn('[WEBHOOK SECURITY]', logEntry);
    // In production, send to security monitoring service
  } else {
    console.log('[WEBHOOK]', logEntry);
  }
}
