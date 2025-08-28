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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

    return NextResponse.json(cartItems);
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
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

      // Check if product exists and is active and not a test product
      // Note: findUnique only accepts unique fields; using findFirst for compound filters
      const product = await prisma.product.findFirst({
        where: { id: productId, active: true, isTest: false },
      });

      if (!product) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      if (product.stock < quantity) {
        return NextResponse.json(
          { error: 'Insufficient stock' },
          { status: 400 }
        );
      }

      // Check if item already in cart
      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: productId,
          },
        },
      });

      if (existingItem) {
        // Update quantity
        const updatedItem = await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + quantity },
          include: {
            product: {
              include: {
                seller: true,
                images: true,
              },
            },
          },
        });
        return NextResponse.json(updatedItem);
      } else {
        // Create new cart item
        const cartItem = await prisma.cartItem.create({
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
        return NextResponse.json(cartItem);
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
