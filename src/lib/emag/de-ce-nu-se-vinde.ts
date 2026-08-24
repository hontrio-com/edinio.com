/**
 * De ce nu se vinde o ofertă pe eMAG — motivul adevărat, nu o singură etichetă pentru tot.
 *
 * ═══ ⚠ CE A COSTAT LIPSA LUI (24.08.2026) ═══
 *
 * Ecranul arăta „Trimis, în validare" pentru 3.727 de oferte. Măsurat în aceeași zi:
 * 3.469 dintre ele erau **aprobate de eMAG de mult**, iar 8 din 9 verificate în
 * răspunsul lor brut aveau `status: 2` — scoase din vânzare.
 *
 * Adică eticheta îl trimitea pe comerciant să aștepte o validare încheiată, în loc să se
 * uite la ce chiar lipsește. Iar noi nici nu puteam ști: nu păstram nici starea, nici
 * stocul lor.
 *
 * ⚠ Planul integrării scrie chiar asta ca cerință: *„Panoul trebuie să spună adevărul
 * ăsta întreg, nu «trimis»."* N-o spunea.
 *
 * ═══ ORDINEA CONTEAZĂ ═══
 *
 * O ofertă poate avea mai multe lipsuri deodată. Se spune **prima care oprește vânzarea**,
 * fiindcă aia e cea de reparat întâi: n-are rost să-i spui cuiva „n-are stoc" despre un
 * produs pe care eMAG l-a respins oricum.
 */

import { EMAG_VALIDARE_VANDABILA } from "./types";
import { eRespinsaDeEmag } from "./motive";

/** Starea ofertei la ei: 1 activă · 0 oprită · 2 scoasă din vânzare (End of Life). */
export const EMAG_OFERTA_ACTIVA = 1;
export const EMAG_OFERTA_OPRITA = 0;
export const EMAG_OFERTA_SCOASA = 2;

/**
 * Stările în care eMAG chiar se uită acum la ofertă, din documentația lor.
 *
 * 1 = așteaptă MKTP · 2 = așteaptă marca · 4 = așteaptă documentația.
 *
 * ⚠ LISTĂ ÎNCHISĂ, ANUME. „Orice nu e vandabil înseamnă în validare" e o presupunere, iar
 * ei trimit și `0`, care nu există în enumul lor. Cu 61 de oferte așa pe un cont adevărat,
 * din care 42 chiar OPRITE, presupunerea îi spunea omului „nu ai nimic de făcut".
 */
export const EMAG_VALIDARE_IN_CURS: readonly number[] = [1, 2, 4] as const;

export interface StareaLaEmag {
  validation_status: number | null;
  offer_validation_status: number | null;
  status_la_ei: number | null;
  stoc_la_ei: number | null;
  /** Ce ne-au spus ei, dacă ne-au spus ceva. */
  doc_errors: string[];
}

export interface MotivulOpririi {
  /** Ce se arată pe rând, scurt. */
  eticheta: string;
  /** Ce are omul de făcut, dacă are. Gol când nu e nimic de făcut. */
  indrumare: string;
  /** Se vinde chiar acum? */
  seVinde: boolean;
}

