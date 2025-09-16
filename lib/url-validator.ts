/**
 * URL Security Validator
 * Protects against SSRF (Server-Side Request Forgery) attacks
 */

import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

// Private IP ranges (RFC 1918 and special addresses)
const PRIVATE_IP_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' }, // Class A private
  { start: '172.16.0.0', end: '172.31.255.255' }, // Class B private
  { start: '192.168.0.0', end: '192.168.255.255' }, // Class C private
  { start: '127.0.0.0', end: '127.255.255.255' }, // Loopback
  { start: '169.254.0.0', end: '169.254.255.255' }, // Link-local
  { start: '0.0.0.0', end: '0.255.255.255' }, // This network
  { start: '::1', end: '::1' }, // IPv6 loopback
  { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }, // IPv6 private
];

// Blocked protocols (only allow http/https)
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// Blocked ports (common internal services)
const BLOCKED_PORTS = [
  22, // SSH
  23, // Telnet
  25, // SMTP
  3306, // MySQL
  5432, // PostgreSQL
  6379, // Redis
  8080, // Common dev server
  8081, // Common dev server
  9000, // PHP-FPM
  9200, // Elasticsearch
  11211, // Memcached
  27017, // MongoDB
];

// Maximum redirects to follow (to prevent redirect loops)
// const MAX_REDIRECTS = 5; // May be used in future for redirect handling

/**
 * Check if an IP address is private/internal
 */
function isPrivateIP(ip: string): boolean {
  // Handle IPv6
  if (net.isIPv6(ip)) {
    // Check IPv6 loopback and private ranges
    if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')) {
      return true;
    }
    // Check IPv4-mapped IPv6 addresses
    if (ip.startsWith('::ffff:')) {
      const ipv4Part = ip.substring(7);
      return isPrivateIP(ipv4Part);
    }
    return false;
  }

  // Handle IPv4
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Invalid IP, treat as private
  }

  const ipNum =
    (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];

  for (const range of PRIVATE_IP_RANGES) {
    if (typeof range.start === 'string' && range.start.includes('.')) {
      const startParts = range.start.split('.').map(Number);
      const endParts = range.end.split('.').map(Number);
      const startNum =
        (startParts[0] << 24) |
        (startParts[1] << 16) |
        (startParts[2] << 8) |
        startParts[3];
      const endNum =
        (endParts[0] << 24) |
        (endParts[1] << 16) |
        (endParts[2] << 8) |
        endParts[3];

      if (ipNum >= startNum && ipNum <= endNum) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate if a hostname is safe (not pointing to private IPs)
 */
async function isHostnameSafe(hostname: string): Promise<boolean> {
  try {
    // Resolve all IP addresses for the hostname
    const addresses = await dns.resolve4(hostname).catch(() => []);
    const addresses6 = await dns.resolve6(hostname).catch(() => []);

    const allAddresses = [...addresses, ...addresses6];

    if (allAddresses.length === 0) {
      // Could not resolve, treat as unsafe
      return false;
    }

    // Check if any resolved IP is private
    for (const ip of allAddresses) {
      if (isPrivateIP(ip)) {
        console.warn(`Hostname ${hostname} resolves to private IP: ${ip}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(`DNS resolution failed for ${hostname}:`, error);
    return false;
  }
}

/**
 * Validate URL for SSRF protection
 */
export async function validateURL(url: string): Promise<{
  isValid: boolean;
  reason?: string;
  sanitizedURL?: string;
}> {
  try {
    // Parse and validate URL format
    let parsedURL: URL;
    try {
      parsedURL = new URL(url);
    } catch {
      return { isValid: false, reason: 'Invalid URL format' };
    }

    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(parsedURL.protocol)) {
      return {
        isValid: false,
        reason: `Protocol not allowed: ${parsedURL.protocol}. Only HTTP(S) allowed.`,
      };
    }

    // Check port
    const port = parsedURL.port
      ? parseInt(parsedURL.port)
      : parsedURL.protocol === 'https:'
        ? 443
        : 80;

    if (BLOCKED_PORTS.includes(port)) {
      return {
        isValid: false,
        reason: `Port ${port} is blocked for security reasons`,
      };
    }

    // Check if hostname is an IP address
    if (net.isIP(parsedURL.hostname)) {
      const ip = parsedURL.hostname;
      if (isPrivateIP(ip)) {
        return {
          isValid: false,
          reason:
            'Direct access to private/internal IP addresses is not allowed',
        };
      }
    } else {
      // Hostname is a domain, resolve and check IPs
      const isSafe = await isHostnameSafe(parsedURL.hostname);
      if (!isSafe) {
        return {
          isValid: false,
          reason: 'Domain resolves to private/internal IP address',
        };
      }
    }

    // Additional checks for common SSRF patterns
    const hostname = parsedURL.hostname.toLowerCase();
    const suspiciousPatterns = [
      'localhost',
      'metadata.google.internal',
      '169.254.169.254', // AWS metadata endpoint
      'metadata.azure.com',
    ];

    if (suspiciousPatterns.some(pattern => hostname.includes(pattern))) {
      return {
        isValid: false,
        reason: 'Access to internal metadata endpoints is not allowed',
      };
    }

    // Return sanitized URL (removes credentials, fragments, etc.)
    const sanitizedURL = new URL(parsedURL.toString());
    sanitizedURL.username = '';
    sanitizedURL.password = '';
    sanitizedURL.hash = '';

    return {
      isValid: true,
      sanitizedURL: sanitizedURL.toString(),
    };
  } catch (error) {
    console.error('URL validation error:', error);
    return {
      isValid: false,
      reason: 'URL validation failed',
    };
  }
}

/**
 * Validate multiple URLs
 */
export async function validateURLs(urls: string[]): Promise<
  Map<
    string,
    {
      isValid: boolean;
      reason?: string;
      sanitizedURL?: string;
    }
  >
> {
  const results = new Map();

  await Promise.all(
    urls.map(async url => {
      const result = await validateURL(url);
      results.set(url, result);
    })
  );

  return results;
}

/**
 * Check if URL is from a trusted domain (for allowing certain internal services)
 */
export function isTrustedDomain(
  url: string,
  trustedDomains: string[]
): boolean {
  try {
    const parsedURL = new URL(url);
    const hostname = parsedURL.hostname.toLowerCase();

    return trustedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase();
      // Exact match or subdomain match
      return (
        hostname === normalizedDomain ||
        hostname.endsWith(`.${normalizedDomain}`)
      );
    });
  } catch {
    return false;
  }
}

// Export for testing
export { isPrivateIP, isHostnameSafe };
