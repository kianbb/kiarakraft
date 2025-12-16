export type ProductCategory =
  | 'ceramics'
  | 'textiles'
  | 'jewelry'
  | 'woodwork'
  | 'painting'
  | string;

function buildPrompt(
  title: string,
  description: string,
  category?: ProductCategory
) {
  const base = `High-quality product photograph, natural lighting, studio white background, centered composition, square crop, no text, no watermark.`;
  const localeHint = /[\u0600-\u06FF]/.test(title + ' ' + description)
    ? 'Persian/Iranian craft aesthetics'
    : 'Iranian craft aesthetics';

  const categoryHints: Record<string, string> = {
    ceramics:
      'Iranian handmade ceramics, pottery, glazed earthenware, subtle textures, gentle shadows',
    textiles:
      'Iranian textiles, handwoven kilim or Persian fabric, rich fibers, tactile weave',
    jewelry:
      'Iranian artisan jewelry, silver or turquoise, macro detail, soft reflections',
    woodwork:
      'Iranian woodcraft, inlay or carving, warm wood grain, fine craftsmanship',
    painting:
      'Traditional Persian-style painting or calligraphy artwork on canvas or paper, vivid pigments',
  };

  const subject = `${title}`.slice(0, 120);
  const detail = description?.slice(0, 300) || '';
  const cat = category ? categoryHints[category] || category : '';

  return `${base}\nLanguage: English.\nSubject: ${subject}.\nDetails: ${detail}.\nStyle: ${cat}.\nCultural context: ${localeHint}.`;
}

export async function generateProductImageBuffer(params: {
  title: string;
  description: string;
  category?: ProductCategory;
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  quality?: 'auto' | 'high' | 'medium' | 'low';
  model?: string;
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_BETA;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const prompt = buildPrompt(params.title, params.description, params.category);
  const endpoint = 'https://api.openai.com/v1/images/generations';
  const tryModel = async (model: string) => {
    const isGptImage = model.startsWith('gpt-image');
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size: params.size || '1024x1024',
        n: 1,
        ...(isGptImage && { quality: params.quality || 'high' }),
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const err: Error & { __raw?: string } = new Error(
        `OpenAI image generation failed: ${resp.status} ${text}`
      );
      // Attach raw for caller
      err.__raw = text;
      throw err;
    }
    const data = (await resp.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = data?.data?.[0];
    if (!item) throw new Error('Image generation returned no data');
    if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item.url) {
      const imgResp = await fetch(item.url);
      if (!imgResp.ok)
        throw new Error(`Fetch image URL failed: ${imgResp.status}`);
      const ab = await imgResp.arrayBuffer();
      return Buffer.from(ab);
    }
    throw new Error('Image generation returned no data');
  };

  const preferred =
    params.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';

  // Fallback chain: gpt-image-1.5 -> gpt-image-1 -> dall-e-3
  const fallbackModels = ['gpt-image-1', 'dall-e-3'];

  try {
    return await tryModel(preferred);
  } catch (e: unknown) {
    let raw = '';
    if (typeof e === 'object' && e !== null && '__raw' in e) {
      raw = String((e as { __raw?: unknown }).__raw ?? '');
    } else if (e instanceof Error) {
      raw = String(e.message || '');
    }

    // Check if model access is restricted
    const needsVerification =
      /must be verified to use the model/i.test(raw) ||
      /model.*not found/i.test(raw) ||
      /invalid.*model/i.test(raw);

    if (needsVerification && preferred.startsWith('gpt-image')) {
      // Try fallback models in order
      for (const fallback of fallbackModels) {
        try {
          return await tryModel(fallback);
        } catch {
          continue;
        }
      }
    }
    throw e;
  }
}

export function inferCategoryFromSlugOrName(
  slugOrName?: string
): ProductCategory | undefined {
  if (!slugOrName) return undefined;
  const s = slugOrName.toLowerCase();
  if (s.includes('ceramic') || s.includes('سرام') || s.includes('سفال'))
    return 'ceramics';
  if (
    s.includes('textile') ||
    s.includes('fabric') ||
    s.includes('پارچه') ||
    s.includes('فرش') ||
    s.includes('گلیم')
  )
    return 'textiles';
  if (
    s.includes('jewel') ||
    s.includes('نقره') ||
    s.includes('طلا') ||
    s.includes('زیور')
  )
    return 'jewelry';
  if (
    s.includes('wood') ||
    s.includes('چوب') ||
    s.includes('خاتم') ||
    s.includes('معرق')
  )
    return 'woodwork';
  if (
    s.includes('paint') ||
    s.includes('نگار') ||
    s.includes('نقاش') ||
    s.includes('خوشنوی')
  )
    return 'painting';
  return undefined;
}
