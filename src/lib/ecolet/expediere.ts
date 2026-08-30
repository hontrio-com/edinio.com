import { normalizePhone } from "@/lib/utils/phone";
import type { AdresaEcolet, CorpExpediere } from "./client";

/**
 * Construirea corpului de expediere eColet dintr-o comanda Edinio.
 *
 * ═══ ⚠ UN SINGUR CONSTRUCTOR PENTRU COTARE SI PENTRU EMITERE ═══
 *
 * `POST /add-parcel/reload-form` (cotarea) si `POST /add-parcel/send-order`
 * (emiterea) primesc EXACT acelasi obiect. Construite separat, cele doua se pot
 * departa una de alta fara ca nimic sa se planga — si atunci comanda pleaca pe
 * alt pret decat cel cotat, iar diferenta o suporta comerciantul.
 *
 * Aceeasi hotarare ca la Colete Online (`buildOrderBody`), si singurul lucru
 * imprumutat de acolo.
 *
 * ⚠ Singura deosebire intre cele doua apeluri e `courier.service`: la cotare se
 * lasa GOL, si atunci eColet raspunde cu preturile pentru TOATE serviciile; la
 * emitere se pune slug-ul ales.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. Fiindca eColet nu are mediu de test
 * si fiecare emitere reala e facturata, asta e singurul loc din integrare care se
 * poate verifica INAINTE de prima expediere.
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
  /** ⚠ Id-ul din nomenclatorul eColet. Vezi `localitati.ts`. */
  localityId: number;
  codPostal?: string | null;
  telefon?: string | null;
  email?: string | null;
  /** Persoana pe care o cauta curierul. Lipsa, se cade pe `nume`. */
  persoanaContact?: string | null;
};

export type DateExpediere = {
  expeditor: AdresaComanda;
  destinatar: AdresaComanda;
  greutateKg: number;
  /** Slug-ul serviciului. Lipsa la cotare — atunci eColet le da pe toate. */
  serviciu?: string | null;
  /** Suma de incasat la livrare. 0 sau lipsa = fara ramburs. */
  ramburs?: number;
  valoareDeclarata?: number;
  continut?: string | null;
  observatii?: string | null;
  numarColete?: number;
  dimensiuni?: { lungime: number; latime: number; inaltime: number };
  servicii?: {
    deschidereLaLivrare?: boolean;
    livrareSambata?: boolean;
    smsNotificare?: boolean;
  };
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * ⚠ Greutatea e INTREAGA in kilograme (`weight: integer` in specificatie).
 *
 * Se rotunjeste in SUS si nu coboara sub 1: sub-declarata, curierul recantareste
 * la depozit si refactureaza banda adevarata, iar diferenta o plateste
 * comerciantul fara sa apara nicaieri in panou. Un zero ar fi respins oricum.
 */
export function greutateIntreaga(kg: unknown): number {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.ceil(n));
}

/**
 * Adresa Edinio → adresa eColet.
 *
 * ⚠ `name` e firma daca exista, altfel persoana — la fel ca la ceilalti curieri.
 * `contact_person` ramane INTOTDEAUNA persoana: curierul suna un om, nu o firma.
 *
 * ⚠ NU se taie niciun camp. Specificatia nu declara nicio lungime maxima, iar
 * cele doua greseli cu putinta nu costa la fel: taiat prea devreme, adresa
 * ciuntita pleaca TACUT si se afla de la curier; netaiat, eColet raspunde 422 cu
 * numele campului — un refuz dovedit, vizibil, pe care comerciantul il repara.
 */
export function adresaEcolet(a: AdresaComanda): AdresaEcolet {
  const iesire: AdresaEcolet = {
    name: curata(a.companie || a.nume),
    country: "ro",
    county: curata(a.judet),
    locality_id: Math.floor(Number(a.localityId) || 0),
    locality: curata(a.oras),
    postal_code: curata(a.codPostal),
    street_name: curata(a.strada),
    street_number: curata(a.numar),
    /* ⚠ Persoana, nu firma: curierul suna un om. La expeditor, `nume` e chiar
       denumirea firmei, deci fara campul asta pleca firma drept persoana. */
    contact_person: curata(a.persoanaContact || a.nume),
    email: curata(a.email),
    /* Normalizarea e cea comuna pe curieri: fara ea, un telefon pe care API-ul nu-l
       poate citi e aruncat tacut si nu ajunge pe eticheta. */
    phone: normalizePhone(a.telefon),
  };

  /* Campurile de bloc se trimit doar completate: goale, unele validari le refuza. */
  const bloc = curata(a.bloc);
  if (bloc) iesire.block = bloc;
  const scara = curata(a.scara);
  if (scara) iesire.entrance = scara;
  const etaj = curata(a.etaj);
  if (etaj) iesire.floor = etaj;
  const ap = curata(a.apartament);
  if (ap) iesire.flat = ap;

  return iesire;
}

