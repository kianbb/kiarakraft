#!/usr/bin/env tsx

// Test script to verify bilingual display logic

const testCases = [
  {
    name: 'Valid JSON - Good separation',
    reasons: JSON.stringify({
      en: 'Product is handmade; Shows artisan techniques; Good quality materials',
      fa: 'محصول دست‌ساز است؛ تکنیک‌های هنری نشان می‌دهد؛ مواد با کیفیت خوب',
    }),
  },
  {
    name: 'Mixed language in English field (BAD)',
    reasons: JSON.stringify({
      en: 'Product is دست‌ساز and shows good quality',
      fa: 'محصول دست‌ساز است و کیفیت خوبی دارد',
    }),
  },
  {
    name: 'Mixed language in Persian field (BAD)',
    reasons: JSON.stringify({
      en: 'Product is handmade and shows good quality',
      fa: 'محصول handmade است و quality خوبی دارد',
    }),
  },
  {
    name: 'Legacy format',
    reasons: 'Keywords suggesting handcrafted: دست‌ساز',
  },
  {
    name: 'PENDING status message',
    reasons: '🔍 Step 3/3: Assessing product for marketplace eligibility...',
  },
];

// Simulate the getLocalizedReasonText function logic
function getLocalizedReasonText(
  reasons: string,
  locale: 'en' | 'fa',
  status: string
): string {
  if (!reasons) return '';

  // If it's a PENDING status with progress messages, return as is
  if (status === 'PENDING') {
    return reasons;
  }

  // Only try to parse JSON for APPROVED/REJECTED statuses
  const trimmedReasons = reasons.trim();
  if (trimmedReasons.startsWith('{') && trimmedReasons.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmedReasons);
      if (parsed && typeof parsed === 'object') {
        // STRICT LANGUAGE SEPARATION
        const localizedText = locale === 'fa' ? parsed.fa : parsed.en;

        // Validate that we got the right language
        if (typeof localizedText === 'string' && localizedText.trim()) {
          // For Persian locale, prioritize Persian content
          if (locale === 'fa') {
            // Check if it's predominantly Persian (has Persian chars)
            if (/[\u0600-\u06FF]/.test(localizedText)) {
              // Check for English contamination (basic Latin letters in words)
              const englishWords =
                localizedText.match(/\b[a-zA-Z]{2,}\b/g) || [];
              // Allow some English (like brand names), but not too much
              if (englishWords.length <= 2) {
                return localizedText.trim();
              }
            }
          } else {
            // For English locale, ensure it's predominantly English
            // Check if there are NO Persian characters (clean English)
            if (!/[\u0600-\u06FF]/.test(localizedText)) {
              return localizedText.trim();
            }
          }
        }

        // If validation fails, return empty
        return '';
      }
    } catch {
      // Not valid JSON
    }
  }

  // Fallback: return empty to avoid mixed language display
  return '';
}

console.log('🧪 Testing Bilingual Display Logic\n');
console.log('='.repeat(60));

for (const testCase of testCases) {
  console.log(`\n📋 Test: ${testCase.name}`);
  console.log('-'.repeat(40));

  // Test for APPROVED status
  const status = testCase.name.includes('PENDING') ? 'PENDING' : 'APPROVED';

  // Test English locale
  const englishResult = getLocalizedReasonText(testCase.reasons, 'en', status);
  console.log(
    `English locale result: ${englishResult ? '✅ ' + englishResult.substring(0, 50) + '...' : '❌ Empty (blocked)'}`
  );

  // Test Persian locale
  const persianResult = getLocalizedReasonText(testCase.reasons, 'fa', status);
  console.log(
    `Persian locale result: ${persianResult ? '✅ ' + persianResult.substring(0, 50) + '...' : '❌ Empty (blocked)'}`
  );

  // Check for issues
  if (testCase.name.includes('BAD')) {
    if (!englishResult && !persianResult) {
      console.log('🎯 GOOD: Mixed language content was blocked!');
    } else {
      console.log('⚠️ WARNING: Mixed language content was not blocked!');
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅ Test complete!\n');
