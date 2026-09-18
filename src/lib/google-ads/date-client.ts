import { createHash } from "node:crypto";
import { normalizePhone } from "@/lib/marketing-config";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ENHANCED CONVERSIONS: DATELE OMULUI PENTRU GOOGLE ADS, HASH-UITE PE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  Documentatia („Set up enhanced conversions for web using the Google tag”):

    Pentru normalizare:
      - se taie spatiile de la capete;
      - textul se face cu litere mici;
      - telefonul in E.164 („11 to 15 digits including a plus sign (+) prefix and country code”);
      - ⚠ „Remove all periods (.) that precede the domain name in gmail.com and googlemail.com email
        addresses.” Regula asta e NUMAI a lor: la Meta si la TikTok punctele raman.
    Pentru hash: „Use hex SHA256.”

  ⚠ SE TRIMITE DOAR EMAILUL SI TELEFONUL, amandoua hash-uite. Documentatia cere, pentru adresa, „first
  name, last name, postal code, and country”, iar codul postal si tara N-AU pereche hash-uita in lista lor
  de chei: ar fi plecat in clar in HTML-ul paginii de confirmare. Emailul e oricum cel preferat („Email
  (preferred)”) si ajunge singur.

  ⚠ HASH-UL SE FACE AICI, PE SERVER, ca la Meta si TikTok: pagina ar putea trimite si valori nehashate
  („Make sure the values aren't hashed”), dar atunci ar sta in clar in HTML.
*/

export interface DateClientGoogle {
  email?: string | null;
  telefon?: string | null;
  /** ISO 3166-1 alpha-2; lipsa inseamna Romania. */
  tara?: string | null;
}

/** Ce pleaca in `gtag('set', 'user_data', …)`: numai chei hash-uite. */
export interface UtilizatorGoogle {
  sha256_email_address?: string;
  sha256_phone_number?: string;
}

export function sha256Hex(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

/**
 * Emailul normalizat dupa regulile lor, inainte de hash.
 *
 * ⚠ Punctele se scot DOAR din partea dinaintea `@`, si doar la `gmail.com`/`googlemail.com`: la alte
 * furnizoare punctul face parte din adresa, iar stergerea lui ar trimite hash-ul altui om.
 */
export function normalizeazaEmailulGoogle(email: string | null | undefined): string | undefined {
  const e = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return undefined;
  const [local, domeniu] = e.split("@");
  const faraPuncte = domeniu === "gmail.com" || domeniu === "googlemail.com" ? local.replace(/\./g, "") : local;
  return faraPuncte ? `${faraPuncte}@${domeniu}` : undefined;
}

/** Telefonul in E.164, adica exact cum il cer ei: `+` si prefixul tarii, fara spatii sau paranteze. */
export function normalizeazaTelefonulGoogle(telefon: string | null | undefined, tara?: string | null): string | undefined {
  const cod = /^[a-z]{2}$/i.test((tara ?? "").trim()) ? (tara as string).trim().toUpperCase() : "RO";
  const cifre = normalizePhone(telefon, cod);
  if (!cifre) return undefined;
  const e164 = `+${cifre}`;
  /* „11 to 15 digits including a plus sign”: ce nu incape in forma lor n-ar fi potrivit oricum. */
  return /^\+\d{10,15}$/.test(e164) ? e164 : undefined;
}

export function utilizatorulPentruGoogle(d: DateClientGoogle): UtilizatorGoogle | null {
  const out: UtilizatorGoogle = {};
  const email = normalizeazaEmailulGoogle(d.email);
  if (email) out.sha256_email_address = sha256Hex(email);
  const telefon = normalizeazaTelefonulGoogle(d.telefon, d.tara);
  if (telefon) out.sha256_phone_number = sha256Hex(telefon);
  /*
   * ⚠ Telefonul SINGUR nu e o potrivire valida: „A phone number can also be provided along with an email or
   * full name and address”. Fara email, nu se trimite nimic, ca sa nu para ca am dat date cand n-am dat.
   */
  if (!out.sha256_email_address) return null;
  return out;
}
