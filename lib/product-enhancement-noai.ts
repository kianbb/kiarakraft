import { translateTexts, detectLanguage } from './azure-translator';
import { resizeImageTo1024 } from './image-resizer';
import { uploadImageToCloudinary } from './cloudinary';

interface NonAIEnhancementResult {
  enhanced: boolean;
  title?: string;
  titleEn?: string;
  titleFa?: string;
  description?: string;
  descriptionEn?: string;
  descriptionFa?: string;
  tags?: string[];
  tagsEn?: string[];
  tagsFa?: string[];
  imageUrl?: string;
}

/**
 * Process product without AI - handles translation and image resizing
 * @param product - Product data to process
 * @returns Enhanced product data with translations and resized image
 */
export async function enhanceProductWithoutAI(product: {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  tags?: string | string[] | null | unknown;
  locale?: 'fa' | 'en';
}): Promise<NonAIEnhancementResult> {
  try {
    console.log(`🌐 Processing product without AI: ${product.title}`);

    // Detect source language if not provided
    const sourceLanguage =
      product.locale || (await detectLanguage(product.title));
    const ispersian = sourceLanguage === 'fa';

    console.log(`   Source language: ${sourceLanguage}`);

    // Initialize result
    const result: NonAIEnhancementResult = {
      enhanced: false,
    };

    // Process title and description translations
    if (ispersian) {
      // Original is Persian, translate to English
      console.log('   Translating from Persian to English...');

      const [translatedTitle, translatedDescription] = await translateTexts(
        [product.title, product.description],
        'en',
        'fa'
      );

      result.title = product.title;
      result.titleFa = product.title;
      result.titleEn = translatedTitle;
      result.description = product.description;
      result.descriptionFa = product.description;
      result.descriptionEn = translatedDescription;

      // Process tags if available
      if (product.tags) {
        let tagsArray: string[] = [];

        // Handle different tag formats
        if (Array.isArray(product.tags)) {
          tagsArray = product.tags.filter(
            (t): t is string => typeof t === 'string'
          );
        } else if (typeof product.tags === 'string') {
          tagsArray = product.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t);
        } else if (typeof product.tags === 'object' && product.tags !== null) {
          // Handle bilingual tags object {fa: [], en: []}
          const tagsObj = product.tags as { fa?: string[]; en?: string[] };
          if (tagsObj.fa && Array.isArray(tagsObj.fa)) {
            tagsArray = tagsObj.fa;
          } else if (tagsObj.en && Array.isArray(tagsObj.en)) {
            tagsArray = tagsObj.en;
          }
        }

        if (tagsArray.length > 0) {
          const translatedTags = await translateTexts(tagsArray, 'en', 'fa');

          result.tags = tagsArray;
          result.tagsFa = tagsArray;
          result.tagsEn = translatedTags.map(
            tag => tag.toLowerCase().replace(/\s+/g, '_') // Convert spaces to underscores
          );
        }
      }
    } else {
      // Original is English, translate to Persian
      console.log('   Translating from English to Persian...');

      const [translatedTitle, translatedDescription] = await translateTexts(
        [product.title, product.description],
        'fa',
        'en'
      );

      result.title = translatedTitle; // Use Persian as primary
      result.titleFa = translatedTitle;
      result.titleEn = product.title;
      result.description = translatedDescription; // Use Persian as primary
      result.descriptionFa = translatedDescription;
      result.descriptionEn = product.description;

      // Process tags if available
      if (product.tags) {
        let tagsArray: string[] = [];

        // Handle different tag formats
        if (Array.isArray(product.tags)) {
          tagsArray = product.tags.filter(
            (t): t is string => typeof t === 'string'
          );
        } else if (typeof product.tags === 'string') {
          tagsArray = product.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t);
        } else if (typeof product.tags === 'object' && product.tags !== null) {
          // Handle bilingual tags object {fa: [], en: []}
          const tagsObj = product.tags as { fa?: string[]; en?: string[] };
          if (tagsObj.fa && Array.isArray(tagsObj.fa)) {
            tagsArray = tagsObj.fa;
          } else if (tagsObj.en && Array.isArray(tagsObj.en)) {
            tagsArray = tagsObj.en;
          }
        }

        if (tagsArray.length > 0) {
          const translatedTags = await translateTexts(tagsArray, 'fa', 'en');

          result.tags = translatedTags; // Use Persian as primary
          result.tagsFa = translatedTags;
          result.tagsEn = tagsArray.map(
            (tag: string) => tag.toLowerCase().replace(/\s+/g, '_') // Convert spaces to underscores
          );
        }
      }
    }

    // Process image if available
    if (product.imageUrl) {
      console.log('   Resizing image to 1024x1024...');
      const resizedImage = await resizeImageTo1024(product.imageUrl);

      if (resizedImage) {
        try {
          // Upload to Cloudinary
          const base64 = resizedImage.split(',')[1];
          const buffer = Buffer.from(base64, 'base64');

          console.log('   Uploading resized image to Cloudinary...');
          const upload = await uploadImageToCloudinary(buffer, {
            folder: `kiarakraft/products/${product.id}`,
            public_id: `resized-${Date.now()}`,
          });

          result.imageUrl = upload.secure_url;
          console.log('   ✅ Image successfully resized and uploaded');
        } catch (error) {
          console.error('   ❌ Failed to upload resized image:', error);
          // Keep original image URL if upload fails
          result.imageUrl = product.imageUrl;
        }
      } else {
        // Keep original if resizing fails
        result.imageUrl = product.imageUrl;
      }
    }

    result.enhanced = true;
    console.log('✅ Non-AI processing completed successfully');

    return result;
  } catch (error) {
    console.error('❌ Non-AI processing failed:', error);

    // Return minimal enhancement on error
    return {
      enhanced: false,
      title: product.title,
      description: product.description,
      imageUrl: product.imageUrl,
    };
  }
}

/**
 * Generate basic tags from product title and description
 * @param title - Product title
 * @param description - Product description
 * @param category - Product category
 * @returns Array of generated tags
 */
export function generateBasicTags(
  title: string,
  description: string,
  category?: string
): string[] {
  const tags: string[] = [];

  // Add category as tag if available
  if (category) {
    tags.push(category);
  }

  // Extract common keywords from title
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3);

  // Common handmade/craft keywords to look for
  const craftKeywords = [
    'handmade',
    'دستساز',
    'craft',
    'کرفت',
    'artisan',
    'صنایع_دستی',
    'traditional',
    'سنتی',
    'persian',
    'ایرانی',
    'iranian',
    'فارسی',
    'ceramic',
    'سرامیک',
    'textile',
    'پارچه',
    'jewelry',
    'جواهرات',
    'wood',
    'چوب',
    'painting',
    'نقاشی',
  ];

  // Check for craft keywords in title and description
  const combinedText = (title + ' ' + description).toLowerCase();
  for (const keyword of craftKeywords) {
    if (combinedText.includes(keyword.toLowerCase())) {
      tags.push(keyword.replace(/\s+/g, '_'));
    }
  }

  // Add some title words as tags (limit to 3)
  titleWords.slice(0, 3).forEach(word => {
    if (!tags.includes(word)) {
      tags.push(word);
    }
  });

  // Limit to 10 tags maximum
  return tags.slice(0, 10);
}
