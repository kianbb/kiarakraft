import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRateLimit, orderRateLimit } from '@/lib/rateLimit';
import { withCSRF } from '@/lib/csrf';

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
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

      // Validate addressId format and length
      if (typeof addressId !== 'string' || addressId.length > 50) {
        return NextResponse.json(
          { error: 'Invalid address ID' },
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

      // Validate shipping price (prevent negative values)
      if (
        typeof shippingPrice !== 'number' ||
        shippingPrice < 0 ||
        shippingPrice > 1000000
      ) {
        return NextResponse.json(
          { error: 'Invalid shipping price' },
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

      // Create order in a transaction with stock validation and price verification
      const order = await prisma.$transaction(async tx => {
        // Lock and verify products with current prices
        const currentProducts = await Promise.all(
          cartItems.map(async item => {
            // Use raw query to lock the product row
            const products = await tx.$queryRaw<
              Array<{
                id: string;
                priceToman: number;
                stock: number;
                active: boolean;
                title: string;
              }>
            >`
              SELECT id, "priceToman", stock, active, title
              FROM "Product"
              WHERE id = ${item.productId}
              FOR UPDATE
            `;

            return products[0];
          })
        );

        // Validate all products exist and are available
        const validationIssues: string[] = [];
        for (let i = 0; i < cartItems.length; i++) {
          const item = cartItems[i];
          const product = currentProducts[i];

          if (!product) {
            validationIssues.push(`Product ${item.productId} not found`);
            continue;
          }

          if (!product.active) {
            validationIssues.push(`Product ${product.title} is not available`);
          }

          if (product.stock < item.quantity) {
            validationIssues.push(`Insufficient stock for ${product.title}`);
          }
        }

        if (validationIssues.length > 0) {
          throw new Error(
            JSON.stringify({
              type: 'validation',
              issues: validationIssues,
            })
          );
        }

        // Calculate totals using CURRENT prices from database
        const subtotal = cartItems.reduce((total, item, index) => {
          const currentPrice = currentProducts[index].priceToman;
          return total + currentPrice * item.quantity;
        }, 0);

        const total = subtotal + shippingPrice;

        // Validate total amount (prevent overflow and unrealistic amounts)
        if (!Number.isFinite(total) || total <= 0 || total > 1000000000) {
          throw new Error(
            JSON.stringify({
              type: 'invalid_total',
            })
          );
        }
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

        // Create order items with current prices
        for (let i = 0; i < cartItems.length; i++) {
          const item = cartItems[i];
          const currentProduct = currentProducts[i];

          await tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPriceToman: currentProduct.priceToman, // Use current price from database
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
      // Handle custom validation errors
      if (error instanceof Error && error.message.startsWith('{')) {
        try {
          const errorData = JSON.parse(error.message);
          if (errorData.type === 'validation') {
            return NextResponse.json(
              { error: 'Stock validation failed', details: errorData.issues },
              { status: 409 }
            );
          } else if (errorData.type === 'invalid_total') {
            return NextResponse.json(
              { error: 'Invalid order total' },
              { status: 400 }
            );
          }
        } catch {}
      }

      console.error('Error creating order:', error);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }
  })
);
