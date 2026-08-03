/**
 * Escaparea textului variabil care se coase in HTML-ul emailurilor.
 *
 * DE CE exista fisierul asta: pana in 2026-08-04, `src/lib/email.ts` avea SASE
 * functii `esc` locale (liniile ~423, ~457, ~785, ~1021, ~1204, ~1233), scrise
 * usor diferit, si NICIUNA nu escapa ghilimelele. Cincisprezece interpolari cad
 * insa INAUNTRUL unui atribut (`href="${...}"`, `style="...${color}"`), unde un
 * `"` iese din atribut si un `<` escapat nu mai ajuta la nimic. Iar emailul de
 * confirmare catre client nu trecea NIMIC prin esc, desi `placeOrder` e export
 * „use server": numele clientului, codul de reducere si adresa de destinatie vin
 * de la apelant, deci se putea livra HTML arbitrar la orice adresa, sub numele
 * unui magazin real.
 *
 * Masurat in productie inainte de reparatie (2026-08-04, proiect
 * rtefdpioqmowkdiybwrr): 35 din 3685 de produse au deja `&` sau `"` in nume
 * (34 cu `&`, unul cu `"`: Air Jordan One Take 5 "White Legend Blue), si 1 din
 * 127 de magazine se cheama „Bingo D&D". Zero comenzi si zero cosuri au azi
 * caractere speciale in linii, deci PAGUBA VIZIBILA DE AZI E APROAPE ZERO —
 * motivul reparatiei e gaura de injectie, nu cifrele.
 *
 * Modul PUR, fara „use server" si fara importuri: altfel testele nu-l pot
 * incarca (harness-ul e `node --import ./scripts/tests/register.mjs --test`).
 */

const INLOCUIRI: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapeaza text variabil pentru HTML. Rezultatul e sigur SI in continut, SI
 * inauntrul unui atribut cu ghilimele (simple sau duble) — de aceea escapeaza si
 * `"` si `'`, nu doar `& < >` ca vechile copii locale.
 *
 * `unknown` la intrare, nu `string`: jumatate din apeluri primeau deja valori
 * `string | null | undefined` din baza si le treceau prin `String(s ?? "")`.
 *
 * NU se aplica pe fragmente de HTML construite de noi (randuri de tabel, `rows`,
 * `bodyHtml`, `intro`): acolo escaparea ar trimite clientului marcaj brut pe
 * ecran. Nu se aplica nici pe numere deja formatate (`formatPrice`) sau pe date
 * din `toLocaleString`, care n-au cum sa contina caractere speciale.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => INLOCUIRI[c]);
}

/** Schemele care au voie sa apara intr-un `href` de email. */
const SCHEME_PERMISE = new Set(["http:", "https:", "mailto:", "tel:"]);
const SCHEMA = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Pregateste o valoare pentru `href="..."` / `src="..."`.
 *
 * Escaparea singura NU e de ajuns intr-un atribut de legatura: ea inchide iesirea
 * din atribut, dar lasa in picioare `javascript:` si `data:text/html`. Asa ca
 * schema se verifica INAINTE de escapare, iar ce nu e pe lista devine `#`.
 *
 * Caracterele de control se scot doar pentru DECIZIE (`java\tscript:` e o schema
 * valida pentru un browser, dar nu si pentru o comparatie naiva); in atribut
 * pleaca sirul original, escapat.
 *
 * `//gazda` fara schema (protocol-relative) e tot o adresa straina, si in email
 * nici nu functioneaza: se respinge la fel.
 */
export function escapeUrl(value: unknown): string {
  if (value === null || value === undefined) return "";
  const brut = String(value).trim();
  if (!brut) return "";
  const sonda = Array.from(brut).filter((c) => (c.codePointAt(0) ?? 0) > 0x20).join("").toLowerCase();
  if (sonda.startsWith("//")) return "#";
  const m = SCHEMA.exec(sonda);
  if (m && !SCHEME_PERMISE.has(m[0])) return "#";
  return escapeHtml(brut);
}
