import fetch from 'node-fetch';

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
 * @returns Translated text
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
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
 * @returns Array of translated texts
 */
export async function translateTexts(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string[]> {
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
