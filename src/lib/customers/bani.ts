/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE INSEAMNA „A CHELTUIT" SI CE INSEAMNA „AM INCASAT"        (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CE ERA GRESIT. Fisa clientului avea o singura cifra, „Total cheltuit", si sub ea
 * un camp numit `paidOrderCount`. Numele promitea „comenzi platite", dar socoteala
 * scotea DOAR anulatele si rambursatele. Deci inauntru ramaneau comenzile in
 * asteptare, cele neplatite, cele in procesare si cele refuzate-dar-neanulate.
 * Comerciantul citea o cifra despre bani incasati acolo unde scria, de fapt, valoarea
 * comenzilor care n-au cazut inca.
 *
 * Sunt DOUA marimi deosebite, si amandoua sunt adevarate despre lucruri diferite:
 *
 *   **Valoarea comenzilor** — tot ce nu e anulat sau rambursat. Marimea COMERCIALA:
 *   cat a cerut omul asta de la magazin. Raspunde la „cat de important e clientul".
 *
 *   **Total incasat** — numai banii care au ajuns chiar la comerciant. Marimea
 *   FINANCIARA. Raspunde la „cat am luat pe el".
 *
 * ⚠⚠ SI DE CE „INCASAT" NU E `payment_status = 'paid'`.
 *
 * Masurat pe productie, 21.09.2026: **88 de comenzi sunt `delivered` cu
 * `payment_status = 'unpaid'`**, toate cu ramburs, insumand 7.693,43 lei. La ramburs,
 * curierul ia banii la usa, dar nimeni nu intoarce campul pe `paid` dupa livrare.
 * Cu regula simpla, cei 7.693 de lei ar fi disparut din „incasat" — si fiecare
 * comerciant cu ramburs (adica majoritatea, in Romania) ar fi vazut un client care
 * „n-a platit niciodata", desi a platit de fiecare data.
 *
 * Deci regula tine cont de METODA, exact cum a cerut proprietarul: online inseamna
 * `paid`, iar la usa inseamna LIVRAT.
 */

/** Starile in care comanda nu mai aduce niciun ban. */
const CAZUTE = new Set(["cancelled", "refunded"]);

/**
 * Comanda intra in „valoarea comenzilor"?
 *
 * ⚠ ACEEASI REGULA CA PANA ACUM (`status not in ('cancelled','refunded')`), ca cifra
 * veche sa nu se clinteasca sub nimeni. Ce se schimba e NUMELE si faptul ca de acum
 * are o sora care spune altceva.
 */
export function eValida(status: string | null | undefined): boolean {
  return !CAZUTE.has(String(status ?? ""));
}

/**
 * Metodele la care banii se iau la usa, nu inainte.
 *
 * ⚠ Se tine ca multime, nu ca „orice nu e card": o metoda noua necunoscuta trebuie sa
 * cada pe drumul PRUDENT (neincasat pana se dovedeste), nu sa fie declarata incasata
 * fiindca n-o recunoastem.
 */
const LA_USA = new Set(["cash_on_delivery", "cod", "ramburs"]);

export interface ComandaDeSocotit {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
}

/**
 * Banii comenzii au ajuns chiar la comerciant?
 *
 * ⚠ ORDINEA CONDITIILOR CONTEAZA, si prima e cea care apara:
 *
 * 1. Anulata sau rambursata → NU, orice ar scrie in rest. Pe productie exista 13
 *    comenzi `cancelled` cu `payment_status = 'paid'` (eMAG) si 4 `refunded` cu
 *    `paid` (Trendyol): banii aceia se intorc, si a-i numara ca incasati ar umfla
 *    cifra cu exact sumele pe care comerciantul le da inapoi.
 * 2. `payment_status = 'refunded'` → NU, chiar daca starea comenzii n-a fost mutata.
 *    Sunt doua comenzi asa pe productie, `shipped` cu plata rambursata.
 * 3. Platita online → DA.
 * 4. Ramburs → DA numai dupa LIVRARE. Expediata inseamna ca banii sunt pe drum, nu
 *    ca au ajuns; 123 de comenzi stau azi exact acolo.
 * 5. Orice altceva → NU. Nu stim, deci nu spunem ca am luat banii.
 */
export function eIncasata(o: ComandaDeSocotit): boolean {
  if (CAZUTE.has(String(o.status ?? ""))) return false;
  if (o.payment_status === "refunded") return false;
  if (o.payment_status === "paid") return true;
  if (LA_USA.has(String(o.payment_method ?? ""))) return o.status === "delivered";
  return false;
}

/**
 * Cum se desface numarul de comenzi al unui client.
 *
 * ⚠ DE CE SE ARATA AMANDOUA. In lista scria „5 comenzi · 1.240 lei cheltuit", dar cele
 * cinci puteau cuprinde doua anulate, pe cand suma le scotea. Numarul si suma vorbeau
 * despre multimi diferite, una langa alta, fara sa spuna nimeni.
 */
export interface DesfacereaComenzilor {
  total: number;
  valide: number;
  anulate: number;
  rambursate: number;
}

export function desfaComenzile(comenzi: ComandaDeSocotit[]): DesfacereaComenzilor {
  let anulate = 0;
  let rambursate = 0;
  for (const c of comenzi) {
    if (c.status === "cancelled") anulate++;
    else if (c.status === "refunded") rambursate++;
  }
  return {
    total: comenzi.length,
    valide: comenzi.length - anulate - rambursate,
    anulate,
    rambursate,
  };
}
