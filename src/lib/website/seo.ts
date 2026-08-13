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
  {
    id: "prezentare",
    titlu: "Titluri și descrieri pentru Google",
    descriere:
      "Controlezi cum sunt prezentate paginile și produsele tale în rezultatele de căutare.",
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
    nume: "Cameră solară fără fir 4G",
    pret: "549,00 RON",
    vanzator: "Magazinul tău",
    livrare: "Fără costuri",
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   CARDUL 2 — rezultate obișnuite pe Google
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RezultatOrganic {
  /** Numele site-ului, pe rândul de sus, lângă pictogramă. */
  site: string;
  /** Firimiturile de sub el, cum le arată Google: gazda, apoi calea cu „›". */
  cale: string;
  titlu: string;
  descriere: string;
  /** Litera din bulina care ține locul pictogramei site-ului. */
  initiala: string;
  /** Al nostru — cel cu titlul și descrierea lucrate. Unul singur. */
  alNostru?: true;
}

/**
 * Trei rezultate obișnuite pe Google, pentru cardul „Titluri și descrieri".
 *
 * ═══ CE ARATĂ ═══
 *
 * Același loc în rezultate, trei feluri de a-l folosi. Cele două din jur au ce
 * scoate un magazin lăsat pe pilot automat: un titlu care e numele categoriei,
 * o cale cu semne de întrebare în ea, și o descriere pe care Google și-a
 * cules-o singur din meniul paginii, fiindcă n-a găsit una scrisă. Al nostru are
 * titlu scris pentru om și descriere care spune ce se găsește acolo.
 *
 * ⚠ AL NOSTRU E LA MIJLOC, NU PRIMUL — dinadins. Pus primul, desenul ar spune
 * „cu Edinio ieși pe locul întâi", ceea ce n-are cum să fie promis de nimeni.
 * Cardul vorbește despre CUM ARATĂ rezultatul, nu despre unde stă, iar la mijloc
 * comparația se vede și în sus și în jos.
 *
 * ⚠ ADRESELE. `magazinul-tau.ro` există și e al altcuiva — verificat, nu
 * presupus — deci nu se scrie pe o pagină comercială ca și cum ar fi un exemplu
 * al nostru. Al nostru arată chiar cum arată un magazin Edinio: `edinio.com`
 * plus numele magazinului. Iar cele două din jur folosesc adrese care NU EXISTĂ
 * (verificat: nu se rezolvă) și care sunt descrieri, nu nume de firmă, ca
 * titlul slab de lângă ele să nu cadă pe cineva adevărat.
 */
export const REZULTATE_ORGANICE: RezultatOrganic[] = [
  {
    initiala: "M",
    site: "Magazin concurent",
    cale: "magazin-concurent.ro › index.php?cat=12&id=482",
    titlu: "Produse",
    /* Ce arată Google când pagina n-are descriere scrisă: își culege singur
       primul text pe care îl găsește, adică meniul. Se vede des, și de departe. */
    descriere:
      "Acasă · Despre noi · Contact · Livrare și retur · Termeni și condiții · Coșul meu (0) · Categorii · Produse noi · Promoții ·",
  },
  {
    alNostru: true,
    initiala: "M",
    site: "Magazinul tău",
    cale: "edinio.com › magazinul-tau › camere-supraveghere",
    titlu: "Camere de supraveghere WiFi și 4G | Magazinul tău",
    descriere:
      "Camere de supraveghere pentru interior și exterior, cu vedere pe timp de noapte. Livrare în 24 de ore.",
  },
  {
    initiala: "A",
    site: "Alt magazin online",
    cale: "alt-magazin-online.ro › categorie-1",
    titlu: "Categorie 1 - Alt magazin online - Magazin online",
    descriere:
      "Vă mulțumim pentru vizită. Pentru comenzi și informații ne puteți contacta telefonic în intervalul orar 09:00 - 17:00.",
  },
];
