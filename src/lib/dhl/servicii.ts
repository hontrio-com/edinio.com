/**
 * Nomenclatorul de produse DHL Express.
 *
 * ═══ DE UNDE VIN DATELE, SI DE CE E ALTFEL DECAT LA UPS ═══
 *
 * La UPS, lista de coduri era o RECONSTRUCTIE: specificatia trimitea la un apendice
 * nepublicat, iar disponibilitatea pe tari a trebuit dedusa din trei documente
 * comerciale. Aici nu e cazul. DHL publica nomenclatorul intreg, ca date, fara
 * autentificare:
 *
 *   https://developer.dhl.com/sites/default/files/2026-06/ExpressReferenceData_3.3.1.zip
 *   → ExpressReferenceData_2026-06-28.xlsx, foaia `productCode`, 36 de randuri
 *
 * Coloanele lor: `productCode | productName | productContentCode | docNonDocIndicator |
 * docNonDocDescription | shipmentMaximumWeight | pieceMaximumWidth | pieceMaximumLength |
 * pieceMaximumHeight | defaultDeliveryTime`. Tabelul de mai jos e transcrierea LOR,
 * cu numele traduse acolo unde exista echivalent comercial romanesc.
 *
 * Acelasi set se poate cere si la rulare: `GET /reference-data?datasetName=productCode`.
 *
 * ═══ ⚠ CE NU E IN FISIERUL LOR: DIMENSIUNEA DE TARA ═══
 *
 * Foaia `productCode` din arhiva **nu are coloana `countryCode`** — dump-ul offline e
 * GLOBAL. Dimensiunea de tara exista NUMAI prin API:
 *
 *   GET /reference-data?datasetName=productCode&filterByAttribute=countryCode&filterByValue=RO
 *
 * Deci o lista statica de produse „pentru Romania" ar fi gresita prin constructie. Si
 * nici tara nu ajunge: produsele tin de CONTRACT, nu de geografie. Codurile lor de
 * eroare o spun raspicat:
 *
 *   8035  „Product code provided not matching the account's network type code."
 *   8036  „Product code is not allowed for account number's network type code."
 *   8003  „Account not allowed for this service. Please contact your DHL Express representative."
 *
 * iar raspunsul de cotare poarta `isCustomerAgreement: "Indicator that the product only
 * can be offered to customers with prior agreement."`
 *
 * ⚠⚠ DE ACEEA TABELUL DE MAI JOS NU FILTREAZA NIMIC. E o TRADUCERE si un SFAT pentru
 * pagina de configurare, niciodata o poarta peste ce a intors cotarea. Aceeasi lectie
 * ca la UPS, unde prima varianta folosea lista comerciala ca filtru si ascundea
 * cumparatorului servicii pe care UPS chiar le vindea.
 *
 * ═══ ⚠ PERECHILE DOCUMENT / MARFA — CAPCANA CARE SCHIMBA TACIT PRETUL ═══
 *
 * La DHL acelasi serviciu comercial are DOUA coduri, dupa cum coletul contine
 * documente sau marfa:
 *
 *   EXPRESS WORLDWIDE (extra-UE)   D (DOX)  /  P (WPX)
 *   EXPRESS WORLDWIDE (UE)         U (ECX)  /  [vezi nota de la `U`]
 *   ECONOMY SELECT                 W (ESU)  /  H (ESI)
 *   EXPRESS 9:00                   K (TDK)  /  E (TDE)
 *   EXPRESS 12:00                  T (TDT)  /  Y (TDY)
 *   EXPRESS 10:30                  L (TDL)  /  M (TDM)
 *   EXPRESS EASY                   7 (XED)  /  8 (XEP)
 *
 * Alegerea nu se face de noi: ea rezulta din `content.isCustomsDeclarable`, iar DHL
 * intoarce la cotare doar produsele potrivite. Masurat pe sonda lor publica de
 * capabilitate, RO→DE cu `dtbl=N` intoarce `K, T, U, W` (documente), iar acelasi
 * RO→DE cu `dtbl=Y` intoarce doar `P`. **Un steag gresit nu da eroare — da alt produs
 * si alt pret.**
 *
 * ═══ ⚠ `productContentCode` NU E O CHEIE ═══
 *
 * `DOM` apartine la DOUA produse diferite, cu indicatori opusi:
 *   3 | EXPRESS WORLDWIDE | DOM | N (Non Doc) | 3030 kg
 *   N | EXPRESS DOMESTIC  | DOM | Y (Doc)     | 1010 kg
 * La fel `DES`: `G` (Economy Select Domestic) si `J` (literalmente „Placeholder").
 * Deci maparea merge NUMAI in directia `productCode → continut`, niciodata invers.
 */

