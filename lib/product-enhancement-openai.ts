import OpenAI, { toFile } from 'openai';
import * as Sentry from '@sentry/nextjs';
// import { uploadImageToCloudinary } from '@/lib/cloudinary'; // Used in route.ts for uploading enhanced images
import {
  sanitizeForPrompt,
  secureFetchImage,
  trackAIUsage,
  estimateGPT5MiniCost,
  AI_COSTS,
} from '@/lib/security-utils';

type EnhancementResult = {
  enhancedDescription: string;
  suggestedTags: string[];
  imageEnhancementTips?: string[];
  enhancedImageUrl?: string;
  confidence: number;
  improvements: string[];
};

// Define marketplace expectations for product enhancement
const ENHANCEMENT_GUIDELINES = `
You are helping artisans on Kiara Kraft, an Iranian handmade marketplace, present their products better.

YOUR ROLE:
- Enhance product presentations while keeping them authentic and truthful
- Help sellers highlight the handmade/artisanal aspects of their work
- Improve discoverability through better descriptions and tags
- Suggest realistic image improvements (never fabricate or mislead)

DESCRIPTION ENHANCEMENT GUIDELINES:
1. Expand on craftsmanship details:
   - Materials used and their quality
   - Techniques employed (hand-stitched, hand-woven, etc.)
   - Time and effort involved
   - Unique features or patterns
   - Cultural or artistic significance

2. Add sensory details:
   - Texture (soft, smooth, rough, etc.)
   - Weight and feel
   - Colors and patterns
   - Size and dimensions

3. Suggest use cases:
   - How it can be used or worn
   - Occasions suitable for
   - Care instructions
   - Customization options

4. Maintain authenticity:
   - Never exaggerate or lie
   - Keep the seller's voice
   - Respect cultural context
   - Be honest about imperfections (they add character!)

TAG GENERATION RULES:
- Include material tags (wool, cotton, ceramic, etc.)
- Add technique tags (handwoven, embroidered, painted, etc.)
- Include style tags (traditional, modern, minimalist, etc.)
- Add cultural tags if relevant (Persian, Iranian, ethnic, etc.)
- Include functional tags (decorative, wearable, practical, etc.)
- Maximum 10 tags, most relevant first

IMAGE ENHANCEMENT ANALYSIS:
When analyzing the product image for realistic improvements, identify:
- Lighting adjustments needed (brighten shadows, reduce glare, add soft studio lighting)
- Background cleanup (remove distractions, create clean white/neutral background)
- Focus and sharpness improvements (enhance product details and textures)
- Color accuracy (correct white balance, enhance natural colors)
- Professional composition (center product, adjust angle for best presentation)
- Keep the product 100% realistic - no fantasy elements or major alterations

IMPORTANT: 
- For Persian/Farsi products, maintain bilingual descriptions
- Highlight what makes this product special and handmade
- If the product seems mass-produced, be honest but try to find unique selling points
- Always maintain ethical standards - no false claims
`;

export async function enhanceProductPresentation(input: {
  title: string;
  description: string;
  imageUrl?: string;
  categorySlug?: string;
  price?: number;
  locale?: 'fa' | 'en';
  userId?: string;
}): Promise<EnhancementResult> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      // Fallback to basic enhancement without AI
      return basicEnhancement(input);
    }

    const openai = new OpenAI({
      apiKey: openaiKey,
    });

    // Step 1: Use GPT-5 mini to analyze product and generate enhancements
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: ENHANCEMENT_GUIDELINES,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please enhance this product listing:

Title: ${sanitizeForPrompt(input.title, 200)}
Description: ${sanitizeForPrompt(input.description, 1000)}
Category: ${sanitizeForPrompt(input.categorySlug || 'Not specified', 50)}
Price: ${input.price ? `${input.price} Toman` : 'Not specified'}
Language: ${input.locale === 'fa' ? 'Persian/Farsi' : 'English'}

${input.imageUrl ? 'An image of the product is provided for analysis.' : 'No image provided.'}

