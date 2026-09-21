import type { FurnizorSms } from "./furnizori-sms";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CINE PRIMESTE, CAND, SI PANA LA CE LIMITA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ O SINGURA HOTARARE, INTR-UN SINGUR LOC. Regulile astea se verifica pe doua
  drumuri (cronul si trimiterea de mana) si sunt vreo doisprezece. Imprastiate
  prin `if`-uri pe fiecare drum, ar fi ajuns sa nu se mai potriveasca intre ele:
  un cos oprit de cron ar fi putut pleca din panou, si nimeni n-ar fi stiut de ce.

  ⚠ SI FIECARE REFUZ ISI SPUNE MOTIVUL. „Nu s-a trimis" il face pe comerciant
  sa apese din nou, si iar, si sa creada ca e stricat. Motivul e si el o regula:
  se scrie pentru OM, nu pentru loguri.

  ⚠ CE NU E AICI: suprimarea (dezabonarile), cosurile ignorate, cele deja
  convertite si fereastra de sase luni. Alea nu sunt REGULI ALE COMERCIANTULUI,
  ci promisiuni pe care le tinem noi, si stau in alta parte tocmai ca sa nu se
  poata stinge dintr-un formular.
*/

export type FelClienti = "toti" | "noi" | "revin";

/**
 * Cum a inceput cosul.
 *
 * ⚠ NU E O LISTA INCHISA, SI ASTA S-A MASURAT. In productie sunt „buy_now"
 * (278) si „cart" (111); pe baza demo mai apare si „checkout". Scrisa ca doua
 * valori fixe, filtrarea ar fi aruncat tacut o treime din cosuri - si pe
 * magazinul unde valoarea e alta, pe toate.
 *
 * Regula compara siruri; ecranul arata doar sursele care CHIAR exista la
 * magazinul acela.
 */
export type SursaCos = string;

/** Cum se numeste pe ecran fiecare sursa pe care o cunoastem. */
export const NUMELE_SURSEI: Record<string, string> = {
  cart: "Coș",
  buy_now: "Cumpără acum",
  checkout: "Finalizare",
};

export function numeleSursei(s: string | null | undefined): string {
  if (!s) return "Necunoscută";
  return NUMELE_SURSEI[s] ?? s;
}

export interface ReguliAutomatizare {
  /** Sub cat nu merita sa trimiti. */
  min_cart_value?: number | null;
  /**
   * Peste cat nu trimiti.
   *
   * ⚠ Exista fiindca un cos de zece mii de lei e de obicei un test sau o
   * comanda pentru firma, si un memento automat acolo arata prost.
   */
  max_cart_value?: number | null;
  clienti?: FelClienti;
  /** Numai cosurile care contin macar unul dintre produsele astea. */
  produse?: string[];
  /** Numai cosurile venite pe drumurile astea. */
  surse?: SursaCos[];

  /** Ore de liniste, separat pe canal. `null` inseamna „fara". */
  quiet_hours?: { start: number; end: number } | null;
  quiet_hours_email?: { start: number; end: number } | null;
  /** Zilele saptamanii in care nu se trimite (0 = duminica). */
  zile_oprite?: number[];
  /** Cate mesaje poate primi un client in 30 de zile, cu tot cu alte cosuri. */
  max_mesaje_pe_client?: number | null;
  /** Cate zile trebuie sa treaca de la ultimul mesaj catre acelasi client. */
  pauza_zile?: number | null;

  /** Cate SMS-uri pe luna, pe tot magazinul. */
  plafon_sms_lunar?: number | null;
  /** Cate mesaje pe zi, pe tot magazinul, pe amandoua canalele. */
  plafon_zilnic?: number | null;
  /**
   * La ce rata de dezabonare se opreste singura.
   *
   * ⚠ In procente din mesajele trimise in ultimele 30 de zile. Peste prag,
   * automatizarea tace pana cand omul se uita: mai bine pierdem cateva
   * recuperari decat reputatia expeditorului.
   */
  prag_dezabonare?: number | null;
}

