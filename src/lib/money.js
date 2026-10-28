// All money is stored as integer paise (1 INR = 100 paise) to avoid floating point errors.
// This satisfies "exact decimal values" from the PRD (FR-011: expenses as small as ₹0.01).

/** Parse a user-entered rupee string/number ("1,234.56") into integer paise. Returns NaN if invalid. */
export function toPaise(input) {
  if (input === null || input === undefined) return NaN;
  const s = String(input).replace(/[₹,\s]/g, '').trim();
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -paise : paise;
}

/** Convert paise to a plain rupee string with 2 decimals (for inputs / CSV). */
export function paiseToRupeeString(paise) {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/** Format paise as Indian Rupees with Indian digit grouping, e.g. ₹12,34,567.89 */
export function formatINR(paise, { decimals = 'auto' } = {}) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const grouped = groupIndian(String(rupees));
  const showDec = decimals === true || (decimals === 'auto' && p !== 0);
  return `${neg ? '-' : ''}₹${grouped}${showDec ? '.' + String(p).padStart(2, '0') : ''}`;
}

/** Compact INR: ₹1.2 Cr, ₹4.5 L, ₹12.3 K */
export function formatINRCompact(paise) {
  const r = paise / 100;
  const a = Math.abs(r);
  const sign = r < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)} K`;
  return formatINR(paise);
}

function groupIndian(digits) {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

export const sum = (arr, fn = (x) => x) => arr.reduce((t, x) => t + fn(x), 0);

export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
