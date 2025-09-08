import { prisma } from '../lib/prisma';

async function checkSellerProducts() {
  // Find the seller by email (you can change this to your email)
  const userEmail = 'seller@example.com'; // Change this to the actual seller email

  console.log(`Checking products for seller: ${userEmail}`);

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: {
      sellerProfile: {
        include: {
          products: {
            select: {
              id: true,
              title: true,
              sellerId: true,
              active: true,
              eligibilityStatus: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  if (!user.sellerProfile) {
    console.log('User does not have a seller profile');
    return;
  }

  console.log('\nUser details:');
  console.log('- User ID:', user.id);
  console.log('- Email:', user.email);
  console.log('- Role:', user.role);
  console.log('- Seller Profile ID:', user.sellerProfile.id);
  console.log('- Seller Verified:', user.sellerProfile.verified);

  console.log('\nProducts for this seller:');
  if (user.sellerProfile.products.length === 0) {
    console.log('No products found');
  } else {
    user.sellerProfile.products.forEach(product => {
      console.log(`\nProduct: ${product.title}`);
      console.log('- ID:', product.id);
      console.log('- Seller ID:', product.sellerId);
      console.log('- Active:', product.active);
      console.log('- Eligibility:', product.eligibilityStatus);
      console.log(
        '- Matches seller profile?',
        product.sellerId === user.sellerProfile?.id
      );
    });
  }

  // Also check if there are any products with the user ID as sellerId
  console.log('\n\nChecking for products with user.id as sellerId...');
  const productsWithUserId = await prisma.product.findMany({
    where: { sellerId: user.id },
    select: {
      id: true,
      title: true,
      sellerId: true,
    },
  });

  if (productsWithUserId.length > 0) {
    console.log(
      `Found ${productsWithUserId.length} products with user.id as sellerId!`
    );
    productsWithUserId.forEach(p => {
      console.log(`- ${p.title} (${p.id})`);
    });
  } else {
    console.log('No products found with user.id as sellerId');
  }
}

checkSellerProducts()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
