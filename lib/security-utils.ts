import { prisma } from '@/lib/prisma';
import { URL } from 'url';
import * as Sentry from '@sentry/nextjs';
import DOMPurify from 'isomorphic-dompurify';

// Maximum costs per month in USD
const MAX_MONTHLY_AI_COST = 100;
const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// AI API Cost estimates (in USD)
export const AI_COSTS = {
  GPT5_MINI_INPUT: 0.00015, // per 1K tokens
  GPT5_MINI_OUTPUT: 0.0006, // per 1K tokens
  GPT_IMAGE_1_EDIT: 0.02, // per image
  AVERAGE_TOKENS_PER_REQUEST: 2000, // Conservative estimate
};

/**
 * Sanitize user input to prevent prompt injection attacks
 * Escapes special characters and limits length
 */
export function sanitizeForPrompt(
  text: string,
  maxLength: number = 1000
): string {
  if (!text) return '';

  // Remove potential injection patterns
  const sanitized = text
    // Escape special characters that could break prompt structure
    .replace(/[\\`'"]/g, '\\$&')
    // Remove excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Remove common injection phrases (case-insensitive)
    .replace(
      /ignore\s+(previous|above|all)\s+(instructions?|prompts?)/gi,
      '[REMOVED]'
    )
    .replace(/system\s*:\s*/gi, '[REMOVED]')
    .replace(/assistant\s*:\s*/gi, '[REMOVED]')
    .replace(/\bdo\s+not\s+follow\b/gi, '[REMOVED]')
    .replace(/\binstead\s+follow\b/gi, '[REMOVED]')
    // Remove attempts to reveal system prompts
    .replace(/show\s+(me\s+)?(the\s+)?system\s+prompt/gi, '[REMOVED]')
    .replace(/reveal\s+(the\s+)?prompt/gi, '[REMOVED]')
    // Limit length
    .slice(0, maxLength);

  // Wrap in triple quotes for additional safety
  return `"""${sanitized}"""`;
}

/**
 * Validate URL to prevent SSRF attacks
 * Only allows HTTPS URLs from trusted domains
 */
export function validateImageUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const parsed = new URL(url);

    // Protocol validation - only HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Check for localhost and private IPs
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variations
    if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(hostname)) {
      return { valid: false, error: 'Local URLs are not allowed' };
    }

    // Block private IP ranges (RFC 1918)
    const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipPattern);
    if (ipMatch) {
      const [, a, b, ,] = ipMatch.map(Number);

      // 10.0.0.0/8
      if (a === 10) {
        return { valid: false, error: 'Private network URLs are not allowed' };
      }

      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) {
        return { valid: false, error: 'Private network URLs are not allowed' };
      }

      // 192.168.0.0/16
      if (a === 192 && b === 168) {
        return { valid: false, error: 'Private network URLs are not allowed' };
      }

      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) {
        return { valid: false, error: 'Link-local URLs are not allowed' };
      }
    }

    // Block AWS metadata endpoint
    if (hostname === '169.254.169.254') {
      return { valid: false, error: 'Metadata endpoints are not allowed' };
    }

    // For production, only allow images from trusted sources
    const trustedDomains = [
      'cloudinary.com',
      'res.cloudinary.com',
      'unsplash.com',
      'images.unsplash.com',
      'pexels.com',
      'images.pexels.com',
      'kiarakraft.com',
      'www.kiarakraft.com',
    ];

    const isTrusted = trustedDomains.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isTrusted && process.env.NODE_ENV === 'production') {
      return {
        valid: false,
        error: `Images must be from trusted sources: ${trustedDomains.join(', ')}`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Track AI API usage for cost control
 */
export async function trackAIUsage(
  userId: string,
  service: 'GPT5_MINI' | 'GPT_IMAGE_1',
  estimatedCost: number
): Promise<{ allowed: boolean; monthlyTotal: number; limit: number }> {
  try {
    // Create AI usage entry
    await prisma.aIUsage.create({
      data: {
        userId,
        service,
        cost: estimatedCost,
        timestamp: new Date(),
      },
    });

    // Calculate monthly usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await prisma.aIUsage.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startOfMonth,
        },
      },
      _sum: {
        cost: true,
      },
    });

    const monthlyTotal = monthlyUsage._sum.cost || 0;

    // Check if within limits
    if (monthlyTotal > MAX_MONTHLY_AI_COST) {
      // Log to Sentry for monitoring
      Sentry.captureMessage('AI usage limit exceeded', {
        level: 'warning',
        extra: {
          userId,
          monthlyTotal,
          limit: MAX_MONTHLY_AI_COST,
        },
      });

      return {
        allowed: false,
        monthlyTotal,
        limit: MAX_MONTHLY_AI_COST,
      };
    }

    return {
      allowed: true,
      monthlyTotal,
      limit: MAX_MONTHLY_AI_COST,
    };
  } catch (error) {
    // If tracking fails, allow the operation but log the error
    console.error('Failed to track AI usage:', error);
    Sentry.captureException(error);

    return {
      allowed: true,
      monthlyTotal: 0,
      limit: MAX_MONTHLY_AI_COST,
    };
  }
}

/**
 * Estimate cost for a GPT-5 mini request
 */
export function estimateGPT5MiniCost(
  inputTokens: number,
  outputTokens: number
): number {
  const inputCost = (inputTokens / 1000) * AI_COSTS.GPT5_MINI_INPUT;
  const outputCost = (outputTokens / 1000) * AI_COSTS.GPT5_MINI_OUTPUT;
  return inputCost + outputCost;
}

/**
 * Validate image fetch response
 */
export async function validateImageResponse(
  response: Response
): Promise<{ valid: boolean; error?: string }> {
  // Check content type
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.startsWith('image/')) {
    return { valid: false, error: 'Response is not an image' };
  }

  // Check content length
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const sizeBytes = parseInt(contentLength, 10);
    if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image too large: ${(sizeBytes / 1024 / 1024).toFixed(2)}MB (max ${MAX_IMAGE_SIZE_MB}MB)`,
      };
    }
  }

  // Validate allowed image types
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(contentType.split(';')[0])) {
    return {
      valid: false,
      error: `Invalid image type: ${contentType}. Allowed: ${allowedTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Fetch image with security validations and timeout
 */
export async function secureFetchImage(
  url: string,
  timeoutMs: number = 5000
): Promise<{ success: boolean; data?: Blob; error?: string }> {
  // Validate URL first
  const urlValidation = validateImageUrl(url);
  if (!urlValidation.valid) {
    return { success: false, error: urlValidation.error };
  }

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KiaraKraft/1.0 (Product Enhancement)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch image: ${response.status} ${response.statusText}`,
      };
    }

    // Validate response
    const responseValidation = await validateImageResponse(response);
    if (!responseValidation.valid) {
      return { success: false, error: responseValidation.error };
    }

    // Read with size limit
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const reader = response.body?.getReader();

    if (!reader) {
      return { success: false, error: 'Unable to read response body' };
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_IMAGE_SIZE_BYTES) {
        reader.cancel();
        return {
          success: false,
          error: `Image too large during download: ${(totalSize / 1024 / 1024).toFixed(2)}MB`,
        };
      }

      chunks.push(value);
    }

    // Combine chunks into blob
    const blob = new Blob(chunks as BlobPart[], {
      type: response.headers.get('content-type') || 'image/jpeg',
    });

    return { success: true, data: blob };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Image fetch timeout after ${timeoutMs}ms`,
        };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error fetching image' };
  }
}

/**
 * Clean up potential XSS in product fields
 */
export function sanitizeProductFields(data: {
  title?: string;
  description?: string;
}): {
  title?: string;
  description?: string;
} {
  const result: { title?: string; description?: string } = {};

  if (data.title) {
    // Use DOMPurify to sanitize - strip all HTML tags but keep text content
    result.title = DOMPurify.sanitize(data.title, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    }).trim();
  }

  if (data.description) {
    // Use DOMPurify to sanitize - strip all HTML tags but keep text content
    result.description = DOMPurify.sanitize(data.description, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    }).trim();
  }

  return result;
}
