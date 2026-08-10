import { normalizePhone } from "@/lib/utils/phone";
import type { AdresaGls, ColetGls, ServiciuGls } from "./client";

/**
 * Construirea coletului GLS dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza: primeste date, intoarce obiectul pe
 * care il asteapta MyGLS. Asta il face singurul loc din integrare care se poate
 * verifica in intregime INAINTE de prima expediere reala — si, cum se probeaza
 * direct in productie pe contractul unui client, e singura sansa.
 *
 * ═══ CODURILE DE SERVICIU SUNT REALE ═══
 *
 * Nu sunt din documentatie (unde nu exista), ci din integrarea oficiala de
 * WooCommerce, care ruleaza in productie:
 *
 *   PSD  livrare la ParcelShop / locker — parametrul e ID-ul punctului
 *   COD  ⚠ NU e serviciu: sunt campurile `CODAmount` + `CODReference` pe colet
 *   CS1  serviciu de contact telefonic inainte de livrare
 *   FDS  livrare flexibila, anuntata pe email
 *   FSS  livrare flexibila, anuntata prin SMS — cere FDS activ
 *   SM1  SMS catre destinatar, cu text propriu: „{telefon}|{text}"
 *   SM2  SMS de preavizare
 *   AOS  predare NUMAI destinatarului nominalizat
 *   INS  asigurare, cu valoarea coletului
 *   24H  livrare garantata in 24h
 */

/** Lungimea maxima a campurilor de adresa la GLS. */
const MAX = {
  /*
   * ⚠ 40 de caractere.
   *
   * MyGLS nu publica limitele. Numarul vine din API-ul-sora al aceluiasi GLS
   * (OOH2X), unde `street`, `city`, `personName` si `companyName` sunt toate
   * `maxLength: 40` — si din latimea clasica a etichetei GLS.
   *
   * Taiem NOI, in loc sa lasam GLS sa taie sau sa refuze: un refuz la mijlocul
   * unui lot lasa jumatate din comenzi cu AWB si jumatate fara.
   */
  nume: 40,
  strada: 40,
  oras: 40,
  codPostal: 9,
  contact: 40,
} as const;

/**
 * Taie la lungimea maxima, pe granita de cuvant cand se poate.
 *
 * O adresa taiata la mijlocul cuvantului („Bulevardul Independen") e mai greu de
 * citit de curier decat una taiata la spatiu. Daca insa primul cuvant e deja mai
 * lung decat limita, se taie brutal — altfel am intoarce sir gol.
 */
export function taie(text: string, maxim: number): string {
  const curat = text.trim().replace(/\s+/g, " ");
  if (curat.length <= maxim) return curat;
  const bucata = curat.slice(0, maxim);
  const spatiu = bucata.lastIndexOf(" ");
  return spatiu > maxim * 0.6 ? bucata.slice(0, spatiu) : bucata;
}

export type AdresaComanda = {
  nume: string;
  companie?: string | null;
  strada: string;
  stradaExtra?: string | null;
  oras: string;
  judet?: string | null;
  codPostal?: string | null;
  tara?: string | null;
  telefon?: string | null;
  email?: string | null;
};

/**
 * Adresa Edinio → adresa MyGLS.
 *
 * ⚠ `Name` e firma daca exista, altfel persoana — la fel ca in integrarea
 * WooCommerce. `ContactName` ramane INTOTDEAUNA persoana: curierul suna un om,
 * nu o firma.
 */
export function adresaGls(a: AdresaComanda): AdresaGls {
  const strada = [a.strada, a.stradaExtra].filter(Boolean).join(" ");
  return {
    Name: taie(a.companie || a.nume, MAX.nume),
    Street: taie(strada, MAX.strada),
    City: taie(a.oras, MAX.oras),
    ZipCode: taie(a.codPostal ?? "", MAX.codPostal),
    CountryIsoCode: (a.tara || "RO").toUpperCase().slice(0, 2),
    ContactName: taie(a.nume, MAX.contact),
    /* Normalizarea e cea comuna pe curieri: fara ea, GLS accepta expedierea si
       arunca tacut un telefon pe care nu-l poate citi — deci nu apare pe eticheta. */
    ContactPhone: normalizePhone(a.telefon),
    ContactEmail: (a.email ?? "").trim(),
  };
}

/** Serviciile pe care le poate cere comerciantul din configurare. */
export type OptiuniServicii = {
  /** Livrare la punct GLS: ID-ul punctului ales de client in checkout. */
  parcelShopId?: string | null;
  contact?: boolean;
  livrareFlexibila?: boolean;
  livrareFlexibilaSms?: boolean;
  smsPreavizare?: boolean;
  smsText?: string | null;
  doarDestinatarul?: boolean;
  asigurare?: boolean;
  garantat24h?: boolean;
};