export function deCeNuSeVinde(o: StareaLaEmag): MotivulOpririi {
  /*
   * ⚠ 1. RESPINSĂ — se spune prima, fiindcă restul nu mai contează.
   *
   * ═══ ⚠ CE SCRIA AICI ERA FALS, ȘI A COSTAT (îndreptat 24.08.2026) ═══
   *
   * Textul de rezervă spunea „eMAG nu trimite motivul prin API". Îl trimiteau: stătea
   * la `validation_status[].errors.errors[].message.ro_RO`, iar noi ne uitam numai la
   * chei de nivel întâi. Măsurat pe cele 154 de oferte respinse ale unui comerciant, 68
   * au un motiv scris în română, direct acționabil — „Marime — Te rugăm să adaugi
   * mărimea produsului…". Toate 68 primeau propoziția asta, care îi spunea să caute în
   * altă parte ceva ce era deja la noi.
   *
   * ⚠ Pentru celelalte 86 chiar n-au trimis nimic (34 blocate, 52 numai cu note de
   * tipul „valoarea a fost generată automat", care nu sunt motive). Deci se spune CE E:
   * pentru oferta ASTA n-au scris nimic — nu că nu scriu niciodată.
   */
  if (eRespinsaDeEmag(o.validation_status)) {
    return {
      eticheta: "Respins de eMAG",
      indrumare: o.doc_errors.length > 0
        ? o.doc_errors.join(" · ")
        : "eMAG nu a trimis niciun motiv pentru oferta asta. Îl vezi în panoul lor, la „Rezolvă erori produse”.",
      seVinde: false,
    };
  }

  /*
   * ⚠ 2. Încă în validare. Aici chiar nu e nimic de făcut, si se spune asa.
   *
   * ═══ ⚠ NUMAI STĂRILE PE CARE LE ȘTIM DIN DOCUMENTAȚIA LOR (24.08.2026) ═══
   *
   * Forma dinainte era „orice nu e vandabil înseamnă în validare". Sună rezonabil și e
   * o presupunere: eMAG trimite și `validation_status: 0`, valoare care NU EXISTĂ în
   * enumul lor. Măsurat pe contul real, 61 de oferte așa — iar **42 dintre ele sunt
   * OPRITE** în contul lui (`status_la_ei = 0`).
   *
   * ⚠ Deci ecranul le spunea la toate 42 „Validarea lor e făcută de oameni și poate
   * dura. Nu ai nimic de făcut" — când de fapt avea ceva de făcut, o apăsare în panoul
   * eMAG, iar altfel aștepta la nesfârșit ceva ce nu venea.
   *
   * Acum ramura prinde numai stările documentate ca fiind chiar în validare, iar ce nu
   * știm trece mai departe la verificările de dedesubt, care pot explica adevărat.
   */
  if (o.validation_status != null && EMAG_VALIDARE_IN_CURS.includes(o.validation_status)) {
    return {
      eticheta: "În validare la eMAG",
      indrumare: "Validarea lor e făcută de oameni și poate dura. Nu ai nimic de făcut.",
      seVinde: false,
    };
  }

  /*
   * ⚠ 3. Aprobată, dar oprită sau scoasă LA EI.
   *
   * Cazul care a stat ascuns în spatele lui „Trimis, în validare". Comerciantul o poate
   * porni numai din panoul eMAG: `offer/save` cu `status` ar rescrie o hotărâre pe care
   * a luat-o el acolo.
   */
  if (o.status_la_ei === EMAG_OFERTA_SCOASA) {
    return {
      eticheta: "Scoasă din vânzare la eMAG",
      indrumare: "Oferta e marcată „End of Life” în contul tău eMAG. Se repornește din panoul lor.",
      seVinde: false,
    };
  }
  if (o.status_la_ei === EMAG_OFERTA_OPRITA) {
    return {
      eticheta: "Oprită la eMAG",
      indrumare: "Oferta e inactivă în contul tău eMAG. O pornești din panoul lor.",
      seVinde: false,
    };
  }

  /* ⚠ 4. Oferta e respinsă pe pretul ei: `offer_validation_status` 2 = „Invalid price". */
  if (o.offer_validation_status != null && o.offer_validation_status !== 1) {
    return {
      eticheta: "Preț neacceptat de eMAG",
      indrumare: "Prețul iese din intervalul pe care îl acceptă ei. Verifică-l în fișa produsului.",
      seVinde: false,
    };
  }

  /* ⚠ 5. Fara stoc LA EI. Ultimul, fiindca e cel mai usor de reparat si cel mai des. */
  if (o.stoc_la_ei != null && o.stoc_la_ei <= 0) {
    return {
      eticheta: "Fără stoc la eMAG",
      indrumare: "Oferta e aprobată și activă, dar are zero bucăți la ei.",
      seVinde: false,
    };
  }

  /*
   * ⚠ Când n-am citit încă starea lor, NU se pretinde că se vinde.
   *
   * `null` înseamnă „n-am întrebat încă", nu „e în regulă". Confundate, un rând necitit
   * ar fi arătat verde, iar omul ar fi crezut că se vinde ceva ce poate nici nu există.
   */
  if (o.status_la_ei == null || o.stoc_la_ei == null) {
    return {
      eticheta: "Încă necitit de la eMAG",
      indrumare: "Se citește la următoarea trecere. Revino în câteva minute.",
      seVinde: false,
    };
  }

  /*
   * ⚠ O STARE PE CARE N-O ȘTIM NU E „ÎN REGULĂ".
   *
   * Ajunge aici o ofertă cu `validation_status` în afara enumului lor (`0` la 19 oferte
   * active, măsurat) pe care restul verificărilor n-au putut-o explica. Trecută drept
   * „se vinde", ar fi arătat verde pe ceva despre care nu știm nimic.
   *
   * ⚠ Și e chiar starea pentru care merită păstrat răspunsul brut: dacă apare des, aflăm
   * ce înseamnă din date, nu dintr-o a doua presupunere.
   */
  if (o.validation_status != null && !EMAG_VALIDARE_VANDABILA.includes(o.validation_status)) {
    return {
      eticheta: "Stare necunoscută la eMAG",
      indrumare: `eMAG a trimis o stare pe care documentația lor n-o descrie (${o.validation_status}). Verific-o în panoul lor.`,
      seVinde: false,
    };
  }

  return { eticheta: "Se vinde pe eMAG", indrumare: "", seVinde: true };
}
