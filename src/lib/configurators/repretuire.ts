/**
 * Repretuirea liniilor configurate, pe server.
 *
 * ═══ ⚠ CE PRIMESTE SERVERUL DE LA BROWSER, SI CE NU ═══
 *
 * Primeste VALORILE. Nu pretul, nu amprenta, nu id-ul configuratorului, nu versiunea. Toate
 * astea le afla el: configuratorul se rezolva din produs si din categoria lui, versiunea e cea
 * ACTIVA acum, iar pretul se calculeaza din valori.
 *
 * Un pret venit de la client nu e o informatie, e o cerere. Proiectul are regula asta scrisa deja
 * peste tot in `placeOrder`: `discount_amount` se ignora, ofertele se re-evaluează de la zero,
 * variantele se repretuiesc din combinatia activata. Configuratorul intra pe acelasi drum.
 *
 * ═══ ⚠ SI CE SE INTAMPLA CAND NU STIM ═══
 *
 * Pe VITRINA, orice necaz inseamna „produsul se vinde simplu": o pagina cazuta e mai rea decat un
 * produs vandut fara configurator.
 *
 * AICI, INVERS. La plasarea comenzii, o linie despre care nu stim sigur ce costa se REFUZA. Trecuta
 * mai departe la pretul de baza, ar fi insemnat sa dam gratis tot ce a configurat cumparatorul —
 * si comanda ar fi ajuns in atelier fara specificatie. Un refuz e o comanda pierduta; o vanzare
 * gresita e marfa lucrata degeaba.
 */

import type { Compilat } from "./compileaza";
import { verificaRaspunsul } from "./raspuns";
import { rezumatConfiguratiei, type RandRezumat } from "./rezumat";
import type { Valori } from "./valori";
import { configuratoarePentruProduse } from "./vitrina";

/** O linie de comanda, asa cum o vede repretuirea. */
export interface LinieCeruta {
  productId: string;
  /** Categoria produsului, din catalog. Trebuie ca sa se poata rezolva mostenirea. */
  category: string | null;
  /** Ce a trimis browserul. Nu se crede pe cuvant. */
  configuratie?: unknown;
  /** Pretul unitar din CATALOG: al variantei alese, sau cel de baza. */
  pretCatalog: number;
}

export type PretConfigurat =
  /** Produsul n-are configurator. Linia se pretuieste ca pana acum. */
  | { fel: "fara" }
  | {
      fel: "ok";
      /** Pretul unitar, NEROTUNJIT — ca `pret x cantitate` sa dea exact subtotalul liniei. */
      unitar: number;
      valori: Valori;
      amprenta: string;
      configuratorId: string;
      versiuneId: string;
      numarVersiune: number;
      /** Configuratia scrisa in cuvinte, ca sa se poata citi comanda fara configurator. */
      rezumat: RandRezumat[];
    }
  | { fel: "refuz"; motive: string[] };

/**
 * Verdictul unei singure linii, fara nicio citire.
 *
 * ⚠ Partea care se poate proba pe hartie sta aici, iar cea care vorbeste cu baza sta mai jos.
 * Amestecate, singura verificare cu putinta ar fi fost una cu baza de date la indemana.
 */
export function verdictulLiniei(
  compilat: Compilat | undefined,
  configuratie: unknown,
  pretCatalog: number,
  identitate?: { configuratorId: string; versiuneId: string; numarVersiune: number },
): PretConfigurat {
  /*
   * ⚠ Fara configurator, valorile trimise se IGNORA, nu se pastreaza.
   *
   * Se intampla firesc: cumparatorul a pus produsul in cos cand avea configurator, iar
   * comerciantul l-a dezlegat intre timp. Pastrate, ar fi intrat in comanda ca o specificatie pe
   * care nimeni n-o mai poate citi — si care n-a fost platita.
   */
  if (!compilat || !identitate) return { fel: "fara" };

  const v = verificaRaspunsul(compilat, configuratie, pretCatalog);
  if (!v.ok) return { fel: "refuz", motive: v.motive.map((m) => m.text) };

  return {
    fel: "ok",
    unitar: v.unitar,
    valori: v.valori,
    amprenta: v.amprenta,
    rezumat: rezumatConfiguratiei(compilat, v.valori),
    ...identitate,
  };
}

/**
 * Repretuieste toate liniile deodata.
 *
 * ⚠ O SINGURA rezolvare de configuratoare pentru tot cosul. Linie cu linie, o comanda de douazeci
 * de linii ar fi facut zeci de dus-intorsuri chiar in clipa in care clientul apasa „Comanda".
 *
 * Raspunsul e indexat dupa POZITIA liniei, nu dupa produs: acelasi produs poate aparea de doua
 * ori, cu doua configuratii diferite, si sunt doua linii.
 */
export async function repretuiesteLinii(
  businessId: string,
  linii: LinieCeruta[],
): Promise<PretConfigurat[]> {
  if (!linii || linii.length === 0) return [];

  const configuratoare = await configuratoarePentruProduse(
    businessId,
    linii.map((l) => ({ id: l.productId, category: l.category })),
  );

  return linii.map((l) => {
    const c = configuratoare.get(l.productId);
    return verdictulLiniei(c?.compilat, l.configuratie, l.pretCatalog, c && {
      configuratorId: c.configuratorId,
      versiuneId: c.versiuneId,
      numarVersiune: c.numarVersiune,
    });
  });
}

/**
 * Instantaneul care se scrie in comanda.
 *
 * ⚠ SE SCRIE CE S-A VANDUT, NU O TRIMITERE CATRE CE SE VINDE ACUM.
 *
 * Tinut doar ca `versiuneId`, atelierul ar fi trebuit sa deschida configuratorul ca sa afle ce
 * inseamna alegerile — iar daca intre timp comerciantul redenumea o optiune, ar fi citit altceva
 * decat a cumparat clientul. Versiunile sunt imutabile, dar etichetele se pot schimba prin
 * publicarea alteia noi, si comanda trebuie sa ramana lizibila si peste un an.
 *
 * Se scriu deci si valorile, si ETICHETELE lor de la momentul vanzarii.
 */
export interface InstantaneuConfiguratie {
  configuratorId: string;
  versiuneId: string;
  numarVersiune: number;
  amprenta: string;
  /** Valorile brute, pentru orice recalculare de mai tarziu. */
  valori: Valori;
  /** Cum se citeste: eticheta campului si ce a ales omul, in cuvinte. */
  rezumat: RandRezumat[];
}
