/**
 * Basic Profanity Filter
 * First-line defense against inappropriate content
 */

// Common profanity patterns in English and Persian
// Note: This is a basic filter, AI assessment provides deeper content moderation
const PROFANITY_PATTERNS = {
  // English offensive words (partial list, patterns to avoid false positives)
  english: [
    /\bf[u*]c[k*]\b/gi,
    /\bs[h*]i[t*]\b/gi,
    /\ba[s$]{2}(hole)?\b/gi,
    /\bb[i!*]tch\b/gi,
    /\bd[a@]mn\b/gi,
    /\bh[e3]ll\b/gi,
    /\bc[u*]nt\b/gi,
    /\bd[i!1]ck\b/gi,
    /\bp[e3]n[i!1]s\b/gi,
    /\bv[a@]g[i!1]n[a@]\b/gi,
    /\bn[i!1]gg[e3]r\b/gi,
    /\bf[a@]g(got)?\b/gi,
    /\bwh[o0]re\b/gi,
    /\bsl[u*]t\b/gi,
  ],

  // Persian offensive words (کلمات رکیک فارسی)
  persian: [
    /کیر/gi,
    /کص/gi,
    /کون/gi,
    /جنده/gi,
    /قحبه/gi,
    /پفیوز/gi,
    /عوضی/gi,
    /حرومزاده/gi,
    /مادرجنده/gi,
    /خایه/gi,
    /گایید/gi,
    /لاشی/gi,
    /بی‌ناموس/gi,
  ],

  // Spam/scam indicators
  spam: [
    /\b(viagra|cialis|casino|lottery|betting)\b/gi,
    /\b(click\s+here|limited\s+time|act\s+now)\b/gi,
    /\b(congratulations.*won|claim.*prize)\b/gi,
    /\b(earn\s+money\s+fast|get\s+rich\s+quick)\b/gi,
    /(قیمت.*ارزان|رایگان.*دانلود|کسب.*درآمد)/gi,
  ],

  // Hate speech patterns
  hate: [
    /\b(kill\s+(all|the)\s+\w+)\b/gi,
    /\b(death\s+to\s+\w+)\b/gi,
    /\bhate\s+(all\s+)?\w+s?\b/gi,
    /(مرگ\s+بر|نابود\s+باد)/gi,
  ],

  // Adult content indicators
  adult: [
    /\b(xxx|porn|sex|nude|naked)\b/gi,
    /\b(adult\s+content|18\+|nsfw)\b/gi,
    /(سکس|پورن|برهنه|لخت)/gi,
  ],
};

/**
 * Check if text contains profanity or inappropriate content
 */
export function containsProfanity(text: string): {
  hasProfanity: boolean;
  categories: string[];
  matchedPatterns: string[];
} {
  if (!text || typeof text !== 'string') {
    return { hasProfanity: false, categories: [], matchedPatterns: [] };
  }

  const categories: Set<string> = new Set();
  const matchedPatterns: Set<string> = new Set();

  // Check each category
  for (const [category, patterns] of Object.entries(PROFANITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        categories.add(category);
        const match = text.match(pattern);
        if (match) {
          // Store sanitized version of match (first/last letter only)
          const word = match[0];
          if (word.length > 2) {
            matchedPatterns.add(
              `${word[0]}${'*'.repeat(word.length - 2)}${word[word.length - 1]}`
            );
          } else {
            matchedPatterns.add('**');
          }
        }
      }
    }
  }

  return {
    hasProfanity: categories.size > 0,
    categories: Array.from(categories),
    matchedPatterns: Array.from(matchedPatterns),
  };
}

/**
 * Clean text by removing or masking profanity
 */
export function cleanProfanity(
  text: string,
  replacement: string = '***'
): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let cleaned = text;

  // Replace all profanity patterns
  for (const patterns of Object.values(PROFANITY_PATTERNS)) {
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, replacement);
    }
  }

  return cleaned;
}

/**
 * Calculate profanity score (0-100)
 * Higher score = more problematic content
 */
export function calculateProfanityScore(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  let score = 0;
  let profanityCount = 0;

  // Check each category with different weights
  const weights = {
    english: 10,
    persian: 10,
    spam: 5,
    hate: 20, // Hate speech weighted higher
    adult: 15,
  };

  for (const [category, patterns] of Object.entries(PROFANITY_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        profanityCount += matches.length;
        score +=
          matches.length * (weights[category as keyof typeof weights] || 10);
      }
    }
  }

  // Calculate percentage based on word count and severity
  const baseScore = Math.min(100, (profanityCount / words.length) * 100);
  const severityScore = Math.min(100, score / 10);

  return Math.round((baseScore + severityScore) / 2);
}

/**
 * Quick check for obviously inappropriate content
 * Used as pre-filter before AI assessment
 */
export function quickProfanityCheck(
  title: string,
  description: string,
  threshold: number = 20
): {
  pass: boolean;
  score: number;
  reason?: string;
} {
  const combinedText = `${title} ${description}`.toLowerCase();

  // Check for profanity
  const profanityResult = containsProfanity(combinedText);

  if (profanityResult.hasProfanity) {
    const score = calculateProfanityScore(combinedText);

    // Immediate rejection for hate speech
    if (profanityResult.categories.includes('hate')) {
      return {
        pass: false,
        score: 100,
        reason: 'Content contains hate speech',
      };
    }

    // Immediate rejection for adult content in marketplace
    if (profanityResult.categories.includes('adult')) {
      return {
        pass: false,
        score: score,
        reason: 'Adult content not allowed',
      };
    }

    // Check threshold for other categories
    if (score > threshold) {
      return {
        pass: false,
        score,
        reason: `Content flagged for: ${profanityResult.categories.join(', ')}`,
      };
    }
  }

  return { pass: true, score: 0 };
}

/**
 * Validate user-generated content
 */
export function validateUserContent(content: {
  title?: string;
  description?: string;
  tags?: string[];
}): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check title
  if (content.title) {
    const titleCheck = containsProfanity(content.title);
    if (titleCheck.hasProfanity) {
      if (
        titleCheck.categories.includes('hate') ||
        titleCheck.categories.includes('adult')
      ) {
        errors.push('Title contains inappropriate content');
      } else {
        warnings.push('Title may contain inappropriate language');
      }
    }
  }

  // Check description
  if (content.description) {
    const descCheck = containsProfanity(content.description);
    if (descCheck.hasProfanity) {
      if (
        descCheck.categories.includes('hate') ||
        descCheck.categories.includes('adult')
      ) {
        errors.push('Description contains inappropriate content');
      } else if (descCheck.categories.includes('spam')) {
        warnings.push('Description appears to contain spam');
      } else {
        warnings.push('Description may contain inappropriate language');
      }
    }
  }

  // Check tags
  if (content.tags && Array.isArray(content.tags)) {
    for (const tag of content.tags) {
      const tagCheck = containsProfanity(tag);
      if (tagCheck.hasProfanity) {
        errors.push(`Tag "${tag}" contains inappropriate content`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
