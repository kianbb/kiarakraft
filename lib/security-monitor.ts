/**
 * Security Monitoring Utilities
 * Real-time security threat detection and alerting
 */

import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { createAuditLog, AuditAction } from '@/lib/audit-log';

// Security thresholds
const THRESHOLDS = {
  failedLogins: {
    perUser: 5, // Max failed logins per user per hour
    perIP: 10, // Max failed logins per IP per hour
    global: 100, // Max global failed logins per hour
  },
  rateLimit: {
    violations: 20, // Max rate limit violations per hour
  },
  suspiciousPatterns: {
    sqlInjection: [
      'union',
      'select',
      'drop',
      'insert',
      'update',
      'delete',
      '--',
      '/*',
      '*/',
    ],
    xss: [
      '<script',
      'javascript:',
      'onerror',
      'onload',
      'alert(',
      'document.cookie',
    ],
    pathTraversal: ['../', '..\\', '%2e%2e', '0x2e0x2e'],
  },
};

// Alert levels
export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

// Security event types
export enum SecurityEventType {
  FAILED_LOGIN = 'FAILED_LOGIN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  PATH_TRAVERSAL_ATTEMPT = 'PATH_TRAVERSAL_ATTEMPT',
  BRUTE_FORCE_DETECTED = 'BRUTE_FORCE_DETECTED',
  ACCOUNT_TAKEOVER_ATTEMPT = 'ACCOUNT_TAKEOVER_ATTEMPT',
  SUSPICIOUS_API_PATTERN = 'SUSPICIOUS_API_PATTERN',
}

/**
 * Detect SQL injection attempts
 */
export function detectSQLInjection(input: string): boolean {
  const lowercaseInput = input.toLowerCase();
  return THRESHOLDS.suspiciousPatterns.sqlInjection.some(pattern =>
    lowercaseInput.includes(pattern)
  );
}

/**
 * Detect XSS attempts
 */
export function detectXSS(input: string): boolean {
  const lowercaseInput = input.toLowerCase();
  return THRESHOLDS.suspiciousPatterns.xss.some(pattern =>
    lowercaseInput.includes(pattern)
  );
}

/**
 * Detect path traversal attempts
 */
