import { createHash } from "node:crypto";
import { normalizePhone, splitName } from "@/lib/marketing-config";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DATELE OMULUI PENTRU TIKTOK: NORMALIZATE CA IN DOCUMENTATIE, HASH-UITE PE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ REGULILE LOR NU SUNT ALE META. Doua deosebiri care se ratau usor, luate din „Events API 2.0 -
  Parameters”, `user parameters`:

    1. `phone` se hash-uieste DUPA ce ajunge in forma E.164, adica CU `+` in fata („+12133734253”). La Meta
       plusul nu exista. Acelasi telefon da doua hash-uri diferite pe cele doua platforme.
    2. `city`, `state` si `country` NU se hash-uiesc („The city should be in lowercase without any
       punctuation, special characters, or spaces”), dar `zip_code` DA. La Meta se hash-uiesc toate.

  Restul, ca la ei: `email` taiat de spatii, litere mici, SHA-256; `first_name`/`last_name` litere mici fara
  punctuatie, SHA-256 („Special characters are allowed”, deci diacriticele raman).

  ⚠ Se hash-uieste pe SERVER, ca la Meta: pixelul ar hash-ui si el („we will hash them on the client side”),
  dar atunci datele omului ar sta in clar in HTML-ul paginii de confirmare.
*/

export interface DateClientTikTok {
  email?: string | null;
  telefon?: string | null;
  nume?: string | null;
  oras?: string | null;
  judet?: string | null;
  codPostal?: string | null;
  /** ISO 3166-1 alpha-2; lipsa inseamna Romania. */
  tara?: string | null;
}

/** Ce pleaca in `user`, gata de trimis: hash-urile hex si campurile nehashate, dupa regulile lor. */
export type UtilizatorTikTok = Partial<Record<
  "email" | "phone" | "first_name" | "last_name" | "zip_code" | "city" | "state" | "country", string
>>;

export function sha256Hex(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

/** Litere (cu diacritice) si atat. */
function doarLitere(s: string | null | undefined): string | undefined {
  const v = (s ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
  return v || undefined;
}

/** Litere latine a-z: „no punctuation, no special characters, and no spaces”. */
function doarAz(s: string | null | undefined): string | undefined {
  const v = (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
  return v || undefined;
}

export function utilizatorulPentruTikTok(d: DateClientTikTok): UtilizatorTikTok {
  const out: UtilizatorTikTok = {};
  const email = (d.email ?? "").trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.email = sha256Hex(email);

  const tara = (d.tara ?? "").trim().toLowerCase();
  const cod = /^[a-z]{2}$/.test(tara) ? tara : "ro";
  /* ⚠ E.164 INSEAMNA CU `+`. `normalizePhone` da cifrele cu prefixul tarii, fara plus. */
  const cifre = normalizePhone(d.telefon, cod.toUpperCase());
  if (cifre) out.phone = sha256Hex(`+${cifre}`);

  const { firstName, lastName } = splitName(d.nume);
  const fn = doarLitere(firstName);
  const ln = doarLitere(lastName);
  if (fn) out.first_name = sha256Hex(fn);
  if (ln) out.last_name = sha256Hex(ln);

  /* ⚠ Nehashate, asa cere documentatia lor. */
  const ct = doarAz(d.oras);
  if (ct) out.city = ct;
  const st = doarAz(d.judet);
  if (st) out.state = st;
  out.country = cod;

  /* ⚠ Hashat, spre deosebire de oras si judet. */
  const zp = (d.codPostal ?? "").toLowerCase().replace(/[\s-]/g, "");
  if (zp) out.zip_code = sha256Hex(zp);
  return out;
}

/**
 * Datele pentru `ttq.identify`, deja hash-uite: doar cele trei campuri pe care le primeste.
 *
 * ⚠ Fara nimic de spus -> `null`: un `identify` gol ar fi o afirmatie despre un om pe care nu-l stim.
 */
export function potrivireaPentruPixelTikTok(d: DateClientTikTok): { email?: string; phone_number?: string } | null {
  const u = utilizatorulPentruTikTok(d);
  const out: { email?: string; phone_number?: string } = {};
  if (u.email) out.email = u.email;
  if (u.phone) out.phone_number = u.phone;
  return Object.keys(out).length ? out : null;
}

/** Adresa de livrare, citita fara sa presupunem forma (vin din mai multe checkout-uri). */
export function dateDinAdresaTikTok(adresa: unknown): Pick<DateClientTikTok, "oras" | "judet" | "codPostal" | "tara"> {
  const a = (adresa && typeof adresa === "object" ? adresa : {}) as Record<string, unknown>;
  const sir = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    oras: sir(a.city),
    judet: sir(a.county),
    codPostal: sir(a.postal_code) ?? sir(a.postalCode),
    tara: sir(a.country),
  };
}
