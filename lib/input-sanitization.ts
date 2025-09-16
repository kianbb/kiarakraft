/**
 * Comprehensive input sanitization utilities
 * Provides security against XSS, injection attacks, and malicious content
 * Fixed regex patterns to prevent ReDoS attacks and improve security
 */

import { z } from 'zod';

// Security patterns to detect potential threats
// Optimized patterns to prevent ReDoS attacks while maintaining security
const THREAT_PATTERNS = {
  // Script injection patterns - using non-backtracking patterns
  scripts: [
    /<script(?:\s|>)/gi, // Simplified script tag detection
    /<\/script>/gi,
    /javascript:/gi,
    /\bon\w+\s*=/gi, // Simplified event handler detection
  ],

  // SQL injection patterns - atomic groups to prevent backtracking
  sqlInjection: [
    /\b(?:select|insert|update|delete|drop|create|alter)\s+/gi,
    /\b(?:union|having)\s+/gi,
    /--[^\r\n]*/gi, // SQL comments - removed length limit, uses negated class
    /\/\*[\s\S]*?\*\//g, // SQL block comments - using [\s\S] for any character including newlines
  ],

  // Command injection patterns - simplified
  commandInjection: [
    /\b(?:eval|exec|system|shell_exec|passthru)\s*\(/gi,
    /\$\{[^}]*\}/gi, // Template literals - uses negated class
    /(?:\|\||&&)/gi, // Command chaining - non-capturing group
  ],

  // PHP injection patterns
  phpInjection: [/<\?(?:php|=)/gi, /\$_(?:GET|POST|REQUEST|SESSION)\b/gi],

  // Spam patterns - simplified
  spam: [
    /\b(?:viagra|cialis|casino|betting|lottery)\b/gi,
    /\b(?:click\s+here|limited\s+time)\b/gi,
  ],

  // Suspicious URLs - simplified
  suspiciousUrls: [
    /https?:\/\/[\w.-]+\.(?:tk|ml|ga|cf)\b/gi,
    /\b(?:bit\.ly|tinyurl|goo\.gl)\/\w+/gi,
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
    // Use optimized pattern to prevent ReDoS while handling large inputs
    let result = input.replace(/<[^>]*>/g, ''); // Simplified tag removal

    // Decode HTML entities - safe after tag removal
    result = result
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&'); // Decode & last to prevent double-decoding

    return result;
  }

  // Remove dangerous elements and attributes
  let sanitized = input;

  // Complete rejection approach for script content - more secure than removal
  // Check for any script-related content and reject the entire input if found
  const scriptPattern = /<\s*\/?script[\s>]/i;
  const scriptProtocolPattern = /script\s*:/i;

  if (scriptPattern.test(sanitized) || scriptProtocolPattern.test(sanitized)) {
    // Reject entire input if any script content is detected
    return '';
  }

  // Remove other dangerous tags - using single pass regex
  const dangerousTagsPattern =
    /<(?:object|embed|form|input|iframe|link|meta)(?:\s[^>]*)?>/gi;
  sanitized = sanitized.replace(dangerousTagsPattern, '');

  // Remove event handlers and javascript: URLs - optimized patterns
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/javascript\s*:/gi, '');

  return sanitized;
}

/**
 * Remove all HTML tags and return plain text
 */
export function stripHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // For very large inputs, process the entire string to avoid breaking tags across chunks
  // The regex is optimized to handle large tags efficiently
  let result = input.replace(/<[^>]*>/g, ''); // Simplified tag removal

  // Decode HTML entities - safe after tag removal
  result = result
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&'); // Decode & last to prevent double-decoding

  return result;
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
    .replace(/"/g, '&quot;')
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

  // Truncate input to prevent ReDoS attacks
  const truncatedInput = input.slice(0, 10000);

  // Check for script injection - reset regex state to prevent ReDoS
  THREAT_PATTERNS.scripts.forEach((pattern, index) => {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(truncatedInput)) {
      threats.push({
        type: 'script_injection',
        description: `Script injection pattern detected (${index + 1})`,
        severity: 'critical',
      });
    }
  });

  // Check for SQL injection
  THREAT_PATTERNS.sqlInjection.forEach((pattern, index) => {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(truncatedInput)) {
      threats.push({
        type: 'sql_injection',
        description: `SQL injection pattern detected (${index + 1})`,
        severity: 'high',
      });
    }
  });

  // Check for command injection
  THREAT_PATTERNS.commandInjection.forEach((pattern, index) => {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(truncatedInput)) {
      threats.push({
        type: 'command_injection',
        description: `Command injection pattern detected (${index + 1})`,
        severity: 'high',
      });
    }
  });

  // Check for PHP injection
  THREAT_PATTERNS.phpInjection.forEach((pattern, index) => {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(truncatedInput)) {
      threats.push({
        type: 'php_injection',
        description: `PHP code injection detected (${index + 1})`,
        severity: 'high',
      });
    }
  });

  // Check for spam content
  THREAT_PATTERNS.spam.forEach((pattern, index) => {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(truncatedInput)) {
      threats.push({
        type: 'spam',
        description: `Spam content pattern detected (${index + 1})`,
        severity: 'medium',
      });
    }
  });

  // Check for suspicious URLs
  THREAT_PATTERNS.suspiciousUrls.forEach((pattern, index) => {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(truncatedInput)) {
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
