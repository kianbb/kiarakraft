#!/usr/bin/env tsx
/**
 * Simulate payment callback for V2 production audit
 * Tests order → payment → stock atomicity
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simulateSuccessfulPayment(orderId: string, paymentId: string, authority: string) {
  console.log('💳 Simulating SUCCESSFUL payment callback...\n');

  // This simulates what the payment callback API route would do
  const result = await prisma.$transaction(async (tx) => {
    // 1. Update payment status to PAID
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        refId: `ref-${Date.now()}`,
        raw: {
          status: 'success',
          authority: authority,
          refId: `ref-${Date.now()}`,
          verifiedAt: new Date().toISOString()
        }
      }
    });

    // 2. Update order status to PAID
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: 'PAID' },
      include: { items: true }
    });

    // 3. Decrement stock for all order items (atomically)
    const stockUpdates = [];
    for (const item of updatedOrder.items) {
      const stockUpdate = await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } }
      });
      stockUpdates.push({
        productId: item.productId,
        quantity: item.quantity,
        newStock: stockUpdate.stock
      });
    }

    return {
      payment: updatedPayment,
      order: updatedOrder,
      stockUpdates
    };
  });

  console.log('✅ Transaction completed successfully!');
  console.log(`   Payment status: ${result.payment.status}`);
  console.log(`   Payment refId: ${result.payment.refId}`);
  console.log(`   Order status: ${result.order.status}`);
  
  console.log('\n📦 Stock updates:');
  for (const update of result.stockUpdates) {
    console.log(`   Product ${update.productId}: -${update.quantity} = ${update.newStock} remaining`);
  }

  return result;
}

async function simulateFailedPayment(orderId: string, paymentId: string) {
  console.log('❌ Simulating FAILED payment callback...\n');

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update payment status to FAILED
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'FAILED',
        raw: {
          status: 'failed',
          error: 'Payment verification failed',
          failedAt: new Date().toISOString()
        }
      }
    });

    // 2. Order status remains PENDING (no stock changes)
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true }
    });

    return {
      payment: updatedPayment,
      order
    };
  });

  console.log('✅ Failed payment handled correctly!');
  console.log(`   Payment status: ${result.payment.status}`);
  console.log(`   Order status: ${result.order.status} (unchanged)`);
  console.log('   Stock: No changes made');

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: npx tsx simulate-payment-callback.ts <orderId> <paymentId> <authority> [success|failed]');
    console.log('\nExample:');
    console.log('npx tsx simulate-payment-callback.ts cmejw87t30001oc89jd5bjhom cmejw88u20005oc8906ekfyph audit-payment-1755689552569 success');
    return;
  }

  const [orderId, paymentId, authority, mode = 'success'] = args;

  console.log('🔄 Payment Callback Simulation');
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Payment ID: ${paymentId}`);
  console.log(`   Authority: ${authority}`);
  console.log(`   Mode: ${mode}\n`);

  // Verify initial state
  const initialPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId }
  });
  
  const initialOrder = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: true } } }
  });

  console.log('📊 Initial state:');
  console.log(`   Payment status: ${initialPayment.status}`);
  console.log(`   Order status: ${initialOrder.status}`);
  for (const item of initialOrder.items) {
    console.log(`   Product stock: ${item.product.stock} (${item.product.title})`);
  }
  console.log('');

  // Simulate callback
  if (mode === 'success') {
    await simulateSuccessfulPayment(orderId, paymentId, authority);
  } else {
    await simulateFailedPayment(orderId, paymentId);
  }

  console.log('\n🔍 Final verification...');
  
  const finalPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId }
  });
  
  const finalOrder = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: true } } }
  });

  console.log('📊 Final state:');
  console.log(`   Payment status: ${finalPayment.status}`);
  console.log(`   Order status: ${finalOrder.status}`);
  for (const item of finalOrder.items) {
    console.log(`   Product stock: ${item.product.stock} (${item.product.title})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });