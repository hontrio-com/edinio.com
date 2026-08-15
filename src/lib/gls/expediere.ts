import { normalizePhone } from "@/lib/utils/phone";
import { normalizeLocalityName } from "@/lib/utils/ro-address";
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

/**
 * Desparte numarul de casa de numele strazii.
 *
 * ═══ ⚠ DE CE E NEVOIE ═══
 *
 * MyGLS are TREI campuri (clasa `Address`, pagina 10): `Street` (numele),
 * `HouseNumber` („ONLY NUMBER") si `HouseNumberInfo` („Building, stairway,
 * etc."). Noi le inghesuiam pe toate in `Street` si taiam la 40 de caractere —
 * iar taierea se face pe granita de CUVANT, deci numarul, care sta la sfarsit,
 * era primul care pica:
 *
 *     „Bulevardul General Gheorghe Magheru 28"  ->  „Bulevardul General Gheorghe Magheru"
 *
 * Coletul pleaca cu strada fara numar, curierul nu gaseste adresa, si urmeaza
 * codul 18 sau 20 din Appendix G, apoi 23: retur. Comerciantul plateste si dusul
 * si intorsul, iar rambursul nu se incaseaza.
 *
 * ═══ ⚠ DE CE NU SE DESPARTE MEREU ═══
 *
 * O despartire gresita strica adresa mai rau decat o lasa. „Strada 13
 * Septembrie" nu are numarul 13, iar „Bulevardul 1 Mai 28" are numarul 28, nu 1.
 * Deci se taie DOAR cand e limpede:
 *
 *   1. exista un marcaj explicit (`nr`, `nr.`, `numarul`, `no`) — cel mai sigur;
 *   2. altfel, numai daca numarul e la SFARSIT sau e urmat de bl/sc/et/ap;
 *   3. in rest se lasa totul in `Street`, ca pana acum.
 *
 * In toate cazurile trebuie sa ramana litere inaintea numarului: altfel „28" ar
 * deveni o strada fara nume.
 */
const MARCAJ_NUMAR = /\b(?:nr|no|num[aă]r(?:ul)?)\.?\s*(\d+[A-Za-z]?)\b/i;
/** bl(oc), sc(ara), et(aj), ap(artament), tronson, corp, sector. */
const MARCAJ_DETALIU = /\b(?:bl|sc|et|ap|tr|corp|sector|sect)\b/i;
/**
 * Un numar la sfarsitul textului, eventual urmat de detalii de bloc.
 *
 * ⚠ LACOM (`.*`, nu `.*?`), si asta e chiar miezul: pe „Bulevardul 1 Mai 28"
 * varianta lenesa se opreste la PRIMUL numar si scoate „1" drept numar de casa,
 * lasand „Mai 28" ca detalii. Lacom, cauta ultimul, si backtracking-ul se intoarce
 * singur la unul mai devreme cand restul arata a bloc/scara.
 */
const NUMAR_LA_FINAL = /^(.*[A-Za-zĂÂÎȘȚăâîșț])[\s,]+(\d+[A-Za-z]?)\s*(.*)$/;

export function despartaAdresa(text: string): {
  strada: string;
  numar: string;
  detalii: string;
} {
  const curat = (text ?? "").trim().replace(/\s+/g, " ");
  if (!curat) return { strada: "", numar: "", detalii: "" };

  const cuMarcaj = MARCAJ_NUMAR.exec(curat);
  if (cuMarcaj && cuMarcaj.index > 0) {
    const inainte = curat.slice(0, cuMarcaj.index).replace(/[\s,]+$/, "");
    const dupa = curat.slice(cuMarcaj.index + cuMarcaj[0].length).replace(/^[\s,]+/, "");
    if (/[A-Za-zĂÂÎȘȚăâîșț]/.test(inainte)) {
      return { strada: inainte, numar: cuMarcaj[1], detalii: dupa };
    }
  }

  const laFinal = NUMAR_LA_FINAL.exec(curat);
  if (laFinal) {
    const rest = laFinal[3].replace(/^[\s,]+/, "");
    /* Fara marcaj, numarul e credibil doar la sfarsit sau urmat de bloc/scara. */
    if (rest === "" || MARCAJ_DETALIU.test(rest)) {
      return { strada: laFinal[1], numar: laFinal[2], detalii: rest };
    }
  }

  return { strada: curat, numar: "", detalii: "" };
}

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
  /* `HouseNumber` e „ONLY NUMBER"; restul (bloc, scara, etaj) sta separat. */
  numar: 10,
  detaliiAdresa: 40,
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
  /**
   * Numarul de la strada, cand apelantul il are separat
   * (`shipping_address.street_no`).
   *
   * ⚠ Se LIPESTE de strada si trece prin aceeasi despartire ca textul venit
   * intr-un singur camp — nu pe un drum al lui. Vezi `adresaGls`: doua drumuri
   * inseamna doua purtari, si aceeasi comanda ar pleca altfel dupa cum a fost
   * apasat butonul.
   */
  numar?: string | null;
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
 *
 * ⚠ Strada se desparte in `Street` / `HouseNumber` / `HouseNumberInfo`, fiecare
 * cu bugetul lui de caractere. Vezi `despartaAdresa`.
 */
