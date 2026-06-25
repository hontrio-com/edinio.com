/**
 * Normalize a phone number for courier AWBs.
 *
 * Customer phones are stored at checkout with only a `.trim()` — whatever the
 * customer typed (spaces, dashes, dots, parentheses, a "+40"/"0040" country
 * prefix) is kept verbatim. Several couriers accept the shipment but silently
 * drop a phone they can't parse, so it never prints on the AWB label. This
 * strips formatting noise and folds the Romanian country prefix to the local
 * 0-form, while preserving genuine foreign international numbers (the leading
 * "+" and country code are kept for non-RO recipients).
 *
 * Examples:
 *   "+40 712 345 678" -> "0712345678"
 *   "0040-712-345-678" -> "0712345678"
 *   "0712 345 678"     -> "0712345678"
 *   "+49 30 1234567"   -> "+49301234567"
 *   "0049 30 1234567"  -> "+49301234567"
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  const plus = trimmed.startsWith("+");

  // Romania → local 0-prefixed form.
  if (digits.startsWith("0040")) return "0" + digits.slice(4);
  if (plus && digits.startsWith("40")) return "0" + digits.slice(2);

  // Other international numbers: keep the +country form.
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (plus) return "+" + digits;

  // Already a local number (0…) or plain digits.
  return digits;
}
