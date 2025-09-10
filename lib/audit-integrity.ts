/**
 * Audit Log Integrity Protection
 * Provides HMAC signatures to detect tampering of audit logs
 */

import crypto from 'crypto';

// Get or generate HMAC secret for audit log integrity
function getAuditHmacSecret(): string {
  const secret = process.env.AUDIT_HMAC_SECRET;

  if (!secret) {
    console.warn(
      'AUDIT_HMAC_SECRET not configured. Audit log integrity protection disabled.'
    );
    // In development, use a default secret (not secure for production)
    if (process.env.NODE_ENV === 'development') {
      return 'dev-audit-hmac-secret-not-for-production';
    }
    // In production, integrity protection is disabled without secret
    return '';
  }

  if (secret.length < 32) {
    console.warn(
      'AUDIT_HMAC_SECRET should be at least 32 characters for security.'
    );
  }

  return secret;
}

/**
 * Generate HMAC signature for audit log entry
 */
export function generateAuditSignature(data: {
  action: string;
  userId?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  ipAddress?: string | null;
  success: boolean;
  timestamp: Date;
}): string {
  const secret = getAuditHmacSecret();

  // If no secret configured, return empty signature
  if (!secret) {
    return '';
  }

  // Create canonical string representation of data
  const canonical = JSON.stringify({
    action: data.action,
    userId: data.userId || '',
    targetId: data.targetId || '',
    targetType: data.targetType || '',
    ipAddress: data.ipAddress || '',
    success: data.success,
    timestamp: data.timestamp.toISOString(),
  });

  // Generate HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(canonical);
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature of audit log entry
 */
export function verifyAuditSignature(
  data: {
    action: string;
    userId?: string | null;
    targetId?: string | null;
    targetType?: string | null;
    ipAddress?: string | null;
    success: boolean;
    timestamp: Date;
  },
  signature: string
): boolean {
  const secret = getAuditHmacSecret();

  // If no secret configured, skip verification
  if (!secret) {
    return true; // Consider unsigned logs as "valid" when integrity is disabled
  }

  // Empty signature when secret exists means tampering
  if (!signature) {
    return false;
  }

  const expectedSignature = generateAuditSignature(data);

  // Use timing-safe comparison
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Batch verify audit log entries
 */
export async function verifyAuditLogIntegrity(
  entries: Array<{
    id: string;
    action: string;
    userId?: string | null;
    targetId?: string | null;
    targetType?: string | null;
    ipAddress?: string | null;
    success: boolean;
    timestamp: Date;
    signature?: string | null;
  }>
): Promise<{
  valid: number;
  invalid: number;
  unsigned: number;
  tamperedIds: string[];
}> {
  let valid = 0;
  let invalid = 0;
  let unsigned = 0;
  const tamperedIds: string[] = [];

  for (const entry of entries) {
    if (!entry.signature) {
      unsigned++;
      continue;
    }

    const isValid = verifyAuditSignature(
      {
        action: entry.action,
        userId: entry.userId,
        targetId: entry.targetId,
        targetType: entry.targetType,
        ipAddress: entry.ipAddress,
        success: entry.success,
        timestamp: entry.timestamp,
      },
      entry.signature
    );

    if (isValid) {
      valid++;
    } else {
      invalid++;
      tamperedIds.push(entry.id);
    }
  }

  return { valid, invalid, unsigned, tamperedIds };
}

/**
 * Generate a secure HMAC secret for audit logs
 */
export function generateAuditHmacSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}
