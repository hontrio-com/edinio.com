import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusurile FedEx → statusul comenzii.
 *
 * ═══ ⚠ AICI SETUL E DESCHIS, SI ASTA E DOCUMENTAT DE EI ═══
 *
 * `latestStatusDetail.derivedCode` **NU are `enum` in OpenAPI-ul FedEx** — doar o
 * descriere cu exemple („Example: PU,DE,DP,HL,OC"). Iar `HL` din chiar exemplul lor
 * **nu apare** in tabelul oficial de `eventType`. In colectia lor de teste mai apar
 * `AD`, `AP`, `ED` si `FD`, tot fara sa fie in vreun tabel publicat.
 *
 * Concluzia lor, verbatim din ghidul de bune practici: „avoid hard-coding to
 * specific enumeration values in API responses, as these values may change over
 * time." Deci `fedex_status_code` e `text`, iar orice cod necunoscut se pastreaza
 * BRUT si nu misca nimic.
 *
 * ═══ ⚠ CELE DOUA VOCABULARE, SI DE CE FOLOSIM NUMAI UNUL ═══
 *
 * FedEx are doua niveluri cu vocabulare care NU coincid:
 *   A. `latestStatusDetail` — starea CURENTA a expedierii, un rezumat tinut de ei;
 *   B. `scanEvents[].eventType` — evenimentul de scanare, unul dintre zecile care
 *      se intampla pe drum.
 *
 * Se citeste A. Lectia e de la GLS: ultimul EVENIMENT nu e de ajuns, fiindca intre
 * doua treceri ale cronului pot intra mai multe si ultimul poate fi administrativ.
 * Si FedEx o scrie chiar el: „Customers may sometimes receive the tracking event
 * updates out of order and must look at the scan event time stamp for the correct
 * order."
 *
 * ⚠ `statusByLocale` NU se compara niciodata: e text TRADUS dupa antetul `x-locale`.
 * Se arata omului, atat.
 *
 * ═══ ⚠ CE E FINAL — SI CE AM REFUZAT SA INVENTEZ ═══
 *
 * FedEx **nu publica nicio clasificare „terminal / non-terminal"**. Singurul lucru
 * pe care il spune el insusi e despre livrare: „For batch tracking, remove any
 * packages that have returned a track status of 'delivered' from batch."
 *
 * Restul finalitatilor de mai jos sunt HOTARARI DE-ALE NOASTRE, scrise ca atare:
 *  - `CA` (anulat de expeditor) — nu mai are ce misca;
 *  - `RS` (se intoarce la expeditor) — ⚠ acesta descrie MISCAREA, nu incheierea ei.
 *    Nu e marcat final: coletul e inca pe drum inapoi, si vrem sa stim cand ajunge.
 *
 * „Retur incheiat" nu exista ca eveniment la ei. Inchiderea unui retur se vede ca
 * `DL` **pe AWB-ul de retur**, care e alt numar.
 */

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  denumire: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** Nu mai are rost sa fie intrebat. */
  final?: boolean;
};

/**
 * Codurile pe care le recunoastem.
 *
 * Sursele: tabelul „Tracking Event Codes" din `API_Reference_Guide.json` si tabelul
 * „Event Type / Description" din `aiv-reason-codes.html` (45 de coduri distincte,
 * identice in cele doua). Plus cele patru din colectia lor de teste, marcate.
 */
