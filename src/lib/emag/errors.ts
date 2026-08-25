/**
 * Ce inseamna un raspuns de la eMAG.
 *
 * ═══ DE CE E UN FISIER INTREG PENTRU O INTREBARE ═══
 *
 * Fiindca eMAG raspunde `HTTP 200` aproape mereu, iar adevarul e in corp, si
 * fiindca documentatia lor contine o exceptie pe care daca o citesti gresit
 * strici integrarea in doua feluri opuse:
 *
 *     „Every API request must have a response with «isError»: false. Exception:
 *      in the event of a documentation error when saving a product, the API
 *      returns «isError»: true but the new offer is still saved and processed."
 *
 * Adica `isError: true` NU inseamna „n-am facut nimic". Uneori inseamna „am
 * facut, dar am si observatii".
 *
 * ═══ CE AR IESI DIN FIECARE CITIRE GRESITA ═══
 *
 * Luat drept ESEC: oferta exista deja la ei, iar noi o retrimitem. Nu iese un
 * duplicat — `id`-ul e al nostru si retrimiterea e o actualizare — dar coada nu
 * se goleste niciodata, iar cele 3 cereri pe secunda ale magazinului se duc pe o
 * eroare care nu se repara singura.
 *
 * Luat drept REUSITA CURATA: pierdem `doc_errors`, iar comerciantul vede „trimis"
 * la nesfarsit pentru un produs pe care eMAG nu-l va publica. Exact ce s-a
 * intamplat la Trendyol cand motivul respingerii n-a fost aratat.
 *
 * De aceea exista o a treia stare, `reusit_cu_observatii`, care nu are
 * corespondent la niciun alt furnizor din Edinio.
 */

import type { EmagRaspuns } from "./types";
import { BUTON_ADU_OFERTELE } from "./etichete";

export type VerdictEmag =
  /** `isError: false`. S-a facut, fara observatii. */
  | "reusit"
  /**
   * HTTP 200 cu `isError: true`. eMAG A PROCESAT cererea si are observatii.
   * ⚠ NU se reincearca automat: se scriu observatiile si se arata omului.
   */
  | "reusit_cu_observatii"
  /** A inteles si a refuzat. Nu s-a intamplat nimic, reincercarea e libera. */
  | "refuz"
  /** 429, 408, 5xx, retea cazuta. ⚠ NU arde o incercare. */
  | "trecatoare"
  /** 401. Acreditarile nu mai merg; se opreste magazinul, nu elementul. */
  | "chei";

export interface Clasificare {
  verdict: VerdictEmag;
  /** Mesajele lui eMAG, normalizate la text. */
  mesaje: string[];
  /** Un singur rand, pentru `last_error` si pentru ecran. */
  mesaj: string;
}

/**
 * Mesajele, oricum ar veni.
 *
 * OpenAPI-ul lor declara `messages: string[]`, dar in practica sosesc si obiecte
 * (`{ message }`, `{ text }`, `{ field, message }`). Se normalizeaza aici, o
 * data, ca restul codului sa nu mai puna niciun `typeof`.
 */
export function mesajeEmag(corp: unknown): string[] {
  const m = (corp as EmagRaspuns | undefined)?.messages;
  if (!Array.isArray(m)) return [];
  const out: string[] = [];
  for (const x of m) {
    if (typeof x === "string") {
      if (x.trim()) out.push(x.trim());
      continue;
    }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const text = [o.message, o.text, o.error, o.description].find((v) => typeof v === "string" && v.trim());
      const camp = typeof o.field === "string" && o.field.trim() ? `${o.field}: ` : "";
      if (typeof text === "string") out.push(`${camp}${text.trim()}`);
      else out.push(JSON.stringify(x).slice(0, 300));
    }
  }
  return out;
}

/**
 * Rutele la care exceptia din documentatie se aplica.
 *
 * ⚠ Lista e INCHISA dinadins. Exceptia e scrisa numai despre salvarea unui
 * produs; luata larg, ar fi ascuns refuzuri adevarate pe comenzi si pe AWB, unde
 * un „am procesat cu observatii" inventat de noi ar fi insemnat o comanda
 * neconfirmata sau un AWB neemis, raportate drept reusite.
 */
