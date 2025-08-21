import type { PaymentAdapter } from '../adapter';

export const OfflineAdapter: PaymentAdapter = {
  gateway: 'OFFLINE',

  async create(input) {
    const { orderId, callbackUrl } = input;
    // Immediately "created"; redirect to a confirmation page with manual instructions
    const url = `${callbackUrl}?orderId=${orderId}&ok=1`;
    return { redirectUrl: url };
  },

  async verify() {
    // For offline, verification is manual by admin; return ok=false until admin marks paid
    return { ok: false, reason: 'manual' };
  },
};
