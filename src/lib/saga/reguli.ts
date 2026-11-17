/**
 * Regulile de hotarare ale exportului SAGA, PURE: cand se poate reemite o factura, ce comenzi intra
 * in trecerea cronului, cand se probeaza intai, ce scrie registrul, ce i se spune omului cand se
 * opreste lotul.
 *
 * Stau aici, si nu in `server.ts`, ca sa se poata proba pe valori: `server.ts` vorbeste cu baza si cu
 * SAGA si doar aduce datele pentru ele.
 */

import { STARI_INTRATE, STARI_OPRITE_PENTRU_CRON, type CasaFacturare, type StareExport } from "./config";
import {
  documenteleComenzii, emitereaDocumentului,
  type EmitereInRegistru, type PerecheDeDocumente, type RandCuDocumente,
} from "./document-sursa";
import type { RezultatProba, VerdictImport } from "./client";

/* ═══════════════════════════════════════════════════════════════════════════
   REEMITEREA DUPA STORNARE (contractul C2)
   ═══════════════════════════════════════════════════════════════════════════ */

export type DecizieReemitere = { ok: true } | { ok: false; mesaj: string };

/** In SAGA sau poate in SAGA: o factura asa cere stornarea ei acolo, inainte sa fie inlocuita. */
const FACTURA_IN_SAGA = (s: StareExport | undefined) => !!s && (STARI_INTRATE.includes(s) || s === "necunoscut");

/**
 * Stari ale stornarii in care garda NU mai opreste reemiterea, desi stornarea n-a intrat: nicio miscare
 * din Edinio n-o mai poate face sa intre (sau poate a intrat deja), iar omul a fost trimis s-o rezolve in
 * SAGA. Oprita aici, comanda n-ar mai putea fi refacturata NICIODATA.
 *   necunoscut   poate a intrat; daca a intrat, nimic din Edinio nu poate spune asta jurnalului;
 *   respins      SAGA a respins fisierul, cu raport: se corecteaza sau se introduce in SAGA de mana;
 *   nepregatit   n-am putut compune documentul: se introduce in SAGA de mana.
 * Dupa reemitere, plasa `facturiInlocuiteFaraStornare` o spune in panou (mereu) si prin cron (o data).
 */
const STORNARE_LASATA_OMULUI: readonly StareExport[] = ["necunoscut", "respins", "nepregatit"];

/**
 * Se poate emite o factura noua pe comanda? (Garda `sagaPermiteReemiterea`, partea pura.)
 *
 * ⚠⚠ DE CE. La reemitere, casa scrie factura noua peste cea veche si STERGE stornarea de pe comanda.
 * Daca factura veche a intrat in SAGA, iar stornarea ei nu, stornarea nu mai e nicaieri de unde s-o
 * trimitem: in SAGA raman factura veche si cea noua, adica venitul dublat.
 *
 * NU e ok cand, pe o pereche STORNATA, factura e in SAGA (intrata sau `necunoscut`) si stornarea ei nu
 * a intrat, dar POATE pleca din Edinio. Garda nu are voie sa fie o fundatura: opreste numai cand exista
 * o miscare care o dezleaga (trimiterea, citirea numarului), iar mesajul o numeste. Deci trec:
 *   - stornarile care nu pleaca din Edinio (`trimite_stornari` oprit): le introduce contabilul;
 *   - stornarea care nu POATE pleca (numarul de rezerva SmartBill, `motivBlocaj: "necunoscut"`);
 *   - stornarea lasata omului (`STORNARE_LASATA_OMULUI`);
 *   - perechile fara stornare: reemiterea la o casa nu atinge facturile vii ale altei case.
 */
