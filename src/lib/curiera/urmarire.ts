import { stareaSaSchimbat } from "@/lib/orders/semnalarea-ajunge-la-om";
import type { EvenimentCuriera, FelEroareCuriera, StareCuriera } from "./client";
import {
  cheieStare,
  descriereEveniment,
  descriereStare,
  esteRetur,
  normalizeazaStatus,
  statusDinCheie,
  trebuieSemnalat,
  type StatusCuriera,
} from "./statusuri";

/**
 * Hotararile cronului `curiera-tracking`, scoase din ruta ca sa poata fi probate pe purtare.
 *
 * Ruta tine drumurile (baza, reteaua, ordinea scrierilor); aici stau regulile: ce inseamna
 * „necunoscut", cand se citeste istoricul, ce se spune omului si ce alarma se ridica.
 */

/** Ce a aflat lotul despre un AWB. */
export type Citire =
  | { fel: "necunoscut" }
  | {
      fel: "stare";
      /** Starea in forma romaneasca; `null` = o stare pe care n-o stim (nu misca nimic). */
      status: StatusCuriera | null;
      /** Starea cum au scris-o ei, ca sa se poata strange pe nume. */
      brut: string;
      /** Cheia salvata pe comanda: `stare|cod`. */
      cheie: string;
      /** Cheia difera de cea scrisa pe comanda. */
      schimbata: boolean;
      /** Se citeste istoricul, ca sa nu se piarda evenimentele dintre doua treceri. */
      cereIstoric: boolean;
      eticheta: string;
      /** Clipa starii (ISO), sau `null` cand ei dau 0. */
      la: string | null;
    };

/**
 * Citirea unei intrari din `get_status`.
 *
 * ⚠⚠ Un AWB necunoscut NU lipseste si NU da eroare: vine `status: "done"` cu intrarea goala
 * (`no: ""`, `status: ""`, masurat pe 29.09.2026). Deci numarul gol e „necunoscut", niciodata
 * o stare: nu se scrie nimic si nu se socoteste verificat.
 *
 * ⚠ Istoricul se cere doar la SCHIMBARE, si nu pentru `neridicat`/`initial`: acelea vin la
 * emitere, deci fiecare AWB nou ar costa un apel fara sa poata avea vreun eveniment-problema
 * inainte (livrarea esuata vine abia dupa ridicare).
 *
 * ⚠ SCHIMBARE inseamna si CLIPA starii, nu doar cheia `stare|cod`. Un colet `avizat|A2` (spus),
 * reincarcat (`in_curs`) si esuat din nou cu acelasi motiv intre doua treceri revine la ACEEASI
 * cheie: judecat numai pe cheie, a doua livrare esuata, de obicei ultima inaintea returului, nu
 * s-ar fi spus niciodata. `date` din `get_status` e clipa ultimei stari (masurat: egala cu
 * `event_date` al lui `StatusChanged`), deci o clipa noua cere istoricul. Memoria semnalarilor
 * opreste dublurile. Clipa salvata vine din baza ca text; se compara in milisecunde.
 */
export function citesteStarea(
  s: StareCuriera | undefined,
  cheieSalvata: string | null,
  clipaSalvata: string | null = null,
): Citire {
  if (!s || !s.no || !s.status) return { fel: "necunoscut" };
  const status = normalizeazaStatus(s.status);
  const cheie = cheieStare(s.status, s.cod);
  const schimbata = stareaSaSchimbat(cheieSalvata, cheie);
  const salvataMs = clipaSalvata ? Date.parse(clipaSalvata) : NaN;
  const clipaNoua = s.data !== null && (!Number.isFinite(salvataMs) || salvataMs !== s.data * 1000);
  return {
    fel: "stare",
    status,
    brut: s.status,
    cheie,
    schimbata,
    cereIstoric: (schimbata || clipaNoua) && status !== "neridicat" && status !== "initial",
    eticheta: descriereStare(s.status, s.cod, s.numeCod),
    /* Unixtime in SECUNDE la ei. */
    la: s.data ? new Date(s.data * 1000).toISOString() : null,
  };
}

/**
 * Se spune ceva omului?
 *
 *   istoric citit (`evenimente` nu e `null`)  -> doar daca are evenimente NESPUSE inca;
 *   istoric necitit sau picat                -> starea curenta, daca cere atentie si e NOUA.
 *
 * ⚠ Cu istoricul citit, starea curenta nu se mai striga separat: ea e deja printre evenimente,
 * iar memoria de pe comanda stie daca a fost spusa. Strigata si aici, ar veni de doua ori.
 */
export function trebuieSpus(c: Extract<Citire, { fel: "stare" }>, evenimente: EvenimentCuriera[] | null): boolean {
  if (evenimente !== null) return evenimente.length > 0;
  return trebuieSemnalat(c.cheie) && c.schimbata;
}

/**
 * Notificarea pentru comerciant: O SINGURA pe comanda si trecere, cu toate evenimentele noi.
 *
 * ⚠ Textul spune si ce inseamna. „avizat|A2" nu-i spune nimic cuiva care n-a vazut codurile lor.
 */
