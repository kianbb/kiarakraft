import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, orderRateLimit } from '@/lib/rateLimit';
import { withCSRF } from '@/lib/csrf';
import { collectPreflightIssues } from '@/lib/orderPreflight';

export const POST = withRateLimit(
  orderRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await auth();

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const { addressId, shippingMethod, shippingPrice } = await request.json();

      // Basic validation
      if (!addressId || !shippingMethod || shippingPrice === undefined) {
        return NextResponse.json(
          {
            error:
              'Missing required fields: addressId, shippingMethod, or shippingPrice',
          },
          { status: 400 }
        );
      }

      // Validate address belongs to user
      const address = await prisma.address.findFirst({
        where: { id: addressId, userId: user.id },
      });

      if (!address) {
        return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
      }

      // Validate shipping method
      const validShippingMethods = ['STANDARD', 'EXPRESS', 'PICKUP'];
      if (!validShippingMethods.includes(shippingMethod)) {
        return NextResponse.json(
          { error: 'Invalid shipping method' },
          { status: 400 }
        );
      }

      // Get cart items with proper typing
      const cart = await prisma.cart.findUnique({
        where: { userId: user.id },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
      }

      const cartItems = cart.items;

      // Preflight: collect any issues (inactive or insufficient stock)
      const preflightIssues = collectPreflightIssues(
        cartItems.map(it => ({
          productId: it.productId,
          quantity: it.quantity,
          product: {
            title: it.product.title,
            stock: it.product.stock,
            active: it.product.active,
          },
        }))
      );

      if (preflightIssues.length > 0) {
        return NextResponse.json(
          { error: 'insufficient_stock', details: preflightIssues },
          { status: 409 }
        );
      }

      // Calculate totals using correct price field
      const subtotal = cartItems.reduce((total, item) => {
        return total + item.product.priceToman * item.quantity;
      }, 0);

      const total = subtotal + shippingPrice;

      // Create order in a transaction without decrementing stock yet.
      // Stock is decremented only upon successful payment (gateway callback or admin mark-paid),
      // which prevents double-decrement and keeps inventory consistent on failed payments.
      const order = await prisma.$transaction(async tx => {
        // Create order
        const newOrder = await tx.order.create({
          data: {
            userId: user.id,
            addressId: addressId,
            status: 'PENDING',
            totalToman: total,
          },
        });

        // Create shipping record
        await tx.orderShipping.create({
          data: {
            orderId: newOrder.id,
            method: shippingMethod as 'STANDARD' | 'EXPRESS' | 'PICKUP',
            priceToman: shippingPrice,
            status: 'PROCESSING',
          },
        });

        // Create order items
        for (const item of cartItems) {
          await tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPriceToman: item.product.priceToman,
            },
          });
        }

        // Clear cart
        await tx.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        return newOrder;
      });

      return NextResponse.json(order);
    } catch (error) {
      console.error('Error creating order:', error);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }
  })
);
