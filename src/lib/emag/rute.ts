/**
 * Pe ce drum pleaca o modificare spre eMAG.
 *
 * ═══ ⚠ FISIERUL ASTA E LECTIA TRENDYOL FACUTA STRUCTURALA ═══
 *
 * eMAG are trei cai de scriere, de greutati foarte diferite:
 *
 *   `PATCH /offer_stock/{id}`   numai cantitatea. Cea mai usoara.
 *   `POST /offer/save`          pret, TVA, timp de pregatire, stare. Max 50.
 *   `POST /product_offer/save`  produs + DOCUMENTATIE. Singura care creeaza.
 *
 * La Trendyol, `op: 'upsert'` pe un produs deja aprobat trimitea CONTINUT in loc de
 * pret: 1051 de produse au raportat succes cu preturile neschimbate, si s-a aflat
 * abia cand a intrebat comerciantul, dupa o zi.
 *
 * Aici drumul nu se alege dupa ce e mai la indemana, ci dupa CE S-A SCHIMBAT. Iar
 * alegerea e o functie pura, ca sa poata fi probata fara eMAG — fiindca greseala nu
 * se vede nici la citire, nici la rulare: totul raspunde „reusit".
 *
 * ═══ ⚠ A DOUA REGULA, LA FEL DE SCUMPA: OFERTELE PRELUATE ═══
 *
 * Dupa import, magazinul are randuri `emag_offers` cu `auto_sync: false`. Ele
 * existau la eMAG inainte sa stim noi de ele, iar pretul si stocul lor sunt puse de
 * comerciant in panoul LOR.
 *
 * Coada nu stia asta: `queue.ts` se uita numai daca exista un rand, deci dupa primul
 * import orice schimbare de pret in magazin ar fi plecat si peste ofertele preluate
 * — adica exact munca pentru care omul a facut importul, stearsa de prima
 * modificare. Paza e in doua locuri, si dinadins: coada nu le mai pune, iar de aici
 * nu mai pleaca nici daca au fost puse cumva. Un rand poate ajunge in coada INAINTE
 * ca `auto_sync` sa fie stins, si atunci numai a doua paza mai apuca sa-l opreasca.
 *
 * Apasarea EXPLICITA a comerciantului trece: `fortat: true`. Asta e alta intrebare
 * decat „sincronizeaza automat", si de aceea e alt camp.
 */

import type { OpEmag } from "./queue";
import { EMAG_VALIDARE_VANDABILA } from "./types";

export type FelRuta =
  /** `POST /product_offer/save` cu documentatie intreaga. SINGURA care creeaza. */
  | "creeaza"
  /** `POST /offer/save` — pret, TVA, timp de pregatire, stare. Nu atinge documentatia. */
  | "oferta"
  /** `PATCH /offer_stock/{id}` — numai cantitatea. */
  | "stoc"
  /** `POST /offer/save` cu `status: 0`. eMAG NU are stergere de oferta. */
  | "retrage"
  /** `POST /measurements/save` — dimensiuni si greutate. */
  | "masuratori"
  /** Nu pleaca nimic, si se spune de ce. */
  | "nimic";

export interface Ruta {
  fel: FelRuta;
  /** Numai la `nimic`: ce sa scrie in `last_error` si pe ecran. */
  motiv?: string;
}

export interface StareaOfertei {
  /** Ce s-a cerut: felul lucrarii din coada. */
  op: OpEmag;
  /** Are deja `emag_id` trimis si primit de ei? */
  existaLaEmag: boolean;
  /** `emag_offers.auto_sync`. ⚠ `false` = oferta PRELUATA din contul lor. */
  autoSync: boolean;
  /**
   * Comerciantul a apasat el butonul.
   *
   * ⚠ ALT LUCRU DECAT `autoSync`. „Nu trimite singur" nu inseamna „nu trimite
   * niciodata" — inseamna „nu fara sa-ti cer". Confundate, butonul „Trimite acum"
   * n-ar fi facut nimic pe ofertele preluate, si nici n-ar fi spus de ce.
   */
  fortat?: boolean;
}

/**
 * Drumul, sau motivul pentru care nu pleaca nimic.
 *
 * ⚠ ORDINEA VERIFICARILOR CONTEAZA. Retragerea se hotaraste PRIMA, inaintea oricarei
 * alte reguli: un produs sters din magazin trebuie oprit de la vanzare pe eMAG chiar
 * daca oferta e preluata si chiar daca nimeni n-a apasat nimic. Pusa dupa paza
 * ofertelor preluate, stergerea unui produs importat n-ar fi ajuns niciodata la ei —
 * si magazinul ar fi continuat sa vanda pe eMAG ceva ce nu mai are.
 */
