import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import webpush from 'web-push';
import { ReactElement } from 'react';

// Environment configuration for web push (optional)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:hello@kiarakraft.com';

// Initialize web push if VAPID keys are available
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type NotificationType =
  | 'order_paid'
  | 'order_shipped'
  | 'order_delivered'
  | 'review_approved';

export type NotificationChannel = 'email' | 'push';

export interface NotificationData {
  userId: string;
  type: NotificationType;
  data: {
    orderId?: string;
    orderTotal?: number;
    trackingNumber?: string;
    productTitle?: string;
    reviewTitle?: string;
    customerName?: string;
    locale?: string;
  };
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
}

/**
 * Send notification via email
 */
async function sendEmailNotification(
  notification: NotificationData
): Promise<NotificationResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: notification.userId },
      select: { email: true, name: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const { subject, html } = await generateEmailContent(notification, user);

    const result = await sendEmail({
      to: user.email,
      subject,
      html,
    });

    if (!result.success) {
      throw new Error(result.error || 'Email sending failed');
    }

    return {
      success: true,
      channel: 'email',
      messageId: result.messageId,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'email',
      error: error instanceof Error ? error.message : 'Unknown email error',
    };
  }
}

/**
 * Send notification via web push
 */
async function sendPushNotification(
  notification: NotificationData
): Promise<NotificationResult> {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('Web push not configured - VAPID keys missing');
    }

    // Get user's push subscriptions
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: notification.userId },
    });

    if (subscriptions.length === 0) {
      throw new Error('No push subscriptions found for user');
    }

    const { title, body, icon } = generatePushContent(notification);

    const payload = JSON.stringify({
      title,
      body,
      icon,
      badge: '/icon-192x192.png',
      data: {
        type: notification.type,
        ...notification.data,
      },
    });

    // Send to all user's subscriptions
    const promises = subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload
        );
        return true;
      } catch (error) {
        console.error(
          `Push notification failed for subscription ${subscription.id}:`,
          error
        );

        // Remove invalid subscription
        if (error && typeof error === 'object' && 'statusCode' in error) {
          const statusCode = (error as { statusCode: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.delete({
              where: { id: subscription.id },
            });
          }
        }
        return false;
      }
    });

    const results = await Promise.all(promises);
    const successCount = results.filter(Boolean).length;

    if (successCount === 0) {
      throw new Error('All push notifications failed');
    }

    return {
      success: true,
      channel: 'push',
      messageId: `${successCount}/${subscriptions.length} sent`,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'push',
      error: error instanceof Error ? error.message : 'Unknown push error',
    };
  }
}

/**
 * Generate email content based on notification type
 */
