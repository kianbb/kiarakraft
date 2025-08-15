import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
    // CERAMICS (8 products)
    {
      slug: 'handmade-ceramic-bowl',
      title: 'کاسه سرامیکی دست‌ساز',
      description: 'کاسه زیبای سرامیکی ساخته شده با تکنیک‌های سنتی ایرانی. مناسب برای سرو میوه و آجیل.',
      priceToman: 450000,
      stock: 12,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'blue-glazed-ceramic-dish',
      title: 'ظرف سرامیک لعابی آبی',
      description: 'ظرف سرامیکی با لعاب آبی کبالت در سبک سنتی کاشان. مناسب برای تزیین و استفاده روزانه.',
      priceToman: 380000,
      stock: 15,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'ceramic-tea-set',
      title: 'سرویس چای خوری سرامیک',
      description: 'سرویس کامل چای خوری شامل قوری، استکان و نعلبکی. ساخت کارگاه‌های سنتی لاله‌جین.',
      priceToman: 1350000,
      stock: 4,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'lalejin-ceramic-vase',
      title: 'گلدان سرامیکی لاله‌جین',
      description: 'گلدان زیبای سرامیکی با نقوش کلاسیک، ساخت استادکاران لاله‌جین همدان. مناسب برای گل‌های طبیعی و مصنوعی.',
      priceToman: 520000,
      stock: 8,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'turquoise-ceramic-plate',
      title: 'بشقاب سرامیک فیروزه‌ای',
      description: 'بشقاب تزیینی با رنگ فیروزه‌ای و نقوش اسلیمی. کار دست هنرمندان کاشان.',
      priceToman: 295000,
      stock: 20,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'ceramic-water-jug',
      title: 'آبخوری سرامیکی سنتی',
      description: 'آبخوری سرامیکی با قابلیت خنک نگه‌داشتن آب. ساخت سنتی با طرح‌های ایرانی.',
      priceToman: 680000,
      stock: 6,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'decorative-ceramic-tiles',
      title: 'کاشی‌های تزیینی سرامیک',
      description: 'مجموعه کاشی‌های تزیینی با نقوش اسلیمی برای دکوراسیون دیوار. هر بسته شامل 6 عدد کاشی.',
      priceToman: 850000,
      stock: 10,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'ceramic-fruit-bowl-set',
      title: 'ست کاسه‌های میوه خوری',
      description: 'مجموعه 3 عددی کاسه سرامیکی در اندازه‌های مختلف. مناسب برای سرو میوه، آجیل و شیرینی.',
      priceToman: 750000,
      stock: 7,
      categoryId: categories[0].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&h=500&fit=crop'
      ]
    },

    // TEXTILES (8 products)
    {
      slug: 'kurdish-handwoven-kilim',
      title: 'گلیم دستباف کردی',
      description: 'گلیم سنتی دستباف با نقوش اصیل کردی. بافته شده با پشم طبیعی و رنگ‌های گیاهی.',
      priceToman: 2800000,
      stock: 3,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'karakul-wool-shawl',
      title: 'شال پشمی کرک',
      description: 'شال بافته شده از پشم کرک با نقوش سنتی. گرم و مناسب برای فصل سرد.',
      priceToman: 1650000,
      stock: 7,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'shiraz-gabbeh-blanket',
      title: 'پتوی گبه شیرازی',
      description: 'پتوی گبه دستباف شیرازی با طرح‌های هندسی و رنگ‌های طبیعی. مناسب برای دکوراسیون و استفاده.',
      priceToman: 4200000,
      stock: 2,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'tabriz-carpet-runner',
      title: 'راهرو فرش تبریز',
      description: 'راهرو فرش دستباف تبریز با طرح شاه عباسی. ابعاد 80×200 سانتی‌متر، مناسب برای راهرو و پذیرایی.',
      priceToman: 5500000,
      stock: 1,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'silk-termeh-scarf',
      title: 'روسری ابریشم ترمه',
      description: 'روسری ابریشمی با بافت ترمه سنتی یزد. نقوش طلایی روی زمینه سرمه‌ای.',
      priceToman: 950000,
      stock: 12,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'cotton-blockprint-tablecloth',
      title: 'رومیزی قلمکار اصفهان',
      description: 'رومیزی پنبه‌ای با طرح قلمکار دست‌چاپ اصفهان. مناسب برای میز 6 نفره.',
      priceToman: 480000,
      stock: 8,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'felt-nomad-bag',
      title: 'کیف نمدی عشایری',
      description: 'کیف دستی ساخته شده از نمد طبیعی با طرح‌های عشایری. مناسب برای استفاده روزانه.',
      priceToman: 350000,
      stock: 15,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'cashmere-paisley-shawl',
      title: 'شال کشمیر طرح بته‌جقه',
      description: 'شال کشمیری نرم با طرح سنتی بته‌جقه. مناسب برای مناسبات خاص و هدیه.',
      priceToman: 2250000,
      stock: 4,
      categoryId: categories[1].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop'
      ]
    },

    // JEWELRY (8 products)
    {
      slug: 'silver-turquoise-necklace',
      title: 'گردنبند نقره با سنگ فیروزه',
      description: 'گردنبند زیبای نقره دست‌ساز با سنگ فیروزه طبیعی نیشابوری. کار دست استادان اصفهانی.',
      priceToman: 1250000,
      stock: 8,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'red-agate-ring',
      title: 'انگشتر عقیق سرخ',
      description: 'انگشتر مردانه با سنگ عقیق سرخ یمنی در قاب نقره. دست‌ساز و با کیفیت بالا.',
      priceToman: 875000,
      stock: 5,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'persian-calligraphy-pendant',
      title: 'آویز گردن خوشنویسی',
      description: 'آویز نقره‌ای با خوشنویسی شعر حافظ. کار دست استاد خوشنویس اصفهانی.',
      priceToman: 680000,
      stock: 10,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'coral-silver-bracelet',
      title: 'دستبند نقره با مرجان',
      description: 'دستبند زنانه نقره با مهره‌های مرجان طبیعی. طراحی مدرن با الهام از نقوش سنتی.',
      priceToman: 920000,
      stock: 7,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'minakari-earrings',
      title: 'گوشواره مینا‌کاری اصفهان',
      description: 'گوشواره زیبا با کار مینا‌کاری سنتی اصفهان. نقوش گل و مرغ روی زمینه آبی.',
      priceToman: 750000,
      stock: 12,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'amber-prayer-beads',
      title: 'تسبیح کهربا بالتیک',
      description: 'تسبیح 33 دانه‌ای از کهربای اصل بالتیک. مناسب برای استفاده شخصی و هدیه.',
      priceToman: 1450000,
      stock: 3,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'traditional-silver-anklet',
      title: 'پابند نقره سنتی',
      description: 'پابند نقره با آویزهای ظریف و صدای دلنشین. طراحی سنتی مناطق جنوبی ایران.',
      priceToman: 580000,
      stock: 9,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'lapis-lazuli-cufflinks',
      title: 'دکمه سردست لاجورد',
      description: 'دکمه سردست مردانه با سنگ لاجورد طبیعی در قاب طلای سفید. مناسب برای مناسبات رسمی.',
      priceToman: 1850000,
      stock: 4,
      categoryId: categories[2].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop'
      ]
    },

    // WOODWORK (8 products)
    {
      slug: 'isfahan-khatam-box',
      title: 'جعبه خاتم‌کاری اصفهان',
      description: 'جعبه زیبای خاتم‌کاری با نقوش سنتی اصفهان. مناسب برای نگهداری جواهرات و اشیاء قیمتی.',
      priceToman: 950000,
      stock: 6,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'marquetry-jewelry-box',
      title: 'صندوقچه معرق',
      description: 'صندوقچه کوچک با کار معرق‌کاری سنتی. مناسب برای نگهداری زیورآلات کوچک.',
      priceToman: 720000,
      stock: 9,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'walnut-inlay-chess-board',
      title: 'صفحه شطرنج معرق گردو',
      description: 'صفحه شطرنج لوکس با کار معرق‌کاری چوب گردو و افرا. شامل مهره‌های چوبی دست‌تراش.',
      priceToman: 2800000,
      stock: 2,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'cedar-wood-backgammon',
      title: 'تخته نرد چوب سرو',
      description: 'تخته نرد دست‌ساز از چوب سرو با نقش‌برجسته. شامل مهره و تاس عاج مصنوعی.',
      priceToman: 1650000,
      stock: 4,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'khatam-picture-frame',
      title: 'قاب عکس خاتم‌کاری',
      description: 'قاب عکس زیبا با کار خاتم‌کاری ظریف. مناسب برای عکس‌های 15×20 سانتی‌متر.',
      priceToman: 485000,
      stock: 12,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'wooden-spice-box',
      title: 'ادویه‌دان چوبی سنتی',
      description: 'ادویه‌دان 7 قسمتی از چوب توت با درب محکم. مناسب برای نگهداری ادویه‌جات.',
      priceToman: 380000,
      stock: 15,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'hand-carved-mirror-frame',
      title: 'قاب آینه منبت‌کاری',
      description: 'قاب آینه دست‌تراش با نقوش اسلیمی. چوب گردو و کار دست استادان اصفهانی.',
      priceToman: 1250000,
      stock: 3,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'wooden-serving-tray',
      title: 'سینی پذیرایی چوبی',
      description: 'سینی بزرگ از چوب افرا با دسته‌های مسی. مناسب برای سرو چای و قهوه.',
      priceToman: 650000,
      stock: 8,
      categoryId: categories[3].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop'
      ]
    },

    // PAINTINGS (8 products)
    {
      slug: 'persian-miniature-painting',
      title: 'نگارگری سنتی ایرانی',
      description: 'نگارگری زیبا با موضوع عاشقان در باغ، اثری از هنرمند نامدار اصفهانی با تکنیک‌های کلاسیک.',
      priceToman: 1800000,
      stock: 2,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'leather-painting',
      title: 'نقاشی روی چرم',
      description: 'نقاشی سنتی روی چرم با موضوع شکار شاهی. کار دست و با رنگ‌های پایدار.',
      priceToman: 1980000,
      stock: 4,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'calligraphy-hafez-poem',
      title: 'خوشنویسی غزل حافظ',
      description: 'خوشنویسی زیبای غزل حافظ به خط نستعلیق. کار استاد محمد حسینی، قطع 40×60 سانتی‌متر.',
      priceToman: 1200000,
      stock: 5,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'illuminated-quran-page',
      title: 'صفحه تذهیب قرآن',
      description: 'صفحه تذهیب‌شده قرآن کریم با طلاکاری و رنگ‌آمیزی سنتی. کار دست استاد تذهیب.',
      priceToman: 2500000,
      stock: 1,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'watercolor-persian-garden',
      title: 'آبرنگ باغ ایرانی',
      description: 'نقاشی آبرنگ از باغ ایرانی سنتی با آب‌نما و کاج‌ها. اثر هنرمند معاصر.',
      priceToman: 950000,
      stock: 8,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'oil-painting-isfahan-bridge',
      title: 'نقاشی رنگ روغن پل اصفهان',
      description: 'نقاشی رنگ روغن از پل خواجو اصفهان در آب‌وهوای غروب. قطع 50×70 سانتی‌متر.',
      priceToman: 1650000,
      stock: 3,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'modern-calligraphy-love',
      title: 'خوشنویسی مدرن عشق',
      description: 'خوشنویسی مدرن کلمه عشق با ترکیب خط کوفی و نستعلیق. طراحی منحصر به فرد.',
      priceToman: 780000,
      stock: 10,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop'
      ]
    },
    {
      slug: 'tea-house-painting',
      title: 'نقاشی قهوه‌خانه سنتی',
      description: 'نقاشی رنگ آکریلیک از صحنه قهوه‌خانه سنتی با نقال و سازهای محلی.',
      priceToman: 1350000,
      stock: 2,
      categoryId: categories[4].id,
      sellerId: sellerProfile.id,
      images: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop'
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
  console.log('\n📊 Summary:')
  console.log(`   - ${categories.length} categories`)
  console.log(`   - 2 users (1 buyer, 1 seller)`) 
  console.log(`   - ${productData.length} products with images`)
  console.log(`   - 8 products per category (ceramics, textiles, jewelry, woodwork, paintings)`)
  console.log(`   - Price range: 295,000 - 5,500,000 تومان`)
  console.log(`   - All products include authentic Persian descriptions`)
  
  // Return summary
  return {
    categories: categories.length,
    users: 2,
    products: productData.length,
    message: 'Production database seeded with 40 authentic Iranian handcraft products'
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