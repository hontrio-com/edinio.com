/*
  ═══════════════════════════════════════════════════════════════════════════
  UNDE PLEACA EMAILUL UNUI FORMULAR                              (26.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: adresa o alege comerciantul, iar emailul pleaca pe acelasi drum
  ca celelalte emailuri ale magazinului: prin SMTP-ul lui, daca l-a configurat,
  altfel de pe adresa Edinio.

  ⚠ Regula de siguranta (aleasa de el, dintre doua): FARA SMTP propriu, emailul
  pleaca de pe domeniul Edinio, deci adresa poate fi numai a LUI (emailul
  magazinului sau al contului). Altfel oricine isi facea un magazin si trimitea
  prin formular mesaje la adrese straine, de pe domeniul nostru. CU SMTP propriu
  pleaca de pe mailul lui, deci poate alege orice adresa.

  ⚠ `liber` = adresa aleasa nu e a lui, deci emailul are voie sa plece NUMAI prin
  SMTP-ul lui: cand SMTP-ul pica, NU se cade pe Edinio (cum fac celelalte emailuri,
  vezi `deliverStoreEmail`), fiindca asta ar redeschide exact releul de mai sus.
*/

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esteEmail(v: string | null | undefined): boolean {
  return !!v && v.length <= 254 && EMAIL.test(v.trim());
}

/** Adresele comerciantului insusi (magazinul, contul), fara dubluri, cu litere mici. */
export function adreseleLui(emailMagazin: string | null | undefined, emailCont: string | null | undefined): string[] {
  return [...new Set([emailMagazin, emailCont].map((e) => (e ?? "").trim().toLowerCase()).filter((e) => esteEmail(e)))];
}

/**
 * Cine primeste emailul formularului.
 * `ales` = adresa din setarile formularului (goala = emailul magazinului).
 */
export function destinatarFormular(ales: string | null | undefined, ale: string[], areSmtp: boolean): { to: string; liber: boolean } {
  const a = (ales ?? "").trim();
  if (esteEmail(a) && ale.includes(a.toLowerCase())) return { to: a, liber: false };
  if (esteEmail(a) && areSmtp) return { to: a, liber: true };
  return { to: ale[0] ?? "", liber: false };
}

/** Poate comerciantul salva adresa asta la formular? (aceeasi regula, la salvare) */
export function adresaPermisa(ales: string, ale: string[], areSmtp: boolean): boolean {
  const a = ales.trim();
  if (!a) return true;
  if (!esteEmail(a)) return false;
  return ale.includes(a.toLowerCase()) || areSmtp;
}
