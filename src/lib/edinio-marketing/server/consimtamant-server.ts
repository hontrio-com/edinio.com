import { headers, cookies } from "next/headers";
import { parseaza, type Stare } from "../consimtamant/stare";
import { NUME_COOKIE, MARTORI } from "../consimtamant/cookie";
import { curataAdresa } from "../adresa-curata";
import type { Destinatie } from "./coada-conversii";
import type { ContextTrimitere } from "./sarcina-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE STIE SERVERUL DESPRE OMUL DIN CERERE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SINGURUL LOC DIN MARKETING CARE ATINGE `next/headers`, dinadins. Aduse
  altundeva, cele doua ar fi tras cate o pagina in randare dinamica; aici sunt
  chemate numai din actiuni si rute, care sunt oricum dinamice.

  ⚠ SI DE CE NU SE CHEAMA DIN LAYOUT. Paginile din `(website)` se servesc din
  cache — masurat pe 02.09.2026, pagina de start avea `Age: 838`. O citire de
  cookie in layout le-ar fi facut pe toate dinamice: as fi reparat
  confidentialitatea stingand viteza intregului site.
*/

export async function consimtamantulCererii(): Promise<Stare | null> {
  const c = await cookies();
  return parseaza(c.get(NUME_COOKIE)?.value ?? null, Math.floor(Date.now() / 1000));
}

/** Martorii lasati de pixeli, daca exista. Lipsa lor nu e o eroare. */
export async function martoriiCererii(): Promise<{ fbp?: string; fbc?: string; ttp?: string }> {
  const c = await cookies();
  const iesire: { fbp?: string; fbc?: string; ttp?: string } = {};
  for (const [cheie, nume] of Object.entries(MARTORI) as [keyof typeof MARTORI, string][]) {
    const v = c.get(nume)?.value;
    if (v) iesire[cheie] = v;
  }
  return iesire;
}

/**
 * Contextul cererii: ce stim despre om, din anteturi.
 *
 * ⚠ SE CITESTE ANTETUL BRUT, nu `clientIpFromHeaders`. Ajutorul acela intoarce
 * sirul `"unknown"` cand nu stie (`rate-limit.ts:17`) — bun pentru un plafon pe
 * IP, otravitor aici: `"unknown"` e adevarat, deci ar fi plecat catre Meta drept
 * `client_ip_address`. Ce nu stim trebuie sa LIPSEASCA, nu sa fie un cuvant.
 */
export async function contextulCererii(): Promise<ContextTrimitere> {
  const h = await headers();
  const brut = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const venitDe = h.get("referer");
  return {
    ip: brut && brut !== "unknown" ? brut : null,
    userAgent: h.get("user-agent"),
    /*
      ═══ ⚠ SI ADRESA DE VENIRE SE CURATA, LA FEL CA IN BROWSER ═══

      In browser, `page_location` trece prin `curataAdresa` de mult. Antetul
      `Referer` de aici nu trecea prin nimic — pleca BRUT catre TikTok (in
      `page.referrer`) si se pastra brut in coada.

      ⚠ CE POATE PURTA. Un `Referer` de pe propriul nostru site duce cu el
      intregul sir de interogare al paginii de dinainte. Adica un jeton de
      dezabonare, un cod dintr-un email, orice punem vreodata intr-o adresa —
      ajungea la un furnizor de reclame si ramanea scris in baza.

      Aceeasi lista alba, acelasi loc: ce nu e `utm_*` sau un id de clic nu iese.
    */
    /*
      ⚠ SI SIRUL GOL E TOT „NU STIM". `curataAdresa` intoarce `""` cand ce a venit
      nu e o adresa deloc. Trimis asa, ar fi incalcat chiar regula scrisa mai sus
      pentru `ip`: ce nu stim trebuie sa LIPSEASCA, nu sa fie un cuvant. Un
      `page.referrer` gol catre TikTok e o afirmatie („a venit de nicaieri"), nu o
      tacere.
    */
    referrer: (venitDe && curataAdresa(venitDe)) || null,
  };
}

/**
 * Catre cine avem voie sa trimitem, dupa hotararea omului.
 *
 * ⚠ CADE SPRE NIMIC. Fara hotarare — n-a ales inca, cookie stricat, hotarare
 * expirata — lista e goala si nu pleaca nimic. Necunoscutul nu e un acord.
 */
export function destinatiiPermise(
  stare: Stare | null,
  legate: readonly Destinatie[],
): Destinatie[] {
  if (!stare?.marketing) return [];
  return [...legate];
}
