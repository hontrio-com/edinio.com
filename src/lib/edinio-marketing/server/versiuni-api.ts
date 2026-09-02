/*
  ═══════════════════════════════════════════════════════════════════════════════
  VERSIUNILE API ALE FURNIZORILOR, INTR-UN SINGUR LOC
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE AICI SI NU IN FISIERUL DE TRIMITERE. Un numar de versiune scris in
  mijlocul unei functii nu se revizuieste niciodata: nimeni nu deschide
  `trimite-meta.ts` ca sa se intrebe daca `v21.0` mai e bun. Aici, langa data la
  care s-a verificat ultima oara, intrebarea se pune singura.

  ═══ ⚠ CE S-A MASURAT, SI DE CE SCHIMBA JUDECATA ═══

  Un audit din afara a semnalat versiunea scrisa in cod ca risc: „intr-o zi
  versiunea expira si toate conversiile intra in reincercare".

  Masurat pe 02.09.2026, impotriva serverului lor adevarat, cu chiar pixelul
  nostru: capatul `/{pixel}/events` a raspuns `events_received: 1` pentru TOATE
  versiunile incercate — v19.0, v20.0, v21.0, v22.0, v23.0, v24.0, v25.0.

  Deci capatul de conversii NU respinge versiunile vechi asa cum o fac celelalte
  capete Graph. Riscul e mult mai mic decat parea — dar nu zero, si nu e o
  fagaduiala a lor: `v25.0` a raspuns la fel, si probabil nici nu exista. Adica ei
  ingaduie ce nu cunosc, ceea ce inseamna ca raspunsul nu dovedeste ca versiunea e
  buna, doar ca n-au respins-o.

  ⚠ DE ACEEA NU SE FOLOSESTE „ULTIMA VERSIUNE" LA INTAMPLARE. O versiune noua
  poate schimba forma campurilor, iar aici greselile de continut nu se vad in
  raspuns (vezi nota din `sarcina-meta.ts`). Se ridica numai dupa ce se citeste ce
  s-a schimbat.
*/

/**
 * Meta Graph API.
 *
 * Verificata ultima oara: 02.09.2026.
 * Cand se ridica, se reciteste ce s-a schimbat la `user_data` si `custom_data`.
 */
export const VERSIUNE_META = "v21.0";

/**
 * TikTok Events API.
 *
 * ⚠ La ei versiunea sta in CALE (`/open_api/v1.3/event/track/`), nu intr-un
 * parametru — deci o schimbare de versiune inseamna alta adresa, nu alt numar.
 */
export const VERSIUNE_TIKTOK = "v1.3";