export function adresaGls(a: AdresaComanda): AdresaGls {
  const intreaga = [a.strada, a.stradaExtra].filter(Boolean).join(" ");
  /*
   * Cand numarul vine separat de la apelant, nu se mai ghiceste: se ia asa cum e.
   * Restul textului ramane numele strazii, iar detaliile eventuale (bloc, scara)
   * ies din despartire.
   */
  /*
   * ⚠⚠ O SINGURA COMPUNERE, PENTRU TOATE CAILE.
   *
   * Formularul de AWB tine strada si numarul intr-un singur camp editabil; lotul
   * le are separate pe comanda. O varianta anterioara le trata diferit — numarul
   * dat separat ocolea `despartaAdresa` — si a produs exact defectul pe care
   * despartirea trebuia sa-l repare: pe formele care nu incep cu o cifra („FN",
   * „nr. 5", „bis 3"), textul se pierdea COMPLET, si numai pe calea lotului.
   * Aceeasi comanda pleca cu adrese diferite dupa cum se apasa butonul.
   *
   * Acum totul se lipeste si se desparte O SINGURA DATA, cu aceleasi reguli. Cele
   * doua cai nu mai POT sa se departeze, fiindca nu mai exista doua cai — e
   * garantie prin constructie, nu prin grija. Vezi proba care le compara pe zece
   * forme reale de adresa.
   */
  const rupt = despartaAdresa([intreaga, (a.numar ?? "").trim()].filter(Boolean).join(" "));
  const strada = rupt.strada;
  const numar = rupt.numar;
  const detalii = rupt.detalii;

  const adr: AdresaGls = {
    Name: taie(a.companie || a.nume, MAX.nume),
    Street: taie(strada, MAX.strada),
    /* ⚠ Bucurestiul se plieaza: checkout-ul cere acum SECTORUL, iar aici e nevoie de
    „Bucuresti". Sectorul nu se pierde — ramane in adresa. Vezi `ro-address.ts`. */
    City: taie(normalizeLocalityName(a.oras, a.judet ?? undefined), MAX.oras),
    ZipCode: taie(a.codPostal ?? "", MAX.codPostal),
    CountryIsoCode: (a.tara || "RO").toUpperCase().slice(0, 2),
    ContactName: taie(a.nume, MAX.contact),
    /* Normalizarea e cea comuna pe curieri: fara ea, GLS accepta expedierea si
       arunca tacut un telefon pe care nu-l poate citi — deci nu apare pe eticheta. */
    ContactPhone: normalizePhone(a.telefon),
    ContactEmail: (a.email ?? "").trim(),
  };

  /* Campurile optionale se trimit doar cand au continut: `HouseNumber: ""` n-ar
     spune nimic in plus, iar documentatia are cod propriu pentru numar zero. */
  if (numar) adr.HouseNumber = taie(numar, MAX.numar);
  if (detalii) adr.HouseNumberInfo = taie(detalii, MAX.detaliiAdresa);
  return adr;
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

  /*
   * ⚠ Asigurarea cere o expediere de UN SINGUR colet.
   *
   * Appendix A, codul 28: „The Count must be 1 because of the INS service".
   * Trimise impreuna, GLS refuza toata expedierea — deci mai bine renuntam la
   * serviciu decat sa nu plece coletul, si spunem asta in avertismentele care
   * ajung la comerciant.
   */
  if (s.asigurare && d.valoare && d.valoare > 0 && Math.floor(d.numarColete || 1) <= 1) {
    lista.push({ Code: "INS", INSParameter: { Value: d.valoare } });
  }

  return lista;
}

/** „Count of parcels sent in one shipment. (maximum 99)", pagina 9. */
export const MAX_COLETE = 99;

