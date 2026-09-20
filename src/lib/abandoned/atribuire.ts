/*
  ═══════════════════════════════════════════════════════════════════════════
  CINE A ADUS COMANDA INAPOI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE NU SE PUTEA SPUNE PANA ACUM. Cardul „Recuperate" numara cosurile
  convertite care primisera candva un mesaj. Masurat pe productie pe
  21.09.2026: din 307 cosuri convertite, doar 2 primisera vreun mesaj - si nici
  despre acelea doua nu se putea arata ca mesajul a facut conversia. Linkul era
  `?recover=<id>` si nu lasa nicio urma ca a fost deschis.

  Cifra nu era mica. Era NEDEMONSTRABILA, si asta e altceva: o cifra mica spune
  ceva adevarat despre magazin, una nedemonstrabila nu spune nimic despre
  nimic, dar arata la fel pe ecran.

  ⚠ DE-AIA SUNT TREI CIFRE, NU UNA. Ele nu se aduna intr-un „recuperat" mai
  mare; fiecare raspunde la alta intrebare, si a doua e tocmai cea pe care nu o
  putem dovedi.
*/

/** Cate zile poate trece intre deschiderea linkului si comanda. */
export const ZILE_ATRIBUIRE = 7;

export type FelulRecuperarii =
  /** Omul a deschis linkul din mesaj si a comandat in fereastra. Se poate dovedi. */
  | "atribuita"
  /** I s-a trimis mesaj si a comandat, dar linkul nu a fost deschis. NU se poate dovedi. */
  | "asistata"
  /** N-a primit niciun mesaj. Comanda ar fi venit oricum. */
  | "organica";

export interface MesajTrimis {
  /** Cand a plecat mesajul. */
  trimis_la: string;
  /** Cand a fost deschis linkul, daca a fost. */
  deschis_la: string | null;
}

/**
 * Ce fel de recuperare e comanda asta.
 *
 * ⚠ FEREASTRA SE MASOARA DE LA DESCHIDERE, NU DE LA TRIMITERE. Un mesaj citit
 * a treia zi si urmat de comanda a patra zi e o recuperare; acelasi mesaj
 * deschis abia peste o luna nu mai e. Masurata de la trimitere, fereastra ar
 * fi expirat tocmai pentru omul care chiar a venit prin link.
 *
 * ⚠ SI O COMANDA DINAINTEA DESCHIDERII E „ASISTATA", nu „atribuita": daca omul
 * a comandat inainte sa apese linkul, linkul n-a adus comanda. Fara
 * verificarea asta, un click de curiozitate de a doua zi ar fi luat meritul
 * unei comenzi deja plasate.
 */
export function felulRecuperarii(
  mesaje: MesajTrimis[],
  comandaLa: Date,
  zile: number = ZILE_ATRIBUIRE,
): FelulRecuperarii {
  if (mesaje.length === 0) return "organica";

  const fereastra = zile * 24 * 60 * 60 * 1000;
  for (const m of mesaje) {
    if (!m.deschis_la) continue;
    const deschis = new Date(m.deschis_la).getTime();
    if (Number.isNaN(deschis)) continue;
    const trecut = comandaLa.getTime() - deschis;
    if (trecut >= 0 && trecut <= fereastra) return "atribuita";
  }
  return "asistata";
}

/**
 * Mesajul deschis caruia i se trece comanda in cont.
 *
 * ⚠ CEL MAI RECENT DESCHIS, nu primul trimis: daca omul a primit trei mesaje
 * si l-a deschis pe al treilea, al treilea l-a adus. Numarat pe primul, toate
 * campaniile ar fi aratat ca merge doar prima trimitere.
 */
export function mesajulCareAAdus<T extends MesajTrimis>(
  mesaje: T[], comandaLa: Date, zile: number = ZILE_ATRIBUIRE,
): T | null {
  const fereastra = zile * 24 * 60 * 60 * 1000;
  let ales: T | null = null;
  let celMaiRecent = -Infinity;
  for (const m of mesaje) {
    if (!m.deschis_la) continue;
    const deschis = new Date(m.deschis_la).getTime();
    if (Number.isNaN(deschis)) continue;
    const trecut = comandaLa.getTime() - deschis;
    if (trecut < 0 || trecut > fereastra) continue;
    if (deschis > celMaiRecent) { celMaiRecent = deschis; ales = m; }
  }
  return ales;
}

/** Cum se numesc cele trei pe ecran, si ce spun cand le arati. */
export const NUMELE_RECUPERARII: Record<FelulRecuperarii, { titlu: string; explicatie: string }> = {
  atribuita: {
    titlu: "Recuperare atribuită",
    explicatie:
      "Clientul a deschis linkul din mesajul de recuperare și a comandat în cel mult "
      + `${ZILE_ATRIBUIRE} zile. Singura cifră care se poate dovedi.`,
  },
  asistata: {
    titlu: "Recuperare asistată",
    explicatie:
      "I-am trimis un mesaj și a comandat, dar nu a deschis linkul din el. Poate că mesajul "
      + "i-a amintit, poate că s-ar fi întors oricum: nu se poate dovedi.",
  },
  organica: {
    titlu: "Conversie organică",
    explicatie: "Clientul s-a întors singur, fără să primească vreun mesaj de recuperare.",
  },
};
