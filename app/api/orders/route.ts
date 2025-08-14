import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { shippingInfo } = await request.json();

    // Get cart items with proper typing
    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!cart || cart.items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const cartItems = cart.items;

    // Critical: Validate stock availability before processing
    for (const item of cartItems) {
      if (item.product.stock < item.quantity) {
        return NextResponse.json({ 
          error: `Insufficient stock for ${item.product.title}. Available: ${item.product.stock}, Requested: ${item.quantity}` 
        }, { status: 400 });
      }
      if (!item.product.active) {
        return NextResponse.json({ 
          error: `Product ${item.product.title} is no longer available` 
        }, { status: 400 });
      }
    }

    // Calculate totals using correct price field
    const subtotal = cartItems.reduce((total, item) => {
      return total + (item.product.priceToman * item.quantity);
    }, 0);
    
    const shippingCost = 50000; // Fixed shipping
    const total = subtotal + shippingCost;

    // Create order in transaction with stock reduction
    const order = await prisma.$transaction(async (tx) => {
      // Double-check stock in transaction to prevent race conditions
      for (const item of cartItems) {
        const currentProduct = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stock: true, active: true, title: true }
        });
        
        if (!currentProduct || currentProduct.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${currentProduct?.title || 'product'}`);
        }
        
        if (!currentProduct.active) {
          throw new Error(`Product ${currentProduct.title} is no longer available`);
        }
      }

      // Create order
      const newOrder = await tx.order.create({
        data: {
          userId: user.id,
          status: 'PENDING',
          totalToman: total,
          fullName: shippingInfo.fullName,
          phone: shippingInfo.phone,
          address1: shippingInfo.address1,
          address2: shippingInfo.address2 || null,
          city: shippingInfo.city,
          province: shippingInfo.province,
          postalCode: shippingInfo.postalCode
        }
      });

      // Create order items and reduce stock
      for (const item of cartItems) {
        // Create order item
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceToman: item.product.priceToman
          }
        });
        
        // Reduce product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });
      }


      // Clear cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id }
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
}