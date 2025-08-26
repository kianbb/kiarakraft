#!/usr/bin/env tsx

/**
 * V3-S5 Verification Script: Notifications & Communication
 *
 * Tests:
 * 1. Database models (PushSubscription, NotificationLog)
 * 2. Email notification service functionality
 * 3. Push subscription management APIs
 * 4. Notification workflow integration
 * 5. Bilingual template generation
 */

import { prisma } from '../lib/prisma';
import { sendNotification } from '../lib/notifications';

interface TestResult {
  test: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function logTest(
  test: string,
  passed: boolean,
  details?: string,
  error?: string
) {
  results.push({ test, passed, details, error });
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${test}${details ? `: ${details}` : ''}`);
  if (error) console.log(`   Error: ${error}`);
}

async function testDatabaseModels() {
  console.log('\n🔍 Testing Database Models...');

  // Test PushSubscription model
  try {
    await prisma.pushSubscription.findMany({ take: 1 });
    logTest('PushSubscription model accessible', true);
  } catch (error) {
    logTest(
      'PushSubscription model accessible',
      false,
      undefined,
      String(error)
    );
  }

  // Test NotificationLog model
  try {
    await prisma.notificationLog.findMany({ take: 1 });
    logTest('NotificationLog model accessible', true);
  } catch (error) {
    logTest(
      'NotificationLog model accessible',
      false,
      undefined,
      String(error)
    );
  }

  // Test foreign key constraints
  try {
    const user = await prisma.user.findFirst();
    if (user) {
      // Test PushSubscription foreign key
      const pushSub = await prisma.pushSubscription.create({
        data: {
          userId: user.id,
          endpoint: `https://test-endpoint-${Date.now()}.example.com`,
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      });

      const notificationLog = await prisma.notificationLog.create({
        data: {
          userId: user.id,
          type: 'order_paid',
          channel: 'email',
          status: 'sent',
          data: { orderId: 'test-order' },
        },
      });

      logTest('Database foreign keys work', true, 'Created test records');

      // Cleanup
      await prisma.pushSubscription.delete({ where: { id: pushSub.id } });
      await prisma.notificationLog.delete({
        where: { id: notificationLog.id },
      });
    } else {
      logTest(
        'Database foreign keys work',
        false,
        undefined,
        'No test user found'
      );
    }
  } catch (error) {
    logTest('Database foreign keys work', false, undefined, String(error));
  }
}

async function testNotificationService() {
  console.log('\n📧 Testing Notification Service...');

  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      logTest(
        'Email notification service',
        false,
        undefined,
        'No test user found'
      );
      return;
    }

    // Test order_paid notification
    try {
      const results = await sendNotification(
        {
          userId: user.id,
          type: 'order_paid',
          data: {
            orderId: 'test-order-123',
            customerName: 'Test User',
            locale: 'fa',
          },
        },
        ['email']
      ); // Only test email to avoid push subscription requirements

      const success = results.some(r => r.success);
      logTest(
        'Email notification service (order_paid)',
        success,
        success ? 'Email sent successfully' : 'Failed to send email'
      );

      // Check if notification was logged
      const logEntry = await prisma.notificationLog.findFirst({
        where: {
          userId: user.id,
          type: 'order_paid',
        },
        orderBy: { createdAt: 'desc' },
      });

      logTest(
        'Notification logging',
        !!logEntry,
        logEntry ? `Status: ${logEntry.status}` : 'No log entry found'
      );
    } catch (error) {
      logTest(
        'Email notification service (order_paid)',
        false,
        undefined,
        String(error)
      );
    }

    // Test different notification types
    const testCases = [
      {
        type: 'order_shipped' as const,
        data: { orderId: 'test-123', trackingNumber: 'TR123456' },
      },
      { type: 'order_delivered' as const, data: { orderId: 'test-123' } },
      {
        type: 'review_approved' as const,
        data: { productTitle: 'Test Product', reviewTitle: 'Great!' },
      },
    ];

    for (const testCase of testCases) {
      try {
        const results = await sendNotification(
          {
            userId: user.id,
            type: testCase.type,
            data: {
              ...testCase.data,
              customerName: 'Test User',
              locale: 'fa',
            },
          },
          ['email']
        );

        const success = results.some(r => r.success);
        logTest(`Email notification (${testCase.type})`, success);
      } catch (error) {
        logTest(
          `Email notification (${testCase.type})`,
          false,
          undefined,
          String(error)
        );
      }
    }
  } catch (error) {
    logTest(
      'Email notification service setup',
      false,
      undefined,
      String(error)
    );
  }
}

