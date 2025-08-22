#!/usr/bin/env tsx
/**
 * Simulate checkout flow for V2 production audit
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🛒 Simulating checkout flow...\n');

  // Get test user and product
  const testUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'audit-test@kiarakraft.com' },
  });

  const testProduct = await prisma.product.findUniqueOrThrow({
    where: { slug: 'audit-test-product' },
  });

  console.log(`✅ Found test user: ${testUser.email} (${testUser.id})`);
  console.log(
    `✅ Found test product: ${testProduct.title} (Stock: ${testProduct.stock})\n`
  );

  // Step 1: Create an address first
  const address = await prisma.address.create({
    data: {
      userId: testUser.id,
      fullName: 'Audit Test User',
      phone: '+98-912-345-6789',
      country: 'IR',
      province: 'Tehran',
      city: 'Tehran',
      line1: 'Test Address, District 1',
      postal: '12345',
      isDefault: true,
    },
  });

  // Step 2: Create a PENDING order with the address
  const order = await prisma.order.create({
    data: {
      userId: testUser.id,
      addressId: address.id,
      status: 'PENDING',
      totalToman: testProduct.priceToman * 2, // Order 2 items
      items: {
        create: [
          {
            productId: testProduct.id,
            quantity: 2,
            unitPriceToman: testProduct.priceToman,
          },
        ],
      },
      shipping: {
        create: {
          method: 'STANDARD',
          priceToman: 50000,
          status: 'PROCESSING',
        },
      },
    },
    include: {
      items: true,
      address: true,
      shipping: true,
    },
  });

  console.log(`🔸 Created PENDING order:`);
  console.log(`   Order ID: ${order.id}`);
  console.log(`   Status: ${order.status}`);
  console.log(`   Total: ${order.totalToman} TMN`);
  console.log(
    `   Items: ${order.items.length} (${order.items[0].quantity}x ${testProduct.title})\n`
  );

  // Step 2: Simulate calling /api/payments/create
  console.log('🔸 Simulating /api/payments/create call...');

  // Mock the payment creation process
  const mockPaymentId = `audit-payment-${Date.now()}`;
  const mockRedirectUrl = `http://localhost:3000/mock-gateway?payment=${mockPaymentId}&order=${order.id}`;

  console.log(`   Generated payment ID: ${mockPaymentId}`);
  console.log(`   Mock redirect URL: ${mockRedirectUrl}\n`);

  // Step 3: Create payment record (simulating what the API would do)
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      gateway: 'OFFLINE',
      status: 'INITIATED',
      amountToman: order.totalToman,
      authority: mockPaymentId,
      raw: {
        gateway: 'OFFLINE',
        mockPayment: true,
        redirectUrl: mockRedirectUrl,
      },
    },
  });

  console.log(`🔸 Created payment record:`);
  console.log(`   Payment ID: ${payment.id}`);
  console.log(`   Payment Authority: ${payment.authority}`);
  console.log(`   Status: ${payment.status}`);
  console.log(`   Amount: ${payment.amountToman} TMN\n`);

  // Step 4: Check initial stock
  const productBeforePayment = await prisma.product.findUniqueOrThrow({
    where: { id: testProduct.id },
  });

  console.log(`🔸 Stock before payment: ${productBeforePayment.stock}`);

  console.log('\n📦 Ready for payment callback simulation!');
  console.log('Data created:');
  console.log(`   Order ID: ${order.id}`);
  console.log(`   Payment ID: ${payment.id}`);
  console.log(`   Payment Authority: ${payment.authority}`);
  console.log(`   Product Stock: ${productBeforePayment.stock}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
