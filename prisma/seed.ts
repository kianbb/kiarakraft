import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create categories
  console.log('📂 Creating categories...');
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        slug: 'ceramics',
        name: 'سرامیک / Ceramics',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'textiles',
        name: 'نساجی / Textiles',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'jewelry',
        name: 'جواهرات / Jewelry',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'woodwork',
        name: 'صنایع چوبی / Woodwork',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'painting',
        name: 'نقاشی / Painting',
      },
    }),
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // Create demo buyer
  console.log('👤 Creating demo buyer...');
  const hashedBuyerPassword = await bcrypt.hash('password123', 10);
  await prisma.user.create({
    data: {
      email: 'buyer@example.com',
      password: hashedBuyerPassword,
      name: 'علی احمدی',
      role: 'BUYER',
    },
  });

  // Create demo seller
  console.log('🏪 Creating demo seller...');
  const hashedSellerPassword = await bcrypt.hash('seller123', 10);
  const demoSeller = await prisma.user.create({
    data: {
      email: 'seller@example.com',
      password: hashedSellerPassword,
      name: 'مریم صنعتگر',
      role: 'SELLER',
      sellerProfile: {
        create: {
          shopName: 'Atelier Kiara',
          displayName: 'کارگاه کیارا',
          handle: 'atelier-kiara',
          bio: 'متخصص در تولید صنایع دستی سنتی ایرانی با بیش از 15 سال تجربه',
          region: 'تهران',
          avatarUrl:
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
        },
      },
    },
    include: {
      sellerProfile: true,
    },
  });

  console.log('✅ Created demo users');

  // Create products
  console.log('🎨 Creating products...');
  const products = [
    {
      title: 'کاسه سرامیکی دست‌ساز',
      slug: 'handmade-ceramic-bowl',
      description:
        'کاسه زیبای سرامیکی ساخته شده با تکنیک‌های سنتی ایرانی. مناسب برای سرو میوه و آجیل.',
      priceToman: 450000,
      stock: 12,
      categoryId: categories[0].id, // ceramics
      images: [
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop&crop=top',
      ],
    },
    {
      title: 'گلیم دستباف کردی',
      slug: 'kurdish-handwoven-kilim',
      description:
        'گلیم سنتی دستباف با نقوش اصیل کردی. بافته شده با پشم طبیعی و رنگ‌های گیاهی.',
      priceToman: 2800000,
      stock: 3,
      categoryId: categories[1].id, // textiles
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop&crop=center',
      ],
    },
    {
      title: 'گردنبند نقره با سنگ فیروزه',
      slug: 'silver-turquoise-necklace',
      description:
        'گردنبند زیبای نقره دست‌ساز با سنگ فیروزه طبیعی نیشابوری. کار دست استادان اصفهانی.',
      priceToman: 1250000,
      stock: 8,
      categoryId: categories[2].id, // jewelry
      images: [
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop&crop=top',
      ],
    },
    {
      title: 'جعبه خاتم‌کاری اصفهان',
      slug: 'isfahan-khatam-box',
      description:
        'جعبه زیبای خاتم‌کاری با نقوش سنتی اصفهان. مناسب برای نگهداری جواهرات و اشیاء قیمتی.',
      priceToman: 950000,
      stock: 6,
      categoryId: categories[3].id, // woodwork
      images: [
        'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=500&h=500&fit=crop&crop=center',
      ],
    },
    {
      title: 'نقاشی مینیاتور ایرانی',
      slug: 'persian-miniature-painting',
      description:
        'نقاشی مینیاتور دست‌کش با موضوع عاشقان در باغ. اثر استاد کار با رنگ‌های طبیعی.',
      priceToman: 3500000,
      stock: 2,
      categoryId: categories[4].id, // painting
      images: [
        'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop&crop=top',
      ],
    },
    {
      title: 'ظرف سرامیک لعابی آبی',
      slug: 'blue-glazed-ceramic-dish',
      description:
        'ظرف سرامیکی با لعاب آبی کبالت در سبک سنتی کاشان. مناسب برای تزیین و استفاده روزانه.',
      priceToman: 380000,
      stock: 15,
      categoryId: categories[0].id, // ceramics
      images: [
        'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=500&fit=crop',
      ],
    },
    {
      title: 'شال پشمی کرک',
      slug: 'karakul-wool-shawl',
      description:
        'شال بافته شده از پشم کرک با نقوش سنتی. گرم و مناسب برای فصل سرد.',
      priceToman: 1650000,
      stock: 7,
      categoryId: categories[1].id, // textiles
      images: [
        'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop',
      ],
    },
    {
      title: 'انگشتر عقیق سرخ',
      slug: 'red-agate-ring',
      description:
        'انگشتر مردانه با سنگ عقیق سرخ یمنی در قاب نقره. دست‌ساز و با کیفیت بالا.',
      priceToman: 875000,
      stock: 5,
      categoryId: categories[2].id, // jewelry
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop',
      ],
    },
    {
      title: 'صندوقچه معرق',
      slug: 'marquetry-jewelry-box',
      description:
        'صندوقچه کوچک با کار معرق‌کاری سنتی. مناسب برای نگهداری زیورآلات کوچک.',
      priceToman: 720000,
      stock: 9,
      categoryId: categories[3].id, // woodwork
      images: [
        'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop',
      ],
    },
    {
      title: 'نقاشی روی چرم',
      slug: 'leather-painting',
      description:
        'نقاشی سنتی روی چرم با موضوع شکار شاهی. کار دست و با رنگ‌های پایدار.',
      priceToman: 1980000,
      stock: 4,
      categoryId: categories[4].id, // painting
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop',
      ],
    },
    {
      title: 'سرویس چای خوری سرامیک',
      slug: 'ceramic-tea-set',
      description:
        'سرویس کامل چای خوری شامل قوری، استکان و نعلبکی. ساخت کارگاه‌های سنتی لاله‌جین.',
      priceToman: 1350000,
      stock: 4,
      categoryId: categories[0].id, // ceramics
      images: [
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&h=500&fit=crop',
      ],
    },
    {
      title: 'پتوی گبه شیرازی',
      slug: 'shiraz-gabbeh-blanket',
      description:
        'پتوی گبه دستباف شیرازی با طرح‌های هندسی و رنگ‌های طبیعی. مناسب برای دکوراسیون و استفاده.',
      priceToman: 4200000,
      stock: 2,
      categoryId: categories[1].id, // textiles
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop',
      ],
    },
  ];

  for (const product of products) {
    const createdProduct = await prisma.product.create({
      data: {
        title: product.title,
        slug: product.slug,
        description: product.description,
        priceToman: product.priceToman,
        stock: product.stock,
        sellerId: demoSeller.sellerProfile!.id,
        categoryId: product.categoryId,
        active: true,
        isTest: true, // Mark demo products as test products to exclude from public listings
        images: {
          create: product.images.map((url, index) => ({
            url,
            alt: product.title,
            sortOrder: index,
          })),
        },
      },
    });
    console.log(`  ✅ Created product: ${createdProduct.title}`);
  }

  console.log('🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - ${categories.length} categories`);
  console.log(`   - 2 users (1 buyer, 1 seller)`);
  console.log(`   - ${products.length} products with images`);
  console.log('\n🔐 Demo Accounts:');
  console.log('   Buyer: buyer@example.com / password123');
  console.log('   Seller: seller@example.com / seller123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
