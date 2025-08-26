/**
 * Comprehensive input sanitization utilities
 * Provides security against XSS, injection attacks, and malicious content
 */

import { z } from 'zod';

// Security patterns to detect potential threats
const THREAT_PATTERNS = {
  // Script injection patterns
  scripts: [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<script[\s>]/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
  ],

  // SQL injection patterns
  sqlInjection: [
    /(\b(select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(\b(union|having|group\s+by|order\s+by)\b)/gi,
    /(--|\/\*|\*\/)/gi,
    /(\b(char|ascii|substring|length|user|database|version)\b\s*\()/gi,
  ],

  // Command injection patterns
  commandInjection: [
    /(\b(eval|exec|system|shell_exec|passthru|proc_open|popen)\b\s*\()/gi,
    /(\$\{|\`|\|\||&&|;)/gi,
  ],

  // PHP injection patterns
  phpInjection: [
    /<\?php/gi,
    /<\?=/gi,
    /\$_GET|\$_POST|\$_REQUEST|\$_SESSION/gi,
  ],

  // Spam and suspicious content
  spam: [
    /\b(viagra|cialis|casino|poker|betting|lottery|winner|congratulations|urgent|act\s+now)\b/gi,
    /\b(click\s+here|limited\s+time|make\s+money|work\s+from\s+home)\b/gi,
  ],

  // Suspicious URLs and domains
  suspiciousUrls: [
    /https?:\/\/[^\s]*\.(tk|ml|ga|cf|bit\.ly|tinyurl|goo\.gl)/gi,
    /https?:\/\/[^\s]*\/(redirect|r\/|goto|link|url)/gi,
  ],
};

/**
 * Content validation levels
 */
export enum SanitizationLevel {
  STRICT = 'strict', // Maximum security, strips most HTML
  MODERATE = 'moderate', // Allows basic formatting tags
  PERMISSIVE = 'permissive', // Allows most safe HTML tags
  BASIC = 'basic', // Only basic XSS protection
}

/**
 * Simple HTML sanitization for server-side use
 * Removes dangerous tags and attributes without external dependencies
 */
export function sanitizeHtml(
  input: string,
  level: SanitizationLevel = SanitizationLevel.STRICT
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // For strict sanitization, remove all HTML tags
  if (level === SanitizationLevel.STRICT) {
    return input
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/&lt;/g, '<') // Decode common entities
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");
  }

  // Remove dangerous elements and attributes
  let sanitized = input;

  // Remove script tags and their content
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<script[^>]*>/gi, '');

  // Remove other dangerous tags
  const dangerousTags = [
    'object',
    'embed',
    'form',
    'input',
    'iframe',
    'link',
    'meta',
  ];
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove event handlers and javascript: URLs
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*javascript\s*:/gi, '');

  return sanitized;
}

/**
 * Remove all HTML tags and return plain text
 */
export function stripHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&lt;/g, '<') // Decode HTML entities
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Escape HTML entities for safe display
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Detect potential security threats in content
 */
export function detectThreats(input: string): {
  isSafe: boolean;
  threats: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
} {
  const threats: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }> = [];

  if (!input || typeof input !== 'string') {
    return { isSafe: true, threats: [] };
  }

  // Check for script injection
  THREAT_PATTERNS.scripts.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'script_injection',
        description: `Script injection pattern detected (${index + 1})`,
        severity: 'critical',
      });
    }
  });

  // Check for SQL injection
  THREAT_PATTERNS.sqlInjection.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'sql_injection',
        description: `SQL injection pattern detected (${index + 1})`,
        severity: 'high',
      });
    }
  });

  // Check for command injection
  THREAT_PATTERNS.commandInjection.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'command_injection',
        description: `Command injection pattern detected (${index + 1})`,
        severity: 'high',
      });
    }
  });

  // Check for PHP injection
  THREAT_PATTERNS.phpInjection.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'php_injection',
        description: `PHP code injection detected (${index + 1})`,
        severity: 'high',
      });
    }
  });

  // Check for spam content
  THREAT_PATTERNS.spam.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'spam',
        description: `Spam content pattern detected (${index + 1})`,
        severity: 'medium',
      });
    }
  });

  // Check for suspicious URLs
  THREAT_PATTERNS.suspiciousUrls.forEach((pattern, index) => {
    if (pattern.test(input)) {
      threats.push({
        type: 'suspicious_url',
        description: `Suspicious URL pattern detected (${index + 1})`,
        severity: 'medium',
      });
    }
  });

  return {
    isSafe: threats.length === 0,
    threats,
  };
}

/**
 * Comprehensive input validation and sanitization
 */
export function sanitizeAndValidate(
  input: string,
  options: {
    maxLength?: number;
    minLength?: number;
    sanitizationLevel?: SanitizationLevel;
    allowEmpty?: boolean;
    detectThreats?: boolean;
  } = {}
): {
  isValid: boolean;
  sanitized: string;
  errors: string[];
  threats?: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
} {
  const {
    maxLength = 10000,
    minLength = 0,
    sanitizationLevel = SanitizationLevel.STRICT,
    allowEmpty = true,
    detectThreats: shouldDetectThreats = true,
  } = options;

  const errors: string[] = [];
  let sanitized = '';

  // Basic validation
  if (!input && !allowEmpty) {
    errors.push('Input is required');
    return { isValid: false, sanitized: '', errors };
  }

  if (!input) {
    return { isValid: true, sanitized: '', errors: [] };
  }

  if (typeof input !== 'string') {
    errors.push('Input must be a string');
    return { isValid: false, sanitized: '', errors };
  }

  // Length validation
  if (input.length < minLength) {
    errors.push(`Input must be at least ${minLength} characters long`);
  }

  if (input.length > maxLength) {
    errors.push(`Input must not exceed ${maxLength} characters`);
  }

  // Sanitize the input first
  try {
    sanitized = sanitizeHtml(input, sanitizationLevel);
  } catch (error) {
    console.error('Sanitization error:', error);
    errors.push('Failed to sanitize input');
    return { isValid: false, sanitized: '', errors };
  }

  // Threat detection (check original input for logging, but don't block after sanitization)
  let threatResults;
  if (shouldDetectThreats) {
    threatResults = detectThreats(input);

    // Check if sanitization removed all critical threats
    const postSanitizationThreats = detectThreats(sanitized);

    // Only block if critical threats remain after sanitization
    const remainingCriticalThreats = postSanitizationThreats.threats.filter(
      t => t.severity === 'critical'
    );
    if (remainingCriticalThreats.length > 0) {
      errors.push('Critical security threat persists after sanitization');
    }

    // Also block if high severity threats remain after sanitization
    const remainingHighThreats = postSanitizationThreats.threats.filter(
      t => t.severity === 'high'
    );
    if (remainingHighThreats.length > 0) {
      errors.push('High severity security threat persists after sanitization');
    }
  }

  const result = {
    isValid: errors.length === 0,
    sanitized,
    errors,
  };

  if (shouldDetectThreats && threatResults) {
    return { ...result, threats: threatResults.threats };
  }

  return result;
}

/**
 * Zod schema for sanitized strings
 */
export const sanitizedStringSchema = (
  options: {
    maxLength?: number;
    minLength?: number;
    sanitizationLevel?: SanitizationLevel;
    allowEmpty?: boolean;
  } = {}
) =>
  z.string().transform((input, ctx) => {
    const result = sanitizeAndValidate(input, options);

    if (!result.isValid) {
      result.errors.forEach(error => {
        ctx.addIssue({
          code: 'custom',
          message: error,
        });
      });
      return z.NEVER;
    }

    return result.sanitized;
  });

/**
 * Create a safe product description validator
 */
export const productDescriptionSchema = sanitizedStringSchema({
  maxLength: 5000,
  minLength: 10,
  sanitizationLevel: SanitizationLevel.MODERATE,
  allowEmpty: false,
});

/**
 * Create a safe product title validator
 */
export const productTitleSchema = sanitizedStringSchema({
  maxLength: 200,
  minLength: 3,
  sanitizationLevel: SanitizationLevel.STRICT,
  allowEmpty: false,
});

/**
 * Create a safe contact message validator
 */
export const contactMessageSchema = sanitizedStringSchema({
  maxLength: 2000,
  minLength: 10,
  sanitizationLevel: SanitizationLevel.STRICT,
  allowEmpty: false,
});

/**
 * Create a safe user name validator
 */
export const userNameSchema = sanitizedStringSchema({
  maxLength: 100,
  minLength: 1,
  sanitizationLevel: SanitizationLevel.STRICT,
  allowEmpty: false,
});
