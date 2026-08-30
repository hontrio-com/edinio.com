/**
 * Statusurile de urmarire DHL Express: cele 65 de coduri de eveniment, si ce fac ele
 * cu o comanda din Edinio.
 *
 * ═══ O SINGURA COLOANA, SI E O VESTE BUNA ═══
 *
 * La UPS a fost nevoie de DOUA coloane (`type` si `code`), fiindca tipul avea enumerare
 * publicata si codul nu, iar tabelul de 687 de coduri de pe site-ul lor era, se
 * dovedise, cu totul alt vocabular decat cel al API-ului.
 *
 * La DHL vocabularul e UNUL SINGUR si e publicat ca DATE:
 *
 *   https://developer.dhl.com/sites/default/files/2026-06/ExpressReferenceData_3.3.1.zip
 *   → ExpressReferenceData_2026-06-28.xlsx, foaia `trackingEventCode`, 65 de randuri
 *   Coloane: `eventTypeCode | eventTypeDescription | visibleToCustomer | eventWithServiceAreaDetail`
 *
 * Se poate cere si la rulare: `GET /reference-data?datasetName=trackingEventCode`.
 * Tabelul de mai jos e transcrierea lui integrala — toate cele 65, inclusiv cele pe
 * care ei le marcheaza `visibleToCustomer = No`, fiindca „nu se arata clientului final"
 * nu inseamna „nu soseste pe API".
 *
 * ═══ ⚠ INCHISA CA DATE, DESCHISA CA SI CONTRACT ═══
 *
 * In OpenAPI campul e `typeCode: {type: string, example: PU}` — FARA `enum`. Iar DHL a
 * adaugat coduri fara preaviz: `PY` si `SM` pe 4 iunie 2024, apoi `SD`, `EM`, `MF`.
 * Deci un cod necunoscut NU e o eroare si NU misca starea comenzii: se pastreaza brut,
 * iar cronul il scrie in jurnal ca sa creasca tabelul din trafic real.
 *
 * ═══ ⚠⚠ CARE COD INSEAMNA „LIVRAT" — SI DE CE E O INTREBARE PERICULOASA ═══
 *
 * La UPS, `type: "D"` parea sa insemne „Delivered" si insemna de fapt „incarcat in
 * masina, iesit la livrare, SAU livrat". Citit gresit, comanda trecea pe „Livrata" si
 * se emitea factura in timp ce coletul era inca in masina.
 *
 * La DHL cele doua sunt separate, si asta e cel mai important lucru din fisier:
 *   `WC` = „With delivering courier"  → IESIT LA LIVRARE. Nu e livrare.
 *   `OK` = „Delivery"                 → dispozitia finala.
 *
 * ⚠ Descrierea lui `OK` e „Delivery", substantiv, NU „Delivered". Ce inchide intrebarea
 * e ghidul lor SOAP, la campul `Signatory`, verbatim:
 *   „The signee for the shipment, only occurs for **final disposition events (such as
 *   OK event)**."
 * Deci DHL insusi il numeste eveniment de dispozitie finala. Plus exemplul din propria
 * lor specificatie REST: `typeCode: OK` cu `description: 'Delivered : ALBY H'`.
 *
 * ⚠ Si totusi `OK` singur NU e de ajuns pentru a trece comanda pe „Livrata" cand exista
 * o dovada mai tare (data de livrare, semnatar). Vezi `eLivrat`.
 *
 * ═══ ⚠ TREI CODURI CARE PAR LIVRARE SI CER OM, NU AUTOMATIZARE ═══
 *
 *   `PD` „Partial delivery"   — o PARTE din colete a ajuns. Trecuta pe „Livrata",
 *                                comanda se inchide cu marfa nelivrata si se
 *                                factureaza integral.
 *   `DD` „Delivered damaged"  — a ajuns, dar AVARIAT. Declanseaza retur sau
 *                                despagubire, nu finalizare.
 *   `AD` „Agreed delivery"    — livrare CONVENITA (programata), nu efectuata.
 *
 * ═══ ⚠ DOUA CODURI CARE SUNA GRAV SI NU SUNT ═══
 *
 *   `MC` „Miscode" si `MS` „Mis-sort" sunt greseli interne de sortare pe care DHL le
 *   corecteaza singur. Coletul e in drum. Nu se alerteaza comerciantul.
 */

import type { OrderStatus } from "@/lib/orders/status";