/** Un produs, asa cum il declara nomenclatorul lor, cu numele in romaneste. */
type Produs = {
  /** Numele pe care il aratam comerciantului si cumparatorului. */
  nume: string;
  /** `productName` verbatim din nomenclatorul lor, pentru cautari si pentru jurnal. */
  numeDhl: string;
  /** `productContentCode` (WPX, DOX, ECX, DOM, ESU…). ⚠ NU e unic — vezi antetul. */
  continut: string;
  /** `docNonDocIndicator`: `true` = varianta pentru DOCUMENTE. */
  document: boolean;
  /** `shipmentMaximumWeight`, in kilograme. */
  greutateMaximaKg: number;
  /** E produs de marfa grea (paleti, breakbulk), nu de colete? */
  marfaGrea?: boolean;
  /** Il propunem in configurare pentru un expeditor din Romania? */
  romania?: "intern" | "extern" | "ambele";
};

/**
 * ⚠ TOATE cele 36 de coduri din nomenclatorul lor, ca sa nu existe niciun cod fara nume.
 *
 * Un produs necunoscut intors de cotare ar aparea in checkout ca o litera singura —
 * exact felul de amanunt care il face pe cumparator sa nu apese.
 */
export const PRODUSE: Record<string, Produs> = {
  /* ─── Ce se vinde cu origine Romania ─────────────────────────────────────────
   *
   * Sursa pentru coloana `romania`: „Ghidul de Servicii si Tarife DHL Express 2026:
   * Romania", editiile RO si EN, plus sonda lor publica de capabilitate.
   *
   * ⚠ INTERN: ghidul romanesc are sectiune proprie — „SERVICII INTERNE / Daca doriti
   * sa expediati documente sau bunuri in Romania, va putem oferi produse Time Definite
   * Domestic…" — iar tabelul lor de suprataxe are coloana `Domestic:` in lei, separata
   * de `International:`. Deci livrarile interne exista. Singurul produs intors de sonda
   * lor pentru RO→RO e `N`.
   */
  N: { nume: "DHL Express Domestic — ziua urmatoare, in Romania", numeDhl: "EXPRESS DOMESTIC", continut: "DOM", document: true, greutateMaximaKg: 1010, romania: "intern" },

  /* ⚠ `P` e produsul international de baza pentru MARFA si singurul care apare pe
     TOATE rutele externe din sonda lor (DE, GB, US, MD). */
  P: { nume: "DHL Express Worldwide — colete, in toata lumea", numeDhl: "EXPRESS WORLDWIDE", continut: "WPX", document: false, greutateMaximaKg: 3030, romania: "extern" },
  /* ⚠ `U` e varianta pentru DOCUMENTE catre Uniunea Europeana. Nomenclatorul lor il
     marcheaza `Doc`, dar tabelul de coduri locale al DHL UK il descrie fara separare
     doc/non-doc, ca „Express Worldwide (EU) | ECX | Europe (EU Countries)". Cele doua
     nu se pot impaca din documente; nu se alege de noi, il alege cotarea. */
  U: { nume: "DHL Express Worldwide — documente, in Uniunea Europeana", numeDhl: "EXPRESS WORLDWIDE", continut: "ECX", document: true, greutateMaximaKg: 3030, romania: "extern" },
  D: { nume: "DHL Express Worldwide — documente, in afara Uniunii", numeDhl: "EXPRESS WORLDWIDE", continut: "DOX", document: true, greutateMaximaKg: 3030, romania: "extern" },

  /* ⚠ ECONOMY SELECT NU E „CEL MAI IEFTIN" LA ORICE GREUTATE.
     Din tabelele lor de tarife pentru Romania, Zona 1: la 1 kg Express Worldwide costa
     452,50 lei si Economy Select 473,00; abia de la 2 kg se inverseaza (659,26 fata de
     625,00). In Zona 4 punctul de incrucisare urca la ~3 kg. Pentru un magazin online,
     unde coletul tipic e sub 2 kg, presupunerea „economy = ieftin" factureaza IN PLUS.
     De aceea ofertele se sorteaza dupa pretul intors, niciodata dupa o ordine scrisa
     de noi.
     ⚠ Si nu merge peste tot in Uniune: matricea lor de capabilitate bifeaza Economy
     Select pentru Bulgaria, Germania, Italia, Irlanda, Polonia si Portugalia, dar NU
     pentru Ungaria. Tabelul lor de tarife are doar zonele 1-4, fata de 1-7 la Express
     Worldwide („Over 25" tari, fata de „More than 220"). */
  W: { nume: "DHL Economy Select — documente, economic, in Europa", numeDhl: "ECONOMY SELECT", continut: "ESU", document: true, greutateMaximaKg: 3030, romania: "extern" },
  H: { nume: "DHL Economy Select — colete, economic, in Europa", numeDhl: "ECONOMY SELECT", continut: "ESI", document: false, greutateMaximaKg: 3030, romania: "extern" },

  /* Produsele cu ora garantata. Ghidul romanesc: Express 12:00 si Express 9:00 au
     „money-back guarantee", Express Worldwide si Economy Select NU. */
  T: { nume: "DHL Express 12:00 — documente, pana la pranz", numeDhl: "EXPRESS 12:00", continut: "TDT", document: true, greutateMaximaKg: 300, romania: "extern" },
  Y: { nume: "DHL Express 12:00 — colete, pana la pranz", numeDhl: "EXPRESS 12:00", continut: "TDY", document: false, greutateMaximaKg: 300, romania: "extern" },
  K: { nume: "DHL Express 9:00 — documente, pana dimineata", numeDhl: "EXPRESS 9:00", continut: "TDK", document: true, greutateMaximaKg: 250, romania: "extern" },
  E: { nume: "DHL Express 9:00 — colete, pana dimineata", numeDhl: "EXPRESS 9:00", continut: "TDE", document: false, greutateMaximaKg: 250, romania: "extern" },

  /* ─── Restul nomenclatorului: nume, nu oferta ─────────────────────────────────
   *
   * Nu le propunem in configurare (n-au `romania`), dar au nume ca sa nu apara ca o
   * litera daca vreun cont le are prin contract.
   */
  L: { nume: "DHL Express 10:30 — documente", numeDhl: "EXPRESS 10:30", continut: "TDL", document: true, greutateMaximaKg: 250 },
  M: { nume: "DHL Express 10:30 — colete", numeDhl: "EXPRESS 10:30", continut: "TDM", document: false, greutateMaximaKg: 250 },
  "1": { nume: "DHL Express Domestic 12:00", numeDhl: "EXPRESS DOMESTIC 12:00", continut: "DOT", document: true, greutateMaximaKg: 1000 },
  I: { nume: "DHL Express Domestic 9:00", numeDhl: "EXPRESS DOMESTIC 9:00", continut: "DOK", document: true, greutateMaximaKg: 300 },
  O: { nume: "DHL Express Domestic 10:30", numeDhl: "EXPRESS DOMESTIC 10:30", continut: "DOL", document: true, greutateMaximaKg: 300 },
  G: { nume: "DHL Economy Select Domestic", numeDhl: "ECONOMY SELECT DOMESTIC", continut: "DES", document: true, greutateMaximaKg: 3000 },
  /* ⚠ `3` poarta ACELASI `productContentCode` ca `N` (DOM), dar e non-doc si merge pana
     la 3030 kg. Vezi antetul: continutul nu e cheie. */
  "3": { nume: "DHL Express Worldwide", numeDhl: "EXPRESS WORLDWIDE", continut: "DOM", document: false, greutateMaximaKg: 3030 },
  "7": { nume: "DHL Express Easy — documente", numeDhl: "EXPRESS EASY", continut: "XED", document: true, greutateMaximaKg: 25 },
  "8": { nume: "DHL Express Easy — colete", numeDhl: "EXPRESS EASY", continut: "XEP", document: false, greutateMaximaKg: 25 },
  X: { nume: "DHL Express Envelope — plic, pana la 300 g", numeDhl: "EXPRESS ENVELOPE", continut: "XPD", document: true, greutateMaximaKg: 0.31 },
  C: { nume: "DHL Medical Express — documente", numeDhl: "MEDICAL EXPRESS", continut: "CMX", document: true, greutateMaximaKg: 300 },
  Q: { nume: "DHL Medical Express — colete", numeDhl: "MEDICAL EXPRESS", continut: "WMX", document: false, greutateMaximaKg: 300 },
  S: { nume: "DHL Same Day", numeDhl: "SAME DAY", continut: "SDX", document: true, greutateMaximaKg: 250 },
  "4": { nume: "DHL SameDay Jetline", numeDhl: "SAMEDAY JETLINE", continut: "NFO", document: false, greutateMaximaKg: 1010 },
  "5": { nume: "DHL SameDay Sprintline", numeDhl: "SAMEDAY SPRINTLINE", continut: "SPL", document: true, greutateMaximaKg: 1000 },
  R: { nume: "DHL GlobalMail", numeDhl: "GLOBALMAIL", continut: "GMB", document: true, greutateMaximaKg: 300 },
  "9": { nume: "DHL Parcel — documente", numeDhl: "Parcel Product", continut: "PPD", document: true, greutateMaximaKg: 2500 },
  V: { nume: "DHL Parcel — colete", numeDhl: "Parcel Product", continut: "PPP", document: false, greutateMaximaKg: 2500 },
  /* Marfa grea si grupaj — n-au ce cauta intr-un checkout de magazin online. */
  F: { nume: "DHL Freight Worldwide — paleti", numeDhl: "FREIGHT WORLDWIDE", continut: "FRT", document: false, greutateMaximaKg: 3030, marfaGrea: true },
  A: { nume: "DHL Economy Breakbulk — paleti", numeDhl: "ECONOMY BREAKBULK", continut: "BBE", document: true, greutateMaximaKg: 3030, marfaGrea: true },
  B: { nume: "DHL Express Breakbulk — paleti", numeDhl: "EXPRESS BREAKBULK", continut: "BBX", document: true, greutateMaximaKg: 1010, marfaGrea: true },
  /* Coduri administrative, nu produse de transport. */
  Z: { nume: "DHL — taxe si impozite", numeDhl: "Duties & Taxes", continut: "DTC", document: false, greutateMaximaKg: 0 },
  "0": { nume: "DHL Logistics Services", numeDhl: "LOGISTICS SERVICES", continut: "LOG", document: false, greutateMaximaKg: 0 },
  "2": { nume: "DHL ACS Xcelerate", numeDhl: "ACS Xcelerate", continut: "ACX", document: false, greutateMaximaKg: 0, marfaGrea: true },
  "6": { nume: "DHL Air Capacity Sales", numeDhl: "Air Capacity Sales", continut: "ACS", document: false, greutateMaximaKg: 0, marfaGrea: true },
  /* ⚠ Asa il numesc EI in nomenclator: „Placeholder". Nu e o greseala de transcriere. */
  J: { nume: "DHL (produs nedenumit)", numeDhl: "Placeholder", continut: "DES", document: true, greutateMaximaKg: 1010 },
};