export function semnalareCuriera(p: {
  orderNumber: string | null;
  awb: string;
  cheie: string;
  eticheta: string;
  /** Evenimentele noi din istoric; `null` = se spune starea curenta. */
  evenimente: EvenimentCuriera[] | null;
}): { titlu: string; mesaj: string } {
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const ce = p.evenimente && p.evenimente.length > 0 ? p.evenimente.map(descriereEveniment) : [p.eticheta];
  const lista = ce.join("; ");

  if (esteRetur(p.cheie)) {
    return {
      titlu: "Colet Curiera returnat",
      mesaj: `${comanda}: coletul ${p.awb} se intoarce la tine (${lista}). Marfa vine inapoi, iar rambursul NU s-a incasat: anularea comenzii si returul banilor raman decizia ta.`,
    };
  }
  /*
   * ⚠ Anularea noastra scoate AWB-ul de pe comanda, deci una vazuta de cron s-a facut din contul
   * Curiera. Comanda ramane cu un numar care nu mai poarta nimic.
   */
  if (statusDinCheie(p.cheie) === "anulat") {
    return {
      titlu: "AWB Curiera anulat",
      /* ⚠ Fara „nu din Edinio": o anulare pornita din Edinio al carei raspuns s-a pierdut (sau a
         carei dezlegare n-a apucat sa scrie) ajunge tot aici, si omul ar cauta pe altcineva. */
      mesaj: `${comanda}: AWB-ul ${p.awb} a fost anulat la Curiera (${lista}). Coletul nu mai pleaca. Scoate numarul de pe comanda (Editeaza comanda, Anuleaza AWB) inainte sa emiti altul.`,
    };
  }
  const cate = ce.length === 1 ? "un eveniment care cere" : `${ce.length} evenimente care cer`;
  return {
    titlu: "Expediere Curiera care cere atentie",
    mesaj: `${comanda}: expedierea ${p.awb} are ${cate} o decizie: ${lista}. Deschide comanda pentru istoricul complet.`,
  };
}

/**
 * Socoteala unui magazin intr-o trecere.
 *
 * ⚠ Cheile de esec sunt EXACT felurile din `felulEroriiCuriera`, ca ruta sa poata scrie
 * `g[felulEroriiCuriera(e)]`: un fel nou in client nu poate ajunge intr-o galeata gresita fara
 * ca `tsc` sa cada.
 */
export type Galeata = Record<FelEroareCuriera, number> & {
  necunoscute: number;
  reusite: number;
  /** Primul mesaj de eroare care nu e de autentificare, pentru alarma. */
  exemplu: string;
};

export function galeataGoala(): Galeata {
  return { autentificare: 0, indisponibil: 0, refuz: 0, necunoscute: 0, reusite: 0, exemplu: "" };
}

export type Alarma = { severity: "critical" | "warning"; fel: string; mesaj: string };

/**
 * Alarma unui magazin, sau `null`.
 *
 * ⚠ PE MAGAZIN, si numai fara nicio reusita: un magazin sanatos nu are voie sa ascunda cheia
 * expirata a vecinului (lectia GLS), dar nici cateva esecuri printre sute de reusite nu sunt
 * alarma.
 *
 * ⚠⚠ Cauza numita se alege dupa galeata. BAD_LOGIN vine pe HTTP 200 la ei, deci o impartire pe
 * coduri HTTP (ca la Posta) n-ar porni niciodata; se imparte dupa felul erorii. Si numai
 * BAD_LOGIN primeste sfatul „verifica cheia": pe o cadere la ei, omul ar schimba o cheie buna.
 */
export function alarmaMagazinului(
  g: Galeata,
  praguri: { autentificare: number; esecuri: number; necunoscute: number },
): Alarma | null {
  if (g.reusite > 0) return null;
  if (g.autentificare >= praguri.autentificare) {
    return {
      severity: "critical",
      fel: "autentificare",
      mesaj: `Curiera a respins cheia API (BAD_LOGIN) pentru toate cele ${g.autentificare} expedieri verificate ale magazinului. Verifica cheia din configurarea Curiera.`,
    };
  }
  const altele = g.indisponibil + g.refuz;
  if (altele >= praguri.esecuri) {
    return {
      severity: "warning",
      fel: "indisponibil",
      mesaj: `urmarirea Curiera a esuat pentru toate cele ${altele} expedieri verificate ale magazinului, dar NU din cauza cheii: ${g.exemplu || "fara raspuns"}. Curiera nu raspunde sau a refuzat cererea; nu schimba cheia.`,
    };
  }
  if (g.necunoscute >= praguri.necunoscute) {
    return {
      severity: "warning",
      fel: "necunoscute",
      mesaj: `Curiera nu recunoaste niciunul dintre cele ${g.necunoscute} AWB-uri ale magazinului. Cel mai probabil cheia din configurare e a altui cont decat cel cu care s-au emis expedierile.`,
    };
  }
  return null;
}
