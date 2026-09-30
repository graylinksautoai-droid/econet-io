/**
 * Payment configuration — server-side only.
 *
 * Environment variables (NEVER commit real values):
 *   PAYMENT_PROVIDER        — 'paystack' (default when keys present)
 *   PAYSTACK_SECRET_KEY     — server-only secret, used for API + webhook HMAC
 *   PAYSTACK_PUBLIC_KEY     — optional, only if an inline/integration needs it
 *   PAYSTACK_CALLBACK_URL   — absolute URL Paystack redirects to after checkout
 *   PLATFORM_FEE_BPS        — platform service fee in basis points (default 3000 = 30%)
 *   PAYMENT_MIN_MINOR       — minimum payable amount in kobo (default 10000 = ₦100)
 *   PAYMENT_MAX_MINOR       — maximum payable amount in kobo (default 100000000 = ₦1,000,000)
 *
 * If the secret key is absent the provider reports configured=false and every
 * payment endpoint answers 503 PAYMENTS_NOT_CONFIGURED. The rest of the
 * application is unaffected.
 */

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const paymentConfig = {
  get provider() { return process.env.PAYMENT_PROVIDER || 'paystack'; },
  get secretKey() { return process.env.PAYSTACK_SECRET_KEY || ''; },
  get publicKey() { return process.env.PAYSTACK_PUBLIC_KEY || ''; },
  get callbackUrl() { return process.env.PAYSTACK_CALLBACK_URL || ''; },
  /** Platform service fee in basis points. 3000 = 30.00%. */
  get platformFeeBps() { return toInt(process.env.PLATFORM_FEE_BPS, 3000); },
  /** ₦100 minimum by default. */
  get minAmountMinor() { return toInt(process.env.PAYMENT_MIN_MINOR, 10_000); },
  /** ₦1,000,000 maximum by default. */
  get maxAmountMinor() { return toInt(process.env.PAYMENT_MAX_MINOR, 100_000_000); },
  get configured() { return Boolean(this.secretKey); },
  get currency() { return 'NGN'; }
};

/**
 * Compute the platform fee split in integer minor units.
 * Floor for the fee, remainder to net, so fee + net === gross exactly.
 */
export function splitFee(grossMinor, feeBps = paymentConfig.platformFeeBps) {
  if (!Number.isInteger(grossMinor) || grossMinor < 1) {
    throw new Error('grossMinor must be a positive integer');
  }
  const feeMinor = Math.floor((grossMinor * feeBps) / 10_000);
  return { grossMinor, feeMinor, netMinor: grossMinor - feeMinor, feeRateBps: feeBps };
}
