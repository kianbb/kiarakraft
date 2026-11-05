import { reserveAICall } from './ai-budget';

const MAX_TEXT_LENGTH = 5000;
const MAX_TEXTS_PER_REQUEST = 25;
const MAX_BATCH_LENGTH = 15000;
const MAX_DAILY_TRANSLATIONS = 1000;
const translationCounts = new Map<string, { count: number; resetAt: number }>();

export interface TranslationResult {
  translations: Array<{ text: string; to: string }>;
}

function validLanguage(language: string) {
  return (
    typeof language === 'string' &&
    /^[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,2}$/i.test(language)
  );
}

function validText(text: unknown): text is string {
  return typeof text === 'string' && text.length <= MAX_TEXT_LENGTH;
}

// An additional process-local abuse throttle; the durable AI reservation is the
// spending boundary. This map is bounded and creates no background timers.
function checkAndUpdateQuota(ipAddress?: string, count = 1): boolean {
  if (!ipAddress) return true;
  const now = Date.now();
  if (translationCounts.size >= 1000) {
    for (const [ip, entry] of translationCounts) {
      if (entry.resetAt <= now) translationCounts.delete(ip);
    }
  }
  const entry = translationCounts.get(ipAddress);
  if (entry && entry.resetAt > now) {
    if (entry.count + count > MAX_DAILY_TRANSLATIONS) return false;
    entry.count += count;
    return true;
  }
  if (translationCounts.size >= 1000 && !entry) return false;
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  translationCounts.set(ipAddress, { count, resetAt: tomorrow.getTime() });
  return count <= MAX_DAILY_TRANSLATIONS;
}

async function requestAzure(
  action: 'translate' | 'detect',
  texts: string[],
  targetLanguage?: string,
  sourceLanguage?: string
): Promise<unknown> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  if (!key) return null;
  const endpoint = new URL(
    process.env.AZURE_TRANSLATOR_ENDPOINT ||
      'https://api.cognitive.microsofttranslator.com'
  );
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.search
  )
    return null;
  // Preserve custom Azure resource paths such as /translator/text/v3.0.
  endpoint.pathname = endpoint.pathname.replace(/\/?$/, '/');
  const url = new URL(action, endpoint);
  url.searchParams.set('api-version', '3.0');
  if (targetLanguage) url.searchParams.set('to', targetLanguage);
  if (sourceLanguage) url.searchParams.set('from', sourceLanguage);
  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/json',
  };
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (region && region !== 'global')
    headers['Ocp-Apim-Subscription-Region'] = region;

  // Public catalog requests and background work share this explicit service
  // actor. It has no login account and cannot bypass the global/actor quotas.
  await reserveAICall({
    userId: 'service:translation',
    kind: 'translation',
    purpose: `azure.${action}`,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(texts.map(text => ({ text }))),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return null;
  return response.json();
}

function translationAt(
  result: unknown,
  index: number,
  target: string
): string | undefined {
  if (!Array.isArray(result)) return undefined;
  const translation = result[index]?.translations?.[0];
  const text = translation?.text;
  return typeof text === 'string' &&
    text.trim().length > 0 &&
    text.length <= 20000 &&
    typeof translation?.to === 'string' &&
    translation.to.toLowerCase() === target.toLowerCase()
    ? text
    : undefined;
}

export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string,
  ipAddress?: string
): Promise<string> {
  if (
    !validText(text) ||
    !text.trim() ||
    targetLanguage === sourceLanguage ||
    !validLanguage(targetLanguage) ||
    (sourceLanguage && !validLanguage(sourceLanguage)) ||
    !checkAndUpdateQuota(ipAddress)
  )
    return text;
  try {
    const result = await requestAzure(
      'translate',
      [text],
      targetLanguage,
      sourceLanguage
    );
    return translationAt(result, 0, targetLanguage) ?? text;
  } catch {
    // Denial, tracking failure and network failure all leave the source intact.
    // No retry or provider/error-body logging can spend again or expose text.
    return text;
  }
}

export async function translateTexts(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string,
  ipAddress?: string
): Promise<string[]> {
  if (
    !Array.isArray(texts) ||
    !texts.length ||
    texts.length > MAX_TEXTS_PER_REQUEST ||
    texts.some(text => !validText(text)) ||
    texts.reduce((sum, text) => sum + text.length, 0) > MAX_BATCH_LENGTH ||
    texts.every(text => !text.trim()) ||
    targetLanguage === sourceLanguage ||
    !validLanguage(targetLanguage) ||
    (sourceLanguage && !validLanguage(sourceLanguage)) ||
    !checkAndUpdateQuota(ipAddress, texts.length)
  )
    return texts;
  try {
    const result = await requestAzure(
      'translate',
      texts,
      targetLanguage,
      sourceLanguage
    );
    return texts.map(
      (text, index) => translationAt(result, index, targetLanguage) ?? text
    );
  } catch {
    return texts;
  }
}

export async function detectLanguage(text: string): Promise<string> {
  if (!validText(text) || !text.trim()) return 'fa';
  try {
    const result = await requestAzure('detect', [text]);
    const language = Array.isArray(result) ? result[0]?.language : undefined;
    return validLanguage(language) ? language : 'fa';
  } catch {
    return 'fa';
  }
}
