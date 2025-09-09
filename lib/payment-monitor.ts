/**
 * Payment Pattern Monitoring
 * Detects unusual payment patterns and potential fraud
 */

import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';

interface PaymentPattern {
  userId: string;
  orderId: string;
  amount: number;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}

interface SuspiciousActivity {
  type: 'velocity' | 'amount' | 'pattern' | 'location';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Check for suspicious payment patterns
 */
export async function checkPaymentPatterns(pattern: PaymentPattern): Promise<{
  suspicious: boolean;
  activities: SuspiciousActivity[];
  riskScore: number;
}> {
  const activities: SuspiciousActivity[] = [];
  let riskScore = 0;

  try {
    // Check velocity (too many payments in short time)
    const velocityCheck = await checkVelocity(pattern.userId);
    if (velocityCheck.suspicious) {
      activities.push(velocityCheck.activity);
      riskScore += velocityCheck.riskPoints;
    }

    // Check unusual amounts
    const amountCheck = await checkUnusualAmount(pattern.userId, pattern.amount);
    if (amountCheck.suspicious) {
      activities.push(amountCheck.activity);
      riskScore += amountCheck.riskPoints;
    }

    // Check payment failure patterns
    const failureCheck = await checkFailurePatterns(pattern.userId);
    if (failureCheck.suspicious) {
      activities.push(failureCheck.activity);
      riskScore += failureCheck.riskPoints;
    }

    // Check for multiple cards/payment methods
    const multiCardCheck = await checkMultiplePaymentMethods(pattern.userId);
    if (multiCardCheck.suspicious) {
      activities.push(multiCardCheck.activity);
      riskScore += multiCardCheck.riskPoints;
    }

    // Log suspicious activity if detected
    if (activities.length > 0) {
      await logSuspiciousActivity(pattern, activities, riskScore);
    }

    return {
      suspicious: riskScore > 50,
      activities,
      riskScore,
    };
  } catch (error) {
    console.error('Error checking payment patterns:', error);
    Sentry.captureException(error);
    return { suspicious: false, activities: [], riskScore: 0 };
  }
}

/**
 * Check payment velocity (frequency)
 */
async function checkVelocity(userId: string): Promise<{
  suspicious: boolean;
  activity: SuspiciousActivity;
  riskPoints: number;
}> {
  // Check payments in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentPayments = await prisma.payment.count({
    where: {
      order: { userId },
      createdAt: { gte: oneHourAgo },
      status: { in: ['PAID', 'INITIATED'] },
    },
  });

  if (recentPayments > 5) {
    return {
      suspicious: true,
      activity: {
        type: 'velocity',
        severity: 'high',
        description: `${recentPayments} payments in last hour`,
        metadata: { count: recentPayments },
      },
      riskPoints: 40,
    };
  }

  if (recentPayments > 3) {
    return {
      suspicious: true,
      activity: {
        type: 'velocity',
        severity: 'medium',
        description: `${recentPayments} payments in last hour`,
        metadata: { count: recentPayments },
      },
      riskPoints: 20,
    };
  }

  return {
    suspicious: false,
    activity: { type: 'velocity', severity: 'low', description: 'Normal velocity' },
    riskPoints: 0,
  };
}

/**
 * Check for unusual payment amounts
 */
