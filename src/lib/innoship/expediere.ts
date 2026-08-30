import { normalizePhone } from "@/lib/utils/phone";
import { potrivesteJudet } from "@/lib/ro/judete";
import { normalizeLocalityName } from "@/lib/utils/ro-address";
import type { AdresaInnoship, CorpComanda, InnoshipConfig } from "./client";
import { SERVICIU } from "./client";

/**
 * Construirea corpului Innoship dintr-o comanda Edinio.
 *
 * ═══ ⚠ UN SINGUR CONSTRUCTOR PENTRU COTARE SI PENTRU EMITERE ═══
 *
 * `POST /api/Price` si `POST /api/Order` primesc EXACT acelasi obiect. Construite
 * separat, cele doua se pot departa una de alta fara ca nimic sa se planga — si
 * atunci comanda pleaca pe alt pret decat cel cotat, iar diferenta o suporta
 * comerciantul. Aceeasi hotarare ca la eColet, si din aceeasi lectie.
 *
 * ⚠ Singura deosebire dintre cele doua apeluri e `courierId`: la cotare se lasa
 * GOL, si atunci Innoship raspunde cu ofertele TUTUROR curierilor contului; la
 * emitere se pune cel ales de cumparator.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. Spre deosebire de Posta Romana,
 * Innoship ARE endpointuri de proba (`/validate`, `/simulate`) si credentiale de
 * test — deci aici puritatea nu mai e ultima linie de aparare, ci doar felul
 * curat de a scrie. Probele de mai jos raman totusi cea mai ieftina verificare.
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
  tara?: string | null;
  /** Persoana pe care o cauta curierul. Lipsa, se cade pe `nume`. */
  persoanaContact?: string | null;
};

export type FelLivrare = "domiciliu" | "locker" | "pudo";