/**
 * Codul de produs, normalizat.
 *
 * ⚠ NU SE VALIDEAZA PE LUNGIME SI NU SE COMPLETEAZA.
 *
 * Schema lor declara `productCode: minLength: 1, maxLength: 6`, iar blocul de expediere
 * -parinte (breakbulk) declara `maxLength: 1` pentru ACELASI camp, in acelasi fisier.
 * Realitatea nomenclatorului: toate cele 36 de coduri au exact un caracter. Deci se
 * accepta ce vine si se retrimite identic.
 *
 * ⚠ Majusculele conteaza: codurile lor cu litere sunt majuscule peste tot, iar `n`
 * trimis in loc de `N` n-a fost probat de nimeni.
 */
export function codProdus(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 6 ? t : null;
}

/**
 * Codul de produs LOCAL, normalizat.
 *
 * ⚠ ⚠ NU SE COMPUNE NICIODATA. Se copiaza literal din raspunsul cotarii.
 *
 * Schema zice `minLength: 1, maxLength: 3`. Toate exemplele din OpenAPI si din ghidul
 * SOAP il scriu cu UN caracter (`localProductCode: P`). Iar codurile locale publicate
 * de DHL UK au TREI (`WPX`, `DOX`, `ECX`, `DOM`, `ESU`, `ESI`, `TDK`, `TDT`).
 * Nimic din documentatia lor nu impaca cele doua. De aceea functia doar curata, si
 * intoarce `null` peste 3 caractere — un sir mai lung nu poate fi un cod local valid
 * dupa nicio citire a schemei lor.
 */