/** Cum se citeste un status, pentru om si pentru decizii. */
export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  /** Textul aratat comerciantului. */
  denumire: string;
  clasa: Clasificare;
  /** Merita o notificare in clopotel? */
  semnaleaza?: boolean;
  /** Dupa el nu mai are rost sa intrebam. */
  final?: boolean;
  /** Coletul se intoarce la expeditor. */
  retur?: boolean;
  /**
   * `visibleToCustomer` din nomenclatorul lor. Nu decide nimic la noi — e pastrat
   * fiindca explica de ce unele coduri nu se vad niciodata in traficul real.
   */
  ascunsLaEi?: boolean;
};

/**
 * ⚠ TOATE cele 65 de coduri, in ordinea din foaia lor, transcrise integral.
 *
 * Coloana `visibleToCustomer` are in datele lor o greseala de tastare pe care merita s-o
 * stii daca vreodata reciteste cineva fisierul: `DG` are valoarea **`nO`**, nu `No`.
 * O potrivire `=== "No"` l-ar clasifica gresit ca vizibil.
 */
export const CODURI: Record<string, Intrare> = {
  /* ─── Ridicare si drum ─────────────────────────────────────────────────────── */
  SD: { denumire: "Informatiile expedierii au ajuns la DHL", clasa: "la_comerciant" },
  MF: { denumire: "Expediere manifestata", clasa: "la_comerciant", ascunsLaEi: true },
  PU: { denumire: "Colet ridicat de curier", clasa: "in_retea" },
  SA: { denumire: "Expediere acceptata de DHL", clasa: "in_retea" },
  PL: { denumire: "Prelucrat in centrul DHL", clasa: "in_retea" },
  DF: { denumire: "A plecat din centrul DHL", clasa: "in_retea" },
  AF: { denumire: "A ajuns in centrul DHL", clasa: "in_retea" },
  AR: { denumire: "A ajuns in centrul de livrare", clasa: "in_retea" },
  WC: { denumire: "La curierul de livrare", clasa: "in_retea" },
  SM: { denumire: "Programat pentru transport", clasa: "in_retea" },
  TR: { denumire: "Predat catre alt centru", clasa: "in_retea" },
  EM: { denumire: "Date electronice imbinate", clasa: "in_retea" },
  AD: { denumire: "Livrare convenita cu destinatarul", clasa: "in_retea" },
  FD: { denumire: "Redirectionat catre alta destinatie", clasa: "in_retea", semnaleaza: true },
  RR: { denumire: "Raspuns primit de la destinatar", clasa: "in_retea" },

  /* ─── Livrare ──────────────────────────────────────────────────────────────── */
  /* ⚠ SINGURUL cod de livrare. Vezi antetul: DHL il numeste „final disposition event". */
  OK: { denumire: "Livrat", clasa: "livrat", final: true },
  /* ⚠ Livrari care NU sunt finalizari. */
  PD: { denumire: "Livrare PARTIALA — o parte din colete lipseste", clasa: "problema", semnaleaza: true },
  DD: { denumire: "Livrat AVARIAT", clasa: "problema", semnaleaza: true },

  /* ─── Esec de livrare, recuperabil: DHL reincearca ─────────────────────────── */
  ND: { denumire: "Nelivrat", clasa: "problema", semnaleaza: true },
  NH: { denumire: "Destinatarul nu era acasa", clasa: "problema", semnaleaza: true },
  RD: { denumire: "Destinatarul a refuzat coletul", clasa: "problema", semnaleaza: true },
  MD: { denumire: "S-a ratat ciclul de livrare", clasa: "problema", semnaleaza: true },
  BA: { denumire: "Adresa gresita", clasa: "problema", semnaleaza: true },
  CM: { denumire: "Destinatarul s-a mutat", clasa: "problema", semnaleaza: true },
  CC: { denumire: "Asteapta ridicarea de catre destinatar", clasa: "problema", semnaleaza: true },

  /* ─── Blocaje care cer o actiune, nu esecuri ───────────────────────────────── */
  OH: { denumire: "Expediere retinuta", clasa: "problema", semnaleaza: true },
  HP: { denumire: "Retinuta pana la plata taxelor", clasa: "problema", semnaleaza: true },
  PY: { denumire: "Plata taxelor", clasa: "problema", semnaleaza: true },
  CD: { denumire: "Intarziere de vamuire (controlabila)", clasa: "problema", semnaleaza: true },
  UD: { denumire: "Intarziere de vamuire (necontrolabila)", clasa: "problema", semnaleaza: true },
  IC: { denumire: "In curs de vamuire", clasa: "in_retea" },
  CR: { denumire: "Eliberat din vama", clasa: "in_retea" },
  BN: { denumire: "Comisionarul vamal a fost instiintat", clasa: "in_retea" },
  BR: { denumire: "Eliberat de comisionarul vamal", clasa: "in_retea" },

  /* ─── Terminale fara livrare ───────────────────────────────────────────────── */
  RT: { denumire: "Returnat expeditorului", clasa: "problema", semnaleaza: true, final: true, retur: true },
  DS: { denumire: "Distrus sau casat", clasa: "problema", semnaleaza: true, final: true },
  SS: { denumire: "Expediere oprita", clasa: "problema", semnaleaza: true, final: true },
  CS: { denumire: "Expediere inchisa", clasa: "problema", semnaleaza: true, final: true },
  CA: { denumire: "Inchisa la sosire", clasa: "problema", semnaleaza: true, final: true },
  /* ⚠ Predat unui tert: DHL nu mai raporteaza NIMIC dupa. E terminal din punctul de
     vedere al vizibilitatii, fara livrare confirmata — deci se cere om, nu se inchide. */
  TP: { denumire: "Predat unui alt transportator — DHL nu mai raporteaza", clasa: "problema", semnaleaza: true, final: true },

  /* ─── Erori interne de rutare: tranzitorii, NU se alerteaza ────────────────── */
  /* ⚠ Suna grav si nu sunt. Coletul e in drum; DHL le corecteaza singur. */
  MC: { denumire: "Cod gresit la sortare (se corecteaza)", clasa: "in_retea" },
  MS: { denumire: "Sortat gresit (se corecteaza)", clasa: "in_retea" },
  SC: { denumire: "Serviciu schimbat", clasa: "in_retea" },

  /* ─── Coduri pe care ei le marcheaza ascunse de clientul final ─────────────── */
  BL: { denumire: "In antrepozit vamal", clasa: "in_retea", ascunsLaEi: true },
  CI: { denumire: "Inregistrat la intrarea in centru", clasa: "in_retea", ascunsLaEi: true },
  CU: { denumire: "Preluare confirmata", clasa: "in_retea", ascunsLaEi: true },
  DG: { denumire: "Marfa periculoasa acceptata", clasa: "in_retea", ascunsLaEi: true },
  DI: { denumire: "Factura de taxe vamale", clasa: "in_retea", ascunsLaEi: true },
  DM: { denumire: "Avariat", clasa: "problema", semnaleaza: true, ascunsLaEi: true },
  DP: { denumire: "Parte aflata pe lista de sanctiuni", clasa: "problema", semnaleaza: true, ascunsLaEi: true },
  ES: { denumire: "Declaratie vamala depusa", clasa: "in_retea", ascunsLaEi: true },
  HI: { denumire: "Intrat in control de inventar", clasa: "in_retea", ascunsLaEi: true },
  HN: { denumire: "Predare", clasa: "in_retea", ascunsLaEi: true },
  HO: { denumire: "Iesit din control de inventar", clasa: "in_retea", ascunsLaEi: true },
  IA: { denumire: "Imagine disponibila", clasa: "in_retea", ascunsLaEi: true },
  LV: { denumire: "Incarcat in vehicul", clasa: "in_retea", ascunsLaEi: true },
  NA: { denumire: "Nu a ajuns", clasa: "problema", semnaleaza: true, ascunsLaEi: true },
  PW: { denumire: "Documente", clasa: "in_retea", ascunsLaEi: true },
  /* ⚠ RECANTARIREA. E evenimentul care explica diferentele de tarif de pe factura —
     dar ei il marcheaza ascuns si lipseste cu totul din lista publicata pentru API-ul
     unificat. Nu se construieste nicio logica pe el. */
  RW: { denumire: "Recantarit si remasurat de DHL", clasa: "in_retea", ascunsLaEi: true },
  SI: { denumire: "Expediere inspectata", clasa: "in_retea", ascunsLaEi: true },
  ST: { denumire: "Expediere interceptata", clasa: "problema", semnaleaza: true, ascunsLaEi: true },
  TD: { denumire: "Intarziere de transport", clasa: "in_retea", ascunsLaEi: true },
  TI: { denumire: "Cautare initiata", clasa: "in_retea", ascunsLaEi: true },
  TT: { denumire: "Cautare incheiata", clasa: "in_retea", ascunsLaEi: true },
  UV: { denumire: "Descarcat din vehicul", clasa: "in_retea", ascunsLaEi: true },
};

