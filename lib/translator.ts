import crypto from 'crypto';

type Provider = 'azure' | 'deepl' | 'openai' | 'mock';

const PROVIDER = (process.env.TRANSLATOR_PROVIDER || 'azure') as Provider;
const DAILY_CHAR_LIMIT = parseInt(process.env.TRANSLATOR_DAILY_CHAR_LIMIT || '1000000'); // 1M/day default
let dailyCount = 0;

// Simple in-memory LRU-ish cache for serverless runtime
const cache = new Map<string, string>();
const cacheKey = (text: string, from: string, to: string) =>
  `${from}:${to}:${crypto.createHash('sha1').update(text).digest('hex')}`;

export interface TranslateOptions {
  from: 'fa' | 'en';
  to: 'fa' | 'en';
}

export async function translateText(text: string, { from, to }: TranslateOptions): Promise<string> {
  if (!text || from === to) return text;

  const key = cacheKey(text, from, to);
  const cached = cache.get(key);
  if (cached) return cached;

  // Simple in-memory daily budget guard (resets on cold start; use persistent store in prod)
  if (text.length + dailyCount > DAILY_CHAR_LIMIT) {
    return text; // refuse translation beyond budget
  }

  let translated = text;

  if (PROVIDER === 'azure') {
    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
    const apiKey = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION; // Optional for Translator (single-service)
    if (!endpoint || !apiKey) {
      // Fallback: return original text if not configured
      return text;
    }
    const url = `${endpoint}/translate?api-version=3.0&from=${from}&to=${to}`;
    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json'
    };
    if (region) {
      // Required for Azure AI services (multi-service) or regional endpoints
      headers['Ocp-Apim-Subscription-Region'] = region;
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ Text: text }])
    });
    if (resp.ok) {
      const data = await resp.json();
      translated = data?.[0]?.translations?.[0]?.text ?? text;
    } else {
      // On failure, return original text
      translated = text;
    }
  } else if (PROVIDER === 'mock') {
    translated = text; // no-op for local dev
  } else {
    // Other providers can be added later
    translated = text;
  }

  // Basic cache with size cap
  cache.set(key, translated);
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (firstKey) cache.delete(firstKey);
  }

  dailyCount += text.length;

  return translated;
}

export async function translateProductFields(
  src: { title: string; description: string },
  from: 'fa' | 'en',
  to: 'fa' | 'en'
) {
  const [title, description] = await Promise.all([
    translateText(src.title, { from, to }),
    translateText(src.description, { from, to })
  ]);
  return { title, description };
}
