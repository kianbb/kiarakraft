/**
 * Security Configuration Validator
 * Ensures all security-critical environment variables are properly configured
 */

import crypto from 'crypto';

export interface SecurityConfig {
  nextAuthSecret: string;
  sessionMaxAge: number;
  sessionUpdateAge: number;
  isDevelopment: boolean;
  isProduction: boolean;
}

/**
 * Generate a cryptographically secure random secret
 * Note: Only works in Node.js environment
 */
export function generateSecureSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Validate NEXTAUTH_SECRET meets security requirements
 */
export function validateNextAuthSecret(secret?: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!secret) {
    errors.push('NEXTAUTH_SECRET is not configured');
    return { valid: false, errors };
  }

  if (secret === 'replace-me' || secret === 'changeme' || secret === 'secret') {
    errors.push('NEXTAUTH_SECRET contains a placeholder value');
  }

  if (secret.length < 32) {
    errors.push('NEXTAUTH_SECRET must be at least 32 characters long');
  }

  // Check for low entropy (all same character, sequential, etc.)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 10) {
    errors.push(
      'NEXTAUTH_SECRET has low entropy (not enough unique characters)'
    );
  }

  // Check for common patterns
  if (/^[a-z]+$/i.test(secret) || /^[0-9]+$/.test(secret)) {
    errors.push(
      'NEXTAUTH_SECRET should contain a mix of characters, not just letters or numbers'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get secure session configuration based on environment
 */
export function getSecureSessionConfig(): {
  maxAge: number;
  updateAge: number;
} {
  const isProduction = process.env.NODE_ENV === 'production';

  // Shorter sessions in production for better security
  return {
    maxAge: isProduction
      ? 8 * 60 * 60 // 8 hours in production
      : 24 * 60 * 60, // 24 hours in development
    updateAge: isProduction
      ? 30 * 60 // 30 minutes in production
      : 60 * 60, // 1 hour in development
  };
}

/**
 * Validate all security-critical configuration
 */
export function validateSecurityConfig(): {
  valid: boolean;
  warnings: string[];
  errors: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const suggestions: string[] = [];

  // Check NEXTAUTH_SECRET
  const secretValidation = validateNextAuthSecret(process.env.NEXTAUTH_SECRET);
  if (!secretValidation.valid) {
    errors.push(...secretValidation.errors);
    suggestions.push(
      `Generate a secure secret with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
    );
  }

  // Check NEXTAUTH_URL in production
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXTAUTH_URL) {
      errors.push('NEXTAUTH_URL must be set in production');
    } else if (process.env.NEXTAUTH_URL.startsWith('http://')) {
      warnings.push('NEXTAUTH_URL should use HTTPS in production');
    }
  }

  // Check database URL security
  if (process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL.includes('sslmode=require')) {
      warnings.push('DATABASE_URL should enforce SSL with sslmode=require');
    }
  } else {
    errors.push('DATABASE_URL is not configured');
  }

  // Check for seed endpoint in production
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_SEED_ENDPOINT === 'true'
  ) {
    warnings.push(
      'ENABLE_SEED_ENDPOINT is enabled in production - this should be disabled'
    );
    if (!process.env.SEED_TOKEN || process.env.SEED_TOKEN.length < 32) {
      errors.push(
        'SEED_TOKEN must be at least 32 characters when seed endpoint is enabled'
      );
    }
  }

  // Check Cloudinary configuration
  if (!process.env.CLOUDINARY_API_SECRET) {
    warnings.push(
      'CLOUDINARY_API_SECRET is not configured - image uploads will fail'
    );
  }

  // Check email configuration
  if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
    warnings.push('No email provider configured (RESEND_API_KEY or SMTP_HOST)');
  }

  // Check payment configuration
  if (process.env.NODE_ENV === 'production') {
    if (
      !process.env.PAYMENT_GATEWAY ||
      process.env.PAYMENT_GATEWAY === 'OFFLINE'
    ) {
      warnings.push('Payment gateway is set to OFFLINE in production');
    }
    if (process.env.PAYMENT_STUB_SECRET) {
      warnings.push('PAYMENT_STUB_SECRET should not be set in production');
    }
  }

  // Security headers check
  suggestions.push('Ensure security headers are configured in next.config.mjs');
  suggestions.push('Consider implementing a Web Application Firewall (WAF)');
  suggestions.push('Set up security monitoring and alerting');

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    suggestions,
  };
}

/**
 * Initialize security configuration with validation
 * Call this during application startup
 */
export function initializeSecurityConfig(): void {
  const validation = validateSecurityConfig();

  if (!validation.valid) {
    console.error('⚠️  SECURITY CONFIGURATION ERRORS DETECTED:');
    validation.errors.forEach(error => console.error(`   ❌ ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  Security Configuration Warnings:');
    validation.warnings.forEach(warning => console.warn(`   ⚠️  ${warning}`));
  }

  if (process.env.NODE_ENV === 'production' && !validation.valid) {
    console.error('🛑 CRITICAL: Security configuration errors in production!');
    if (validation.suggestions.length > 0) {
      console.log('\n💡 Suggestions:');
      validation.suggestions.forEach(suggestion =>
        console.log(`   • ${suggestion}`)
      );
    }
    // In production, you might want to prevent startup with invalid config
    // throw new Error('Security configuration validation failed');
  }
}

/**
 * Generate security configuration template for .env.example
 */
export function generateSecurityEnvTemplate(): string {
  const secret = generateSecureSecret();
  return `
# Security Configuration (REQUIRED)
# ================================

# NextAuth Configuration (REQUIRED - Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
NEXTAUTH_SECRET="${secret}"
NEXTAUTH_URL="https://your-domain.com"

# Database Security (REQUIRED)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
DIRECT_URL="postgresql://user:pass@host/db?sslmode=require"

# Seed Endpoint Security (Production only)
# ENABLE_SEED_ENDPOINT="false"  # Never enable in production unless absolutely necessary
# SEED_TOKEN="${generateSecureSecret()}"  # Only if seed endpoint is enabled

# Additional Security Headers (Optional but recommended)
# ALLOWED_CSRF_HOSTS="www.kiarakraft.com,kiarakraft.vercel.app"
# ALLOWED_APP_BASE_HOSTS="www.kiarakraft.com"
`;
}