export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Coletul a ajuns la destinatar.",
  in_retea: "Coletul e la DHL si merge catre destinatar.",
  la_comerciant: "DHL are datele expedierii, dar coletul n-a fost inca preluat.",
  problema: "Ceva s-a oprit pe traseu si cere o hotarare.",
  necunoscut: "DHL a raspuns cu un cod pe care nu-l cunoastem inca.",
};

/**
 * Codul, normalizat.
 *
 * Toate cele 65 au exact doua litere majuscule, dar nu se valideaza pe lungime: DHL a
 * mai adaugat coduri fara preaviz si un cod de trei litere ar fi pastrat brut, nu
 * aruncat. Plafonul de 16 caractere e doar impotriva unui camp murdar.
 */
export function codStatus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 16 ? t : null;
}

function intrare(cod: unknown): Intrare | undefined {
  const c = codStatus(cod);
  return c ? CODURI[c] : undefined;
}

export function clasificaStatus(cod: unknown): Clasificare {
  return intrare(cod)?.clasa ?? "necunoscut";
}

/**
 * ⚠ A LIVRAT DHL COLETUL? — si de ce nu e o simpla potrivire de cod.
 *
 * `OK` e dispozitia finala, si e singurul cod de livrare. Dar raspunsul de urmarire mai
 * poarta doua semnale, si amandoua sunt mai tari decat un cod:
 *
 *   `livratLa`   — data si ora evenimentului `OK`, luate din `events[]`.
 *   `areDovada`  — a semnat cineva? Vine din `events[].signedBy`.
 *
 * ⚠⚠ SI AICI E CEA MAI SCUMPA CAPCANA A URMARIRII DHL: `signedBy` E GOL DIN OFICIU,
 * DIN GDPR, NU FIINDCA N-A SEMNAT NIMENI. Verbatim din specificatia lor:
 *   „Note: This field may be intentionally left empty in accordance with the General
 *   Data Protection Regulation (GDPR) requirements."
 * Ghidul SOAP spune ca se descuie cu `<RequestControlledAccessData>` — parametru care
 * **nu exista in REST**. Ce exista in REST e `requestControlledAccessDataCodes`, care
 * intoarce LISTA campurilor mascate (`SIGN_NM` pentru numele semnatarului), nu valorile.
 *
 * Deci `areDovada` nu poate fi niciodata o CONDITIE a livrarii — ar insemna ca nicio
 * comanda DHL nu trece vreodata pe „Livrata". El doar INTARESTE `OK`. Clientul il
 * trimite mereu ca sa poata deosebi „gol fiindca e mascat" de „gol fiindca nu s-a
 * semnat", si ca sa nu raporteze livrari nesemnate care de fapt sunt semnate.
 *
 * ⚠ `PD` (partial) si `DD` (avariat) NU sunt livrari, oricat de tare ar fi dovada.
 */
