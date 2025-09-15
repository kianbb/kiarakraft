// Bilingual progress messages for AI processing steps
export const PROGRESS_MESSAGES = {
  step1: {
    en: '🔄 Step 1/3: Validating product data...',
    fa: '🔄 مرحله ۱/۳: بررسی اطلاعات محصول...',
  },
  step2: {
    en: '🎨 Step 2/3: Enhancing product presentation with AI...',
    fa: '🎨 مرحله ۲/۳: بهبود نمایش محصول با هوش مصنوعی...',
  },
  step3: {
    en: '🔍 Step 3/3: Assessing product for marketplace eligibility...',
    fa: '🔍 مرحله ۳/۳: ارزیابی محصول برای پذیرش در بازار...',
  },
  enhancementComplete: {
    en: '✨ Enhancement complete. Starting eligibility assessment...',
    fa: '✨ بهبود محصول کامل شد. شروع ارزیابی پذیرش...',
  },
  enhancementSkipped: {
    en: '⏭️ Enhancement skipped. Starting eligibility assessment...',
    fa: '⏭️ بهبود محصول رد شد. شروع ارزیابی پذیرش...',
  },
};

// Helper function to get bilingual JSON string
export function getBilingualProgress(
  key: keyof typeof PROGRESS_MESSAGES
): string {
  return JSON.stringify(PROGRESS_MESSAGES[key]);
}
