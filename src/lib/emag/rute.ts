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

import { BUTON_ADU_OFERTELE } from "./etichete";
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
  /**
   * Trimite magazinul si CONTINUTUL, sau numai pretul si stocul?
   *
   * ⚠ ALTA INTREBARE DECAT `autoSync`. Aceea e „trimite ceva"; asta e „rescrie si fisa
   * produsului". Multi comercianti isi ingrijesc fisa in panoul eMAG — poze mai bune,
   * text scris pentru cumparatorul de acolo — si vor ca Edinio sa conduca numai pretul
   * si stocul.
   */
  sincronizeazaContinut?: boolean;
  /**
   * Am citit catalogul lor eMAG de la un capat la altul, macar o data?
   *
   * ═══ ⚠ CAMPUL ASTA N-ARE VALOARE IMPLICITA, SI DINADINS ═══
   *
   * E obligatoriu tocmai ca sa nu se poata uita. Un `?` aici ar fi insemnat ca
   * urmatorul apel scris de cineva grabit trece pe langa paza fara ca TypeScript
   * sa spuna un cuvant — iar felul asta de scapare e chiar cum s-a nascut ce
   * repara fisierul de fata.
   */
  catalogCitit: boolean;
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
   * ═══ ⚠ NU SE CREEAZA NIMIC PE eMAG INAINTE SA LE FI CITIT CATALOGUL (24.08.2026) ═══
   *
   * Un comerciant cu produsele deja in contul lui eMAG a pus 208 la publicat fara sa
   * fi rulat vreodata importul. Din 150 de trimiteri masurate: doua treimi refuzate cu
   * „You already hold a Product associated with this PN”, o treime ajunse ciorne moarte
   * in contul lor, fiindca n-aveau EAN. Zero publicate.
   *
   * ⚠ SI TOTUSI NICIUNA N-A FOST O EROARE. Verdictele au fost „reusit” si „reusit cu
   * observatii” — categoriile care exista tocmai fiindca eMAG raspunde 200 la lucruri
   * care n-au mers. Ecranul ar fi aratat „208 trimise”, iar comerciantul ar fi aflat
   * de la eMAG, nu de la noi. Exact tiparul Trendyol, la alt furnizor.
   *
   * Cauza n-a fost o linie gresita, ci o INTREBARE NEPUSA: „exista deja produsul asta
   * la ei?”. Pana nu le citim catalogul, raspunsul nu se poate sti — iar o creare pe
   * necunoscute e singura scriere din toata integrarea care poate strica ceva in contul
   * COMERCIANTULUI, nu in al nostru.
   *
   * ⚠ Paza opreste NUMAI crearea. O oferta pe care ei o cunosc deja (`existaLaEmag`)
   * pleaca mai departe pe orice ruta, catalog citit sau nu: acolo `product_offer/save`
   * actualizeaza, nu creeaza, si n-are cu ce se ciocni.
   */
  if (!s.existaLaEmag && !s.catalogCitit) {
    return {
      fel: "nimic",
      /* ⚠ Numele butonului se CITEAZA, nu se scrie a doua oara. Vezi `etichete.ts`
         pentru ce a costat scrierea lui de mana, de doua ori in doua zile. */
      motiv:
        "Nu am citit încă lista produselor tale din contul eMAG. Până nu o citim, nu " +
        "avem de unde să știm care dintre produsele tale sunt deja acolo. Trimise din " +
        `nou, eMAG fie le refuză, fie le lasă ciorne. Apasă „${BUTON_ADU_OFERTELE}”. ` +
        "Pasul acesta doar citește și leagă, magazinul tău nu se modifică.",
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

  /*
   * ═══ ⚠ CONTINUTUL OPRIT: PUBLICAREA COBOARA PE RUTA USOARA ═══
   *
   * Cand comerciantul a spus „nu-mi rescrie fisa", o cerere de publicare pe o oferta
   * care EXISTA deja nu se arunca — se face ce se poate: pretul, stocul, starea.
   *
   * Aruncata, o salvare obisnuita de produs n-ar mai fi dus nici pretul nou, si omul
   * ar fi crezut ca oprirea continutului a oprit sincronizarea cu totul.
   *
   * ⚠ Numai pentru ofertele care exista. La una noua nu e nimic de coborat: ori pleaca
   * documentatia, ori nu se publica — iar cazul acela e prins mai sus.
   */
  if (s.op === "oferta" && s.sincronizeazaContinut === false) return { fel: "oferta" };

  if (s.op === "oferta") return { fel: "creeaza" };
  if (s.op === "masuratori") return { fel: "masuratori" };
  if (s.op === "stoc") return { fel: "stoc" };
  return { fel: "oferta" };
}

/**
 * Cine trece primul prin coada.
 *
 * ═══ ⚠ MAI MIC = MAI DEVREME. SCARA E DUPA CAT COSTA INTARZIEREA ═══
 *
 * Fara ea, coada mergea strict in ordinea intrarii — iar o miscare de stoc de dupa o
 * vanzare statea la rand in urma unui catalog de 20.000 de produse pus la publicat cu
 * un minut inainte. La 30 de elemente pe trecere, ar fi asteptat unsprezece ore.
 *
 * Iar in orele acelea eMAG vinde mai departe marfa pe care magazinul n-o mai are.
 *
 *   1 `stoc`       vanzarea S-A INTAMPLAT DEJA. Fiecare minut de intarziere e o
 *                  sansa in plus sa se vanda ceva ce nu mai exista.
 *   2 `retragere`  produsul a fost scos din magazin si inca se vinde la ei.
 *   3 `pret`       comerciantul a schimbat pretul si se asteapta sa plece.
 *   5 `oferta`     publicare si documentatie. Ruta grea, si cea care poate astepta:
 *                  un produs nepublicat inca o ora nu face rau nimanui.
 *   6 `masuratori` dimensiuni si greutate. Nu opresc nicio vanzare.
 *
 * ⚠ 4 e lasat liber DINADINS, ca sa se poata strecura ceva intre pret si publicare
 * fara sa se renumeroteze randurile care sunt deja in coada.
 */
export const PRIORITATE_OP: Record<OpEmag, number> = {
  stoc: 1,
  retragere: 2,
  pret: 3,
  oferta: 5,
  masuratori: 6,
};

/**
 * Peste cat timp se reincearca, dupa al catelea refuz.
 *
 * ═══ ⚠ DE CE NU SE REINCEARCA DIN MINUT IN MINUT ═══
 *
 * Un refuz nu se repara singur. Un produs caruia ii lipseste un camp va fi refuzat
 * la fel si peste un minut, si peste zece — dar fiecare reincercare arde o cerere din
 * cele 3 pe secunda ale magazinului, aceleasi prin care pleaca o miscare de stoc.
 *
 * Cinci reincercari la un minut distanta inseamna ca in primele cinci minute
 * magazinul a platit de cinci ori pentru acelasi raspuns. Cu asteptare crescatoare,
 * a cincea vine dupa un sfert de ora — destul cat comerciantul sa apuce sa repare
 * campul, si destul de rar cat sa nu conteze.
 *
 * ⚠ NU se aplica verdictelor TRECATOARE. Un 429 sau un 503 nu e vina elementului, si
 * nu arde nicio incercare — vezi `ardeIncercare`. Asteptarea de aici e numai pentru
 * refuzuri, adica pentru lucruri care chiar au nevoie de o schimbare.
 */
export function asteptareaUrmatoare(incercari: number): number {
  const trepte = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000];
  const i = Math.max(0, Math.min(trepte.length - 1, Math.floor(incercari) - 1));
  return trepte[i];
}

