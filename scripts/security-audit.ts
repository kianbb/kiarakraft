#!/usr/bin/env tsx

/**
 * Security Audit Script for V3-S5 Notifications System
 *
 * Tests all critical security fixes:
 * 1. HTML/XSS injection prevention
 * 2. PII data protection
 * 3. Input validation and sanitization
 * 4. Service worker security
 * 5. Rate limiting protection
 */

import {
  sanitizeText,
  sanitizeHtml,
  sanitizeCustomerName,
  sanitizeNotificationData,
  filterSensitiveData,
  checkNotificationRateLimit,
  validateNotificationUrl,
  validateServiceWorkerNotification,
} from '../lib/security';

interface SecurityTest {
  name: string;
  test: () => boolean | Promise<boolean>;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

const securityTests: SecurityTest[] = [
  {
    name: 'HTML Injection Prevention',
    severity: 'HIGH',
    description: 'Prevents XSS attacks through HTML sanitization',
    test: () => {
      const maliciousInput =
        '<script>alert("XSS")</script><img src=x onerror=alert("XSS2")>';
      const sanitized = sanitizeText(maliciousInput);

      // Should not contain any script tags or event handlers
      return (
        !sanitized.includes('<script>') &&
        !sanitized.includes('onerror') &&
        !sanitized.includes('javascript:') &&
        sanitized.includes('&lt;script&gt;')
      ); // Should be escaped
    },
  },

  {
    name: 'Customer Name PII Protection',
    severity: 'HIGH',
    description: 'Prevents email exposure in customer names',
    test: () => {
      const userWithEmail = { email: 'test@example.com' };
      const userWithName = { email: 'test@example.com', name: 'John Doe' };

      const nameFromEmail = sanitizeCustomerName(userWithEmail);
      const nameFromUser = sanitizeCustomerName(userWithName);

      // Should not expose email parts
      return (
        nameFromEmail === 'Customer' &&
        nameFromUser === 'John Doe' &&
        !nameFromEmail.includes('@') &&
        !nameFromEmail.includes('test')
      );
    },
  },

  {
    name: 'Notification Data Validation',
    severity: 'HIGH',
    description: 'Validates and sanitizes notification data structure',
    test: () => {
      const maliciousData = {
        orderId: '<script>alert("hack")</script>',
        productTitle: 'Product</p><script>alert("xss")</script><p>',
        customerName: 'test@secret-email.com',
        maliciousField: 'should-be-filtered',
        locale: 'invalid-locale',
      };

      const sanitized = sanitizeNotificationData(maliciousData);

      return (
        sanitized.orderId?.includes('&lt;script&gt;') === true &&
        sanitized.productTitle?.includes('&lt;script&gt;') === true &&
        sanitized.locale === 'fa' && // Should default to safe value
        !('maliciousField' in sanitized)
      ); // Should filter unknown fields
    },
  },

  {
    name: 'Sensitive Data Filtering',
    severity: 'HIGH',
    description: 'Filters sensitive information from logs',
    test: () => {
      const sensitiveData = {
        orderId: 'order-123',
        email: 'user@example.com',
        password: 'secret123',
        auth: 'auth-key-123',
        p256dh: 'push-key',
        regularField: 'safe-data',
      };

      const filtered = filterSensitiveData(sensitiveData);

      return (
        filtered.orderId === 'order-123' &&
        filtered.regularField === 'safe-data' &&
        filtered.email === '[FILTERED]' &&
        filtered.password === '[FILTERED]' &&
        filtered.auth === '[FILTERED]'
      );
    },
  },

  {
    name: 'Rate Limiting Protection',
    severity: 'MEDIUM',
    description: 'Prevents notification spam',
    test: () => {
      const userId = 'test-user-rate-limit';
      let allowedCount = 0;

      // Should allow first few requests
      for (let i = 0; i < 5; i++) {
        const result = checkNotificationRateLimit(userId);
        if (result.allowed) allowedCount++;
      }

      // Test many more requests (should be blocked)
      let blockedCount = 0;
      for (let i = 0; i < 10; i++) {
        const result = checkNotificationRateLimit(userId);
        if (!result.allowed) blockedCount++;
      }

      return allowedCount >= 5 && blockedCount > 0;
    },
  },

  {
    name: 'URL Validation Security',
    severity: 'HIGH',
    description: 'Prevents malicious URL injections',
    test: () => {
      const maliciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'https://malicious-site.com/steal-data',
        '../../../etc/passwd',
        'http://evil.com/redirect',
      ];

      const validUrls = [
        '/fa/orders',
        '/en/products',
        'https://kiarakraft.com/safe',
      ];

      // All malicious URLs should be sanitized to safe fallback
      const maliciousSanitized = maliciousUrls.map(url =>
        validateNotificationUrl(url)
      );
      const validSanitized = validUrls.map(url => validateNotificationUrl(url));

      return (
        maliciousSanitized.every(url => url === '/fa') &&
        validSanitized.some(url => url.startsWith('/'))
      );
    },
  },