/**
 * Codul postal de trimis: cel al comenzii, altfel cel principal al localitatii.
 *
 * ⚠ EXISTA fiindca `shipping_address.postal_code` se scrie DOAR la comenzile din
 * afara tarii — checkout-ul romanesc nu cere codul postal si nu-l salveaza. Cerut
 * fara caderea asta, `lipsuriAdresa` ar fi oprit emiterea pentru ORICE comanda
 * interna, adica pentru practic toate.
 *
 * Cel al localitatii vine chiar din nomenclatorul eColet, deci e un cod pe care
 * ei il accepta sigur. Pentru orasele mari e doar unul dintre multe, dar eColet
 * livreaza dupa `locality_id`; codul postal e camp de formular, nu de rutare.
 */
export function codPostalDeTrimis(
  alComenzii: unknown,
  alLocalitatii?: string | null,
): string {
  const din = (v: unknown) => String(v ?? "").trim();
  return din(alComenzii) || din(alLocalitatii);
}

/**
 * Ce lipseste dintr-o adresa ca sa poata pleca la eColet.
 *
 * ⚠ Se verifica AICI, inaintea oricarei atingeri a furnizorului, si mesajele sunt
 * scrise pentru comerciant. `locality_id` e cel mai subtil: nu e ceva ce omul
 * completeaza, e rezultatul unei cautari care poate sa nu gaseasca nimic — si
 * atunci mesajul trebuie sa spuna ca localitatea nu e recunoscuta de eColet, nu
 * ca „lipseste un camp".
 */
export function lipsuriAdresa(a: AdresaComanda, cine: "expeditor" | "destinatar"): string[] {
  const cui = cine === "expeditor" ? "expeditorului" : "destinatarului";
  const lipsuri: string[] = [];

  if (!curata(a.companie || a.nume)) lipsuri.push(`numele ${cui}`);
  if (!curata(a.strada)) lipsuri.push(`strada ${cui}`);
  if (!curata(a.oras)) lipsuri.push(`localitatea ${cui}`);
  if (!curata(a.judet)) lipsuri.push(`judetul ${cui}`);
  if (!normalizePhone(a.telefon)) lipsuri.push(`telefonul ${cui}`);
  /* ⚠ Codul postal e cerut de eColet la fiecare adresa. Lipsa, cotarea se
     intoarce fara nicio oferta — si nimic nu spune de ce. */
  if (!curata(a.codPostal)) lipsuri.push(`codul postal al ${cui}`);
  if (!Number.isInteger(Number(a.localityId)) || Number(a.localityId) <= 0) {
    lipsuri.push(
      `localitatea ${cui} nu e recunoscuta de eColet (${curata(a.oras) || "necompletata"})`,
    );
  }

  return lipsuri;
}

/**
 * Comanda Edinio → corpul cerut de eColet.
 *
 * ⚠ Ridicarea e „courier" fara data: asa eColet alege prima fereastra libera si
 * `reload-form` intoarce `pickup_dates` pentru fiecare serviciu. O data fixata de
 * noi ar fi putut cadea intr-o zi in care curierul ales nu ridica, iar oferta ar
 * fi disparut din lista fara nicio explicatie.
 */
export function corpExpediere(d: DateExpediere): CorpExpediere {
  const s = d.servicii ?? {};
  const ramburs = Number(d.ramburs);
  /*
   * ⚠ Rambursul se trimite cu `status: false` cand nu e cazul, NU omis.
   * `additional_services.cod` e un obiect cu `status` in specificatie, iar
   * lipsa lui cu totul a fost tratata diferit de diferiti brokeri. Explicit e
   * si mai limpede la citit, si mai greu de rupt.
   *
   * ⚠ Si NICIODATA `status: true` cu suma zero: ar insemna „incaseaza zero lei",
   * adica expedierea intra pe fluxul de ramburs, cu comisionul aferent, degeaba.
   */
  const areRamburs = Number.isFinite(ramburs) && ramburs > 0;

  const corp: CorpExpediere = {
    sender: adresaEcolet(d.expeditor),
    receiver: adresaEcolet(d.destinatar),
    parcel: {
      type: "package",
      weight: greutateIntreaga(d.greutateKg),
      dimensions: {
        length: Math.max(1, Math.floor(d.dimensiuni?.lungime ?? 20)),
        width: Math.max(1, Math.floor(d.dimensiuni?.latime ?? 15)),
        height: Math.max(1, Math.floor(d.dimensiuni?.inaltime ?? 10)),
      },
      shape: "standard",
      amount: Math.max(1, Math.floor(Number(d.numarColete) || 1)),
      content: curata(d.continut) || "Produse",
    },
    additional_services: {
      cod: areRamburs
        ? { status: true, amount: Math.round(ramburs * 100) / 100 }
        : { status: false },
      open_package: { status: !!s.deschidereLaLivrare },
      saturday_delivery: { status: !!s.livrareSambata },
      sms_notify: { status: !!s.smsNotificare },
    },
    courier: {
      pickup: { type: "courier" },
    },
  };

  const valoare = Number(d.valoareDeclarata);
  if (Number.isFinite(valoare) && valoare > 0) {
    corp.parcel.declared_value = Math.round(valoare * 100) / 100;
  }

  const obs = curata(d.observatii);
  if (obs) corp.parcel.observations = obs;

  /* ⚠ Gol la cotare (eColet raspunde pentru toate serviciile), pus la emitere. */
  const serviciu = curata(d.serviciu);
  if (serviciu) corp.courier.service = serviciu;

  return corp;
}
