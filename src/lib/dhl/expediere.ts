import { normalizePhone } from "@/lib/utils/phone";
import { normalizeLocalityName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";
import {
  FORMAT_IMPLICIT, INCOTERM_IMPLICIT, SABLOANE, SABLON_IMPLICIT,
  momentExpedierii, ziuaDhl,
  type DhlConfig, type FormatEticheta,
} from "./client";
import { COD_RAMBURS, codProdus, codProdusLocal } from "./servicii";

/**
 * Traducerea unei comenzi Edinio in gramatica MyDHL API.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua, nu citeste din baza, nu vede `process.env`. Probele de langa
 * fisierul asta raman singura verificare care se poate face inainte de prima
 * credentiala reala de la consultantul DHL Express.
 *
 * ═══ ⚠ CE PEDEPSESTE DHL, SI CUM ═══
 *
 * Vestea buna intai, fiindca schimba felul in care se citeste tot fisierul: **DHL nu
 * are implicite tacute de unitate**. `unitOfMeasurement` e in `required` peste tot, cu
 * `enum: [metric, imperial]` si fara `default`, iar motorul lor are coduri proprii de
 * eroare pentru lipsa ei (`340017 The unit of weight is missing.`, `340028 The unit of
 * measure is missing.`). Nu se repeta nici defectul FedEx (unitate lipsa = TOL), nici
 * cel UPS (greutate fara unitate = LIVRE). Esecul e zgomotos.
 *
 * Ce ramane tacut e altceva, si e mai scump:
 *
 * **1. `dimensions` E OPTIONAL LA COLET.** `supermodelIoLogisticsExpressPackage` are
 * `required: ["weight"]`. Fara dimensiuni DHL nu poate calcula greutatea volumetrica,
 * deci coteaza pe greutatea reala si iti da un pret mic; apoi, verbatim din ghidul lor
 * romanesc: „Any piece in the shipment may be re-weighed and/or re-measured by DHL to
 * confirm this calculation" — si vine `Overweight Piece 470 lei` pe factura. Niciun
 * avertisment, nicio eroare. **Dimensiunile pleaca MEREU.**
 *
 * **2. `additionalProperties: false` PE FIECARE SCHEMA.** Un camp in plus nu e ignorat,
 * e 422. De aceea aici nu se „imbogateste" nimic din alte integrari: fiecare cheie de
 * mai jos a fost citita din `dhl-official.yaml` inainte de a fi scrisa.
 *
 * **3. `content.incoterm` E OBLIGATORIU SI PE O EXPEDIERE INTRA-UE NEDUTIABILA.** E in
 * `required: [packages, isCustomsDeclarable, description, incoterm, unitOfMeasurement]`.
 * ⚠ Si NU se pune `DDP` „ca sa fie sigur": DDP inseamna, verbatim din nomenclatorul lor,
 * ca vanzatorul „has an obligation to clear the goods not only for export but also for
 * import, to pay any duty for both export and import" — adica magazinul plateste taxele
 * vamale pe TOATE expedierile din afara Uniunii. Implicitul e `DAP`.
 *
 * **4. `phone` E IN `required` PE CONTACT, SI PENTRU DESTINATAR.**
 * `supermodelIoLogisticsExpressContact.required = [phone, companyName, fullName]`. La
 * UPS telefonul cumparatorului devenea obligatoriu abia la expedierile externe; aici o
 * comanda interna fara telefon cade cu 422. La fel `companyName`, pe care un cumparator
 * persoana fizica nu-l are — vezi `contactDhl`.
 *
 * **5. CODUL POSTAL ROMANESC ARE SASE CIFRE SI E CERUT.** Nomenclatorul lor
 * (`countryPostalcodeFormat`) da `999999 | 6 | RO | ROMANIA`, iar motorul raspunde
 * `420506 Postcode not found. Expected formats: <country specific post code format>`.
 * ⚠ Checkout-ul Edinio NU cere cod postal la comenzile interne (memoria
 * `cod-postal-lipsa-in-checkout`), deci lipsa lui e o stare NORMALA aici, nu o
 * exceptie — si de aceea are un motiv propriu, `LIPSA_COD_POSTAL`, pe care apelantul
 * il poate deosebi de restul lipsurilor.
 *
 * **6. RAMBURSUL NU EXISTA, DECI NICI CAMPUL PENTRU EL.** `DateExpediere` nu are
 * `ramburs`, si nu e o scapare: DHL Express nu vinde plata la livrare cu origine
 * Romania (vezi nota lunga de la `COD_RAMBURS` din `servicii.ts`). Comenzile cu ramburs
 * nu ajung pana aici — DHL dispare din checkout, ca la FedEx. Textul care se arata e
 * `AVERTISMENT_RAMBURS`.
 *
 * ═══ ⚠ SI DOUA CAPCANE DE TRANSCRIERE ═══
 *
 * `encodingFormat` are enumerarea `[pdf, zpl, lp2, epl]` — **`epl`, nu `epl2`**, desi
 * nomenclatorul lor de sabloane scrie `EPL2` in coloana `imageFormat`. Vezi `FORMATE_DHL`.
 *
 * Iar in SOAP unitatile se numesc `SI`/`SU`; in REST valorile alea sunt invalide. Un
 * exemplu copiat din ghidul lor de 473 de pagini cade la validare.
 */

// ─── Tipurile de intrare ─────────────────────────────────────────────────────

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

/**
 * Un articol din comanda, asa cum il cere declaratia vamala.
 *
 * ⚠ Exista DOAR pentru destinatiile din afara uniunii vamale. Pentru RO→UE nu se
 * trimite `exportDeclaration` deloc, deci campurile astea raman neatinse.
 *
 * ⚠ `codVamal` (codul HS) NU e in `required` la ei — o expediere vamala fara el trece
 * de schema, trece de `tsc`, trece de probe. Vama nu trece. Vezi `LIPSA_COD_VAMAL`.
 */
export type ArticolVamal = {
  descriere: string;
  cantitate: number;
  /** Pret UNITAR, nu pe linie. DHL inmulteste singur: „Please provide unit or article price". */
  pretUnitar: number;
  /** Greutatea liniei, in kilograme. Cand lipseste se imparte greutatea coletului. */
  greutateKg?: number | null;
  /** Codul HS (`commodityCodes[].value`, 2-18 caractere). */
  codVamal?: string | null;
  /** `manufacturerCountry`: unde a fost FABRICAT, nu de unde se expediaza. */
  taraOrigine?: string | null;
};

export type DateExpediere = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string;
  valoareComanda?: number;
  /** `productCode` GLOBAL, copiat din oferta aleasa. Vezi `produsImplicit` cand lipseste. */
  productCode?: string | null;
  /** ⚠ NU se compune niciodata; se copiaza literal din cotare. Vezi `codProdusLocal`. */
  localProductCode?: string | null;
  /** Referinta noastra, `EDN-xxxx-000123`. Vezi `referintaComenzii`. */
  referinta?: string;
  dataExpedierii?: Date;
  /** Suma asigurata, cand comerciantul a pornit asigurarea (serviciul lor `II`). */
  asigurare?: number | null;
  /**
   * Articolele comenzii, pentru declaratia vamala.
   *
   * ⚠ Camp adaugat fata de tiparul UPS, si e obligatoriu in fapt pentru orice
   * destinatie din afara uniunii vamale: fara el nu se poate compune un
   * `exportDeclaration.lineItems[]` onest, iar `lipsuriExpediere` opreste emiterea.
   */
  articole?: ArticolVamal[];
};

/**
 * Ce lipseste ca sa se poata emite — si cine e de vina.
 *
 * Se intorc DOUA liste, dinadins: la SmartShip alerta din checkout dadea vina pe
 * magazin si pentru o adresa incompleta a clientului, iar comerciantul cauta degeaba o
 * gresala in configurare.
 */
export type Lipsuri = {
  /** Ce trebuie sa repare COMERCIANTUL in configurarea DHL. */
  configurare: string[];
  /** Ce lipseste din COMANDA (adresa clientului, greutate, date vamale). */
  comanda: string[];
};

// ─── Plafoane ────────────────────────────────────────────────────────────────

/**
 * Lungimile, transcrise din `dhl-official.yaml`.
 *
 * ⚠ Ghidul lor SOAP da ACELEASI valori pe contact (`PersonName M AN 255`,
 * `CompanyName M AN 100`, `PhoneNumber M AN 70`, `EmailAddress O AN 70`), deci aici nu
 * exista conflictul „Rating mai ingaduitor decat Shipping" de la UPS. Singurul camp cu
 * doua latimi e emailul: 70 pe contact, dar **50** pe instiintarea catre destinatar.
 */
export const LUNGIMI = {
  /** `contactInformation.fullName`. */
  nume: 255,
  /** `contactInformation.companyName`. */
  companie: 100,
  /** `postalAddress.cityName`. */
  oras: 45,
  /** `postalAddress.countyName`. ⚠ E „suburb or county", nu judetul romanesc. Vezi `judetDhl`. */
  judet: 45,
  /** `postalAddress.postalCode`. `minLength: 0`, dar cheia e in `required`. */
  codPostal: 12,
  telefon: 70,
  email: 70,
  /** ⚠ `shipmentNotification[].receiverId` are 50, nu 70. Acelasi email, alta latime. */
  emailInstiintare: 50,
  /** `addressLine1..3`. Trei linii, si atat. */
  liniiAdresa: 3,
  /** ⚠ 45 de FIECARE, nu 45 in total. Nu exista concatenare automata la ei. */
  liniiAdresaLungime: 45,
  /** `customerReferences[].value`. */
  referinta: 35,
  /** `content.description`. ⚠ Are si `pattern: '^[^\s]'` — nu poate incepe cu spatiu. */
  descriere: 70,
  /** `packages[].description`. */
  descriereColet: 70,
  /** `exportDeclaration.lineItems[].description`. */
  descriereArticol: 512,
} as const;

