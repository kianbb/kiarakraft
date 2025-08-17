export type CreatePaymentInput = {
  orderId: string;
  amountToman: number;
  callbackUrl: string;
};

export type VerifyPaymentInput = {
  orderId: string;
  authority?: string;
};

export type CreateResult = {
  redirectUrl: string;
  authority?: string;
};

export interface PaymentAdapter {
  create(input: CreatePaymentInput): Promise<CreateResult>;
  verify(input: VerifyPaymentInput): Promise<
    { ok: true; refId?: string } | { ok: false; reason?: string }
  >;
  gateway: "OFFLINE" | "ZARINPAL" | "IDPAY";
}