async function generateEmailContent(
  notification: NotificationData,
  user: { email: string; name: string | null }
): Promise<{ subject: string; html: string }> {
  const { type, data } = notification;
  const locale = data.locale || 'fa';
  const isRTL = locale === 'fa';
  const customerName = user.name || data.customerName || 'کاربر گرامی';

  // Base styles for email
  const baseStyles = `
    <style>
      body { 
        font-family: ${isRTL ? 'Vazir, Arial' : 'Arial, sans-serif'}; 
        direction: ${isRTL ? 'rtl' : 'ltr'}; 
        background-color: #f5f5f5; 
        margin: 0; 
        padding: 20px; 
      }
      .container { 
        max-width: 600px; 
        margin: 0 auto; 
        background: white; 
        border-radius: 8px; 
        overflow: hidden; 
        box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
      }
      .header { 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
        color: white; 
        padding: 30px; 
        text-align: center; 
      }
      .content { 
        padding: 30px; 
        line-height: 1.6; 
      }
      .footer { 
        background: #f8f9fa; 
        padding: 20px; 
        text-align: center; 
        font-size: 14px; 
        color: #666; 
      }
      .button { 
        display: inline-block; 
        background: #667eea; 
        color: white; 
        padding: 12px 24px; 
        text-decoration: none; 
        border-radius: 6px; 
        margin: 15px 0; 
      }
      .order-details { 
        background: #f8f9fa; 
        border: 1px solid #e9ecef; 
        border-radius: 6px; 
        padding: 20px; 
        margin: 20px 0; 
      }
    </style>
  `;

  switch (type) {
    case 'order_paid':
      return {
        subject: isRTL
          ? `✅ تأیید پرداخت سفارش - کیارا کرفت`
          : `✅ Payment Confirmed - Kiara Kraft`,
        html: `
          ${baseStyles}
          <body>
            <div class="container">
              <div class="header">
                <h1>${isRTL ? 'پرداخت با موفقیت انجام شد!' : 'Payment Successful!'}</h1>
              </div>
              <div class="content">
                <p>${isRTL ? `سلام ${customerName}،` : `Hello ${customerName},`}</p>
                <p>${
                  isRTL
                    ? 'پرداخت سفارش شما با موفقیت انجام شد و سفارش شما در حال پردازش است.'
                    : 'Your payment has been successfully processed and your order is now being prepared.'
                }</p>
                ${
                  data.orderId
                    ? `
                  <div class="order-details">
                    <h3>${isRTL ? 'جزئیات سفارش:' : 'Order Details:'}</h3>
                    <p><strong>${isRTL ? 'شماره سفارش:' : 'Order #:'}</strong> ${data.orderId}</p>
                    ${data.orderTotal ? `<p><strong>${isRTL ? 'مبلغ:' : 'Total:'}</strong> ${data.orderTotal.toLocaleString()} ${isRTL ? 'تومان' : 'TMN'}</p>` : ''}
                  </div>
                `
                    : ''
                }
                <p>${
                  isRTL
                    ? 'بزودی از وضعیت ارسال سفارش شما مطلع خواهید شد.'
                    : 'You will be notified when your order ships.'
                }</p>
              </div>
              <div class="footer">
                <p>${isRTL ? 'با تشکر' : 'Thank you'} | کیارا کرفت - Kiara Kraft</p>
              </div>
            </div>
          </body>
        `,
      };

    case 'order_shipped':
      return {
        subject: isRTL
          ? `🚚 سفارش شما ارسال شد - کیارا کرفت`
          : `🚚 Your Order Has Shipped - Kiara Kraft`,
        html: `
          ${baseStyles}
          <body>
            <div class="container">
              <div class="header">
                <h1>${isRTL ? 'سفارش شما ارسال شد!' : 'Your Order Has Shipped!'}</h1>
              </div>
              <div class="content">
                <p>${isRTL ? `سلام ${customerName}،` : `Hello ${customerName},`}</p>
                <p>${
                  isRTL
                    ? 'سفارش شما بسته‌بندی شده و به مقصد ارسال گردیده است.'
                    : 'Your order has been packaged and shipped to your address.'
                }</p>
                ${
                  data.orderId || data.trackingNumber
                    ? `
                  <div class="order-details">
                    <h3>${isRTL ? 'جزئیات ارسال:' : 'Shipping Details:'}</h3>
                    ${data.orderId ? `<p><strong>${isRTL ? 'شماره سفارش:' : 'Order #:'}</strong> ${data.orderId}</p>` : ''}
                    ${data.trackingNumber ? `<p><strong>${isRTL ? 'کد رهگیری:' : 'Tracking #:'}</strong> ${data.trackingNumber}</p>` : ''}
                  </div>
                `
                    : ''
                }
                <p>${
                  isRTL
                    ? 'معمولاً ارسال سفارشات ۱ تا ۳ روز کاری طول می‌کشد.'
                    : 'Orders typically arrive within 1-3 business days.'
                }</p>
              </div>
              <div class="footer">
                <p>${isRTL ? 'با تشکر' : 'Thank you'} | کیارا کرفت - Kiara Kraft</p>
              </div>
            </div>
          </body>
        `,
      };

    case 'order_delivered':
      return {
        subject: isRTL
          ? `✅ سفارش شما تحویل داده شد - کیارا کرفت`
          : `✅ Your Order Has Been Delivered - Kiara Kraft`,
        html: `
          ${baseStyles}
          <body>
            <div class="container">
              <div class="header">
                <h1>${isRTL ? 'سفارش شما تحویل داده شد!' : 'Order Delivered!'}</h1>
              </div>
              <div class="content">
                <p>${isRTL ? `سلام ${customerName}،` : `Hello ${customerName},`}</p>
                <p>${
                  isRTL
                    ? 'سفارش شما با موفقیت تحویل داده شده است. امیدواریم از خرید خود راضی باشید.'
                    : 'Your order has been successfully delivered. We hope you love your purchase!'
                }</p>
                ${
                  data.orderId
                    ? `
                  <div class="order-details">
                    <h3>${isRTL ? 'جزئیات سفارش:' : 'Order Details:'}</h3>
                    <p><strong>${isRTL ? 'شماره سفارش:' : 'Order #:'}</strong> ${data.orderId}</p>
                  </div>
                `
                    : ''
                }
                <p>${
                  isRTL
                    ? 'در صورت رضایت از محصول، لطفاً نظر خود را با ما در میان بگذارید.'
                    : "If you're happy with your purchase, please consider leaving a review!"
                }</p>
              </div>
              <div class="footer">
                <p>${isRTL ? 'با تشکر' : 'Thank you'} | کیارا کرفت - Kiara Kraft</p>
              </div>
            </div>
          </body>
        `,
      };

    case 'review_approved':
      return {
        subject: isRTL
          ? `✅ نظر شما تأیید شد - کیارا کرفت`
          : `✅ Your Review Has Been Approved - Kiara Kraft`,
        html: `
          ${baseStyles}
          <body>
            <div class="container">
              <div class="header">
                <h1>${isRTL ? 'نظر شما تأیید شد!' : 'Review Approved!'}</h1>
              </div>
              <div class="content">
                <p>${isRTL ? `سلام ${customerName}،` : `Hello ${customerName},`}</p>
                <p>${
                  isRTL
                    ? 'نظر شما در مورد محصول بررسی و تأیید شده است. از شما بابت اشتراک تجربه‌تان متشکریم.'
                    : 'Your product review has been approved and is now live. Thank you for sharing your experience!'
                }</p>
                ${
                  data.reviewTitle || data.productTitle
                    ? `
                  <div class="order-details">
                    <h3>${isRTL ? 'جزئیات نظر:' : 'Review Details:'}</h3>
                    ${data.reviewTitle ? `<p><strong>${isRTL ? 'عنوان نظر:' : 'Review Title:'}</strong> ${data.reviewTitle}</p>` : ''}
                    ${data.productTitle ? `<p><strong>${isRTL ? 'محصول:' : 'Product:'}</strong> ${data.productTitle}</p>` : ''}
                  </div>
                `
                    : ''
                }
                <p>${
                  isRTL
                    ? 'نظرات شما به سایر کاربران کمک می‌کند تا انتخاب بهتری داشته باشند.'
                    : 'Your reviews help other customers make informed purchasing decisions.'
                }</p>
              </div>
              <div class="footer">
                <p>${isRTL ? 'با تشکر' : 'Thank you'} | کیارا کرفت - Kiara Kraft</p>
              </div>
            </div>
          </body>
        `,
      };

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

/**
 * Generate push notification content
 */
function generatePushContent(notification: NotificationData): {
  title: string;
  body: string;
  icon: string;
} {
  const { type, data } = notification;
  const locale = data.locale || 'fa';
  const isRTL = locale === 'fa';

  const icon = '/icon-192x192.png';

  switch (type) {
    case 'order_paid':
      return {
        title: isRTL ? '✅ پرداخت تأیید شد' : '✅ Payment Confirmed',
        body: isRTL
          ? `سفارش ${data.orderId || ''} پردازش شد`
          : `Order ${data.orderId || ''} is being processed`,
        icon,
      };

    case 'order_shipped':
      return {
        title: isRTL ? '🚚 سفارش ارسال شد' : '🚚 Order Shipped',
        body: isRTL
          ? `سفارش شما به ${data.trackingNumber ? `کد رهگیری: ${data.trackingNumber}` : 'آدرس شما'} ارسال شد`
          : `Your order has been shipped${data.trackingNumber ? ` (Tracking: ${data.trackingNumber})` : ''}`,
        icon,
      };

    case 'order_delivered':
      return {
        title: isRTL ? '✅ تحویل داده شد' : '✅ Delivered',
        body: isRTL
          ? 'سفارش شما تحویل داده شده است'
          : 'Your order has been delivered',
        icon,
      };

    case 'review_approved':
      return {
        title: isRTL ? '✅ نظر تأیید شد' : '✅ Review Approved',
        body: isRTL
          ? `نظر شما در مورد "${data.productTitle || 'محصول'}" تأیید شد`
          : `Your review of "${data.productTitle || 'product'}" has been approved`,
        icon,
      };

    default:
      return {
        title: isRTL ? 'اعلان جدید' : 'New Notification',
        body: isRTL
          ? 'اعلان جدیدی از کیارا کرفت'
          : 'New notification from Kiara Kraft',
        icon,
      };
  }
}

/**
 * Send notification via all available channels
 */
export async function sendNotification(
  notification: NotificationData,
  channels: NotificationChannel[] = ['email', 'push']
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  // Send via each channel
  for (const channel of channels) {
    let result: NotificationResult;

    try {
      switch (channel) {
        case 'email':
          result = await sendEmailNotification(notification);
          break;
        case 'push':
          result = await sendPushNotification(notification);
          break;
        default:
          result = {
            success: false,
            channel,
            error: `Unknown notification channel: ${channel}`,
          };
      }
    } catch (error) {
      result = {
        success: false,
        channel,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    results.push(result);

    // Log notification attempt
    await prisma.notificationLog.create({
      data: {
        userId: notification.userId,
        type: notification.type,
        channel,
        status: result.success ? 'sent' : 'failed',
        data: notification.data,
        error: result.error || null,
      },
    });
  }

  return results;
}

/**
 * Subscribe user to push notifications
 */
export async function subscribeToPush(
  userId: string,
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to subscribe',
    };
  }
}

/**
 * Unsubscribe user from push notifications
 */
export async function unsubscribeFromPush(
  userId: string,
  endpoint?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (endpoint) {
      await prisma.pushSubscription.delete({
        where: { endpoint },
      });
    } else {
      await prisma.pushSubscription.deleteMany({
        where: { userId },
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unsubscribe',
    };
  }
}

/**
 * Get notification statistics for a user
 */
export async function getUserNotificationStats(userId: string) {
  const stats = await prisma.notificationLog.groupBy({
    by: ['type', 'channel', 'status'],
    where: { userId },
    _count: true,
  });

  return stats.reduce(
    (acc, stat) => {
      const key = `${stat.type}_${stat.channel}_${stat.status}`;
      acc[key] = stat._count;
      return acc;
    },
    {} as Record<string, number>
  );
}

// Export VAPID public key for frontend
export const VAPID_PUBLIC_KEY_CLIENT = VAPID_PUBLIC_KEY;
