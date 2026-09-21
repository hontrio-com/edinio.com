/*
  ═══════════════════════════════════════════════════════════════════════════
  CINE TRIMITE SMS-UL, CAND AI MAI MULTI FURNIZORI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA. Codul scria `if (noticeReady) ... else ... smso`. Cu amandoi
  pornite, notice.ro castiga MEREU, si nimic nu spunea asta nicaieri:
  comerciantul care isi incarcase credit la SMSO vedea banii stand pe loc si
  factura crescand in alta parte. Nu era o hotarare, era ordinea in care se
  nimerisera scrise cele doua ramuri.

  ⚠ ALEGEREA E A LUI, nu a noastra. Preturile difera, contractele difera, si
  uneori unul e pornit doar ca rezerva. Noi aratam cine e pornit si tinem minte
  ce a ales ultima data; atat.
*/

export type FurnizorSms = "smso" | "notice";

export interface StareFurnizor {
  cheie: FurnizorSms;
  nume: string;
  /** E gata de trimis: pornit, cu cheile puse si cu canalul de cosuri activ. */
  gata: boolean;
  /** De ce nu e gata, cand nu e. */
  lipsa?: string;
}

interface ConfigSmso {
  enabled?: boolean | null;
  api_key?: string | null;
  sender_id?: string | null;
}

interface ConfigNotice {
  enabled?: boolean | null;
  api_token?: string | null;
  abandoned?: { enabled?: boolean | null } | null;
}

/**
 * Cine poate trimite acum, si cine nu si de ce.
 *
 * ⚠ ORDINEA E MEREU ACEEASI (SMSO, apoi notice.ro), ca sa nu sara optiunile
 * dintr-un loc in altul. Nu inseamna ca SMSO e „primul" ca preferinta.
 */
export function furnizoriSms(
  smso: ConfigSmso | null | undefined,
  notice: ConfigNotice | null | undefined,
): StareFurnizor[] {
  return [
    {
      cheie: "smso",
      nume: "SMSO",
      gata: !!(smso?.enabled && smso.api_key && smso.sender_id),
      lipsa: !smso?.enabled
        ? "nu e pornit din Integrări"
        : !smso.api_key
          ? "îi lipsește cheia API"
          : !smso.sender_id
            ? "îi lipsește expeditorul"
            : undefined,
    },
    {
      cheie: "notice",
      nume: "notice.ro",
      gata: !!(notice?.enabled && notice.api_token && notice.abandoned?.enabled),
      lipsa: !notice?.enabled
        ? "nu e pornit din Integrări"
        : !notice.api_token
          ? "îi lipsește tokenul"
          : !notice.abandoned?.enabled
            ? "are oprit canalul pentru coșuri abandonate"
            : undefined,
    },
  ];
}

export function ceiGata(furnizori: StareFurnizor[]): StareFurnizor[] {
  return furnizori.filter((f) => f.gata);
}

/**
 * Furnizorul pe care se trimite de fapt.
 *
 * ⚠ O ALEGERE CARE NU E GATA NU SE FOLOSESTE TACIT. Daca omul a ales SMSO si
 * intre timp i-au expirat cheile, mesajul NU pleaca pe celalalt fara sa stie:
 * se intoarce motivul, si el hotaraste. Trimis pe altul, ar fi platit la alt
 * furnizor decat crede, cu alt nume de expeditor in telefonul clientului.
 */
export function furnizorulAles(
  furnizori: StareFurnizor[], ales: FurnizorSms | null | undefined,
): { furnizor: FurnizorSms } | { eroare: string } {
  const gata = ceiGata(furnizori);
  if (gata.length === 0) {
    return { eroare: "Nu ai niciun serviciu de SMS pornit. Activează SMSO sau notice.ro din Integrări." };
  }

  if (!ales) {
    /*
      ⚠ Fara alegere si cu UNUL SINGUR gata, e limpede cine trimite. Cu doi,
      tot se trimite pe primul - dar ecranul intreaba INAINTE, deci aici nu se
      ajunge decat din cron sau dintr-o automatizare veche, unde tacerea
      inseamna „cum a fost si pana acum".
    */
    return { furnizor: gata[0].cheie };
  }

  const cerut = furnizori.find((f) => f.cheie === ales);
  if (!cerut) return { eroare: "Furnizorul cerut nu există." };
  if (!cerut.gata) {
    return {
      eroare: `${cerut.nume} ${cerut.lipsa ?? "nu e gata de trimis"}, deci mesajul nu a plecat. `
        + "Alege alt furnizor sau repară integrarea.",
    };
  }
  return { furnizor: cerut.cheie };
}