export type DateExpediere = {
  referinta: string;
  destinatar: AdresaComanda;
  expeditor: AdresaComanda;
  clientNumber: number;
  numarColete: number;
  /** Suma de incasat la livrare. 0 sau lipsa = fara ramburs. */
  ramburs?: number;
  referintaRamburs?: string | null;
  /** Valoarea declarata, pentru asigurare. */
  valoare?: number;
  continut?: string | null;
  servicii?: OptiuniServicii;
};

/**
 * Serviciile de pe colet.
 *
 * ⚠ Cateva reguli nu sunt de stil, sunt din integrarea care merge in productie:
 *
 * - **La livrare in punct (PSD) nu se pun serviciile de domiciliu.** CS1, FDS,
 *   FSS, AOS presupun ca cineva asteapta acasa. Trimise impreuna cu PSD, GLS
 *   fie le ignora, fie refuza expedierea.
 * - **FSS cere FDS.** Singur, SMS-ul de livrare flexibila n-are pe ce sa se lege.
 * - **24H nu merge in Serbia.**
 */
export function serviciiGls(d: DateExpediere): ServiciuGls[] {
  const s = d.servicii ?? {};
  const lista: ServiciuGls[] = [];
  const laPunct = Boolean(s.parcelShopId);
  const tara = (d.destinatar.tara || "RO").toUpperCase();
  const telefon = normalizePhone(d.destinatar.telefon);
  const email = (d.destinatar.email ?? "").trim();

  if (laPunct) {
    lista.push({ Code: "PSD", PSDParameter: { StringValue: s.parcelShopId } });
  }

  if (s.garantat24h && tara !== "RS") lista.push({ Code: "24H" });

  if (!laPunct && s.contact && telefon) {
    lista.push({ Code: "CS1", CS1Parameter: { Value: telefon } });
  }

  if (!laPunct && s.livrareFlexibila && email) {
    lista.push({ Code: "FDS", FDSParameter: { Value: email } });
    /* ⚠ Doar impreuna cu FDS. */
    if (s.livrareFlexibilaSms && telefon) {
      lista.push({ Code: "FSS", FSSParameter: { Value: telefon } });
    }
  }

  if (s.smsText && telefon) {
    /* ⚠ Formatul e „{telefon}|{text}", cu bara verticala. Fara ea, GLS nu stie
       pe ce numar sa trimita si serviciul cade tacut. */
    lista.push({ Code: "SM1", SM1Parameter: { Value: `${telefon}|${s.smsText}` } });
  }

  if (s.smsPreavizare && telefon) {
    lista.push({ Code: "SM2", SM2Parameter: { Value: telefon } });
  }

  if (!laPunct && s.doarDestinatarul) {
    lista.push({ Code: "AOS", AOSParameter: { Value: taie(d.destinatar.nume, MAX.contact) } });
  }

  if (s.asigurare && d.valoare && d.valoare > 0) {
    lista.push({ Code: "INS", INSParameter: { Value: d.valoare } });
  }

  return lista;
}

/**
 * Comanda Edinio → coletul MyGLS.
 *
 * ⚠ RAMBURSUL NU E SERVICIU. `CODAmount` si `CODReference` sunt campuri pe colet.
 * Si se trimit DOAR daca suma e strict pozitiva: un `CODAmount: 0` inseamna
 * pentru GLS „incaseaza zero lei", adica expedierea intra pe fluxul de ramburs
 * degeaba — cu comisionul aferent si cu banii asteptati inapoi de la curier.
 */
export function coletGls(d: DateExpediere): ColetGls {
  const colet: ColetGls = {
    ClientNumber: d.clientNumber,
    ClientReference: taie(d.referinta, 40),
    Count: Math.max(1, Math.floor(d.numarColete || 1)),
    PickupAddress: adresaGls(d.expeditor),
    DeliveryAddress: adresaGls(d.destinatar),
    ServiceList: serviciiGls(d),
  };

  if (d.continut) colet.Content = taie(d.continut, 40);

  if (typeof d.ramburs === "number" && d.ramburs > 0) {
    /* Doi zecimali: MyGLS primeste numar, iar o suma cu erori de virgula
       mobila (12.340000000000002) e exact genul de lucru pe care un sistem de
       incasari il respinge sau il rotunjeste altfel decat noi. */
    colet.CODAmount = Math.round(d.ramburs * 100) / 100;
    colet.CODReference = taie(d.referintaRamburs || d.referinta, 40);
  }

  return colet;
}