export const STATUSURI: Record<string, Intrare> = {
  /*
   * ⚠ „Informatia a plecat la FedEx" NU inseamna „expediat": eticheta e facuta,
   * marfa e inca la comerciant. Marcata expediata, comanda ar minti clientul.
   * Aceeasi hotarare ca la „0 emis" al SmartShip, „1 New" al Innoship si
   * `order_placed` al Shipo.
   */
  OC: { denumire: "AWB emis, coletul n-a fost ridicat", clasa: "la_comerciant" },

  PU: { denumire: "Coletul a fost ridicat", clasa: "in_retea" },
  DO: { denumire: "Predat la un punct FedEx", clasa: "in_retea" },
  IP: { denumire: "In posesia FedEx", clasa: "in_retea" },
  DS: { denumire: "Masina a plecat cu coletul", clasa: "in_retea" },

  IT: { denumire: "In tranzit", clasa: "in_retea" },
  AF: { denumire: "La un centru FedEx local", clasa: "in_retea" },
  AR: { denumire: "A ajuns intr-un centru FedEx", clasa: "in_retea" },
  DP: { denumire: "A plecat dintr-un centru FedEx", clasa: "in_retea" },
  TR: { denumire: "In transfer catre livrare", clasa: "in_retea" },
  PM: { denumire: "In lucru", clasa: "in_retea" },
  MD: { denumire: "Date de manifest inregistrate", clasa: "in_retea" },
  CH: { denumire: "Locatie schimbata", clasa: "in_retea" },
  IN: { denumire: "Interventie incheiata", clasa: "in_retea" },

  /* Vama. `CC` si `EA` sunt inaintari; `CD` e intarziere si se semnaleaza. */
  CC: { denumire: "Vamuit", clasa: "in_retea" },
  CP: { denumire: "In vamuire", clasa: "in_retea" },
  EA: { denumire: "Export aprobat", clasa: "in_retea" },

  OD: { denumire: "Iesit la livrare", clasa: "in_retea" },
  DL: { denumire: "Livrat", clasa: "livrat", final: true },

  /*
   * ⚠ „Gata de ridicare" NU e livrare — aceeasi capcana ca `loaded_locker` la Shipo.
   * Coletul e la capatul drumului, dar clientul inca nu l-a atins, si daca nu-l
   * ridica se intoarce. Ramane „Expediata" pana la `DL`.
   *
   * `HP` e din tabelul oficial; `HL` („Item held at delivery office") e din chiar
   * exemplul schemei lor si din schema de webhook, dar NU din tabelul de eventType.
   */
  HP: { denumire: "Gata de ridicare de la un punct FedEx", clasa: "in_retea" },
  HL: { denumire: "Retinut la oficiul de livrare", clasa: "in_retea" },

  /* Actualizari de data estimata: inaintari, nu probleme. */
  US: { denumire: "Data de livrare actualizata", clasa: "in_retea" },
  AE: { denumire: "Ajunge mai devreme", clasa: "in_retea" },
  AO: { denumire: "Ajunge la timp", clasa: "in_retea" },
  DY: { denumire: "Livrare intarziata", clasa: "in_retea" },

  /* Exceptii: comanda NU se misca, dar omul afla. */
  DE: { denumire: "Exceptie la livrare", clasa: "problema", semnaleaza: true },
  DD: { denumire: "Livrare amanata", clasa: "problema", semnaleaza: true },
  SE: { denumire: "Exceptie la expediere", clasa: "problema", semnaleaza: true },
  CD: { denumire: "Intarziere in vama", clasa: "problema", semnaleaza: true },
  PD: { denumire: "Ridicare amanata", clasa: "problema", semnaleaza: true },
  DR: { denumire: "Masina a venit, dar coletul n-a fost predat", clasa: "problema", semnaleaza: true },

  /*
   * ⚠ Returul catre expeditor NU e marcat final: descrie MISCAREA inapoi, nu
   * incheierea ei, si vrem sa aflam cand ajunge. FedEx n-are cod de „retur
   * incheiat" — inchiderea se vede ca `DL` pe AWB-ul de retur, care e alt numar.
   */
  RS: { denumire: "Coletul se intoarce la expeditor", clasa: "problema", semnaleaza: true },

  /*
   * ⚠ Anularea vazuta de CRON inseamna ca s-a facut in ALTA parte decat panoul
   * nostru: anularea noastra scoate numarul de pe comanda, deci coletul iese din
   * interogare. Un AWB anulat pe care comanda il poarta in continuare e exact felul
   * de nepotrivire pe care omul trebuie sa-l afle.
   */
  CA: { denumire: "AWB anulat", clasa: "problema", semnaleaza: true, final: true },

  /* Cereri de schimbare a livrarii, pornite de destinatar. Nu misca nimic. */
  RR: { denumire: "Destinatarul a cerut o optiune de livrare", clasa: "in_retea" },
  RM: { denumire: "Optiunea de livrare a fost schimbata", clasa: "in_retea" },
  HA: { denumire: "Retinerea la un punct FedEx a fost acceptata", clasa: "in_retea" },
  RA: { denumire: "S-a cerut schimbarea adresei", clasa: "in_retea" },
  PR: { denumire: "Adresa a fost schimbata", clasa: "in_retea" },
  AS: { denumire: "Adresa a fost corectata", clasa: "in_retea" },
  RT: { denumire: "S-a cerut returnarea la expeditor", clasa: "problema", semnaleaza: true },

  /*
   * Cele patru care apar DOAR in numele cazurilor de test din colectia Postman a
   * FedEx, nu in vreun tabel publicat. Sunt aici cu clasa lor evidenta si cu
   * mentiunea ca sursa e mai slaba — dar tacerea pe ele ar fi lasat comenzi
   * inghetate pe un cod pe care QA-ul lor il produce.
   */
  AD: { denumire: "La adresa de livrare", clasa: "in_retea" },
  AP: { denumire: "La ridicare", clasa: "in_retea" },
  ED: { denumire: "In drum spre livrare", clasa: "in_retea" },
  FD: { denumire: "La centrul FedEx de destinatie", clasa: "in_retea" },
};

