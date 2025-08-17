import type { PaymentAdapter } from "../adapter";
import crypto from "crypto";

// WARNING: This is a stub for development only
// DO NOT USE IN PRODUCTION - implement real Zarinpal integration
const STUB_SECRET = process.env.PAYMENT_STUB_SECRET || "dev-only-secret-change-in-prod";

export const ZarinpalStub: PaymentAdapter = {
  gateway: "ZARINPAL",
  
  async create({ orderId, amountToman, callbackUrl }) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Zarinpal stub cannot be used in production");
    }
    
    // Create a secure authority with cryptographic randomness
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const signature = crypto
      .createHmac("sha256", STUB_SECRET)
      .update(`${orderId}:${amountToman}:${timestamp}:${randomBytes}`)
      .digest("hex");
    
    const authority = `A-${randomBytes}-${signature.slice(0, 8)}`;
    
    return { 
      redirectUrl: `${callbackUrl}?Authority=${authority}&Status=OK&Signature=${signature}&Amount=${amountToman}`,
      authority 
    };
  },
  
  async verify({ orderId, authority }) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Zarinpal stub cannot be used in production");
    }
    
    if (!authority || !orderId) {
      return { ok: false, reason: "missing_parameters" };
    }
    
    // For stub: verify authority format and basic validation
    // In real implementation: verify with Zarinpal API
    if (!authority || !authority.startsWith("A-")) {
      return { ok: false, reason: "invalid_authority_format" };
    }
    
    // Basic authority structure validation (A-{32chars}-{8chars})
    const authorityParts = authority.split('-');
    if (authorityParts.length !== 3 || authorityParts[1].length !== 32 || authorityParts[2].length !== 8) {
      return { ok: false, reason: "invalid_authority_structure" };
    }
    
    // In production, this would verify with actual payment gateway
    return { ok: true, refId: `R-${crypto.randomBytes(8).toString('hex')}` };
  }
};