export type DateExpediere = {
  destinatar: AdresaComanda;
  /** Lipsa = adresa depozitului configurat in portalul lor (`externalClientLocation`). */
  expeditor?: AdresaComanda | null;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareDeclarata?: number;
  numarColete?: number;
  felLivrare: FelLivrare;
  /** Punctul ales de cumparator. Obligatoriu la locker si PUDO. */
  fixedLocationId?: string | null;
  /** Ziua expedierii („AAAA-LL-ZZ"). */
  ziuaExpedierii: string;
  /** Curierul ales. GOL LA COTARE — atunci raspund cu toti. */
  courierId?: number | null;
  /** Serviciul. Lipsa, se alege dupa `felLivrare` din configurare. */
  serviceId?: number | null;
  externalOrderId?: string | null;
  observatii?: string | null;
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Lungimile maxime, din articolul lor „Order", camp cu camp.
 *
 * Aceeasi regula ca la Posta Romana, unde lungimile sunt tot declarate: campurile
 * OBLIGATORII prea lungi OPRESC local, cu un mesaj care spune campul, plafonul si
 * cat s-a masurat; cele optionale se OMIT, cu avertisment. Un drum dus-intors
 * pentru un camp a carui limita o stim dinainte e timp pierdut.
 */
export const LUNGIMI = {
  name: 64,
  contactPerson: 100,
  addressText: 100,
  postalCode: 50,
  phone: 64,
  email: 100,
  externalOrderId: 100,
  observation: 500,
  contents: 100,
} as const;

/** Greutatea minima trimisa. Zero ar fi respins oricum. */
export const GREUTATE_MINIMA_KG = 0.1;

/** Serviciul folosit pentru un fel de livrare, cu implicitele din tabelul lor. */
export function serviciulPentru(fel: FelLivrare, config?: Partial<InnoshipConfig>): number {
  switch (fel) {
    case "locker": return config?.serviciu_locker ?? SERVICIU.locker;
    case "pudo": return config?.serviciu_pudo ?? SERVICIU.pudo;
    default: return config?.serviciu_domiciliu ?? SERVICIU.domiciliu;
  }
}

/**
 * Adresa pe un singur rand.
 *
 * Innoship accepta si `streetName`/`streetNumber` separat, dar `addressText` e
 * campul obligatoriu si singurul pe care il primesc toti curierii. Se trimit
 * amandoua cand le avem: nu costa nimic, iar curierii care stiu sa foloseasca
 * strada separat o primesc gata despartita.
 */
export function adresaPeRand(a: AdresaComanda): string {
  return [
    curata(a.strada),
    curata(a.numar) ? `nr. ${curata(a.numar)}` : "",
    curata(a.bloc) ? `bl. ${curata(a.bloc)}` : "",
    curata(a.scara) ? `sc. ${curata(a.scara)}` : "",
    curata(a.etaj) ? `et. ${curata(a.etaj)}` : "",
    curata(a.apartament) ? `ap. ${curata(a.apartament)}` : "",
  ].filter(Boolean).join(", ");
}

/** `name` e firma daca exista, altfel persoana. `contactPerson` ramane omul. */
export function numeInnoship(a: AdresaComanda): string {
  return curata(a.companie || a.nume);
}

/**
 * Comanda Edinio → adresa Innoship.
 *
 * ⚠ La locker si PUDO, adresa NU se mai trimite: coletul merge la punct, iar ei
 * cer doar `name`, `contactPerson`, `phone` si `fixedLocationId`. Trimisa oricum,
 * o adresa de acasa langa un `fixedLocationId` e cel putin ambigua, iar unii
 * curieri o iau drept adresa de livrare.
 */
export function adresaInnoship(a: AdresaComanda, fel: FelLivrare, fixedLocationId?: string | null): AdresaInnoship {
  const iesire: AdresaInnoship = {
    name: curata(numeInnoship(a)),
    /* Curierul suna un OM, nu o firma. La expeditor, `nume` e chiar denumirea
       firmei, deci fara campul asta pleca firma drept persoana de contact. */
    contactPerson: curata(a.persoanaContact || a.nume),
    phone: normalizePhone(a.telefon),
  };

  const email = curata(a.email);
  if (email && email.length <= LUNGIMI.email) iesire.email = email;

  if (fel !== "domiciliu") {
    const punct = curata(fixedLocationId ?? "");
    if (punct) iesire.fixedLocationId = punct;
    return iesire;
  }

  iesire.country = (curata(a.tara) || "RO").toUpperCase().slice(0, 2);
  /* ⚠ Bucurestiul se plieaza: checkout-ul cere acum SECTORUL, iar aici e nevoie de
   „Bucuresti". Sectorul nu se pierde — ramane in adresa. Vezi `ro-address.ts`. */
  iesire.localityName = normalizeLocalityName(curata(a.oras), a.judet ?? undefined);
  /*
   * ⚠ Regula lor: „either LocalityName + CountyName or LocalityName + PostalCode".
   * Se trimit amandoua cand le avem — nu se alege una, fiindca judetul dezambiguizeaza
   * localitatile care se repeta, iar codul postal alege depozitul.
   */
  const judet = potrivesteJudet(a.judet);
  if (judet) iesire.countyName = judet === "Municipiul Bucuresti" ? "Bucuresti" : judet;
  else if (curata(a.judet)) iesire.countyName = curata(a.judet);

  const codPostal = curata(a.codPostal);
  if (codPostal && codPostal.length <= LUNGIMI.postalCode) iesire.postalCode = codPostal;

  iesire.addressText = adresaPeRand(a).slice(0, LUNGIMI.addressText);
  const strada = curata(a.strada);
  if (strada) iesire.streetName = strada;
  const numar = curata(a.numar);
  if (numar) iesire.streetNumber = numar;

  return iesire;
}

// ─── Ce opreste, si ce doar avertizeaza ───────────────────────────────────────

function preaLung(eticheta: string, valoare: string, maxim: number): string {
  return `${eticheta} are ${valoare.length} caractere, iar Innoship accepta cel mult ${maxim}`;
}

/**
 * Ce OPRESTE expedierea, verificat inaintea oricarei atingeri a furnizorului.
 *
 * ⚠ Regulile sunt ale LOR, din articolul „Order", si difera dupa felul livrarii:
 *   - domiciliu: name, contactPerson, country, addressText, phone, plus
 *     localityName impreuna cu countyName SAU cu postalCode;
 *   - locker/PUDO: name, contactPerson, phone, fixedLocationId.
 */
export function lipsuriExpediere(d: DateExpediere, config?: Partial<InnoshipConfig>): string[] {
  const lipsuri: string[] = [];
  const dest = d.destinatar;
  const laPunct = d.felLivrare !== "domiciliu";

  if (!curata(config?.external_client_location ?? "")) {
    lipsuri.push(
      "id-ul depozitului lipseste din configurare — e „External Client Location” din "
      + "portalul Innoship, si fara el nu se poate emite nicio expediere",
    );
  }

  const nume = numeInnoship(dest);
  if (!nume) lipsuri.push("numele destinatarului");
  else if (nume.length > LUNGIMI.name) lipsuri.push(preaLung("Numele destinatarului", nume, LUNGIMI.name));

  const contact = curata(dest.persoanaContact || dest.nume);
  if (!contact) lipsuri.push("persoana de contact a destinatarului");
  else if (contact.length > LUNGIMI.contactPerson) {
    lipsuri.push(preaLung("Persoana de contact", contact, LUNGIMI.contactPerson));
  }

  if (!normalizePhone(dest.telefon)) lipsuri.push("telefonul destinatarului");

  if (laPunct) {
    if (!curata(d.fixedLocationId ?? "")) {
      lipsuri.push(
        d.felLivrare === "locker"
          ? "lockerul ales de client (fara el, Innoship nu stie unde sa duca coletul)"
          : "punctul de ridicare ales de client",
      );
    }
  } else {
    if (!curata(dest.oras)) lipsuri.push("localitatea destinatarului");
    /*
     * ⚠ Regula lor cere localitatea IMPREUNA cu judetul sau cu codul postal.
     * Verificata aici fiindca refuzul lor ar veni dupa un drum dus-intors, iar
     * comerciantul n-ar sti care dintre cele doua ii lipseste.
     */
    if (curata(dest.oras) && !curata(dest.judet) && !curata(dest.codPostal)) {
      lipsuri.push("judetul sau codul postal al destinatarului (Innoship cere cel putin unul dintre ele)");
    }
    if (!curata(dest.strada)) lipsuri.push("strada destinatarului");

    const adresa = adresaPeRand(dest);
    if (adresa.length > LUNGIMI.addressText) {
      lipsuri.push(
        preaLung("Adresa destinatarului", adresa, LUNGIMI.addressText)
        + " (strada, numarul, blocul, scara, etajul si apartamentul intra toate in acelasi camp)",
      );
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test((d.ziuaExpedierii ?? "").trim())) {
    lipsuri.push("ziua expedierii nu e o data valida");
  }

  return lipsuri;
}

/** Ce se omite fara sa opreasca, si de ce. */
export function avertismenteExpediere(d: DateExpediere): string[] {
  const av: string[] = [];
  const email = curata(d.destinatar.email);
  if (email && email.length > LUNGIMI.email) {
    av.push(
      `Adresa de email a destinatarului (${email.length} caractere) depaseste plafonul de `
      + `${LUNGIMI.email} al Innoship, deci nu a fost trimisa. Coletul pleaca normal, dar `
      + "curierul nu-i poate trimite instiintari pe email.",
    );
  }
  if (d.felLivrare === "domiciliu" && !curata(d.destinatar.codPostal)) {
    av.push(
      "Comanda n-are cod postal. Innoship livreaza dupa localitate si judet, dar unii "
      + "curieri ruteaza mai bine cu el.",
    );
  }
  return av;
}

// ─── Corpul ───────────────────────────────────────────────────────────────────

/** Greutatea, cu cel mult trei zecimale si niciodata zero. */
export function greutateInnoship(kg: unknown): number {
  const n = Number(kg);
  const val = Number.isFinite(n) && n > 0 ? n : GREUTATE_MINIMA_KG;
  return Math.max(GREUTATE_MINIMA_KG, Math.round(val * 1000) / 1000);
}

/** Bani, cu doi zecimali. */
export function baniInnoship(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/**
 * Comanda Edinio → corpul cerut de `POST /api/Price` si `POST /api/Order`.
 *
 * ⚠ Se cheama DUPA `lipsuriExpediere`. Functia asta nu valideaza nimic, doar
 * traduce.
 */
export function corpComanda(d: DateExpediere, config: Partial<InnoshipConfig>): CorpComanda {
  const laPunct = d.felLivrare !== "domiciliu";
  const numarColete = Math.max(1, Math.floor(Number(d.numarColete) || 1));
  const ramburs = baniInnoship(d.ramburs);
  const s = config.servicii ?? {};

  const corp: CorpComanda = {
    serviceId: Number(d.serviceId) || serviciulPentru(d.felLivrare, config),
    /* ⚠ `shipmentDate` e datetime la ei. Ziua noastra devine miezul zilei UTC:
       la miezul NOPTII, un fus in urma ar arunca-o in ziua precedenta. */
    shipmentDate: `${d.ziuaExpedierii}T12:00:00Z`,
    addressTo: adresaInnoship(d.destinatar, d.felLivrare, d.fixedLocationId),
    /* Transportul il plateste comerciantul; rambursul e alta poveste, in `extra`. */
    payment: "Sender",
    content: {
      envelopeCount: 0,
      parcelsCount: numarColete,
      palettesCount: 0,
      totalWeight: greutateInnoship(d.greutateKg),
      contents: (curata(d.continut ?? "") || "Produse").slice(0, LUNGIMI.contents),
    },
    externalClientLocation: curata(config.external_client_location ?? ""),
    parameters: {
      /* ⚠ Sincron, dinadins. Vezi `creeazaComanda`: `async` ne-ar aduce inapoi
         fereastra oarba de la eColet, pe care contractul asta ne-o scuteste. */
      async: false,
      getParcelsBarcodes: true,
      includePriceBreakdown: true,
    },
  };

  /* ⚠ GOL LA COTARE: atunci raspund cu ofertele tuturor curierilor contului. */
  const curier = Number(d.courierId);
  if (Number.isInteger(curier) && curier > 0) corp.courierId = curier;

  if (d.expeditor) corp.addressFrom = adresaInnoship(d.expeditor, "domiciliu");

  const extra: NonNullable<CorpComanda["extra"]> = {
    openPackage: !!s.openPackage,
    saturdayDelivery: !!s.saturdayDelivery,
    returnOfDocuments: !!s.returnOfDocuments,
    returnPackage: !!s.returnPackage,
  };
  if (ramburs > 0) {
    extra.cashOnDeliveryAmount = ramburs;
    extra.cashOnDeliveryAmountCurrency = "RON";
  }
  const declarata = baniInnoship(d.valoareDeclarata);
  if (declarata > 0) {
    extra.declaredValueAmount = declarata;
    extra.declaredValueAmountCurrency = "RON";
  }
  corp.extra = extra;

  const extern = curata(d.externalOrderId ?? "");
  if (extern) corp.externalOrderId = extern.slice(0, LUNGIMI.externalOrderId);

  const obs = curata(d.observatii ?? config.observatii ?? "");
  if (obs) corp.observation = obs.slice(0, LUNGIMI.observation);

  if (config.format_eticheta) {
    corp.clientSettings = { clientPreferences: { preferredLabel: config.format_eticheta } };
  }

  /* ⚠ La locker/PUDO nu se trimite adresa de acasa — vezi `adresaInnoship`. */
  if (laPunct) {
    delete corp.addressTo.addressText;
    delete corp.addressTo.streetName;
    delete corp.addressTo.streetNumber;
  }

  return corp;
}
