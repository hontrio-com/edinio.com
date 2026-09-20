import { Inter } from "next/font/google";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  FONTUL APLICATIEI (panou + admin): INTER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ NU SE PUNE IN `app/layout.tsx`. Acolo se incarca Geist, si Geist e fontul
  IMPLICIT AL TUTUROR VITRINELOR: `src/lib/storefront/design/fonts.ts` are, pentru
  magazinele care nu si-au ales altul, `stack: "var(--font-geist-sans), …"`. O
  schimbare in radacina ar schimba, dintr-o data, felul in care arata magazinele
  celor peste 130 de comercianti. Aici se schimba DOAR panoul.

  Cum se leaga: `.variable` declara `--font-inter`, iar clasa `font-aplicatie` din
  `stil-comun.css` rescrie `--font-sans` si `--font-heading` pe invelisul panoului.
  Totul dinauntru mosteneste, fara sa atinga `:root`.

  ⚠ `latin-ext`, nu doar `latin`. Site-ul de prezentare cere doar `latin`, si acolo
  merge: textele lui sunt scrise fara diacritice. In panou apar insa DATELE
  comerciantului, care au diacritice („Lumânare parfumată", „Bijuterii Cris").
  `ș` (U+0219) si `ț` (U+021B) stau in `latin-ext`; fara el ar cadea pe fontul de
  rezerva exact pe acele litere, adica text amestecat in aceeasi propozitie.
  Costul e zero pentru cine nu le foloseste: sunt fisiere separate, aduse de
  browser numai cand pagina chiar are caractere din intervalul acela.

  `preload` ramane pornit (implicit), spre deosebire de Geist din radacina: acolo
  fontul se incarca pe fiecare vitrina, aici doar pe paginile cu cont, unde e chiar
  fontul textului principal.
*/
export const fontAplicatie = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
