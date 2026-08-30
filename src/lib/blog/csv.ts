/**
 * Un câmp CSV, scris ca să nu se transforme în formulă.
 *
 * ⚠ STĂ ÎNTR-UN FIȘIER PROPRIU CA SĂ POATĂ FI PROBAT. Era în
 * `blog-abonati.actions.ts`, care are `"use server"` — iar de acolo se pot
 * exporta numai funcții asincrone, deci un ajutor sincron nu putea ieși ca să fie
 * pus față în față cu adevărul.
 */

/**
 * ⚠ GHILIMELELE APĂRĂ CSV-UL, DAR NU APĂRĂ FOAIA DE CALCUL.
 *
 * Câmpurile se pun între ghilimele și ghilimelele se dublează — asta ține
 * fișierul întreg dacă un câmp conține o virgulă sau un ghilimel. Dar Excel și
 * LibreOffice citesc o celulă care începe cu `=`, `+`, `-` sau `@` drept
 * FORMULĂ, oricâte ghilimele ar avea în jur. Ghilimelele sunt sintaxa CSV-ului;
 * formula se hotărăște DUPĂ ce celula a fost citită.
 *
 * ⚠ ȘI DRUMUL E ÎNTREG, nu teoretic. Verificarea adresei de email e deliberat
 * simplă — „are un @, are punct în domeniu, n-are spații" — tocmai fiindcă una
 * „completă" după RFC respinge adrese valide. Deci o adresă poate începe cu
 * oricare dintre semnele acelea. Cineva se înscrie cu ea, confirmă singur prin
 * dubla confirmare (are cutia lui, deci poate), așteaptă ca un admin să exporte
 * lista, iar formula se execută pe calculatorul adminului la deschidere.
 *
 * Apostroful din față e felul în care Excel spune „ce urmează e text". Nu se vede
 * în celulă și nu strică adresa pentru o unealtă care citește CSV-ul ca date.
 *
 * ⚠ ȘI TABUL ȘI RETURUL DE CAR. Nu sunt formule, dar sparg rândurile în unele
 * unelte; puse tot după apostrof, celula rămâne o celulă.
 */
export function campCsv(v: string | null | undefined): string {
  let x = v ?? "";
  /* Scris cu \u...: caracterele de control scrise ca atare sunt invizibile în
     fișier, iar primul copy-paste le pierde. */
  if (/^[=+\-@\u0009\u000d]/.test(x)) x = "'" + x;
  return `"${x.replace(/"/g, '""')}"`;
}

/** Un rând CSV din câmpurile date. */
export function randCsv(campuri: (string | null | undefined)[]): string {
  return campuri.map(campCsv).join(",");
}
