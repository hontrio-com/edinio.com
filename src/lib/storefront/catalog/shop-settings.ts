import { resolveActions } from "@/lib/storefront/design/actions";
import { GRUPURI_FILTRE, SORTARI_CATALOG, variantMeta } from "@/lib/storefront/design/registry";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Setarile paginii de catalog, citite o singura data si cu implicitele aplicate.
 *
 * Exista fiindca reglajele sunt cerute din DOUA locuri aflate la etaje diferite:
 * `MiniStoreRenderer` are nevoie de cate produse intra pe o pagina si de felul
 * paginarii, fiindca el tine starea catalogului; modelele de pagina au nevoie de
 * restul. Citite separat, cele doua ar fi aplicat implicite diferite pentru
 * acelasi camp lipsa — iar un catalog care numara 24 de produse pe pagina si o
 * paginare care crede ca sunt 20 arata pagini goale la coada.
 *
 * `settings` din design e deliberat neinterpretat de parser: formele posibile ale
 * fiecarei chei se rezolva aici, unde se stie ce inseamna.
 */

export type ModPaginare = "pagini" | "buton" | "infinit";

export interface SetariMagazin {
  /** Grila ramane si pe pagina principala, langa pagina de catalog. */
  pastreazaGrilaAcasa: boolean;
  titlu: string;
  arataTitlu: boolean;
  subtitlu: string;
  imagineAntet: string;
  arataFirimituri: boolean;
  arataNumarul: boolean;

  coloane: number;
  coloaneMobil: number;
  perPage: number;
  modPaginare: ModPaginare;

  grupuriFiltre: string[];
  valoriVizibile: number;
  arataNumaratori: boolean;
  /** Grupurile de filtre pornesc deschise. Implicit sunt pliate. */
  filtreDesfasurate: boolean;

  /** Gol = ramane sortarea implicita a magazinului, din „Editeaza magazinul". */
  sortareImplicita: string;
  sortariOferite: string[];

  textSubGrila: string;
}

/** Implicitele codului. Registry-ul le repeta in `defaults`, pentru editor. */
const IMPLICITE: SetariMagazin = {
  pastreazaGrilaAcasa: true,
  titlu: "Toate produsele",
  arataTitlu: true,
  subtitlu: "",
  imagineAntet: "",
  arataFirimituri: true,
  arataNumarul: true,

  coloane: 4,
  coloaneMobil: 2,
  // Cat avea grila paginii principale inainte sa existe reglajul. Un magazin
  // care trece catalogul pe pagina lui nu trebuie sa vada alta densitate decat
  // avea, doar fiindca a schimbat designul.
  perPage: 20,
  modPaginare: "pagini",

  grupuriFiltre: GRUPURI_FILTRE.map((g) => g.value),
  valoriVizibile: 6,
  arataNumaratori: true,
  filtreDesfasurate: false,

  sortareImplicita: "",
  sortariOferite: SORTARI_CATALOG.map((s) => s.value),

  textSubGrila: "",
};

function sir(v: unknown, implicit: string): string {
  return typeof v === "string" && v.trim() ? v : implicit;
}

function comutator(v: unknown, implicit: boolean): boolean {
  return typeof v === "boolean" ? v : implicit;
}

function numar(v: unknown, implicit: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return implicit;
  return Math.min(Math.max(Math.round(n), min), max);
}

/**
 * Setarile paginii de catalog ale magazinului.
 *
 * Se citesc din varianta ALEASA, cu implicitele ei din registry dedesubt: un
 * camp pe care modelul curent nu il declara ramane pe implicitul codului, nu pe
 * valoarea scrisa cand era ales alt model. Parserul pastreaza deliberat setarile
 * tuturor variantelor unei sectiuni, ca plimbarea prin galerie sa nu stearga ce
 * a scris comerciantul.
 */
export function citesteSetariMagazin(design: StoreDesign): SetariMagazin {
  return citesteSetariMagazinDinSectiune(design.shop.page);
}

/**
 * Aceleasi setari, dintr-o instanta de sectiune data direct.
 *
 * O foloseste miniatura din galeria de design-uri, care randeaza o sectiune
 * sintetica — construita cu `defaults`-urile variantei — fara sa existe un
 * `StoreDesign` intreg in jurul ei.
 */
export function citesteSetariMagazinDinSectiune(
  sectiune: { variant: string; settings: Record<string, unknown> },
): SetariMagazin {
  const brut = sectiune.settings ?? {};
  const implicite = variantMeta("shop_page", sectiune.variant)?.defaults ?? {};
  const citeste = (cheie: keyof SetariMagazin) => (cheie in brut ? brut[cheie] : implicite[cheie]);

  const mod = citeste("modPaginare");
  return {
    pastreazaGrilaAcasa: comutator(citeste("pastreazaGrilaAcasa"), IMPLICITE.pastreazaGrilaAcasa),
    titlu: sir(citeste("titlu"), IMPLICITE.titlu),
    arataTitlu: comutator(citeste("arataTitlu"), IMPLICITE.arataTitlu),
    subtitlu: sir(citeste("subtitlu"), IMPLICITE.subtitlu),
    imagineAntet: sir(citeste("imagineAntet"), IMPLICITE.imagineAntet),
    arataFirimituri: comutator(citeste("arataFirimituri"), IMPLICITE.arataFirimituri),
    arataNumarul: comutator(citeste("arataNumarul"), IMPLICITE.arataNumarul),

    coloane: numar(citeste("coloane"), IMPLICITE.coloane, 2, 6),
    coloaneMobil: numar(citeste("coloaneMobil"), IMPLICITE.coloaneMobil, 1, 2),
    perPage: numar(citeste("perPage"), IMPLICITE.perPage, 8, 96),
    modPaginare: mod === "buton" || mod === "infinit" ? mod : IMPLICITE.modPaginare,

    // Aceeasi rezolvare ca la iconitele din header: ordinea salvata de
    // comerciant, intersectata cu ce stim azi, si cu grupurile aparute mai
    // tarziu adaugate la coada in loc sa lipseasca.
    grupuriFiltre: resolveActions(
      citeste("grupuriFiltre"),
      GRUPURI_FILTRE.map((g) => g.value),
      IMPLICITE.grupuriFiltre,
    ),
    valoriVizibile: numar(citeste("valoriVizibile"), IMPLICITE.valoriVizibile, 3, 20),
    arataNumaratori: comutator(citeste("arataNumaratori"), IMPLICITE.arataNumaratori),
    filtreDesfasurate: comutator(citeste("filtreDesfasurate"), IMPLICITE.filtreDesfasurate),

    sortareImplicita: sir(citeste("sortareImplicita"), IMPLICITE.sortareImplicita),
    sortariOferite: resolveActions(
      citeste("sortariOferite"),
      SORTARI_CATALOG.map((s) => s.value),
      IMPLICITE.sortariOferite,
    ),

    textSubGrila: sir(citeste("textSubGrila"), IMPLICITE.textSubGrila),
  };
}
