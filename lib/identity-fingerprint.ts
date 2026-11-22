import { createHmac } from 'node:crypto';

export class IdentityKeyError extends Error {
  constructor() {
    super('Identity collection is unavailable');
    this.name = 'IdentityKeyError';
  }
}

export function normalizeNationalId(value: string): string {
  return value
    .trim()
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660));
}

// The envelope identifies the derivation and key without a schema migration.
// Existing plain SHA-256 digests remain legacy values and are never rewritten.
export function identityFingerprintFormat(value: string) {
  if (/^[a-f0-9]{64}$/i.test(value)) return 'legacy-sha256-auth-v0';
  if (/^hmac-sha256:v1:[A-Za-z0-9_-]{1,32}:[a-f0-9]{64}$/.test(value))
    return 'hmac-sha256-v1';
  return 'unknown';
}

export function fingerprintNationalId(
  nationalId: string,
  env: Record<string, string | undefined> = process.env
): string {
  // This validates shape only; it does not establish a person's identity.
  const normalized = normalizeNationalId(nationalId);
  if (!/^[0-9]{10}$/.test(normalized))
    throw new Error('Invalid national ID format');
  const key = env.IDENTITY_HASH_KEY;
  const keyId = env.IDENTITY_HASH_KEY_ID;
  if (
    !key ||
    !/^[A-Za-z0-9_-]{43}$/.test(key) ||
    !keyId ||
    !/^[A-Za-z0-9_-]{1,32}$/.test(keyId) ||
    key === env.NEXTAUTH_SECRET ||
    key === env.AUTH_SECRET
  )
    throw new IdentityKeyError();
  const bytes = Buffer.from(key, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== key)
    throw new IdentityKeyError();
  const digest = createHmac('sha256', bytes)
    .update('kiarakraft:national-id:v1\0')
    .update(normalized)
    .digest('hex');
  return `hmac-sha256:v1:${keyId}:${digest}`;
}
