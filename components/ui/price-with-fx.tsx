import { Price } from './price';
import { getFxRates } from '@/lib/utils/fx';

interface PriceWithFxProps {
  amount: number;
  className?: string;
  showConversions?: boolean;
}

/**
 * Server component that fetches FX rates and displays price with conversions
 */
export async function PriceWithFx({
  amount,
  className,
  showConversions = true,
}: PriceWithFxProps) {
  let fxRates = {};

  if (showConversions) {
    try {
      const rates = await getFxRates();
      fxRates = {
        USD: rates.find(r => r.counter === 'USD')?.rate,
        EUR: rates.find(r => r.counter === 'EUR')?.rate,
      };
    } catch (error) {
      console.warn('Failed to fetch FX rates:', error);
    }
  }

  return (
    <Price
      amount={amount}
      className={className}
      showConversions={showConversions}
      fxRates={fxRates}
    />
  );
}
