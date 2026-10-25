import { BLOC_ATTR, ETICHETA_ATTR, SECTION_ATTR } from "./preview-protocol";

/**
 * Geometria conturului din previzualizarea editorului (etapa 3 din
 * `docs/editor-magazin/PLAN.md`).
 *
 * ⚠ Invelisul de sectiune NU are cutie. `data-st-section` sta pe un
 * `<div class="contents">`, ales anume ca sa nu rupa selectorii pe copil direct
 * din variantele de design; `getBoundingClientRect()` pe el da zero. Cutia
 * sectiunii e unirea cutiilor copiilor, iar un copil care e si el fara cutie se
 * desface mai departe. Aceeasi capcana la derulare: `scroll-target.ts`.
 */

export interface Dreptunghi {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Ce ne trebuie de la un element ca sa-i masuram cutia. Restul DOM-ului nu ne intereseaza. */
export interface ElementDeMasurat {
  getClientRects(): { length: number };
  getBoundingClientRect(): Dreptunghi;
  readonly children: ArrayLike<ElementDeMasurat>;
}

export interface Cutie {
  sus: number;
  stanga: number;
  latime: number;
  inaltime: number;
}

/**
 * Cutia vizibila a unei sectiuni, in coordonatele ferestrei; `null` cand n-are
 * nimic vizibil (stinsa, goala, ascunsa pe ecranul asta).
 *
 * Un element fara cutie (`display: contents` sau `display: none`) nu se masoara,
 * se desfac copiii lui. Unul cu latime sau inaltime zero nu intra in unire: un
 * `div` gol cat tot randul ar fi intins conturul pana la marginea paginii.
 */
export function cutiaSectiunii(el: ElementDeMasurat | null | undefined): Cutie | null {
  if (!el) return null;
  let sus = Infinity;
  let stanga = Infinity;
  let dreapta = -Infinity;
  let jos = -Infinity;

  const aduna = (e: ElementDeMasurat) => {
    if (e.getClientRects().length === 0) {
      for (let i = 0; i < e.children.length; i++) aduna(e.children[i]);
      return;
    }
    const r = e.getBoundingClientRect();
    if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return;
    sus = Math.min(sus, r.top);
    stanga = Math.min(stanga, r.left);
    dreapta = Math.max(dreapta, r.right);
    jos = Math.max(jos, r.bottom);
  };
  aduna(el);

  if (sus === Infinity) return null;
  return { sus, stanga, latime: dreapta - stanga, inaltime: jos - sus };
}

/** Ce ne trebuie de la tinta unui eveniment ca sa urcam pana la sectiunea ei. */
export interface ElementCuStramosi {
  closest(selector: string): { getAttribute(nume: string): string | null } | null;
}

/**
 * Ce e sub mouse (sau sub deget): blocul, cand e unul, altfel sectiunea; id-ul si
 * numele, din marcajele puse in modul editor (`MarcajBloc`, `MarcajSectiune`).
 * Blocul are intaietate: sta in interiorul sectiunii lui, iar omul arata spre
 * bucata, nu spre toata pagina. `null` in afara oricarei sectiuni: butonul
 * flotant de telefon, bannerul de cookie-uri, spatiul dintre containere.
 */
export function sectiuneaDeSub(tinta: ElementCuStramosi | null | undefined): { id: string; eticheta: string } | null {
  for (const atribut of [BLOC_ATTR, SECTION_ATTR]) {
    const marcaj = tinta?.closest(`[${atribut}]`);
    const id = marcaj?.getAttribute(atribut);
    if (marcaj && id) return { id, eticheta: marcaj.getAttribute(ETICHETA_ATTR) || id };
  }
  return null;
}