export function detectPathTraversal(input: string): boolean {
  return THRESHOLDS.suspiciousPatterns.pathTraversal.some(pattern =>
    input.includes(pattern)
  );
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  eventType: SecurityEventType,
  details: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    targetUrl?: string;
    payload?: unknown;
    message?: string;
  },
  level: AlertLevel = AlertLevel.WARNING
): Promise<void> {
  try {
    // Log to audit log
    await createAuditLog({
      action: AuditAction.SECURITY_SUSPICIOUS_ACTIVITY,
      userId: details.userId,
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,
      metadata: {
        eventType,
        level,
        targetUrl: details.targetUrl,
        message: details.message,
        // Don't log full payload to avoid storing attack vectors
        payloadSize: JSON.stringify(details.payload || '').length,
      },
      success: false,
      errorMessage: `Security event: ${eventType}`,
    });

    // Send to Sentry for critical events
    if (level === AlertLevel.CRITICAL) {
      Sentry.captureMessage(`Security Alert: ${eventType}`, {
        level: 'error',
        extra: {
          ...details,
          payload: undefined, // Don't send payload to Sentry
        },
      });
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[SECURITY] ${level}: ${eventType}`, details);
    }
  } catch (error) {
    console.error('Failed to log security event:', error);
    Sentry.captureException(error);
  }
}

/**
 * Check for brute force attacks
 */
export async function checkBruteForce(
  identifier: string,
  type: 'user' | 'ip'
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const failedAttempts = await prisma.auditLog.count({
    where: {
      action: AuditAction.LOGIN_FAILED,
      timestamp: { gte: oneHourAgo },
      ...(type === 'user'
        ? { userEmail: identifier }
        : { ipAddress: identifier }),
    },
  });

  const threshold =
    type === 'user'
      ? THRESHOLDS.failedLogins.perUser
      : THRESHOLDS.failedLogins.perIP;

  if (failedAttempts >= threshold) {
    await logSecurityEvent(
      SecurityEventType.BRUTE_FORCE_DETECTED,
      {
        [type === 'user' ? 'userId' : 'ipAddress']: identifier,
        message: `Brute force detected: ${failedAttempts} failed attempts`,
      },
      AlertLevel.CRITICAL
    );
    return true;
  }

  return false;
}

/**
 * Analyze request for security threats
 */
export async function analyzeRequest(request: Request): Promise<{
  safe: boolean;
  threats: SecurityEventType[];
  level: AlertLevel;
}> {
  const threats: SecurityEventType[] = [];
  let level = AlertLevel.INFO;

  try {
    const url = new URL(request.url);
    const urlPath = url.pathname + url.search;

    // Check URL for attacks
    if (detectSQLInjection(urlPath)) {
      threats.push(SecurityEventType.SQL_INJECTION_ATTEMPT);
      level = AlertLevel.CRITICAL;
    }

    if (detectXSS(urlPath)) {
      threats.push(SecurityEventType.XSS_ATTEMPT);
      level = AlertLevel.CRITICAL;
    }

    if (detectPathTraversal(urlPath)) {
      threats.push(SecurityEventType.PATH_TRAVERSAL_ATTEMPT);
      level = AlertLevel.CRITICAL;
    }

    // Check headers
    const suspiciousHeaders = [
      'x-forwarded-host',
      'x-original-url',
      'x-rewrite-url',
    ];

    for (const header of suspiciousHeaders) {
      const value = request.headers.get(header);
      if (value && (detectPathTraversal(value) || detectXSS(value))) {
        threats.push(SecurityEventType.SUSPICIOUS_API_PATTERN);
        level = AlertLevel.WARNING;
      }
    }

    // Log threats if found
    if (threats.length > 0) {
      const ipAddress =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';

      await logSecurityEvent(
        threats[0], // Log the most severe threat
        {
          ipAddress,
          userAgent: request.headers.get('user-agent') || undefined,
          targetUrl: request.url,
          message: `Detected threats: ${threats.join(', ')}`,
        },
        level
      );
    }
  } catch (error) {
    console.error('Error analyzing request:', error);
  }

  return {
    safe: threats.length === 0,
    threats,
    level,
  };
}

/**
 * Get security metrics for dashboard
 */
export async function getSecurityMetrics(hours: number = 24): Promise<{
  failedLogins: number;
  rateLimitViolations: number;
  securityEvents: number;
  topThreats: Array<{ type: string; count: number }>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [failedLogins, rateLimitViolations, securityEvents] = await Promise.all(
    [
      prisma.auditLog.count({
        where: {
          action: AuditAction.LOGIN_FAILED,
          timestamp: { gte: since },
        },
      }),
      prisma.auditLog.count({
        where: {
          action: AuditAction.SECURITY_RATE_LIMIT_EXCEEDED,
          timestamp: { gte: since },
        },
      }),
      prisma.auditLog.count({
        where: {
          action: {
            startsWith: 'SECURITY_',
          },
          timestamp: { gte: since },
        },
      }),
    ]
  );

  // Calculate risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

  if (securityEvents > 50 || failedLogins > 100) {
    riskLevel = 'CRITICAL';
  } else if (securityEvents > 20 || failedLogins > 50) {
    riskLevel = 'HIGH';
  } else if (securityEvents > 10 || failedLogins > 20) {
    riskLevel = 'MEDIUM';
  }

  // Get top threats (simplified for now)
  const topThreats = [
    { type: 'Failed Logins', count: failedLogins },
    { type: 'Rate Limit Violations', count: rateLimitViolations },
    { type: 'Security Events', count: securityEvents },
  ].sort((a, b) => b.count - a.count);

  return {
    failedLogins,
    rateLimitViolations,
    securityEvents,
    topThreats,
    riskLevel,
  };
}

/**
 * Security middleware for request analysis
 */
export function withSecurityMonitoring<T extends unknown[]>(
  handler: (request: Request, ...rest: T) => Promise<Response>
) {
  return async (request: Request, ...rest: T): Promise<Response> => {
    // Analyze request for threats
    const analysis = await analyzeRequest(request);

    // Block critical threats
    if (!analysis.safe && analysis.level === AlertLevel.CRITICAL) {
      return new Response(
        JSON.stringify({ error: 'Security threat detected' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Process request
    return handler(request, ...rest);
  };
}