export function eLivrat(
  cod: unknown,
  livratLa: string | null | undefined,
  areDovadaLivrarii?: boolean,
): boolean {
  const c = codStatus(cod);
  if (c === "OK") return true;

  /*
   * ⚠⚠ DOVADA NU RASTOARNA UN COD PE CARE IL CUNOASTEM. Aici a fost, in prima varianta a
   * fisierului, exact capcana pe care antetul o descrie despre UPS — si scrisa de mana mea.
   *
   * Prima forma sarea peste `PD` si `DD` si apoi accepta orice cod daca exista o semnatura:
   *     if (c === "PD" || c === "DD") return false;
   *     if (c === "OK") return true;
   *     return !!livratLa || areDovadaLivrarii === true;
   *
   * `areDovadaLivrarii` se ridica insa la o semnatura de pe ORICE eveniment, iar semnatura
   * apare — prin chiar documentatia lor — la fiecare „final disposition event". Predarea
   * coletului INAPOI la expeditor e si ea o dispozitie finala si e si ea semnata. Deci un
   * colet returnat (`RT`) iesea „livrat": comanda trecea pe „Livrata", `maybeAutoInvoice`
   * emitea factura la ANAF pentru marfa intoarsa in depozit, iar cronul o scotea definitiv
   * din urmarire fiindca scrisese o stare finala. In ACEEASI trecere, `esteRetur("RT")`
   * trimitea comerciantului notificarea „coletul se intoarce la tine" — codul se contrazicea
   * pe el insusi, pe acelasi eveniment. Acelasi drum era deschis pentru `DS` (distrus),
   * `SS`, `CS`, `CA` si `TP`.
   *
   * Si probele APARAU asezarea gresita: proba care trece tot tabelul de 65 de coduri il
   * trecea numai cu `areDovada = false`, deci nu putea sa cada.
   *
   * Regula corecta: rezerva pe dovada exista pentru un cod NECUNOSCUT — un eveniment de
   * dispozitie finala pe care DHL l-a adaugat fara preaviz, cum a facut cu `PY` si `SM`.
   * Un cod pe care tabelul il clasifica deja raspunde din tabel, oricat de tare ar fi dovada.
   */
  if (c !== null && CODURI[c] !== undefined) return CODURI[c].clasa === "livrat";

  return !!(livratLa && livratLa.trim()) || areDovadaLivrarii === true;
}

