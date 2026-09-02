import { headers, cookies } from "next/headers";
import { parseaza, type Stare } from "../consimtamant/stare";
import { NUME_COOKIE, MARTORI } from "../consimtamant/cookie";
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
  return {
    ip: brut && brut !== "unknown" ? brut : null,
    userAgent: h.get("user-agent"),
    referrer: h.get("referer"),
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