const RUTE_CU_OBSERVATII: readonly string[] = ["/product_offer/save"] as const;

export function poarteObservatii(cale: string): boolean {
  return RUTE_CU_OBSERVATII.some((r) => cale.startsWith(r));
}

/**
 * ═══ ⚠ REFUZURI ALE CERERII INTREGI, PE O RUTA CARE „POARTA OBSERVATII" ═══
 *
 * Prima forma se uita DOAR la ruta: orice `isError: true` la HTTP 200 pe
 * `/product_offer/save` iesea `reusit_cu_observatii`, adica „oferta e salvata,
 * nu reincerca".
 *
 * Dar exceptia din documentatia lor e scrisa despre o EROARE DE DOCUMENTATIE, nu
 * despre orice eroare. Iar aceeasi ruta poate refuza CEREREA INTREAGA, si atunci
 * nu s-a salvat NIMIC:
 *
 *     „Maximum 4000 elements per request — exceeding it returns «isError»: true
 *      with the message «Maximum input vars of 4000 exceeded»"
 *
 * Citit ca „salvat cu observatii", un lot intreg de produse ar fi iesit din coada
 * raportand succes, fara ca vreunul sa fi ajuns la eMAG. Exact forma incidentului
 * VetDepo: raspuns de succes, zero efect, si nimeni nu afla.
 *
 * ⚠ SE POTRIVESTE PE UN SINGUR SIR, LUAT DIN DOCUMENTATIE, NU PE TEXT LIBER.
 * Regula casei e sa nu se clasifice dupa mesaj, fiindca mesajele se traduc si se
 * schimba. Aici nu se clasifica dupa mesaj — se recunoaste un SEMNAL documentat,
 * enumerat, unul singur. Daca eMAG mai adauga vreunul, se adauga si aici, cu
 * citatul lui.
 *
 * ⚠ Ce NU se poate face: raspunsul lui `/product_offer/save` e `ApiResponse`
 * generic, fara rezultate per element (verificat in spec). Deci nu exista niciun
 * mod de a afla CARE dintre cele 50 de oferte dintr-un lot au trecut. De aceea
 * loturile se tin mici si fiecare produs isi pastreaza verdictul lui.
 */
/*
 * ═══ AL DOILEA SEMNAL, ADAUGAT PE 24.08.2026, MASURAT PE 150 DE RASPUNSURI ═══
 *
 *     „You already hold a Product associated with this PN:100170833."
 *
 * Inseamna: comerciantul are DEJA un produs cu numarul asta de parte in contul lui,
 * iar noi am cerut sa se creeze inca unul, sub o identitate noua. eMAG a refuzat —
 * si bine a facut. NU S-A SALVAT NIMIC.
 *
 * ⚠ Citit ca „observatie la documentatie", randul iesea din coada cu `status: sent`
 * si cu un `emag_id` pe care eMAG nu l-a acceptat niciodata. De acolo mai departe,
 * fiecare schimbare de pret sau de stoc ar fi plecat pe `offer/save` catre un id
 * inexistent — la nesfarsit, si de fiecare data „reusit". Chiar tiparul pe care il
 * pazeste tot fisierul asta, ajuns inauntru pe usa exceptiei.
 *
 * Masurat in ziua incidentului: din ~150 de trimiteri, doua treimi au raspuns asa, si
 * panoul comerciantului n-avea niciun produs nou. Verdictul nostru: „reusit cu
 * observatii”, la toate.
 *
 * ⚠ REFUZA LOTUL, NU DOAR PRODUSUL — SI E VOIT. Un lot poate purta pana la 50 de
 * oferte, iar raspunsul lor e generic: nu spune CARE s-a ciocnit. Regula casei e ca
 * verdictul lotului e cel mai rau din el (vezi `trimiteInLoturi`), tocmai fiindca
 * partea nestiuta trebuie citita in defavoarea noastra. Aici asta inseamna: se spune
 * omului ca produsul lui e deja acolo, in loc sa i se spuna ca s-a publicat.
 */
