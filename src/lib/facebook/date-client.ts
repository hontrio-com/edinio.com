import { createHash } from "node:crypto";
import { normalizePhone, splitName } from "@/lib/marketing-config";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DATELE OMULUI PENTRU META: NORMALIZATE CA IN DOCUMENTATIE, APOI HASH-UITE PE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  O folosesc doua drumuri, si trebuie sa spuna acelasi lucru pe amandoua:
    - `init`-ul pixelului de pe pagina de confirmare (potrivirea avansata manuala);
    - `user_data` din Conversions API.

  Regulile, din „Customer Information Parameters” (Conversions API):
    em  „Trim any leading and trailing spaces. Convert all characters to lowercase.”
    ph  „Remove symbols, letters, and any leading zeros. Phone numbers must include a country code”
    fn  „Lowercase only with no punctuation. If using special characters, the text must be encoded in UTF-8”
        (exemplul lor pastreaza „valéry”, deci diacriticele raman)
    ct  „Lowercase only with no punctuation, no special characters, and no spaces”
    st  „Normalize states outside the U.S. in lowercase with no punctuation, no special characters, and no spaces”
    zp  „Use lowercase with no spaces and no dash”
    country „Use the lowercase, 2-letter country codes in ISO 3166-1 alpha-2 ... Always include your
        customers' countries' even if all of your country codes are from the same country.”

  ⚠ HASH-UL SE FACE AICI, PE SERVER. Pixelul ar fi hash-uit si singur, dar atunci numele, telefonul si
  adresa omului ar fi stat in clar in HTML-ul paginii de confirmare. Documentatia pixelului primeste si
  valori deja hash-uite („We accept both lowercase unhashed and normalized SHA-256 hashed”).
*/

export interface DateClient {
  email?: string | null;
  telefon?: string | null;
  /** Numele intreg, asa cum e pe comanda. */
  nume?: string | null;
  oras?: string | null;
  judet?: string | null;
  codPostal?: string | null;
  /** ISO 3166-1 alpha-2; lipsa inseamna Romania, tara magazinelor. */
  tara?: string | null;
}

type Cheie = "em" | "ph" | "fn" | "ln" | "ct" | "st" | "zp" | "country";
export type DateNormalizate = Partial<Record<Cheie, string>>;

/** Litere (cu diacritice) si atat: fara spatii, cifre sau punctuatie. */
function doarLitere(s: string | null | undefined): string | undefined {
  const v = (s ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
  return v || undefined;
}

/** Litere latine a-z, fara diacritice: „no special characters”. */
function doarAz(s: string | null | undefined): string | undefined {
  const v = (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
  return v || undefined;
}

export function normalizeazaPentruMeta(d: DateClient): DateNormalizate {
  const out: DateNormalizate = {};
  const email = (d.email ?? "").trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.em = email;
  const tara = (d.tara ?? "").trim().toLowerCase();
  const cod = /^[a-z]{2}$/.test(tara) ? tara : "ro";
  const ph = normalizePhone(d.telefon, cod.toUpperCase());
  if (ph) out.ph = ph;
  const { firstName, lastName } = splitName(d.nume);
  const fn = doarLitere(firstName);
  const ln = doarLitere(lastName);
  if (fn) out.fn = fn;
  if (ln) out.ln = ln;
  const ct = doarAz(d.oras);
  if (ct) out.ct = ct;
  const st = doarAz(d.judet);
  if (st) out.st = st;
  const zp = (d.codPostal ?? "").toLowerCase().replace(/[\s-]/g, "");
  if (zp) out.zp = zp;
  out.country = cod;
  return out;
}

export function sha256Hex(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

export function hashuieste(n: DateNormalizate): DateNormalizate {
  const out: DateNormalizate = {};
  for (const [k, v] of Object.entries(n) as [Cheie, string][]) if (v) out[k] = sha256Hex(v);
  return out;
}

/**
 * Datele pentru `fbq('init', pixel, date)`, deja hash-uite.
 *
 * ⚠ Fara `country` singura: o potrivire doar pe tara nu leaga pe nimeni de nimic, iar un obiect cu o
 * singura cheie ar fi trecut drept „avem date”. Nimic de trimis -> `null`.
 */
export function potrivireaPentruPixel(d: DateClient): DateNormalizate | null {
  const n = normalizeazaPentruMeta(d);
  const { country: _tara, ...restul } = n;
  void _tara;
  if (Object.keys(restul).length === 0) return null;
  return hashuieste(n);
}

/** Adresa de livrare a unei comenzi, citita fara sa presupunem forma (vin din mai multe checkout-uri). */
export function dateDinAdresa(adresa: unknown): Pick<DateClient, "oras" | "judet" | "codPostal" | "tara"> {
  const a = (adresa && typeof adresa === "object" ? adresa : {}) as Record<string, unknown>;
  const sir = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    oras: sir(a.city),
    judet: sir(a.county),
    codPostal: sir(a.postal_code) ?? sir(a.postalCode),
    tara: sir(a.country),
  };
}
