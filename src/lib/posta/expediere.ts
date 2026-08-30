import { potrivesteJudet } from "@/lib/ro/judete";
import { normalizePhone } from "@/lib/utils/phone";
import type { ModValoare, ServiciiPosta } from "./client";

/**
 * Construirea corpului de AWB Poșta Română dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. Cum Posta NU are mediu de test si
 * fiecare `POST /api/awb` e o trimitere reala facturata, fisierul asta e SINGURUL
 * loc din integrare care se poate verifica inainte de prima expediere. De aceea
 * toate regulile care se pot verifica local sunt verificate AICI, nu lasate pe
 * seama furnizorului: un refuz al lor vine intr-un format pe care documentatia
 * nu-l descrie, deci n-avem cum sa-l traducem in ceva folositor pentru om.
 *
 * ═══ ⚠ TIPURILE JSON SE IAU DIN EXEMPLELE LOR, NU DIN PROZA ═══
 *
 * Documentatia se contrazice, sistematic. Proza declara `greutateTrimitere
 * (decimal)`, `ramburs (decimal)`, `valoare (decimal)`, `idOficiuPR (int)`, iar
 * bifele `(smallint)`. Exemplele — singurele cereri despre care stim ca au
 * functionat — trimit:
 *
 *     "greutateTrimitere" : "0.2"      SIR
 *     "ramburs" : "250"                SIR
 *     "valoare" : "20"                 SIR
 *     "idOficiuPR" : "31793"           SIR
 *     "retur" : true                   BOOLEAN
 *     "idBorderou": 555                NUMAR
 *     "decValoareEur": 100.07          NUMAR
 *
 * Deci fiecare camp de mai jos e construit dupa EXEMPLU. Cand se schimba ceva
 * aici, se compara cu Anexa 1 si cu sectiunea 2.2, nu cu lista de tipuri.
 *
 * ═══ ⚠ NUMAI INTERN ═══
 *
 * `decTaraImport`, `decTaraColet` si `decValoareEur` apar in exemple si nu sunt
 * descrise NICAIERI in proza. Sunt campuri de declaratie vamala, deci gresite
 * inseamna colet oprit in vama. Nu se trimit, si Posta se ofera doar pentru
 * destinatii din Romania — vezi ramura din `shipping.actions.ts`.
 */

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export type AdresaPosta = {
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
  /** Persoana pe care o cauta factorul. Lipsa, se cade pe `nume`. */
  persoanaContact?: string | null;
};