Analyze the product and provide enhancements. You MUST respond with valid JSON in the following format:
{
  "enhancedDescription": "Improved detailed description (300-500 characters)",
  "suggestedTags": ["tag1", "tag2", ...] (max 10),
  "imageEnhancementTips": ["specific improvement suggestions for seller"],
  "imageEditPrompt": "Brief prompt for realistic photo enhancement focusing ONLY on: better lighting, clean background, sharp focus, correct colors. DO NOT change the product itself",
  "improvements": ["list of improvements made"],
  "confidence": 0-100
}

Focus on highlighting handmade qualities and improving marketability.`,
          },
          ...(input.imageUrl
            ? [
                {
                  type: 'image_url' as const,
                  image_url: {
                    url: input.imageUrl,
                    detail: 'low' as const,
                  },
                },
              ]
            : []),
        ],
      },
    ];

    // Track AI usage if userId provided
    if (input.userId) {
      try {
        const estimatedCost = estimateGPT5MiniCost(2000, 1000); // Rough estimate
        const usageCheck = await trackAIUsage(
          input.userId,
          'GPT5_MINI',
          estimatedCost
        );

        if (!usageCheck.allowed) {
          console.warn(
            `⚠️ AI enhancement limit exceeded for user ${input.userId}: $${usageCheck.monthlyTotal}/$${usageCheck.limit}`
          );
          return basicEnhancement(input);
        }
      } catch (trackingError) {
        // Don't fail enhancement if usage tracking fails
        console.error('AI usage tracking failed (continuing):', trackingError);
        // Continue with enhancement even if tracking fails
      }
    }

    console.log('🎆 Calling GPT-5 mini for enhancement...', {
      model: 'gpt-5-mini-2025-08-07',
      hasImage: !!input.imageUrl,
      title: input.title?.substring(0, 30),
    });

    // Use GPT-5 mini for analysis (more cost-effective than GPT-5)
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07', // Using GPT-5 mini with exact model version
      messages,
      max_completion_tokens: 5000, // Increased to account for reasoning tokens + output
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'product_enhancement',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              enhancedDescription: { type: 'string' },
              suggestedTags: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 10,
              },
              imageEnhancementTips: {
                type: 'array',
                items: { type: 'string' },
              },
              imageEditPrompt: { type: 'string' },
              improvements: {
                type: 'array',
                items: { type: 'string' },
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 100,
              },
            },
            required: [
              'enhancedDescription',
              'suggestedTags',
              'imageEnhancementTips',
              'imageEditPrompt',
              'improvements',
              'confidence',
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const result = JSON.parse(response) as {
      enhancedDescription: string;
      suggestedTags: string[];
      imageEnhancementTips?: string[];
      imageEditPrompt?: string;
      improvements: string[];
      confidence: number;
    };

    // Step 2: If image provided and needs enhancement, use GPT Image 1
    // Always enhance images when possible to better showcase handmade qualities
    let enhancedImageUrl = input.imageUrl;
    if (input.imageUrl && result.imageEditPrompt) {
      try {
        enhancedImageUrl = await enhanceImageWithGPTImage1({
          originalImageUrl: input.imageUrl,
          editPrompt: result.imageEditPrompt,
          userId: input.userId,
        });
      } catch (error) {
        console.error('Image enhancement failed, using original:', error);
      }
    }

    return {
      enhancedDescription: result.enhancedDescription,
      suggestedTags: result.suggestedTags.slice(0, 10),
      imageEnhancementTips: result.imageEnhancementTips,
      enhancedImageUrl,
      confidence: Math.max(0, Math.min(100, result.confidence)),
      improvements: result.improvements,
    };
  } catch (error) {
    // Log detailed error information
    console.error('🚨 AI ENHANCEMENT FAILED - USING BASIC FALLBACK', {
      error: error instanceof Error ? error.message : error,
      model: 'gpt-5-mini-2025-08-07',
      hasImage: !!input.imageUrl,
      title: input.title?.substring(0, 50),
      timestamp: new Date().toISOString(),
    });

    // Capture in Sentry for monitoring
    Sentry.captureException(error, {
      tags: {
        component: 'ai-enhancement',
        fallback: 'true',
        model: 'gpt-5-mini-2025-08-07',
      },
      extra: {
        productTitle: input.title,
        hasImage: !!input.imageUrl,
        userId: input.userId,
      },
    });

    console.warn('📊 Using basic enhancement (no AI)');
    return basicEnhancement(input);
  }
}

// Enhance image using GPT Image 1 Edit API for realistic improvements
async function enhanceImageWithGPTImage1(params: {
  originalImageUrl: string;
  editPrompt: string;
  userId?: string;
}): Promise<string> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // Securely fetch the original image with SSRF protection
    const fetchResult = await secureFetchImage(params.originalImageUrl, 10000); // 10 second timeout

    if (!fetchResult.success || !fetchResult.data) {
      throw new Error(fetchResult.error || 'Failed to fetch image');
    }

    const imageBlob = fetchResult.data;

    // Create a professional, realistic enhancement prompt
    const realisticPrompt = `Professional product photography enhancement: ${params.editPrompt}. 
    Maintain the original product exactly as-is but improve:
    - Professional studio lighting with soft shadows
    - Clean white or neutral gradient background
    - Sharp focus on product details
    - Correct color balance and exposure
    - Professional e-commerce composition
    Keep the product realistic and true to original.`;

    // Use OpenAI SDK for image editing
    // Convert blob to file using OpenAI's toFile helper
    const imageFile = await toFile(imageBlob, 'product.png', {
      type: 'image/png',
    });

    // Track AI usage for image enhancement
    if (params.userId) {
      const usageCheck = await trackAIUsage(
        params.userId,
        'GPT_IMAGE_1',
        AI_COSTS.GPT_IMAGE_1_EDIT
      );

      if (!usageCheck.allowed) {
        console.warn(`AI image usage limit exceeded for user ${params.userId}`);
        return params.originalImageUrl; // Return original if limit exceeded
      }
    }

    // Use the OpenAI Images Edits endpoint
    // Note: supported sizes are typically 1024x1024, 1024x1792, or 1792x1024 for gpt-image-1
    // We pick 1024x1024 for broad compatibility.
    let response;
    try {
      // Primary path: GPT Image 1 edit
      response = await openai.images.edit({
        model: 'gpt-image-1',
        image: imageFile,
        prompt: realisticPrompt,
        size: '1024x1024',
        n: 1,
      });
    } catch (err) {
      // Graceful fallback: if the account is not verified for gpt-image-1
      const msg = (err as Error)?.message || '';
      if (/must be verified to use the model `gpt-image-1`/i.test(msg)) {
        console.warn(
          'gpt-image-1 not available on this account; skipping image edit.'
        );
        return params.originalImageUrl; // keep original image
      }
      throw err;
    }

    // GPT Image 1 always returns base64-encoded images
    if (
      response &&
      response.data &&
      response.data[0] &&
      response.data[0].b64_json
    ) {
      const base64Image = response.data[0].b64_json;

      // TODO: In production, upload to Cloudinary for permanent URLs
      // For now, return as data URL (works but not ideal for large scale)
      const dataUrl = `data:image/png;base64,${base64Image}`;

      console.log('Image successfully enhanced with GPT Image 1 (base64)');
      return dataUrl;
    }

    throw new Error('No base64 image data received from GPT Image 1');
  } catch (error) {
    throw error;
  }
}

// Basic enhancement without AI
function basicEnhancement(input: {
  title: string;
  description: string;
  categorySlug?: string;
}): EnhancementResult {
  const improvements: string[] = [];
  let enhancedDescription = input.description;

  // Add basic enhancements
  if (input.description.length < 50) {
    improvements.push('Added more detail to description');

    // Add category-specific details
    const categoryEnhancements: Record<string, string> = {
      textiles: ' این محصول نساجی دست‌ساز با تکنیک‌های سنتی تولید شده است.',
      jewelry: ' این جواهر منحصر به فرد با دقت و ظرافت دست‌ساز شده است.',
      ceramics:
        ' این محصول سرامیکی با مهارت هنرمندانه شکل گرفته و پرداخت شده است.',
      woodwork: ' این محصول چوبی نمایانگر مهارت‌های حرفه‌ای در کار با چوب است.',
      art: ' این اثر هنری نشان‌دهنده ساعت‌ها کار متعهدانه است.',
    };

    const addition =
      categoryEnhancements[input.categorySlug || ''] ||
      ' این محصول دست‌ساز با توجه به جزئیات ساخته شده است.';

    enhancedDescription += addition;
  }

  // Generate basic tags
  const tags: string[] = [];

  // Add category tag
  if (input.categorySlug) {
    tags.push(input.categorySlug);
  }

  // Add common handmade tags
  tags.push('دست‌ساز', 'handmade', 'artisanal', 'صنایع دستی');

  // Extract potential tags from title and description
  const text = `${input.title} ${input.description}`.toLowerCase();

  const materialKeywords = [
    'پشم',
    'wool',
    'پنبه',
    'cotton',
    'ابریشم',
    'silk',
    'چرم',
    'leather',
    'چوب',
    'wood',
    'سرامیک',
    'ceramic',
  ];
  const techniqueKeywords = [
    'بافته',
    'woven',
    'دوخته',
    'sewn',
    'نقاشی',
    'painted',
    'کنده‌کاری',
    'carved',
  ];

  materialKeywords.forEach(keyword => {
    if (text.includes(keyword)) tags.push(keyword);
  });

  techniqueKeywords.forEach(keyword => {
    if (text.includes(keyword)) tags.push(keyword);
  });

  // Remove duplicates and limit to 10
  const uniqueTags = [...new Set(tags)].slice(0, 10);

  if (uniqueTags.length > 3) {
    improvements.push('Generated relevant tags');
  }

  return {
    enhancedDescription,
    suggestedTags: uniqueTags,
    confidence: 30,
    improvements:
      improvements.length > 0 ? improvements : ['No enhancements needed'],
  };
}

// Function to be called during product creation
export async function enhanceProductBeforeApproval(product: {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  categorySlug?: string;
  price?: number;
  userId?: string;
}): Promise<{
  enhanced: boolean;
  description?: string;
  tags?: string[];
  imageUrl?: string;
}> {
  try {
    console.log(`🎨 Enhancing product presentation for: ${product.title}`);

    const enhancement = await enhanceProductPresentation({
      title: product.title,
      description: product.description,
      imageUrl: product.imageUrl,
      categorySlug: product.categorySlug,
      price: product.price,
      userId: product.userId,
    });

    // Always apply all available enhancements
    // We've already paid for the API calls, so use everything we generated
    const hasTextEnhancement =
      enhancement.enhancedDescription &&
      enhancement.enhancedDescription !== product.description;
    const hasImageEnhancement =
      enhancement.enhancedImageUrl &&
      enhancement.enhancedImageUrl !== product.imageUrl;
    const hasTags =
      enhancement.suggestedTags && enhancement.suggestedTags.length > 0;

    if (hasTextEnhancement || hasImageEnhancement || hasTags) {
      console.log(`✨ Enhanced with ${enhancement.confidence}% confidence`);
      console.log(`   Text enhancement: ${hasTextEnhancement ? 'Yes' : 'No'}`);
      console.log(
        `   Image enhancement: ${hasImageEnhancement ? 'Yes' : 'No'}`
      );
      console.log(
        `   Tags added: ${hasTags ? enhancement.suggestedTags.length : 0}`
      );
      console.log(`   Improvements: ${enhancement.improvements.join(', ')}`);

      return {
        enhanced: true,
        description: enhancement.enhancedDescription || product.description,
        tags: enhancement.suggestedTags || [],
        imageUrl: enhancement.enhancedImageUrl || product.imageUrl,
      };
    }

    console.log(
      `⚠️ No enhancements generated (confidence: ${enhancement.confidence}%)`
    );
    return { enhanced: false };
  } catch (error) {
    console.error('Enhancement failed:', error);
    return { enhanced: false };
  }
}
