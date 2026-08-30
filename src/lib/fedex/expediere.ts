import { normalizePhone } from "@/lib/utils/phone";
import { normalizeLocalityName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";
import { RAMBURS_INDISPONIBIL, specificatieEticheta, ziuaAzi, type FedexConfig } from "./client";
import { eMarfaGrea } from "./servicii";

/**
 * Construirea cererilor FedEx dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. FedEx ARE `POST /ship/v1/shipments/packages/validate`
 * — valideaza intreaga cerere fara sa emita eticheta si fara sa consume AWB — dar
 * validarea aia costa un dus-intors si nu spune nimic despre ce am uitat sa punem
 * in corp. Probele de langa fisierul asta raman singura verificare care se poate
 * face inainte de prima cheie de cont.
 *
 * ═══ ⚠ TREI LUCRURI PE CARE FEDEX LE PEDEPSESTE TACUT ═══
 *
 * **1. `dimensions.units` lipsa = INCH.** Verbatim: „Any value other than CM
 * including blank/null will default to IN." Un colet de 30x20x10 devine 76x51x25 cm
 * la ei. Unitatea pleaca INTOTDEAUNA, si cotele sunt intregi rotunjite IN SUS —
 * `integer`, „No implied decimal places", si o rotunjire in jos subdeclara.
 *
 * **2. `streetLines` se TAIE la 35 de caractere pe linie, si peste 3 linii se
 * IGNORA.** O adresa romaneasca intreaga („Str. ... nr. ..., bl. ..., sc. ..., et.
 * ..., ap. ...") depaseste usor 35. Taiata, coletul pleaca fara numarul
 * apartamentului. De aia se IMPARTE pe linii, nu se trunchiaza — vezi `liniiAdresa`.
 *
 * **3. Ori `personName`, ori `companyName` — dar unul TREBUIE sa existe.** Verbatim
 * din schema (cu greseala lor de tipar): „Either the companyName or personName is
 * manadatory".
 *
 * ═══ ⚠ SI UNUL PE CARE NU-L PEDEPSESTE DELOC, FIINDCA NU EXISTA ═══
 *
 * **RAMBURSUL.** Nu exista niciun camp de ramburs in fisierul asta, si nu trebuie
 * adaugat: FedEx a retras C.O.D. pe 31.07.2023 peste tot in afara de FedEx Ground
 * in/spre Canada. Comenzile cu ramburs se opresc INAINTE de a ajunge aici, in
 * `lipsuriExpediere`.
 */

export type AdresaComanda = {
  nume: string;
  companie?: string | null;
  strada: string;
  numar?: string | null;
  bloc?: string | null;
  scara?: string | null;
  etaj?: string | null;
  apartament?: string | null;
  oras: string;
  judet?: string | null;
  codPostal?: string | null;
  telefon?: string | null;
  email?: string | null;
  /** Cod ISO de doua litere. Implicit `RO`. */
  tara?: string | null;
};

export type DateExpediere = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  /** ⚠ Prezent si nenul, OPRESTE emiterea. FedEx nu are ramburs. */
  ramburs?: number;
  valoareComanda?: number;
  /** Serviciul ales de cumparator la checkout. Fara el, emiterea nu stie ce sa ceara. */
  serviceType?: string | null;
  /** Referinta noastra, `EDN-xxxx-000123`. Vezi `referintaComenzii`. */
  referinta?: string | null;
  /** Data expedierii, `YYYY-MM-DD`. Implicit azi. */
  dataExpedierii?: string | null;
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Plafoanele, TOATE transcrise din descrierile campurilor lor.
 *
 * Nu sunt inventate: `city` are `maxLength: 35` in schema, `streetLines` „Max Length
 * is 35" pe linie, `personName` „First 35 chars will be printed on the label",
 * `emailAddress` „Maximum length is 80", `phoneNumber` „supports maximum of 15",
 * `postalCode` „Maximum length is 10", `accountNumber.value` „Max Length is 9".
 */
export const LUNGIMI = {
  nume: 35,
  companie: 35,
  telefon: 15,
  email: 80,
  oras: 35,
  codPostal: 10,
  liniiAdresa: 3,
  liniiAdresaLungime: 35,
  contNumar: 9,
  /* `customerReferences[].value` — schema nu declara lungime; 40 e plafonul nostru,
     si e scris ca al nostru. Referinta noastra face oricum sub 25 de caractere. */
  referinta: 40,
  descriereMarfa: 450,
} as const;

/** Greutatea minima trimisa. Aceeasi cu cea din `lib/shipping/awb-weight.ts`. */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * Limita de greutate a serviciilor FedEx Express, in kilograme.
 *
 * ⚠ E a LOR, si apare de doua ori cu doua valori: `MAXIMUMWEIGHT.TYPE.ERROR` spune
 * „68kg/150lbs" (limita pe colet la Express), iar `MAXIMUM.WEIGHT.EXCEEDED` spune
 * „2200 lbs or 998 kgs" (limita absoluta, cu freight). Se foloseste cea mica, cu un
 * mesaj care spune ce se poate face — peste ea sunt serviciile Freight.
 */
export const GREUTATE_MAXIMA_EXPRESS_KG = 68;

/**
 * Dimensiunile implicite, in CENTIMETRI.
 *
 * ⚠ Nu sunt decor: FedEx factureaza pe maximul dintre greutatea fizica si cea
 * volumetrica (`dimDivisor` din raspuns), deci dimensiuni prea mari scumpesc fiecare
 * colet. Aceleasi valori ca la Shipo, ca sa nu apara doua implicite in platforma.
 */
export const DIMENSIUNI_IMPLICITE = { lungime: 30, latime: 20, inaltime: 10 } as const;

/** ⚠ „Maximum value: 999" pe fiecare latura, si fara zecimale. */
const DIMENSIUNE_MAXIMA = 999;

function taie(text: string | null | undefined, max: number): string {
  return curata(text).slice(0, max).trim();
}

/**
 * Adresa, impartita in cel mult 3 linii de cel mult 35 de caractere.
 *
 * ⚠ SE IMPARTE, NU SE TRUNCHIAZA. FedEx ignora liniile de peste a treia si taie
 * fiecare linie la 35 — deci o adresa romaneasca intreaga pusa pe un singur rand
 * ajunge la curier fara bloc, scara si apartament, iar coletul se intoarce.
 *
 * ⚠ SI FARA DIACRITICE. FedEx nu documenteaza nicio restrictie de caractere, dar
 * eticheta e imprimata pe hartie termica in reteaua lor globala, iar la Woot un
 * singur caracter cu diacritice in adresa a dus la un 400. Aceeasi masura ca la
 * ceilalti curieri: se scot, o data, aici.
 *
 * Impartirea e pe cuvinte. Un singur cuvant mai lung de 35 de caractere (nu exista
 * in adrese reale, dar exista in date murdare) se taie, ca sa nu blocheze restul.
 */
export function liniiAdresa(a: Pick<AdresaComanda, "strada" | "numar" | "bloc" | "scara" | "etaj" | "apartament">): string[] {
  const bucati = [
    curata(a.strada),
    curata(a.numar) ? `nr. ${curata(a.numar)}` : "",
    curata(a.bloc) ? `bl. ${curata(a.bloc)}` : "",
    curata(a.scara) ? `sc. ${curata(a.scara)}` : "",
    curata(a.etaj) ? `et. ${curata(a.etaj)}` : "",
    curata(a.apartament) ? `ap. ${curata(a.apartament)}` : "",
  ].filter(Boolean);

  const intreg = stripDiacritics(bucati.join(", "));
  const max = LUNGIMI.liniiAdresaLungime;

  const linii: string[] = [];
  let curenta = "";
  for (const cuvant of intreg.split(" ").filter(Boolean)) {
    const bucata = cuvant.length > max ? cuvant.slice(0, max) : cuvant;
    const incercare = curenta ? `${curenta} ${bucata}` : bucata;
    if (incercare.length <= max) {
      curenta = incercare;
      continue;
    }
    if (curenta) linii.push(curenta);
    curenta = bucata;
    if (linii.length === LUNGIMI.liniiAdresa) break;
  }
  if (curenta && linii.length < LUNGIMI.liniiAdresa) linii.push(curenta);

  return linii.slice(0, LUNGIMI.liniiAdresa);
}

/**
 * ⚠ BUCURESTI: FedEx intra in TABARA CEA MARE.
 *
 * Regula proiectului (vezi `bucuresti-pe-curieri.test.ts` si memoria
 * `sameday-audit-2026-07`): Sameday si eColet vor `Sector 3` in campul de
 * localitate, ceilalti vor `Bucuresti`. Cine le uniformizeaza rupe noua curieri
 * tacut.
 *
 * FedEx **nu documenteaza NICIO regula pentru sectoare** — cautat `sector` in toate
 * paginile de docs, in toate JSON-urile OpenAPI si in `API_Reference_Guide.json`:
 * singurele aparitii sunt adresa sediului lor din Bucuresti. Deci nu se inventeaza
 * una: orasul se plieaza in „Bucuresti", iar sectorul, care ramane o informatie
 * reala de livrare, pleaca pe prima linie de adresa. Codul postal de 6 cifre — pe
 * care FedEx il cere, fiindca Romania e „postal-aware" la ei — identifica oricum
 * sectorul.
 *
 * ⚠ `stateOrProvinceCode` NU se trimite pentru Romania: descrierea lor spune „State
 * code is required for US, CA, PR and **not required for other countries**", campul
 * are maximum 2 caractere, si FedEx nu publica niciun nomenclator de judete
 * romanesti. Un „CJ" inventat ar putea cadea la validare pentru fiecare comanda.
 */
export function orasFedex(oras: string, judet?: string | null): string {
  return taie(normalizeLocalityName(oras, judet ?? undefined), LUNGIMI.oras);
}

/** Sectorul, ca text de pus pe adresa. `null` cand adresa nu e din Bucuresti. */
export function sectorPentruAdresa(a: Pick<AdresaComanda, "oras" | "judet">): string | null {
  const dinOras = sectorBucuresti(a.oras);
  const dinJudet = sectorBucuresti(a.judet);
  const n = dinOras ?? dinJudet;
  return n ? `Sector ${n}` : null;
}

/**
 * Telefonul, in forma pe care o accepta FedEx.
 *
 * ⚠ Maximum 15 caractere, si regula lor de „exact 10 cifre" e explicit NUMAI pentru
 * US si CA. Pentru Romania documentatia tace, iar toate exemplele lor sunt doar
 * cifre — deci se trimit cifrele, fara spatii, paranteze sau cratime.
 *
 * `normalizePhone` aduce numerele romanesti la forma locala `07…` si le pastreaza pe
 * cele straine ca `+49…`. Pentru FedEx se scot si `+`-urile: `+40712345678` are 12
 * caractere si ar incapea, dar exemplul lor (`918xxxxx890`) e fara semn, si nimic
 * din documentatie nu cere plusul.
 */
export function telefonFedex(brut: string | null | undefined): string {
  const normalizat = normalizePhone(brut ?? "");
  const cifre = normalizat.replace(/\D/g, "");
  return cifre.slice(0, LUNGIMI.telefon);
}

/**
 * Referinta noastra pe expedierea FedEx.
 *
 * ⚠ CELE PATRU CARACTERE DIN `businessId` NU SUNT ORNAMENT.
 *
 * `order_number` are `UNIQUE (business_id, order_number)` si contorul reporneste la
 * #0001 pe fiecare magazin, iar `POST /track/v1/referencenumbers` cauta pe CONT.
 * Doua magazine care folosesc acelasi cont FedEx (agentii, francize) si-ar citi
 * comenzile unul altuia, iar `cautaDupaReferinta` ar adopta AWB-ul altui magazin pe
 * comanda gresita. Aceeasi lectie ca la SmartShip si BT iPay.
 */
export function referintaComenzii(businessId: string, orderNumber: string | number): string {
  const magazin = (businessId ?? "").replace(/-/g, "").slice(0, 4).toUpperCase();
  const comanda = String(orderNumber ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 20);
  return `EDN-${magazin}-${comanda}`.slice(0, LUNGIMI.referinta);
}

/*
 * ⚠ `ziuaAzi` s-a MUTAT in `client.ts` si se re-exporta de aici.
 *
 * Motivul e o regresie gasita la a doua trecere: cautarea dupa referinta isi
 * compunea fereastra cu `toISOString()`, adica in ZIUA UTC, in timp ce emiterea
 * scria `shipDatestamp` in ziua ROMANEASCA. Intre 00:00 si 03:00 cele doua difera,
 * iar fereastra se inchidea inaintea zilei in care tocmai se emisese AWB-ul — deci
 * „Verifica la FedEx" raspundea „nu exista nicio expediere" pentru un colet creat
 * cu doua minute in urma, si deschidea drumul catre al doilea AWB, taxabil.
 *
 * O singura definitie, in modulul pe care il importa amandoua.
 */
export { ziuaAzi } from "./client";

// ─── Ce lipseste ─────────────────────────────────────────────────────────────

/**
 * Ce lipseste ca sa se poata emite — si cine e de vina.
 *
 * Se intorc DOUA liste, dinadins: la SmartShip alerta din checkout dadea vina pe
 * magazin si pentru o adresa incompleta a clientului, iar comerciantul cauta
 * degeaba o gresala in configurare.
 */
export type Lipsuri = {
  /** Ce trebuie sa repare COMERCIANTUL in configurarea FedEx. */
  configurare: string[];
  /** Ce lipseste din COMANDA (adresa clientului, greutate). */
  comanda: string[];
};

export function lipsuriConfigurare(config: FedexConfig | null | undefined): string[] {
  const l: string[] = [];
  if (!config) return ["configurarea FedEx"];
  if (!curata(config.client_id)) l.push("API Key");
  if (!curata(config.client_secret)) l.push("Secret Key");

  const cont = curata(config.account_number);
  if (!cont) l.push("numarul de cont FedEx");
  else if (cont.length > LUNGIMI.contNumar) l.push(`numarul de cont are ${cont.length} caractere, iar FedEx accepta cel mult ${LUNGIMI.contNumar}`);

  const e = config.expeditor;
  if (!curata(e?.nume) && !curata(e?.companie)) l.push("numele sau firma expeditorului");
  if (!telefonFedex(e?.telefon)) l.push("telefonul expeditorului");
  if (!curata(e?.strada)) l.push("strada expeditorului");
  if (!curata(e?.oras)) l.push("orasul expeditorului");
  /*
   * ⚠ Codul postal e obligatoriu DE FACTO pentru Romania: in tabelul „Postal Aware
   * Countries" al FedEx, Romania are sablonul `NNNNNN` (sase cifre). Fara el,
   * rutarea si tariful nu se pot calcula, si raspunsul e `POSTALCODE.ZIPCODE.REQUIRED`.
   */
  if (!curata(e?.cod_postal)) l.push("codul postal al expeditorului");
  return l;
}

export function lipsuriExpediere(config: FedexConfig | null | undefined, date: DateExpediere): Lipsuri {
  const configurare = lipsuriConfigurare(config);
  const comanda: string[] = [];
  const d = date.destinatar;

  if (!curata(d.nume) && !curata(d.companie)) comanda.push("numele sau firma destinatarului");
  if (!telefonFedex(d.telefon)) comanda.push("telefonul destinatarului");
  if (liniiAdresa(d).length === 0) comanda.push("adresa destinatarului");
  if (!curata(d.oras)) comanda.push("orasul destinatarului");

  const tara = (curata(d.tara) || "RO").toUpperCase();
  /*
   * ⚠ Codul postal se cere pentru tarile „postal-aware", si Romania e una dintre
   * ele. Pentru alte tari nu stim, deci nu se cere — un camp cerut degeaba ar bloca
   * expedieri care merg azi.
   */
  if (tara === "RO" && !curata(d.codPostal)) comanda.push("codul postal al destinatarului (FedEx il cere pentru Romania)");

  if (!(Number(date.greutateKg) > 0)) comanda.push("greutatea coletului");

  /*
   * ⚠ AICI SE OPRESTE RAMBURSUL, si e singurul loc din integrare care il pomeneste.
   * Nu e o limitare de configurare — e o imposibilitate la ei. Vezi `RAMBURS_INDISPONIBIL`.
   */
  if (Number(date.ramburs) > 0) comanda.push(RAMBURS_INDISPONIBIL);

  /*
   * ⚠ GREUTATEA PESTE 68 KG NU E O „LIPSA", SI NU ARE VOIE SA FIE TRATATA CA UNA.
   *
   * Prima varianta o punea neconditionat in `comanda`, iar `buildFedexOptions` se
   * uita la acea lista ca la o poarta INAINTE de cotare — deci un cos de 80 kg nu
   * ajungea niciodata la FedEx si primea tariful fix. Adica exact hazardul pe care
   * integrarea pretinde ca il evita: FedEx Priority Freight EXISTA in Romania si
   * acopera 68-1.000 kg, iar comerciantului i se promitea in configurare ca il poate
   * folosi.
   *
   * Se blocheaza doar cand serviciul CERUT e unul Express: acolo 80 kg chiar cade la
   * ei. Fara serviciu cerut (cazul cotarii, unde intrebam „ce merge?") nu se
   * blocheaza nimic — raspunsul lor propune Freight-ul, si `ofertePosibile` il lasa
   * sa treaca chiar prin filtrul de marfa grea.
   */
  const greu = Number(date.greutateKg) > GREUTATE_MAXIMA_EXPRESS_KG;
  const serviciuCerut = curata(date.serviceType);
  if (greu && serviciuCerut && !eMarfaGrea(serviciuCerut)) {
    comanda.push(
      `greutatea de ${Number(date.greutateKg).toFixed(1)} kg depaseste limita de ${GREUTATE_MAXIMA_EXPRESS_KG} kg `
      + "a serviciilor FedEx Express; alege FedEx Priority Freight",
    );
  }

  return { configurare, comanda };
}

// ─── Adresa, in forma lor ────────────────────────────────────────────────────

type AdresaFedex = { streetLines: string[]; city: string; postalCode?: string; countryCode: string };
type ContactFedex = { personName?: string; companyName?: string; phoneNumber: string; emailAddress?: string };

/**
 * O parte (expeditor sau destinatar) in forma lor.
 *
 * ⚠ `city` e „conditional and not required in all the requests", dar descrierea lor
 * adauga „It is recommended for Express shipments for the most accurate ODA and OPA
 * surcharges" — adica fara oras, taxa de zona indepartata poate fi cotata gresit.
 * Se trimite mereu.
 */
export function parteFedex(a: AdresaComanda): { address: AdresaFedex; contact: ContactFedex } {
  const tara = (curata(a.tara) || "RO").toUpperCase().slice(0, 2);
  const sector = tara === "RO" ? sectorPentruAdresa(a) : null;

  const linii = liniiAdresa(a);
  /*
   * ⚠ Sectorul intra pe adresa, nu in oras — vezi `orasFedex`. Se pune la INCEPUT
   * doar daca mai e loc: peste 3 linii, FedEx le ignora, iar strada si numarul
   * conteaza mai mult decat sectorul (pe care il da si codul postal).
   */
  const cuSector = sector && linii.length < LUNGIMI.liniiAdresa ? [...linii, sector] : linii;

  const nume = taie(a.nume, LUNGIMI.nume);
  const companie = taie(a.companie, LUNGIMI.companie);

  const contact: ContactFedex = {
    phoneNumber: telefonFedex(a.telefon),
  };
  /* ⚠ Unul dintre ele TREBUIE sa existe. Cand lipseste numele, firma tine locul. */
  if (nume) contact.personName = nume;
  if (companie) contact.companyName = companie;
  if (!nume && !companie) contact.personName = "Destinatar";

  const email = taie(a.email, LUNGIMI.email);
  if (email) contact.emailAddress = email;

  const address: AdresaFedex = {
    streetLines: cuSector.length > 0 ? cuSector : ["-"],
    city: tara === "RO" ? orasFedex(a.oras, a.judet) : taie(a.oras, LUNGIMI.oras),
    countryCode: tara,
  };
  const cod = taie(a.codPostal, LUNGIMI.codPostal).replace(/\s+/g, "");
  if (cod) address.postalCode = cod;

  return { address, contact };
}

/** Expeditorul din configurare, adus la forma unei adrese de comanda. */
export function expeditorCaAdresa(config: FedexConfig): AdresaComanda {
  const e = config.expeditor;
  return {
    nume: e?.nume ?? "",
    companie: e?.companie ?? null,
    strada: e?.strada ?? "",
    oras: e?.oras ?? "",
    judet: e?.judet ?? null,
    codPostal: e?.cod_postal ?? null,
    telefon: e?.telefon ?? null,
    email: e?.email ?? null,
    tara: e?.tara ?? "RO",
  };
}

// ─── Coletul ─────────────────────────────────────────────────────────────────

/**
 * Coletul, in forma lor.
 *
 * ⚠ `units` PLEACA MEREU, si la greutate si la dimensiuni. La dimensiuni fiindca
 * lipsa lui inseamna INCH („Any value other than CM including blank/null will
 * default to IN"); la greutate fiindca `Weight.required = ["units", "value"]`.
 *
 * ⚠ Dimensiunile se rotunjesc IN SUS. Sunt `integer` la ei („No implied decimal
 * places"), iar o rotunjire in jos subdeclara coletul — la fel ca la preturi.
 */
export function coletFedex(config: FedexConfig, date: DateExpediere, referinta: string | null) {
  const dim = (v: number | undefined, implicit: number) =>
    Math.min(DIMENSIUNE_MAXIMA, Math.max(1, Math.ceil(Number(v) > 0 ? Number(v) : implicit)));

  const greutate = Math.max(GREUTATE_MINIMA_KG, Number(date.greutateKg) || GREUTATE_MINIMA_KG);

  const colet: Record<string, unknown> = {
    /*
     * ⚠ `groupPackageCount` nu e decor: „The groupPackageCount must be specified to
     * retrieve customer references." Fara el, referinta noastra nu se intoarce in
     * raspuns si n-avem cum sa verificam ca a ajuns pe expediere.
     */
    groupPackageCount: 1,
    weight: { units: "KG", value: Number(greutate.toFixed(2)) },
    dimensions: {
      length: dim(config.lungime_cm, DIMENSIUNI_IMPLICITE.lungime),
      width: dim(config.latime_cm, DIMENSIUNI_IMPLICITE.latime),
      height: dim(config.inaltime_cm, DIMENSIUNI_IMPLICITE.inaltime),
      units: "CM",
    },
  };

  /*
   * ⚠ `CUSTOMER_REFERENCE` e singurul tip care exista SI in nomenclatorul de la
   * emitere, SI in cel de la cautare. `INVOICE_NUMBER` si `P_O_NUMBER` exista doar
   * la Ship — cerute inapoi la Track, ar da „nu gaseste nimic".
   */
  if (referinta) {
    colet.customerReferences = [{ customerReferenceType: "CUSTOMER_REFERENCE", value: referinta }];
  }

  return colet;
}

// ─── Corpul cotarii ──────────────────────────────────────────────────────────

/**
 * Corpul pentru `POST /rate/v1/rates/quotes`.
 *
 * ⚠ `serviceType` se OMITE dinadins cand nu e cerut unul anume: „If no serviceType
 * is indicated then all the applicable services and corresponding rates will be
 * returned." Asta e chiar ce vrea checkout-ul — sa arate cumparatorului variantele.
 * Ghidul lor recomanda contrariul (raspuns mai mic, mai rapid), dar acolo vorbeste
 * despre un integrator care stie dinainte ce serviciu vrea.
 *
 * ⚠ `preferredCurrency` SINGUR NU FACE NIMIC. Descrierea lor: „Used in conjunction
 * with the rateRequestType data element", iar `PREFERRED` inseamna „Returns rates in
 * the preferred currency specified in the element preferredCurrency". Deci se cer
 * amandoua — `ACCOUNT` pentru tariful negociat al contului, `PREFERRED` pentru lei.
 * E acelasi tipar cu `void` pe builder din auditul de preturi: campul exista, dar
 * fara pereche nu are efect.
 */
export function corpTarife(config: FedexConfig, date: DateExpediere): Record<string, unknown> {
  const expeditor = parteFedex(expeditorCaAdresa(config));
  const destinatar = parteFedex(date.destinatar);

  return {
    accountNumber: { value: taie(config.account_number, LUNGIMI.contNumar) },
    requestedShipment: {
      shipper: { address: expeditor.address },
      recipient: { address: destinatar.address },
      pickupType: config.pickup_type ?? "USE_SCHEDULED_PICKUP",
      shipDateStamp: date.dataExpedierii || ziuaAzi(),
      rateRequestType: ["ACCOUNT", "PREFERRED"],
      preferredCurrency: "RON",
      packagingType: "YOUR_PACKAGING",
      /* Timpii de tranzit trebuie ceruti: „Default value is false." */
      rateRequestControlParameters: { returnTransitTimes: true },
      requestedPackageLineItems: [coletFedex(config, date, null)],
      ...(date.serviceType ? { serviceType: date.serviceType } : {}),
    },
  };
}

// ─── Corpul emiterii ─────────────────────────────────────────────────────────

/**
 * Corpul pentru `POST /ship/v1/shipments`.
 *
 * ⚠ `labelResponseOptions` si `accountNumber` stau la NIVEL DE RADACINA, nu in
 * `requestedShipment`. Puse inauntru, cererea cade — si e o greseala usor de facut,
 * fiindca tot ce seamana cu ele e inauntru.
 *
 * ⚠ `labelResponseOptions: "LABEL"` (base64), niciodata `URL_ONLY`: linkul lor
 * expira in cel mult 12 ore, documentatia nu spune daca cere autentificare, si
 * **FedEx nu are endpoint de reimprimare**. Bufferul il pastram noi, in
 * `public.fedex_etichete`.
 *
 * ⚠ `totalWeight` NU se trimite la expedierile interne. Schema il declara `required`,
 * dar propriile exemple oficiale ale FedEx il omit — inclusiv toate cele sapte
 * cereri RO→RO din colectia lor. Descrierea campului o si explica: „This only
 * applies to International shipments". Trimis unde nu trebuie, e cel mai bun
 * candidat la o eroare de validare pe care n-o intelege nimeni.
 */
export function corpExpediere(config: FedexConfig, date: DateExpediere): Record<string, unknown> {
  const expeditor = parteFedex(expeditorCaAdresa(config));
  const destinatar = parteFedex(date.destinatar);
  const contul = taie(config.account_number, LUNGIMI.contNumar);
  const referinta = curata(date.referinta) || null;

  const taraExpeditor = expeditor.address.countryCode;
  const taraDestinatar = destinatar.address.countryCode;
  const eInternational = taraExpeditor !== taraDestinatar;

  const greutate = Math.max(GREUTATE_MINIMA_KG, Number(date.greutateKg) || GREUTATE_MINIMA_KG);

  const cerere: Record<string, unknown> = {
    labelResponseOptions: "LABEL",
    accountNumber: { value: contul },
    requestedShipment: {
      shipper: expeditor,
      /* ⚠ ARRAY, si numele e la plural: `recipients`. La cotare e `recipient`, singular. */
      recipients: [destinatar],
      shipDatestamp: date.dataExpedierii || ziuaAzi(),
      serviceType: curata(date.serviceType) || "FEDEX_PRIORITY",
      packagingType: "YOUR_PACKAGING",
      pickupType: config.pickup_type ?? "USE_SCHEDULED_PICKUP",
      blockInsightVisibility: false,
      shippingChargesPayment: {
        paymentType: "SENDER",
        payor: { responsibleParty: { accountNumber: { value: contul } } },
      },
      labelSpecification: specificatieEticheta(config),
      requestedPackageLineItems: [coletFedex(config, date, referinta)],
    },
  };

  const expediere = cerere.requestedShipment as Record<string, unknown>;

  /*
   * ⚠ La INTERNATIONAL, si numai acolo.
   *
   * `customsClearanceDetail` e descris „Required for International and intra-country
   * Shipments" — dar exemplele oficiale RO→RO ale FedEx NU il contin. Al treilea loc
   * in care `required` din schema lor e mai strict decat realitatea. Se trimite acolo
   * unde vama chiar exista.
   *
   * `Commodity.required = ["description"]` — descrierea e singurul camp obligatoriu.
   */
  if (eInternational) {
    expediere.totalWeight = Number(greutate.toFixed(2));
    const valoare = Number(date.valoareComanda);
    const descriere = taie(date.continut || config.continut_implicit || "Bunuri de consum", LUNGIMI.descriereMarfa);

    expediere.customsClearanceDetail = {
      dutiesPayment: { paymentType: "RECIPIENT" },
      commercialInvoice: { shipmentPurpose: "SOLD" },
      commodities: [{
        description: descriere,
        quantity: 1,
        quantityUnits: "PCS",
        weight: { units: "KG", value: Number(greutate.toFixed(2)) },
        countryOfManufacture: taraExpeditor,
        ...(valoare > 0
          ? {
            unitPrice: { amount: Number(valoare.toFixed(2)), currency: "RON" },
            customsValue: { amount: Number(valoare.toFixed(2)), currency: "RON" },
          }
          : {}),
      }],
      ...(valoare > 0 ? { totalCustomsValue: { amount: Number(valoare.toFixed(2)), currency: "RON" } } : {}),
    };
  }

  /*
   * Valoarea declarata la transport, cand comerciantul o cere. Costa, deci e stinsa
   * din oficiu — la fel ca `asigura_coletul` la Shipo.
   */
  if (config.valoare_declarata && Number(date.valoareComanda) > 0) {
    expediere.totalDeclaredValue = { amount: Number(Number(date.valoareComanda).toFixed(2)), currency: "RON" };
  }

  return cerere;
}