export function codProdusLocal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 3 ? t : null;
}

/**
 * Numele omenesc al unui produs.
 *
 * ⚠ Pentru un produs necunoscut NU se intoarce codul brut si nici „Produs DHL": primul
 * arata a defect („P" intr-un checkout romanesc), al doilea sterge singura informatie
 * utila. Se ia numele LOR cand il dau, si abia la urma codul.
 */
export function numeProdus(cod: string | null | undefined, numeDeLaEi?: string | null): string {
  const c = codProdus(cod);
  const cunoscut = c ? PRODUSE[c] : undefined;
  if (cunoscut) return cunoscut.nume;

  const alLor = (numeDeLaEi ?? "").trim();
  if (alLor) {
    /* Numele lor sunt cu MAJUSCULE („EXPRESS WORLDWIDE NONDOC"); asa cum vin, tipate
       intr-un checkout romanesc. Se aduc la o forma citibila. */
    const frumos = alLor.length > 3 && alLor === alLor.toUpperCase()
      ? alLor.charAt(0) + alLor.slice(1).toLowerCase()
      : alLor;
    return frumos.toUpperCase().startsWith("DHL") ? frumos : `DHL ${frumos}`;
  }
  return c ? `DHL (produs ${c})` : "DHL";
}

/**
 * E produs de marfa grea (paleti, grupaj), nu de colete?
 *
 * ⚠ Conteaza in checkout: un cumparator cu o cutie de 2 kg n-are ce cauta pe Freight
 * Worldwide, iar tariful de acolo e de alta scara. In practica ele nici nu apar la
 * cotarea unui colet — filtrul ramane fiindca „nu apar" nu e acelasi lucru cu „nu pot
 * aparea".
 */
