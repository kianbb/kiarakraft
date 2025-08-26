import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { z } from 'zod';

// Initialize DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return purify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'div', 'span'],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

/**
 * Sanitize text content for safe HTML interpolation
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove dangerous JavaScript event handlers and protocols
  const sanitized = text
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onerror=, onclick=
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, ''); // Remove vbscript: protocol

  // Escape HTML entities
  return sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize notification tag for service worker
 */
export function sanitizeNotificationTag(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return 'kiarakraft-notification';
  }

  // Split on dangerous patterns and take the first safe part
  const safeParts = tag.split(/<[^>]*>/); // Split on any HTML tags
  const firstSafePart = safeParts[0] || '';

  // Only allow alphanumeric, hyphens, underscores
  const sanitized = firstSafePart.replace(/[^a-zA-Z0-9\-_]/g, '');
  return sanitized || 'kiarakraft-notification';
}

/**
 * Validate URL for notification actions
 */
export function validateNotificationUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '/fa';
  }

  // Only allow relative URLs or same-origin URLs
  if (url.startsWith('/')) {
    // Sanitize path to prevent path traversal
    const sanitizedPath = url.replace(/\.\./g, '').replace(/\/+/g, '/');
    return sanitizedPath;
  }

  // For absolute URLs, only allow same origin (in production, check against actual domain)
  try {
    const urlObj = new URL(url);
    const allowedHosts = ['localhost', 'kiarakraft.com', 'www.kiarakraft.com'];

    if (!allowedHosts.some(host => urlObj.hostname.endsWith(host))) {
      return '/fa';
    }

    return urlObj.pathname;
  } catch {
    return '/fa';
  }
}

/**
 * Sanitize customer name without exposing PII
 */
export function sanitizeCustomerName(user: {
  name?: string | null;
  email?: string;
}): string {
  // Prefer actual name over email-derived name
  if (user.name) {
    return sanitizeText(user.name.slice(0, 50)); // Limit length
  }

  // Fallback to "Customer" instead of exposing email parts
  return 'Customer';
}

/**
 * Validation schema for notification data
 */
export const notificationDataSchema = z.object({
  orderId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(100)
    .optional(),
  orderTotal: z.number().positive().max(999999999).optional(),
  trackingNumber: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(100)
    .optional(),
  productTitle: z.string().max(200).optional(),
  reviewTitle: z.string().max(200).optional(),
  customerName: z.string().max(100).optional(),
  locale: z.enum(['fa', 'en']).optional(),
});

export type SafeNotificationData = z.infer<typeof notificationDataSchema>;

/**
 * Sanitize and validate notification data
 */
export function sanitizeNotificationData(data: unknown): SafeNotificationData {
  if (!data || typeof data !== 'object') {
    return { locale: 'fa', customerName: 'Customer' };
  }

  const input = data as Record<string, unknown>;

  // Sanitize all string fields first
  const sanitized: Partial<SafeNotificationData> = {};

  // Handle each field with sanitization and safe defaults
  if (typeof input.orderId === 'string') {
    sanitized.orderId = sanitizeText(input.orderId);
  }

  if (typeof input.productTitle === 'string') {
    sanitized.productTitle = sanitizeText(input.productTitle);
  }

  if (typeof input.reviewTitle === 'string') {
    sanitized.reviewTitle = sanitizeText(input.reviewTitle);
  }

  if (typeof input.customerName === 'string') {
    sanitized.customerName = sanitizeText(input.customerName);
  }

  if (typeof input.trackingNumber === 'string') {
    sanitized.trackingNumber = sanitizeText(input.trackingNumber);
  }

  // Handle locale with safe default
  if (input.locale === 'fa' || input.locale === 'en') {
    sanitized.locale = input.locale;
  } else {
    sanitized.locale = 'fa'; // Safe default
  }

  // Filter out unknown fields and ensure we have required defaults
  const result: SafeNotificationData = {
    locale: sanitized.locale || 'fa',
    customerName: sanitized.customerName || 'Customer',
  };

  // Add optional fields if they exist and are valid
  if (sanitized.orderId) result.orderId = sanitized.orderId;
  if (sanitized.productTitle) result.productTitle = sanitized.productTitle;
  if (sanitized.reviewTitle) result.reviewTitle = sanitized.reviewTitle;
  if (sanitized.trackingNumber)
    result.trackingNumber = sanitized.trackingNumber;

  return result;
}

/**
 * Filter sensitive data for logging
 */
export function filterSensitiveData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveFields = [
    'email',
    'phone',
    'address',
    'password',
    'token',
    'key',
    'secret',
    'auth',
    'p256dh',
  ];

  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      filtered[key] = '[FILTERED]';
    } else if (typeof value === 'string' && value.length > 200) {
      // Truncate very long strings
      filtered[key] = value.slice(0, 200) + '...';
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Validate service worker notification data
 */
export function validateServiceWorkerNotification(data: unknown): {
  title: string;
  body: string;
  tag: string;
  data: Record<string, unknown>;
} {
  if (!data || typeof data !== 'object') {
    return {
      title: 'Kiara Kraft',
      body: 'You have a new notification',
      tag: 'kiarakraft-notification',
      data: {},
    };
  }

  const notification = data as Record<string, unknown>;

  return {
    title: sanitizeText(String(notification.title || 'Kiara Kraft')).slice(
      0,
      100
    ),
    body: sanitizeText(
      String(notification.body || 'You have a new notification')
    ).slice(0, 300),
    tag: sanitizeNotificationTag(String(notification.tag || '')),
    data: {
      url: validateNotificationUrl(
        String((notification.data as Record<string, unknown>)?.url || '')
      ),
      type: sanitizeText(
        String((notification.data as Record<string, unknown>)?.type || '')
      ).slice(0, 50),
    },
  };
}

/**
 * Rate limiting for notification content (prevent spam)
 */
const notificationRateLimit = new Map<
  string,
  { count: number; resetTime: number }
>();
const NOTIFICATION_RATE_LIMIT = 10; // Max 10 notifications per hour per user
const NOTIFICATION_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

export function checkNotificationRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const existing = notificationRateLimit.get(userId);

  if (!existing || now > existing.resetTime) {
    const resetTime = now + NOTIFICATION_RATE_WINDOW;
    notificationRateLimit.set(userId, { count: 1, resetTime });
    return { allowed: true, remaining: NOTIFICATION_RATE_LIMIT - 1, resetTime };
  }

  if (existing.count >= NOTIFICATION_RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: existing.resetTime };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: NOTIFICATION_RATE_LIMIT - existing.count,
    resetTime: existing.resetTime,
  };
}

// Cleanup old rate limit entries
setInterval(
  () => {
    const now = Date.now();
    const keysToDelete: string[] = [];

    notificationRateLimit.forEach((data, key) => {
      if (now > data.resetTime) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => notificationRateLimit.delete(key));
  },
  5 * 60 * 1000
); // Cleanup every 5 minutes
