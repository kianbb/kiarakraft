import OpenAI from 'openai';

type EligibilityResult = {
  status: 'APPROVED' | 'REJECTED';
  confidence: number; // 0-100
  reasons: string[];
};

// Define clear marketplace criteria
const MARKETPLACE_CRITERIA = `
You are evaluating products for Kiara Kraft, a premium Iranian handmade marketplace similar to Etsy.

EVALUATION CRITERIA:

1. HANDMADE/ARTISANAL QUALITY (Required)
   - Product must show clear evidence of being handmade, handcrafted, or artisanal
   - Look for: unique details, slight variations, artisan techniques, traditional craftsmanship
   - Reject: mass-produced items, factory-made products, dropshipped goods

2. ORIGINALITY & CREATIVITY
   - Products should show creative effort and personal touch
   - Custom designs, unique patterns, or traditional motifs are positive signals
   - Generic stock items or simple reselling should be rejected

3. PRODUCT PRESENTATION
   - Clear, well-lit photos showing the actual product
   - Honest representation of the item
   - Reject: stock photos, misleading images, very poor quality photos

4. MARKETPLACE APPROPRIATENESS
   - Products should be legal and appropriate for an online marketplace
   - No weapons, counterfeit goods, or inappropriate content
   - Traditional Iranian crafts and modern handmade items are both welcome

5. CULTURAL & ARTISTIC VALUE
   - Traditional Iranian/Persian crafts are highly valued (carpets, pottery, calligraphy, etc.)
   - Modern handmade items with cultural elements are encouraged
   - International handmade styles are also acceptable if truly handcrafted

IMPORTANT: Be inclusive of various skill levels - from beginner crafters to master artisans.
The key requirement is that items are genuinely handmade with effort and care.

Based on these criteria, you must return ONLY "APPROVED" or "REJECTED" with clear reasoning.
Never return "REVIEW" or "PENDING" - make a definitive decision.
If uncertain, lean towards APPROVED to support artisans, unless there are clear red flags.
`;

export async function assessProductWithAI(input: {
  title: string;
  description: string;
  imageUrl?: string;
  categorySlug?: string;
  price?: number;
}): Promise<EligibilityResult> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      // Fallback to simple keyword-based assessment if no API key
      return fallbackAssessment(input);
    }

    const openai = new OpenAI({
      apiKey: openaiKey,
    });

    // Prepare the messages for GPT-4 Vision
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: MARKETPLACE_CRITERIA,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please evaluate this product for our handmade marketplace:

Title: ${input.title}
Description: ${input.description}
Category: ${input.categorySlug || 'Not specified'}
Price: ${input.price ? `${input.price} Toman` : 'Not specified'}

Analyze the product based on our criteria and respond with a JSON object containing:
1. status: "APPROVED" or "REJECTED" (definitive decision)
2. confidence: number between 0-100 (your confidence level)
3. reasons: array of strings (clear explanations for your decision)

You MUST respond with valid JSON in this exact format:
{
  "status": "APPROVED" or "REJECTED",
  "confidence": 85,
  "reasons": ["reason 1", "reason 2", "reason 3"]
}

${input.imageUrl ? 'An image of the product is provided below.' : 'No image was provided, evaluate based on text only.'}`,
          },
          ...(input.imageUrl
            ? [
                {
                  type: 'image_url' as const,
                  image_url: {
                    url: input.imageUrl,
                    detail: 'low' as const, // Use 'low' to save tokens
                  },
                },
              ]
            : []),
        ],
      },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07', // Using GPT-5 mini for better assessment capabilities
      messages,
      max_completion_tokens: 1000, // GPT-5 mini uses max_completion_tokens parameter
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'product_assessment',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['APPROVED', 'REJECTED'],
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 100,
              },
              reasons: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['status', 'confidence', 'reasons'],
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
      status: 'APPROVED' | 'REJECTED';
      confidence: number;
      reasons: string[];
    };

    // Ensure status is only APPROVED or REJECTED
    if (result.status !== 'APPROVED' && result.status !== 'REJECTED') {
      result.status = result.confidence >= 50 ? 'APPROVED' : 'REJECTED';
    }

    return {
      status: result.status,
      confidence: Math.max(0, Math.min(100, result.confidence)),
      reasons: result.reasons || [],
    };
  } catch (error) {
    console.error('AI assessment error:', error);
    // Fallback to simple assessment on error
    return fallbackAssessment(input);
  }
}

// Enhanced fallback assessment when AI is not available
function fallbackAssessment(input: {
  title: string;
  description: string;
  categorySlug?: string;
}): EligibilityResult {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const reasons: string[] = [];
  let score = 50; // Start neutral

  // Positive indicators (handmade/artisanal)
  const positiveKeywords = [
    // English
    'handmade',
    'handcrafted',
    'artisan',
    'custom',
    'bespoke',
    'hand-painted',
    'hand-sewn',
    'hand-knitted',
    'hand-woven',
    'pottery',
    'ceramic',
    'woodwork',
    'embroidered',
    'crocheted',
    // Persian/Farsi
    'دست‌ساز',
    'دست ساز',
    'دستباف',
    'هنری',
    'صنایع دستی',
    'خاتم',
    'معرق',
    'فیروزه',
    'سفال',
    'گلیم',
    'قالی',
    'منبت',
    'مینا',
    'قلمزنی',
    'ترمه',
    'سوزن‌دوزی',
  ];

  // Negative indicators (mass-produced)
  const negativeKeywords = [
    'wholesale',
    'bulk',
    'factory',
    'mass-produced',
    'dropship',
    'imported',
    'resell',
    'distributor',
    'supplier',
    'کارخانه',
    'عمده',
    'وارداتی',
    'تولید انبوه',
  ];

  // Check positive keywords
  const foundPositive = positiveKeywords.filter(k => text.includes(k));
  if (foundPositive.length > 0) {
    score += foundPositive.length * 15;
    reasons.push(
      `Contains handmade indicators: ${foundPositive.slice(0, 3).join(', ')}`
    );
  }

  // Check negative keywords
  const foundNegative = negativeKeywords.filter(k => text.includes(k));
  if (foundNegative.length > 0) {
    score -= foundNegative.length * 25;
    reasons.push(
      `Contains mass-produced indicators: ${foundNegative.slice(0, 3).join(', ')}`
    );
  }

  // Boost for craft-friendly categories
  const craftCategories = [
    'textiles',
    'jewelry',
    'ceramics',
    'woodwork',
    'art',
  ];
  if (input.categorySlug && craftCategories.includes(input.categorySlug)) {
    score += 10;
    reasons.push('Craft-friendly category');
  }

  // Description length check (very short descriptions are suspicious)
  if (input.description.length < 20) {
    score -= 15;
    reasons.push('Very short description');
  } else if (input.description.length > 100) {
    score += 10;
    reasons.push('Detailed description provided');
  }

  // Make definitive decision - no REVIEW status
  const status: EligibilityResult['status'] =
    score >= 50 ? 'APPROVED' : 'REJECTED';
  const confidence = Math.max(0, Math.min(100, Math.abs(score - 50) + 30));

  if (reasons.length === 0) {
    reasons.push(
      status === 'APPROVED'
        ? 'Product appears suitable for marketplace'
        : 'Product does not meet marketplace criteria'
    );
  }

  return { status, confidence, reasons };
}

// Export the legacy function name for backward compatibility
export async function assessProductForHandcrafted(input: {
  title: string;
  description: string;
  categorySlug?: string;
}): Promise<EligibilityResult> {
  // Use the fallback assessment for legacy calls without images
  return fallbackAssessment(input);
}