/** Statusurile dupa care marfa se intoarce la comerciant. */
const RETUR = new Set(["RS", "RT"]);

/**
 * Codul, normalizat.
 *
 * ⚠ MAJUSCULE, fiindca ale lor sunt majuscule peste tot. Normalizarea se opreste
 * aici dinadins: nu se scot cratime si nu se ghiceste nimic. Daca ei incep candva
 * sa trimita altceva, vrem `necunoscut` — adica tacere — nu o potrivire ghicita
 * care ar muta comanda pe baza unei presupuneri.
 */
export function codStatus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 16 ? t : null;
}

function intrare(cod: unknown): Intrare | null {
  const t = codStatus(cod);
  return t !== null ? STATUSURI[t] ?? null : null;
}

export function clasificaStatus(cod: unknown): Clasificare {
  return intrare(cod)?.clasa ?? "necunoscut";
}

/** Denumirea pentru om. Necunoscuta, se arata ce a trimis FedEx, apoi codul brut. */
export function descriereStatus(cod: unknown, dinRaspuns?: string | null): string {
  const i = intrare(cod);
  if (i) return i.denumire;
  const dat = (dinRaspuns ?? "").trim();
  if (dat) return dat;
  const t = codStatus(cod);
  return t !== null ? `Status ${t}` : "Status necunoscut";
}

export function trebuieSemnalat(cod: unknown): boolean {
  return intrare(cod)?.semnaleaza === true;
}

export function esteRetur(cod: unknown): boolean {
  const t = codStatus(cod);
  return t !== null && RETUR.has(t);
}

export function eStareFinala(cod: unknown): boolean {
  return intrare(cod)?.final === true;
}

/**
 * Livrarea, citita din DOUA locuri.
 *
 * ⚠ `derivedCode` e set deschis, deci un cod de livrare nou (sau o varianta pe care
 * n-o cunoastem) ar lasa comanda „Expediata" pentru totdeauna. `dateAndTimes[]` are
 * insa un enum INCHIS, iar `ACTUAL_DELIVERY` e cel mai curat semnal „livrat + cand".
 * Oricare dintre ele ajunge.
 */
export function eLivrat(cod: unknown, livratLa: string | null | undefined): boolean {
  return clasificaStatus(cod) === "livrat" || !!(livratLa ?? "").trim();
}

export function statusComandaDinCod(cod: unknown, livratLa?: string | null): OrderStatus | null {
  if (eLivrat(cod, livratLa)) return "delivered";
  switch (clasificaStatus(cod)) {
    case "in_retea": return "shipped";
    case "la_comerciant": return "processing";
    /* Sfarsiturile proaste au inteles, dar anularea si rambursarea sunt decizii ale
       comerciantului, nu ale curierului. */
    case "problema": return null;
    default: return null;
  }
}

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Ce status primeste comanda — sau `null` daca nu se schimba nimic.
 *
 * Nu se coboara niciodata (evenimentele pot sosi in alta ordine — FedEx o spune el
 * insusi), si o comanda anulata sau rambursata nu se misca de la un transportator.
 */
export function statusUrmator(statusCurent: string, cod: unknown, livratLa?: string | null): OrderStatus | null {
  const tinta = statusComandaDinCod(cod, livratLa);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