export function decizieReemitere(p: {
  perechi: readonly PerecheDeDocumente[];
  /** Ultima incercare pe fiecare cheie de document. */
  ultima: ReadonlyMap<string, { stare: StareExport }>;
  trimiteStornari: boolean;
}): DecizieReemitere {
  if (!p.trimiteStornari) return { ok: true };
  for (const pereche of p.perechi) {
    const s = pereche.storno;
    if (!s) continue;
    const stareFactura = p.ultima.get(pereche.factura.cheie)?.stare;
    if (!FACTURA_IN_SAGA(stareFactura)) continue;
    const x = pereche.factura.numarComplet || pereche.factura.eticheta;
    const stareStorno = p.ultima.get(s.cheie)?.stare;
    if (stareStorno && STARI_INTRATE.includes(stareStorno)) continue;
    if (stareStorno && STORNARE_LASATA_OMULUI.includes(stareStorno)) continue;
    if (s.motivBlocaj === "necunoscut" || s.motivBlocaj === "test") continue;
    if (s.motivBlocaj === "necitit") {
      return {
        ok: false,
        mesaj: `Stornarea facturii ${x} n-a plecat încă în SAGA, fiindcă numărul ei nu s-a citit. Citește-l din cardul Facturare al comenzii, trimite stornarea din panoul SAGA, apoi emite factura nouă.`,
      };
    }
    if (stareFactura === "necunoscut") {
      return {
        ok: false,
        mesaj: `Factura ${x} a plecat în SAGA, dar nu știm dacă a intrat, iar stornarea ei n-a plecat încă. Verifică în SAGA: dacă factura a intrat, trimite stornarea din panoul SAGA al comenzii; dacă nu, deblochează operația facturii din pagina comenzii și trimite-le pe amândouă. Apoi emite factura nouă.`,
      };
    }
    return {
      ok: false,
      mesaj: `Stornarea facturii ${x} n-a plecat încă în SAGA. Trimite-o din panoul SAGA al comenzii, apoi emite factura nouă.`,
    };
  }
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CRONUL: ce comenzi intra in trecere
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cat de departe in urma se uita cronul dupa documente noi. Mai vechi, le trimite omul. */
export const ZILE_FEREASTRA = 10;

/** De cate ori incearca cronul singur un document refuzat (cerere sau acces), inainte sa-l lase omului. */
export const INCERCARI_AUTOMATE = 3;

export interface CandidatPlan {
  orderId: string;
  cheie: string;
  emisLa: number;
  /** La stornare: cheia facturii ei. */
  facturaCheie: string | null;
  /** Factura acestei stornari a fost emisa INAINTE de pornirea trimiterii automate. */
  facturaDinainte: boolean;
}

/**
 * Documentele candidate ale trecerii: emise prin Edinio dupa pornire, in fereastra, nesarite.
 *
 * ⚠ EMITEREA FACTURII UNEI STORNARI SE CITESTE FARA FEREASTRA (`emiteriFacturi`). Cu fereastra, factura
 * emisa INAINTE de pornire n-avea niciodata randul ei acolo, deci regula „stornarea pleaca singura cand
 * factura e de dinainte de pornire (a introdus-o contabilul)" nu se aplica niciodata.
 */
export function candidatiDePlan(p: {
  comenzi: readonly (RandCuDocumente & { id: string })[];
  /** Emiterile din fereastra cronului, pe comanda. */
  emiteriFereastra: ReadonlyMap<string, EmitereInRegistru[]>;
  /** Emiterile facturilor, FARA fereastra, pe comanda. */
  emiteriFacturi: ReadonlyMap<string, EmitereInRegistru[]>;
  deLa: string;
  trimiteStornari: boolean;
}): CandidatPlan[] {
  const deLa = Date.parse(p.deLa);
  const iesire: CandidatPlan[] = [];
  for (const c of p.comenzi) {
    const fereastra = p.emiteriFereastra.get(c.id) ?? [];
    const facturi = [...(p.emiteriFacturi.get(c.id) ?? []), ...fereastra];
    for (const pereche of documenteleComenzii(c).perechi) {
      const ef = emitereaDocumentului(pereche.factura, facturi);
      const facturaDinainte = !!ef && Date.parse(ef.creatLa) < deLa;
      const lista = pereche.storno && p.trimiteStornari ? [pereche.factura, pereche.storno] : [pereche.factura];
      for (const d of lista) {
        if (d.blocaj) continue;
        const e = emitereaDocumentului(d, fereastra);
        if (!e || Date.parse(e.creatLa) < deLa) continue;
        iesire.push({
          orderId: c.id,
          cheie: d.cheie,
          emisLa: Date.parse(e.creatLa),
          facturaCheie: d.tip === "storno" ? pereche.factura.cheie : null,
          facturaDinainte,
        });
      }
    }
  }
  return iesire;
}

/**
 * Comenzile trecerii, din candidati: in ordinea emiterii, plafonate.
 *
 * ⚠ Stornarea pleaca singura numai dupa factura ei (intrata in SAGA), sau cand factura e de dinainte de
 * pornire. Altfel o stornare in asteptare ar ocupa un loc la fiecare trecere, fara sa faca nimic, si ar
 * infometa documentele noi. Cand factura e ea insasi candidata, comanda intra pentru ea.
 */
export function alegeComenzile(
  candidati: readonly CandidatPlan[],
  ultima: ReadonlyMap<string, { stare: StareExport }>,
  incercari: ReadonlyMap<string, number>,
  limita: number,
): string[] {
  const intrat = (cheie: string) => {
    const u = ultima.get(cheie);
    return !!u && STARI_INTRATE.includes(u.stare);
  };
  const pleacaSingur = (cheie: string) => {
    const u = ultima.get(cheie);
    if (u && STARI_OPRITE_PENTRU_CRON.includes(u.stare)) return false;
    return (incercari.get(cheie) ?? 0) < INCERCARI_AUTOMATE;
  };
  const alesi = candidati
    .filter((c) => {
      if (!pleacaSingur(c.cheie)) return false;
      if (c.facturaCheie && !c.facturaDinainte && !intrat(c.facturaCheie)) {
        return candidati.some((x) => x.cheie === c.facturaCheie) && pleacaSingur(c.facturaCheie);
      }
      return true;
    })
    .sort((a, b) => a.emisLa - b.emisLa);
  const orderIds: string[] = [];
  for (const c of alesi) {
    if (orderIds.length >= limita) break;
    if (!orderIds.includes(c.orderId)) orderIds.push(c.orderId);
  }
  return orderIds;
}

/**
 * Cronul probeaza intai (o citire) cand ultima incercare a magazinului a fost refuzata SAU nelamurita.
 * ⚠ Fara proba dupa `necunoscut`, o pana SAGA ar fi blocat cate un document nou la fiecare trecere,
 * fiecare ramas apoi „nelamurit" si oprit pana il dezleaga un om.
 */
export function trebuieProbaInainte(stare: StareExport | null | undefined): boolean {
  return stare === "refuzat" || stare === "necunoscut";
}

/** Cand panoul spune ca un document netrimis NU mai pleaca singur. `null` = pleaca, sau nu e cazul. */
export function notaTrimitereAutomata(p: {
  trimitereAutomata: boolean;
  /** Pornirea trimiterii automate (ISO). */
  deLa: string | null | undefined;
  /** Clipa emiterii documentului (ISO), din registru. */
  emisLa: string | null;
  acum: number;
}): string | null {
  if (!p.trimitereAutomata || !p.emisLa) return null;
  const t = Date.parse(p.emisLa);
  if (Number.isNaN(t)) return null;
  if (p.deLa && t < Date.parse(p.deLa)) {
    return "Emis înainte de pornirea trimiterii automate, deci nu pleacă singur: trimite-l de aici, dacă nu l-a introdus deja contabilul.";
  }
  if (p.acum - t > ZILE_FEREASTRA * 86_400_000) {
    return `Emis acum mai mult de ${ZILE_FEREASTRA} zile, deci nu mai pleacă singur: trimite-l de aici.`;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE SE SPUNE SI CE SE SCRIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * De ce se opreste seria de trimiteri a magazinului (cronul trece la altul, lotul spune):
 *   acces         SAGA a refuzat cererea (cheia sau codul fiscal): urmatoarele ar fi refuzate la fel;
 *   cheie         SAGA a dat o cheie noua, iar ea nu s-a putut pastra: omul trebuie sa afle;
 *   schimbata     comerciantul a salvat alta cheie chiar atunci: a lui castiga, fara alarma;
 *   ocupat        alt apel tine lacatul magazinului;
 *   indisponibil  SAGA n-a raspuns (sau lacatul nostru): nu se insista pana la trecerea urmatoare;
 *   timp          bugetul de timp al trecerii s-a terminat inainte de urmatorul document.
 */
export type Oprire = null | "acces" | "cheie" | "schimbata" | "ocupat" | "indisponibil" | "timp";

/**
 * Motivul lotului oprit din ALT motiv decat timpul (`BulkResult.motivOprire`). La timp, `null`: acolo
 * lista are textul ei.
 *
 * ⚠ Doar MOTIVUL, ca propozitie intreaga: lista il pune intre „Lotul s-a oprit: " si numarul comenzilor
 * neincercate (`OrdersClient`), deci un text care incepe tot cu „Lotul s-a oprit" s-ar fi citit de doua ori.
 */
export function motivOprireLot(o: Oprire): string | null {
  switch (o) {
    case "acces":
      return "SAGA a refuzat cererea, de obicei din cauza cheii de acces sau a codului fiscal. Verifică legătura în Integrări, SAGA, apoi reia lotul.";
    case "cheie":
      return "SAGA a schimbat cheia de acces, iar cheia nouă nu s-a putut păstra. Dacă următoarea trimitere e refuzată, generează o cheie nouă în SAGA Web și salveaz-o în Integrări, SAGA.";
    case "schimbata":
      return "Cheia SAGA s-a schimbat chiar acum în setări. Reia lotul.";
    case "ocupat":
      return "SAGA lucrează chiar acum cu alt document al magazinului. Reia lotul peste un minut.";
    case "indisponibil":
      return "SAGA nu a răspuns. Verifică în pagina comenzii documentul la care s-a oprit, înainte de a-l retrimite, apoi reia lotul.";
    default:
      return null;
  }
}

/**
 * Ce scrie registrul de operatii externe (`ultima_eroare`) la un import care n-a intrat: starea si
 * codul, NU textul SAGA. Raportul lor poate numi clientul, iar registrul il citesc si paginile de
 * administrare ale platformei; textul intreg sta in jurnal, numai al magazinului.
 */
export function mesajPentruRegistru(fel: VerdictImport["fel"], status: number | null): string {
  const cod = status ? ` (cod ${status})` : "";
  const cum = fel === "respins" ? "respins de SAGA"
    : fel === "refuzat" ? "cerere refuzată de SAGA"
    : fel === "necunoscut" ? "nu știm dacă a intrat"
    : fel;
  return `Trimiterea în SAGA: ${cum}${cod}. Detaliile sunt în panoul SAGA al comenzii.`;
}

/** Ce i se spune omului cand cheia rotita la o proba nu s-a putut pastra. */
export const MESAJ_CHEIE_NESALVATA =
  "SAGA a răspuns, dar a schimbat cheia de acces, iar cheia nouă nu s-a putut păstra. Încearcă din nou; dacă SAGA refuză cererea, generează o cheie nouă în SAGA Web și salveaz-o în Integrări, SAGA.";

/**
 * Verdictul unei probe de conexiune pentru om si pentru cron.
 * ⚠ O proba reusita care a pierdut cheia rotita NU e reusita: urmatorul apel ar pleca cu o cheie
 * pe care SAGA o poate bloca.
 */
export function verdictProba(v: RezultatProba): { ok: true } | { ok: false; refuz: boolean; error: string } {
  if (v.cheieNesalvata) return { ok: false, refuz: false, error: MESAJ_CHEIE_NESALVATA };
  return v.ok ? { ok: true } : { ok: false, refuz: v.refuz, error: v.error };
}

/* ═══════════════════════════════════════════════════════════════════════════
   TVA-UL CASEI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A emis casa CU TVA? (Al treilea argument al lui `invoiceVat`.)
 *
 * ⚠ SmartBill si Oblio emit FARA TVA cand numele cotei e gol in configurarea lor
 * (`smartbill_config.tax_name`, `oblio_config.vat_name`): pentru ele inseamna „nu sunt platitor".
 * Compusa fara acelasi steag, factura din SAGA ar fi avut TVA, iar cea emisa nu.
 *
 * ⚠ Configurarea LIPSA (casa deconectata intre timp) nu e „fara TVA": nu mai stim cum era la emitere,
 * deci ramane regula magazinului (`vat_enabled`), ca la celelalte case.
 *
 * ⚠ Exact testul caselor (`!!config.tax_name`, `!!config.vat_name`), fara `trim`: un nume doar din
 * spatii e „cu TVA" la ele, deci si aici. Un test mai „curat" ar fi dat alt TVA decat factura emisa.
 */
export function tvaPeCasa(setari: { smartbill_config?: unknown; oblio_config?: unknown }): Record<CasaFacturare, boolean> {
  const steag = (config: unknown, camp: string): boolean => {
    if (!config || typeof config !== "object") return true;
    return !!(config as Record<string, unknown>)[camp];
  };
  return {
    smartbill: steag(setari.smartbill_config, "tax_name"),
    oblio: steag(setari.oblio_config, "vat_name"),
    fgo: true,
    facturis: true,
    factureaza: true,
    easybill: true,
  };
}
