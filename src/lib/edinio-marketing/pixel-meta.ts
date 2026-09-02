/*
  ═══════════════════════════════════════════════════════════════════════════════
  ID-UL PIXELULUI META — UN SINGUR LOC, PENTRU BROWSER SI PENTRU SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ACELASI TIPAR CA LA TIKTOK, si din acelasi motiv masurat: doua citiri
  deosebite ale aceleiasi variabile ajung, mai devreme sau mai tarziu, la doua
  valori. Iar aceeasi conversie sub doua adrese nu se mai poate deduplica.

  ⚠ AICI CAPCANA ERA PE DOS. La TikTok, browserul avea o rezerva catre alt pixel.
  Aici n-avea niciuna: fara variabila, `ID_PIXEL` iesea `undefined` si masuratoarea
  se stingea TACUT, fara nicio eroare si fara nimic in jurnal. Cele doua greseli
  arata deosebit si costa la fel.

  Masurat pe 02.09.2026 in pachetul viu de pe www.edinio.com: `2070597336770282`.
*/

const IMPLICIT = "2070597336770282";

export const ID_PIXEL_META: string =
  process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || IMPLICIT;

/*
  ⚠ SCHIMBAREA VARIABILEI CERE O DESFASURARE: `NEXT_PUBLIC_*` se coace in pachetul
  browserului la build.
*/
