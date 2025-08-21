import { OfflineAdapter } from './adapters/offline';
import { ZarinpalStub } from './adapters/zarinpalStub';

const gateway = process.env.PAYMENT_GATEWAY ?? 'OFFLINE'; // "OFFLINE" | "ZARINPAL"

export const adapter = gateway === 'ZARINPAL' ? ZarinpalStub : OfflineAdapter;
