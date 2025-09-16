import fetch from 'node-fetch';

// Security limits
const MAX_TEXT_LENGTH = 5000; // Maximum characters per translation
const MAX_TEXTS_PER_REQUEST = 25; // Maximum texts in batch translation
const MAX_DAILY_TRANSLATIONS = 1000; // Per IP address
const translationCounts = new Map<string, { count: number; resetAt: Date }>();

// Clean up expired entries periodically (every hour)
setInterval(() => {
  const now = new Date();
  for (const [ip, entry] of translationCounts.entries()) {
    if (entry.resetAt <= now) {
      translationCounts.delete(ip);
    }
  }
}, 3600000);

// Azure Translator configuration - load dynamically to support env changes
function getAzureConfig() {
  return {
    key: process.env.AZURE_TRANSLATOR_KEY,
    endpoint:
      process.env.AZURE_TRANSLATOR_ENDPOINT ||
      'https://api.cognitive.microsofttranslator.com',
    region: process.env.AZURE_TRANSLATOR_REGION || 'global',
  };
}

export interface TranslationResult {
  translations: Array<{
    text: string;
    to: string;
  }>;
}

/**
 * Translate text using Azure Translator API
 * @param text - Text to translate
 * @param targetLanguage - Target language code (e.g., 'en', 'fa')
 * @param sourceLanguage - Source language code (optional, will auto-detect if not provided)
 * @param ipAddress - IP address for rate limiting (optional)
 * @returns Translated text
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string,
  ipAddress?: string
): Promise<string> {
  // Security: Enforce text length limit
  if (text && text.length > MAX_TEXT_LENGTH) {
    console.error(
      `Text too long for translation: ${text.length} chars (max: ${MAX_TEXT_LENGTH})`
    );
    return text; // Return original text instead of null for compatibility
  }

  // Security: Check daily quota per IP (if IP provided)
  if (ipAddress && !checkAndUpdateQuota(ipAddress)) {
    console.warn(`Daily translation limit reached for IP: ${ipAddress}`);
    return text; // Return original text when quota exceeded
  }

  const config = getAzureConfig();

  if (!config.key) {
    console.warn(
      'Azure Translator API key not configured, returning original text'
    );
    return text;
  }

  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    const url = new URL('/translate', config.endpoint);
    url.searchParams.append('api-version', '3.0');
    url.searchParams.append('to', targetLanguage);

    if (sourceLanguage) {
      url.searchParams.append('from', sourceLanguage);
    }

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': config.key,
      'Content-Type': 'application/json',
    };

    // Only add region header if not global
    if (config.region && config.region !== 'global') {
      headers['Ocp-Apim-Subscription-Region'] = config.region;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify([{ text }]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure Translator API error:', response.status, errorText);
      return text;
    }

    const results = (await response.json()) as TranslationResult[];

    if (
      results &&
      results[0] &&
      results[0].translations &&
      results[0].translations[0]
    ) {
      return results[0].translations[0].text;
    }

    return text;
  } catch (error) {
    console.error('Translation failed:', error);
    return text;
  }
}

/**
 * Translate multiple texts in a single request
 * @param texts - Array of texts to translate
 * @param targetLanguage - Target language code
 * @param sourceLanguage - Source language code (optional)
 * @param ipAddress - IP address for rate limiting (optional)
 * @returns Array of translated texts
 */
export async function translateTexts(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string,
  ipAddress?: string
): Promise<string[]> {
  // Security: Enforce batch size limit
  if (texts && texts.length > MAX_TEXTS_PER_REQUEST) {
    console.error(
      `Too many texts for batch translation: ${texts.length} (max: ${MAX_TEXTS_PER_REQUEST})`
    );
    return texts; // Return original texts
  }

  // Security: Check text length limits
  const totalLength = texts.reduce(
    (sum, text) => sum + (text ? text.length : 0),
    0
  );
  if (totalLength > MAX_TEXT_LENGTH * 3) {
    // Allow 3x for batch, but still reasonable
    console.error(
      `Total text too long for batch translation: ${totalLength} chars`
    );
    return texts;
  }

  // Security: Check daily quota per IP (count as multiple translations)
  if (ipAddress && !checkAndUpdateQuota(ipAddress, texts.length)) {
    console.warn(`Daily translation limit reached for IP: ${ipAddress}`);
    return texts;
  }

  const config = getAzureConfig();

  if (!config.key) {
    console.warn(
      'Azure Translator API key not configured, returning original texts'
    );
    return texts;
  }

  if (!texts || texts.length === 0) {
    return texts;
  }

  try {
    const url = new URL('/translate', config.endpoint);
    url.searchParams.append('api-version', '3.0');
    url.searchParams.append('to', targetLanguage);

    if (sourceLanguage) {
      url.searchParams.append('from', sourceLanguage);
    }

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': config.key,
      'Content-Type': 'application/json',
    };

    // Only add region header if not global
    if (config.region && config.region !== 'global') {
      headers['Ocp-Apim-Subscription-Region'] = config.region;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(texts.map(text => ({ text }))),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure Translator API error:', response.status, errorText);
      return texts;
    }

    const results = (await response.json()) as TranslationResult[];

    return results.map((result, index) => {
      if (result && result.translations && result.translations[0]) {
        return result.translations[0].text;
      }
      return texts[index];
    });
  } catch (error) {
    console.error('Translation failed:', error);
    return texts;
  }
}

/**
 * Check and update translation quota for an IP address
 * @param ipAddress - IP address to check
 * @param count - Number of translations to count (default: 1)
 * @returns true if within quota, false if exceeded
 */
function checkAndUpdateQuota(ipAddress: string, count: number = 1): boolean {
  const now = new Date();
  const entry = translationCounts.get(ipAddress);

  if (entry) {
    if (entry.resetAt > now) {
      if (entry.count + count > MAX_DAILY_TRANSLATIONS) {
        return false; // Quota exceeded
      }
      entry.count += count;
    } else {
      // Reset expired entry
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      translationCounts.set(ipAddress, { count, resetAt: tomorrow });
    }
  } else {
    // Create new entry
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    translationCounts.set(ipAddress, { count, resetAt: tomorrow });
  }

  return true;
}

/**
 * Detect the language of a text
 * @param text - Text to analyze
 * @returns Detected language code
 */
export async function detectLanguage(text: string): Promise<string> {
  const config = getAzureConfig();

  if (!config.key) {
    // Default to Persian for Iranian marketplace
    return 'fa';
  }

  try {
    const url = new URL('/detect', config.endpoint);
    url.searchParams.append('api-version', '3.0');

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': config.key,
      'Content-Type': 'application/json',
    };

    // Only add region header if not global
    if (config.region && config.region !== 'global') {
      headers['Ocp-Apim-Subscription-Region'] = config.region;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify([{ text }]),
    });

    if (!response.ok) {
      console.error('Language detection failed:', response.status);
      return 'fa';
    }

    const results = (await response.json()) as Array<{
      language: string;
      score: number;
      isTranslationSupported: boolean;
      isTransliterationSupported: boolean;
    }>;

    if (results && results[0] && results[0].language) {
      return results[0].language;
    }

    return 'fa';
  } catch (error) {
    console.error('Language detection failed:', error);
    return 'fa';
  }
}
