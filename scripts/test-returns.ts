import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestOrderForReturns() {
  console.log('🧪 Creating test order for returns verification...');

  try {
    // Find demo buyer
    const buyer = await prisma.user.findUnique({
      where: { email: 'buyer@example.com' },
    });

    if (!buyer) {
      throw new Error('Demo buyer not found. Run seed first.');
    }

    // Find or create a test address
    let address = await prisma.address.findFirst({
      where: {
        userId: buyer.id,
        isDefault: true,
      },
    });

    if (!address) {
      address = await prisma.address.create({
        data: {
          userId: buyer.id,
          fullName: 'Demo Buyer',
          phone: '+98 912 345 6789',
          country: 'Iran',
          province: 'Tehran',
          city: 'Tehran',
          line1: '123 Test Street',
          postal: '1234567890',
          isDefault: true,
        },
      });
    }

    // Find some products to order
    const products = await prisma.product.findMany({
      where: {
        active: true,
        isTest: false,
        stock: { gt: 0 },
      },
      take: 2,
    });

    if (products.length === 0) {
      throw new Error('No products found. Run seed first.');
    }

    const totalAmount = products.reduce((sum, p) => sum + p.priceToman, 0);

    // Create order
    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        addressId: address.id,
        status: 'PAID',
        totalToman: totalAmount + 50000, // Add shipping
        items: {
          create: products.map(product => ({
            productId: product.id,
            unitPriceToman: product.priceToman,
            quantity: 1,
          })),
        },
        payment: {
          create: {
            gateway: 'OFFLINE',
            status: 'PAID',
            amountToman: totalAmount + 50000,
            raw: {
              testOrder: true,
              paidAt: new Date().toISOString(),
            },
          },
        },
        shipping: {
          create: {
            method: 'STANDARD',
            priceToman: 50000,
            status: 'DELIVERED',
            trackingNo: 'TEST12345',
          },
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        payment: true,
        shipping: true,
      },
    });

    console.log('✅ Test order created:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Items: ${order.items.length}`);
    console.log(`   Total: ${order.totalToman} Toman`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Payment: ${order.payment?.status}`);
    console.log(`   Shipping: ${order.shipping?.status}`);

    return {
      orderId: order.id,
      orderItems: order.items,
      buyerId: buyer.id,
    };
  } catch (error) {
    console.error('❌ Failed to create test order:', error);
    throw error;
  }
}

async function testReturnsAPI() {
  console.log('🔌 Testing Returns API...');

  try {
    const testOrder = await createTestOrderForReturns();

    console.log('\n📋 Test Data Summary:');
    console.log(`   Order ID: ${testOrder.orderId}`);
    console.log(`   Buyer ID: ${testOrder.buyerId}`);
    console.log(
      `   Items available for return: ${testOrder.orderItems.length}`
    );

    testOrder.orderItems.forEach((item, index) => {
      console.log(
        `   Item ${index + 1}: ${item.product.title} (${item.unitPriceToman} Toman)`
      );
    });

    console.log('\n✅ Test data ready for returns verification!');
    console.log('\nNext steps:');
    console.log('1. Start development server: npm run dev');
    console.log('2. Visit: /fa/account/orders/' + testOrder.orderId);
    console.log('3. Click "Request Return" button');
    console.log('4. Test the return flow');
    console.log('5. Check admin panel: /fa/admin/returns');

    return testOrder;
  } catch (error) {
    console.error('❌ Test setup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  testReturnsAPI().catch(console.error);
}

export { testReturnsAPI, createTestOrderForReturns };
