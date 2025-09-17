/**
 * API Key Management System
 * Handles rotation and versioning of API keys for external services
 */

// Database integration will be added in future version
// For now, using environment variables only
import crypto from 'crypto';

// Supported service types
export enum ApiService {
  OPENAI = 'OPENAI',
  AZURE_TRANSLATOR = 'AZURE_TRANSLATOR',
  CLOUDINARY = 'CLOUDINARY',
  ZARINPAL = 'ZARINPAL',
  IDPAY = 'IDPAY',
}

// API key status
export enum KeyStatus {
  ACTIVE = 'ACTIVE',
  ROTATING = 'ROTATING', // New key being tested
  DEPRECATED = 'DEPRECATED', // Old key still works but being phased out
  REVOKED = 'REVOKED', // Key no longer valid
}

// Reserved for future database implementation
// interface ApiKeyConfig {
//   service: ApiService;
//   keyName: string;
//   encryptedKey: string;
//   version: number;
//   status: KeyStatus;
//   validFrom: Date;
//   validUntil?: Date;
//   lastRotated?: Date;
//   metadata?: Record<string, unknown>;
// }

// Encryption key from environment (must be 32 bytes for AES-256)
// Fail fast if not configured properly
const ENCRYPTION_KEY = (() => {
  const key = process.env.API_KEY_ENCRYPTION_SECRET;

  // Don't enforce in development to avoid breaking local dev
  if (process.env.NODE_ENV === 'development' && !key) {
    console.warn(
      '⚠️ WARNING: API_KEY_ENCRYPTION_SECRET not set. Using development-only key.'
    );
    return 'dev-only-key-do-not-use-in-prod!';
  }

  if (!key || key.length < 32) {
    throw new Error(
      'CRITICAL: API_KEY_ENCRYPTION_SECRET must be set to a 32+ character string in production. ' +
        'Generate one with: openssl rand -hex 32'
    );
  }

  return key;
})();

/**
 * Encrypt an API key for storage
 */
function encryptApiKey(apiKey: string): string {
  try {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Failed to encrypt API key:', error);
    throw new Error('API key encryption failed');
  }
}

/**
 * Decrypt an API key from storage
 */
function decryptApiKey(encryptedData: string): string {
  try {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));

    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedKey = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    throw new Error('API key decryption failed');
  }
}

// In-memory storage for demo purposes (should use database in production)
const keyRotationLog = new Map<string, { timestamp: Date; version: number }>();

/**
 * Store a new API key (placeholder for future database implementation)
 * Currently logs rotation events only
 */
export async function storeApiKey(
  service: ApiService,
  apiKey: string,
  _metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Encrypt for future use when database is implemented
    encryptApiKey(apiKey);

    // Log rotation event (in production, this would be stored in database)
    const currentLog = keyRotationLog.get(service);
    const newVersion = (currentLog?.version || 0) + 1;

    keyRotationLog.set(service, {
      timestamp: new Date(),
      version: newVersion,
    });

    console.log(
      `API key rotation logged for service: ${service} (v${newVersion})`
    );
    console.log(
      'Note: Database storage not yet implemented. Keys must be updated in environment variables.'
    );
  } catch (error) {
    console.error('Failed to log API key rotation:', error);
    throw error;
  }
}

/**
 * Get the current active API key for a service
 * Currently returns keys from environment variables only
 */
export async function getActiveApiKey(
  service: ApiService
): Promise<string | null> {
  try {
    // Get from environment variables
    const envKey = getEnvKey(service);
    if (envKey) {
      return envKey;
    }

    console.warn(`No API key found in environment for service: ${service}`);
    return null;
  } catch (error) {
    console.error(`Failed to get API key for ${service}:`, error);
    return null;
  }
}

/**
 * Get API key from environment (fallback)
 */
function getEnvKey(service: ApiService): string | null {
  const envMap: Record<ApiService, string | undefined> = {
    [ApiService.OPENAI]: process.env.OPENAI_API_KEY,
    [ApiService.AZURE_TRANSLATOR]: process.env.AZURE_TRANSLATOR_KEY,
    [ApiService.CLOUDINARY]: process.env.CLOUDINARY_API_KEY,
    [ApiService.ZARINPAL]: process.env.ZARINPAL_API_KEY,
    [ApiService.IDPAY]: process.env.IDPAY_API_KEY,
  };

  return envMap[service] || null;
}