/**
 * ⚠ Greutatea minima. Schema zice `minimum: 0.001` (un gram), ghidul lor spune altceva,
 * verbatim: „**Minimum allowed weight is 0.1kg** – please see your DHL Account rate card".
 * Un colet de 0,05 kg trece validarea JSON si cade la motor cu `410117 The minimum piece
 * weight not met`. Se impune 0,1 aici. Aceeasi valoare ca in `lib/shipping/awb-weight.ts`.
 */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * ⚠ Greutatea maxima pe COLET, si e cea COMERCIALA, nu cea tehnica.
 *
 * Nomenclatorul lor da pentru `P` (Express Worldwide) `shipmentMaximumWeight: 3030.000`.
 * Ghidul de Servicii si Tarife 2026: Romania da, in tabelul „Our international services
 * at a glance", „Maximum piece weight (not on pallet) **70kg**" pe toate cele patru
 * produse internationale. Cifrele din nomenclator sunt maximele TEHNICE ale retelei
 * globale; cele din ghid sunt limitele CONTRACTUALE romanesti. Validarea foloseste
 * ghidul: pe cifrele tehnice treci de API si esuezi la depozit.
 */
export const GREUTATE_MAXIMA_KG = 70;

/**
 * Greutatea maxima pe EXPEDIERE.
 *
 * ⚠ Difera pe produs — Express Worldwide 3.000 kg, Economy Select 1.000, Express 12:00
 * 300, Express 9:00 250. Se ia 1.000 fiindca e si plafonul absolut de PIESA din nota lor
 * de subsol, verbatim: „DHL Express does not accept shipments exceeding 3,000kg, or
 * containing pieces exceeding **1,000kg** or 300cm in length". Noi trimitem un singur
 * colet pe expediere, deci pragul de piesa e cel care leaga.
 */
export const GREUTATE_MAXIMA_EXPEDIERE_KG = 1000;

/**
 * ⚠ CINCI MII, NU SASE MII.
 *
 * Verbatim din ghidul romanesc, editia RO: „inmultiti lungimea cu inaltimea cu latimea
 * in centimetri, apoi **impartiti totalul la 5 000** pentru fiecare piesa"; editia EN:
 * „then divide the total sum by **5,000** for each piece in the shipment". Divizorul
 * 6000 (folosit de alti curieri) ar subdeclara volumetricul cu 20% si ar ascunde exact
 * suprataxa de „Overweight Piece".
 */
export const DIVIZOR_VOLUMETRIC = 5000;

/**
 * ⚠ Latura maxima, din acelasi tabel: „Maximum piece dimensions (L x W x H)
 * **120 x 80 x 80cm**".
 *
 * Constanta e o singura cifra fiindca aici se face doar limitarea de siguranta a
 * dimensiunilor din configurare. Regula ADEVARATA e pe triplet (120/80/80) si se
 * verifica separat, cu `depasesteDimensiunileComerciale` — o cutie de 120x120x120 trece
 * de plafonul asta si cade la ei.
 */
export const DIMENSIUNE_MAXIMA_CM = 120;

/**
 * Dimensiunile implicite, in CENTIMETRI.
 *
 * Aceleasi valori ca la Shipo, FedEx si UPS, ca sa nu apara patru implicite in
 * platforma. ⚠ Nu sunt decor: DHL factureaza pe maximul dintre greutatea fizica si cea
 * volumetrica, deci dimensiuni prea mari scumpesc fiecare colet.
 */
export const DIMENSIUNI_IMPLICITE = { lungime: 30, latime: 20, inaltime: 10 } as const;

/**
 * ⚠ Praguri de SUPRATAXA, nu de refuz. Transcrise din ghidul romanesc.
 *
 * „Overweight Piece — A fixed surcharge is applied to every piece, including a pallet,
 * that exceeds a **scale or volumetric** weight of 70kg." (International 470 lei,
 * Domestic 248 lei.) ⚠ „scale OR volumetric" e partea care se rateaza: un colet usor dar
 * mare — 100x80x50 cm inseamna 80 kg volumetric — ia suprataxa desi cantareste 12 kg.
 */
export const PRAG_SUPRATAXA_GREUTATE_KG = 70;

/**
 * ⚠ „Oversize Piece — This fixed surcharge applies to every piece, including a pallet,
 * with a **single dimension in excess of 100cm**. Does not apply to pieces already
 * subject to Overweight Piece surcharge." (International 100 lei, Domestic 60 lei.)
 */
export const PRAG_SUPRATAXA_DIMENSIUNE_CM = 100;

/**
 * ⚠ „Non-Conveyable Piece — This surcharge applies to any piece within a shipment with
 * an **actual weight between 25kg and 70kg**. Does not apply to pieces already subject
 * to the Overweight or Oversize Piece Surcharges." Aici pragul e pe greutatea REALA,
 * spre deosebire de „Overweight", care se uita la maximul dintre reala si volumetrica.
 */
export const PRAG_NECONVENABIL_KG = 25;

/**
 * Ce se arata cand comanda are plata la livrare.
 *
 * ⚠ Nu e un avertisment de politete: DHL Express nu vinde ramburs cu origine Romania,
 * verificat in patru feluri independente (vezi `COD_RAMBURS` din `servicii.ts`). Trimis
 * totusi, `KB` nu cade la cotare, ci la EMITERE, cu `7008 The requested Special Service
 * Code … is not available between this origin and destination` — adica dupa ce
 * cumparatorul a comandat si a asteptat.
 */
export const AVERTISMENT_RAMBURS =
  "DHL Express nu ofera plata la livrare pentru expedierile din Romania, asa ca nu apare "
  + "ca optiune pe comenzile cu ramburs. Pentru comenzile platite in avans ramane disponibil.";

// ─── Text ────────────────────────────────────────────────────────────────────

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function taie(text: string | null | undefined, max: number): string {
  return curata(text).slice(0, max).trim();
}

/** Curatat, fara diacritice si taiat. Tot ce pleaca spre ei trece pe aici. */
function text(brut: string | null | undefined, max: number): string {
  return taie(stripDiacritics(curata(brut)), max);
}

// ─── Adresa ──────────────────────────────────────────────────────────────────

/**
 * Adresa, impartita in cel mult 3 linii de cel mult 45 de caractere.
 *
 * ⚠ SE IMPARTE, NU SE TRUNCHIAZA. Cele trei linii au FIECARE `maxLength: 45`, nu 45 in
 * total, si nu exista concatenare automata la ei: o adresa romaneasca intreaga pusa pe
 * un singur rand ajunge la curier fara bloc, scara si apartament, iar coletul se
 * intoarce.
 *
 * ⚠ SI FARA DIACRITICE, desi DHL nu o cere. Cautat in toata specificatia lor: nu exista
 * niciun `pattern`, `charset` sau lista de caractere permise pe vreun camp de adresa sau
 * de contact — ba chiar propriul lor exemplu contine o virgula chinezeasca full-width
 * (`WEIPINHUI WULIU YUAN，DAWANG`). Singurul semnal contrar e `getTransliteratedResponse`,
 * care insa afecteaza numai RASPUNSUL („response will return transliterated text"), nu
 * eticheta, si e un avertisment tacut pe tarile nesuportate (`7994 Transliteration texts
 * is not supported for the requested Shipper's Country Code`), cu lista tarilor
 * nepublicata. Deci: normalizam noi, ca la ceilalti cincisprezece curieri, si etichetele
 * ies deterministe.
 */
