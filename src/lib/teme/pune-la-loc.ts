import { jsonCanonic } from "@/lib/storefront/design/continut-ciorna";
import { CHEIE_TEMA_APLICATA, temaAplicataDin, type TemaAplicata } from "./aplicare";

/*
  ═══════════════════════════════════════════════════════════════════════════
  „PUNE LA LOC DESIGNUL DE DINAINTE”: CE VERSIUNE SE READUCE (14.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Gasit la MNY AROMA (14.11.2026): trei teme la rand (Saturn, Jupiter, Venus, in doua minute), apoi „Pune la loc” de
  sase ori. Butonul lua cea mai noua versiune `tema`, adica magazinul de dinainte de ULTIMA tema: Jupiter. Readucerea nu
  scrie o versiune `tema`, deci fiecare apasare de dupa readucea tot Jupiter, iar designul lui statea neatins in Istoric.

  Regula de acum:
  1. STARTUL e tema din magazin (semnul `tema_aplicata`): versiunea `tema` scrisa chiar inaintea publicarii ei. Dupa o
     readucere care a lasat o tema in magazin, apasarea urmatoare merge mai in urma, nu pe loc.
  2. Se SAR temele doar incercate: o versiune `tema` care arata intocmai ce a publicat tema de atunci, fara nicio
     publicare intre ele. O tema neatinsa se aplica oricand din nou, de pe cardul ei; designul lui, nu.
  O tema peste care a publicat ceva opreste saritura: se readuce ea, cum a lasat-o.

  Doi pasi, ca sa nu se citeasca tot Istoricul cu designuri cu tot: `drumulInapoi` pe lista (cu starea fiecarei
  versiuni, `continut->stare`, mica), apoi `versiuneaDePusLaLoc` pe versiunile de pe drum, citite intregi.
*/

/** Cat poate sta semnul temei dupa publicarea ei: se scrie imediat dupa (la MNY AROMA, ~0,13 s). */
const SEMN_DUPA_PUBLICARE_MS = 60_000;

/** Cate teme incercate la rand se sar cel mult: Istoricul tine 30 de versiuni, cate doua pe tema. */
export const PASI_MAX = 15;

/** Un rand din Istoric, fara design; `stare` = `continut->stare` (etapa 25.3), `null` la versiunile de dinainte. */
export interface RandIstoric {
  id: string;
  origine: string;
  created_at: string;
  stare?: unknown;
}

/** Un pas posibil inapoi: versiunea `tema` care arata tema `cheie` in magazin, publicarea temei si magazinul dinaintea ei. */
export interface PasInapoi {
  tema: string;
  publicare: string;
  inainte: string;
  cheie: string;
}

export interface DrumInapoi {
  /** Magazinul de dinainte de tema din magazin (fara ea in Istoric, cea mai noua versiune `tema`, ca pana acum). */
  start: string;
  /** Tema aplicata chiar dupa `start`; `null` = nu se stie. */
  temaDupa: string | null;
  /** Pasii posibili, in ordine; fiecare se face doar cu versiunea identica publicarii temei (`versiuneaDePusLaLoc`). */
  pasi: PasInapoi[];
}

export interface VersiuneIntreaga {
  design: unknown;
  continut: unknown;
}

const clipa = (r: RandIstoric) => Date.parse(r.created_at);

/** Tema din starea unei versiuni `tema`: ce era aplicat atunci; `null` = designul lui, sau o versiune fara stare. */
function temaDinStare(stare: unknown): TemaAplicata | null {
  if (!stare || typeof stare !== "object") return null;
  return temaAplicataDin({ [CHEIE_TEMA_APLICATA]: (stare as { tema?: unknown }).tema });
}