/** Ce stim despre cosul si despre magazinul asta, in clipa trimiterii. */
export interface Dosar {
  canal: "email" | "sms";
  furnizor?: FurnizorSms;
  valoare: number;
  sursa: SursaCos | string | null;
  produse: string[];
  /** A mai comandat vreodata clientul asta? `null` cand nu se stie. */
  aMaiComandat: boolean | null;
  /** Cate mesaje a primit clientul in ultimele 30 de zile. */
  mesajeCatreClient: number;
  /** De cate zile a primit ultimul mesaj. `null` daca n-a primit niciodata. */
  zileDeLaUltimul: number | null;
  /** Cate SMS-uri a trimis magazinul luna asta. */
  smsLunaAsta: number;
  /** Cate mesaje a trimis magazinul azi. */
  mesajeAzi: number;
  /** Dezabonari si mesaje in ultimele 30 de zile, pentru prag. */
  dezabonari30: number;
  mesaje30: number;
  /** Ceasul, in ora Romaniei. */
  ora: number;
  ziSaptamanii: number;
}

export interface Refuz {
  cheie: string;
  motiv: string;
}

const ZILE = ["duminica", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];

/**
 * E in fereastra de liniste?
 *
 * ⚠ FEREASTRA POATE TRECE PESTE MIEZUL NOPTII (22 → 8), si atunci nu mai e un
 * interval obisnuit: „ora >= 22 SAU ora < 8". Scris ca `start <= ora < end`,
 * linistea de noapte n-ar fi prins niciodata nicio ora.
 */
export function eLiniste(ora: number, f: { start: number; end: number } | null | undefined): boolean {
  if (!f) return false;
  const { start, end } = f;
  /* ⚠ Inceput = sfarsit inseamna toata ziua; vezi capcana din `capcane-automatizare`. */
  if (start === end) return true;
  return start < end ? ora >= start && ora < end : ora >= start || ora < end;
}

/**
 * Poate pleca mesajul asta?
 *
 * `null` inseamna da. Altfel, primul motiv care il opreste - unul singur,
 * fiindca omului nu-i folosesc patru.
 */
export function refuzulRegulilor(r: ReguliAutomatizare, d: Dosar): Refuz | null {
  /* ── Cine primeste ──────────────────────────────────────────────────── */
  if (r.min_cart_value != null && d.valoare < r.min_cart_value) {
    return {
      cheie: "sub-minim",
      motiv: `Coșul are ${d.valoare.toFixed(2)} lei, sub minimul de ${r.min_cart_value} lei pe care l-ai pus.`,
    };
  }
  if (r.max_cart_value != null && d.valoare > r.max_cart_value) {
    return {
      cheie: "peste-maxim",
      motiv: `Coșul are ${d.valoare.toFixed(2)} lei, peste maximul de ${r.max_cart_value} lei pe care l-ai pus.`,
    };
  }
  if (r.clienti && r.clienti !== "toti") {
    /*
      ⚠ CAND NU SE STIE, NU SE TRIMITE. Un client fara istoric citit ar putea
      fi si nou, si vechi; ghicit gresit, primeste un mesaj scris pentru
      altcineva („bine ai revenit" catre cineva care n-a cumparat niciodata).
    */
    if (d.aMaiComandat === null) {
      return { cheie: "istoric-necunoscut", motiv: "Nu am putut afla dacă e client nou sau revenit, deci nu s-a trimis." };
    }
    if (r.clienti === "noi" && d.aMaiComandat) {
      return { cheie: "nu-e-nou", motiv: "Ai ales să trimiți doar clienților noi, iar acesta a mai comandat." };
    }
    if (r.clienti === "revin" && !d.aMaiComandat) {
      return { cheie: "nu-a-comandat", motiv: "Ai ales să trimiți doar clienților care au mai comandat." };
    }
  }
  if (r.produse?.length) {
    const are = d.produse.some((p) => r.produse!.includes(p));
    if (!are) {
      return { cheie: "alte-produse", motiv: "Coșul nu conține niciunul dintre produsele pe care le-ai ales." };
    }
  }
  if (r.surse?.length && !r.surse.includes(String(d.sursa ?? ""))) {
    return { cheie: "alta-sursa", motiv: "Coșul a venit pe un drum pe care nu l-ai bifat." };
  }

  /* ── Cand ───────────────────────────────────────────────────────────── */
  if (r.zile_oprite?.includes(d.ziSaptamanii)) {
    return { cheie: "zi-oprita", motiv: `Ai oprit trimiterile ${ZILE[d.ziSaptamanii]}.` };
  }
  const liniste = d.canal === "sms" ? r.quiet_hours : r.quiet_hours_email;
  if (eLiniste(d.ora, liniste)) {
    return {
      cheie: "ore-liniste",
      motiv: `E ${d.ora}:00, în orele de liniște pe care le-ai pus pentru ${d.canal === "sms" ? "SMS" : "email"}.`,
    };
  }
  if (r.max_mesaje_pe_client != null && d.mesajeCatreClient >= r.max_mesaje_pe_client) {
    return {
      cheie: "prea-multe-pe-client",
      motiv: `Clientul a primit deja ${d.mesajeCatreClient} mesaje în ultimele 30 de zile, iar limita ta e ${r.max_mesaje_pe_client}.`,
    };
  }
  if (r.pauza_zile != null && d.zileDeLaUltimul != null && d.zileDeLaUltimul < r.pauza_zile) {
    return {
      cheie: "prea-devreme",
      motiv: `Ultimul mesaj către acest client a plecat acum ${d.zileDeLaUltimul} zile, iar pauza ta e de ${r.pauza_zile}.`,
    };
  }

  /* ── Limite pe tot magazinul ────────────────────────────────────────── */
  if (d.canal === "sms" && r.plafon_sms_lunar != null && d.smsLunaAsta >= r.plafon_sms_lunar) {
    return {
      cheie: "plafon-sms",
      motiv: `Ai atins plafonul de ${r.plafon_sms_lunar} SMS-uri pe lună (${d.smsLunaAsta} trimise). Se reia luna viitoare.`,
    };
  }
  if (r.plafon_zilnic != null && d.mesajeAzi >= r.plafon_zilnic) {
    return {
      cheie: "plafon-zilnic",
      motiv: `Ai atins plafonul de ${r.plafon_zilnic} mesaje pe zi (${d.mesajeAzi} trimise azi).`,
    };
  }
  if (r.prag_dezabonare != null && d.mesaje30 > 0) {
    /*
      ⚠ SE CERE UN MINIM DE MESAJE ca sa aiba sens procentul. O dezabonare din
      trei mesaje e 33% si nu inseamna nimic; oprita acolo, automatizarea s-ar
      fi stins la a doua zi de folosire.
    */
    const rata = (d.dezabonari30 / d.mesaje30) * 100;
    if (d.mesaje30 >= 20 && rata >= r.prag_dezabonare) {
      return {
        cheie: "prag-dezabonare",
        motiv: `Rata de dezabonare e ${rata.toFixed(1)}% în ultimele 30 de zile, peste pragul tău de `
          + `${r.prag_dezabonare}%. Automatizarea s-a oprit singură: uită-te la mesaje înainte să o repornești.`,
      };
    }
  }

  return null;
}

