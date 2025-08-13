import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting production seed...')

  // Create categories with upsert (idempotent)
  console.log('📂 Upserting categories...')
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'ceramics' },
      update: {},
      create: {
        slug: 'ceramics',
        name: 'سرامیک / Ceramics'
      }
    }),
    prisma.category.upsert({
      where: { slug: 'textiles' },
      update: {},
      create: {
        slug: 'textiles',
        name: 'نساجی / Textiles'
      }
    }),
    prisma.category.upsert({
      where: { slug: 'jewelry' },
      update: {},
      create: {
        slug: 'jewelry',
        name: 'جواهرات / Jewelry'
      }
    }),
    prisma.category.upsert({
      where: { slug: 'woodwork' },
      update: {},
      create: {
        slug: 'woodwork',
        name: 'صنایع چوبی / Woodwork'
      }
    }),
    prisma.category.upsert({
      where: { slug: 'painting' },
      update: {},
      create: {
        slug: 'painting',
        name: 'نقاشی / Painting'
      }
    })
  ])

  console.log(`✅ Upserted ${categories.length} categories`)

  // Create demo buyer with upsert
  console.log('👤 Upserting demo buyer...')
  const hashedBuyerPassword = await bcrypt.hash('password123', 10)
  const demoUser = await prisma.user.upsert({
    where: { email: 'buyer@example.com' },
    update: {},
    create: {
      email: 'buyer@example.com',
      password: hashedBuyerPassword,
      name: 'Demo Buyer',
      role: 'BUYER'
    }
  })

  // Create demo seller with upsert
  console.log('🛍️ Upserting demo seller...')
  const hashedSellerPassword = await bcrypt.hash('seller123', 10)
  const demoSeller = await prisma.user.upsert({
    where: { email: 'seller@example.com' },
    update: {},
    create: {
      email: 'seller@example.com',
      password: hashedSellerPassword,
      name: 'Demo Seller',
      role: 'SELLER'
    }
  })

  // Create seller profile with upsert
  const sellerProfile = await prisma.sellerProfile.upsert({
    where: { userId: demoSeller.id },
    update: {},
    create: {
      userId: demoSeller.id,
      shopName: 'فروشگاه صنایع دستی اصفهان',
      displayName: 'Isfahan Handicrafts',
      bio: 'فروشگاه متخصص در صنایع دستی سنتی اصفهان با بیش از 15 سال تجربه در تولید و عرضه محصولات دست‌ساز با کیفیت.',
      region: 'اصفهان'
    }
  })

  console.log('✅ Upserted demo users and seller profile')

  // Create products with upsert
  console.log('🎨 Upserting products...')
  const productData = [
    {
      slug: 'handmade-ceramic-bowl',
      title: 'کاسه سرامیکی دست‌ساز',
      description: 'کاسه زیبای سرامیکی ساخته شده با تکنیک‌های سنتی ایرانی. مناسب برای سرو میوه و آجیل.',
      priceToman: 450000,
      stock: 12,
      categoryId: categories[0].id, // ceramics
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop&crop=top'
      ]
    },
    {
      slug: 'kurdish-handwoven-kilim',
      title: 'گلیم دستباف کردی',
      description: 'گلیم سنتی دستباف با نقوش اصیل کردی. بافته شده با پشم طبیعی و رنگ‌های گیاهی.',
      priceToman: 2800000,
      stock: 3,
      categoryId: categories[1].id, // textiles
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop&crop=center'
      ]
    },
    {
      slug: 'silver-turquoise-necklace',
      title: 'گردنبند نقره با سنگ فیروزه',
      description: 'گردنبند زیبای نقره دست‌ساز با سنگ فیروزه طبیعی نیشابوری. کار دست استادان اصفهانی.',
      priceToman: 1250000,
      stock: 8,
      categoryId: categories[2].id, // jewelry
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop&crop=top'
      ]
    },
    {
      slug: 'isfahan-khatam-box',
      title: 'جعبه خاتم‌کاری اصفهان',
      description: 'جعبه زیبای خاتم‌کاری با نقوش سنتی اصفهان. مناسب برای نگهداری جواهرات و اشیاء قیمتی.',
      priceToman: 950000,
      stock: 6,
      categoryId: categories[3].id, // woodwork
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&crop=center'
      ]
    },
    {
      slug: 'persian-miniature-painting',
      title: 'نگارگری سنتی ایرانی',
      description: 'نگارگری زیبا با موضوع عاشقان در باغ، اثری از هنرمند نامدار اصفهانی با تکنیک‌های کلاسیک.',
      priceToman: 1800000,
      stock: 2,
      categoryId: categories[4].id, // painting
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop',
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop&crop=top'
      ]
    }
  ]

  for (const product of productData) {
    const { images, ...productWithoutImages } = product
    
    const createdProduct = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        ...productWithoutImages
      },
      create: {
        ...productWithoutImages
      }
    })

    // Delete existing images and create new ones (idempotent)
    await prisma.listingImage.deleteMany({
      where: { productId: createdProduct.id }
    })

    // Create images for this product
    for (let i = 0; i < images.length; i++) {
      await prisma.listingImage.create({
        data: {
          productId: createdProduct.id,
          url: images[i],
          alt: `${product.title} - تصویر ${i + 1}`,
          sortOrder: i
        }
      })
    }
  }

  console.log(`✅ Upserted ${productData.length} products with images`)

  console.log('🎉 Production seed completed successfully!')
  
  // Return summary
  return {
    categories: categories.length,
    users: 2,
    products: productData.length,
    message: 'Production database seeded successfully'
  }
}

// Export for use in API route
export { main as seedProduction }

// CLI execution
if (require.main === module) {
  main()
    .catch((e) => {
      console.error('❌ Seed failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}