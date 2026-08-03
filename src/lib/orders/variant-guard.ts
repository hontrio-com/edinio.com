import { enabledComboPriceMap, parseVariants } from "@/lib/storefront/variants";

/**
 * Ce pret are linia asta, si are ea voie sa existe?
 *
 * Aceeasi intrebare era pusa in trei feluri, in acelasi fisier:
 *
 *   - produsul principal cerea pretul variantei numite si REFUZA cand n-o
 *     gasea, cu un comentariu care spune raspicat „nu cadem pe pretul de baza,
 *     fiindca ar fi exact portita pe care o inchidem";
 *   - liniile purtate din cos, la doua sute de randuri distanta, cadeau taman pe
 *     pretul de baza: o marime scoasa din vanzare intra in comanda cu numele ei
 *     si cu pretul produsului. In productie sunt 4942 de combinatii dezactivate
 *     pe 751 de produse active, 431 dintre ele cu pret propriu diferit de baza,
 *     pana la 385,25 lei diferenta;
 *   - iar AMANDOUA caile acceptau un produs cu variante trimis FARA nicio
 *     varianta, tot la pretul de baza. Formularul nu lasa asta sa se intample,
 *     dar amandoua actiunile sunt exporturi „use server", adica endpointuri
 *     publice: pe ANTIFOANE inseamna 156,80 in loc de 438,00, si o linie pe
 *     factura fara nicio marime, pe care comerciantul n-are cum sa o expedieze.
 *
 * Regula sta acum intr-un singur loc si intoarce pretul ODATA cu verdictul, ca
 * sa nu mai existe o cale prin care linia trece de verificare si se pretuieste
 * altfel. Preturile vin din `enabledComboPriceMap`, exact multimea din care iese
 * si intervalul afisat pe card.
 */

export interface ProdusPentruLinie {
  name: string;
  /** Pretul de baza, deja rotunjit de apelant. */
  price: number;
  page_sections: unknown;
}

export type RezolvareLinie =
  | { fel: "ok"; unitPrice: number; nume: string }
  | { fel: "eroare"; error: string };

export function pretulLiniei(produs: ProdusPentruLinie, variantTitle?: string | null): RezolvareLinie {
  // BRUT, fara `trim`: verificarea de stoc (`eroareStocPeVarianta`) si scaderea
  // pe combinatie cheie pe sirul asa cum vine. Normalizat doar aici, „ S " ar
  // trece garda, s-ar pretui corect, dar stocul l-ar cauta sub alt titlu — deci
  // o marime pusa pe zero ar redeveni comandabila si stocul nu s-ar mai scadea.
  const titlu = typeof variantTitle === "string" ? variantTitle : "";
  const areVariante = parseVariants(produs.page_sections) !== null;

  if (!areVariante) {
    // Titlu de varianta pe un produs care n-are variante: comerciantul le-a
    // stins intre timp, sau linia a fost fabricata. Pretuita la baza, ar pleca o
    // comanda cu o marime care nu exista in catalog.
    if (titlu) {
      return { fel: "eroare", error: `Produsul „${produs.name}" nu mai are optiuni de ales. Reincarca pagina si incearca din nou.` };
    }
    return { fel: "ok", unitPrice: produs.price, nume: produs.name };
  }

  if (!titlu) {
    return { fel: "eroare", error: `Alege o optiune pentru „${produs.name}" inainte de a comanda.` };
  }

  const pret = enabledComboPriceMap(produs.page_sections, produs.price).get(titlu);
  if (pret == null) {
    // Taiat: mesajul ajunge in `error_logs` ca `message`, iar `logError` nu taie
    // nimic. Titlul vine dintr-un endpoint public.
    return { fel: "eroare", error: `Varianta „${titlu.slice(0, 60)}" nu mai este disponibila. Reincarca pagina si alege alta optiune.` };
  }
  return { fel: "ok", unitPrice: pret, nume: `${produs.name} (${titlu})` };
}

/** Prima linie care nu se poate pretui, cu motivul ei. `null` cand toate sunt bune. */
export function eroareVarianta(
  produse: Map<string, ProdusPentruLinie>,
  linii: { product_id: string; variant_title?: string | null }[],
): string | null {
  for (const l of linii) {
    const produs = produse.get(l.product_id);
    // Produsul lipsa e alta poarta, cu alt mesaj; aici nu se inventeaza un refuz.
    if (!produs) continue;
    const r = pretulLiniei(produs, l.variant_title);
    if (r.fel === "eroare") return r.error;
  }
  return null;
}