export function eMarfaGrea(cod: string | null | undefined): boolean {
  const c = codProdus(cod);
  return !!c && PRODUSE[c]?.marfaGrea === true;
}

/** Varianta pentru DOCUMENTE a produsului? Se citeste din raspunsul lor, nu se decide. */
export function eDocument(cod: string | null | undefined): boolean {
  const c = codProdus(cod);
  return !!c && PRODUSE[c]?.document === true;
}

/**
 * Greutatea maxima pe EXPEDIERE, din nomenclatorul lor.
 *
 * ⚠ NU E ACEEASI CU LIMITA COMERCIALA, si diferenta e mare. Nomenclatorul da pentru
 * `P` (Express Worldwide) `shipmentMaximumWeight: 3030.000` si piesa maxima
 * `303 x 303 x 183 cm`; ghidul romanesc de servicii da „Maximum shipment weight
 * 3,000kg" si „Maximum piece dimensions 120 x 80 x 80cm" — de peste doua ori si
 * jumatate mai mic la dimensiuni.
 *
 * Deducerea, si e singura care se poate sustine: cifrele din nomenclator sunt maximele
 * TEHNICE ale retelei globale, cele din ghid sunt limitele COMERCIALE din contractul
 * romanesc. **Validarea din `expediere.ts` foloseste limitele comerciale** — pe cele
 * tehnice treci de validarea API-ului si esuezi la depozit sau iei suprataxa.
 *
 * ⚠ Si nici unitatea nu e declarata de ei: foaia `productCode` n-are coloana de unitate.
 * Ca sunt kilograme se deduce din `X` (Express Envelope) = `0.310`, iar ghidul spune
 * despre acelasi produs „Up to 300g".
 */
