/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETELE UNUI CLIENT                                        (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana acum exista UNA singura, „Fidel", care se aprindea la a doua comanda.
 * Proprietarul a cerut sase: Nou, Recurent, VIP, Inactiv, Importat si Risc
 * ridicat de retur.
 *
 * ⚠ REGULA DE FOND: o eticheta trebuie sa aiba pe ce sta. Una care nu se poate
 * aprinde niciodata e mai rea decat lipsa ei — ocupa loc, pare o functie, si
 * cine o cauta crede ca s-a stricat ceva.
 *
 * ═══ ⚠ CE S-A MASURAT INAINTE SA FIE SCRISE (productie, 21.09.2026) ═══
 *
 * Pe cei 493 de clienti ai platformei:
 *
 *     Noi (comanda in ultimele 30 de zile) ....... 249
 *     Recurenti (peste o comanda valida) .......... 6
 *     Inactivi (nimic de peste 90 de zile) ....... 10
 *     Cu macar un retur .......................... 20
 *     Cu cel putin 3 comenzi valide ............... 2
 *     Care au cheltuit peste 1.000 lei ............ 0
 *
 * ⚠⚠ NIMENI N-A CHELTUIT PESTE 1.000 DE LEI. Cel mai mare client al platformei
 * are 968,99 lei in tot istoricul, iar pragul de 95% e 256,52. Un prag de VIP
 * ales de noi, fix, s-ar aprinde pentru ZERO oameni — si ar ramane asa pana cand
 * cineva s-ar intreba de ce nu merge. De aceea pragurile sunt ale
 * COMERCIANTULUI: un magazin de hrana pentru animale si unul de mobila nu pot
 * imparti aceeasi cifra.
 *
 * ⚠⚠ SI DE CE „RISC RIDICAT DE RETUR" CERE TREI COMENZI. Toti cei 20 de oameni
 * cu retur au o SINGURA comanda — chiar cea returnata. Cu regula „macar un
 * retur", toti ar fi fost etichetati drept risc, pe baza unui singur fapt, care
 * poate fi un produs gresit trimis de magazin. O rata are nevoie de un numitor.
 * Cu trei comenzi, eticheta se aprinde azi pentru nimeni, si asta e raspunsul
 * CORECT, nu un defect.
 */

export type FelEticheta = "nou" | "recurent" | "vip" | "importat" | "adaugat-manual" | "risc-retur";

export interface PraguriEtichete {
  /** Cate zile inseamna „client nou". */
  zileNou: number;
  /**
   * Dupa cate zile fara comanda intra in segmentul „inactivi".
   *
   * ⚠ NU mai e o eticheta — scoasa la cererea lui pe 21.09.2026. Pragul ramane
   * fiindca il folosesc FILTRELE („Inactivi de 30 / 90 / 180 de zile").
   */
  zileInactiv: number;
  /**
   * VIP: de la cati lei in sus.
   *
   * ⚠⚠ NUMAI VALOAREA, de la 21.09.2026. Pana atunci era „3 comenzi SAU 1.000
   * lei", si ajungea oricare dintre ele. El a cerut: „eticheta VIP sa se puna
   * doar daca a comandat de peste 10.000 lei". Deci numarul de comenzi a iesit
   * cu totul din regula — nu mai e un al doilea drum catre VIP.
   */
  vipLei: number;
  /** Risc de retur: de la cate comenzi incolo are sens o rata, si de la ce rata. */
  riscMinimComenzi: number;
  riscRata: number;
}

/**
 * Pragurile din start.
 *
 * ⚠⚠ `vipLei` E 10.000, CERUT DE EL PE 21.09.2026 — si e bine de stiut ce
 * inseamna asta, fiindca s-a masurat inainte de schimbare:
 *
 *     PRODUCTIE   494 de clienti, cel mai mare a cumparat vreodata de 699 lei.
 *                 Peste 1.000 lei: ZERO. Peste 10.000: ZERO.
 *     DEMO        358 de clienti, cel mai mare 3.294,29 lei.
 *                 Peste 1.000: 21. Peste 10.000: ZERO.
 *
 * Adica eticheta NU se va aprinde pentru nimeni, nicaieri, pana cand cineva
 * cumpara de zece mii de lei. E hotararea lui, scrisa aici cu cifrele la vedere
 * ca sa nu para mai tarziu un defect: cand cineva intreaba „de ce nu vad niciun
 * VIP?", raspunsul e aici, nu in cod stricat.
 *
 * ⚠ Pana atunci se aprindea pentru 25 de oameni pe demo si 2 pe productie — dar
 * aproape toti prin numarul de comenzi, nu prin valoare.
 */
export const PRAGURI_IMPLICITE: PraguriEtichete = {
  zileNou: 30,
  zileInactiv: 90,
  vipLei: 10_000,
  riscMinimComenzi: 3,
  riscRata: 0.5,
};

export interface ClientDeEtichetat {
  orderCount: number;
  validOrderCount: number;
  refundedCount: number;
  ordersValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  /**
   * De unde vine contactul: `import`, `manual`, `checkout` — sau `null` pentru
   * un cumparator, care n-are rand in `customers`, ci e o grupare peste comenzi.
   *
   * ⚠ Optional dinadins: apelantii mai vechi nu se ating, iar lipsa lui cade pe
   * „Importat", adica pe ce erau toti pana la 21.09.2026.
   */
  source?: string | null;
}

function zileDe(iso: string | null, acum: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (acum - t) / 86_400_000;
}

/**
 * Etichetele unui client, in ordinea in care se arata.
 *
 * ⚠ ORDINEA NU E INTAMPLATOARE: intai ce e omul (importat / nou / recurent /
 * VIP), apoi ce s-a intamplat cu el (inactiv, risc). Un client poate purta mai
 * multe — „Recurent" si „Inactiv" impreuna spun ceva ce niciuna nu spune singura:
 * a cumparat de mai multe ori si a incetat.
 */
export function eticheteleClientului(
  c: ClientDeEtichetat,
  praguri: PraguriEtichete = PRAGURI_IMPLICITE,
  acum: number = Date.now(),
): FelEticheta[] {
  const out: FelEticheta[] = [];

  /*
    Fara nicio comanda.

    ⚠⚠ PANA LA 21.09.2026 AICI SCRIA MEREU „Importat", si era adevarat: tot ce
    n-avea comenzi venea dintr-un import, fiindca nu exista alta cale. In ziua in
    care s-a scris adaugarea de mana, propozitia a devenit falsa — si s-a vazut
    imediat pe ecran, un om luat la telefon aparand ca „Importat".

    ⚠ De-aia acum se citeste CHIAR de unde vine (`source`), nu se mai ghiceste
    dintr-o alta insusire. O insusire dedusa din alta e adevarata exact cat timp
    nimeni nu adauga a doua cale — si nimeni nu te anunta cand o face.

    ⚠ `source` lipseste la clientii adusi de pe drumuri mai vechi; atunci ramane
    „Importat", care e ce erau cu totii pana azi.
  */
  if (c.orderCount === 0) {
    return [c.source === "manual" ? "adaugat-manual" : "importat"];
  }

  const deLaPrima = zileDe(c.firstOrderAt, acum);
  const deLaUltima = zileDe(c.lastOrderAt, acum);

  /*
   * ⚠ „NOU" SE JUDECA DUPA PRIMA COMANDA, nu dupa ultima, si numai cat timp n-a
   * comandat a doua oara. Altfel un client de trei ani care tocmai a cumparat ar
   * fi „nou" — iar cuvantul ar inceta sa mai insemne ceva.
   */
  if (c.validOrderCount <= 1 && deLaPrima !== null && deLaPrima <= praguri.zileNou) {
    out.push("nou");
  }

  if (c.validOrderCount > 1) out.push("recurent");

  /*
   * ⚠⚠ NUMAI VALOAREA. Pana la 21.09.2026 era `validOrderCount >= 3 || ordersValue
   * >= 1000`, deci ajungea oricare dintre ele — si masurat, aproape toti VIP-ii
   * ajungeau acolo prin NUMARUL de comenzi, nu prin bani. Cinci comenzi de
   * cincizeci de lei faceau un VIP.
   *
   * El a cerut limpede: „doar daca a comandat de peste 10.000 lei". Deci numarul
   * de comenzi a iesit cu totul din regula, nu i s-a urcat doar pragul.
   */
  if (c.ordersValue >= praguri.vipLei) out.push("vip");

  /*
   * ⚠⚠ ETICHETA „INACTIV" A FOST SCOASA, la cererea lui, pe 21.09.2026.
   *
   * ⚠ DAR REGULA A RAMAS, si asta e important: `zileInactiv` se foloseste mai
   * departe de SEGMENTELE „Inactivi de 30 / 90 / 180 de zile", care sunt filtre,
   * nu etichete. Comerciantul poate cauta oricand cine n-a mai comandat; doar nu
   * i se mai lipeste omului un semn pe rand, in lista.
   *
   * Scoasa cu totul, s-ar fi pierdut si filtrul — si atunci n-ar mai fi avut cum
   * sa-si gaseasca clientii adormiti, care e chiar lucrul pentru care exista
   * sectiunea asta.
   */

  /*
   * ⚠ RATA CERE UN NUMITOR. Sub `riscMinimComenzi`, un retur nu spune nimic
   * despre om: poate fi un produs gresit trimis de magazin. Vezi masuratoarea din
   * capul fisierului — toti cei 20 de oameni cu retur au o singura comanda.
   */
  if (c.orderCount >= praguri.riscMinimComenzi
      && c.refundedCount / c.orderCount >= praguri.riscRata) {
    out.push("risc-retur");
  }

  return out;
}

/** Cum se scrie fiecare pe ecran, si ce inseamna. */
export const DESPRE_ETICHETA: Record<FelEticheta, { text: string; explicatie: string }> = {
  nou: {
    text: "Nou",
    explicatie: "Prima comandă în ultimele 30 de zile, și încă n-a comandat a doua oară.",
  },
  recurent: {
    text: "Recurent",
    explicatie: "Are mai mult de o comandă validă. ⚠ Nu înseamnă „fidel”: două comenzi sunt două comenzi.",
  },
  vip: {
    text: "VIP",
    explicatie: "A trecut de pragul tău de comenzi sau de valoare. Pragurile se schimbă pe magazin.",
  },
  importat: {
    text: "Importat",
    explicatie: "Adus dintr-un fișier de import. N-a comandat niciodată.",
  },
  "adaugat-manual": {
    text: "Adăugat manual",
    explicatie: "L-ai adăugat tu, din panou. N-a comandat niciodată.",
  },
  "risc-retur": {
    text: "Risc de retur",
    explicatie:
      "Cel puțin jumătate din comenzile lui s-au întors, din minimum trei. "
      + "Sub trei comenzi eticheta nu se pune: un singur retur poate fi vina magazinului, nu a omului.",
  },
};

/**
 * Clientul asta n-are nicio identitate in afara unei singure comenzi?
 *
 * ⚠ CHEIA DE GRUPARE E IN CASCADA: telefon normalizat → `email:<adresa>` →
 * `order:<id>`. Ultima treapta inseamna o comanda FARA telefon SI FARA email:
 * atunci fiecare comanda devine un „client" al ei, iar doua comenzi ale
 * aceluiasi om nu se vor uni niciodata.
 *
 * ⚠ MASURAT PE PRODUCTIE (21.09.2026): ZERO comenzi cad acolo. E o capcana care
 * doarme. Dar cand se va trezi — un canal nou care nu cere contact, un import
 * partial — nu va da nicio eroare: va umfla incet numarul de clienti cu oameni
 * care nu exista.
 *
 * De-aia nu se tine cu un comentariu, ci se ARATA pe ecran cand se intampla.
 */
export function faraIdentitate(cheie: string): boolean {
  return cheie.startsWith("order:");
}
