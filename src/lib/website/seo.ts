/**
 * Secțiunea „SEO" de pe pagina „Optimizare".
 *
 * Textele secțiunii și ale cardurilor sunt ale clientului, date cuvânt cu cuvânt
 * (2026-08-13). Nu se rescriu.
 */

export const SEO = {
  eyebrow: "SEO",
  titlu: "SEO integrat direct în magazin.",
  descriere:
    "Organizăm magazinul într-o structură clară și optimizată, astfel încât produsele și paginile să poată fi descoperite și indexate corect.",
} as const;

export interface CardSeo {
  /** Cheie stabilă pentru `key` și pentru alegerea ilustrației. */
  id: string;
  titlu: string;
  descriere: string;
}

/**
 * Cele patru carduri, două pe rând.
 *
 * ⚠ NEÎNCHEIATĂ. Clientul a cerut PATRU și a dat textele pentru primul
 * (2026-08-13). Restul se adaugă aici, în ordine, plus ilustrația fiecăruia în
 * `SectiuneSeo`. Nu se pun substituenți cu text inventat pe o pagină comercială.
 *
 * ⚠ Numărul contează pentru desen: grila e de două coloane, deci un al cincilea
 * card ar rămâne singur pe ultimul rând. Patru e și ce a cerut clientul.
 */
export const CARDURI_SEO: CardSeo[] = [
  {
    id: "gasire",
    titlu: "Produsele tale, mai ușor de găsit",
    descriere:
      "Produsele și paginile magazinului sunt organizate clar, astfel încât să poată fi găsite mai ușor în căutări.",
  },
];

/**
 * Ce se scrie în bara de căutare din ilustrația primului card.
 *
 * Se scrie literă cu literă, o singură dată, când panoul intră în ecran.
 */
export const CAUTARE = "Camera de Supraveghere";

/**
 * Rezultatele arătate dedesubt, în desenul de la Google Shopping.
 *
 * ⚠ NUMELE ȘI PREȚURILE SUNT PUSE DE MINE. Clientul a trimis doar pozele și a
 * cerut „un nume generic și un preț, diferit la toate". Sunt scrise ca să pară
 * un raft adevărat: patru feluri de cameră, cu prețuri care cresc odată cu ce
 * oferă. De înlocuit dacă vrea altele.
 *
 * ⚠ Vânzătorul e „Magazinul tău", nu un domeniu inventat: un `magazinul-tau.ro`
 * scris pe o pagină comercială poate fi al altcuiva.
 */
export interface RezultatShopping {
  imagine: string;
  nume: string;
  pret: string;
  vanzator: string;
  /** Rândul de livrare, sub vânzător. Ca la ei: ori „Fără costuri", ori un cost. */
  livrare: string;
}

/**
 * ⚠ PREȚURILE SUNT ÎN „RON", nu în „lei", deși restul site-ului scrie „lei".
 * Aici nu e prețul nostru, e cum îl SCRIE GOOGLE în caruselul lui — iar în
 * captura trimisă de client toate opt scriu RON. Desenul e al lor, deci și
 * scrierea.
 */
export const REZULTATE_SHOPPING: RezultatShopping[] = [
  /* ⚠ Numele URMEAZĂ POZA, nu invers. Prima formă le pusese în altă ordine, iar
     pe ecran ieșea o cameră solară sub numele „WiFi de exterior 2K" și o bulă cu
     proiector sub „solară cu panou inclus". Într-o ilustrație de rezultate,
     nepotrivirea aia e chiar lucrul pe care ochiul îl prinde primul. */
  {
    imagine: "/optimizare/camera3.webp",
    nume: "Cameră dome de exterior WiFi, 2K",
    pret: "249,00 RON",
    vanzator: "Magazinul tău",
    livrare: "Fără costuri",
  },
  {
    imagine: "/optimizare/camera2.webp",
    nume: "Cameră de interior rotativă 360°",
    pret: "179,00 RON",
    vanzator: "Magazinul tău",
    livrare: "Fără costuri",
  },
  {
    imagine: "/optimizare/camera4.webp",
    nume: "Cameră duală cu proiector și alarmă",
    pret: "429,00 RON",
    vanzator: "Magazinul tău",
    livrare: "+19,00 RON livrare",
  },
  {
    imagine: "/optimizare/camera1.webp",
    nume: "Cameră solară fără fir 4G, panou inclus",
    pret: "549,00 RON",
    vanzator: "Magazinul tău",
    livrare: "Fără costuri",
  },
];