/** Pasul 1, pe lista: startul si pasii posibili inapoi. `null` = nicio versiune `tema`. */
export function drumulInapoi(randuri: readonly RandIstoric[], semn: TemaAplicata | null): DrumInapoi | null {
  // Cele mai noi intai; un rand fara data nu se poate aseza, deci nu intra.
  const lista = randuri.filter((r) => Number.isFinite(clipa(r))).sort((a, b) => clipa(b) - clipa(a));
  const ultimaInainte = (t: number, origine: string) => lista.find((r) => r.origine === origine && clipa(r) < t) ?? null;
  /**
   * Publicarea unei teme: cea mai noua de pana la semnul ei, cel mult cu un minut inainte. Nu si cand intre ea si semn
   * sta o versiune `tema`: aplicarea scrie versiunea INAINTEA publicarii, deci publicarea gasita ar fi alta, mai veche
   * (a temei nu s-a scris in Istoric).
   */
  const publicareaTemei = (t: TemaAplicata) => {
    const la = Date.parse(t.la);
    const p = lista.find((r) => r.origine === "publicare" && clipa(r) <= la);
    if (!p || la - clipa(p) > SEMN_DUPA_PUBLICARE_MS) return null;
    return lista.some((r) => r.origine === "tema" && clipa(r) > clipa(p) && clipa(r) <= la) ? null : p;
  };

  const p0 = semn ? publicareaTemei(semn) : null;
  const dinSemn = p0 ? ultimaInainte(clipa(p0), "tema") : null;
  const start = dinSemn ?? lista.find((r) => r.origine === "tema") ?? null;
  if (!start) return null;

  const pasi: PasInapoi[] = [];
  let s = start;
  while (pasi.length < PASI_MAX) {
    const tema = temaDinStare(s.stare);
    if (!tema) break;
    const p = publicareaTemei(tema);
    // Nimic publicat intre tema si versiunea asta: cea mai noua publicare dinaintea ei e chiar a temei.
    if (!p || ultimaInainte(clipa(s), "publicare")?.id !== p.id) break;
    const inainte = ultimaInainte(clipa(p), "tema");
    if (!inainte) break;
    pasi.push({ tema: s.id, publicare: p.id, inainte: inainte.id, cheie: tema.cheie });
    s = inainte;
  }
  return { start: start.id, temaDupa: dinSemn && semn ? semn.cheie : null, pasi };
}

/** Versiunile de citit intregi: startul si, pe fiecare pas, publicarea temei si magazinul dinaintea ei. */
export function versiuniDeCitit(drum: DrumInapoi): string[] {
  return [...new Set([drum.start, ...drum.pasi.flatMap((p) => [p.publicare, p.inainte])])];
}

/** Versiunea `tema` arata intocmai ce a publicat tema: acelasi design si acelasi continut (fara starea, scrisa doar in ea). */
function neatinsa(tema: VersiuneIntreaga, publicare: VersiuneIntreaga): boolean {
  const continut = tema.continut && typeof tema.continut === "object" ? { ...(tema.continut as Record<string, unknown>) } : tema.continut;
  if (continut && typeof continut === "object") delete (continut as Record<string, unknown>).stare;
  return jsonCanonic(tema.design) === jsonCanonic(publicare.design) && jsonCanonic(continut) === jsonCanonic(publicare.continut);
}

/**
 * Pasul 2, pe versiunile citite intregi: cea de readus, mergand pe drum cat timp versiunea arata o tema neatinsa.
 * `null` = startul nu s-a putut citi (de pilda, sters intre timp de taierea Istoricului).
 */
export function versiuneaDePusLaLoc(
  drum: DrumInapoi,
  versiuni: ReadonlyMap<string, VersiuneIntreaga>,
): { id: string; temaDupa: string | null } | null {
  if (!versiuni.has(drum.start)) return null;
  let ales = { id: drum.start, temaDupa: drum.temaDupa };
  for (const pas of drum.pasi) {
    const tema = versiuni.get(pas.tema);
    const publicare = versiuni.get(pas.publicare);
    if (pas.tema !== ales.id || !tema || !publicare || !versiuni.has(pas.inainte) || !neatinsa(tema, publicare)) break;
    ales = { id: pas.inainte, temaDupa: pas.cheie };
  }
  return ales;
}