/**
 * ⚠ Ce NU putem trimite catre Serbia, spus inainte de a consuma un apel.
 *
 * Documentatia are trei cerinte proprii pentru RS, toate in clasa `Parcel`
 * (pagina 9), si niciuna nu e indeplinita de noi:
 *
 *   `SenderIdentityCardNumber`  „Only in Serbia! ID card number or PIB. REQUIRED"
 *   `Content`                   „MANDATORY in Serbia"  (acum se trimite mereu)
 *   `ParcelPropertyList`        „For shipments to Serbia, specifying the parcel
 *                                weight is mandatory"
 *
 * Appendix A le are codurile 43 („Missing senderId card number (only in RS)") si
 * 44 („Missing content (only in RS)").
 *
 * Nu exista in panou niciun camp pentru buletinul/PIB-ul expeditorului si nu
 * trimitem greutatea nicaieri, deci o expediere spre Serbia ar fi refuzata la
 * FIECARE incercare, iar comerciantul n-ar avea ce sa corecteze. Mai bine i-o
 * spunem noi, limpede, decat sa-l lasam sa se lupte cu un cod de eroare.
 *
 * Cand se va cere, reparatia e clara: un camp `expeditor_ci_pib` in configurare
 * si greutatea in `ParcelPropertyList` — greutatea exista deja in lot
 * (`greutateaColetului`) si se arunca doar pentru ca „GLS nu o cere", ceea ce e
 * adevarat peste tot in afara de Serbia.
 */
export function motivRefuzSerbia(d: DateExpediere): string | null {
  const tara = (d.destinatar.tara || "RO").toUpperCase();
  if (tara !== "RS") return null;
  return (
    "Expedierile catre Serbia cer date pe care GLS le pretinde obligatoriu acolo "
    + "(numarul de buletin sau PIB-ul expeditorului si greutatea coletului) si pe care "
    + "integrarea nu le trimite inca. Foloseste contul MyGLS pentru aceasta comanda."
  );
}

/**
 * Ce nu se poate trimite asa cum a cerut comerciantul, spus in cuvintele lui.
 *
 * Se aduna INAINTE de apel si se pun in registru langa AWB, ca sa nu dispara:
 * un serviciu care „nu s-a activat" fara ca nimeni sa fi aflat de ce e exact
 * felul de tacere care se descopera cand clientul reclama.
 */
export function avertismenteColet(d: DateExpediere): string[] {
  const av: string[] = [];
  const cerute = Math.floor(d.numarColete || 1);
  if (cerute > MAX_COLETE) {
    av.push(`S-au cerut ${cerute} colete, iar GLS accepta cel mult ${MAX_COLETE}: s-au trimis ${MAX_COLETE}.`);
  }
  if (d.servicii?.asigurare && d.valoare && d.valoare > 0 && cerute > 1) {
    av.push(
      "Asigurarea GLS (INS) merge doar pe expedierile cu un singur colet, "
      + `iar aceasta are ${cerute}: coletul a plecat NEASIGURAT.`,
    );
  }
  return av;
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
    /*
     * ⚠ Plafonat la 99: „Count of parcels sent in one shipment. (maximum 99)"
     * (pagina 9), iar Appendix A are cod propriu pentru depasire (29). Fara
     * plafon, o greseala de tastare consuma un apel si primeste un refuz pe care
     * il puteam da noi.
     */
    Count: Math.min(MAX_COLETE, Math.max(1, Math.floor(d.numarColete || 1))),
    PickupAddress: adresaGls(d.expeditor),
    DeliveryAddress: adresaGls(d.destinatar),
    ServiceList: serviciiGls(d),
  };

  /*
   * ⚠ `Content` se trimite INTOTDEAUNA.
   *
   * Documentatia il da ca „optionally REQUIRED, depends on the user right"
   * (pagina 9) si MANDATORY in Serbia, iar Appendix A are codul 33, „The Content
   * field is required". Trimis doar cand comerciantul a completat ceva, un cont
   * cu dreptul acela pornit ar fi primit refuz pe orice comanda careia i s-a
   * sters continutul din formular. Referinta comenzii e o rezerva buna: e scurta,
   * exista mereu si spune ceva pe eticheta.
   */
  colet.Content = taie(d.continut || d.referinta, 40);

  if (typeof d.ramburs === "number" && d.ramburs > 0) {
    /* Doi zecimali: MyGLS primeste numar, iar o suma cu erori de virgula
       mobila (12.340000000000002) e exact genul de lucru pe care un sistem de
       incasari il respinge sau il rotunjeste altfel decat noi. */
    colet.CODAmount = Math.round(d.ramburs * 100) / 100;
    colet.CODReference = taie(d.referintaRamburs || d.referinta, 40);
  }

  return colet;
}
