/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CUM SE SCRIE UN CSV PE PLATFORMA ASTA                         (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regulile erau scrise in `lib/abandoned/lista.ts`, private acolo. Mutate aici
 * cand a aparut al doilea export (clientii selectati), fiindca doua scrieri ale
 * aceleiasi reguli se despart: una capata apostroful la telefon, cealalta nu, si
 * nimeni nu afla decat cand suna la un numar fara zero in fata.
 *
 * ⚠ TOATE TREI REGULILE DE MAI JOS SUNT DESPRE EXCEL, nu despre CSV. Fisierul ar
 * fi corect si fara ele; doar ca s-ar deschide stricat la comerciant, si ar fi
 * aruncat.
 */

/** ⚠ Punct-si-virgula, nu virgula: Excel-ul romanesc desparte asa. */
export const SEPARATOR = ";";

/**
 * ⚠⚠ SEMNELE CU CARE O CELULA DEVINE FORMULA IN EXCEL.
 *
 * Asta NU e o frumusete, e o gaura de securitate, si a fost gasita pe 21.09.2026
 * in exportul de cosuri abandonate, care era deja livrat. Un cumparator isi
 * scrie la checkout numele `=HYPERLINK("http://site-rau","Factura")`, iar
 * comerciantul deschide fisierul si Excel EXECUTA. Cu `=cmd|...` se poate merge
 * mai departe de-atat.
 *
 * Ghilimelele nu apara de asta: Excel le scoate la parsare si tot vede `=`.
 * Singura aparare e un apostrof in fata, care spune „asta e text".
 */
const INCEPUTURI_DE_FORMULA = ["=", "+", "-", "@", "\t", "\r"];

/**
 * O celula de CSV.
 *
 * ⚠ Ghilimelele dinauntru se dubleaza, iar celula se incadreaza numai daca are
 * nevoie — un fisier cu tot in ghilimele e greu de citit cu ochiul.
 */
export function camp(v: string | number | null | undefined): string {
  let t = String(v ?? "");

  /* ⚠ Apostroful se pune INAINTE de incadrare, altfel ramane in afara ghilimelelor. */
  if (INCEPUTURI_DE_FORMULA.some((c) => t.startsWith(c))) t = `'${t}`;

  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * Un camp care trebuie sa ramana TEXT, oricat ar semana cu un numar.
 *
 * ⚠ Fara apostrof, Excel vede „0722184305" ca pe un numar, taie zeroul din fata
 * si lasa „722184305" — un numar la care nu suna nimeni. Exportul arata perfect
 * pana cand cineva incearca sa sune.
 */
export function caText(v: string | null | undefined): string {
  const t = String(v ?? "").trim();
  return t ? camp(`'${t}`) : "";
}

/** O suma, cu virgula zecimala romaneasca — tot ce cere Excel-ul lor. */
export function suma(v: number | string | null | undefined): string {
  return camp(Number(v ?? 0).toFixed(2).replace(".", ","));
}

/**
 * Foaia intreaga.
 *
 * ⚠ CRLF si BOM. Fara BOM, Excel deschide fisierul ca Latin-1 si toate
 * diacriticele ies „Ionescu Gheorghiță" → „Ionescu GheorghiÈ›Ä". Nu e o
 * frumusete: e diferenta dintre un export folosibil si unul aruncat.
 */
export function foaie(antet: readonly string[], randuri: readonly string[][]): string {
  const linii = [antet.map(camp).join(SEPARATOR)];
  for (const r of randuri) linii.push(r.join(SEPARATOR));
  return `﻿${linii.join("\r\n")}\r\n`;
}

/** Numele unui fisier descarcat, cu data de la Bucuresti. */
export function numeCuData(prefix: string, acum: Date = new Date()): string {
  const z = new Date(acum.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${z.getFullYear()}-${p(z.getMonth() + 1)}-${p(z.getDate())}.csv`;
}
