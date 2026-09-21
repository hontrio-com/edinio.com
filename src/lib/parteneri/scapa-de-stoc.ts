/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCAPĂ DE STOC: parteneriat, deschis intr-un cadru din panou   (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Marketplace B2B pentru afaceri de ecommerce si COD din Romania: comerciantul
 * isi vinde stocul ramas si isi scoate banii blocati in depozit.
 *
 * ⚠ ADRESA SE TINE INTR-UN SINGUR LOC, SI NU SE COMPUNE. Ei ne-au dat-o cu
 * parametrii lor de urmarire cu tot, iar `utm_source` poarta identificatorul
 * NOSTRU de partener (`edinio-3065832c`). Scrisa de mana in `<iframe src=…>`,
 * primul care „curata adresa" sau schimba un parametru rupe atribuirea
 * parteneriatului — adica exact lucrul pentru care exista intelegerea. Se vede
 * abia cand cineva se uita la raportul lor, peste luni.
 *
 * ⚠ SE VERIFICA CA ADRESA E INCADRABILA, nu se presupune. Masurat pe
 * 21.09.2026: raspunsul lor n-are nici `X-Frame-Options`, nici
 * `Content-Security-Policy`, deci cadrul merge. Daca adauga vreunul candva,
 * cadrul ramane ALB, fara niciun mesaj de la browser — de aceea fereastra are
 * mereu, la vedere, si o cale de iesire catre fila noua.
 */

/**
 * Adresa exacta primita de la ei.
 *
 * ⚠ PE `www`, DINADINS. Adresa fara `www` raspunde `307` catre ea; intr-un cadru
 * redirectarea merge, dar e un drum in plus la fiecare deschidere, si orice
 * redirectare e un loc unde parametrii se pot pierde.
 */
export const ADRESA_SCAPA_DE_STOC =
  "https://www.scapadestoc.ro/?utm_source=edinio-3065832c&utm_medium=iframe&utm_campaign=parteneri";

/** Parametrii de urmarire care NU au voie sa dispara din adresa. */
export const URMARIREA_LOR = {
  utm_source: "edinio-3065832c",
  utm_medium: "iframe",
  utm_campaign: "parteneri",
} as const;

/** Culoarea marcii lor. */
export const VERDELE_LOR = "#3FA88A";

export const NUMELE_LOR = "Scapă de Stoc";

/** Ce face, in cuvintele lor. */
export const CE_FACE =
  "Marketplace-ul B2B pentru afaceri ecommerce și COD din România. "
  + "Vinde stocul rămas, recuperează capitalul blocat, scapă de presiunea depozitului.";

/** Indemnul lor, pe doua randuri. */
export const INDEMNUL = ["Eliberează stocul.", "Recuperează cashul."] as const;

/**
 * Ce are voie sa faca pagina lor inauntrul cadrului.
 *
 * ⚠⚠ `allow-top-navigation` LIPSESTE DINADINS, si asta e toata paza de aici.
 * Fara cutia de siguranta, o pagina incadrata poate scrie `window.top.location`
 * si SCOATE comerciantul din panou — dintr-un panou in care e autentificat, catre
 * unde vrea ea. Nu banuim pe nimeni; dar un parteneriat nu e un motiv sa lasi
 * deschisa o usa pe care n-ai de ce s-o lasi deschisa, iar o pagina de partener
 * incarca si scripturi care nu sunt ale lui (reclame, analitice).
 *
 * ⚠ `allow-same-origin` E NEVOIE, si nu slabeste nimic aici: cutia de siguranta
 * e a documentului LOR, deci „same origin" inseamna originea lor, nu a noastra.
 * Fara el, pagina lor ar fi intr-o origine oarba: fara cookie-uri, fara
 * `localStorage`, si orice site modern se rupe.
 *
 * ⚠ `allow-popups-to-escape-sandbox` face ca un link deschis de ei in fila noua
 * sa fie o fila obisnuita, nu una tot in cutie. Altfel site-ul lor s-ar purta
 * ciudat abia la al doilea clic, si nimeni n-ar lega asta de noi.
 */
export const CUTIA_CADRULUI = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
].join(" ");
