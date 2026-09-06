/**
 * Ce ramane afara din catalogul Meta, si ce i se spune comerciantului.
 *
 * ═══ ⚠ CE COSTA CAND NU EXISTA ═══
 *
 * Feedul sare produse in tacere, si pana acum panoul spunea doar „N produse active in magazin.
 * Feed-ul se actualizeaza automat" — adica exact ce il face pe comerciant sa creada ca pleaca
 * toate. Un produs lipsa dintr-un catalog nu da nicio eroare nicaieri: nu apare in reclame, nu se
 * vinde, si singurul semn e o cifra care nu vine. Masurat pe integrarea asta de doua ori: un feed
 * segmentat gol raspundea 200 cu zero articole, si un feed sters raspundea 200 cu articolele
 * vechi. Aceeasi tacere, alta usa.
 *
 * ⚠ AICI E DOAR VOCABULARUL, NU HOTARAREA. Cine hotaraste e `motivulLipseiDinCatalog` din
 * `catalog-feed.ts`, scris chiar langa generator si folosit CHIAR DE EL ca sa opreasca produsul.
 * O a doua judecata, scrisa aici ca sa aiba panoul ce arata, s-ar fi departat de prima la prima
 * schimbare — si atunci ecranul ar fi spus „pleaca tot" despre un produs care nu pleaca, ceea ce e
 * mai rau decat sa nu spuna nimic.
 *
 * ⚠ `Record<MotivLipsaDinCatalog, ...>` de mai jos costa un motiv nou fara text: nu compileaza.
 * De-aia tipul si textele stau impreuna, si nu langa hotarare.
 *
 * Fisierul asta il importa SI panoul, care e o componenta client: de-aia n-are inauntru decat
 * tipuri si texte, fara nimic de pe server.
 */

import { MOTIV_PRET_CARE_MINTE } from "@/lib/customization/pretul-din-catalog-minte";

/** Motivele pentru care un produs activ nu ajunge in feed. Derivate din generator, nu din memorie. */
export type MotivLipsaDinCatalog = "pret-care-minte" | "fara-imagine";

/** Un produs lasat afara, asa cum il primeste panoul. */
export interface ProdusLasatAfara {
  id: string;
  name: string;
  motiv: MotivLipsaDinCatalog;
}

/*
 * ⚠ Textele de mai jos le citeste COMERCIANTUL, deci au diacritice — ca vecinul lor de aici,
 * `MOTIV_PRET_CARE_MINTE`, si ca restul panourilor de integrari. Comentariile si codul raman fara,
 * ca peste tot in proiect.
 */
export const MOTIVE_LASATE_AFARA: Record<
  MotivLipsaDinCatalog,
  { eticheta: string; explicatie: string }
> = {
  "pret-care-minte": {
    eticheta: "Prețul din catalog nu e prețul plătit",
    explicatie: MOTIV_PRET_CARE_MINTE,
  },
  "fara-imagine": {
    eticheta: "Fără imagine",
    explicatie:
      "Meta cere o imagine pentru fiecare articol din catalog și nu difuzează reclame fără ea, "
      + "așa că produsul nu pleacă deloc. Adaugă-i cel puțin o imagine și intră singur la "
      + "următoarea actualizare a feedului.",
  },
};