export function greutateMaximaProdus(cod: string | null | undefined): number | null {
  const c = codProdus(cod);
  const p = c ? PRODUSE[c] : undefined;
  return p && p.greutateMaximaKg > 0 ? p.greutateMaximaKg : null;
}

/**
 * ⚠⚠ STIM NOI ca produsul asta nu se vinde pe ruta asta? — SI DE CE NU FILTREAZA NIMIC.
 *
 * Functia asta NU e o poarta. E acelasi rationament pentru care la UPS prima varianta a
 * fost gresita si a trebuit intoarsa.
 *
 * `POST /rates` fara `productCode` intoarce, prin propria lor descriere, produsele
 * disponibile pentru contul si ruta date — iar `accountNumber` e `required` la cotare.
 * Deci DHL a filtrat deja, pe contractul real al comerciantului. Daca el intoarce
 * `H ECONOMY SELECT` pentru o comanda catre Ungaria, atunci il vinde — iar noi l-am fi
 * ascuns pe temeiul unui PDF comercial din care am citit sase randuri din doua sute
 * treizeci si patru.
 *
 * Ce ramane adevarat e ca matricea lor de capabilitate chiar arata ca Romania (Zona 0)
 * are bifa doar pe „DHL Express Worldwide" si „Imports", si ca Economy Select lipseste
 * la Ungaria. Informatia aia e reala si e utila — dar ca SFAT in pagina de configurare,
 * nu ca poarta peste raspunsul lor.
 */
export function eVandutInRomania(
  cod: string | null | undefined,
  taraExpeditor: string,
  taraDestinatar: string,
): boolean {
  const c = codProdus(cod);
  if (!c) return false;
  const p = PRODUSE[c];
  /* Necunoscut nu inseamna „nu exista" — vezi antetul fisierului. */
  if (!p) return true;

  const de = (taraExpeditor || "RO").trim().toUpperCase();
  const la = (taraDestinatar || "RO").trim().toUpperCase();
  /* Pentru orice alta tara de plecare n-avem matricea lor. */
  if (de !== "RO") return true;
  if (!p.romania) return false;

  return de === la
    ? p.romania === "intern" || p.romania === "ambele"
    : p.romania === "extern" || p.romania === "ambele";
}

/**
 * Produsele pe care le propunem in configurare, pentru tara de expeditie data.
 *
 * ⚠ Se opreste la RO. Pentru orice alta tara de plecare matricea e alta si noi n-avem
 * de ce s-o ghicim: se intoarce lista goala, ceea ce in interfata inseamna „toate cele
 * pe care le intoarce cotarea", nu „niciunul".
 */
export function produsePropuse(
  taraExpeditor: string,
): { cod: string; nume: string; intern: boolean; extern: boolean; document: boolean }[] {
  const tara = (taraExpeditor || "RO").trim().toUpperCase();
  if (tara !== "RO") return [];
  return Object.entries(PRODUSE)
    .filter(([, p]) => !!p.romania)
    .map(([cod, p]) => ({
      cod,
      nume: p.nume,
      intern: p.romania === "intern" || p.romania === "ambele",
      extern: p.romania === "extern" || p.romania === "ambele",
      document: p.document,
    }));
}

