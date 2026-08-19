/**
 * Ce a atins fiecare panou din „Editeaza magazinul".
 *
 * ⚠ CELE PATRU PANOURI SCRIU IN ACELASI OBIECT, SI FIECARE IL TRIMITEA INTREG.
 *
 * „Pagina principala", „Pagina produs", „Sectiuni produse" si „Formular de
 * comanda" au fiecare butonul lor de Salveaza, iar editorul promitea in antet ca
 * „modificarile se salveaza separat pentru fiecare sectiune". Nu era adevarat:
 * toate patru scriu in `page_content`, si oricare buton trimitea obiectul
 * INTREG. Un comutator pornit din curiozitate intr-un panou si lasat asa ajungea
 * in magazin cand comerciantul salva cu totul altceva — si nimic nu-i spunea.
 *
 * Reparatia nu e o lista de chei scrisa de mana, care ar diverge de interfata la
 * prima sectiune noua si ar pierde tacut o setare. Se tine minte ce s-a schimbat
 * CU ADEVARAT cat timp era deschis fiecare panou, iar la salvare pleaca doar
 * acele chei. `updatePageContent` face oricum un merge per cheie, deci ce nu se
 * trimite ramane neatins in baza.
 */

/**
 * Cheile in care cele doua obiecte difera.
 *
 * Comparatie pe continut, nu pe identitate: fiecare editare produce obiecte noi
 * pentru campurile imbricate (`benefits_section`, `trust_badges`), deci `!==` ar
 * raspunde „s-a schimbat" pentru tot, la fiecare tastare, si partajarea ar fi
 * fost exact cea de dinainte.
 */
export function cheiSchimbate(inainte: Record<string, unknown>, dupa: Record<string, unknown>): string[] {
  const chei = new Set([...Object.keys(inainte), ...Object.keys(dupa)]);
  return [...chei].filter((cheie) => JSON.stringify(inainte[cheie]) !== JSON.stringify(dupa[cheie]));
}

/**
 * Obiectul redus la cheile cerute.
 *
 * O cheie ceruta dar absenta din obiect NU se trimite ca `undefined`:
 * `JSON.stringify` ar arunca-o oricum pe drum, iar un `null` in locul ei ar
 * sterge din baza o setare pe care nimeni n-a atins-o.
 */
export function doarCheile(
  obiect: Record<string, unknown>,
  chei: Iterable<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const cheie of chei) {
    if (cheie in obiect && obiect[cheie] !== undefined) out[cheie] = obiect[cheie];
  }
  return out;
}

/**
 * Scoate din set doar cheile care au ajuns cu adevarat in baza CU VALOAREA LOR
 * DE ACUM.
 *
 * ⚠ Golirea intregului set dupa salvare pierdea definitiv ce apuca sa modifice
 * comerciantul cat timp se salva. Fereastra nu e teoretica: salvarea de
 * identitate vizuala urca intai imaginile, deci tine secunde bune, iar butonul
 * arata intre timp „Se salveaza". O tragere de „Marimea logo-ului" in intervalul
 * ala se nota corect, dar apoi era stearsa odata cu tot setul — si nicio salvare
 * ulterioara n-o mai trimitea vreodata. La reincarcare, reglajul era inapoi la
 * vechi, fara niciun mesaj.
 *
 * De aceea comparatia e cu valoarea CURENTA, nu doar cu lista de chei trimise: o
 * cheie re-editata in timpul salvarii ramane notata, fiindca in baza a plecat
 * alta valoare.
 */
export function scoateCheileConfirmate(
  set: Set<string>,
  trimis: Record<string, unknown>,
  acum: Record<string, unknown>,
): void {
  for (const [cheie, valoare] of Object.entries(trimis)) {
    if (JSON.stringify(valoare) === JSON.stringify(acum[cheie])) set.delete(cheie);
  }
}
