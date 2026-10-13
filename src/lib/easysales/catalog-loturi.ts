/**
 * Trimiterea unei liste de produse, pe loturi, cu aflarea elementului vinovat (planul, §5.4.5).
 *
 * ═══ CE SE STIE SI CE NU ═══
 *
 *   - `products/save/bulk` primeste un lot si raspunde `data: null` [A]: nu spune ce a intrat;
 *   - limita de 100 pe apel apare numai in ghidul oficial (M-PROD-2, ES-5);
 *   - ce face un lot cu un element invalid NU e documentat: 422 pe tot lotul, sau 200 cu prelucrare
 *     partiala tacuta (M-PROD-2).
 *
 * Deci: la un 422, elementele vinovate se afla intai din cheile erorilor (`products.37.sku`, forma
 * Laravel a erorilor pe liste); restul lotului pleaca din nou. Cand cheile nu spun nimic, lotul se
 * injumatateste pana la element, iar elementul singur pleaca cu Save pe element, ca sa-i aflam
 * eroarea exacta. Prelucrarea partiala TACUTA (200 fara sa fi intrat tot) n-o vede nimic de aici:
 * o prinde verificarea, care citeste lista lor (`verificare.ts`).
 *
 * ⚠ La cel mult `peElementPanaLa` elemente, fiecare pleaca singur: raspunsul lui Save pe element
 * spune pe loc daca a intrat si, la 422, de ce. Peste prag, loturile scutesc sute de cereri.
 *
 * Modulul e PUR: primeste cele doua trimiteri ca functii, deci se proba fara retea.
 */

export type RezultatLot =
  | { fel: "ok" }
  /** Cererea poate sa fi ajuns (timp expirat la scriere): se verifica dupa, nu se reia orb. */
  | { fel: "necunoscut" }
  | { fel: "validare"; campuri: string[] }
  /** Pana trecatoare, conexiune, bugetul: nu se mai trimite nimic in trecerea asta. */
  | { fel: "opreste"; mesaj: string };

export type SoartaElement =
  /** A plecat intr-un lot primit (sau cu raspuns necunoscut): il confirma verificarea. */
  | { fel: "trimis" }
  /** Save pe element, cu un raspuns care il arata intrat. */
  | { fel: "confirmat"; esId: string | null }
  | { fel: "respins"; mesaj: string }
  /** N-a mai plecat in trecerea asta. */
  | { fel: "oprit"; mesaj: string };

export interface TrimitereInLoturi<T> {
  elemente: readonly T[];
  octeti: (e: T) => number;
  trimiteLot: (lot: T[]) => Promise<RezultatLot>;
  trimiteUnul: (e: T) => Promise<SoartaElement>;
  maxLot: number;
  maxOcteti: number;
  peElementPanaLa: number;
  /** Se intreaba inaintea fiecarei cereri. */
  maiAreTimp?: () => boolean;
}

const RE_INDICE = /^products\.(\d+)\.(.*)$/;

/** Mesajele unui element, din cheile erorilor unui lot: `products.3.sku: ...` -> `sku: ...`. */
export function eroriPeElement(campuri: readonly string[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const c of campuri) {
    const m = RE_INDICE.exec(c);
    if (!m) continue;
    const i = Number(m[1]);
    out.set(i, [...(out.get(i) ?? []), m[2].replace(/products\.\d+\./g, "")]);
  }
  return out;
}

/** Loturile, pe ordinea elementelor: cel mult `maxLot` elemente si cel mult `maxOcteti` fiecare. */
export function imparteInLoturi<T>(elemente: readonly T[], octeti: (e: T) => number, maxLot: number, maxOcteti: number): number[][] {
  const loturi: number[][] = [];
  let lot: number[] = [];
  let marime = 0;
  elemente.forEach((e, i) => {
    const o = octeti(e);
    if (lot.length > 0 && (lot.length >= maxLot || marime + o > maxOcteti)) {
      loturi.push(lot);
      lot = [];
      marime = 0;
    }
    lot.push(i);
    marime += o;
  });
  if (lot.length) loturi.push(lot);
  return loturi;
}

/** Soarta fiecarui element, pe acelasi indice ca `elemente`. */
export async function trimiteInLoturi<T>(t: TrimitereInLoturi<T>): Promise<SoartaElement[]> {
  const out: (SoartaElement | undefined)[] = new Array(t.elemente.length);
  let oprit: string | null = null;
  const timp = () => (t.maiAreTimp ? t.maiAreTimp() : true);

  const opreste = (idx: number[], mesaj: string) => {
    for (const i of idx) if (!out[i]) out[i] = { fel: "oprit", mesaj };
  };

  const unul = async (i: number) => {
    if (oprit !== null) { opreste([i], oprit); return; }
    if (!timp()) { oprit = "bugetul trecerii s-a terminat"; opreste([i], oprit); return; }
    const r = await t.trimiteUnul(t.elemente[i]);
    out[i] = r;
    if (r.fel === "oprit") oprit = r.mesaj;
  };

  const grup = async (idx: number[]): Promise<void> => {
    if (idx.length === 0) return;
    if (oprit !== null) { opreste(idx, oprit); return; }
    if (!timp()) { oprit = "bugetul trecerii s-a terminat"; opreste(idx, oprit); return; }
    const r = await t.trimiteLot(idx.map((i) => t.elemente[i]));
    if (r.fel === "ok" || r.fel === "necunoscut") {
      for (const i of idx) out[i] = { fel: "trimis" };
      return;
    }
    if (r.fel === "opreste") {
      oprit = r.mesaj;
      opreste(idx, r.mesaj);
      return;
    }
    if (idx.length === 1) {
      await unul(idx[0]);
      return;
    }
    const vinovati = eroriPeElement(r.campuri);
    const gasiti = [...vinovati.keys()].filter((k) => k >= 0 && k < idx.length);
    if (gasiti.length > 0) {
      for (const k of gasiti) out[idx[k]] = { fel: "respins", mesaj: vinovati.get(k)!.join("; ").slice(0, 500) };
      await grup(idx.filter((_, k) => !gasiti.includes(k)));
      return;
    }
    const jumatate = Math.ceil(idx.length / 2);
    await grup(idx.slice(0, jumatate));
    await grup(idx.slice(jumatate));
  };

  if (t.elemente.length <= t.peElementPanaLa) {
    for (let i = 0; i < t.elemente.length; i++) await unul(i);
  } else {
    for (const lot of imparteInLoturi(t.elemente, t.octeti, t.maxLot, t.maxOcteti)) await grup(lot);
  }
  return out.map((s) => s ?? { fel: "oprit", mesaj: "netrimis" });
}