/**
 * ═══ SERVICIILE CU VALOARE ADAUGATA ═══
 *
 * Sursa: aceeasi arhiva, foaia `serviceCode`, 389 de randuri. Coloana lor
 * `chargeCodeTypeCode` e cheia de citire, si ghidul SOAP o explica:
 *   XCH = Extra charge   (se CERE de client)
 *   FEE = Fee            (taxa pe care ei o aplica)
 *   SCH = Surcharge      (suprataxa automata: combustibil, zona indepartata…)
 *   TEC = technical      (marcaj intern al lor)
 *   NRI = Non Revenue Item
 *
 * ⚠ Regula: se cer doar codurile `XCH`. `SCH` si `FEE` apar in devizul cotarii ca sa se
 * vada din ce se compune pretul, dar nu se trimit; `TEC` nu se trimit niciodata.
 */
export const SERVICII: Record<string, { nume: string; tip: string; cereValoare?: boolean }> = {
  /* Singurele doua confirmate ca vandute in Romania de catalogul lor comercial
     („Shipment Insurance … 55.00 LEI or 1% of insured value, if higher" si
     „Extended Liability … 25.00 LEI") SI intoarse de sonda lor pe toate rutele RO. */
  II: { nume: "Asigurarea expedierii", tip: "XCH", cereValoare: true },
  IB: { nume: "Raspundere extinsa", tip: "XCH" },
  /* Restul, confirmate de catalogul romanesc. */
  SF: { nume: "Semnatura directa a destinatarului", tip: "XCH" },
  SD: { nume: "Semnatura unui adult", tip: "XCH" },
  SX: { nume: "Fara semnatura la livrare", tip: "XCH" },
  TK: { nume: "Adresa de domiciliu (notificare catre destinatar)", tip: "XCH" },
  NN: { nume: "Livrare neutra (fara documente de pret)", tip: "XCH" },
  AA: { nume: "Livrare sambata", tip: "XCH" },
  LX: { nume: "Pastrare pentru ridicare", tip: "XCH" },
  JD: { nume: "Instiintare telefonica", tip: "XCH" },
  FT: { nume: "GoGreen Plus — emisii reduse", tip: "XCH" },
  DD: { nume: "Taxele vamale platite de expeditor", tip: "XCH" },
  WY: { nume: "Documente vamale electronice (Paperless Trade)", tip: "XCH" },
  /* Suprataxe care apar in deviz. Nu se cer. */
  FF: { nume: "Suprataxa de combustibil", tip: "SCH" },
  CR: { nume: "Suprataxa de situatie exceptionala", tip: "SCH" },
  NX: { nume: "Suprataxa de cerere", tip: "SCH" },
  YB: { nume: "Colet supradimensionat", tip: "SCH" },
  YY: { nume: "Colet supraponderal", tip: "SCH" },
  YL: { nume: "Colet neconvenabil la sortare", tip: "SCH" },
  OO: { nume: "Livrare in zona indepartata", tip: "SCH" },
  OB: { nume: "Ridicare din zona indepartata", tip: "SCH" },
  MA: { nume: "Corectare de adresa", tip: "SCH" },
  PD: { nume: "Introducere de date", tip: "SCH" },
  /* ⚠ EXISTA GLOBAL, SI NU SE FOLOSESTE. Vezi `RAMBURSUL` mai jos. */
  KB: { nume: "Plata la livrare (ramburs)", tip: "XCH", cereValoare: true },
};