/**
 * Mark an old API key as deprecated (placeholder for future implementation)
 */
export async function deprecateApiKey(service: ApiService): Promise<void> {
  try {
    console.log(`API key deprecation logged for service ${service}`);
    console.log('Note: Manual key rotation required in environment variables.');
  } catch (error) {
    console.error('Failed to log API key deprecation:', error);
    throw error;
  }
}

/**
 * Revoke an API key immediately (placeholder for future implementation)
 */
export async function revokeApiKey(service: ApiService): Promise<void> {
  try {
    console.log(`⚠️ API KEY REVOCATION ALERT for service: ${service}`);
    console.log(
      'ACTION REQUIRED: Remove the API key from environment variables immediately!'
    );
    console.log('Update the following environment variable:');
    console.log(`  ${getEnvVarName(service)}=<new_key_value>`);
  } catch (error) {
    console.error('Failed to process API key revocation:', error);
    throw error;
  }
}

/**
 * Get environment variable name for a service
 */
function getEnvVarName(service: ApiService): string {
  const envNames: Record<ApiService, string> = {
    [ApiService.OPENAI]: 'OPENAI_API_KEY',
    [ApiService.AZURE_TRANSLATOR]: 'AZURE_TRANSLATOR_KEY',
    [ApiService.CLOUDINARY]: 'CLOUDINARY_API_KEY',
    [ApiService.ZARINPAL]: 'ZARINPAL_API_KEY',
    [ApiService.IDPAY]: 'IDPAY_API_KEY',
  };
  return envNames[service] || service;
}

/**
 * Check if API key rotation is needed
 */
export async function checkRotationNeeded(
  service: ApiService,
  maxAgeInDays: number = 90
): Promise<boolean> {
  try {
    // Check if key exists in environment
    const envKey = getEnvKey(service);
    if (!envKey) {
      return true; // No key found, rotation needed
    }

    // Check rotation log
    const lastRotation = keyRotationLog.get(service);
    if (!lastRotation) {
      // No rotation history, recommend rotation
      return true;
    }

    const keyAge = Date.now() - lastRotation.timestamp.getTime();
    const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;

    return keyAge > maxAge;
  } catch (error) {
    console.error('Failed to check rotation status:', error);
    return false;
  }
}

/**
 * Automated key rotation check (to be run periodically)
 */
export async function performScheduledRotation(): Promise<void> {
  const services = Object.values(ApiService);
  const rotationAlerts: string[] = [];

  for (const service of services) {
    try {
      const needsRotation = await checkRotationNeeded(service);

      if (needsRotation) {
        const message = `⚠️ API key rotation recommended for ${service} (90+ days old)`;
        console.warn(message);
        rotationAlerts.push(message);
      }
    } catch (error) {
      console.error(`Failed to check rotation for ${service}:`, error);
    }
  }

  if (rotationAlerts.length > 0) {
    console.log('\n📋 API KEY ROTATION SUMMARY:');
    rotationAlerts.forEach(alert => console.log(alert));
    console.log(
      '\nACTION: Update the affected API keys in your environment variables.'
    );
  }
}

/**
 * Get API key statistics
 */
export async function getApiKeyStats() {
  try {
    const services = Object.values(ApiService);
    const result: Record<
      string,
      {
        configured: boolean;
        lastRotated: Date | null;
        version: number;
        needsRotation: boolean;
        envVariable: string;
      }
    > = {};

    for (const service of services) {
      const hasKey = getEnvKey(service) !== null;
      const lastRotation = keyRotationLog.get(service);
      const needsRotation = await checkRotationNeeded(service);

      result[service] = {
        configured: hasKey,
        lastRotated: lastRotation?.timestamp || null,
        version: lastRotation?.version || 0,
        needsRotation,
        envVariable: getEnvVarName(service),
      };
    }

    return result;
  } catch (error) {
    console.error('Failed to get API key stats:', error);
    return {};
  }
}

// Export for testing
export { encryptApiKey, decryptApiKey };