export type DateExpediere = {
  /**
   * ⚠ Lipsa INTENTIONAT: documentatia spune ca daca datele expeditorului „nu sunt
   * incluse în request, se vor completa automat cu detaliile contului după care se
   * face apelul". Contul e sursa contractuala, deci implicitul e sa nu trimitem
   * nimic. Se completeaza doar cand comerciantul cere anume alta adresa.
   */
  expeditor?: AdresaPosta | null;
  destinatar: AdresaPosta;
  greutateKg: number;
  /** Identificatorul de contract. Fara el nu pleaca niciun AWB. */
  codTrimitere: string;
  continut?: string | null;
  /** Suma de incasat la livrare. 0 sau lipsa = fara ramburs. */
  ramburs?: number;
  /** Valoarea marfii, pentru modul „comanda" al asigurarii. */
  valoareMarfa?: number;
  modValoare?: ModValoare;
  /** Codul din plaja alocata. Lipsa, Posta il genereaza. */
  codAwb?: string | null;
  idBorderou?: number | null;
  /** Livrare la oficiu, de unde o ridica destinatarul. */
  postRestant?: boolean;
  /** Oficiul, din `GET /api/unitati-livrare`. Obligatoriu la post-restant. */
  idOficiuPR?: string | null;
  servicii?: ServiciiPosta;
  tipMandat?: string | null;
  tipAchitareRamburs?: string | null;
  tipPersoana?: "FIZICA" | "JURIDICA";
  /** Referintele noastre, pentru regasire in aplicatia lor. */
  idComanda?: string | null;
  nrFactura?: string | null;
  obiectRamburs?: string | null;
  /** „AAAA-LL-ZZ" — ziua in care comerciantul duce coletele la oficiu. */
  dataPrezentare?: string | null;
  /** „HH:MM". Implicit 12:00. */
  oraPrezentare?: string | null;
  /** AWB-ul pentru care se face retur cu trimiterea asta. */
  awbRetur?: string | null;
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

// ─── Lungimile declarate ──────────────────────────────────────────────────────

/**
 * Lungimile maxime, luate din proza documentatiei, camp cu camp.
 *
 * ⚠ AICI SE TRATEAZA ALTFEL DECAT LA PALL-EX SI ECOLET, si dinadins.
 *
 * Acolo nu se taie nimic, fiindca specificatia NU declara nicio lungime: singura
 * dovada ar fi venit de la furnizor, ca refuz vizibil. Aici lungimile SUNT
 * declarate, deci le stim inainte — si atunci cea mai buna purtare e sa oprim
 * local, cu un mesaj care spune campul, plafonul si cat s-a masurat. Fara drum
 * dus-intors, si intr-o romana pe care comerciantul o poate urma.
 *
 * Regula: campurile OBLIGATORII prea lungi OPRESC; cele optionale se OMIT, cu
 * avertisment. Un email de 40 de caractere nu are voie sa blocheze un colet.
 */
export const LUNGIMI = {
  codAwb: 30,
  numeExpeditor: 64,
  judetExpeditor: 64,
  localitateExpeditor: 64,
  adresaExpeditor: 128,
  codPostalExpeditor: 64,
  telefonExpeditor: 64,
  emailExpeditor: 32,
  persoanaDeContact: 64,
  numeDestinatar: 128,
  judetDestinatar: 64,
  localitateDestinatar: 64,
  adresaDestinatar: 128,
  codPostalDestinatar: 64,
  telefonDestinatar: 64,
  emailDestinatar: 32,
  continut: 64,
  awbRetur: 13,
  idComanda: 255,
  nrFactura: 255,
  obiectRamburs: 255,
  tipMandat: 16,
  tipPersoana: 16,
} as const;

/** Pragul din documentatie: „obligatorie și de minim 20 de lei pentru orice trimitere cu ramburs". */
export const VALOARE_MINIMA_CU_RAMBURS = 20;

/**
 * Greutatea minima trimisa.
 *
 * ⚠ NU e un prag al Postei — documentatia nu declara niciunul, si nu inventam noi
 * unul (la Woot pragul real a fost 1 kg, dar acela e Woot). E doar garda impotriva
 * lui „0": produsele fara greutate completata ar fi dat `"0"`, iar o trimitere de
 * zero kilograme e sigur respinsa. O suta de grame e cea mai mica declaratie care
 * inca inseamna ceva.
 */
export const GREUTATE_MINIMA_KG = 0.1;

// ─── Judet, localitate, adresa ────────────────────────────────────────────────

/**
 * Judetul, in forma pe care o folosesc EI.
 *
 * ⚠ „Municipiul Bucuresti" devine „Bucuresti": asa scrie in amandoua exemplele
 * lor (`"judetExpeditor" : "Bucuresti "`, `"judetDestinatar" : "Bucuresti"`).
 * Lista noastra canonica il tine cu „Municipiul" in fata, fiindca asa se alege in
 * formularul de comanda.
 *
 * Restul numelor pleaca din lista canonica (fara diacritice, ca in exemplele lor).
 * Un judet nerecunoscut pleaca asa cum l-a scris omul: mai bine o valoare pe care
 * ei o pot respinge vizibil decat una golita in tacere.
 */
export function judetPosta(judet: string | null | undefined): string {
  const canonic = potrivesteJudet(judet);
  if (!canonic) return curata(judet);
  return canonic === "Municipiul Bucuresti" ? "Bucuresti" : canonic;
}

/** Sectoarele Bucurestiului, asa cum apar in formularul de comanda. */
const SECTOR = /^\s*sector\s*([1-6])\s*$/i;

/**
 * Localitatea, in forma pe care o folosesc ei.
 *
 * ⚠ „Sector 3" NU e o localitate pentru Posta. In exemplul lor, un destinatar din
 * Bucuresti are `localitateDestinatar: "Bucuresti"` si sectorul nicaieri — adresa
 * e „Calea Giulesti, nr. 6-8". Trimis ca localitate, „Sector 3" n-ar potrivi nimic
 * in nomenclatorul lor.
 *
 * Deci sectorul se muta in ADRESA (vezi `adresaPosta`), nu se pierde. Aceeasi
 * capcana ca la Sameday, unde sectoarele sunt orase — fiecare furnizor si-o are pe
 * a lui, si de fiecare data se plateste daca se presupune.
 */
export function localitatePosta(oras: string | null | undefined): string {
  return SECTOR.test(oras ?? "") ? "Bucuresti" : curata(oras);
}

/** Sectorul, cand localitatea e chiar el. Altfel `""`. */
export function sectorDinOras(oras: string | null | undefined): string {
  const m = SECTOR.exec(oras ?? "");
  return m ? `Sector ${m[1]}` : "";
}

/**
 * Adresa pe un singur rand, cum o cere campul lor.
 *
 * Ordinea e cea din exemplul lor („Calea Giulesti, nr. 6-8") si cea in care o
 * citeste un factor: sector, strada, numar, bloc, scara, etaj, apartament.
 */
export function adresaPosta(a: AdresaPosta): string {
  const bucati = [
    sectorDinOras(a.oras),
    curata(a.strada),
    curata(a.numar) ? `nr. ${curata(a.numar)}` : "",
    curata(a.bloc) ? `bl. ${curata(a.bloc)}` : "",
    curata(a.scara) ? `sc. ${curata(a.scara)}` : "",
    curata(a.etaj) ? `et. ${curata(a.etaj)}` : "",
    curata(a.apartament) ? `ap. ${curata(a.apartament)}` : "",
  ].filter(Boolean);
  return bucati.join(", ");
}

/**
 * `name` e firma daca exista, altfel persoana — la fel ca la ceilalti curieri.
 * `persoanaDeContact` ramane INTOTDEAUNA persoana: factorul cauta un om.
 */
export function numePosta(a: AdresaPosta): string {
  return curata(a.companie || a.nume);
}

// ─── Numerele, in forma din exemplele lor ─────────────────────────────────────

/**
 * Greutatea, ca SIR, cu punct zecimal.
 *
 * Documentatia: „precizează greutatea coletului, în kilograme, cu separatorul
 * zecimal «.» (punct)". Exemplul: `"0.2"`.
 *
 * ⚠ NU se rotunjeste in sus la kilogram intreg, spre deosebire de eColet (unde
 * specificatia chiar cerea intreg). Aici zecimalele sunt cerute explicit, iar o
 * rotunjire in sus ar umfla tariful postal al fiecarui plic.
 */
export function greutatePosta(kg: unknown): string {
  const n = Number(kg);
  const val = Number.isFinite(n) && n > 0 ? n : GREUTATE_MINIMA_KG;
  const rotunjit = Math.max(GREUTATE_MINIMA_KG, Math.round(val * 1000) / 1000);
  /* `String` da „0.2", „1.5", „2" — exact forma din exemplul lor. */
  return String(rotunjit);
}

/** Bani, ca SIR cu punct zecimal si cel mult doi zecimali („250", „19.99"). */
export function baniPosta(v: unknown): string {
  const n = Number(v);
  const val = Number.isFinite(n) && n > 0 ? n : 0;
  return String(Math.round(val * 100) / 100);
}

/**
 * Valoarea asigurata care se declara.
 *
 * ⚠ Documentatia: „Aceasta este obligatorie și de minim 20 de lei pentru orice
 * trimitere cu ramburs." Deci pragul nu e o alegere de-a noastra, e o conditie.
 * Ce ALEGE comerciantul e daca declara pragul sau valoarea marfii — prima e mai
 * ieftina, a doua il acopera daca se pierde coletul.
 */
export function valoareDeDeclarat(
  ramburs: number,
  valoareMarfa: number,
  mod: ModValoare = "minim",
): number | null {
  const cuRamburs = Number.isFinite(ramburs) && ramburs > 0;
  const marfa = Number.isFinite(valoareMarfa) && valoareMarfa > 0 ? valoareMarfa : 0;

  if (cuRamburs) {
    return mod === "comanda"
      ? Math.max(VALOARE_MINIMA_CU_RAMBURS, marfa)
      : VALOARE_MINIMA_CU_RAMBURS;
  }
  /* Fara ramburs asigurarea e optionala: se declara doar daca omul a cerut-o. */
  return mod === "comanda" && marfa > 0 ? marfa : null;
}

/**
 * „AAAA-LL-ZZ" + „HH:MM" → „ZZ.LL.AAAA HH:mm", formatul lor.
 *
 * ⚠ Ziua e a NOASTRA (cand duce comerciantul coletele), nu una a Postei. Daca
 * data nu se poate citi, se intoarce `""` si campul NU se trimite: mai bine
 * lipseste decat sa plece o data pe care ei o citesc altfel.
 */
export function dataPrezentarePosta(zi: string | null | undefined, ora?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((zi ?? "").trim());
  if (!m) return "";
  const [, a, l, z] = m;
  const o = /^(\d{1,2}):(\d{2})$/.exec((ora ?? "").trim());
  const hh = o ? String(Math.min(23, Number(o[1]))).padStart(2, "0") : "12";
  const mm = o ? String(Math.min(59, Number(o[2]))).padStart(2, "0") : "00";
  return `${z}.${l}.${a} ${hh}:${mm}`;
}

// ─── Ce opreste, si ce doar avertizeaza ───────────────────────────────────────

/** Un camp prea lung, descris pentru om. */
function preaLung(eticheta: string, valoare: string, maxim: number): string {
  return `${eticheta} are ${valoare.length} caractere, iar Posta accepta cel mult ${maxim}`;
}

/**
 * Ce OPRESTE expedierea. Se verifica inaintea oricarei atingeri a furnizorului.
 *
 * Mesajele sunt scrise pentru comerciant: fiecare spune ce lipseste sau ce e prea
 * lung, nu ce camp de API s-a suparat.
 */
export function lipsuriExpediere(d: DateExpediere): string[] {
  const lipsuri: string[] = [];
  const dest = d.destinatar;

  if (!curata(d.codTrimitere)) {
    lipsuri.push(
      "codul de trimitere lipseste din configurare — e identificatorul de contract "
      + "pe care ti l-a comunicat Posta, si fara el nu se poate emite niciun AWB",
    );
  }

  /* ── Destinatarul: toate cele patru campuri marcate obligatoriu ── */
  const nume = numePosta(dest);
  if (!nume) lipsuri.push("numele destinatarului");
  else if (nume.length > LUNGIMI.numeDestinatar) {
    lipsuri.push(preaLung("Numele destinatarului", nume, LUNGIMI.numeDestinatar));
  }

  const judet = judetPosta(dest.judet);
  if (!judet) lipsuri.push("judetul destinatarului");
  else if (judet.length > LUNGIMI.judetDestinatar) {
    lipsuri.push(preaLung("Judetul destinatarului", judet, LUNGIMI.judetDestinatar));
  }

  const localitate = localitatePosta(dest.oras);
  if (!localitate) lipsuri.push("localitatea destinatarului");
  else if (localitate.length > LUNGIMI.localitateDestinatar) {
    lipsuri.push(preaLung("Localitatea destinatarului", localitate, LUNGIMI.localitateDestinatar));
  }

  /*
   * ⚠ STRADA se cere separat, nu doar adresa compusa.
   *
   * Prins de proba: cu strada goala si numarul completat, `adresaPosta` intoarce
   * „nr. 6-8" — un sir NEGOL, deci validarea trecea, iar la Posta pleca o adresa
   * din care lipsea tocmai strada. Campul lor obligatoriu era „completat", si
   * nimic n-ar fi spus nimic pana cand coletul s-ar fi intors nelivrat.
   */
  if (!curata(dest.strada)) lipsuri.push("strada destinatarului");

  const adresa = adresaPosta(dest);
  if (!adresa) lipsuri.push("adresa destinatarului");
  else if (adresa.length > LUNGIMI.adresaDestinatar) {
    lipsuri.push(
      preaLung("Adresa destinatarului", adresa, LUNGIMI.adresaDestinatar)
      + " (scurteaz-o din comanda: strada, numarul, blocul, scara, etajul si apartamentul intra toate in acelasi camp)",
    );
  }

  /* ── Coletul ── */
  if (!curata(d.continut ?? "")) {
    /* Nu ar trebui sa se intample: `corpExpediere` are o rezerva. Ramane ca plasa. */
    lipsuri.push("continutul trimiterii");
  }

  /* ── Rambursul si asigurarea ── */
  const ramburs = Number(d.ramburs);
  if (Number.isFinite(ramburs) && ramburs > 0) {
    const valoare = valoareDeDeclarat(ramburs, Number(d.valoareMarfa), d.modValoare);
    if (valoare === null || valoare < VALOARE_MINIMA_CU_RAMBURS) {
      lipsuri.push(
        `trimiterile cu ramburs cer o valoare declarata de cel putin ${VALOARE_MINIMA_CU_RAMBURS} lei`,
      );
    }
  }

  /* ── Post-restant ── */
  if (d.postRestant) {
    if (!curata(d.idOficiuPR ?? "")) {
      lipsuri.push("oficiul postal de livrare (livrarea la oficiu il cere)");
    }
    /*
     * ⚠ Regula e a lor, scrisa cuvant cu cuvant: „Nu se poate combina serviciul
     * post-restant cu serviciile mana proprie sau factaj livrare." Verificata aici
     * fiindca refuzul lor ar veni intr-un format pe care nu-l putem traduce.
     */
    if (d.servicii?.manaProprie) {
      lipsuri.push("livrarea la oficiu nu se poate combina cu „mana proprie” — stinge una dintre ele");
    }
    if (d.servicii?.factajLivrare) {
      lipsuri.push("livrarea la oficiu nu se poate combina cu „factaj livrare” — stinge una dintre ele");
    }
  }

  /* ── Codul din plaja ── */
  const cod = curata(d.codAwb ?? "");
  if (cod && cod.length > LUNGIMI.codAwb) {
    lipsuri.push(preaLung("Codul AWB din plaja", cod, LUNGIMI.codAwb));
  }

  const awbRetur = curata(d.awbRetur ?? "");
  if (awbRetur && awbRetur.length > LUNGIMI.awbRetur) {
    lipsuri.push(preaLung("Codul AWB de retur", awbRetur, LUNGIMI.awbRetur));
  }

  return lipsuri;
}

/**
 * Ce se omite fara sa opreasca, si de ce.
 *
 * ⚠ `emailDestinatar` are plafonul cel mai strans din toata documentatia: 32 de
 * caractere. Multe adrese reale il depasesc („alexandra.popescu@companie-lunga.ro"
 * are 36). Campul e OPTIONAL, deci un colet nu are voie sa se opreasca din cauza
 * lui — se omite, si comerciantul afla de ce.
 */
export function avertismenteExpediere(d: DateExpediere): string[] {
  const av: string[] = [];
  const email = curata(d.destinatar.email ?? "");
  if (email && email.length > LUNGIMI.emailDestinatar) {
    av.push(
      `Adresa de email a destinatarului (${email.length} caractere) depaseste plafonul de `
      + `${LUNGIMI.emailDestinatar} al Postei, deci nu a fost trimisa. Coletul pleaca normal, `
      + "dar Posta nu-i poate trimite instiintari pe email.",
    );
  }

  const telefon = normalizePhone(d.destinatar.telefon);
  if (!telefon) {
    av.push(
      "Destinatarul nu are telefon in comanda. Posta nu-l poate anunta, iar un colet "
      + "care nu se poate livra se intoarce mai greu.",
    );
  }

  const cod = curata(d.codAwb ?? "");
  if (cod && cod.length !== 13) {
    av.push(
      `Codul AWB generat din plaja are ${cod.length} caractere, dar toate exemplele din `
      + "documentatia Postei au 13. Verifica prefixul si numarul de cifre din configurare.",
    );
  }

  return av;
}

// ─── Corpul ───────────────────────────────────────────────────────────────────

/** Adauga campul doar daca are continut. Campurile goale sunt omise, nu trimise ca „". */
function pune(corp: Record<string, unknown>, cheie: string, valoare: string, maxim?: number): void {
  const v = curata(valoare);
  if (!v) return;
  if (maxim !== undefined && v.length > maxim) return;
  corp[cheie] = v;
}

/** Taie la plafon. Numai pentru texte compuse de NOI, unde taierea nu pierde nimic al omului. */
function taie(text: string, maxim: number): string {
  const v = curata(text);
  return v.length <= maxim ? v : v.slice(0, maxim);
}

/**
 * Comanda Edinio → corpul cerut de `POST /api/awb`.
 *
 * ⚠ Se cheama DUPA `lipsuriExpediere`. Functia asta nu valideaza nimic: ea doar
 * traduce. Chemata pe date incomplete, produce un corp incomplet — si atunci
 * refuzul vine de la Posta, in formatul pe care nu-l intelegem.
 *
 * ⚠ Bifele se trimit TOATE, explicit, si `false` unde nu e cazul — exact ca in
 * exemplul lor. Omise, n-am fi stiut daca implicitul lor e „nu" sau „ca in
 * contract", iar diferenta se plateste la fiecare colet.
 */
export function corpExpediere(d: DateExpediere): Record<string, unknown> {
  const s = d.servicii ?? {};
  const dest = d.destinatar;
  const corp: Record<string, unknown> = {};

  /* ── Codul si tipul trimiterii ── */
  pune(corp, "codAwb", d.codAwb ?? "", LUNGIMI.codAwb);
  corp.codTrimitere = curata(d.codTrimitere);

  /* ── Expeditorul: numai daca a fost cerut anume ── */
  const exp = d.expeditor;
  if (exp) {
    pune(corp, "numeExpeditor", numePosta(exp), LUNGIMI.numeExpeditor);
    pune(corp, "judetExpeditor", judetPosta(exp.judet), LUNGIMI.judetExpeditor);
    pune(corp, "localitateExpeditor", localitatePosta(exp.oras), LUNGIMI.localitateExpeditor);
    pune(corp, "adresaExpeditor", adresaPosta(exp), LUNGIMI.adresaExpeditor);
    pune(corp, "codPostalExpeditor", exp.codPostal ?? "", LUNGIMI.codPostalExpeditor);
    pune(corp, "telefonExpeditor", normalizePhone(exp.telefon), LUNGIMI.telefonExpeditor);
    pune(corp, "emailExpeditor", exp.email ?? "", LUNGIMI.emailExpeditor);
    pune(corp, "persoanaDeContact", exp.persoanaContact || exp.nume || "", LUNGIMI.persoanaDeContact);
  }

  /* ── Destinatarul ── */
  corp.numeDestinatar = taie(numePosta(dest), LUNGIMI.numeDestinatar);
  corp.judetDestinatar = taie(judetPosta(dest.judet), LUNGIMI.judetDestinatar);
  corp.localitateDestinatar = taie(localitatePosta(dest.oras), LUNGIMI.localitateDestinatar);
  corp.adresaDestinatar = taie(adresaPosta(dest), LUNGIMI.adresaDestinatar);
  pune(corp, "codPostalDestinatar", dest.codPostal ?? "", LUNGIMI.codPostalDestinatar);
  pune(corp, "telefonDestinatar", normalizePhone(dest.telefon), LUNGIMI.telefonDestinatar);
  /* Peste plafon, `pune` il omite — vezi `avertismenteExpediere`. */
  pune(corp, "emailDestinatar", dest.email ?? "", LUNGIMI.emailDestinatar);

  /* ── Coletul ── */
  corp.greutateTrimitere = greutatePosta(d.greutateKg);
  corp.continut = taie(curata(d.continut ?? "") || "Produse", LUNGIMI.continut);

  /* ── Banii ── */
  const ramburs = Number(d.ramburs);
  const areRamburs = Number.isFinite(ramburs) && ramburs > 0;
  if (areRamburs) corp.ramburs = baniPosta(ramburs);

  const valoare = valoareDeDeclarat(ramburs, Number(d.valoareMarfa), d.modValoare);
  if (valoare !== null) corp.valoare = baniPosta(valoare);

  /*
   * ⚠ Se trimit doar completate. Valorile lor nu sunt documentate — proza despre
   * `tipAchitareRamburs` se termina literalmente cu o liniuta, iar la `tipMandat`
   * scrie doar ca „trebuie completat in cazul in care se trimite cu ramburs si
   * mandat postal". Un „POSTAL" pus de noi ar fi o afirmatie despre contractul
   * altcuiva.
   */
  if (areRamburs) {
    pune(corp, "tipMandat", d.tipMandat ?? "", LUNGIMI.tipMandat);
    pune(corp, "tipAchitareRamburs", d.tipAchitareRamburs ?? "");
  }

  /* ── Livrarea la oficiu ── */
  const postRestant = !!d.postRestant;
  corp.postRestant = postRestant;
  if (postRestant) pune(corp, "idOficiuPR", d.idOficiuPR ?? "");

  /* ── Bifele de contract ── */
  corp.retur = !!s.retur;
  corp.rambursPostRestant = !!s.rambursPostRestant;
  corp.pcp = !!s.pcp;
  corp.confirmarePrimire = !!s.confirmarePrimire;
  corp.confirmarePrimirePostRestant = !!s.confirmarePrimirePostRestant;
  corp.ec = !!s.ec;
  corp.fragil = !!s.fragil;
  corp.voluminos = !!s.voluminos;
  corp.garantieLivrare = !!s.garantieLivrare;
  corp.desfacereColet = !!s.desfacereColet;
  corp.avizareSms = !!s.avizareSms;
  corp.manaProprie = !!s.manaProprie;
  corp.factajLivrare = !!s.factajLivrare;
  corp.factajPreluare = !!s.factajPreluare;

  /* ── Referintele noastre ── */
  pune(corp, "idComanda", d.idComanda ?? "", LUNGIMI.idComanda);
  pune(corp, "nrFactura", d.nrFactura ?? "", LUNGIMI.nrFactura);
  if (curata(d.obiectRamburs ?? "")) {
    corp.obiectRamburs = taie(d.obiectRamburs ?? "", LUNGIMI.obiectRamburs);
  }
  pune(corp, "awbRetur", d.awbRetur ?? "", LUNGIMI.awbRetur);

  /* ── Persoana fizica sau juridica ── */
  corp.tipPersoana = d.tipPersoana === "JURIDICA" ? "JURIDICA" : "FIZICA";

  /*
   * ⚠ `null`, nu omis, cand nu folosim borderou: asa arata chiar exemplul lor de la
   * 2.2. Si NUMAR cand exista, tot ca in exemplul de la Anexa 1 (`"idBorderou": 555`).
   */
  const borderou = Number(d.idBorderou);
  corp.idBorderou = Number.isInteger(borderou) && borderou > 0 ? borderou : null;

  /* ── Ziua in care comerciantul duce coletele la oficiu ── */
  const dataPrezentare = dataPrezentarePosta(d.dataPrezentare, d.oraPrezentare);
  if (dataPrezentare) corp.dataPrezentarePresetata = dataPrezentare;

  return corp;
}