/**
 * ⚠⚠ RAMBURSUL: EXISTA CA ȘI COD, ȘI NU SE VINDE DIN ROMANIA.
 *
 * Asta e cea mai importanta constatare comerciala a integrarii, si e a doua oara cand
 * se intampla (prima a fost FedEx, unde rambursul fusese retras cu totul in 2023).
 *
 * Ce EXISTA: `KB | Cash On Delivery | COD | XCH | K | Invoice Service` in nomenclatorul
 * lor global, cu forma completa descrisa in ghidul SOAP: `ServiceValue` (> 0),
 * `CurrencyCode` si `PaymentMethods/PaymentMethod` din `CSH, CRC, CHQ, DRD, MOB`.
 *
 * Ce NU exista, verificat in patru feluri independente:
 *   1. Catalogul comercial oficial „Optional Services" al DHL Express Romania enumera
 *      24 de servicii, inclusiv pe cele gratuite. „cash" si „ramburs": ZERO aparitii.
 *   2. „Ghidul de Servicii si Tarife 2026: Romania", ambele editii: ZERO aparitii.
 *   3. Sonda lor publica de capabilitate, pe sase rute cu origine RO (RO→RO, DE, GB,
 *      US, MD): `KB` nu apare in niciuna. Rulata pe 33 de rute interne din 33 de tari:
 *      `KB` nu apare niciunde.
 *   4. Paginile nationale „optional-services" ale 40 de tari: „cash on delivery" ZERO.
 *
 * Ce se intampla daca se trimite totusi — codul lor de eroare, verbatim:
 *   7008 „The requested Special Service Code #/valueAddedServices/0/serviceCode 'xx' is
 *   not available between this origin and destination."
 * Deci NU cade la cotare, cade la EMITERE — adica dupa ce cumparatorul a comandat.
 *
 * ⚠ Capcana de citire care poate insela pe oricine cauta „COD" in specificatia lor:
 * `COD` EXISTA acolo, dar ca TIP DE REFERINTA pe factura vamala
 * (`exportDeclaration.invoice.customerReferences[].typeCode`, langa `MRN`, `PON`, `RMA`),
 * cu descrierea „COD, Cash On Delivery". E un numar de referinta tiparit pe o factura,
 * nu un serviciu de incasare.
 *
 * URMAREA PENTRU CHECKOUT, si e mare pentru un magazin romanesc: pe comenzile cu plata
 * la livrare **DHL dispare din checkout**, nu cade pe tarif fix ca ceilalti. O optiune
 * la tarif fix ar fi fost aleasa de cumparator si ar fi blocat comanda — comerciantul
 * ar fi aflat abia la emitere ca AWB-ul nu se poate face cu ramburs DELOC. Exact
 * hotararea luata la FedEx.
 *
 * ⚠ SI TOTUSI SE VERIFICA LA FIECARE CONECTARE. Dovada de mai sus e NEGATIVA, iar o
 * dovada negativa nu se poate inchide definitiv: DHL isi rezerva dreptul la exceptii
 * contractuale („Not all Optional Services are available for every shipment or in every
 * country"). De aceea „Testeaza conexiunea" cere cotarea cu toate serviciile cu valoare
 * adaugata si se uita daca `KB` apare pentru CONTUL acela. Daca apare vreodata, i se
 * spune comerciantului — in loc sa afle nimeni niciodata.
 */
export const COD_RAMBURS = "KB";

/** Numele omenesc al unui serviciu cu valoare adaugata, pentru devizul din panou. */
export function numeServiciu(cod: string | null | undefined, numeDeLaEi?: string | null): string {
  const c = (cod ?? "").trim().toUpperCase();
  const cunoscut = c ? SERVICII[c] : undefined;
  if (cunoscut) return cunoscut.nume;

  const alLor = (numeDeLaEi ?? "").trim();
  if (alLor) {
    return alLor.length > 3 && alLor === alLor.toUpperCase()
      ? alLor.charAt(0) + alLor.slice(1).toLowerCase()
      : alLor;
  }
  return c ? `Serviciu DHL ${c}` : "Serviciu DHL";
}

/** Se poate CERE de client, sau e o taxa pe care ei o aplica? Doar `XCH` se cere. */
export function seCere(cod: string | null | undefined): boolean {
  const c = (cod ?? "").trim().toUpperCase();
  return !!c && SERVICII[c]?.tip === "XCH";
}