  {
    name: 'Service Worker Data Validation',
    severity: 'HIGH',
    description: 'Validates service worker notification data',
    test: () => {
      const maliciousSwData = {
        title:
          '<script>alert("sw-xss")</script>Very Long Title That Exceeds Normal Limits And Should Be Truncated',
        body: '<img src=x onerror=alert("sw-body-xss")>'.repeat(20), // Very long malicious body
        tag: 'malicious<script>tag',
        data: {
          url: 'javascript:alert("sw-url-xss")',
          type: '<script>alert("sw-type-xss")</script>',
        },
      };

      const validated = validateServiceWorkerNotification(maliciousSwData);

      return (
        validated.title.length <= 100 &&
        validated.body.length <= 300 &&
        validated.tag === 'malicious' && // Should sanitize script part
        validated.data.url === '/fa' && // Should fallback to safe URL
        !validated.title.includes('<script>')
      );
    },
  },

  {
    name: 'HTML Template Safety',
    severity: 'HIGH',
    description: 'Ensures email templates are XSS-safe',
    test: () => {
      const maliciousHtml =
        '<p>Hello <script>alert("xss")</script></p><img src=x onerror=alert("img")>';
      const sanitized = sanitizeHtml(maliciousHtml);

      // Should preserve safe tags but remove dangerous ones
      return (
        sanitized.includes('<p>') &&
        sanitized.includes('Hello') &&
        !sanitized.includes('<script>') &&
        !sanitized.includes('onerror') &&
        !sanitized.includes('<img')
      );
    },
  },
];

async function runSecurityAudit() {
  console.log('🔒 Kiara Kraft Notification System - Security Audit');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;
  const failures: Array<{ test: SecurityTest; error?: string }> = [];

  for (const test of securityTests) {
    try {
      const result = await test.test();

      if (result) {
        console.log(`✅ ${test.name} - PASS`);
        passed++;
      } else {
        console.log(`❌ ${test.name} - FAIL`);
        failed++;
        failures.push({ test });
      }
    } catch (error) {
      console.log(`💥 ${test.name} - ERROR`);
      failed++;
      failures.push({ test, error: String(error) });
    }
  }

  console.log('\n📊 Security Audit Summary');
  console.log('='.repeat(40));
  console.log(`✅ Passed: ${passed}/${securityTests.length}`);
  console.log(`❌ Failed: ${failed}/${securityTests.length}`);

  if (failures.length > 0) {
    console.log('\n🚨 Security Issues Found:');
    failures.forEach(({ test, error }) => {
      console.log(`\n• ${test.name} (${test.severity})`);
      console.log(`  Description: ${test.description}`);
      if (error) console.log(`  Error: ${error}`);
    });
  }

  const criticalFailures = failures.filter(f => f.test.severity === 'HIGH');

  if (criticalFailures.length === 0) {
    console.log('\n🎉 All critical security tests passed!');
    console.log('✅ Notification system is secure for production deployment.');
    process.exit(0);
  } else {
    console.log('\n🚨 CRITICAL SECURITY ISSUES DETECTED!');
    console.log(
      `❌ ${criticalFailures.length} high-severity issues must be fixed.`
    );
    console.log('⚠️  Do NOT deploy to production until these are resolved.');
    process.exit(1);
  }
}

if (require.main === module) {
  runSecurityAudit().catch(console.error);
}

export { runSecurityAudit };
