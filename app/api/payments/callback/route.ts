import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { adapter } from '@/lib/payments';
import { sendEmail } from '@/lib/email';
import { withRateLimit, paymentRateLimit } from '@/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';
import OrderReceiptEmail from '@/lib/email-templates/OrderReceiptEmail';

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

export const GET = withRateLimit(
  paymentRateLimit,
  async function (request: NextRequest) {
    try {
      const { searchParams } = new URL(request.url);
      const { orderId, authority, status } =
        validateCallbackParams(searchParams);

      // Determine preferred locale from referer path or NEXT_LOCALE cookie; default to 'fa'
      const resolveLocale = async (): Promise<'fa' | 'en'> => {
        try {
          const referer = request.headers.get('referer');
          if (referer) {
            const refUrl = new URL(referer);
            const parts = refUrl.pathname.split('/').filter(Boolean);
            const maybeLocale = parts[0];
            if (maybeLocale === 'fa' || maybeLocale === 'en')
              return maybeLocale;
          }
        } catch {}
        try {
          const c = await cookies();
          const cl = c.get('NEXT_LOCALE')?.value;
          if (cl === 'fa' || cl === 'en') return cl;
        } catch {}
        return 'fa';
      };
      const locale = await resolveLocale();
      const locUrl = (path: string) =>
        new URL(`/${locale}${path}`, request.url);

      // Locate payment by orderId or authority
      type PaymentWithOrder = NonNullable<
        Awaited<ReturnType<typeof prisma.payment.findUnique>>
      > & { order?: { id: string } | null };
      let payment: PaymentWithOrder | null = null;
      if (orderId) {
        payment = await prisma.payment.findUnique({
          where: { orderId },
          include: { order: true },
        });
      } else if (authority) {
        payment = await prisma.payment.findFirst({
          where: { authority },
          include: { order: true },
        });
      }

      if (!payment) {
        console.warn(
          `Payment not found for orderId: ${orderId}, authority: ${authority}`
        );
        return NextResponse.redirect(
          locUrl('//order/failed?reason=payment_not_found')
        );
      }

      // Idempotency guard
      if (payment.status === 'PAID') {
        return NextResponse.redirect(
          locUrl(`/order/success?orderId=${payment.orderId}`)
        );
      }

      // Authority mismatch guard
      if (authority && payment.authority && payment.authority !== authority) {
        console.warn(`Authority mismatch for payment: ${payment.id}`);
        return NextResponse.redirect(
          new URL('/order/failed?reason=authority_mismatch', request.url)
        );
      }

      // Verify with gateway adapter
      const verifyResult = await adapter.verify({
        orderId: payment.orderId,
        authority: authority || payment.authority || undefined,
      });

      if (verifyResult.ok) {
        try {
          await prisma.$transaction(
            async tx => {
              // Lock payment row in this transaction
              await tx.$queryRaw`SELECT id, status FROM "Payment" WHERE id = ${payment!.id} FOR UPDATE`;

              const fresh = await tx.payment.findUnique({
                where: { id: payment!.id },
              });
              if (!fresh) throw new Error('Payment not found');
              if (fresh.status === 'PAID') throw new Error('already processed');
              if (fresh.status !== 'INITIATED' && fresh.status !== 'PENDING') {
                throw new Error('Payment in invalid state for verification');
              }

              // Update payment
              await tx.payment.update({
                where: { id: payment!.id },
                data: {
                  status: 'PAID',
                  refId: verifyResult.refId ?? null,
                  raw: { authority, status, verifiedAt: new Date() },
                },
              });

              // Update order
              await tx.order.update({
                where: { id: payment!.orderId },
                data: { status: 'PAID' },
              });

              // Decrement stock atomically for all order items
              const items = await tx.orderItem.findMany({
                where: { orderId: payment!.orderId },
              });
              for (const item of items) {
                const updated: unknown =
                  await tx.$executeRaw`UPDATE "Product" SET stock = stock - ${item.quantity} WHERE id = ${item.productId} AND stock >= ${item.quantity}`;
                if (Number(updated) === 0) {
                  throw new Error('Insufficient stock while finalizing order');
                }
              }
            },
            { isolationLevel: 'Serializable' }
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes('already processed')
          ) {
            return NextResponse.redirect(
              new URL(`/order/success?orderId=${payment.orderId}`, request.url)
            );
          }
          throw error;
        }

        // Async email (best-effort)
        setImmediate(async () => {
          try {
            const completeOrder = await prisma.order.findUnique({
              where: { id: payment!.orderId },
              include: {
                user: { select: { email: true, name: true } },
                address: true,
                items: { include: { product: { select: { title: true } } } },
              },
            });

            if (completeOrder && completeOrder.user.email) {
              const orderItems = completeOrder.items.map(item => ({
                productTitle: item.product.title,
                quantity: item.quantity,
                unitPriceToman: item.unitPriceToman,
              }));

              const shippingAddress = {
                fullName: completeOrder.address.fullName,
                address1: completeOrder.address.line1,
                address2: completeOrder.address.line2 || undefined,
                city: completeOrder.address.city,
                province: completeOrder.address.province,
                postalCode: completeOrder.address.postal || '',
                phone: completeOrder.address.phone,
              };

              const paymentMethodName =
                payment!.gateway === 'OFFLINE'
                  ? 'پرداخت آفلاین / Offline Payment'
                  : payment!.gateway === 'ZARINPAL'
                    ? 'درگاه زرین‌پال / Zarinpal Gateway'
                    : 'پرداخت آنلاین / Online Payment';

              await sendEmail({
                to: completeOrder.user.email,
                subject: `رسید سفارش ${payment!.orderId} - کیارا کرافت / Order Receipt ${payment!.orderId} - Kiara Kraft`,
                react: OrderReceiptEmail({
                  userName:
                    completeOrder.user.name ||
                    completeOrder.user.email.split('@')[0],
                  orderId: payment!.orderId,
                  items: orderItems,
                  totalToman: completeOrder.totalToman,
                  shippingAddress,
                  paymentMethod: paymentMethodName,
                  locale: 'fa',
                }),
              });
            }
          } catch (emailError) {
            Sentry.captureException(emailError);
            console.error('Error sending order receipt email:', emailError);
          }
        });

        return NextResponse.redirect(
          locUrl(`/order/success?orderId=${payment.orderId}`)
        );
      } else {
        // Not verified
        const isManual = verifyResult.reason === 'manual';
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: isManual ? 'PENDING' : 'FAILED',
            raw: {
              authority,
              status,
              reason: verifyResult.reason,
              updatedAt: new Date(),
            },
          },
        });
        const reasonParam = isManual
          ? 'manual'
          : verifyResult.reason || 'verification_failed';
        return NextResponse.redirect(
          locUrl(
            `/order/failed?orderId=${payment.orderId}&reason=${reasonParam}`
          )
        );
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error processing payment callback:', error);
      const safeReason =
        error instanceof Error && error.message.includes('Invalid')
          ? 'invalid_parameters'
          : 'callback_error';
      const locale = 'fa'; // Fallback on unexpected errors
      return NextResponse.redirect(
        new URL(`/${locale}/order/failed?reason=${safeReason}`, request.url)
      );
    }
  }
);
