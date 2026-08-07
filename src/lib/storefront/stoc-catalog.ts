import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";

/**
 * „Produsul asta e fara stoc?", pentru catalogul din browser.
 *
 * Intrebarea a avut, pe rand, sase formulari diferite in aceeasi aplicatie.
 * Docblock-ul din `lib/bundles.ts` le-a inchis pe primele patru; a cincea a
 * supravietuit in filtrul „In stoc" din `MiniStoreRenderer` si a sasea in panoul
 * de cautare. Amandoua sunau `!track_inventory || stock > 0`, ceea ce pentru un
 * PACHET e intotdeauna adevarat: pachetele se scriu cu `track_inventory: false`
 * (vezi `bundles.ts`). Deci fiecare pachet trecea neconditionat filtrul, inclusiv
 * „Pachet Femei" (suplio, 358,40 lei) cu toate cele trei componente sterse.
 *
 * De aceea regula sta acum intr-un singur loc, importabil. Cand felierea se muta
 * pe server, fisierul asta e specificatia pe care o oglindeste coloana calculata
 * din baza — nu se rescrie regula a saptea oara in SQL dupa ureche.
 */

/** Exact campurile de care depinde verdictul. Nu cere tot produsul. */
export interface ProdusCuStoc {
  id: string;
  is_bundle?: boolean | null;
  track_inventory?: boolean | null;
  stock_quantity?: number | null;
  page_sections?: unknown;
}

/**
 * `dupaId` e catalogul activ, indexat. Pentru pachete conteaza ca e COMPLET: un
 * id de componenta care nu se regaseste inseamna „sters sau dezactivat", adica
 * indisponibil — nu „necunoscut, deci probabil bine". Exact inversul acestei
 * citiri a tinut „Pachet Femei" pe raft o saptamana.
 *
 * Cand payload-ul devine partial (paginare pe server), harta asta nu mai poate
 * raspunde si verdictul trebuie sa vina de la server. Vezi nota din
 * `MiniStoreRenderer` de deasupra lui `productById`.
 */
export function esteFaraStocInCatalog(
  p: ProdusCuStoc,
  dupaId: ReadonlyMap<string, ProdusCuStoc>,
): boolean {
  if (p.is_bundle) {
    const cfg = readBundleConfig(p.page_sections);
    const componente = (cfg?.items ?? []).map((it) => {
      const comp = dupaId.get(it.product_id);
      return {
        quantity: it.quantity,
        vandabila: !!comp,
        track_inventory: !!comp?.track_inventory,
        stock_quantity: comp?.stock_quantity ?? null,
      };
    });
    return !disponibilitatePachet(componente).inStock;
  }
  // `=== 0`, nu `<= 0`, fiindca asta face codul de azi peste tot: un stoc negativ
  // (se intampla la importuri) se citeste ca „in stoc". Pastrat identic
  // deliberat, ca mutarea regulii sa nu schimbe pe furis ce vede clientul;
  // daca trebuie schimbat, se schimba separat si vizibil.
  return !!(p.track_inventory && p.stock_quantity === 0);
}
