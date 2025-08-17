import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adapter } from '@/lib/payments';
import { headers } from 'next/headers';
import { sendEmail } from '@/lib/email';
import OrderReceiptEmail from '@/lib/email-templates/OrderReceiptEmail';

// Rate limiting map (in production, use Redis or external service)
const attemptMap = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempts = attemptMap.get(ip);
  
  if (!attempts) {
    attemptMap.set(ip, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Reset if window expired
  if (now - attempts.lastAttempt > WINDOW_MS) {
    attemptMap.set(ip, { count: 1, lastAttempt: now });
    return true;
  }
  
  if (attempts.count >= MAX_ATTEMPTS) {
    return false;
  }
  
  attempts.count++;
  attempts.lastAttempt = now;
  return true;
}

function validateCallbackParams(searchParams: URLSearchParams) {
  const orderId = searchParams.get('orderId');
  const authority = searchParams.get('Authority');
  const status = searchParams.get('Status');
  
  // Basic validation
  if (!orderId && !authority) {
    throw new Error('Missing required parameters');
  }
  
  if (orderId && !/^[a-zA-Z0-9]+$/.test(orderId)) {
    throw new Error('Invalid orderId format');
  }
  
  if (authority && !/^[a-zA-Z0-9\-]+$/.test(authority)) {
    throw new Error('Invalid authority format');
  }
  
  return { orderId, authority, status };
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    
    if (!checkRateLimit(ip)) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return NextResponse.redirect(new URL('/order/failed?reason=rate_limit', request.url));
    }

    // Validate and sanitize parameters
    const { searchParams } = new URL(request.url);
    const { orderId, authority, status } = validateCallbackParams(searchParams);

    // Find payment record with additional security checks
    let payment;
    if (orderId) {
      payment = await prisma.payment.findUnique({
        where: { orderId },
        include: { order: true }
      });
    } else if (authority) {
      payment = await prisma.payment.findFirst({
        where: { authority },
        include: { order: true }
      });
    }

    if (!payment) {
      console.warn(`Payment not found for orderId: ${orderId}, authority: ${authority}`);
      return NextResponse.redirect(new URL('/order/failed?reason=payment_not_found', request.url));
    }

    // Security check: prevent double processing
    if (payment.status === 'PAID') {
      console.warn(`Attempt to reprocess paid payment: ${payment.id}`);
      return NextResponse.redirect(new URL(`/order/success?orderId=${payment.orderId}`, request.url));
    }

    // Security check: verify payment belongs to the same authority
    if (authority && payment.authority && payment.authority !== authority) {
      console.warn(`Authority mismatch for payment: ${payment.id}`);
      return NextResponse.redirect(new URL('/order/failed?reason=authority_mismatch', request.url));
    }

    // Verify payment with adapter
    const verifyResult = await adapter.verify({
      orderId: payment.orderId,
      authority: authority || payment.authority || undefined
    });

    if (verifyResult.ok) {
      // Payment successful - update records in transaction with proper locking
      try {
        await prisma.$transaction(async (tx) => {
          // Use SELECT FOR UPDATE to prevent race conditions
          const currentPayment = await tx.$queryRaw`
            SELECT status FROM "Payment" WHERE id = ${payment.id} FOR UPDATE
          ` as Array<{ status: string }>;
          
          if (currentPayment[0]?.status === 'PAID') {
            throw new Error('Payment already processed');
          }
          
          if (currentPayment[0]?.status !== 'INITIATED' && currentPayment[0]?.status !== 'PENDING') {
            throw new Error('Payment in invalid state for verification');
          }

          // Update payment status atomically
          await tx.payment.update({
            where: { 
              id: payment.id,
              status: { in: ['INITIATED', 'PENDING'] } // Only update if still in valid state
            },
            data: {
              status: 'PAID',
              refId: verifyResult.refId || null,
              raw: { 
                authority, 
                status, 
                verifiedAt: new Date(),
                ip: ip.slice(0, 45), // Truncate IP for logging
                userAgent: headersList.get('user-agent')?.slice(0, 200)
              }
            }
          });

          // Update order status
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: 'PAID' }
          });

          // Decrement stock atomically for all ordered items
          const orderItems = await tx.orderItem.findMany({
            where: { orderId: payment.orderId },
            include: { product: true }
          });

          for (const item of orderItems) {
            await tx.product.update({
              where: { 
                id: item.productId,
                stock: { gte: item.quantity } // Prevent negative stock
              },
              data: {
                stock: { decrement: item.quantity }
              }
            });
          }
        }, {
          isolationLevel: 'Serializable' // Highest isolation level
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('already processed')) {
          // Payment was already processed, redirect to success anyway
          return NextResponse.redirect(new URL(`/order/success?orderId=${payment.orderId}`, request.url));
        }
        throw error;
      }

      console.log(`Payment verified successfully: ${payment.id}`);
      
      // Send order receipt email asynchronously (don't block the redirect)
      setImmediate(async () => {
        try {
          // Fetch complete order details for email
          const completeOrder = await prisma.order.findUnique({
            where: { id: payment.orderId },
            include: {
              user: {
                select: { email: true, name: true }
              },
              items: {
                include: {
                  product: {
                    select: { title: true }
                  }
                }
              }
            }
          });

          if (completeOrder && completeOrder.user.email) {
            const orderItems = completeOrder.items.map(item => ({
              productTitle: item.product.title,
              quantity: item.quantity,
              unitPriceToman: item.unitPriceToman
            }));

            const shippingAddress = {
              fullName: completeOrder.fullName,
              address1: completeOrder.address1,
              address2: completeOrder.address2 || undefined,
              city: completeOrder.city,
              province: completeOrder.province,
              postalCode: completeOrder.postalCode,
              phone: completeOrder.phone
            };

            // Determine payment method name
            const paymentMethodName = payment.gateway === 'OFFLINE' 
              ? 'پرداخت آفلاین / Offline Payment'
              : payment.gateway === 'ZARINPAL'
              ? 'درگاه زرین‌پال / Zarinpal Gateway'
              : 'پرداخت آنلاین / Online Payment';

            // Send email receipt (try both locales if needed)
            const emailResult = await sendEmail({
              to: completeOrder.user.email,
              subject: `رسید سفارش ${payment.orderId} - کیارا کرافت / Order Receipt ${payment.orderId} - Kiara Kraft`,
              react: OrderReceiptEmail({
                userName: completeOrder.user.name || completeOrder.user.email.split('@')[0],
                orderId: payment.orderId,
                items: orderItems,
                totalToman: completeOrder.totalToman,
                shippingAddress,
                paymentMethod: paymentMethodName,
                locale: 'fa' // Default to Persian, could be enhanced to detect user's preferred locale
              })
            });

            if (emailResult.success) {
              console.log(`Order receipt email sent to ${completeOrder.user.email} via ${emailResult.provider}`);
            } else {
              console.error(`Failed to send order receipt email: ${emailResult.error}`);
            }
          }
        } catch (emailError) {
          console.error('Error sending order receipt email:', emailError);
        }
      });
      
      return NextResponse.redirect(new URL(`/order/success?orderId=${payment.orderId}`, request.url));
    } else {
      // Payment failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          raw: { 
            authority, 
            status, 
            reason: verifyResult.reason, 
            failedAt: new Date(),
            ip: ip.slice(0, 45)
          }
        }
      });

      console.warn(`Payment verification failed: ${payment.id}, reason: ${verifyResult.reason}`);
      return NextResponse.redirect(new URL(`/order/failed?orderId=${payment.orderId}&reason=${verifyResult.reason || 'verification_failed'}`, request.url));
    }
  } catch (error) {
    console.error('Error processing payment callback:', error);
    
    // Don't expose internal error details
    const safeReason = error instanceof Error && error.message.includes('Invalid') 
      ? 'invalid_parameters' 
      : 'callback_error';
      
    return NextResponse.redirect(new URL(`/order/failed?reason=${safeReason}`, request.url));
  }
}