export type ProductCategory = 'ceramics' | 'textiles' | 'jewelry' | 'woodwork' | 'painting' | string;

function buildPrompt(title: string, description: string, category?: ProductCategory) {
  const base = `High-quality product photograph, natural lighting, studio white background, centered composition, square crop, no text, no watermark.`;
  const localeHint = /[\u0600-\u06FF]/.test(title + ' ' + description) ? 'Persian/Iranian craft aesthetics' : 'Iranian craft aesthetics';

  const categoryHints: Record<string, string> = {
    ceramics: 'Iranian handmade ceramics, pottery, glazed earthenware, subtle textures, gentle shadows',
    textiles: 'Iranian textiles, handwoven kilim or Persian fabric, rich fibers, tactile weave',
    jewelry: 'Iranian artisan jewelry, silver or turquoise, macro detail, soft reflections',
    woodwork: 'Iranian woodcraft, inlay or carving, warm wood grain, fine craftsmanship',
    painting: 'Traditional Persian-style painting or calligraphy artwork on canvas or paper, vivid pigments',
  };

  const subject = `${title}`.slice(0, 120);
  const detail = description?.slice(0, 300) || '';
  const cat = category ? (categoryHints[category] || category) : '';

  return `${base}\nSubject: ${subject}.\nDetails: ${detail}.\nStyle: ${cat}.\nCultural context: ${localeHint}.`;
}

export async function generateProductImageBuffer(params: {
  title: string;
  description: string;
  category?: ProductCategory;
  size?: '512x512' | '1024x1024' | '2048x2048';
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_BETA;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const prompt = buildPrompt(params.title, params.description, params.category);

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: params.size || '1024x1024',
      n: 1
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenAI image generation failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no data');
  return Buffer.from(b64, 'base64');
}

export function inferCategoryFromSlugOrName(slugOrName?: string): ProductCategory | undefined {
  if (!slugOrName) return undefined;
  const s = slugOrName.toLowerCase();
  if (s.includes('ceramic') || s.includes('سرام') || s.includes('سفال')) return 'ceramics';
  if (s.includes('textile') || s.includes('fabric') || s.includes('پارچه') || s.includes('فرش') || s.includes('گلیم')) return 'textiles';
  if (s.includes('jewel') || s.includes('نقره') || s.includes('طلا') || s.includes('زیور')) return 'jewelry';
  if (s.includes('wood') || s.includes('چوب') || s.includes('خاتم') || s.includes('معرق')) return 'woodwork';
  if (s.includes('paint') || s.includes('نگار') || s.includes('نقاش') || s.includes('خوشنوی')) return 'painting';
  return undefined;
}
