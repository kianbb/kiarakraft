import { OfflineAdapter } from './adapters/offline';

export function getOfflinePaymentAdapter() {
  const gateway = process.env.PAYMENT_GATEWAY;
  return gateway === undefined || gateway === 'OFFLINE' ? OfflineAdapter : null;
}
