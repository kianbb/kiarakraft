import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of product titles to appropriate realistic images
const productImageMap: Record<string, string> = {
  // Ceramics
  'ظرف سرامیک لعابی آبی': 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=500&fit=crop&q=80',
  'سرویس چای خوری سرامیک': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&h=500&fit=crop&q=80',
  'گلدان سرامیکی لاله‌جین': 'https://images.unsplash.com/photo-1486664224851-b4174bc4df90?w=500&h=500&fit=crop&q=80',
  'کاسه سرامیکی دست‌ساز': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop&q=80',
  'بشقاب سرامیک فیروزه‌ای': 'https://images.unsplash.com/photo-1586968664721-dfea9eebee32?w=500&h=500&fit=crop&q=80',
  'آبخوری سرامیکی سنتی': 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=500&fit=crop&q=80',
  'کاشی‌های تزیینی سرامیک': 'https://images.unsplash.com/photo-1486665740138-9b4d1a3f2e96?w=500&h=500&fit=crop&q=80',
  'ست کاسه‌های میوه خوری': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop&q=80',

  // Textiles  
  'شال پشمی کرک': 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop&q=80',
  'راهرو فرش تبریز': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=500&fit=crop&q=80',
  'روسری ابریشم ترمه': 'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=500&h=500&fit=crop&q=80',
  'گلیم دستباف کردی': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&q=80',
  'رومیزی قلمکار اصفهان': 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?w=500&h=500&fit=crop&q=80',
  'کیف نمدی عشایری': 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&h=500&fit=crop&q=80',
  'شال کشمیر طرح بته‌جقه': 'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=500&h=500&fit=crop&q=80',
  'پتوی گبه شیرازی': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&q=80',

  // Jewelry
  'انگشتر عقیق سرخ': 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop&q=80',
  'دستبند نقره با مرجان': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop&q=80',
  'گردنبند نقره با سنگ فیروزه': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=500&fit=crop&q=80',
  'آویز گردن خوشنویسی': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop&q=80',
  'گوشواره مینا‌کاری اصفهان': 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop&q=80',
  'تسبیح کهربا بالتیک': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=500&fit=crop&q=80',
  'پابند نقره سنتی': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&h=500&fit=crop&q=80',
  'دکمه سردست لاجورد': 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=500&fit=crop&q=80',

  // Woodwork
  'صندوقچه معرق': 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=500&h=500&fit=crop&q=80',
  'جعبه خاتم‌کاری اصفهان': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&q=80',
  'صفحه شطرنج معرق گردو': 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=500&h=500&fit=crop&q=80',
  'تخته نرد چوب سرو': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&q=80',
  'قاب عکس خاتم‌کاری': 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=500&h=500&fit=crop&q=80',
  'ادویه‌دان چوبی سنتی': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&q=80',
  'قاب آینه منبت‌کاری': 'https://images.unsplash.com/photo-1542319375-a5bb87543ad7?w=500&h=500&fit=crop&q=80',
  'سینی پذیرایی چوبی': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=500&fit=crop&q=80',

  // Paintings
  'نگارگری سنتی ایرانی': 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=500&h=500&fit=crop&q=80',
  'خوشنویسی غزل حافظ': 'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop&q=80',
  'صفحه تذهیب قرآن': 'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop&q=80',
  'آبرنگ باغ ایرانی': 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop&q=80',
  'نقاشی رنگ روغن پل اصفهان': 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop&q=80',
  'خوشنویسی مدرن عشق': 'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=500&h=500&fit=crop&q=80',
  'نقاشی قهوه‌خانه سنتی': 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500&h=500&fit=crop&q=80',
  'نقاشی روی چرم': 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=500&h=500&fit=crop&q=80'
};

async function updateProductImages() {
  console.log('🖼️ Starting product image updates...');
  
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      include: { images: true }
    });

    let updatedCount = 0;

    for (const product of products) {
      const newImageUrl = productImageMap[product.title];
      
      if (newImageUrl) {
        // Delete existing images
        await prisma.listingImage.deleteMany({
          where: { productId: product.id }
        });

        // Add new image
        await prisma.listingImage.create({
          data: {
            productId: product.id,
            url: newImageUrl,
            alt: product.title,
            sortOrder: 0
          }
        });

        console.log(`✅ Updated image for: ${product.title}`);
        updatedCount++;
      } else {
        console.log(`⚠️  No image mapping found for: ${product.title}`);
      }
    }

    console.log(`\n🎉 Updated images for ${updatedCount} products`);
  } catch (error) {
    console.error('❌ Error updating product images:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateProductImages();