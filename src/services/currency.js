/**
 * EcoNet currency utility
 *
 * ALL monetary amounts on EcoNet are stored as { amount: number, currency: string }
 * where currency is an ISO 4217 code (e.g. 'NGN', 'USD', 'GBP').
 *
 * RULES:
 *  - Never store or display a bare number as a monetary value without a currency code.
 *  - Never silently change a currency code — if conversion is needed, use
 *    formatWithConversion() which always shows the original currency alongside.
 *  - EcoCoins are NOT currency. They are platform reward credits.
 *    They are stored separately (user.reputation.ecoCoins) and never converted
 *    to real money without an explicit, approved exchange mechanism.
 *
 * DEFAULT:
 *  - Nigeria-first platform → default currency is NGN.
 */

// ─── Currency symbols ─────────────────────────────────────────────────────────
const SYMBOLS = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
};

/**
 * Format a monetary amount for display.
 * @param {number} amount
 * @param {string} [currency='NGN'] — ISO 4217 code
 * @returns {string}  e.g. '₦450,000' or 'USD 1,200'
 */
export function formatCurrency(amount, currency = 'NGN') {
  const code = String(currency).toUpperCase();
  const symbol = SYMBOLS[code] || code + ' ';
  const formatted = Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  return `${symbol}${formatted}`;
}

/**
 * Parse a legacy hardcoded currency string such as '₦450,000' into a
 * structured { amount, currency } object.
 *
 * This is a backward-compatibility shim for the dev fixture data that stores
 * amounts as plain strings. New data should always use { amount, currency }.
 *
 * @param {string} str
 * @returns {{ amount: number, currency: string }}
 */
export function parseLegacyCurrencyString(str) {
  if (!str || typeof str !== 'string') return { amount: 0, currency: 'NGN' };
  const cleaned = str.trim();
  // Detect symbol
  const currency =
    cleaned.startsWith('₦') ? 'NGN' :
    cleaned.startsWith('$') ? 'USD' :
    cleaned.startsWith('£') ? 'GBP' :
    cleaned.startsWith('€') ? 'EUR' :
    'NGN'; // default
  const digits = cleaned.replace(/[^\d.]/g, '');
  return { amount: parseFloat(digits) || 0, currency };
}

/**
 * Build a structured money object.
 * @param {number} amount
 * @param {string} [currency='NGN']
 * @returns {{ amount: number, currency: string }}
 */
export function money(amount, currency = 'NGN') {
  return { amount: Number(amount) || 0, currency: String(currency).toUpperCase() };
}

/**
 * Display a money object.
 * @param {{ amount: number, currency: string } | number | string} value
 * @param {string} [fallbackCurrency='NGN']
 * @returns {string}
 */
export function displayMoney(value, fallbackCurrency = 'NGN') {
  if (typeof value === 'string') {
    const parsed = parseLegacyCurrencyString(value);
    return formatCurrency(parsed.amount, parsed.currency);
  }
  if (typeof value === 'number') return formatCurrency(value, fallbackCurrency);
  if (value && typeof value === 'object' && 'amount' in value) {
    return formatCurrency(value.amount, value.currency || fallbackCurrency);
  }
  return formatCurrency(0, fallbackCurrency);
}