export function liniiAdresa(
  a: Pick<AdresaComanda, "strada" | "numar" | "bloc" | "scara" | "etaj" | "apartament">,
): string[] {
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
 * ⚠ BUCURESTI: DHL INTRA IN TABARA CEA MARE.
 *
 * Regula proiectului (vezi `bucuresti-pe-curieri.test.ts` si memoria
 * `sameday-audit-2026-07`): Sameday si eColet vor `Sector 3` in campul de localitate,
 * ceilalti vor `Bucuresti`. Cine le uniformizeaza rupe zece curieri tacut.
 *
 * DHL sta cu cei multi, si sunt trei dovezi independente:
 *   1. „sector" are ZERO aparitii in toata specificatia lor de 1,2 MB.
 *   2. Nomenclatorul lor de tari da pentru RO `divisionTypeCode = O`, adica
 *      „Country-use when no divtype identif" — Romania n-are, la ei, nicio diviziune
 *      administrativa declarata. (Austria, pentru comparatie, are `X MIGRATION`.)
 *   3. Propria lor adresa din ghid e „Calea Floreasca 169A, Corp A, Etaj 8, Bucharest",
 *      fara sector.
 *
 * ⚠ FALSUL PRIETEN: codul lor de eroare `201200 Either pickup route or sector should be
 * present` vorbeste despre sectorul INTERN de rutare al curierului, nu despre sectoarele
 * bucurestene. Cine il citeste altfel ajunge sa trimita „Sector 3" in `cityName` si sa
 * strice zonarea.
 */
export function orasDhl(oras: string, judet?: string | null): string {
  return text(normalizeLocalityName(oras ?? "", judet ?? undefined), LUNGIMI.oras);
}

/** Sectorul, ca text de pus pe adresa. `null` cand adresa nu e din Bucuresti. */
export function sectorPentruAdresa(a: Pick<AdresaComanda, "oras" | "judet">): string | null {
  const n = sectorBucuresti(a.oras) ?? sectorBucuresti(a.judet);
  return n ? `Sector ${n}` : null;
}

/**
 * `countyName`, si de ce NU e judetul romanesc.
 *
 * ⚠ Campul lor se numeste, verbatim, „Please enter your **suburb or county** name", iar
 * codul de eroare care il descrie vorbeste tot despre cartier: `340004 The location
 * information is missing. At least one attribute post code, city name or **suburb name**
 * should be provided`. La DHL nivelul asta e sub oras, nu peste. „Cluj" pus aici nu e o
 * informatie in plus, e o informatie GRESITA — iar motorul lor nu cade, ci aplica tacut
 * o regula de rezerva (`410502-410515 Pickup/Delivery PL fallback rule applied:
 * PS->CP->P->C`) si intoarce 200 cu alta zona si alt pret.
 *
 * Deci pentru Romania pleaca DOAR sectorul bucurestean, care chiar e o subdiviziune de
 * oras. Pentru restul tarii, nimic — functia asta e regula ROMANEASCA.
 *
 * ⚠ Adresele din alte tari nu trec pe aici: acolo `countyName` poarta judetul/statul
 * scris de cumparator, fiindca `provinceCode` nu se trimite niciodata si fara el
 * „Sydney, NSW" ar ajunge la ei doar ca „Sydney". Vezi `adresaDhl`.
 */
export function judetDhl(a: Pick<AdresaComanda, "oras" | "judet">): string | null {
  return sectorPentruAdresa(a);
}

/**
 * Telefonul, in forma pe care o accepta DHL.
 *
 * ⚠ Aici NU e ca la UPS. UPS spune raspicat „Valid values are 0 - 9" si respinge semnul
 * plus; DHL nu impune niciun format (`minLength: 1, maxLength: 70`, fara `pattern`), iar
 * propriul lor exemplu e `'+1123456789'`. Deci prefixul international pleaca cu plus cu
 * tot: pentru un curier care poate suna dintr-o alta tara, `0712345678` e ambiguu.
 *
 * `normalizePhone` aduce numerele romanesti la forma locala `07…`; aici li se pune
 * `+40` in fata. Numerele straine isi pastreaza forma `+49…`.
 */
export function telefonDhl(brut: string | null | undefined): string {
  const normalizat = normalizePhone(brut ?? "");
  if (!normalizat) return "";
  if (normalizat.startsWith("+")) return normalizat.slice(0, LUNGIMI.telefon);
  const cifre = normalizat.replace(/\D/g, "");
  if (!cifre) return "";
  /* `07…` → `+407…`. Un numar care nu incepe cu 0 se ia ca fiind deja international. */
  const cuPrefix = cifre.startsWith("0") ? `+40${cifre.slice(1)}` : `+${cifre}`;
  return cuPrefix.slice(0, LUNGIMI.telefon);
}

/**
 * Codul postal, validat pe formatul TARII.
 *
 * ⚠ Pentru Romania sunt EXACT sase cifre, si e afirmatia lor, nu a noastra:
 * nomenclatorul `countryPostalcodeFormat` da randul `999999 | 6 | RO | ROMANIA`, iar
 * `RO` are `postalLocationTypeCode = CP` („City Postcode"). Romania NU figureaza in
 * lista lor „COUNTRY WITH NO POSTAL CODE".
 *
 * ⚠ Ce se intampla cu un cod gresit: `420506 Postcode not found. Expected formats:
 * <country specific post code format>`. Nu e ignorat, cade cotarea. De aceea aici se
 * intoarce sirul GOL cand nu iese formatul — un cod partial trimis mai departe ar fi
 * cazut la ei, unde mesajul nu spune al cui e codul.
 *
 * ⚠ Iar cheia `postalCode` pleaca MEREU, chiar si goala: e in `required` pe amandoua
 * schemele de adresa, dar cu `minLength: 0`. Omisa, cererea cade cu eroare de schema;
 * goala, cade abia la motor — si numai pentru tarile care chiar au coduri postale.
 */
export function codPostalDhl(brut: string | null | undefined, tara?: string | null): string {
  const t = (curata(tara) || "RO").toUpperCase();
  const brutCurat = curata(brut);
  if (!brutCurat) return "";

  if (t === "RO") {
    const cifre = brutCurat.replace(/\D/g, "");
    return cifre.length === 6 ? cifre : "";
  }

  /* Pentru restul lumii n-avem formatul lor, deci se curata si atat: majuscule, un
     singur spatiu (Olanda „1234 AB", Marea Britanie „SW1A 1AA"), fara alte semne. */
  return stripDiacritics(brutCurat)
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LUNGIMI.codPostal);
}

/**
 * Referinta noastra pe expedierea DHL.
 *
 * ⚠⚠ E SINGURA PLASA DE SIGURANTA A INTEGRARII, si asta o face mai importanta decat la
 * oricare dintre ceilalti cincisprezece curieri.
 *
 * `POST /shipments` NU are idempotenta: „idempot" are ZERO potriviri in OpenAPI-ul de
 * 1,2 MB, in ghidul SOAP de 473 de pagini si in ghidul de date de referinta. Nu exista
 * antet de deduplicare si nu exista eroare „shipment already exists". Iar
 * `Message-Reference` nu tine loc: ghidul lor spune verbatim ca e „not required to be
 * unique between requests". Singurul drum inapoi dupa un raspuns pierdut e
 * `GET /tracking?shipmentReference=<asta>&shipmentReferenceType=CU`.
 *
 * ⚠ CELE PATRU CARACTERE DIN `businessId` NU SUNT ORNAMENT. `order_number` are
 * `UNIQUE (business_id, order_number)` si contorul reporneste la #0001 pe fiecare
 * magazin, iar cautarea dupa referinta se face pe CONT. Doua magazine care folosesc
 * acelasi cont DHL si-ar citi comenzile unul altuia, iar recuperarea ar adopta AWB-ul
 * altui magazin pe comanda gresita. Aceeasi lectie ca la FedEx, UPS, SmartShip si BT iPay.
 */
export function referintaComenzii(businessId: string, orderNumber: string | number): string {
  const magazin = (businessId ?? "").replace(/-/g, "").slice(0, 4).toUpperCase();
  const comanda = String(orderNumber ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 20);
  return `EDN-${magazin}-${comanda}`.slice(0, LUNGIMI.referinta);
}

// ─── Greutati si dimensiuni ──────────────────────────────────────────────────

/** O latura, in centimetri intregi, incadrata in plafonul comercial. */
function latura(v: number | undefined, implicit: number): number {
  const n = Number(v) > 0 ? Number(v) : implicit;
  /* ⚠ Se rotunjeste IN SUS: o rotunjire in jos subdeclara coletul, iar DHL il remasoara. */
  return Math.min(DIMENSIUNE_MAXIMA_CM, Math.max(1, Math.ceil(n)));
}

/** Dimensiunile coletului din configurare, gata verificate. */
export function dimensiuniColet(config: Pick<DhlConfig, "lungime_cm" | "latime_cm" | "inaltime_cm">) {
  return {
    lungime: latura(config.lungime_cm, DIMENSIUNI_IMPLICITE.lungime),
    latime: latura(config.latime_cm, DIMENSIUNI_IMPLICITE.latime),
    inaltime: latura(config.inaltime_cm, DIMENSIUNI_IMPLICITE.inaltime),
  };
}

/** Greutatea volumetrica, in kilograme. `L * l * h / 5000`. Vezi `DIVIZOR_VOLUMETRIC`. */
export function greutateVolumetrica(d: { lungime: number; latime: number; inaltime: number }): number {
  const v = (Number(d.lungime) * Number(d.latime) * Number(d.inaltime)) / DIVIZOR_VOLUMETRIC;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : 0;
}

/**
 * Greutatea taxabila: maximul dintre cea reala si cea volumetrica.
 *
 * ⚠ Nu se rotunjeste aici, dinadins. Ei factureaza rotunjit („Rates are rounded up to
 * the nearest 1kg for shipments up to 70kg, and to the nearest 5kg thereafter"), dar
 * numarul asta e folosit ca sa se afle daca se DEPASESTE un prag de suprataxa — iar o
 * rotunjire proprie ar muta pragul si ar produce un avertisment mincinos.
 */
export function greutateTaxabila(
  realKg: number,
  d: { lungime: number; latime: number; inaltime: number },
): number {
  const real = Number(realKg) > 0 ? Number(realKg) : 0;
  return Math.max(real, greutateVolumetrica(d));
}

/**
 * ⚠ Regula de dimensiuni e pe TRIPLET, nu pe o singura cifra.
 *
 * Ghidul romanesc da „Maximum piece dimensions (L x W x H) **120 x 80 x 80cm**". O cutie
 * de 100x100x100 are toate laturile sub 120 si totusi nu incape: se compara laturile
 * sortate descrescator cu `[120, 80, 80]`, fiindca orientarea coletului nu conteaza.
 */
export function depasesteDimensiunileComerciale(
  d: { lungime: number; latime: number; inaltime: number },
): boolean {
  const ale = [Number(d.lungime), Number(d.latime), Number(d.inaltime)].sort((x, y) => y - x);
  const lor = [120, 80, 80];
  return ale.some((v, i) => v > lor[i]);
}

/**
 * Suprataxele pe care le va lua coletul, spuse INAINTE de emitere.
 *
 * ⚠ NU intra in `lipsuriExpediere`, si asta e o hotarare. Lista aia e o POARTA: tot ce
 * intra in ea opreste emiterea. O suprataxa nu opreste nimic — coletul pleaca, doar
 * costa mai mult. Amestecate, un colet de 30 kg perfect legal ar fi disparut din
 * checkout. Se intorc separat, ca sa le poata arata interfata.
 *
 * ⚠ Ordinea de excludere e a LOR, transcrisa din ghid: „Oversize … does not apply to
 * pieces already subject to Overweight Piece surcharge", „Non-Conveyable … does not
 * apply to pieces already subject to the Overweight or Oversize Piece Surcharges".
 */
export function avertismenteColet(
  realKg: number,
  d: { lungime: number; latime: number; inaltime: number },
): string[] {
  const avertismente: string[] = [];
  const real = Number(realKg) > 0 ? Number(realKg) : 0;
  const taxabila = greutateTaxabila(real, d);
  const laturaMaxima = Math.max(Number(d.lungime), Number(d.latime), Number(d.inaltime));

  const supraponderal = taxabila > PRAG_SUPRATAXA_GREUTATE_KG;
  const supradimensionat = !supraponderal && laturaMaxima > PRAG_SUPRATAXA_DIMENSIUNE_CM;

  if (supraponderal) {
    avertismente.push(
      `DHL taxeaza suplimentar coletele peste ${PRAG_SUPRATAXA_GREUTATE_KG} kg („Overweight Piece”). `
      + `Aici greutatea taxabila e ${taxabila.toFixed(1)} kg `
      + `(reala ${real.toFixed(1)} kg, volumetrica ${greutateVolumetrica(d).toFixed(1)} kg).`,
    );
  } else if (supradimensionat) {
    avertismente.push(
      `O latura de ${Math.round(laturaMaxima)} cm depaseste ${PRAG_SUPRATAXA_DIMENSIUNE_CM} cm, `
      + "deci DHL adauga suprataxa de colet supradimensionat („Oversize Piece”).",
    );
  } else if (real >= PRAG_NECONVENABIL_KG && real <= PRAG_SUPRATAXA_GREUTATE_KG) {
    avertismente.push(
      `Coletele intre ${PRAG_NECONVENABIL_KG} si ${PRAG_SUPRATAXA_GREUTATE_KG} kg primesc la DHL `
      + "suprataxa de sortare manuala („Non-Conveyable Piece”).",
    );
  }

  if (depasesteDimensiunileComerciale(d)) {
    avertismente.push(
      "Coletul depaseste dimensiunea maxima din contractul romanesc DHL (120 x 80 x 80 cm). "
      + "Poate fi refuzat la preluare.",
    );
  }

  return avertismente;
}

