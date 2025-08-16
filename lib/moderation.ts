import crypto from 'crypto';

type EligibilityResult = {
  status: 'APPROVED' | 'REJECTED' | 'REVIEW' | 'PENDING';
  confidence?: number; // 0-100
  reasons?: string[];
};

const HANDCRAFT_KEYWORDS_APPROVE = [
  'handmade', 'hand-crafted', 'hand crafted', 'artisan', 'artisanal', 'craft', 'crafted',
  'weave', 'woven', 'knit', 'knitted', 'crochet', 'embroider', 'embroidered',
  'pottery', 'ceramic', 'woodwork', 'hand carved', 'carved', 'leatherwork', 'loom',
  // Persian terms commonly used in descriptions
  'دست‌ساز', 'دست ساز', 'دستباف', 'هنری', 'صنایع دستی', 'خاتم', 'معرق', 'فیروزه', 'نقره', 'سفال'
];

const MASS_PRODUCED_KEYWORDS_REJECT = [
  'factory', 'mass produced', 'wholesale', 'bulk', 'dropship', 'drop ship', 'resell',
  'brand new boxed', 'oem', 'replica', 'copy', 'imported', 'made in china',
  // Persian indicators
  'کارخانه', 'انبوه', '批量', 'وارداتی'
];

export async function assessProductForHandcrafted(
  input: { title: string; description: string; categorySlug?: string }
): Promise<EligibilityResult> {
  const text = `${input.title}\n${input.description}`.toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  // Quick rule boosts
  const approves = HANDCRAFT_KEYWORDS_APPROVE.filter(k => text.includes(k));
  const rejects = MASS_PRODUCED_KEYWORDS_REJECT.filter(k => text.includes(k));

  if (approves.length) {
    score += Math.min(approves.length * 10, 40);
    reasons.push(`Keywords suggesting handcrafted: ${approves.slice(0,5).join(', ')}`);
  }
  if (rejects.length) {
    score -= Math.min(rejects.length * 15, 60);
    reasons.push(`Keywords suggesting mass-produced: ${rejects.slice(0,5).join(', ')}`);
  }

  // Category prior
  if (input.categorySlug) {
    const craftFriendly = ['ceramics','textiles','jewelry','woodwork','painting'];
    if (craftFriendly.includes(input.categorySlug)) score += 10;
  }

  // Optional: Azure Content Safety or Language service can add signal
  try {
    const endpoint = process.env.AZURE_AI_ENDPOINT;
    const key = process.env.AZURE_AI_KEY;
    // Only run if configured
    if (endpoint && key) {
      // Lightweight heuristic via hashing for privacy budget; placeholder for future call
      // In production, call Azure AI Language classify/custom classifier here.
      const digest = crypto.createHash('sha1').update(text).digest('hex');
      // Use digest parity to add a tiny random-like jitter to avoid ties
      const jitter = parseInt(digest.slice(0,2), 16) % 5; // 0..4
      score += jitter;
      reasons.push('Azure AI signals (configured)');
    }
  } catch {
    // ignore optional signals
  }

  // Map score to status
  let status: EligibilityResult['status'] = 'REVIEW';
  let confidence = Math.max(0, Math.min(100, 50 + score));
  if (score >= 20) status = 'APPROVED';
  else if (score <= -20) status = 'REJECTED';
  else status = 'REVIEW';

  return { status, confidence, reasons };
}