/*
 * ═══ INCA TREI SEMNALE, MASURATE PE 25.08.2026 ═══
 *
 * Gasite pornind de la un refuz care nu se putea explica altfel: `offer/save` intorcea
 * „Offer 1000000388 not found" pentru o oferta pe care noi o credeam trimisa.
 *
 * ⚠ MASURAT: **sapte** oferte cu `last_synced_at` scris, dar pe care reconcilierea nu le-a
 * vazut NICIODATA la ei (`status_la_ei` si `validation_status` amandoua goale). Toate
 * sapte purtau in `doc_errors` unul dintre mesajele de mai jos — adica ei ne spusesera
 * limpede ca nu s-a creat nimic, iar noi am scris „trimis".
 *
 *   „The product you have tried to associate this offer to is a duplicated product."   5
 *   „You already hold an offer associated with this PNK: DXT961MBM."                   1
 *   „4032254753475 is not a valid EAN. - Product id: 1000001088"                       1
 *
 * ⚠ De ce n-au fost prinse de exceptia de documentatie: toate trei SUNT despre
 * documentatie, si totusi inseamna „nu s-a salvat". Regula din documentatia lor —
 * `isError: true` la o eroare de documentatie inseamna totusi salvat — e adevarata, dar
 * NU universala. De aceea nu se muta categoria, se enumera semnalele.
 *
 * ⚠ IRONIA, si merita scrisa: primele doua sunt exact `nehotarat` si `avem_deja`, adica
 * verdictele pe care `cautaInCatalogulLor` le-a primit pe 25.08 ca sa OPREASCA publicarea.
 * N-au oprit-o fiindca intrebarea nici nu se punea: `emag_offers.ean` e scris numai de
 * import, deci filtrul iesea gol si `find_by_eans` nu se chema pentru un produs nou.
 * Reparatia aceea inchide jumatatea din fata — se intreaba inainte. Asta o inchide pe cea
 * din spate: raspunsul lor de dupa nu mai e citit ca reusita.
 *
 * ⚠ „is not a valid ean" se potriveste FARA numarul din fata: mesajul poarta codul
 * respins, care e altul de fiecare data.
 */
const REFUZURI_ALE_CERERII: readonly string[] = [
  "maximum input vars",
  "you already hold a product",
  "is a duplicated product",
  "you already hold an offer",
  "is not a valid ean",
] as const;

export function eRefuzAlCererii(mesaje: string[]): boolean {
  const tot = mesaje.join(" ").toLowerCase();
  return REFUZURI_ALE_CERERII.some((sir) => tot.includes(sir));
}

/**
 * Verdictul.
 *
 * ⚠ SE DECIDE PE CODUL HTTP SI PE FORMA CORPULUI, NICIODATA PE TEXTUL MESAJULUI.
 * Mesajele lor sunt localizate si se schimba sub noi. La Trendyol, potrivirea pe
 * text a facut ca cinci minute de 429 sa goleasca definitiv coada unui magazin.
 *
 * `cale` intra in socoteala fiindca exceptia din documentatie e scrisa despre o
 * anume ruta, nu despre API in general.
 */