// ─── Vama ────────────────────────────────────────────────────────────────────

/**
 * Uniunea vamala, ca liste de coduri ISO.
 *
 * ⚠ DHL NU ENUNTA REGULA ASTA NICAIERI. `isCustomsDeclarable` e descris doar ca „please
 * advise if your shipment is dutiable (true) or non dutiable (false)" — cine hotaraste
 * si dupa ce criteriu nu scrie in niciuna dintre cele patru surse. Regula de mai jos e
 * regimul vamal al Uniunii Europene, nu o afirmatie a lor, si se scrie ca atare.
 */
const UNIUNE: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/**
 * ⚠⚠ TERITORIILE CARE POARTA COD DE STAT MEMBRU SI SUNT IN AFARA UNIUNII VAMALE.
 *
 * Asta e capcana pe care o regula naiva `UNIUNE.has(tara)` o rateaza intreaga. Insulele
 * Canare, Ceuta, Melilla, Alandul, Livigno, Muntele Athos, Helgoland si Büsingen au cod
 * ISO de stat membru — `ES`, `FI`, `IT`, `GR`, `DE` — dar coletul catre ele are nevoie
 * de declaratie vamala. Trimis ca intra-UE, se opreste in vama si nimeni nu intelege de ce.
 *
 * ⚠ CE ACOPERIM SI CE NU. Din codul de tara SINGUR nu se pot deosebi: `ES` e si Madrid,
 * si Tenerife. Se pot deosebi insa din CODUL POSTAL, care e obligatoriu la ei oricum —
 * de aceea `eVamal` (care primeste doar tari) ramane orb la ele si o spune, iar corpurile
 * cererilor folosesc `eVamalPeAdresa`, care se uita si la cod. Ce NU acoperim: adresele
 * din teritoriile astea in care cumparatorul a scris alt cod postal sau niciunul.
 *
 * ⚠ Teritoriile care au COD ISO PROPRIU (`GF`, `GP`, `MQ`, `RE`, `YT`, `GL`, `FO`, `AW`,
 * `CW`, `SX`, `PM`, `BL`, `NC`, `PF`, `WF`) nu au nevoie de tabelul asta: nefiind in
 * `UNIUNE`, ies vamale din oficiu. Indiciu ca si DHL le trateaza asa: ghidul lor de date
 * de referinta 3.3.1 a adaugat „registration number type code of ‘EOR' for country ‘GF',
 * ‘GP', ‘MQ', ‘RE', ‘YT'" — EORI e numarul de operator economic, adica exact ce se cere
 * la o formalitate vamala.
 */
const TERITORII_SPECIALE: { tara: string; prefixe: string[]; nume: string }[] = [
  { tara: "ES", prefixe: ["35", "38"], nume: "Insulele Canare" },
  { tara: "ES", prefixe: ["51"], nume: "Ceuta" },
  { tara: "ES", prefixe: ["52"], nume: "Melilla" },
  { tara: "FI", prefixe: ["22"], nume: "Insulele Aland" },
  /* ⚠ Livigno e in afara teritoriului vamal; Campione d'Italia a INTRAT in el la
     1 ianuarie 2020, dar a ramas in afara zonei de TVA. Se pastreaza amandoua: o
     declaratie in plus e o hartie, una in minus e un colet blocat. */
  { tara: "IT", prefixe: ["23041"], nume: "Livigno" },
  { tara: "IT", prefixe: ["22061"], nume: "Campione d'Italia" },
  { tara: "GR", prefixe: ["63086", "63087"], nume: "Muntele Athos" },
  { tara: "DE", prefixe: ["27498"], nume: "Helgoland" },
  { tara: "DE", prefixe: ["78266"], nume: "Büsingen" },
];

/**
 * Teritoriul special in care cade adresa, sau `null`.
 *
 * Se compara pe codul postal NORMALIZAT (`codPostalDhl`), nu pe ce a scris omul.
 */
export function teritoriuSpecial(tara: string | null | undefined, codPostal: string | null | undefined): string | null {
  const t = (curata(tara) || "RO").toUpperCase();
  const cod = codPostalDhl(codPostal, t).replace(/\s+/g, "");
  if (!cod) return null;
  for (const zona of TERITORII_SPECIALE) {
    if (zona.tara !== t) continue;
    if (zona.prefixe.some((p) => cod.startsWith(p))) return zona.nume;
  }
  return null;
}

/**
 * Are expedierea nevoie de declaratie vamala?
 *
 * RO → stat membru UE  = `false`, si atunci `exportDeclaration` NU se trimite deloc.
 * RO → orice altceva   = `true`, si atunci declaratia trebuie sa fie completa.
 *
 * ⚠ Semnatura primeste doar tari, deci nu poate vedea teritoriile speciale de mai sus
 * (Canare, Ceuta, Aland, Livigno, Athos, Helgoland, Büsingen). Pentru o hotarare corecta
 * pe o adresa reala se foloseste `eVamalPeAdresa`.
 */
export function eVamal(
  taraExpeditor: string | null | undefined,
  taraDestinatar: string | null | undefined,
): boolean {
  const de = (curata(taraExpeditor) || "RO").toUpperCase();
  const la = (curata(taraDestinatar) || "RO").toUpperCase();
  if (de === la) return false;
  return !(UNIUNE.has(de) && UNIUNE.has(la));
}

/** `eVamal`, dar cu teritoriile speciale prinse dupa codul postal. */
export function eVamalPeAdresa(expeditor: AdresaComanda, destinatar: AdresaComanda): boolean {
  if (eVamal(expeditor.tara, destinatar.tara)) return true;
  return (
    teritoriuSpecial(destinatar.tara, destinatar.codPostal) !== null
    || teritoriuSpecial(expeditor.tara, expeditor.codPostal) !== null
  );
}

// ─── Partile, in forma lor ───────────────────────────────────────────────────