/*
  ═══════════════════════════════════════════════════════════════════════════
  CARE REGULI PRIVESC SI TRIMITEREA FACUTA CU MANA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ NU TOATE, SI ASTA E O HOTARARE. Regulile se impart in doua feluri:

  **Tintire** - sub cat, peste cat, ce fel de clienti, ce produse, ce surse.
  Ele raspund la „pe cine cauta automatizarea". Un mesaj trimis de mana e DEJA
  tintit: omul s-a uitat la cosul ala si a apasat pe el. Oprit fiindca „ai pus
  minimul la 300 de lei", panoul ar refuza tocmai ce i-a cerut comerciantul.

  **Plafoane si liniste** - cate SMS-uri pe luna, cate mesaje pe zi, orele de
  liniste, cate mesaje poate primi un om, pauza dintre ele, pragul de
  dezabonare. Ele nu raspund la „pe cine", ci la „cat" si „cand" - si sunt
  puse tocmai ca sa apere de greseli facute in graba. Un SMS la 3 noaptea
  deranjeaza la fel, apasat de mana sau de cron.
*/
const DOAR_AUTOMATIZARE = new Set([
  "sub-minim", "peste-maxim", "nu-e-nou", "nu-a-comandat",
  "istoric-necunoscut", "alte-produse", "alta-sursa",
]);

/** Refuzul care opreste si o trimitere facuta de mana. `null` daca trece. */
export function refuzulLaMana(r: ReguliAutomatizare, d: Dosar): Refuz | null {
  const refuz = refuzulRegulilor(r, d);
  if (!refuz) return null;
  if (DOAR_AUTOMATIZARE.has(refuz.cheie)) {
    /*
      ⚠ SE RELUA VERIFICAREA FARA REGULILE DE TINTIRE, nu se intoarce „trece".
      Un cos poate incalca si o regula de tintire, si un plafon; oprit la prima
      si lasat sa treaca, ar fi sarit tocmai plafonul.
    */
    const faraTintire: ReguliAutomatizare = {
      ...r,
      min_cart_value: null, max_cart_value: null,
      clienti: "toti", produse: [], surse: [],
    };
    return refuzulRegulilor(faraTintire, d);
  }
  return refuz;
}