export function clasificaRaspuns(status: number, corp: unknown, cale: string): Clasificare {
  const mesaje = mesajeEmag(corp);
  const unRand = mesaje.length ? mesaje.join(" · ").slice(0, 500) : "";

  /* Retea cazuta, raspuns necitibil: `status` 0 il pune clientul. */
  if (status === 0) {
    return { verdict: "trecatoare", mesaje, mesaj: unRand || "eMAG nu a răspuns." };
  }

  if (status === 401 || status === 403) {
    /*
     * ⚠ 403 intra tot aici, si nu la refuz. La eMAG, 403 inseamna de obicei ca
     * apelul a venit de la un IP nealbit sau ca utilizatorul n-are drept de API —
     * amandoua sunt probleme de CONT, nu de continutul cererii. Tratat ca refuz,
     * fiecare produs din coada ar fi ars cinci incercari degeaba.
     */
    return {
      verdict: "chei",
      mesaje,
      mesaj:
        unRand ||
        "eMAG a refuzat autentificarea. Verifică utilizatorul și parola de API, " +
          "și că adresa IP a Edinio este trecută în lista albă din contul tău eMAG.",
    };
  }

  if (status === 429) {
    return { verdict: "trecatoare", mesaje, mesaj: unRand || "Prea multe cereri către eMAG. Se reia singur." };
  }

  if (status === 408 || status >= 500) {
    return { verdict: "trecatoare", mesaje, mesaj: unRand || `eMAG a răspuns cu ${status}. Se reia singur.` };
  }

  if (status >= 400) {
    return { verdict: "refuz", mesaje, mesaj: unRand || `eMAG a refuzat cererea (${status}).` };
  }

  /* De aici in jos: HTTP 200. Adevarul e in corp. */
  const eEroare = (corp as EmagRaspuns | undefined)?.isError === true;

  if (!eEroare) {
    return { verdict: "reusit", mesaje, mesaj: unRand };
  }

  /*
   * ⚠ AICI E EXCEPTIA. HTTP 200 inseamna ca cererea a ajuns si a fost procesata.
   * Pe salvarea unui produs, documentatia spune limpede ca oferta E SALVATA chiar
   * si asa. Deci nu se reincearca: se scriu observatiile si se arata.
   *
   * Pe orice alta ruta, un `isError` la 200 e un refuz obisnuit.
   */
  if (poarteObservatii(cale)) {
    /* ⚠ Un refuz al CERERII INTREGI nu e o observatie: nu s-a salvat nimic.
       Vezi `REFUZURI_ALE_CERERII` pentru de ce si pentru citat. */
    if (eRefuzAlCererii(mesaje)) {
      return { verdict: "refuz", mesaje, mesaj: unRand };
    }
    return {
      verdict: "reusit_cu_observatii",
      mesaje,
      mesaj: unRand || "eMAG a acceptat oferta, dar are observații la documentație.",
    };
  }

  return { verdict: "refuz", mesaje, mesaj: unRand || "eMAG a refuzat cererea." };
}

/**
 * Arde sau nu o incercare din coada?
 *
 * ⚠ Un verdict trecator NU arde. Altfel, o pana de cateva minute la ei goleste
 * cozile tuturor magazinelor, iar produsele raman nesincronizate fara ca nimeni
 * sa stie. E lectia scrisa in `src/lib/trendyol/sync.ts:81`.
 */
export function ardeIncercare(v: VerdictEmag): boolean {
  return v === "refuz";
}

/** Elementul a fost dus la capat si iese din coada? */
export function sAIncheiat(v: VerdictEmag): boolean {
  return v === "reusit" || v === "reusit_cu_observatii";
}

/**
 * Mesaje in romana pentru cele mai dese refuzuri.
 *
 * Se potriveste pe forme STABILE, nu pe fraze intregi, si orice nepotrivire cade
 * inapoi pe textul lor — mai bine un mesaj in engleza decat unul inventat de noi.
 */