/**
 * Cat se asteapta dupa o PANA, nu dupa un refuz.
 *
 * ═══ ⚠ DOUA INTREBARI DIFERITE, DOUA CONTOARE (audit 24.08.2026) ═══
 *
 * Verdictul „trecatoare" (429, timeout, 5xx, releul cazut) elibera randul FARA nicio
 * amanare: `revendicat_pana: null` si atat. Deci la o pana la ei, cronul lua in fiecare
 * MINUT aceleasi 30 de randuri si le trimitea iar.
 *
 * ⚠ Documentatia lor spune ca si cererile invalide se numara in limita. Bucla ardea
 * chiar cele 3 cereri pe secunda prin care ar fi trebuit sa plece o miscare de stoc dupa
 * o vanzare. Iar cu un timeout de 25 s, doua elemente blocate consumau singure toata
 * trecerea si opreau capul cozii.
 *
 * ⚠ TREPTELE SUNT MAI SCURTE DECAT LA REFUZ, si asta e tot rostul separarii. Un refuz nu
 * se repara singur — produsul caruia ii lipseste un camp va fi refuzat la fel si peste o
 * ora. O pana se repara singura, si de obicei repede: se asteapta cat sa nu batem la usa
 * inchisa, nu cat sa pierdem vanzari dupa ce s-a redeschis.
 *
 * ⚠ Si NU exista prag de abandon pe calea asta. O pana nu e vina elementului. Numarata
 * ca refuz, cinci minute de 429 ar fi golit definitiv coada unui magazin — chiar
 * incidentul de la Trendyol.
 */
export function asteptareaDupaPana(pauze: number): number {
  const trepte = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000];
  const i = Math.max(0, Math.min(trepte.length - 1, Math.floor(pauze) - 1));
  return trepte[i];
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
  /*
   * ═══ ⚠ SE AVERTIZEAZA CAND TRADUCEREA E O PROBLEMA, NU CAND CAMPUL EXISTA ═══
   *
   * Prima forma se uita doar daca vine campul. Dar el vine la ORICE oferta — inclusiv
   * cu traducerea aprobata — deci avertismentul aparea pe fiecare oferta sanatoasa a
   * magazinului. Comerciantul l-a vazut pe un catalog intreg si a intrebat ce e cu el:
   * un „verifica produsul in panoul eMAG" pus pe 3.400 de randuri nu mai e un
   * avertisment, e zgomot care ascunde cele cateva randuri care chiar au nevoie de el.
   *
   * ⚠ Aceeasi scara ca la documentatie. Traducerea are propriile ei stari, cu aceleasi
   * numere: 9 aprobata, 10 blocata, 12 actualizare respinsa. Daca starea traducerii e
   * una dintre cele in regula, nu e nimic de spus.
   */
  if (EMAG_VALIDARE_VANDABILA.includes(o.translation_validation_status)) return false;
  /* Cand oferta oricum nu e aprobata, traducerea nu e stirea zilei. */
  return o.validation_status != null && EMAG_VALIDARE_VANDABILA.includes(o.validation_status);
}
