import { normalizePhone } from "@/lib/utils/phone";
import { normalizeLocalityName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";
import {
  FONDURI_RAMBURS_IMPLICIT, FORMAT_IMPLICIT, SUBVERSIUNE_RATE, SUBVERSIUNE_SHIP,
  ziuaUps, type UpsConfig,
} from "./client";
import { codServiciu, serviciulImplicit } from "./servicii";

/**
 * Construirea cererilor UPS dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. Probele de langa fisierul asta raman
 * singura verificare care se poate face inainte de prima cheie de cont.
 *
 * ═══ ⚠ SASE LUCRURI PE CARE UPS LE PEDEPSESTE TACUT ═══
 *
 * **1. `PackageWeight.UnitOfMeasurement` LIPSA = LIVRE.** Verbatim din `Rating.yaml`:
 * „LBS - Pounds **(default)**". Un colet de 5 kg trimis fara unitate e cotat ca 5
 * livre — adica 2,27 kg — si tariful iese cu o treime mai mic decat cel real. Fara
 * nicio eroare. E acelasi defect ca `dimensions.units` la FedEx, doar ca acolo era
 * in sens invers (tol in loc de centimetru).
 *
 * **2. `ShipFrom.Address.CountryCode` LIPSA = STATELE UNITE.** Verbatim: „Required,
 * but **defaults to US**." O cotare fara el pleaca din America si intoarce preturi
 * care n-au nicio legatura cu ruta.
 *
 * **3. `ResidentialAddressIndicator` LIPSA = ADRESA DE FIRMA.** Verbatim: „If this
 * indicator is not present, address will be considered as **commercial**." La un
 * magazin online, aproape toate adresele sunt de casa — iar taxa lor de livrare
 * rezidentiala nu apare in cotare si se vede abia pe factura.
 *
 * **4. `Service.Code` LIPSA = CEL MAI SCUMP SERVICIU.** Ghidul lor romanesc,
 * verbatim: „Daca nicio optiune de serviciu nu este selectata de dvs., atunci
 * expedierea se va efectua si **factura automat prin UPS Express**". Nu e o eroare,
 * e o factura.
 *
 * **5. `Dimensions` SE TAIE LA 3 CARACTERE LA EMITERE, DAR LA 9 LA COTARE.**
 * `Shipping.yaml`: `maxLength: 3`. `Rating.yaml`: `maxLength: 9`, „6 digits … with 2
 * digits of significance after the decimal point". Deci `27.5` coteaza perfect si
 * cade cu 400 la emitere. Se trimit INTREGI peste tot.
 *
 * **6. REFERINTA NOASTRA SE PUNE PE EXPEDIERE, NU PE COLET.** Verbatim:
 * `Package.ReferenceNumber` — „Valid if the origin/destination pair is US/US or
 * PR/PR"; `Shipment.ReferenceNumber` — „Valid if the origin/destination pair is
 * **not** US/US or PR/PR". Pentru Romania e exact invers fata de orice exemplu
 * american, iar pusa gresit se pierde tacut — impreuna cu singura cale de a afla,
 * printr-o citire, daca AWB-ul chiar s-a creat.
 *
 * ═══ ⚠ SI DOUA CAMPURI CARE SE NUMESC ALTFEL IN CELE DOUA API-uri ═══
 *
 * `Package.PackagingType` la COTARE, `Package.Packaging` la EMITERE — acelasi cod
 * (`02`), doua nume. Iar containerele de unitate de masura cer `Description` la
 * cotare (`required: [Description, Code]`) si nu il cer la emitere (`required: [Code]`).
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

/** Punctul UPS Access Point ales de cumparator, adus din comanda. */
export type PunctAles = {
  /** `PublicAccessPointID` din Locator. Pleaca in `AlternateDeliveryAddress.UPSAccessPointID`. */
  id: string;
  nume: string;
  adresa: string;
  oras: string;
  judet?: string | null;
  codPostal?: string | null;
};

export type DateExpediere = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  /** Suma de incasat la livrare. UPS o pune la nivel de EXPEDIERE. */
  ramburs?: number;
  valoareComanda?: number;
  /** Codul serviciului ales de cumparator la checkout. */
  serviceCode?: string | null;
  /** Referinta noastra, `EDN-xxxx-000123`. Vezi `referintaComenzii`. */
  referinta?: string | null;
  /** Data expedierii, `YYYYMMDD`. Implicit azi. */
  dataExpedierii?: string | null;
  /** Cand comanda merge la un punct UPS Access Point. */
  punct?: PunctAles | null;
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Plafoanele, TOATE transcrise din `Shipping.yaml` — cel mai strict dintre cele doua.
 *
 * ⚠ Se ia MEREU minimul dintre Rating si Shipping. Cotarea e mai ingaduitoare
 * („Length is not validated" pe majoritatea campurilor ei), deci o valoare croita
 * dupa ea trece la cotare si cade la emitere — adica exact dupa ce cumparatorul a
 * platit.
 */
export const LUNGIMI = {
  nume: 35,
  atentie: 35,
  /** ⚠ 30, nu 35: „30 characters are accepted, but only 15 characters will be printed on the label." */
  oras: 30,
  /** ⚠ 9 caractere, orice ar fi. Codul romanesc de 6 cifre incape. */
  codPostal: 9,
  /** „Valid values are 0 - 9." — cifre, si atat. */
  telefon: 15,
  email: 50,
  liniiAdresa: 3,
  liniiAdresaLungime: 35,
  /** ⚠ EXACT 6, alfanumeric: „Shipper's six digit alphanumeric account number." */
  contNumar: 6,
  /** `Shipment.ReferenceNumber.Value`. */
  referinta: 35,
  /** `Shipment.Description`. */
  descriereExpediere: 50,
  /** `Package.Description`. */
  descriereColet: 35,
  /** ⚠ TREI CARACTERE la emitere. Deci intregi, si cel mult 999. */
  dimensiune: 3,
  /** `Package.PackageWeight.Weight`. */
  greutate: 5,
} as const;

/** Greutatea minima trimisa. Aceeasi cu cea din `lib/shipping/awb-weight.ts`. */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * Greutatea maxima a unui colet UPS, in kilograme.
 *
 * ⚠ NU e in specificatii — cautat `70 kg`, `150 lbs`, `girth` si orice plafon numeric
 * in `Shipping.yaml` si `Rating.yaml`: zero potriviri. Vine din paginile lor
 * europene „Shipping Dimensions and Weight", verbatim: „Parcels can be up to 70 kg".
 */
export const GREUTATE_MAXIMA_KG = 70;

/**
 * ⚠ Pragul de la care coletul cere eticheta lor speciala de „colet greu".
 *
 * Verbatim: „Parcels that weigh more than 31.5 kg (**25 kg within the EU**) require a
 * special heavy-parcel label." Romania → Romania si Romania → UE sunt amandoua
 * intra-comunitare, deci pragul e 25, nu 31,5. Nu blocheaza nimic — se spune omului,
 * fiindca eticheta aia se lipeste de mana.
 */
export const PRAG_COLET_GREU_KG = 25;

/** ⚠ Punctele UPS Access Point din Romania: „Greutatea maxima … per colet este de 20 kg". */
export const GREUTATE_MAXIMA_PUNCT_KG = 20;
/** ⚠ Si „Lungimea maxima a coletului este de 97 cm". */
export const LUNGIME_MAXIMA_PUNCT_CM = 97;

/**
 * Dimensiunile implicite, in CENTIMETRI.
 *
 * ⚠ Nu sunt decor: UPS factureaza pe maximul dintre greutatea fizica si cea
 * volumetrica (divizorul lor publicat e 5.000 pentru centimetri), deci dimensiuni
 * prea mari scumpesc fiecare colet. Aceleasi valori ca la Shipo si FedEx, ca sa nu
 * apara trei implicite in platforma.
 */
export const DIMENSIUNI_IMPLICITE = { lungime: 30, latime: 20, inaltime: 10 } as const;

/** ⚠ „Valid values are 0 to 108 IN and 0 to 270 CM", si campul are 3 caractere. */
const DIMENSIUNE_MAXIMA_CM = 270;
/** ⚠ „Length + 2*(Width + Height) must be less than or equal to 165 IN or 330 CM." */
const CIRCUMFERINTA_MAXIMA_CM = 330;

function taie(text: string | null | undefined, max: number): string {
  return curata(text).slice(0, max).trim();
}

/**
 * Adresa, impartita in cel mult 3 linii de cel mult 35 de caractere.
 *
 * ⚠ SE IMPARTE, NU SE TRUNCHIAZA. „All three Address Lines will be printed on the
 * label" — deci o adresa romaneasca intreaga pusa pe un singur rand ajunge la curier
 * fara bloc, scara si apartament, iar coletul se intoarce.
 *
 * ⚠ SI FARA DIACRITICE. UPS are chiar un camp pentru asta (`CharacterSet: "ron"`,
 * „Romanian (Latin-2)"), si il si trimitem — dar implicitul lor e Latin-1, in care
 * `ă`, `ș` si `ț` nu exista. Doua straturi de aparare: cerem setul romanesc SI
 * trimitem text fara diacritice, ca la ceilalti paisprezece curieri.
 *
 * ⚠ Schema lor NU poate valida nimic din asta: `maximum: 3` de pe `AddressLine` e
 * numarul de aparitii in dialectul LOR de OpenAPI, nu `maxItems`, iar `maxLength: 35`
 * sta pe tablou, nu pe elemente. Un validator generat nu prinde nici linia a patra,
 * nici caracterul 36. Taierea trebuie facuta aici.
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
 * ⚠ BUCURESTI: UPS intra in TABARA CEA MARE.
 *
 * Regula proiectului (vezi `bucuresti-pe-curieri.test.ts` si memoria
 * `sameday-audit-2026-07`): Sameday si eColet vor `Sector 3` in campul de
 * localitate, ceilalti vor `Bucuresti`. Cine le uniformizeaza rupe zece curieri tacut.
 *
 * UPS **nu documenteaza NICIO regula de sector**: cautat `sector` in toate cele
 * cincisprezece fisiere OpenAPI ale lor — ZERO potriviri. Nici `bucharest`, nici
 * `bucuresti`. Deci nu se inventeaza una: orasul se pliaza in „Bucuresti", iar
 * sectorul, care ramane o informatie reala de livrare, pleaca pe adresa — unde chiar
 * se tipareste („All three Address Lines will be printed on the label"), spre
 * deosebire de oras, din care se tiparesc doar 15 caractere.
 *
 * ⚠ `StateProvinceCode` NU se trimite pentru Romania: textul lor, repetat in
 * unsprezece locuri, e „Required for US, Canada, and Vietnam (VN)", iar singura tara
 * europeana cu regula proprie e Irlanda. UPS n-are nomenclator de judete romanesti
 * (cautat in toate specificatiile). Si e si o capcana de lungime: emiterea accepta
 * pana la 5 caractere, cotarea cere EXACT 2 — „Ilfov" ar trece la emitere si ar cadea
 * la cotare.
 */
export function orasUps(oras: string, judet?: string | null): string {
  return taie(normalizeLocalityName(oras, judet ?? undefined), LUNGIMI.oras);
}

/** Sectorul, ca text de pus pe adresa. `null` cand adresa nu e din Bucuresti. */
export function sectorPentruAdresa(a: Pick<AdresaComanda, "oras" | "judet">): string | null {
  const n = sectorBucuresti(a.oras) ?? sectorBucuresti(a.judet);
  return n ? `Sector ${n}` : null;
}

/**
 * Telefonul, in forma pe care o accepta UPS.
 *
 * ⚠ „Valid values are 0 - 9" — cifre, si atat. Nici `+`, nici spatii, nici paranteze.
 * Iar pentru alte tari decat SUA layout-ul cerut e „country or territory code, area
 * code, 7 digit number", deci prefixul de tara CHIAR trebuie sa fie acolo.
 *
 * `normalizePhone` aduce numerele romanesti la forma locala `07…`; aici li se pune
 * inapoi `40` in fata, fiindca asta cere UPS. Numerele straine (`+49…`) isi pastreaza
 * prefixul, doar fara semnul plus.
 */
export function telefonUps(brut: string | null | undefined): string {
  const normalizat = normalizePhone(brut ?? "");
  let cifre = normalizat.replace(/\D/g, "");
  if (!cifre) return "";
  /* `07…` → `407…`. Numerele deja internationale nu se ating. */
  if (cifre.startsWith("0") && !normalizat.trim().startsWith("+")) cifre = `40${cifre.slice(1)}`;
  return cifre.slice(0, LUNGIMI.telefon);
}

/**
 * Referinta noastra pe expedierea UPS.
 *
 * ⚠ CELE PATRU CARACTERE DIN `businessId` NU SUNT ORNAMENT.
 *
 * `order_number` are `UNIQUE (business_id, order_number)` si contorul reporneste la
 * #0001 pe fiecare magazin, iar `GET /api/track/v1/reference/details/{ref}` cauta pe
 * CONT (si documentatia lor spune limpede ca referintele nu sunt unice intre conturi).
 * Doua magazine care folosesc acelasi cont UPS si-ar citi comenzile unul altuia, iar
 * `cautaDupaReferinta` ar adopta AWB-ul altui magazin pe comanda gresita. Aceeasi
 * lectie ca la FedEx, SmartShip si BT iPay.
 *
 * ⚠ Si fara spatii: „In order to barcode a reference number, its value must be no
 * longer than 14 alphanumeric characters or 24 numeric characters and **cannot
 * contain spaces**."
 */
export function referintaComenzii(businessId: string, orderNumber: string | number): string {
  const magazin = (businessId ?? "").replace(/-/g, "").slice(0, 4).toUpperCase();
  const comanda = String(orderNumber ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 20);
  return `EDN-${magazin}-${comanda}`.slice(0, LUNGIMI.referinta);
}

export { ziuaUps } from "./client";

// ─── Ce lipseste ─────────────────────────────────────────────────────────────

/**
 * Ce lipseste ca sa se poata emite — si cine e de vina.
 *
 * Se intorc DOUA liste, dinadins: la SmartShip alerta din checkout dadea vina pe
 * magazin si pentru o adresa incompleta a clientului, iar comerciantul cauta degeaba
 * o gresala in configurare.
 */
export type Lipsuri = {
  /** Ce trebuie sa repare COMERCIANTUL in configurarea UPS. */
  configurare: string[];
  /** Ce lipseste din COMANDA (adresa clientului, greutate). */
  comanda: string[];
};

export function lipsuriConfigurare(config: UpsConfig | null | undefined): string[] {
  const l: string[] = [];
  if (!config) return ["configurarea UPS"];
  if (!curata(config.client_id)) l.push("Client ID");
  if (!curata(config.client_secret)) l.push("Client Secret");

  const cont = curata(config.account_number);
  if (!cont) l.push("numarul de cont UPS (Shipper Number)");
  else if (cont.length !== LUNGIMI.contNumar) {
    l.push(
      `numarul de cont UPS are ${cont.length} caractere, iar UPS cere EXACT ${LUNGIMI.contNumar} `
      + "(„Shipper's six digit alphanumeric account number”)",
    );
  }

  const e = config.expeditor;
  if (!curata(e?.nume) && !curata(e?.companie)) l.push("numele sau firma expeditorului");
  if (!curata(e?.strada)) l.push("strada expeditorului");
  if (!curata(e?.oras)) l.push("orasul expeditorului");
  /*
   * ⚠ Codul postal NU e obligatoriu in schema lor pentru Romania („Otherwise
   * optional"), dar e obligatoriu in FAPT: fara `StateProvinceCode` — pe care nu-l
   * trimitem, fiindca UPS n-are nomenclator de judete romanesti — codul postal e
   * singurul semnal ramas dupa care ei pot zona ruta.
   */
  if (!curata(e?.cod_postal)) l.push("codul postal al expeditorului");
  /* Telefonul devine obligatoriu la orice expediere in afara tarii. */
  if (!telefonUps(e?.telefon)) l.push("telefonul expeditorului (UPS il cere la orice expediere internationala)");
  return l;
}

export function lipsuriExpediere(config: UpsConfig | null | undefined, date: DateExpediere): Lipsuri {
  const configurare = lipsuriConfigurare(config);
  const comanda: string[] = [];
  const d = date.destinatar;

  const taraExpeditor = (curata(config?.expeditor?.tara) || "RO").toUpperCase();
  const taraDestinatar = (curata(d.tara) || "RO").toUpperCase();
  const eInternational = taraExpeditor !== taraDestinatar;

  /* ⚠ `ShipTo.Name` e in `required`. Fara el cererea cade, oricat de completa ar fi adresa. */
  if (!curata(d.nume) && !curata(d.companie)) comanda.push("numele sau firma destinatarului");
  if (liniiAdresa(d).length === 0) comanda.push("adresa destinatarului");
  if (!curata(d.oras)) comanda.push("orasul destinatarului");

  /*
   * ⚠ Telefonul si persoana de contact devin OBLIGATORII cand tarile difera.
   * Verbatim, si pe `ShipTo.Phone.Number` si pe `ShipTo.AttentionName`: „Required
   * for: UPS Next Day Air® Early service, and **when Ship To country or territory is
   * different than the ShipFrom country or territory**." Iar pe `Shipper.Phone`:
   * „A phone number is required if destination is international."
   */
  if (eInternational && !telefonUps(d.telefon)) {
    comanda.push("telefonul destinatarului (UPS il cere la expedierile in alta tara)");
  }

  if (!(Number(date.greutateKg) > 0)) comanda.push("greutatea coletului");
  else if (Number(date.greutateKg) > GREUTATE_MAXIMA_KG) {
    comanda.push(
      `greutatea de ${Number(date.greutateKg).toFixed(1)} kg depaseste limita UPS de ${GREUTATE_MAXIMA_KG} kg pe colet`,
    );
  }

  /*
   * ⚠ RAMBURSUL: exista, dar are trei conditii, si doua sunt ale CONTULUI.
   *
   * „Shipment COD is only available for EU origin countries or territories and for
   * shippers account type **Daily Pickup and Drop Shipping**." Tipul contului nu se
   * poate citi din API — de aia proba de conexiune coteaza si cu ramburs, si de aia
   * comerciantul are un comutator. Aici se opreste doar cazul in care el l-a stins.
   */
  if (Number(date.ramburs) > 0 && config && config.ramburs_activ === false) {
    comanda.push(
      "comanda are plata la livrare, iar rambursul UPS e stins in configurare "
      + "(UPS il ofera doar pe conturi „Daily Pickup” sau „Drop Shipping”)",
    );
  }

  /*
   * ⚠ Rambursul cere valuta tarii de DESTINATIE, si noi n-o stim pentru toate tarile.
   *
   * Verbatim din codul lor de eroare `120597`: „Please use the destination country
   * currency code." Ghicita „EUR pentru orice nu e Romania", o comanda RO→HU ar fi cazut
   * la ei — si mesajul tradus de noi ar fi vorbit despre Romania, deci comerciantul ar fi
   * cautat in partea gresita. Mai bine se opreste aici, cu motivul scris.
   */
  if (Number(date.ramburs) > 0 && !valutaRamburs(d.tara)) {
    comanda.push(
      `nu stim ce valuta cere UPS pentru ramburs in ${taraDestinatar} (ei cer valuta tarii de destinatie, `
      + "iar noi cunoastem doar leul si euro) — incaseaza comanda in avans sau foloseste alt curier",
    );
  }

  /*
   * ⚠ AICI NU SE VERIFICA DACA SERVICIUL E „VALABIL PE RUTA", SI E O HOTARARE.
   *
   * Prima varianta bloca emiterea cand serviciul ales nu era in tabelul nostru de rute
   * romanesti (`11 UPS Standard` si `54 Express Plus` intern). Dar serviciul ajunge
   * aici din chiar cotarea lor — iar `Shop` „validates the shipment, and returns rates
   * for all UPS products from the ShipFrom to the ShipTo addresses". Adica UPS a
   * spus deja ca il vinde pe ruta asta. Blocat de noi, comerciantul ar fi ramas cu o
   * comanda platita si neexpediabila, din cauza unui PDF comercial, nu a lor.
   *
   * Tabelul ramane util ca SFAT (vezi `eVandutInRomania`), niciodata ca poarta.
   */

  /* Punctul de ridicare are limitele lui, si sunt mai stranse decat ale coletului. */
  if (date.punct) {
    if (!curata(date.punct.id)) comanda.push("identificatorul punctului UPS ales");
    if (Number(date.greutateKg) > GREUTATE_MAXIMA_PUNCT_KG) {
      comanda.push(
        `coletul de ${Number(date.greutateKg).toFixed(1)} kg depaseste limita de `
        + `${GREUTATE_MAXIMA_PUNCT_KG} kg a punctelor UPS Access Point din Romania`,
      );
    }
    /*
     * ⚠ Livrarea in punct cere EMAILUL, nu „emailul sau telefonul".
     *
     * Proza lor spune „VoiceMessage phone number or TextMessage phone number or email
     * address is required for ADL notification", dar schema containerului spune
     * `required: [NotificationCode, **EMail**]` — iar `required` se verifica inainte sa
     * se uite cineva la proza. Ceruta doar „una dintre trei", o comanda cu telefon si
     * fara email ar fi trecut de noi si ar fi cazut la ei, cu `120560`.
     */
    if (!curata(d.email)) {
      comanda.push("emailul cumparatorului (UPS il cere ca sa-l anunte cand coletul ajunge in punct)");
    }
  }

  return { configurare, comanda };
}

/**
 * ⚠ AVERTISMENT, NU BLOCAJ: UPS nu livreaza in ACEEASI localitate din Romania.
 *
 * Ghidul lor de servicii postale romanesti, nota 2 de la pagina 4, verbatim: „UPS
 * presteaza servicii expres in conformitate cu legislatia din Romania, cu mentiunea
 * ca **UPS nu presteaza servicii postale in aceeasi localitate pe teritoriul
 * Romaniei**."
 *
 * Nu se blocheaza emiterea, si asta e o hotarare: nota e din ghidul POSTAL (colete
 * pana la 31,5 kg), iar ghidul de TRANSPORT nu repeta restrictia. Autoritatea reala
 * e chiar cotarea lor — daca UPS nu deserveste ruta, nu intoarce niciun serviciu, iar
 * checkout-ul cade oricum pe tariful fix. Ce facem noi e sa SPUNEM de ce, in loc sa
 * lasam comerciantul sa caute o zi.
 */
export function eAceeasiLocalitate(
  config: Pick<UpsConfig, "expeditor"> | null | undefined,
  destinatar: Pick<AdresaComanda, "oras" | "judet" | "tara">,
): boolean {
  const taraExpeditor = (curata(config?.expeditor?.tara) || "RO").toUpperCase();
  const taraDestinatar = (curata(destinatar.tara) || "RO").toUpperCase();
  if (taraExpeditor !== "RO" || taraDestinatar !== "RO") return false;

  const de = orasUps(config?.expeditor?.oras ?? "", config?.expeditor?.judet);
  const la = orasUps(destinatar.oras ?? "", destinatar.judet);
  return !!de && de.toLowerCase() === la.toLowerCase();
}

export const AVERTISMENT_ACEEASI_LOCALITATE =
  "UPS nu presteaza servicii in aceeasi localitate pe teritoriul Romaniei (scrie in ghidul lor de "
  + "servicii postale). Pentru livrari in orasul din care expediezi, foloseste alt curier.";

// ─── Adresa, in forma lor ────────────────────────────────────────────────────

type AdresaUps = {
  AddressLine: string[];
  City: string;
  StateProvinceCode?: string;
  PostalCode?: string;
  CountryCode: string;
  ResidentialAddressIndicator?: string;
};

/**
 * ⚠ Judetul, si de ce pleaca DOAR cand are exact doua caractere.
 *
 * Trei fapte care se bat cap in cap:
 *
 * 1. UPS spune ca judetul nu e cerut pentru Romania: textul lor, repetat in
 *    unsprezece locuri, e „Required for **US, Canada, and Vietnam (VN)**", iar
 *    singura tara europeana cu regula proprie e Irlanda.
 * 2. Dar tot ei spun, pe `ShipFrom.Address.StateProvinceCode`: „**A StateProvinceCode
 *    and valid account number are required when requesting negotiated rates.**" Si,
 *    mai jos: „If the TaxInformationIndicator flag is present in the request, a
 *    StateProvinceCode must be entered for tax charges to be accurately calculated."
 *    Noi cerem si tarife negociate, si taxe.
 * 3. Iar cele doua API-uri declara latimi DIFERITE: emiterea accepta 1-5 caractere,
 *    cotarea cere **exact 2**. „Ilfov" (5) ar trece la emitere si ar cadea la cotare.
 *
 * UPS nu publica niciun nomenclator de judete romanesti (cautat in toate cele
 * cincisprezece fisiere: zero potriviri). Deci nu se inventeaza unul. Se trimite ce a
 * scris comerciantul, dar NUMAI daca are fix doua caractere — adica daca el a primit
 * de la UPS un cod care se potriveste. Orice altceva se omite: mai bine cotam la pret
 * de lista (si o spunem, prin `doarPretDeLista`) decat sa cada fiecare cotare pe un
 * camp inventat de noi.
 */
export function judetUps(judet: string | null | undefined): string | null {
  const t = stripDiacritics(curata(judet)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t.length === 2 ? t : null;
}

/**
 * Adresa unei parti, in forma lor.
 *
 * ⚠ `rezidential` NU e optional in practica. „If this indicator is not present,
 * address will be considered as **commercial**" — iar taxa lor de livrare la
 * domiciliu nu apare atunci in cotare si iese la iveala pe factura. Se trimite pentru
 * fiecare adresa de cumparator; pentru expeditor, niciodata (e o firma).
 *
 * ⚠ Si e un STEAG PRIN PREZENTA: „This is an empty tag, any value inside is ignored."
 * Deci `false`, `"0"` sau `"N"` il APRIND. Singurul fel de a-l stinge e sa lipseasca.
 */
export function adresaUps(a: AdresaComanda, rezidential: boolean): AdresaUps {
  const tara = (curata(a.tara) || "RO").toUpperCase().slice(0, 2);
  const sector = tara === "RO" ? sectorPentruAdresa(a) : null;

  const linii = liniiAdresa(a);
  /*
   * ⚠ Sectorul intra pe adresa, nu in oras — vezi `orasUps`. Se pune la sfarsit doar
   * daca mai e loc: peste 3 linii UPS le ignora, iar strada si numarul conteaza mai
   * mult decat sectorul (pe care il da si codul postal).
   */
  const cuSector = sector && linii.length < LUNGIMI.liniiAdresa ? [...linii, sector] : linii;

  const iesire: AdresaUps = {
    AddressLine: cuSector.length > 0 ? cuSector : ["-"],
    City: tara === "RO" ? orasUps(a.oras, a.judet) : taie(stripDiacritics(a.oras), LUNGIMI.oras),
    CountryCode: tara,
  };

  const cod = taie(a.codPostal, LUNGIMI.codPostal).replace(/\s+/g, "");
  if (cod) iesire.PostalCode = cod;
  /* ⚠ Numai daca are fix doua caractere. Vezi `judetUps`. */
  const judet = judetUps(a.judet);
  if (judet) iesire.StateProvinceCode = judet;
  if (rezidential) iesire.ResidentialAddressIndicator = "";

  return iesire;
}

/** Expeditorul din configurare, adus la forma unei adrese de comanda. */
export function expeditorCaAdresa(config: UpsConfig): AdresaComanda {
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

/** Numele de aratat pe eticheta: firma cand exista, altfel persoana. */
function numeParte(a: AdresaComanda): string {
  return taie(stripDiacritics(curata(a.companie) || curata(a.nume)), LUNGIMI.nume) || "Destinatar";
}

/** Persoana de contact. UPS o cere separat de numele partii la orice expediere externa. */
function atentieParte(a: AdresaComanda): string {
  return taie(stripDiacritics(curata(a.nume) || curata(a.companie)), LUNGIMI.atentie) || "Destinatar";
}

// ─── Coletul ─────────────────────────────────────────────────────────────────

/**
 * Dimensiunea unei laturi, in centimetri intregi.
 *
 * ⚠ INTREGI, si nu din comoditate: campul are `maxLength: 3` la emitere. `27.5`
 * are patru caractere si cade cu 400 — dar coteaza perfect, fiindca acolo plafonul e
 * 9. Adica defectul apare abia dupa ce cumparatorul a platit.
 *
 * ⚠ Si SE ROTUNJESTE IN SUS: o rotunjire in jos subdeclara coletul.
 */
function dimensiune(v: number | undefined, implicit: number): number {
  const n = Number(v) > 0 ? Number(v) : implicit;
  return Math.min(DIMENSIUNE_MAXIMA_CM, Math.max(1, Math.ceil(n)));
}

/** Dimensiunile coletului din configurare, gata verificate. */
export function dimensiuniColet(config: Pick<UpsConfig, "lungime_cm" | "latime_cm" | "inaltime_cm">) {
  return {
    lungime: dimensiune(config.lungime_cm, DIMENSIUNI_IMPLICITE.lungime),
    latime: dimensiune(config.latime_cm, DIMENSIUNI_IMPLICITE.latime),
    inaltime: dimensiune(config.inaltime_cm, DIMENSIUNI_IMPLICITE.inaltime),
  };
}

/**
 * Depaseste coletul circumferinta maxima?
 *
 * ⚠ Formula e a LOR, si e transcrisa exact: „Length + 2*(Width + Height) must be less
 * than or equal to 165 IN or **330 CM**." (Paginile lor comerciale spun 400 cm — se
 * ia cea mai stricta dintre cele doua, fiindca ea e cea care produce un 400.)
 */
export function depasesteCircumferinta(d: { lungime: number; latime: number; inaltime: number }): boolean {
  return d.lungime + 2 * (d.latime + d.inaltime) > CIRCUMFERINTA_MAXIMA_CM;
}

/** Greutatea trimisa, in forma lor: cel mult 5 caractere, deci doua zecimale. */
function greutateUps(kg: number): string {
  const g = Math.max(GREUTATE_MINIMA_KG, Number(kg) || GREUTATE_MINIMA_KG);
  /* ⚠ `maxLength: 5` la emitere. „999.9" incape; „1000.00" nu. */
  const cu2 = g.toFixed(2);
  return cu2.length <= LUNGIMI.greutate ? cu2 : g.toFixed(1).slice(0, LUNGIMI.greutate);
}

// ─── Corpul cotarii ──────────────────────────────────────────────────────────

/**
 * Corpul pentru `POST /api/rating/{version}/{requestoption}`.
 *
 * ⚠ `Package.PackagingType` — asa se numeste AICI. La emitere e `Package.Packaging`.
 * Acelasi cod (`02`), doua nume, si nimic nu se plange daca il pui pe cel gresit:
 * lipseste pur si simplu, iar `Packaging` e singurul camp `required` de pe colet.
 *
 * ⚠ Containerele de unitate cer `Description` AICI (`required: [Description, Code]`)
 * si nu il cer la emitere. Se trimite in amandoua: un camp in plus e ignorat.
 *
 * ⚠ `ShipFrom` se trimite MEREU, chiar daca e identic cu `Shipper`: fara el UPS
 * foloseste adresa expeditorului („If the ShipFrom container is not present then this
 * address will be used"), ceea ce ar merge — dar `ShipFrom.Address.StateProvinceCode`
 * e cerut de ei pentru tarifele negociate, si e locul in care se vede daca lipseste.
 */
export function corpTarife(config: UpsConfig, date: DateExpediere): Record<string, unknown> {
  const expeditor = expeditorCaAdresa(config);
  const cont = taie(config.account_number, LUNGIMI.contNumar);
  const d = dimensiuniColet(config);
  /*
   * ⚠ Rambursul intra in cerere DOAR daca comerciantul l-a lasat pornit.
   *
   * Nu e o dublare a lui `lipsuriExpediere`: acolo se OPRESTE emiterea, aici se
   * opreste CAMPUL. Trimis totusi pe un cont care nu suporta ramburs, el ar face
   * cotarea sa cada cu totul — deci comerciantul n-ar mai vedea niciun pret UPS,
   * in loc sa vada preturile fara ramburs si un mesaj limpede.
   */
  const ramburs = Number(date.ramburs) > 0 && config.ramburs_activ !== false ? Number(date.ramburs) : 0;

  /* La livrarea in punct, adresa care se coteaza e a PUNCTULUI, nu a cumparatorului. */
  const punct = date.punct ?? null;

  const taraExpeditor = (curata(expeditor.tara) || "RO").toUpperCase();
  const taraDestinatar = (curata(date.destinatar.tara) || "RO").toUpperCase();
  const eInternational = taraExpeditor !== taraDestinatar;

  const expediere: Record<string, unknown> = {
    Shipper: {
      Name: numeParte(expeditor),
      ShipperNumber: cont,
      Address: adresaUps(expeditor, false),
    },
    ShipTo: {
      Name: numeParte(date.destinatar),
      /* ⚠ Adresa cumparatorului e rezidentiala; a punctului UPS nu e. */
      Address: punct ? adresaPunct(punct) : adresaUps(date.destinatar, true),
    },
    ShipFrom: {
      Name: numeParte(expeditor),
      Address: adresaUps(expeditor, false),
    },
    PaymentDetails: {
      /*
       * ⚠ NUMAI `01`. „02 = Duties and Taxes … is invalid for **Qualified Domestic
       * Shipments**", iar definitia lor de „qualified" cuprinde si „the origin and
       * destination country or territory are both European Union countries". Deci
       * RO→RO si RO→UE sunt amandoua acolo, si un `02` ratacit cade.
       */
      ShipmentCharge: [{ Type: "01", BillShipper: { AccountNumber: cont } }],
    },
    /*
     * ⚠ Fara `PackageBillType` nu vin timpii de tranzit deloc: „Will only be returned
     * if request option was either 'ratetimeintransit' or 'shoptimeintransit' **and
     * DeliveryTimeInformation container was present in request**."
     * `03` = non-document, adica un colet obisnuit. `04` ar aduce si serviciile de
     * paleti, pe care nu le vindem in checkout.
     */
    DeliveryTimeInformation: { PackageBillType: "03" },
    Package: [{
      PackagingType: { Code: "02", Description: "Package" },
      Dimensions: {
        UnitOfMeasurement: { Code: "CM", Description: "Centimeters" },
        Length: String(d.lungime),
        Width: String(d.latime),
        Height: String(d.inaltime),
      },
      PackageWeight: {
        /* ⚠ FARA ASTA, KILOGRAMELE DEVIN LIVRE. Vezi antetul. */
        UnitOfMeasurement: { Code: "KGS", Description: "Kilograms" },
        Weight: greutateUps(date.greutateKg),
      },
    }],
  };

  /*
   * Tarifele contractului. Fara steagul asta UPS intoarce preturile de LISTA, care
   * sunt cele mai mari — iar comerciantul ar vinde transportul in pierdere.
   * ⚠ Cere si `Shipper.ShipperNumber`, pe care il trimitem mai sus.
   */
  if (config.tarife_negociate !== false) {
    expediere.ShipmentRatingOptions = { NegotiatedRatesIndicator: "Y" };
  }

  /*
   * ⚠ Taxele vin DOAR daca sunt cerute: „If present, any taxes that may be
   * applicable to a shipment would be returned in response." Iar cerute impreuna cu
   * tarifele negociate, ele apar NUMAI sub `NegotiatedRateCharges` — deci `preturi.ts`
   * trebuie sa le caute in amandoua locurile.
   */
  expediere.TaxInformationIndicator = "";

  /*
   * ⚠ DOUA CAMPURI CERUTE DOAR LA INTERNATIONAL, SI DOAR PE CALEA CU TIMPI DE TRANZIT.
   *
   * Amandoua se rateaza usor, fiindca nimic din numele lor nu spune ca ar avea vreo
   * legatura cu `Shoptimeintransit`:
   *
   *   `ShipmentTotalWeight` — „only applicable for 'ratetimeintransit' and
   *     'shoptimeintransit' request options. **Required for all international
   *     shipments when retreiving time in transit information**, including letters
   *     and documents shipments." (greseala de tipar e a lor)
   *
   *   `InvoiceLineTotal` — „**Required for international shipments when using request
   *     option 'ratetimeintransit' or 'shoptimeintransit'.**" Iar valuta lui:
   *     „The Currency code **should match the origin country's or territory's currency
   *     code**, otherwise the currency code entered will be ignored." — adica RON
   *     pentru un expeditor roman, oricare ar fi tara de destinatie.
   *
   * ⚠ Si NU se trimit la emitere: acolo `InvoiceLineTotal` e „Required for forward
   * shipments whose origin is the US and destination is Puerto Rico or Canada. **Not
   * available for any other shipments.**"
   */
  if (eInternational) {
    expediere.ShipmentTotalWeight = {
      UnitOfMeasurement: { Code: "KGS", Description: "Kilograms" },
      Weight: greutateUps(date.greutateKg),
    };
    const valoare = Number(date.valoareComanda);
    expediere.InvoiceLineTotal = {
      CurrencyCode: taraExpeditor === "RO" ? "RON" : "EUR",
      /* „Valid values are from 1 to 99999999" — deci nu zero, si fara zecimale inutile. */
      MonetaryValue: String(Math.max(1, Math.round(valoare > 0 ? valoare : 1))),
    };
  }

  if (ramburs > 0) {
    /*
     * ⚠ La NIVEL DE EXPEDIERE, si NICIODATA impreuna cu `DeliveryConfirmation`:
     * „DeliveryConfirmation and COD are **mutually exclusive**" (scris de doua ori in
     * `Rating.yaml`, si — atentie — deloc in `Shipping.yaml`, care le-ar accepta pe
     * amandoua si ar cadea abia la ei). Noi nu trimitem `DeliveryConfirmation` nicaieri;
     * cine il adauga trebuie sa-l scoata cand rambursul e pornit.
     *
     * ⚠ Si la livrarea in PUNCT e alt container: `AccessPointCOD`, care nu poate fi
     * trimis impreuna cu `COD`. Vezi `containerRambursPunct`.
     */
    expediere.ShipmentServiceOptions = punct
      ? { AccessPointCOD: containerRambursPunct(ramburs, date.destinatar) }
      : { COD: containerRamburs(config, ramburs, date.destinatar) };
  }

  if (punct) {
    /* ⚠ „Alternate Delivery Address … required if ShipmentIndicationType is 01 or 02." */
    expediere.ShipmentIndicationType = [{ Code: "01" }];
    expediere.AlternateDeliveryAddress = { Address: adresaPunct(punct) };
  }

  return {
    RateRequest: {
      /*
       * ⚠ `SubVersion` deschide campuri, tacut: fara ea nu vin nici taxele defalcate
       * (`>= 1601`), nici `BaseServiceCharge` (`>= 1701`), nici `Zone` (`>= 2409`).
       * Raspunsul e tot 200, doar mai sarac.
       */
      Request: { SubVersion: SUBVERSIUNE_RATE },
      Shipment: expediere,
    },
  };
}

/** Adresa unui punct UPS, in forma lor. Nu e rezidentiala: e un magazin. */
function adresaPunct(p: PunctAles): AdresaUps {
  const linii = stripDiacritics(curata(p.adresa)).split(", ").filter(Boolean);
  const iesire: AdresaUps = {
    AddressLine: (linii.length > 0 ? linii : [stripDiacritics(curata(p.nume)) || "-"])
      .slice(0, LUNGIMI.liniiAdresa)
      .map((x) => x.slice(0, LUNGIMI.liniiAdresaLungime)),
    City: taie(stripDiacritics(p.oras), LUNGIMI.oras),
    CountryCode: "RO",
  };
  const cod = taie(p.codPostal, LUNGIMI.codPostal).replace(/\s+/g, "");
  if (cod) iesire.PostalCode = cod;
  return iesire;
}

/**
 * Containerul de ramburs.
 *
 * ⚠ VALUTA E A TARII DE DESTINATIE, si o spune chiar codul lor de eroare:
 * `120597 Invalid COD currency code. **Please use the destination country currency
 * code.**` Pentru RO→RO asta inseamna RON.
 *
 * ⚠ Iar `CODFundsCode` e cel de la NIVEL DE EXPEDIERE — vezi `FONDURI_RAMBURS` din
 * `client.ts`. La nivel de colet acelasi digit inseamna altceva.
 */
/**
 * Valuta rambursului: a TARII DE DESTINATIE, si numai cand o stim.
 *
 * ⚠ Regula e a lor, si o spune chiar codul lor de eroare: `120597 Invalid COD currency
 * code. **Please use the destination country currency code.**`
 *
 * ⚠ SI NU SE GHICESTE „EUR PENTRU RESTUL EUROPEI". Jumatate din Uniune nu foloseste
 * euro: Ungaria are forint, Polonia zlot, Cehia coroana, Bulgaria leva. O comanda cu
 * ramburs RO→HU trimisa in EUR cade cu chiar `120597` — iar mesajul nostru tradus l-ar
 * trimite pe comerciant pe o pista gresita, fiindca el vorbeste despre Romania.
 *
 * Deci se stie RON pentru Romania si valutele zonei euro; pentru orice altceva se
 * intoarce `null`, iar `lipsuriExpediere` opreste emiterea cu un mesaj limpede.
 */
const VALUTE_RAMBURS: Record<string, string> = {
  RO: "RON",
  /* Zona euro — singurele tari despre care putem afirma valuta fara sa ghicim. */
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR",
  DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR", LT: "EUR", LU: "EUR",
  MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR",
};

export function valutaRamburs(tara: string | null | undefined): string | null {
  const t = (curata(tara) || "RO").toUpperCase();
  return VALUTE_RAMBURS[t] ?? null;
}

function containerRamburs(config: UpsConfig, suma: number, destinatar: AdresaComanda) {
  return {
    CODFundsCode: (config.cod_funds_code ?? "").trim() || FONDURI_RAMBURS_IMPLICIT,
    CODAmount: {
      CurrencyCode: valutaRamburs(destinatar.tara) ?? "RON",
      MonetaryValue: suma.toFixed(2),
    },
  };
}

/**
 * ⚠ RAMBURSUL LA UN PUNCT ACCESS POINT E ALT CONTAINER, NU ACELASI.
 *
 * `AccessPointCOD`, verbatim: „Valid only for **„01 - Hold For Pickup At UPS Access
 * Point"** Shipment Indication type. Shipment Access Point COD is valid only for
 * countries or territories within E.U. **Not valid with (Shipment) COD.**"
 *
 * Deci pe o comanda cu ramburs livrata in punct, `COD` trimis in locul lui cade cu
 * `120556` / `120557` / `120568` — si comanda ramane fara transport, fiindca si lotul
 * o refuza.
 *
 * ⚠ Si are ALTA FORMA: `required: [CurrencyCode, MonetaryValue]`, **fara**
 * `CODFundsCode`. Copiat din celalalt container, campul in plus e cel mai bun candidat
 * la o eroare pe care n-o intelege nimeni.
 */
function containerRambursPunct(suma: number, destinatar: AdresaComanda) {
  return {
    CurrencyCode: valutaRamburs(destinatar.tara) ?? "RON",
    MonetaryValue: suma.toFixed(2),
  };
}

// ─── Corpul emiterii ─────────────────────────────────────────────────────────

/**
 * Corpul pentru `POST /api/shipments/{version}/ship`.
 *
 * ⚠ `LabelSpecification` sta la NIVEL DE RADACINA, langa `Shipment`, nu inauntru.
 *
 * ⚠ `Service.Code` PLEACA INTOTDEAUNA. Lipsa lui nu e o eroare la UPS — e o factura:
 * ghidul lor romanesc spune ca expedierea „se va efectua si factura automat prin UPS
 * Express", cel mai scump produs.
 *
 * ⚠ `LabelStockSize` se trimite chiar si pentru GIF. Schema il pune in
 * `required: [LabelImageFormat, LabelStockSize]`, desi descrierea lui spune ca e
 * „Valid for EPL2, ZPL and SPL Labels" — cele doua se contrazic, iar `required`
 * castiga: e verificat inainte sa se uite cineva la descriere.
 *
 * ⚠ `CharacterSet: "ron"` — „Romanian (Latin-2)". Implicitul lor e „English
 * (Latin-1)", in care diacriticele romanesti nu exista. Noi oricum trimitem text fara
 * diacritice, dar campul e gratis si acopera si ce trece prin alte cai.
 */
export function corpExpediere(config: UpsConfig, date: DateExpediere): Record<string, unknown> {
  const expeditor = expeditorCaAdresa(config);
  const cont = taie(config.account_number, LUNGIMI.contNumar);
  const d = dimensiuniColet(config);
  const referinta = curata(date.referinta);
  /*
   * ⚠ Rambursul intra in cerere DOAR daca comerciantul l-a lasat pornit.
   *
   * Nu e o dublare a lui `lipsuriExpediere`: acolo se OPRESTE emiterea, aici se
   * opreste CAMPUL. Trimis totusi pe un cont care nu suporta ramburs, el ar face
   * cotarea sa cada cu totul — deci comerciantul n-ar mai vedea niciun pret UPS,
   * in loc sa vada preturile fara ramburs si un mesaj limpede.
   */
  const ramburs = Number(date.ramburs) > 0 && config.ramburs_activ !== false ? Number(date.ramburs) : 0;
  const punct = date.punct ?? null;

  const taraExpeditor = (curata(expeditor.tara) || "RO").toUpperCase();
  const taraDestinatar = (curata(date.destinatar.tara) || "RO").toUpperCase();
  const eInternational = taraExpeditor !== taraDestinatar;

  const serviciu = codServiciu(date.serviceCode) ?? serviciulImplicit(taraExpeditor, taraDestinatar);

  const contactExpeditor = {
    Name: numeParte(expeditor),
    AttentionName: atentieParte(expeditor),
    ShipperNumber: cont,
    Phone: { Number: telefonUps(expeditor.telefon) },
    ...(curata(expeditor.email) ? { EMailAddress: taie(expeditor.email, LUNGIMI.email) } : {}),
    Address: adresaUps(expeditor, false),
  };

  const telefonClient = telefonUps(date.destinatar.telefon);
  const emailClient = taie(date.destinatar.email, LUNGIMI.email);

  const expediere: Record<string, unknown> = {
    Shipper: contactExpeditor,
    ShipTo: {
      Name: numeParte(date.destinatar),
      AttentionName: atentieParte(date.destinatar),
      ...(telefonClient ? { Phone: { Number: telefonClient } } : {}),
      ...(emailClient ? { EMailAddress: emailClient } : {}),
      Address: punct ? adresaPunct(punct) : adresaUps(date.destinatar, true),
    },
    ShipFrom: {
      Name: numeParte(expeditor),
      AttentionName: atentieParte(expeditor),
      Phone: { Number: telefonUps(expeditor.telefon) },
      Address: adresaUps(expeditor, false),
    },
    PaymentInformation: {
      /* ⚠ Numai `01`. Vezi nota din `corpTarife`. */
      ShipmentCharge: [{ Type: "01", BillShipper: { AccountNumber: cont } }],
    },
    Service: { Code: serviciu },
    /* „User can send up to 7 days in the future with current date as day zero. Format: YYYYMMDD" */
    ShipmentDate: date.dataExpedierii || ziuaUps(),
    Package: [{
      /* ⚠ `Packaging`, nu `PackagingType`. Vezi antetul. */
      Packaging: { Code: "02", Description: "Customer Supplied Package" },
      Dimensions: {
        UnitOfMeasurement: { Code: "CM", Description: "Centimeters" },
        Length: String(d.lungime),
        Width: String(d.latime),
        Height: String(d.inaltime),
      },
      PackageWeight: {
        UnitOfMeasurement: { Code: "KGS", Description: "Kilograms" },
        Weight: greutateUps(date.greutateKg),
      },
    }],
  };

  /*
   * ⚠ REFERINTA LA NIVEL DE EXPEDIERE. `Package.ReferenceNumber` e valid „if the
   * origin/destination pair is US/US or PR/PR" — deci pentru Romania se pierde tacut,
   * si odata cu ea singura cale de a afla printr-o citire daca AWB-ul s-a creat.
   *
   * ⚠ `Code` NU se trimite: e `minLength: 2, maxLength: 2`, iar tabelul din care ar
   * trebui ales („Refer to the Reference Number Code table") nu e publicat nicaieri.
   * Numai `Value` e in `required` — un cod inventat ar cadea cu `120506`.
   */
  if (referinta) {
    expediere.ReferenceNumber = [{ Value: referinta.slice(0, LUNGIMI.referinta) }];
  }

  const optiuni: Record<string, unknown> = {};

  if (ramburs > 0) {
    /*
     * ⚠ La NIVEL DE EXPEDIERE (vezi antetul lui `client.ts`) — SI in containerul
     * potrivit felului de livrare: la un punct Access Point rambursul se cere prin
     * `AccessPointCOD`, care e explicit „**Not valid with (Shipment) COD**".
     */
    if (punct) optiuni.AccessPointCOD = containerRambursPunct(ramburs, date.destinatar);
    else optiuni.COD = containerRamburs(config, ramburs, date.destinatar);
  }

  if (punct) {
    expediere.ShipmentIndicationType = [{ Code: "01" }];
    expediere.AlternateDeliveryAddress = {
      Name: taie(stripDiacritics(punct.nume), LUNGIMI.nume) || `Punct UPS ${punct.id}`,
      AttentionName: atentieParte(date.destinatar),
      ...(curata(punct.id) ? { UPSAccessPointID: curata(punct.id) } : {}),
      Address: adresaPunct(punct),
    };
    /*
     * ⚠ `012` — „Alternate Delivery Location Notification", si e OBLIGATORIE:
     * „ADL notification code (012) and notification data (email or phone number) is
     * required" (`120560`). Fara ea cumparatorul nici n-ar afla ca ii asteapta coletul
     * in punct.
     *
     * ⚠ Campul e declarat `maxLength: 1`, iar valoarea are trei caractere. E un defect
     * al schemei lor; exemplul lor oficial trimite tot `'012'`.
     *
     * ⚠⚠ SI `EMail` E IN `required`, nu doar „una dintre cele trei".
     * `ShipmentServiceOptions_Notification.required = [NotificationCode, EMail]`. Proza
     * lor spune „VoiceMessage phone number or TextMessage phone number **or** email
     * address is required", deci cele doua se contrazic — iar `required` castiga,
     * fiindca el se verifica inainte sa se uite cineva la proza. Prima varianta trimitea
     * DOAR `TextMessage` cand clientul n-avea email, si cererea ar fi cazut.
     *
     * De aia emailul e cerut in `lipsuriExpediere` pentru livrarile in punct, iar
     * telefonul pleaca in plus, ca a doua cale de instiintare.
     */
    const instiintare: Record<string, unknown> = { NotificationCode: "012" };
    if (emailClient) instiintare.EMail = { EMailAddress: [emailClient] };
    if (telefonClient) instiintare.TextMessage = { PhoneNumber: telefonClient };
    optiuni.Notification = [instiintare];
  }

  if (Object.keys(optiuni).length > 0) expediere.ShipmentServiceOptions = optiuni;

  if (config.tarife_negociate !== false) {
    expediere.ShipmentRatingOptions = { NegotiatedRatesIndicator: "Y" };
  }

  /*
   * Valoarea declarata la transport, cand comerciantul o cere.
   *
   * ⚠ E LA NIVEL DE COLET, singura optiune de asigurare din tot API-ul (nu exista
   * niciun `InsuredValue`). Si valuta se trimite explicit: implicitul lor e „the
   * non-Euro currency used in the shippers country", ceea ce pentru Romania chiar e
   * RON — dar e o deductie, si nu se scriu bani pe deductii.
   */
  if (config.valoare_declarata && Number(date.valoareComanda) > 0) {
    const colet = (expediere.Package as Record<string, unknown>[])[0];
    colet.PackageServiceOptions = {
      DeclaredValue: {
        /*
         * ⚠ VALUTA EXPEDITORULUI, nu a destinatarului — invers decat la ramburs.
         *
         * Verbatim: „Defaults to the non-Euro currency used in the shippers country or
         * territory. **Code must represent a currency that is a valid for Shipper
         * country or territory.**" Pus dupa destinatar, o comanda RO→DE de 500 lei ar
         * fi declarat 500 EUR — de cinci ori mai mult — iar taxa lor de valoare
         * declarata si despagubirea se calculeaza pe numarul ala.
         */
        CurrencyCode: valutaRamburs(taraExpeditor) ?? "RON",
        MonetaryValue: Number(date.valoareComanda).toFixed(2),
      },
    };
  }

  /*
   * ⚠ `Description` se cere DOAR uneori, si regula e lunga: „Required if all of the
   * listed conditions are true: ShipFrom and ShipTo countries … are not the same; The
   * packaging type is not UPS Letter; The ShipFrom and or ShipTo countries … are not
   * in the European Union **or** … are both in the European Union and the shipments
   * service type is not UPS Standard."
   *
   * Adica: intern nu se cere; RO→UE pe `11 UPS Standard` nu se cere; RO→UE pe orice
   * altceva se cere. Trimis unde nu trebuie e inofensiv, deci se trimite la orice
   * expediere externa.
   */
  if (eInternational) {
    expediere.Description = taie(
      stripDiacritics(date.continut || config.continut_implicit || "Bunuri de consum"),
      LUNGIMI.descriereExpediere,
    );
  }

  const format = config.format_eticheta ?? FORMAT_IMPLICIT;

  return {
    ShipmentRequest: {
      /*
       * `nonvalidate` — „No street level address validation would be performed, but
       * Postal Code/State combination validation would still be performed." Validarea
       * la nivel de strada e a bazei USPS si nu functioneaza pentru Romania.
       */
      /* ⚠ `SUBVERSIUNE_SHIP`, nu cea de la cotare: `2409` nu exista in lista lor de
         subversiuni pentru Ship. Vezi `client.ts`. */
      Request: { RequestOption: "nonvalidate", SubVersion: SUBVERSIUNE_SHIP },
      Shipment: expediere,
      /*
       * ⚠⚠ INAUNTRUL lui `ShipmentRequest`, langa `Request` si `Shipment`.
       *
       * `ShipmentRequest.properties` = `{Request, Shipment, LabelSpecification,
       * ReceiptSpecification}`, iar exemplele lor oficiale il pun la acelasi nivel cu
       * celelalte doua. Pus ca FRATE al lui `ShipmentRequest` — greseala usor de facut,
       * fiindca la FedEx `labelResponseOptions` chiar sta la radacina — UPS pur si
       * simplu nu-l vede: nu e in `required`, deci cererea NU cade. Se creeaza AWB-ul,
       * se factureaza, si raspunsul vine fara `ShippingLabel`. Comerciantul ramane cu
       * un colet pe care nu are ce lipi, iar reimprimarea (despre care propriul lor
       * ghid spune „ONLY Return Shipments support Label Recovery") nu-l salveaza.
       */
      LabelSpecification: {
        LabelImageFormat: { Code: format },
        /* ⚠ In INCH, si fara camp de unitate: „For IN, use whole inches." 4x6 e singura
           combinatie care se si tipareste — „Label Image will only scale up to 4 X 6". */
        LabelStockSize: { Height: "6", Width: "4" },
        /* ⚠ „ron = Romanian (Latin-2)". Implicitul e Latin-1, fara diacritice romanesti. */
        CharacterSet: "ron",
        /* „Required if … LabelImageFormat/Code = Gif. Default to Mozilla/4.5 …" */
        ...(format === "GIF" ? { HTTPUserAgent: "Mozilla/4.5" } : {}),
      },
    },
  };
}
