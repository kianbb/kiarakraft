import { OfflineAdapter } from './adapters/offline';
import { ZarinpalStub } from './adapters/zarinpalStub';
import { assertProviderAllowed } from '../deployment-policy';

const gateway = process.env.PAYMENT_GATEWAY ?? 'OFFLINE'; // "OFFLINE" | "ZARINPAL"
if (gateway !== 'OFFLINE') assertProviderAllowed('payments');

export const adapter = gateway === 'ZARINPAL' ? ZarinpalStub : OfflineAdapter;
