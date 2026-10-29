/*
  Formele datelor unei teme (etapele 16-19 din `docs/editor-magazin/PLAN.md`). Fisier de tipuri, fara cod: il citesc
  si setul de date al temei, si importul, si probele.
*/

import type { FontKey } from "@/lib/storefront/design/types";

/** O categorie de pe primul nivel, cu subcategoriile ei (numele lor; produsele se leaga de categorie prin NUME). */
export interface CategorieDemo {
  nume: string;
  imagine: string;
  copii: string[];
}

export interface ProdusDemo {
  /** Stabila: din ea se face `external_id`, deci importul repetat nu dubleaza produsul. */
  cheie: string;
  nume: string;
  /** Numele subcategoriei (sau al categoriei) din `categorii`. */
  categorie: string;
  pret: number;
  /** Pretul de dinainte de reducere, cand produsul e la oferta. */
  pretVechi?: number;
  imagine: string;
  /** Intra in randul „Recomandate” (`is_featured`). */
  recomandat?: boolean;
  descriere: string;
}

/** Un banner al caruselului: imaginea si categoria spre care duce. */
export interface BannerDemo {
  imagine: string;
  categorie: string;
}

/** Un card de langa banner: titlu, text, imagine, categoria spre care duce. */
export interface CardDemo {
  titlu: string;
  text: string;
  imagine: string;
  categorie: string;
}

/** O placa de recomandare: titlu, imagine, categoria spre care duce. */
export interface PlacaDemo {
  titlu: string;
  imagine: string;
  categorie: string;
}

/** Un rand de produse de pe prima pagina, cu produsele alese dupa cheie (in `page_content.product_sections`). */
export interface RandDemo {
  cheie: string;
  titlu: string;
  produse: string[];
}

export interface SetDateDemo {
  categorii: CategorieDemo[];
  produse: ProdusDemo[];
  bannere: BannerDemo[];
  carduri: CardDemo[];
  placi: PlacaDemo[];
  randuri: RandDemo[];
}

/**
 * Identitatea temei: ce regleaza si fila „Stil” (culoarea principala, fundalul, fonturile). Se scrie acolo unde o citeste
 * „Stil” (`businesses.primary_color`, `page_content`), nu in `design.style`, care ar castiga peste ea: dupa aplicare,
 * culoarea si fonturile alese din „Stil” n-ar mai fi facut nimic (etapa 17.1 din `docs/editor-magazin/PLAN.md`).
 */
export interface IdentitateTema {
  culoare: string;
  fundal: string;
  fontTitluri: FontKey;
  fontText: FontKey;
}

/** Ce stie aplicarea despre magazin (etapa 17). Fara furnizor de newsletter, coloana „Newsletter” a temei nu intra. */
export interface OptiuniTema {
  cuNewsletter?: boolean;
}