/**
 * Codul paginii de produs (PNK) pe care eMAG il NUMESTE chiar in mesajul de refuz.
 *
 * ⚠ ASTA E PARTEA CARE SCHIMBA REFUZUL IN CEVA DE FACUT. Masurat pe cele sapte oferte de
 * pe 24.08.2026, amandoua refuzurile de asociere spun exact unde trebuia dusa oferta:
 *
 *   „…is a duplicated product. Please associate the offer to product with PNK D03M9BBBM"
 *   „You already hold an offer associated with this PNK: DXT961MBM."
 *
 * Fara el, mesajul nostru ar fi fost „pagina e o dublura, descurca-te". Cu el, comerciantul
 * primeste chiar adresa: `emag.ro/-/pd/<PNK>`.
 *
 * ⚠ SE CAUTA IN `brut`, NU IN TEXTUL COBORAT LA LITERE MICI: codul e scris cu majuscule si
 * asa trebuie dat mai departe, altfel linkul nu duce nicaieri.
 *
 * ⚠ Se cere macar 6 semne ca sa nu se agate de vreun cuvant scurt de dupa „PNK”. Cand nu
 * se potriveste nimic, iese sir gol si mesajul isi urmeaza forma fara cod — mai bine fara
 * decat cu unul inventat.
 *
 * ═══ ⚠ DE CE E VOIE SA DAM LINKUL AICI, CAND SAGEATA DIN PANOU E STINSA ═══
 *
 * Pe 24.08.2026 linkul `emag.ro/-/pd/{part_number_key}` a fost scos din panou fiindca
 * ducea la produse straine: 3 chei incercate, 3 produse ale altcuiva. Nota intreaga e in
 * `emag.actions.ts`, la `linkEmag: null`.
 *
 * Cheia de aici NU e aceeasi cheie. Aceea era luata din `emag_offers.part_number_key`,
 * scrisa de noi, cu obarsia inca nelamurita. Asta o rosteste eMAG in raspunsul la CHIAR
 * oferta asta, ca sa ne spuna unde s-o punem.
 *
 * ⚠ SI S-A VERIFICAT PE EMAG.RO, nu s-a presupus — 25.08.2026, amandoua cheile din cele
 * sapte refuzuri:
 *
 *   D03M9BBBM  →  „Royal Canin, Medium, Adult, 15Kg”              = produsul nostru
 *   DXT961MBM  →  „Calibra Dog Verve GF, Adult, Wild Boar…, 400g" = produsul nostru
 *
 * Doi martori pe fiecare, nume si marca. Deci: cheile din MESAJ sunt bune, cele din
 * COLOANA raman nelamurite. Daca vreodata se aprinde sageata la loc, asta e jumatatea de
 * raspuns care exista deja.
 */
export function pnkDinMesaj(brut: string): string {
  const m = /\bPNK:?\s+([A-Za-z0-9]{6,20})/.exec(brut || "");
  return m ? m[1] : "";
}

