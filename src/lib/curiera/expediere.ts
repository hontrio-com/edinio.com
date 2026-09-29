import { normalizePhone } from "@/lib/utils/phone";
import { normalizeCountyName, normalizeLocalityName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";
import { serviciuAdresa, serviciuPunct, type CurieraConfig } from "./client";

/**
 * Cat primeste un dulap FANbox. Egal cu `FANBOX_MAX_WEIGHT_KG` (pragul din checkout), tinut aici
 * ca literal fiindca `fancourier.ts` nu are ce cauta in fereastra de client; egalitatea o apara
 * `expediere.test.ts`.
 */
export const GREUTATE_MAXIMA_LOCKER_KG = 30;

/**
 * Cererea `create_shipment`, construita dintr-un singur loc.
 *
 * ═══ ⚠ TOT TEXTUL PLEACA IN ASCII ═══
 *
 * Masurat pe 29.09.2026, pe etichete tiparite: „Timișoara" a iesit „Timi?oara", „Mărășești"
 * a iesit „Mara?e?ti", iar „Âî" a iesit doua caractere de inlocuire. Trec curat numai formele cu
 * sedila (ş, ţ) si „ă". Deci nu se alege pe camp: numele, adresele, localitatile, continutul si
 * observatiile trec TOATE prin `ascii`. O eticheta cu „?" in adresa e o eticheta pe care
 * curierul o citeste prost.
 *
 * ═══ ⚠ ADRESA INTR-UN SINGUR CAMP, CU SECTORUL IN TEXT ═══
 *
 * Documentatia ofera `to_str` + `to_nr` + `to_bl` ... si `to_address`. Masurat:
 *
 *   `to_str`      ei pun singuri „Str. " in fata: „Bulevardul Unirii" iese „Str. Bulevardul
 *                 Unirii". Adresele noastre sunt o linie intreaga („Strada X nr 5, bl..."),
 *                 deci ar iesi „Str. Strada X".
 *   `to_address`  pleaca asa cum e. DAR `to_sector` langa el se PIERDE: nu apare nici in
 *                 raspuns, nici pe eticheta.
 *
 * Deci linia intreaga in `to_address`, iar in Bucuresti sectorul se scrie IN linie cand nu e
 * deja acolo. Sectorul se ia din oras sau judet (checkoutul il scrie la oras); comenzile din
 * marketplace-uri il au deja in strada, si atunci linia ramane cum e. NU se ghiceste niciodata.
 *
 * ═══ PUNCTUL ARE INTAIETATE ═══
 *
 * Cu `to_delivery_location`, Curiera rescrie adresa, orasul si judetul destinatarului cu ale
 * PUNCTULUI (masurat: un Cluj-Napoca trimis a iesit Bucuresti, orasul lockerului). Se trimit
 * totusi datele punctului, ca cererea sa spuna acelasi lucru ca eticheta.
 *
 * ═══ CE NU SE TAIE ═══
 *
 * Documentatia nu declara nicio lungime de camp, deci nimic nu se scurteaza aici (regula de la
 * Pall-Ex si eColet: o taietura inventata strica o adresa buna).
 */

/** Ce stie comanda despre un colet Curiera. Tot ce e aici vine din comanda sau din fereastra. */
export type DateExpediereCuriera = {
  destinatar: {
    nume: string;
    telefon: string;
    email?: string | null;
    /** Linia de adresa (strada, numar, bloc...). Ignorata la punct. */
    adresa?: string | null;
    oras: string;
    judet: string;
    codPostal?: string | null;
  };
  /** Id-ul punctului de ridicare (`to_delivery_location`). Cu el, serviciul e cel de punct. */
  punctId?: string | null;
  /**
   * Punctul e un dulap FANbox (numele lui incepe cu „FANbox", masurat pe toate cele 3.229). Atunci
   * coletul trebuie sa incapa: vezi `lipsuriExpediereCuriera`. Pudo si oficiile n-au limite publicate.
   */
  punctLocker?: boolean;
  /** Greutatea TOTALA, in kg. Se imparte egal pe colete. */
  greutateKg: number;
  /** Numarul de colete (`cnt`). Peste 1, Curiera face un GRUP cu un singur AWB-lider. */
  colete: number;
  /** Dimensiunile unui colet, in cm. Toate trei sau niciuna. */
  dimensiuni?: { lungime: number; latime: number; inaltime: number } | null;
  /** Suma de incasat la livrare. 0 sau lipsa = fara ramburs. */
  ramburs?: number | null;
  /** Valoarea asigurata. 0 sau lipsa = nu se declara. */
  valoareAsigurata?: number | null;
  continut?: string | null;
  observatii?: string | null;
  /** `customer_reference`: singura urma a comenzii noastre la ei. Vezi `referintaCuriera`. */
  referinta: string;
  /** Id-uri din `list_services?type=extra`. */
  serviciiExtra?: string[];
};

/**
 * Ce trimite fereastra (sau lotul) catre actiunea de emitere. Referinta o pune serverul, din
 * numarul comenzii citit din baza: nu se primeste din browser.
 */
export type DateAwbCuriera = Omit<DateExpediereCuriera, "referinta">;

/**
 * Textul in ASCII curat.
 *
 * Intai regula romaneasca (`stripDiacritics`, care stie si formele cu sedila), apoi orice alt
 * semn diacritic (nume maghiare, germane), apoi punctuatia tipografica, iar ce mai ramana in
 * afara ASCII-ului tiparibil se scoate: mai bine lipsa unui semn decat un „?" pe eticheta.
 */
export function ascii(v: string | null | undefined): string {
  return stripDiacritics(v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[„”“"«»]/g, "\"")
    .replace(/[‚‘’`´]/g, "'")
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  -​ ]/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Referinta noastra la ei: `EDN-<primele 4 din magazin>-<numarul comenzii>`.
 *
 * ⚠ Numarul comenzii reporneste de la #0001 in FIECARE magazin, iar doua magazine pot folosi
 * acelasi cont Curiera; fara bucata din magazin, cautarea dupa referinta ar putea gasi AWB-ul
 * altcuiva. Aceeasi forma ca la DHL.
 */
export function referintaCuriera(businessId: string, orderNumber: string | number | null | undefined): string {
  const magazin = businessId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const nr = String(orderNumber ?? "").replace(/^#/, "").trim() || "0";
  return `EDN-${magazin}-${nr}`;
}

function eInBucuresti(oras: string, judet: string): boolean {
  const o = ascii(oras).toLowerCase();
  const j = normalizeCountyName(judet).toLowerCase();
  return j === "bucuresti" || /bucuresti|bucharest/.test(o) || /^sector(ul)?\s*[1-6]$/.test(o);
}

/**
 * Linia de adresa pentru `to_address`, cu sectorul scris in ea cand e in Bucuresti.
 * `null` la sector inseamna „nu scrie nicaieri", si atunci nu se adauga nimic.
 */
export function adresaCuSector(adresa: string, oras: string, judet: string): string {
  const linie = ascii(adresa);
  if (!eInBucuresti(oras, judet)) return linie;
  /* Linia care pomeneste deja un sector ramane cum a scris-o omul: nu se adauga al doilea. */
  if (sectorBucuresti(linie) !== null) return linie;
  const sector = sectorBucuresti(oras) ?? sectorBucuresti(judet);
  if (sector === null) return linie;
  return linie ? `${linie}, Sector ${sector}` : `Sector ${sector}`;
}

function suma(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function cifre(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Ce lipseste ca sa poata pleca un AWB, in cuvinte pentru comerciant. Gol = se poate emite.
 *
 * ⚠ E SINGURA PLASA, nu o politete: „There are no mandatory fields except api_key" (documentatia),
 * iar un camp lipsa nu da eroare, da o CIORNA care nu pleaca (vezi `client.ts`). Deci tot ce stim
 * ca le trebuie se verifica aici, INAINTE de registru.
 */
export function lipsuriExpediereCuriera(config: CurieraConfig, date: DateExpediereCuriera): string[] {
  const lipsuri: string[] = [];
  const e = config.expeditor ?? {};
  if (!ascii(e.nume)) lipsuri.push("numele expeditorului (configurarea Curiera)");
  if (!normalizePhone(e.telefon)) lipsuri.push("telefonul expeditorului (configurarea Curiera)");
  if (!ascii(e.adresa)) lipsuri.push("adresa de ridicare (configurarea Curiera)");
  if (!ascii(e.oras)) lipsuri.push("orasul de ridicare (configurarea Curiera)");
  if (!ascii(e.judet)) lipsuri.push("judetul de ridicare (configurarea Curiera)");

  const d = date.destinatar;
  if (!ascii(d.nume)) lipsuri.push("numele destinatarului");
  if (!normalizePhone(d.telefon)) lipsuri.push("telefonul destinatarului");
  const punct = (date.punctId ?? "").trim();
  if (!punct && !ascii(d.adresa)) lipsuri.push("adresa destinatarului");
  if (!ascii(d.oras)) lipsuri.push("localitatea destinatarului");
  if (!ascii(d.judet)) lipsuri.push("judetul destinatarului");
  if (punct && !/^\d+$/.test(punct)) lipsuri.push("un punct de ridicare valid");
  /*
   * ⚠ LA DULAP: un singur colet, de cel mult 30 kg. Curiera nu refuza la emitere un colet care nu
   * incape (nu valideaza nimic, masurat), iar checkoutul opreste punctul peste 30 kg; fara plasa
   * asta, o cantarire mai mare sau doua colete ar pleca spre un dulap in care nu intra. Aceleasi
   * dulapuri si aceeasi regula ca la FAN (`FANBOX_MAX_WEIGHT_KG`, „un singur colet").
   */
  if (punct && date.punctLocker) {
    if (date.colete > 1) lipsuri.push("un singur colet (la un locker FANbox nu merg mai multe)");
    if (Number(date.greutateKg) > GREUTATE_MAXIMA_LOCKER_KG) {
      lipsuri.push(`o greutate de cel mult ${GREUTATE_MAXIMA_LOCKER_KG} kg (atat primeste un locker FANbox)`);
    }
  }

  if (!(Number(date.greutateKg) > 0)) lipsuri.push("greutatea coletului");
  if (!Number.isInteger(date.colete) || date.colete < 1) lipsuri.push("numarul de colete");
  const dim = date.dimensiuni;
  if (dim && !(dim.lungime > 0 && dim.latime > 0 && dim.inaltime > 0)) {
    lipsuri.push("toate trei dimensiunile coletului (sau niciuna)");
  }
  return lipsuri;
}

/**
 * Parametrii `create_shipment` (form-urlencoded, toti siruri).
 *
 * ⚠ Serviciile extra pleaca cu valoarea „true", NICIODATA „1": documentatia o spune anume, ca
 * „o cauza frecventa de probleme".
 *
 * ⚠ `ramburs_type` NU se trimite: contul de test l-a rescris in „cont" si cand am trimis „cash"
 * (masurat). E o setare a contractului, nu a comenzii.
 */
export function parametriExpediereCuriera(config: CurieraConfig, date: DateExpediereCuriera): Record<string, string> {
  const e = config.expeditor ?? {};
  const d = date.destinatar;
  const punct = (date.punctId ?? "").trim();
  const colete = Math.max(1, Math.floor(date.colete || 1));

  const p: Record<string, string> = {
    type: "package",
    service_type: punct ? serviciuPunct(config) : serviciuAdresa(config),
    cnt: String(colete),
    customer_reference: date.referinta,

    from_name: ascii(e.nume),
    /* Aceeasi regula ca la destinatar: `from_city` se pliaza pe „Bucuresti", deci sectorul
       depozitului se scrie in linie, altfel s-ar pierde pe fiecare AWB. */
    from_address: adresaCuSector(e.adresa ?? "", e.oras ?? "", e.judet ?? ""),
    from_city: normalizeLocalityName(ascii(e.oras), ascii(e.judet)),
    from_county: normalizeCountyName(ascii(e.judet)),
    from_country: "RO",
    from_phone: normalizePhone(e.telefon),

    to_name: ascii(d.nume),
    to_city: normalizeLocalityName(ascii(d.oras), ascii(d.judet)),
    to_county: normalizeCountyName(ascii(d.judet)),
    to_country: "RO",
    to_phone: normalizePhone(d.telefon),
  };

  if (ascii(e.persoana_contact)) p.from_contact = ascii(e.persoana_contact);
  if ((e.email ?? "").trim()) p.from_email = (e.email ?? "").trim();
  if (ascii(e.cod_postal)) p.from_zipcode = ascii(e.cod_postal);

  if (punct) {
    p.to_delivery_location = punct;
    if (ascii(d.adresa)) p.to_address = ascii(d.adresa);
  } else {
    p.to_address = adresaCuSector(d.adresa ?? "", d.oras, d.judet);
  }
  if (ascii(d.codPostal)) p.to_zipcode = ascii(d.codPostal);
  if ((d.email ?? "").trim()) p.to_email = (d.email ?? "").trim();

  /* Greutatea pe colet: la grup, `weight`, `weight2`, `weight3`... (documentat). */
  const total = Math.max(0.1, Number(date.greutateKg) || 0);
  const peColet = Math.max(0.1, Math.round((total / colete) * 100) / 100);
  const dim = date.dimensiuni;
  for (let i = 1; i <= colete; i++) {
    const s = i === 1 ? "" : String(i);
    p[`weight${s}`] = cifre(peColet);
    if (dim && dim.lungime > 0 && dim.latime > 0 && dim.inaltime > 0) {
      p[`length${s}`] = cifre(dim.lungime);
      p[`width${s}`] = cifre(dim.latime);
      p[`height${s}`] = cifre(dim.inaltime);
    }
  }

  const ramburs = suma(date.ramburs);
  if (ramburs > 0) p.ramburs = cifre(ramburs);
  const asigurare = suma(date.valoareAsigurata);
  if (asigurare > 0) p.insurance = cifre(asigurare);

  const continut = ascii(date.continut) || ascii(config.continut_implicit);
  if (continut) p.content = continut;
  const observatii = ascii(date.observatii);
  if (observatii) p.comments = observatii;

  for (const id of new Set(date.serviciiExtra ?? [])) {
    const curat = String(id).trim();
    if (/^\d+$/.test(curat)) p[`service_${curat}`] = "true";
  }
  return p;
}