export function rutaDeTrimitere(s: StareaOfertei): Ruta {
  if (s.op === "retragere") {
    if (!s.existaLaEmag) return { fel: "nimic", motiv: "Oferta nu a ajuns niciodată pe eMAG." };
    return { fel: "retrage" };
  }

  if (!s.autoSync && !s.fortat) {
    return {
      fel: "nimic",
      motiv:
        "Ofertă preluată din contul tău eMAG. Prețul și stocul ei nu se trimit automat, " +
        "ca să nu-ți suprascriem ce ai pus în panoul eMAG. Apasă „Trimite acum” dacă vrei.",
    };
  }

  /*
   * ⚠ O oferta care nu exista inca la ei nu poate fi „actualizata". Oricat de mica
   * ar fi lucrarea ceruta — o schimbare de stoc — prima trimitere TREBUIE sa fie
   * `product_offer/save`, fiindca numai ea creeaza. Trimis pe ruta usoara,
   * `offer/save` ar fi raspuns cu un refuz despre un id inexistent, iar produsul ar
   * fi ramas nepublicat cu un mesaj care nu spune „mai intai publica-l".
   */
  if (!s.existaLaEmag) return { fel: "creeaza" };

  if (s.op === "oferta") return { fel: "creeaza" };
  if (s.op === "masuratori") return { fel: "masuratori" };
  if (s.op === "stoc") return { fel: "stoc" };
  return { fel: "oferta" };
}

/**
 * Cate elemente incap intr-o cerere, pe fiecare drum.
 *
 * ⚠ 50 E MAXIMUL LOR, SCRIS IN DOCUMENTATIE, SI NU E O RECOMANDARE. Peste el,
 * `product_offer/save` intoarce `isError: true` cu „Maximum input vars of 4000
 * exceeded" — adica nu se salveaza NIMIC din lot. Vezi `errors.ts`, unde raspunsul
 * acela e clasificat drept refuz tocmai ca sa nu iasa lotul din coada raportand
 * succes.
 *
 * `offer_stock` merge oferta cu oferta: e `PATCH` pe un id, deci n-are lot.
 */
export const LOT_MAXIM: Record<FelRuta, number> = {
  creeaza: 50,
  oferta: 50,
  retrage: 50,
  masuratori: 50,
  stoc: 1,
  nimic: 0,
};

/**
 * E oferta chiar vandabila la ei?
 *
 * ⚠ PATRU CONDITII DEODATA, si sunt scrise cuvant cu cuvant in documentatia lor.
 * Verificata pe una singura, ecranul ar fi spus „publicat" pentru oferte pe care
 * cumparatorul nu le vede — cea mai suparatoare forma de minciuna a unui panou,
 * fiindca comerciantul nu are cum s-o dovedeasca.
 *
 * ═══ ⚠ DE CE `translation_validation_status` NU INTRA AICI ═══
 *
 * Fiindca nu se stie ce inseamna valorile lui. Documentatia spune atat:
 *
 *     „automatically translated products may not be published even with
 *      validation_status 9/11 — check «translation_validation_status» for
 *      granularity."
 *
 * Cautat in tot OpenAPI-ul lor: campul apare de DOUA ori, si nicaieri nu i se
 * enumera valorile. Prima forma a functiei avea aici o lista „[1, 3, 9, 11, 12]",
 * copiata dupa `validation_status`. Era inventata.
 *
 * Iar inventata, ar fi mintit in amandoua felurile: valorile bune socotite rele ar
 * fi aratat drept „nepublicate" oferte care se vand, iar cele rele socotite bune ar
 * fi aratat „publicat" acolo unde eMAG blocheaza. A doua e mai rea, si e chiar
 * greseala pe care documentatia lor te avertizeaza s-o eviti.
 *
 * Deci verdictul se da pe cele patru care se stiu, iar traducerea se ARATA separat,
 * neinterpretata, cu numarul lor cu tot. Cine se uita vede ce a spus eMAG; nimeni nu
 * vede ce am ghicit noi. Cand aflam ce inseamna valorile, se muta aici, cu citat.
 */
export function eVandabila(o: {
  stoc: number;
  status: number | null;
  offer_validation_status: number | null;
  validation_status: number | null;
}): boolean {
  if (!(o.stoc > 0)) return false;
  if (o.status !== 1) return false;
  if (o.offer_validation_status !== 1) return false;
  if (o.validation_status == null) return false;
  return EMAG_VALIDARE_VANDABILA.includes(o.validation_status);
}

/**
 * Traducerea poate bloca publicarea chiar cu restul aprobat.
 *
 * ⚠ Intoarce `true` doar cand chiar E ceva de aratat, si NU pretinde ca stie ce.
 * Textul e al ecranului, si trebuie sa spuna limpede ca numarul e al lor.
 */
export function traducereaPoateBloca(o: {
  validation_status: number | null;
  translation_validation_status: number | null;
}): boolean {
  if (o.translation_validation_status == null) return false;
  /* Cand oferta oricum nu e aprobata, traducerea nu e stirea zilei. */
  return o.validation_status != null && EMAG_VALIDARE_VANDABILA.includes(o.validation_status);
}
