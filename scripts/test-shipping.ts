import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createShippingTestData() {
  console.log('🚚 Creating shipping test data...');

  try {
    // Find existing user and products
    const user = await prisma.user.findFirst({
      where: { role: 'BUYER' },
    });

    if (!user) {
      console.log('❌ No buyer user found. Please run seed first.');
      return;
    }

    // Find existing products
    const products = await prisma.product.findMany({
      where: { active: true },
      take: 2,
    });

    if (products.length === 0) {
      console.log('❌ No products found. Please run seed first.');
      return;
    }

    // Find or create address for user
    let address = await prisma.address.findFirst({
      where: { userId: user.id },
    });

    if (!address) {
      address = await prisma.address.create({
        data: {
          userId: user.id,
          fullName: 'Test Customer',
          line1: '123 Test Street',
          line2: 'Apt 4B',
          city: 'Tehran',
          province: 'Tehran',
          country: 'Iran',
          postal: '12345',
          phone: '09123456789',
          isDefault: true,
        },
      });
      console.log('📍 Created test address');
    }

    // Create test orders with different shipping statuses
    const testOrders = [
      {
        status: 'PROCESSING',
        shippingMethod: 'STANDARD' as const,
        shippingStatus: 'PROCESSING',
      },
      {
        status: 'PROCESSING',
        shippingMethod: 'EXPRESS' as const,
        shippingStatus: 'SHIPPED',
      },
      {
        status: 'COMPLETED',
        shippingMethod: 'PICKUP' as const,
        shippingStatus: 'DELIVERED',
      },
    ];

    for (let i = 0; i < testOrders.length; i++) {
      const testOrder = testOrders[i];
      const product = products[i % products.length];

      // Create order
      const order = await prisma.order.create({
        data: {
          userId: user.id,
          addressId: address.id,
          status: testOrder.status,
          totalToman:
            product.priceToman +
            (testOrder.shippingMethod === 'STANDARD'
              ? 50000
              : testOrder.shippingMethod === 'EXPRESS'
                ? 120000
                : 0),
          items: {
            create: [
              {
                productId: product.id,
                quantity: 1,
                unitPriceToman: product.priceToman,
              },
            ],
          },
        },
      });

      // Create shipping record
      const shippingPriceToman =
        testOrder.shippingMethod === 'STANDARD'
          ? 50000
          : testOrder.shippingMethod === 'EXPRESS'
            ? 120000
            : 0;

      await prisma.orderShipping.create({
        data: {
          orderId: order.id,
          method: testOrder.shippingMethod,
          priceToman: shippingPriceToman,
          status: testOrder.shippingStatus,
          trackingNo:
            testOrder.shippingStatus !== 'PROCESSING'
              ? `TRK${Date.now()}${i}`
              : null,
          history: {
            events: [
              {
                status: 'PROCESSING',
                timestamp: new Date(Date.now() - 86400000), // 1 day ago
                updatedBy: 'system',
              },
              ...(testOrder.shippingStatus === 'SHIPPED' ||
              testOrder.shippingStatus === 'DELIVERED'
                ? [
                    {
                      status: 'SHIPPED',
                      timestamp: new Date(Date.now() - 43200000), // 12 hours ago
                      updatedBy: 'admin@example.com',
                      trackingNo: `TRK${Date.now()}${i}`,
                    },
                  ]
                : []),
              ...(testOrder.shippingStatus === 'DELIVERED'
                ? [
                    {
                      status: 'DELIVERED',
                      timestamp: new Date(), // now
                      updatedBy: 'system',
                      notes: 'Package delivered successfully',
                    },
                  ]
                : []),
            ],
          },
        },
      });

      console.log(
        `✅ Created test order ${order.id} with ${testOrder.shippingMethod} shipping (${testOrder.shippingStatus})`
      );
    }

    console.log('🎉 Shipping test data created successfully!');
    console.log('');
    console.log('Test scenarios created:');
    console.log('1. Standard shipping - Processing');
    console.log('2. Express shipping - Shipped (with tracking)');
    console.log('3. Pickup - Delivered');
    console.log('');
    console.log('You can now test:');
    console.log('- Order tracking pages for buyers');
    console.log('- Admin shipping management functionality');
    console.log('- Different shipping status workflows');
  } catch (error) {
    console.error('❌ Error creating shipping test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createShippingTestData();