/** Expeditorul din configurare, adus la forma unei adrese de comanda. */
export function expeditorCaAdresa(config: DhlConfig): AdresaComanda {
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

/**
 * Adresa unei parti, in forma lor.
 *
 * ⚠ Cheile de aici sunt INTERSECTIA celor doua scheme de adresa ale lor:
 * `…AddressCreateShipmentRequest` (care are in plus `provinceName` si `countryName`) si
 * `…AddressRatesRequest` (care nu le are). Amandoua sunt `additionalProperties: false`,
 * deci acelasi obiect trebuie sa treaca prin amandoua — un camp in plus la cotare ar da
 * 422 exact pe drumul care aduce preturile in checkout.
 *
 * ⚠ `provinceCode` NU PLEACA NICIODATA. Schema il descrie „province or state code", iar
 * ghidul lor SOAP e mai limpede: „2 letter state code for the USA only". Pentru Romania
 * n-ar avea ce purta (`divisionTypeCode = O`, adica nicio diviziune declarata), iar
 * `minLength: 2` inseamna ca un cod de o litera e respins din start.
 *
 * ⚠ `addressLine1` are `minLength: 1` si e in `required` la emitere. O adresa goala nu
 * poate pleca goala, deci se pune „-" — cade la ei, dar cu un mesaj de adresa, nu cu o
 * eroare de schema pe care n-o intelege nimeni.
 */
export function adresaDhl(a: AdresaComanda): {
  postalCode: string;
  cityName: string;
  countryCode: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  countyName?: string;
} {
  const tara = (curata(a.tara) || "RO").toUpperCase().slice(0, 2);
  const linii = liniiAdresa(a);

  /* ⚠ Sectorul intra pe adresa, nu in oras. Se pune doar daca mai e loc: peste 3 linii
     DHL nici n-are unde sa le puna, iar strada si numarul conteaza mai mult decat
     sectorul, pe care il da si codul postal. */
  const sector = tara === "RO" ? sectorPentruAdresa(a) : null;
  const toate = sector && linii.length < LUNGIMI.liniiAdresa ? [...linii, sector] : linii;

  const iesire: {
    postalCode: string;
    cityName: string;
    countryCode: string;
    addressLine1: string;
    addressLine2?: string;
    addressLine3?: string;
    countyName?: string;
  } = {
    /* ⚠ Cheia pleaca si cand valoarea e goala. Vezi `codPostalDhl`. */
    postalCode: codPostalDhl(a.codPostal, tara),
    cityName: orasDhl(a.oras, a.judet) || "-",
    countryCode: tara,
    addressLine1: text(toate[0], LUNGIMI.liniiAdresaLungime) || "-",
  };

  const a2 = text(toate[1], LUNGIMI.liniiAdresaLungime);
  if (a2) iesire.addressLine2 = a2;
  const a3 = text(toate[2], LUNGIMI.liniiAdresaLungime);
  if (a3) iesire.addressLine3 = a3;

  /* Sectorul pleaca SI ca `countyName` — acolo e cu adevarat locul lui („suburb"), iar
     pe linii poate sa nu fi incaput. Pentru adresele straine, judetul/statul scris de
     cumparator. Vezi `judetDhl`. */
  const judet = tara === "RO"
    ? judetDhl(a)
    : (text(a.judet, LUNGIMI.judet) || null);
  if (judet) iesire.countyName = text(judet, LUNGIMI.judet);

  return iesire;
}

/**
 * Contactul unei parti, in forma lor.
 *
 * ⚠ `required: [phone, companyName, fullName]`. Toate trei, si pentru DESTINATAR.
 *
 * ⚠ `companyName` e problema reala intr-un magazin: cumparatorul persoana fizica nu are
 * firma, iar campul are `minLength: 1`. Se pune numele lui — asa face si eticheta
 * tiparita, unde randul de firma e primul. Un sir gol ar cadea cu 422 pe fiecare comanda
 * de la o persoana fizica, adica pe majoritatea lor.
 *
 * ⚠ `email` NU e obligatoriu, si nu se inventeaza. Fara el DHL pur si simplu nu trimite
 * instiintarile lor de livrare.
 */
export function contactDhl(a: AdresaComanda): {
  phone: string;
  companyName: string;
  fullName: string;
  email?: string;
} {
  const persoana = text(a.nume, LUNGIMI.nume);
  const firma = text(a.companie, LUNGIMI.companie);

  const iesire: { phone: string; companyName: string; fullName: string; email?: string } = {
    phone: telefonDhl(a.telefon),
    companyName: firma || text(persoana, LUNGIMI.companie) || "-",
    fullName: persoana || firma || "-",
  };

  const email = taie(a.email, LUNGIMI.email);
  if (email) iesire.email = email;
  return iesire;
}

// ─── Ce lipseste ─────────────────────────────────────────────────────────────

/**
 * ⚠ Motivul „lipseste codul postal", scris o singura data.
 *
 * Apelantul TREBUIE sa-l poata deosebi de restul lipsurilor. Regula din
 * `shipping.actions.ts` e ca o configurare gresita ridica alerta catre comerciant, iar o
 * adresa incompleta iese tacut cu `return []` — dar codul postal nu e nici una, nici
 * alta: e o lipsa STRUCTURALA a checkout-ului (nu se cere la comenzile interne, vezi
 * memoria `cod-postal-lipsa-in-checkout`), deci comerciantul trebuie sa afle o data de
 * ce DHL arata tarif fix, exact ca la FedEx.
 */
export const LIPSA_COD_POSTAL =
  "codul postal al destinatarului (DHL cere sase cifre pentru Romania si il verifica)";

/**
 * ⚠ Motivul „lipsesc datele vamale", scris o singura data. Vezi `lipsuriExpediere`.
 */
export const LIPSA_COD_VAMAL =
  "codurile vamale (HS) si tarile de origine ale produselor, cerute pentru destinatiile "
  + "din afara Uniunii Europene";

/** A cazut cererea pe lipsa codului postal? */
export function lipsesteCodulPostal(l: Lipsuri): boolean {
  return l.comanda.includes(LIPSA_COD_POSTAL);
}

/** A cazut cererea pe lipsa datelor vamale? */
export function lipsescDateleVamale(l: Lipsuri): boolean {
  return l.comanda.includes(LIPSA_COD_VAMAL);
}

/**
 * Ce a gresit COMERCIANTUL in configurarea DHL.
 *
 * ⚠ Telefonul expeditorului e obligatoriu, la fel ca al destinatarului: `phone` e in
 * `required` pe `contactInformation`, iar `shipperDetails` cere `contactInformation`.
 * O configurare fara telefon nu produce nicio cotare si niciun AWB.
 */
export function lipsuriConfigurare(config: DhlConfig | null | undefined): string[] {
  const l: string[] = [];
  if (!config) return ["configurarea DHL"];

  if (!curata(config.username)) l.push("utilizatorul MyDHL API");
  if (!curata(config.password)) l.push("parola MyDHL API");

  const cont = curata(config.account_number);
  if (!cont) l.push("numarul de cont DHL Express");
  else if (cont.length > 12) {
    /* ⚠ `accounts[].number` are `maxLength: 12`. Contul romanesc are noua cifre; peste
       douasprezece caractere e sigur altceva (de pilda cheia de API lipita gresit). */
    l.push("numarul de cont DHL Express are mai mult de 12 caractere (DHL accepta cel mult atat)");
  }

  const e = config.expeditor;
  if (!curata(e?.nume) && !curata(e?.companie)) l.push("numele sau firma expeditorului");
  if (!curata(e?.strada)) l.push("strada expeditorului");
  if (!curata(e?.oras)) l.push("orasul expeditorului");

  const taraExpeditor = (curata(e?.tara) || "RO").toUpperCase();
  if (!curata(e?.cod_postal)) l.push("codul postal al expeditorului");
  else if (!codPostalDhl(e?.cod_postal, taraExpeditor)) {
    l.push(
      taraExpeditor === "RO"
        ? "codul postal al expeditorului nu are sase cifre (formatul cerut de DHL pentru Romania)"
        : "codul postal al expeditorului",
    );
  }

  if (!telefonDhl(e?.telefon)) {
    l.push("telefonul expeditorului (DHL il cere pe fiecare expediere, nu doar pe cele externe)");
  }

  return l;
}

/**
 * Ce lipseste ca sa se poata emite, impartit pe vinovat.
 *
 * ⚠ AICI NU SE VERIFICA DACA PRODUSUL E „VALABIL PE RUTA", si e o hotarare, aceeasi ca
 * la UPS. Produsul ajunge aici din chiar cotarea LOR, iar `/rates` filtreaza deja pe
 * contractul contului (`accountNumber` e obligatoriu la cotare, iar codurile lor
 * `8035`/`8036`/`8003` arata ca disponibilitatea e a CONTULUI, nu a geografiei). Blocat
 * de noi pe temeiul unui PDF comercial, comerciantul ar ramane cu o comanda platita si
 * neexpediabila.
 *
 * ⚠ SI NU INTRA AICI SUPRATAXELE. Vezi `avertismenteColet`.
 */
export function lipsuriExpediere(config: DhlConfig | null | undefined, date: DateExpediere): Lipsuri {
  const configurare = lipsuriConfigurare(config);
  const comanda: string[] = [];
  const d = date.destinatar;

  const taraDestinatar = (curata(d.tara) || "RO").toUpperCase();

  if (!curata(d.nume) && !curata(d.companie)) comanda.push("numele sau firma destinatarului");
  if (liniiAdresa(d).length === 0) comanda.push("adresa destinatarului");
  if (!curata(d.oras)) comanda.push("orasul destinatarului");

  /*
   * ⚠ CODUL POSTAL, si e capcana pe care a calcat-o FedEx.
   *
   * Lista asta e folosita ca POARTA inaintea cotarii, iar checkout-ul Edinio nu cere cod
   * postal la comenzile interne. Deci pentru orice comanda romaneasca iesim de aici — si
   * asta e starea NORMALA, nu o scapare. Motivul are text propriu ca apelantul sa ridice
   * alerta potrivita o singura data, in loc sa lase comerciantul sa creada ca e o
   * problema de configurare.
   */
  if (!codPostalDhl(d.codPostal, taraDestinatar)) comanda.push(LIPSA_COD_POSTAL);

  /*
   * ⚠ TELEFONUL E OBLIGATORIU SI INTERN, spre deosebire de UPS.
   * `supermodelIoLogisticsExpressContact.required = [phone, companyName, fullName]`, iar
   * `receiverDetails` cere `contactInformation`. Fara telefon cererea cade cu 422.
   */
  if (!telefonDhl(d.telefon)) {
    comanda.push("telefonul destinatarului (DHL il cere pe orice expediere, si in Romania)");
  }

  /*
   * ⚠ Se verifica pragul de COLET, nu cel de EXPEDIERE, si nu e o scapare: noi trimitem
   * un singur colet, iar `GREUTATE_MAXIMA_KG` (70) e cu mult sub
   * `GREUTATE_MAXIMA_EXPEDIERE_KG` (1000), deci el leaga primul. Un al doilea `else if`
   * pe pragul de expediere n-ar fi putut fi atins niciodata.
   */
  const greutate = Number(date.greutateKg);
  if (!(greutate > 0)) comanda.push("greutatea coletului");
  else if (greutate > GREUTATE_MAXIMA_KG) {
    comanda.push(
      `greutatea de ${greutate.toFixed(1)} kg depaseste limita DHL de ${GREUTATE_MAXIMA_KG} kg pe colet `
      + "(peste ea se expediaza doar pe palet, prin reprezentantul DHL)",
    );
  }

  /*
   * ⚠ DATELE VAMALE, SI DE CE BLOCHEAZA.
   *
   * `commodityCodes` (codul HS) NU e in lista `required` a lui `lineItems[]` — se poate
   * emite o expediere vamala fara el, iar `tsc`, probele si schema lor trec toate. Vama
   * nu trece: fara cod HS si fara tara de fabricatie, coletul se opreste la frontiera si
   * nu se mai poate corecta din aplicatie, fiindca DHL NU ARE ANULARE DE EXPEDIERE.
   *
   * Costul hotararii, spus limpede: fara articole cu cod HS, DHL nu se ofera pe
   * destinatiile din afara Uniunii. E singurul loc din fisier unde blocam ceva ce DHL ar
   * accepta — si se blocheaza fiindca al doilea AWB, cel de reparatie, nu exista.
   */
  if (config && eVamalPeAdresa(expeditorCaAdresa(config), d)) {
    const articole = date.articole ?? [];
    const incomplet = articole.length === 0
      || articole.some((x) => !curata(x.codVamal) || !curata(x.taraOrigine));
    if (incomplet) comanda.push(LIPSA_COD_VAMAL);
  }

  return { configurare, comanda };
}

// ─── Corpul cotarii ──────────────────────────────────────────────────────────

/**
 * Corpul pentru `POST /rates`.
 *
 * ⚠ `accounts` NU e in `required` la ei, si totusi pleaca MEREU. Fara cont primesti
 * tarifele PUBLICATE, nu pe cele contractuale — adica un pret gresit, nu o eroare, iar
 * diferenta se vede abia pe factura. Ghidul lor SOAP marcheaza acelasi camp `M`:
 * „The DHL account number that is used for the shipment. Internally attached to this
 * account are the customer specific rates."
 *
 * ⚠ NU se filtreaza produsele aici. `produse_permise` din configurare se aplica pe
 * RASPUNS, in `preturi.ts`. Trimis ca `productsAndServices`, filtrul nostru ar ascunde
 * produse pe care contul chiar le vinde — aceeasi greseala care a trebuit intoarsa la UPS.
 */
export function corpTarife(config: DhlConfig, date: DateExpediere): Record<string, unknown> {
  const expeditor = expeditorCaAdresa(config);
  const d = dimensiuniColet(config);
  const vamal = eVamalPeAdresa(expeditor, date.destinatar);

  const corp: Record<string, unknown> = {
    customerDetails: {
      shipperDetails: adresaDhl(expeditor),
      receiverDetails: adresaDhl(date.destinatar),
    },
    accounts: [{ typeCode: "shipper", number: taie(config.account_number, 12) }],
    /*
     * ⚠ Formatul e al lor, litera cu litera, si il compune `momentExpedierii`:
     * `YYYY-MM-DDTHH:MM:SSGMT+HH:MM`, FARA spatiu inainte de `GMT`. Descrierea din YAML
     * arata un spatiu („2006-06-26T17:00:00 GMT+01:00"), dar acela vine din plierea
     * blocului `>-`; `example`-ul aceluiasi camp e `'2020-03-24T13:00:00GMT+00:00'`.
     * ⚠ Si offsetul se calculeaza, nu se scrie in cod: Romania e GMT+02:00 iarna si
     * GMT+03:00 vara, deci un offset fix ar fi gresit sapte luni pe an — fara nicio
     * eroare, doar cu alt set de produse si alta data estimata de livrare.
     */
    plannedShippingDateAndTime: momentExpedierii(date.dataExpedierii),
    /* ⚠ MEREU explicit. Vezi antetul fisierului. */
    unitOfMeasurement: "metric",
    isCustomsDeclarable: vamal,
    packages: [coletDhl(date, d, false)],
    /*
     * Fara steagul asta, produsele care cer intelegere comerciala nu vin deloc, iar
     * comerciantul cu contract bun ar vedea mai putin decat are. `preturi.ts` le
     * marcheaza dupa `isCustomerAgreement`, ca sa se stie care sunt.
     */
    returnStandardProductsOnly: false,
    productTypeCode: "all",
    /*
     * ⚠ „Please set this to true in case you want to receive products which are not
     * available on planned shipping date but next available day." Fara el, o cerere
     * facuta dupa ora de inchidere intoarce ZERO produse, iar checkout-ul cade pe tarif
     * fix fara sa spuna nimeni de ce. Timpii de tranzit raman cei adevarati.
     */
    nextBusinessDay: true,
    /*
     * Data estimata de livrare. `QDDC` e cea cu angajament („constitutes DHL's service
     * commitment"), `QDDF` e doar tranzitul cel mai rapid, fara vamuire. Intr-un checkout
     * se arata angajamentul.
     */
    estimatedDeliveryDate: { isRequested: true, typeCode: "QDDC" },
    /*
     * ⚠ Serviciile cu valoare adaugata vin doar daca sunt cerute. E si singura cale prin
     * care „Testeaza conexiunea" poate verifica daca `KB` (rambursul) apare vreodata
     * pentru CONTUL acela — dovada ca nu se vinde din Romania e negativa, deci nu se
     * poate inchide definitiv.
     */
    getAdditionalInformation: [{ typeCode: "allValueAddedServices", isRequested: true }],
  };

  /*
   * Valoarea declarata intra in cotare fiindca ea trage suprataxele de valoare si
   * asigurarea. `monetaryAmount[]` cere toate trei campurile.
   */
  const valoare = Number(date.valoareComanda);
  if (valoare > 0) {
    corp.monetaryAmount = [{
      typeCode: "declaredValue",
      value: bani(valoare),
      currency: VALUTA_DECLARATA,
    }];
  }

  /*
   * ⚠⚠ ACELEASI SERVICII CA LA EMITERE, PRIN ACELASI AJUTOR.
   *
   * CE ERA GRESIT: corpul cotarii nu purta niciun `valueAddedServices`, desi
   * `corpExpediere` trimite `II` („Shipment Insurance") ori de cate ori comerciantul are
   * asigurarea pornita. CE SE RUPEA: pretul cotat — cel aratat cumparatorului in checkout
   * si scris in `dhl_cost` pe comanda — iesea mai mic decat cel facturat cu cel putin 55
   * de lei pe FIECARE colet, fiindca in catalogul lor romanesc asigurarea costa „55.00 LEI
   * or 1% of insured value, if higher". Magazinul livra in pierdere, si nimic din interfata
   * nu lega cele doua sume: cotarea nu stia de un serviciu pe care emiterea il cerea.
   * Cele doua corpuri pleaca dinadins din acelasi `DateExpediere`; de acum compun lista de
   * servicii cu acelasi `serviciiAdaugate`, ca sa nu mai poata devia.
   *
   * ⚠ Schema e ALTA la cotare (`…ValueAddedServicesRates`, cu `localServiceCode` in plus si
   * `method` marcat „For future use"), dar cheile pe care le trimitem noi — `serviceCode`,
   * `value`, `currency` — sunt in amandoua, si amandoua sunt `additionalProperties: false`.
   *
   * ⚠ DA, INGUSTEAZA RASPUNSUL („Please use if you wish to filter the response by value
   * added services"), si aici asta e ce vrem, spre deosebire de `productCode` de mai jos:
   * un produs care nu poate purta `II` ar fi fost cotat degeaba, fiindca emiterea pe el ar
   * fi cazut cu `7008 The requested Special Service Code … is not available between this
   * origin and destination` — adica dupa ce cumparatorul a platit si a asteptat.
   *
   * ⚠ Si NU se adauga si `monetaryAmount[{ typeCode: "insuredValue" }]`. Enumerarea lor
   * chiar il are (e singura aparitie a cuvantului in tot OpenAPI-ul), dar nicaieri in cele
   * patru surse nu scrie ca se cere pe langa serviciu, iar ghidul lor SOAP spune pe dos:
   * suma asigurata calatoreste PE serviciu („the ServiceType would have a value of `II',
   * with the ServiceValue and CurrencyCode containing the insured value and currency"), iar
   * campul separat „will be deprecated from the interface, as the SpecialServices section
   * should be used to convey Insured Value". Deci pleaca una singura, exact ca la emitere.
   */
  const servicii = serviciiAdaugate(config, date);
  if (servicii.length > 0) corp.valueAddedServices = servicii;

  /*
   * Produsul se pune DOAR daca a fost cerut anume (recotarea unei comenzi pe produsul
   * ales). La prima cotare lipseste dinadins: fara el DHL intoarce tot ce vinde contul
   * pe ruta aia, adica exact lista din care alege cumparatorul.
   */
  const produs = codProdus(date.productCode);
  if (produs) {
    corp.productCode = produs;
    const local = codProdusLocal(date.localProductCode);
    if (local) corp.localProductCode = local;
  }

  return corp;
}

// ─── Corpul emiterii ─────────────────────────────────────────────────────────

/**
 * Corpul pentru `POST /shipments`.
 *
 * ⚠ NU EXISTA ANULARE. `delete:` apare o singura data in toata specificatia lor, si
 * aceea pe `/pickups/{dispatchConfirmationNumber}` — se poate anula RIDICAREA, nu AWB-ul.
 * Deci fiecare camp de mai jos are o a doua greutate: o expediere emisa gresit ramane
 * emisa si poate fi facturata („DHL Express may request that You compensate it in the
 * event that You do not subsequently tender a shipment").
 *
 * ⚠ `productCode` e in `required`. Spre deosebire de UPS — unde lipsa codului de serviciu
 * nu e o eroare, ci o factura pe cel mai scump produs — DHL REFUZA cererea. Esecul e
 * zgomotos, nu scump.
 */
export function corpExpediere(config: DhlConfig, date: DateExpediere): Record<string, unknown> {
  const expeditor = expeditorCaAdresa(config);
  const d = dimensiuniColet(config);
  const vamal = eVamalPeAdresa(expeditor, date.destinatar);
  const taraExpeditor = (curata(expeditor.tara) || "RO").toUpperCase();
  const taraDestinatar = (curata(date.destinatar.tara) || "RO").toUpperCase();

  /*
   * ⚠ Produsul si codul LOCAL se iau impreuna sau deloc.
   *
   * `localProductCode` e valabil doar pentru produsul din aceeasi oferta. Cand produsul
   * lipseste si cadem pe implicit, un cod local ramas de la o cotare veche ar descrie alt
   * produs — iar DHL raspunde `8035 Product code provided not matching the account's
   * network type code`, care nu spune nimic despre ce s-a intamplat de fapt.
   */
  const produs = codProdus(date.productCode);
  const local = produs ? codProdusLocal(date.localProductCode) : null;

  const referinta = taie(date.referinta, LUNGIMI.referinta);

  const corp: Record<string, unknown> = {
    plannedShippingDateAndTime: momentExpedierii(date.dataExpedierii),
    /*
     * ⚠ `pickup` e in `required` la nivel de expediere, chiar si cand nu ceri ridicare:
     * `pickup.required = [isRequested]`. Omis, cererea cade cu eroare de schema.
     * ⚠ Si e singurul lucru care se mai poate ANULA dupa emitere — numarul intors
     * (`dispatchConfirmationNumber`) e tot ce avem in locul unei anulari de AWB.
     */
    pickup: { isRequested: config.cere_ridicare ?? false },
    productCode: produs ?? produsImplicit(taraExpeditor, taraDestinatar),
    accounts: [{ typeCode: "shipper", number: taie(config.account_number, 12) }],
    outputImageProperties: outputImageProperties(config, vamal),
    customerDetails: {
      shipperDetails: {
        postalAddress: adresaDhl(expeditor),
        contactInformation: contactDhl(expeditor),
      },
      receiverDetails: {
        postalAddress: adresaDhl(date.destinatar),
        contactInformation: contactDhl(date.destinatar),
      },
    },
    content: continut(config, date, d, vamal),
    /*
     * ⚠ Devizul cerut pe raspunsul de emitere. Fara el, avertismentele lor `7991 Rate
     * Request service failure. No charges returned in response message.` si `7995 No
     * charges returned in response message.` nu apar niciodata — adica nu s-ar sti ca
     * expedierea s-a creat CU SUCCES si FARA PRET, ceea ce chiar se intampla.
     */
    getRateEstimates: true,
  };

  if (local) corp.localProductCode = local;

  /*
   * ⚠ REFERINTA LA NIVEL DE EXPEDIERE, cu `typeCode: "CU"`.
   *
   * `CU` = „Consignor reference number", si e chiar tipul dupa care se poate cauta:
   * `GET /tracking?shipmentReference=…&shipmentReferenceType=CU`. Pusa pe COLET
   * (`packages[].customerReferences`) ar folosi alt nomenclator de tipuri si nu s-ar mai
   * putea cauta dupa ea — iar asta e singura cale de a afla, dupa un raspuns pierdut,
   * daca AWB-ul chiar s-a creat.
   */
  if (referinta) {
    corp.customerReferences = [{ value: referinta, typeCode: "CU" }];
  }

  const asigurare = serviciiAdaugate(config, date);
  if (asigurare.length > 0) corp.valueAddedServices = asigurare;

  /*
   * Instiintarea prin email a cumparatorului, cand comerciantul o vrea.
   *
   * ⚠ `receiverId` are `maxLength: 50`, nu 70 ca emailul de pe contact. Acelasi email,
   * alta latime, in acelasi mesaj.
   * ⚠ `languageCode` NU primeste romana: valorile lor documentate aici sunt „eng
   * (English), zho, chi, dan (Danish) and ita (Italian)". Se omite, ca sa ramana
   * implicitul lor (`eng`), in loc sa cada pe o valoare inventata.
   */
  const emailClient = taie(date.destinatar.email, LUNGIMI.emailInstiintare);
  if (config.notifica_destinatarul && emailClient) {
    corp.shipmentNotification = [{ typeCode: "email", receiverId: emailClient }];
  }

  return corp;
}

// ─── Bucatile corpului ───────────────────────────────────────────────────────

/** Valuta in care tinem sumele comenzii. */
const VALUTA_DECLARATA = "RON";

/** Numar cu cel mult trei zecimale — `multipleOf: 0.001` peste tot in schemele lor. */
function bani(v: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0;
}

/**
 * Coletul, in forma lor.
 *
 * ⚠ `dimensions` e OPTIONAL la ei si pleaca MEREU de la noi. Vezi punctul 1 din antet:
 * fara el pretul cotat e mai mic decat cel facturat, tacut.
 * ⚠ Iar daca il trimiti, toate trei laturile sunt obligatorii inauntru
 * (`dimensions.required = [length, width, height]`) — nu se poate trimite doar lungimea.
 *
 * ⚠⚠ `cuDescriere` NU e un moft. Coletul are DOUA scheme la ei:
 * `…ExpressPackage` (emitere) are `description`, `…ExpressPackageRR` (cotare) NU o are
 * deloc. Amandoua sunt `additionalProperties: false`, deci acelasi camp e legal intr-o
 * parte si 422 in cealalta — exact pe drumul care aduce preturile in checkout.
 */
function coletDhl(
  date: DateExpediere,
  d: { lungime: number; latime: number; inaltime: number },
  cuDescriere: boolean,
): Record<string, unknown> {
  const colet: Record<string, unknown> = {
    weight: bani(Math.max(GREUTATE_MINIMA_KG, Number(date.greutateKg) || GREUTATE_MINIMA_KG)),
    dimensions: { length: d.lungime, width: d.latime, height: d.inaltime },
  };
  if (cuDescriere) {
    const descriere = text(date.continut, LUNGIMI.descriereColet);
    if (descriere) colet.description = descriere;
  }
  return colet;
}

/**
 * `content`, blocul cu cele cinci campuri obligatorii.
 *
 * `required: [packages, isCustomsDeclarable, description, incoterm, unitOfMeasurement]`.
 */
function continut(
  config: DhlConfig,
  date: DateExpediere,
  d: { lungime: number; latime: number; inaltime: number },
  vamal: boolean,
): Record<string, unknown> {
  /*
   * ⚠ `description` are `pattern: '^[^\s]'` — nu poate incepe cu spatiu, si nu poate fi
   * gol (`minLength: 1`). `curata` taie spatiile de la capete, deci tiparul e respectat
   * din constructie; rezerva „Bunuri de consum" acopera cazul in care nici comanda, nici
   * configurarea nu spun nimic.
   */
  const descriere = text(date.continut, LUNGIMI.descriere)
    || text(config.continut_implicit, LUNGIMI.descriere)
    || "Bunuri de consum";

  const bloc: Record<string, unknown> = {
    packages: [coletDhl(date, d, true)],
    isCustomsDeclarable: vamal,
    description: descriere,
    /*
     * ⚠ `DAP` („Delivered at Place") e implicitul, si nu e o preferinta: la `DDP`
     * vanzatorul „has an obligation to clear the goods not only for export but also for
     * import, **to pay any duty for both export and import**". Un `DDP` pus „ca sa fie
     * sigur" muta taxele vamale de pe cumparator pe magazin, pe TOATE expedierile din
     * afara Uniunii, si nu se vede nicaieri pana la factura.
     */
    incoterm: incotermDhl(config.incoterm),
    unitOfMeasurement: "metric",
  };

  const valoare = Number(date.valoareComanda);
  if (valoare > 0 && (vamal || config.valoare_declarata)) {
    bloc.declaredValue = bani(valoare);
    /* ⚠ Cele doua merg impreuna: o valoare fara valuta e un numar fara inteles. */
    bloc.declaredValueCurrency = VALUTA_DECLARATA;
  }

  if (vamal) bloc.exportDeclaration = declaratieVamala(date);

  return bloc;
}

/**
 * Incotermul, verificat pe enumerarea LOR.
 *
 * ⚠ Enumerarea e inchisa (`enum` de 16 valori), deci o valoare scrisa gresit in
 * configurare nu e ignorata, ci face intreaga emitere sa cada.
 */
const INCOTERMURI_VALIDE: ReadonlySet<string> = new Set([
  "EXW", "FCA", "CPT", "CIP", "DPU", "DAP", "DDP",
  "FAS", "FOB", "CFR", "CIF", "DAF", "DAT", "DDU", "DEQ", "DES",
]);

export function incotermDhl(cerut: string | null | undefined): string {
  const t = curata(cerut).toUpperCase();
  if (INCOTERMURI_VALIDE.has(t)) return t;
  const implicit = curata(INCOTERM_IMPLICIT).toUpperCase();
  return INCOTERMURI_VALIDE.has(implicit) ? implicit : "DAP";
}

/**
 * Produsul de rezerva, cand comanda nu poarta niciunul.
 *
 * ⚠ NU E O ALEGERE COMERCIALA, e o rezerva. Produsul adevarat vine din cotare, unde DHL
 * l-a filtrat deja pe contractul contului. Aici se raspunde doar la intrebarea „ce
 * trimitem cand nu stim nimic", fiindca `productCode` e in `required` si cererea ar cadea
 * cu totul.
 *
 * ⚠ Si e o alegere pe care documentatia lor NU o transeaza: pentru marfa RO→UE se bat
 * cap in cap `P` (EXPRESS WORLDWIDE, non-doc, singurul intors de sonda lor pe toate
 * rutele externe) si `U` (ECX, pe care DHL UK il descrie ca „Express Worldwide (EU)",
 * fara separare doc/non-doc). Se ia `P`, fiindca noi expediem marfa, si fiindca `U` e
 * marcat `Doc` in propriul lor nomenclator.
 */
export function produsImplicit(taraExpeditor: string, taraDestinatar: string): string {
  const de = (curata(taraExpeditor) || "RO").toUpperCase();
  const la = (curata(taraDestinatar) || "RO").toUpperCase();
  /* `N` = EXPRESS DOMESTIC, singurul produs intors de sonda lor pentru RO→RO. */
  return de === la ? "N" : "P";
}

/**
 * Serviciile cu valoare adaugata cerute de noi.
 *
 * ⚠⚠ SINGURUL LOC IN CARE SE COMPUN, si il cheama AMANDOUA corpurile — `corpTarife` si
 * `corpExpediere`. Cat timp e asa, pretul cotat nu se mai poate departa de cel facturat.
 * Cine adauga un serviciu doar intr-unul din cele doua corpuri repeta defectul pe care
 * ajutorul asta il inchide: asigurarea pleca doar la emitere, iar cumparatorul vedea un
 * pret cu cel putin 55 de lei pe colet sub cel real.
 *
 * ⚠ Se cer DOAR codurile `XCH` („Extra charge", adica cele care se cer de client).
 * `SCH` (suprataxe automate: combustibil, zona indepartata) si `FEE` apar in devizul
 * cotarii ca sa se vada din ce se compune pretul, dar trimise inapoi ca cereri cad.
 *
 * ⚠⚠ SI `KB` NU PLEACA NICIODATA. Filtrul de la sfarsit nu e paranoia: rambursul nu se
 * vinde cu origine Romania, iar `7008 The requested Special Service Code … is not
 * available between this origin and destination` apare la EMITERE, nu la cotare — adica
 * dupa ce cumparatorul a platit si a asteptat. Vezi `AVERTISMENT_RAMBURS`.
 */
function serviciiAdaugate(config: DhlConfig, date: DateExpediere): Record<string, unknown>[] {
  const servicii: Record<string, unknown>[] = [];

  /*
   * `II` = „Shipment Insurance", singurul serviciu de asigurare confirmat ca vandut in
   * Romania de catalogul lor („Shipment Insurance … 55.00 LEI or 1% of insured value, if
   * higher"). Suma asigurata e cea data de comanda; cand lipseste, valoarea comenzii.
   */
  const suma = Number(date.asigurare) > 0 ? Number(date.asigurare) : Number(date.valoareComanda);
  if (config.asigurare_activa && suma > 0) {
    servicii.push({ serviceCode: "II", value: bani(suma), currency: VALUTA_DECLARATA });
  }

  return servicii.filter((s) => s.serviceCode !== COD_RAMBURS);
}

/**
 * Declaratia vamala, pentru destinatiile din afara uniunii vamale.
 *
 * ⚠ `commodityCodes` NU e in `required` la ei. `lipsuriExpediere` il cere oricum: o
 * expediere vamala fara cod HS trece de schema si se opreste in vama, iar la DHL nu
 * exista anulare care sa repare gresala.
 *
 * ⚠ `weight` din linie n-are `required` inauntru, dar descrierea lor spune „Either one
 * of the gross or net weight field value to be provided in shipment request" — deci una
 * din doua trebuie sa existe. Se trimite `grossValue`, care e ce cantareste coletul.
 */
function declaratieVamala(date: DateExpediere): Record<string, unknown> {
  const articole = date.articole ?? [];
  const greutateTotala = Math.max(GREUTATE_MINIMA_KG, Number(date.greutateKg) || GREUTATE_MINIMA_KG);

  /*
   * ⚠ Rezerva de o singura linie NU e cod mort. `lipsuriExpediere` opreste emiterea cand
   * lipsesc articolele, dar corpul trebuie sa fie valid ORICUM: un apelant care sare
   * peste validare (o proba, o emitere fortata din pagina comenzii) nu are voie sa
   * produca un mesaj care cade pe schema, fiindca atunci nu s-ar mai sti daca expedierea
   * s-a creat sau nu.
   */
  const linii = articole.length > 0
    ? articole.map((art, i) => linieVamala(art, i + 1, greutateTotala / articole.length))
    : [linieVamala(
      {
        descriere: date.continut ?? "",
        cantitate: 1,
        pretUnitar: Number(date.valoareComanda) || 0,
        greutateKg: greutateTotala,
      },
      1,
      greutateTotala,
    )];

  return {
    lineItems: linii.slice(0, 999),
    /*
     * ⚠ `invoice` cere `required: [number, date]`. Numarul e referinta noastra, ca sa se
     * poata lega hartia de comanda; data e ziua expedierii, si conteaza: „please enter
     * accurate date when the invoice was issued at **as that is what drives the exchange
     * rate calculation during customs clearance**".
     */
    invoice: {
      number: taie(date.referinta, 35) || "PROFORMA",
      date: ziuaDhl(date.dataExpedierii),
    },
    /* „Please provide the shipment was sent for Personal (Gift) or Commercial (Sale) reasons". */
    shipmentType: "commercial",
    exportReasonType: "commercial_purpose_or_sale",
    /* `maxLength: 30`, text liber tiparit pe factura. In engleza: il citeste vama straina. */
    exportReason: "Sale of goods",
    /*
     * `DAP` inseamna „livrat la locul numit", deci locul TREBUIE numit. Fara el, termenul
     * de livrare de pe factura ramane fara obiect.
     */
    placeOfIncoterm: text(date.destinatar.oras, 256) || "-",
  };
}

/** O linie din declaratia vamala. `required: [number, description, price, quantity, manufacturerCountry, weight]`. */
function linieVamala(art: ArticolVamal, numar: number, greutateRezerva: number): Record<string, unknown> {
  const cantitate = Math.max(1, Math.round(Number(art.cantitate) || 1));
  const greutate = Number(art.greutateKg) > 0 ? Number(art.greutateKg) : greutateRezerva;

  const linie: Record<string, unknown> = {
    number: Math.min(999, Math.max(1, numar)),
    description: text(art.descriere, LUNGIMI.descriereArticol) || "Bunuri de consum",
    /* ⚠ Pret UNITAR: „Please provide unit or article price line item value". Pus totalul
       pe linie, valoarea declarata a coletului iese inmultita cu cantitatea. */
    price: bani(art.pretUnitar),
    quantity: { value: cantitate, unitOfMeasurement: "PCS" },
    /* ⚠ Unde a fost FABRICAT, nu de unde pleaca. O tara pusa din reflex („RO, ca de acolo
       expediem") e o declaratie vamala falsa, de aceea `lipsuriExpediere` o cere. */
    manufacturerCountry: (curata(art.taraOrigine) || "RO").toUpperCase().slice(0, 2),
    weight: { grossValue: Math.max(0.001, bani(greutate)) },
  };

  const hs = curata(art.codVamal).replace(/[^0-9A-Za-z.]/g, "");
  if (hs.length >= 2) {
    linie.commodityCodes = [{ typeCode: "outbound", value: hs.slice(0, 18) }];
  }

  return linie;
}

// ─── Eticheta ────────────────────────────────────────────────────────────────

/**
 * ⚠ `EPL2` LA EI SE SCRIE `epl`.
 *
 * Nomenclatorul lor de sabloane (`outputImageTemplate`) scrie in coloana `imageFormat`
 * valorile `ZPL,LP2,EPL2`, dar `outputImageProperties.encodingFormat` are
 * `enum: [pdf, zpl, lp2, epl]`. Cine transcrie coloana in camp trimite `epl2` si ia 422
 * pe fiecare emitere, cu un mesaj despre un camp pe care l-a copiat din documentatia lor.
 */
const FORMATE_DHL: Record<FormatEticheta, string> = {
  PDF: "pdf",
  ZPL: "zpl",
  LP2: "lp2",
  EPL2: "epl",
};

/**
 * Sablonul de eticheta potrivit cu formatul cerut.
 *
 * ⚠ PERECHEA TREBUIE SA SE POTRIVEASCA. `ECOM26_A4_001` exista doar in PDF,
 * `ECOM26_84_001` doar in ZPL/LP2/EPL2. Un sablon PDF cerut cu `encodingFormat: zpl` nu
 * intoarce o eticheta stricata, ci o eroare — iar comerciantul care si-a schimbat
 * imprimanta din configurare n-are de unde sa lege cele doua setari.
 */
export function sablonPotrivit(format: FormatEticheta, cerut?: string | null): string {
  const t = curata(cerut);
  const potrivit = SABLOANE.find((s) => s.valoare === t && s.formate.includes(format));
  if (potrivit) return potrivit.valoare;

  const primul = SABLOANE.find((s) => s.formate.includes(format));
  if (primul) return primul.valoare;

  return SABLON_IMPLICIT;
}

/**
 * `outputImageProperties`, cu una sau doua hartii.
 *
 * ⚠ ETICHETA (`label`) e ce se lipeste pe colet. FACTURA COMERCIALA (`invoice`) se cere
 * numai la expedierile vamale; fara ea tiparita si atasata, coletul se opreste in vama.
 *
 * ⚠⚠ SE CERE UN SINGUR TIP DE ETICHETA, SI E O PRECONDITIE, NU O PREFERINTA.
 *
 * CE ERA GRESIT: aici se mai cerea si `waybillDoc` (borderoul de arhiva al expeditorului),
 * cu `templateName` din `SABLOANE_BORDEROU` si `hideAccountNumber: true`. CE SE RUPEA:
 * `documents[].typeCode` din RASPUNSUL lor nu deosebeste eticheta de borderou. In chiar
 * exemplul lor oficial `domesticDocShipmentResponse` — raspunsul cererii care ceruse
 * `waybillDoc` SI `label` — vin DOUA intrari, amandoua `typeCode: label`, iar campul e
 * `type: string` fara `enum`. `client.ts` ia prima intrare de tip `label`, iar in exemplul
 * lor ordinea intrarilor o urmeaza pe cea a cererii: prima ceruta a fost tocmai
 * `waybillDoc`. Deci in `dhl_etichete.continut` putea ajunge hartia de ARHIVA, iar
 * comerciantul lipea pe colet altceva decat eticheta.
 *
 * ⚠ Si nu se putea repara dupa: `label` NU e in enumerarea lui
 * `GET /shipments/{awb}/get-image`, deci copia salvata de noi la emitere e singura care va
 * exista vreodata — iar DHL n-are nici reimprimare de eticheta, nici anulare de expediere.
 *
 * ⚠ Borderoul era oricum pierdut: `documentTransport = dupaTip("waybilldoc")` din
 * `client.ts` iesea NUL la FIECARE emitere, fiindca raspunsul il eticheta `label`. Se
 * platea deci ambiguitatea intreaga si nu se primea nimic in schimb.
 *
 * ⚠ Cine il vrea inapoi trebuie sa treaca intai pe `linkLabelsByPieces: true` +
 * `packageReferenceNumber`: `linkLabelsByPiecesShipmentResponse` e singurul exemplu din
 * specificatia lor in care `waybillDoc` chiar vine cu typeCode-ul lui, iar etichetele se
 * deosebesc dupa numarul coletului, nu dupa tip.
 *
 * ⚠ FACTURA COMERCIALA RAMANE, si NU are ambiguitatea asta: raspunsul lor pentru o
 * expediere vamala (`dutiableShipmentResponse`) o intoarce chiar cu `typeCode: invoice`,
 * langa etichete. Iar `dupaTip("invoice")` din `client.ts` o gaseste ca atare.
 *
 * ⚠ Factura vine oricum PDF, orice ai cere: „Note that invoice and shipment receipt will
 * always come back as PDF".
 */
function outputImageProperties(config: DhlConfig, vamal: boolean): Record<string, unknown> {
  const format = config.format_eticheta ?? FORMAT_IMPLICIT;
  const optiuni: Record<string, unknown>[] = [
    {
      typeCode: "label",
      templateName: sablonPotrivit(format, config.sablon_eticheta),
      isRequested: true,
    },
  ];

  if (vamal) {
    optiuni.push({
      typeCode: "invoice",
      templateName: "COMMERCIAL_INVOICE_P_10",
      isRequested: true,
      invoiceType: "commercial",
      /*
       * ⚠ Codul romanesc la ei e `rum`, nu `ron` (ISO 639-2/B, nu /T) — nomenclatorul lor
       * de limbi il da chiar asa: `CreateShipment,commercial invoice,rum,Romanian`. Si
       * totusi se cere `eng`: factura o citeste vama de la DESTINATIE, nu comerciantul.
       */
      languageCode: "eng",
    });
  }

  return { encodingFormat: FORMATE_DHL[format], imageOptions: optiuni };
}

export { momentExpedierii, ziuaDhl } from "./client";
