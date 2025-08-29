import { prisma } from '@/lib/db';

export interface FxRate {
  base: string;
  counter: string;
  rate: number;
  fetchedAt: Date;
}

/**
 * Get current FX rates from database
 */
export async function getFxRates(): Promise<FxRate[]> {
  try {
    return await prisma.fxRate.findMany({
      where: { base: 'IRR' },
      orderBy: { counter: 'asc' },
    });
  } catch (error) {
    console.error('Failed to fetch FX rates:', error);
    return [];
  }
}

/**
 * Convert IRR (Toman) to other currencies using current rates
 */
export async function convertPrice(
  amountToman: number,
  targetCurrency: 'USD' | 'EUR'
): Promise<number | null> {
  try {
    const rates = await getFxRates();
    const rate = rates.find(r => r.counter === targetCurrency);

    if (!rate) {
      return null;
    }

    // Convert Toman to IRR (1 Toman = 10 IRR), then to target currency
    const amountIRR = amountToman * 10;
    return amountIRR * rate.rate;
  } catch (error) {
    console.error('Failed to convert price:', error);
    return null;
  }
}

/**
 * Format converted price with currency symbol
 */
export function formatConvertedPrice(
  amount: number,
  currency: 'USD' | 'EUR',
  locale: string = 'en'
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'USD' ? 2 : 2,
    maximumFractionDigits: currency === 'USD' ? 2 : 2,
  });

  return formatter.format(amount);
}

/**
 * Get cache key for FX rates (used for caching)
 */
export function getFxCacheKey(): string {
  return 'fx_rates';
}

/**
 * Check if FX rates are stale (older than 24 hours)
 */
export function areRatesStale(rates: FxRate[]): boolean {
  if (rates.length === 0) return true;

  const latestUpdate = Math.max(...rates.map(r => r.fetchedAt.getTime()));
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  return now - latestUpdate > dayInMs;
}