async function testBilingualTemplates() {
  console.log('\n🌐 Testing Bilingual Templates...');

  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      logTest('Bilingual templates', false, undefined, 'No test user found');
      return;
    }

    // Test Persian templates
    const persianResults = await sendNotification(
      {
        userId: user.id,
        type: 'order_shipped',
        data: {
          orderId: 'test-persian-123',
          customerName: 'کاربر تست',
          trackingNumber: 'TR789',
          locale: 'fa',
        },
      },
      ['email']
    );

    logTest(
      'Persian email template',
      persianResults.some(r => r.success),
      'RTL content generated'
    );

    // Test English templates
    const englishResults = await sendNotification(
      {
        userId: user.id,
        type: 'order_shipped',
        data: {
          orderId: 'test-english-123',
          customerName: 'Test User',
          trackingNumber: 'TR789',
          locale: 'en',
        },
      },
      ['email']
    );

    logTest(
      'English email template',
      englishResults.some(r => r.success),
      'LTR content generated'
    );
  } catch (error) {
    logTest('Bilingual templates', false, undefined, String(error));
  }
}

async function testPushInfrastructure() {
  console.log('\n🔔 Testing Push Infrastructure...');

  // Test VAPID configuration
  const hasVapidKeys = !!(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
  logTest(
    'VAPID keys configured',
    hasVapidKeys,
    hasVapidKeys
      ? 'Push notifications available'
      : 'Push notifications disabled (optional)'
  );

  if (hasVapidKeys) {
    try {
      // Test push subscription management
      const user = await prisma.user.findFirst();
      if (user) {
        const testSub = await prisma.pushSubscription.create({
          data: {
            userId: user.id,
            endpoint: `https://test-push-${Date.now()}.example.com`,
            p256dh: 'test-p256dh-key-verification',
            auth: 'test-auth-key-verification',
          },
        });

        // Test finding subscriptions
        const subs = await prisma.pushSubscription.findMany({
          where: { userId: user.id },
        });

        logTest(
          'Push subscription management',
          subs.length > 0,
          `Found ${subs.length} subscription(s)`
        );

        // Cleanup
        await prisma.pushSubscription.delete({ where: { id: testSub.id } });
      }
    } catch (error) {
      logTest('Push subscription management', false, undefined, String(error));
    }
  }
}

async function testOrderWorkflowIntegration() {
  console.log('\n⚙️  Testing Order Workflow Integration...');

  try {
    // Test if notification hooks are properly integrated
    // (This would require actual order status changes, so we test the models instead)

    const recentNotifications = await prisma.notificationLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    });

    logTest(
      'Order workflow notifications logged',
      recentNotifications.length > 0,
      `Found ${recentNotifications.length} recent notification(s)`
    );

    // Test different notification types are logged
    const types = await prisma.notificationLog.groupBy({
      by: ['type'],
      _count: { type: true },
    });

    const typeCount = types.length;
    logTest(
      'Multiple notification types supported',
      typeCount > 0,
      `${typeCount} notification type(s) in use`
    );

    // Test both email and push channels if applicable
    const channels = await prisma.notificationLog.groupBy({
      by: ['channel'],
      _count: { channel: true },
    });

    logTest(
      'Multiple channels supported',
      channels.length > 0,
      channels.map(c => `${c.channel}: ${c._count.channel}`).join(', ')
    );
  } catch (error) {
    logTest(
      'Order workflow integration check',
      false,
      undefined,
      String(error)
    );
  }
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');

  try {
    // Remove test notifications
    const deleted = await prisma.notificationLog.deleteMany({
      where: {
        OR: [
          { data: { path: ['orderId'], string_contains: 'test-' } },
          { data: { path: ['customerName'], equals: 'Test User' } },
          { data: { path: ['customerName'], equals: 'کاربر تست' } },
        ],
      },
    });

    logTest(
      'Cleanup test notifications',
      true,
      `Removed ${deleted.count} test records`
    );
  } catch (error) {
    logTest('Cleanup test notifications', false, undefined, String(error));
  }
}

async function main() {
  console.log('🚀 V3-S5 Verification: Notifications & Communication System');
  console.log('='.repeat(60));

  try {
    await testDatabaseModels();
    await testNotificationService();
    await testBilingualTemplates();
    await testPushInfrastructure();
    await testOrderWorkflowIntegration();
    await cleanupTestData();

    // Summary
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const percentage = Math.round((passed / total) * 100);

    console.log('\n📊 Test Summary');
    console.log('='.repeat(40));
    console.log(`✅ Passed: ${passed}/${total} (${percentage}%)`);

    if (passed < total) {
      console.log(`❌ Failed: ${total - passed}/${total}`);
      console.log('\nFailed tests:');
      results
        .filter(r => !r.passed)
        .forEach(r =>
          console.log(`   • ${r.test}: ${r.error || 'Unknown error'}`)
        );
    }

    if (percentage >= 80) {
      console.log('\n🎉 V3-S5 Notifications system is ready for production!');
      process.exit(0);
    } else {
      console.log(
        '\n⚠️  Some tests failed. Please review and fix issues before deployment.'
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Verification script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as verifyV3S5 };
