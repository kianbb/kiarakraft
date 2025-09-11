import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withCSRF } from '@/lib/csrf';
import { withRateLimit, cartRateLimit } from '@/lib/rateLimit';
import * as Sentry from '@sentry/nextjs';

export const GET = withRateLimit(cartRateLimit, async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Attach user context for observability
    Sentry.setUser({ email: session.user.email });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get or create cart for user
    let cart = await prisma.cart.findUnique({
      where: { userId: user.id },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: user.id },
      });
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { cart: { userId: user.id } },
      include: {
        product: {
          include: {
            seller: true,
            images: true,
          },
        },
      },
    });

    // Filter out products that are no longer eligible
    const eligibleCartItems = cartItems.filter(
      item =>
        item.product.active &&
        !item.product.isTest &&
        item.product.eligibilityStatus === 'APPROVED'
    );

    return NextResponse.json(eligibleCartItems);
  } catch (error) {
    console.error('Error fetching cart:', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch cart' },
      { status: 500 }
    );
  }
});

export const POST = withRateLimit(
  cartRateLimit,
  withCSRF(async function (request: NextRequest) {
    try {
      const session = await auth();

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Attach user context for observability
      Sentry.setUser({ email: session.user.email });

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      // Get or create cart for user
      let cart = await prisma.cart.findUnique({
        where: { userId: user.id },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId: user.id },
        });
      }

      const { productId, quantity } = await request.json();

      // Input validation and bounds checking
      if (
        !productId ||
        typeof productId !== 'string' ||
        productId.length > 50
      ) {
        return NextResponse.json(
          { error: 'Invalid product ID' },
          { status: 400 }
        );
      }

      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
        return NextResponse.json(
          { error: 'Invalid quantity. Must be between 1 and 1000.' },
          { status: 400 }
        );
      }

      // Check if product exists and is active, approved, and not a test product
      // Note: findUnique only accepts unique fields; using findFirst for compound filters
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          active: true,
          isTest: false,
          eligibilityStatus: 'APPROVED', // Only allow approved products in cart
        },
      });

      if (!product) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      if (product.stock < quantity) {
        return NextResponse.json(
          { error: 'Insufficient stock' },
          { status: 400 }
        );
      }

      // Use transaction to prevent race conditions
      try {
        const cartItem = await prisma.$transaction(async tx => {
          // Check cart item limit to prevent resource exhaustion
          const cartItemCount = await tx.cartItem.count({
            where: { cartId: cart.id },
          });

          const MAX_CART_ITEMS = 50;
          if (cartItemCount >= MAX_CART_ITEMS) {
            throw new Error(
              `Maximum of ${MAX_CART_ITEMS} items allowed in cart`
            );
          }

          // Check current stock with row lock
          const currentProduct = await tx.product.findUnique({
            where: { id: productId },
          });

          if (!currentProduct || currentProduct.stock < quantity) {
            throw new Error('Insufficient stock');
          }

          // Check if item already in cart
          const existingItem = await tx.cartItem.findUnique({
            where: {
              cartId_productId: {
                cartId: cart.id,
                productId: productId,
              },
            },
          });

          if (existingItem) {
            // Check if new total quantity exceeds stock
            const newQuantity = existingItem.quantity + quantity;
            if (newQuantity > currentProduct.stock) {
              throw new Error('Insufficient stock for requested quantity');
            }

            // Update quantity
            return await tx.cartItem.update({
              where: { id: existingItem.id },
              data: { quantity: newQuantity },
              include: {
                product: {
                  include: {
                    seller: true,
                    images: true,
                  },
                },
              },
            });
          } else {
            // Create new cart item
            return await tx.cartItem.create({
              data: {
                cartId: cart.id,
                productId: productId,
                quantity: quantity,
              },
              include: {
                product: {
                  include: {
                    seller: true,
                    images: true,
                  },
                },
              },
            });
          }
        });

        return NextResponse.json(cartItem);
      } catch (error) {
        if (error instanceof Error && error.message.includes('stock')) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      Sentry.captureException(error);
      return NextResponse.json(
        { error: 'Failed to add to cart' },
        { status: 500 }
      );
    }
  })
);