/** Textul pentru panou si pentru clopotel. Descrierea LOR are intaietate cand exista. */
export function descriereStatus(cod: unknown, dinRaspuns?: string | null): string {
  const cunoscut = intrare(cod);
  if (cunoscut) return cunoscut.denumire;
  const alLor = (dinRaspuns ?? "").trim();
  if (alLor) return alLor;
  const c = codStatus(cod);
  return c ? `Status DHL ${c}` : "Status DHL necunoscut";
}

/**
 * Merita o notificare?
 *
 * ⚠ Numai starile care cer o hotarare a comerciantului. `MC`/`MS` nu sunt aici dinadins
 * (vezi antetul), iar un cod necunoscut NU alerteaza: n-am sti ce sa-i spunem omului,
 * si o alarma fara continut se invata sa fie ignorata — inclusiv atunci cand are dreptate.
 */
export function trebuieSemnalat(cod: unknown): boolean {
  return intrare(cod)?.semnaleaza === true;
}

/**
 * Coletul se intoarce la expeditor?
 *
 * ⚠ Spre deosebire de UPS — unde functia asta intoarce `false` MEREU, fiindca API-ul lor
 * n-are niciun tip de retur — aici raspunsul e real: `RT` e „Returned to consignor" in
 * chiar nomenclatorul lor.
 *
 * ⚠ `returnFlag` din API-ul unificat NU se foloseste: el nu exista in MyDHL API, iar
 * `default: false` din schema lui inseamna ca un camp absent ar fi citit ca „confirmat
 * ca nu e retur". Aceeasi clasa cu `Number(null)` care iese ZERO.
 */
export function esteRetur(cod: unknown): boolean {
  return intrare(cod)?.retur === true;
}

/**
 * Mai are rost sa intrebam?
 *
 * ⚠ Livrarea se socoteste dupa `eLivrat`, nu dupa steagul `final` — o comanda cu dovada
 * de livrare pe un cod necunoscut e tot incheiata.
 */
export function eStareFinala(
  cod: unknown,
  livratLa?: string | null,
  areDovada?: boolean,
): boolean {
  if (eLivrat(cod, livratLa, areDovada)) return true;
  return intrare(cod)?.final === true;
}

/** Ce status de comanda ar trebui sa aiba comanda, dupa statusul asta de la DHL. */
export function statusComandaDinCod(
  cod: unknown,
  livratLa?: string | null,
  areDovada?: boolean,
): OrderStatus | null {
  if (eLivrat(cod, livratLa, areDovada)) return "delivered";
  const clasa = clasificaStatus(cod);
  if (clasa === "in_retea") return "shipped";
  /* `problema`, `la_comerciant` si `necunoscut` NU misca statusul. Un colet oprit in
     vama e tot expediat; a-l da inapoi pe „In procesare" ar sterge informatie. */
  return null;
}

/** Scara de statusuri: cronul are voie sa urce, niciodata sa coboare. */
const TREAPTA: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

/**
 * Statusul urmator, sau `null` daca nu se schimba nimic.
 *
 * ⚠ NU COBOARA NICIODATA. Un eveniment intarziat („a plecat din centru") sosit dupa
 * livrare ar da comanda inapoi pe „Expediat", ar retrimite emailuri si ar putea
 * declansa a doua oara facturarea automata.
 *
 * ⚠ `cancelled` si `refunded` nu se misca deloc: sunt hotarari ale omului, nu stari de
 * transport, si nu sunt in scara.
 */
export function statusUrmator(
  statusCurent: string,
  cod: unknown,
  livratLa?: string | null,
  areDovada?: boolean,
): OrderStatus | null {
  const tinta = statusComandaDinCod(cod, livratLa, areDovada);
  if (!tinta) return null;
  const acum = TREAPTA[statusCurent];
  if (acum === undefined) return null;
  return TREAPTA[tinta] > acum ? tinta : null;
}

/**
 * Un cod pe care nu-l cunoastem?
 *
 * Cronul le aduna si le scrie in jurnal cu `severity: "info"`. Asa tabelul de mai sus
 * creste din trafic real, nu dintr-o presupunere — si asa aflam cand DHL mai adauga
 * unul, cum a facut cu `PY` si `SM` in iunie 2024.
 */
export function eCombinatieNecunoscuta(cod: unknown): boolean {
  const c = codStatus(cod);
  return c !== null && CODURI[c] === undefined;
}