export function mesajOmenesc(brut: string): string {
  const t = (brut || "").toLowerCase();

  if (!t) return "";

  if (t.includes("rate limit")) {
    return "Prea multe cereri către eMAG. Se reia singur peste puțin.";
  }
  if (t.includes("maximum input vars")) {
    return "Cererea către eMAG a fost prea mare. Se împarte în loturi mai mici și se reia.";
  }
  if (t.includes("vat") && (t.includes("invalid") || t.includes("not found"))) {
    return "Cota de TVA trimisă nu există în contul tău eMAG. Alege alta în setările integrării.";
  }
  if (t.includes("category") && t.includes("not allowed")) {
    return "Nu ai acces la această categorie eMAG. Cere-l din panoul eMAG sau alege altă categorie.";
  }
  /*
   * ⚠ CELE TREI DE MAI JOS SUNT REFUZURI, NU OBSERVATII, si stau ANUME inaintea ramurii
   * generice de EAN. Sunt mesajele masurate pe 25.08.2026 in `REFUZURI_ALE_CERERII`:
   * oferta NU s-a creat. Pana azi doua dintre ele cadeau in engleza bruta, iar a treia
   * nimerea ramura generica si ii spunea comerciantului „observatie" la ceva ce era refuz.
   *
   * ⚠ Fiecare spune si CE SA FACA, si numeste campul asa cum scrie pe ecran — „Cod EAN /
   * Cod de bare" in fisa produsului, „Cod EAN" la combinatie. Un mesaj care descrie
   * necazul fara urmatoarea miscare a facut deja 208 apasari de „Publica" pe 24.08.
   */
  if (t.includes("is a duplicated product")) {
    const pnk = pnkDinMesaj(brut);
    return "Pagina de produs de pe eMAG găsită după codul de bare e o dublură, iar ei cer " +
      "oferta pusă pe pagina originală. Oferta nu s-a creat." +
      (pnk
        ? ` Pagina originală e ${pnk}: https://www.emag.ro/-/pd/${pnk}`
        : " Verifică „Cod EAN / Cod de bare” în fișa produsului.");
  }
  if (t.includes("you already hold an offer")) {
    /* ⚠ Fratele lui „you already hold a product”, dar despre oferta, nu despre produs. */
    const pnk = pnkDinMesaj(brut);
    return "Ai deja o ofertă pe aceeași pagină de produs de pe eMAG, deci nu s-a creat a " +
      `doua oară${pnk ? ` (pagina ${pnk})` : ""}. Apasă „${BUTON_ADU_OFERTELE}” ca să ` +
      "legăm produsul de oferta care există deja acolo.";
  }
  if (t.includes("is not a valid ean")) {
    return "eMAG a respins codul de bare, deci oferta nu s-a creat. Schimbă „Cod EAN / " +
      `Cod de bare” în fișa produsului, sau „Cod EAN” la combinația respectivă: ${brut}`;
  }
  if (t.includes("ean")) {
    /* ⚠ Ce ramane aici CHIAR e o observatie: „saved as a draft … EAN”, si altele ca ea.
       Oferta exista, ii lipseste o completare. De aceea cuvantul „observatie" e corect
       numai dupa ce cele trei refuzuri de mai sus au fost scoase din drum. */
    return `eMAG are o observație la codul EAN: ${brut}`;
  }
  if (t.includes("you already hold a product")) {
    /* ⚠ Se spune CE SA FACA, nu doar ce s-a intamplat. Tradus doar ca „produsul exista
       deja", comerciantul n-avea nicio miscare urmatoare — si tocmai lipsa aia a facut
       208 apasari de „Publica" pe 24.08.2026. */
    return "Produsul există deja în contul tău eMAG, cu același cod (SKU). " +
      `Apasă „${BUTON_ADU_OFERTELE}” ca să îl legăm de cel de acolo, în loc să îl ` +
      "creăm a doua oară.";
  }
  if (t.includes("part_number_key")) {
    return `eMAG are o observație la produsul la care încerci să atașezi oferta: ${brut}`;
  }
  if (t.includes("characteristic")) {
    return `Lipsește sau nu se potrivește o caracteristică cerută de categorie: ${brut}`;
  }
  if (t.includes("sale_price") || t.includes("min_sale_price") || t.includes("max_sale_price")) {
    return `eMAG a respins prețul: ${brut}`;
  }

  return brut;
}

/**
 * Raspunsul lor spune ca lotul a depasit limita de ELEMENTE, nu de entitati?
 *
 * ═══ ⚠ DOUA LIMITE DIFERITE, SI NUMAI UNA SE VEDE IN `LOT` ═══
 *
 * `LOT = 50` respecta limita de ENTITATI. Cealalta e pe elemente: „Maximum input vars of
 * 4000 exceeded". 50 de produse simple incap; 50 de variante cu caracteristici, imagini,
 * GPSR si familie pot sa nu incapa.
 *
 * ⚠ SE POTRIVESTE PE TEXT, si e singura data cand o facem — documentatia lor interzice in
 * general potrivirea pe mesaj, fiindca e localizat. Dar mesajul asta e o constanta de
 * infrastructura PHP (`max_input_vars`), nu un text tradus, si e citat ca atare in chiar
 * documentatia lor. Fara el n-am avea cum sa deosebim „prea mare" de orice alt refuz — iar
 * a injumatati la ORICE refuz ar inmulti cererile pentru un „nu" care nu se schimba.
 */
export function ePreaMareLotul(mesaje: string[] | undefined, eroare?: string): boolean {
  const tot = [...(mesaje ?? []), eroare ?? ""].join(" ").toLowerCase();
  return tot.includes("maximum input vars");
}
