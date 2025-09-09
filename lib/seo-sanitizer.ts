/**
 * SEO Data Sanitizer
 * Safely sanitizes data for JSON-LD structured data to prevent XSS attacks
 */

/**
 * Escape special characters in strings to prevent XSS
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return str.replace(/[&<>"'`=/]/g, char => htmlEscapes[char]);
}

/**
 * Sanitize a value for JSON-LD
 */
export function sanitizeJsonLdValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Use HTML entity encoding - this is the most secure approach
    // First escape HTML entities to prevent any injection
    let sanitized = escapeHtml(value);

    // Remove any null bytes and other control characters
    sanitized = sanitized
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters except tab, newline, CR

    return sanitized;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeJsonLdValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Sanitize the key as well
      const sanitizedKey = typeof key === 'string' ? escapeHtml(key) : key;
      sanitized[sanitizedKey] = sanitizeJsonLdValue(val);
    }
    return sanitized;
  }

  return value;
}

/**
 * Safely create JSON-LD script content
 */
export function createSafeJsonLd(data: unknown): string {
  const sanitized = sanitizeJsonLdValue(data);

  // Use JSON.stringify with replacer to ensure proper escaping
  return JSON.stringify(sanitized, (_key, value) => {
    // Additional safety check during stringification
    if (typeof value === 'string') {
      // Ensure no script tags can be injected
      return value.replace(/<\/script>/gi, '<\\/script>');
    }
    return value;
  });
}

/**
 * Validate that JSON-LD data doesn't contain dangerous patterns
 */
export function validateJsonLdSafety(jsonString: string): {
  safe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for script tags
  if (/<script/i.test(jsonString)) {
    warnings.push('Contains script tags');
  }

  // Check for event handlers
  if (/on\w+\s*=/i.test(jsonString)) {
    warnings.push('Contains event handlers');
  }

  // Check for javascript: protocol
  if (/javascript:/i.test(jsonString)) {
    warnings.push('Contains javascript: protocol');
  }

  // Check for data: protocol (can be used for XSS)
  if (/data:text\/html/i.test(jsonString)) {
    warnings.push('Contains potentially dangerous data: URL');
  }

  // Check for iframe
  if (/<iframe/i.test(jsonString)) {
    warnings.push('Contains iframe tags');
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

/**
 * Create safe structured data for SEO
 */
export interface StructuredDataProps {
  type: string;
  data: Record<string, unknown>;
}

export function createStructuredData({ type, data }: StructuredDataProps): {
  '@context': string;
  '@type': string;
  [key: string]: unknown;
} {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': type,
    ...data,
  };

  // Sanitize the entire structure
  return sanitizeJsonLdValue(structuredData) as {
    '@context': string;
    '@type': string;
    [key: string]: unknown;
  };
}
