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
  {
    id: "sitemap",
    titlu: "Sitemap generat automat",
    descriere:
      "Edinio creează și actualizează automat harta magazinului, astfel încât motoarele de căutare să poată descoperi mai ușor paginile importante.",
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
 * ═══ ADRESELE — CITEȘTE ÎNAINTE SĂ LE SCHIMBI ═══
 *
 * Clientul a cerut (13.08) ca vecinii să arate a magazine adevărate, nu a
 * substituenți: „Magazin concurent" pe `magazin-concurent.ro` se citea ca un
 * locșor gol. Numele și adresele de acum sunt scrise SĂ PARĂ adevărate, dar NU
 * SUNT ALE NIMĂNUI: fiecare domeniu a fost verificat prin DNS și niciunul nu se
 * rezolvă.
 *
 * ⚠ ȘI NICI NU SE PUN ALE CUIVA. Aici sunt titluri slabe, scrise de noi, lângă
 * cuvintele „prost optimizat", pe pagina noastră de vânzare. Puse pe numele unui
 * magazin adevărat, ar fi o afirmație despre firma aia — și una inventată, de
 * vreme ce titlul nu e al lor, ci scris de noi. Un domeniu care se rezolvă n-are
 * ce căuta pe rândurile astea două, oricât de bine ar arăta. Proba din
 * `seo.test.ts` păzește exact asta.
 *
 * ⚠ AL NOSTRU stă pe `www.exemplu.ro` — un domeniu de pildă, nu unul adevărat.
 *
 * A trecut prin trei forme, și ultima e a clientului: întâi `edinio.com`, apoi
 * `www.magazinultau.ro`, cerut de el; dar domeniul ăla se rezolvă la Hetzner
 * (128.140.228.212), nu la Vercel unde stă `edinio.com`, deci nu e al nostru —
 * iar clientul a confirmat că nu e și a cerut ceva de pildă, standard.
 *
 * `acme.ro`, cel cerut, e și el luat. `exemplu.ro` NU se rezolvă (verificat) și
 * e chiar cuvântul care spune ce e: aici scrie „exemplu", nu numele nimănui.
 */
export const REZULTATE_ORGANICE: RezultatOrganic[] = [
  {
    initiala: "C",
    site: "Camera Shop",
    cale: "www.camerashop.ro › index.php?cat=12&id=482",
    /* Scurt și gol: numele categoriei, atât. Nu spune nici ce fel de cameră, nici
       al cui e magazinul — adică nimic din ce caută omul. */
    titlu: "Camere",
    /* Ce arată Google când pagina n-are descriere scrisă: își culege singur
       primul text pe care îl găsește, adică meniul. Se vede des, și de departe. */
    descriere:
      "Acasă · Despre noi · Contact · Livrare și retur · Termeni și condiții · Coșul meu (0) · Categorii · Produse noi · Promoții ·",
  },
  {
    alNostru: true,
    initiala: "M",
    site: "Magazinul tău",
    cale: "www.exemplu.ro › camere-supraveghere",
    titlu: "Camere de supraveghere WiFi și 4G | Magazinul tău",
    descriere:
      "Camere de supraveghere pentru interior și exterior, cu vedere pe timp de noapte. Livrare în 24 de ore.",
  },
  {
    initiala: "S",
    site: "Supraveghere Shop",
    cale: "www.supraveghere-shop.ro › categorie-1",
    titlu: "Produse",
    descriere:
      "Vă mulțumim pentru vizită. Pentru comenzi și informații ne puteți contacta telefonic în intervalul orar 09:00 - 17:00.",
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   CARDUL 3 — sitemap
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Gazda din exemplu. Aceeași ca la cardul 2, dinadins: cele două ilustrații
 * arată același magazin, o dată în rezultate și o dată în harta lui.
 */
export const SITEMAP_GAZDA = "https://www.exemplu.ro";

export interface IntrareSitemap {
  /** Calea, fără gazdă. Goală pentru pagina de start. */
  cale: string;
  lastmod: string;
  changefreq: string;
  priority: string;
  /** La ce folosește: pentru probe și pentru textul citit cu voce. */
  fel: "acasa" | "catalog" | "categorie" | "produs" | "politica";
}

/**
 * Un sitemap de magazin, exact în forma pe care o scoate Edinio.
 *
 * ═══ NU E INVENTAT ═══
 *
 * ⚠ Câmpurile, ordinea lor, `changefreq` și `priority` sunt CITITE DINTR-UN
 * SITEMAP VIU, nu scrise din cap: `bricosmart.ro`, prin `edinio.com`, 1169 de
 * adrese, la 13.08.2026. De acolo vine tabelul:
 *
 *   pagina de start        weekly   1
 *   pagina de catalog      daily    0.9
 *   pagină de categorie    daily    0.8
 *   pagină de produs       weekly   0.7
 *   pagină proprie         monthly  0.5
 *   pagină de politici     yearly   0.3
 *
 * Dacă cineva schimbă vreodată ce scrie generatorul, ilustrația de aici rămâne
 * în urmă fără să se plângă nimeni — de asta tabelul e scris și în `seo.test.ts`,
 * ca o probă care se citește ca o listă de verificat față de `app/sitemap.ts`.
 *
 * ⚠ `lastmod` e ISO ÎNTREG, cu milisecunde și `Z` — așa îl scrie `toISOString()`
 * în generator. Nu se scurtează la o dată simplă „ca să încapă": tocmai forma
 * lungă e semnul că e ieșire de mașină, nu un tabel desenat de noi.
 *
 * ⚠ Paginile magazinului împart aceeași oră (e `updated_at` al magazinului), iar
 * produsul are alta, a lui. Așa arată și în cel viu, și e amănuntul care spune
 * că harta se reface singură, pe bucăți.
 */
export const SITEMAP_EXEMPLU: IntrareSitemap[] = [
  {
    fel: "acasa",
    cale: "",
    lastmod: "2026-08-13T09:41:07.512Z",
    changefreq: "weekly",
    priority: "1",
  },
  {
    fel: "categorie",
    cale: "/magazin/camere-supraveghere",
    lastmod: "2026-08-13T09:41:07.512Z",
    changefreq: "daily",
    priority: "0.8",
  },
  {
    fel: "produs",
    cale: "/product/camera-dome-wifi-2k",
    lastmod: "2026-08-11T16:08:22.194Z",
    changefreq: "weekly",
    priority: "0.7",
  },
  {
    fel: "politica",
    cale: "/politici/termeni",
    lastmod: "2026-08-13T09:41:07.512Z",
    changefreq: "yearly",
    priority: "0.3",
  },
];