async function checkUnusualAmount(userId: string, amount: number): Promise<{
  suspicious: boolean;
  activity: SuspiciousActivity;
  riskPoints: number;
}> {
  // Get user's payment history
  const paymentHistory = await prisma.payment.findMany({
    where: {
      order: { userId },
      status: 'PAID',
    },
    select: { amountToman: true },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  if (paymentHistory.length < 3) {
    // Not enough history to determine pattern
    return {
      suspicious: false,
      activity: { type: 'amount', severity: 'low', description: 'Insufficient history' },
      riskPoints: 0,
    };
  }

  // Calculate average amount
  const avgAmount = paymentHistory.reduce((sum, p) => sum + p.amountToman, 0) / paymentHistory.length;
  
  // Check if current amount is significantly higher
  if (amount > avgAmount * 5) {
    return {
      suspicious: true,
      activity: {
        type: 'amount',
        severity: 'high',
        description: `Amount ${amount} is 5x higher than average ${avgAmount}`,
        metadata: { amount, average: avgAmount },
      },
      riskPoints: 30,
    };
  }

  if (amount > avgAmount * 3) {
    return {
      suspicious: true,
      activity: {
        type: 'amount',
        severity: 'medium',
        description: `Amount ${amount} is 3x higher than average ${avgAmount}`,
        metadata: { amount, average: avgAmount },
      },
      riskPoints: 15,
    };
  }

  return {
    suspicious: false,
    activity: { type: 'amount', severity: 'low', description: 'Normal amount' },
    riskPoints: 0,
  };
}

/**
 * Check payment failure patterns
 */
async function checkFailurePatterns(userId: string): Promise<{
  suspicious: boolean;
  activity: SuspiciousActivity;
  riskPoints: number;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const failedPayments = await prisma.payment.count({
    where: {
      order: { userId },
      status: 'FAILED',
      createdAt: { gte: oneDayAgo },
    },
  });

  if (failedPayments > 10) {
    return {
      suspicious: true,
      activity: {
        type: 'pattern',
        severity: 'critical',
        description: `${failedPayments} failed payments in last 24 hours`,
        metadata: { failedCount: failedPayments },
      },
      riskPoints: 50,
    };
  }

  if (failedPayments > 5) {
    return {
      suspicious: true,
      activity: {
        type: 'pattern',
        severity: 'high',
        description: `${failedPayments} failed payments in last 24 hours`,
        metadata: { failedCount: failedPayments },
      },
      riskPoints: 25,
    };
  }

  return {
    suspicious: false,
    activity: { type: 'pattern', severity: 'low', description: 'Normal failure rate' },
    riskPoints: 0,
  };
}

/**
 * Check for multiple payment methods being used
 */
async function checkMultiplePaymentMethods(userId: string): Promise<{
  suspicious: boolean;
  activity: SuspiciousActivity;
  riskPoints: number;
}> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Get unique payment authorities (simplified check)
  const payments = await prisma.payment.findMany({
    where: {
      order: { userId },
      createdAt: { gte: oneWeekAgo },
      status: { in: ['PAID', 'INITIATED'] },
    },
    select: { authority: true },
  });

  const uniqueAuthorities = new Set(payments.map(p => p.authority?.substring(0, 10))).size;

  if (uniqueAuthorities > 5) {
    return {
      suspicious: true,
      activity: {
        type: 'pattern',
        severity: 'medium',
        description: `${uniqueAuthorities} different payment methods used in last week`,
        metadata: { methodCount: uniqueAuthorities },
      },
      riskPoints: 20,
    };
  }

  return {
    suspicious: false,
    activity: { type: 'pattern', severity: 'low', description: 'Normal payment method usage' },
    riskPoints: 0,
  };
}

/**
 * Log suspicious payment activity
 */
async function logSuspiciousActivity(
  pattern: PaymentPattern,
  activities: SuspiciousActivity[],
  riskScore: number
): Promise<void> {
  try {
    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        action: 'suspicious_payment_detected',
        userId: pattern.userId,
        targetId: pattern.orderId,
        targetType: 'order',
        metadata: {
          activities: JSON.parse(JSON.stringify(activities)),
          riskScore,
          amount: pattern.amount,
          timestamp: pattern.timestamp.toISOString(),
          ip: pattern.ip,
        },
        success: true,
        ipAddress: pattern.ip,
      },
    });

    // Send alert for high-risk activities
    if (riskScore > 75) {
      Sentry.captureMessage(`High-risk payment detected for user ${pattern.userId}`, {
        level: 'warning',
        extra: {
          activities,
          riskScore,
          orderId: pattern.orderId,
        },
      });
    }
  } catch (error) {
    console.error('Failed to log suspicious activity:', error);
    Sentry.captureException(error);
  }
}

/**
 * Get payment risk report for a user
 */
export async function getPaymentRiskReport(userId: string): Promise<{
  riskLevel: 'low' | 'medium' | 'high';
  totalPayments: number;
  failedPayments: number;
  suspiciousActivities: number;
  recommendations: string[];
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalPayments, failedPayments, suspiciousLogs] = await Promise.all([
    prisma.payment.count({
      where: {
        order: { userId },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.payment.count({
      where: {
        order: { userId },
        status: 'FAILED',
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.auditLog.count({
      where: {
        userId,
        action: 'suspicious_payment_detected',
      },
    }),
  ]);

  const failureRate = totalPayments > 0 ? failedPayments / totalPayments : 0;
  const recommendations: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  if (suspiciousLogs > 5 || failureRate > 0.5) {
    riskLevel = 'high';
    recommendations.push('Review payment history for potential fraud');
    recommendations.push('Consider requiring additional verification');
  } else if (suspiciousLogs > 2 || failureRate > 0.3) {
    riskLevel = 'medium';
    recommendations.push('Monitor future payments closely');
  }

  if (failureRate > 0.3) {
    recommendations.push('High payment failure rate detected');
  }

  return {
    riskLevel,
    totalPayments,
    failedPayments,
    suspiciousActivities: suspiciousLogs,
    recommendations,
  };
}