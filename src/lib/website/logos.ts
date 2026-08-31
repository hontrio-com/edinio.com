/**
 * Siglele furnizorilor cu care se integrează Edinio.
 *
 * ═══ DE CE E NEVOIE DE UN FIȘIER ÎNTREG PENTRU NIȘTE SIGLE ═══
 *
 * Pentru că „toate de aceeași dimensiune" nu se rezolvă cu o înălțime fixă, și
 * nici cu o lățime fixă.
 *
 * Siglele astea au rapoarte între 0,60 (Colete Online, un plic înalt) și 9,13
 * (About You, un cuvânt foarte lung). La ÎNĂLȚIME egală, About You iese de
 * cincisprezece ori mai lat și pare uriaș lângă Colete. La LĂȚIME egală se
 * întâmplă pe dos.
 *
 * Ochiul nu compară nici înălțimea, nici lățimea: compară cât „cerneală" ocupă
 * fiecare. Deci se egalizează SUPRAFAȚA — vezi `logoSize()`.
 *
 * ═══ CELE TREI NUMERE ALE UNEI SIGLE ═══
 *
 * `ratio` — raportul CUTIEI fișierului, nu al desenului. Ăsta e ce folosește
 *   browserul ca să calculeze lățimea când îi dai o înălțime, deci ăsta trebuie
 *   să fie exact, altfel iese altceva decât am socotit.
 *
 *   ⚠ ȘI E UȘOR DE CONFUNDAT CU CEL AL DESENULUI. Coincid la orice fișier tăiat
 *   pe contur — adică la aproape toate — deci greșeala nu se vede până nu dai
 *   peste unul care nu e. La `colete-online.svg` diferența era mare: fișierul
 *   declară `width="256px" height="256px"`, deci CUTIA e pătrată, dar viewBox-ul
 *   e strâns pe un desen de 0,60. Aici scria 0,60, iar sigla ieșea la 60% din
 *   mărimea vecinelor ei, în bandă și în hero. La un SVG, cutia vine din
 *   `width`/`height` când există, NU din viewBox.
 *
 *   Cum se măsoară fără greșeală: pui fișierul într-un `<img>` cu înălțime fixă
 *   și `max-width: none` (fără el, preflight-ul Tailwind îl taie la lățimea
 *   ferestrei și opt sigle ies cu același raport), citești
 *   `getBoundingClientRect()` pentru CUTIE, apoi îl desenezi pe o pânză și îi
 *   tai marginile pentru CERNEALĂ.
 *
 * `ink` — cât din cutie e chiar desen, între 0 și 1. La un fișier tăiat pe contur
 *   e 1 și se omite. La unul cu margini goale e mai mic, iar `logoSize()` îl
 *   mărește exact cât să compenseze. Fără el, o siglă cu 25% margine iese cu un
 *   sfert mai mică decât vecinele ei, fără să se vadă de ce.
 *
 * `invert` — fișierul e desenat în alb, pentru fundal închis. Vezi Netopia.
 *
 * Toate sunt MĂSURATE, rasterizând fișierul și tăindu-i marginile, nu citite din
 * antet: antetul minte des. `ipay.webp` era un pătrat de 200x200 în care desenul
 * avea 166x99, iar `fan-courier.svg` n-avea deloc `viewBox`.
 *
 * Dacă adaugi o siglă: rasterizeaz-o, taie-i marginile, și scrie raportul cutiei
 * plus fracțiunea de cerneală. Cu numere ghicite, sigla iese vizibil altfel decât
 * vecinele și nu se înțelege de ce.
 *
 * ═══ FIȘIERE NORMALIZATE ═══
 *
 * Unora li s-a strâns `viewBox`-ul pe contur (fan-courier, dpd, fgo, stripe,
 * klarna, mailchimp, brevo, smso, colete-online), altele au fost tăiate și
 * micșorate ca `-mic.webp` (sameday, smartbill, oblio, ipay, notice.ro, cargus).
 * Două merită pomenite:
 *   - `notice.ro.png` avea 126KB; `notice.ro-mic.webp` are 5.
 *   - `cargus.svg` e un SVG doar cu numele: înăuntru are 210KB de imagine
 *     matriceală. `cargus-mic.webp` are 9KB. Fișierul vechi a rămas pe loc,
 *     fiindcă îl folosesc opt locuri din aplicație; aici se folosește cel mic.
 *
 * `woot.webp` NU e tăiat, dinadins: are 200x200 și 3,8KB, iar orice reîncodare
 * a ieșit de trei ori mai mare. Marginea lui se tratează cu `ink`.
 */

export interface ProviderLogo {
  /** Numele furnizorului. Merge in `alt`, deci se citeste cu voce tare. */
  name: string;
  src: string;
  /** Raportul CUTIEI fisierului (latime/inaltime). Masurat. */
  ratio: number;
  /** Cat din cutie e desen, 0-1. Se omite cand fisierul e taiat pe contur. */
  ink?: number;
  /** Desenat in alb, pentru fundal inchis. Pe alb trebuie inversat. */
  invert?: boolean;
}

/**
 * Suprafața pe care o ocupă o siglă, în pixeli pătrați.
 *
 * `INLINE` e pentru un rând mic de sigle lângă text; `TILE` pentru o siglă
 * singură într-o casetă; `HERO` pentru piesa centrală a unei constelații.
 * Numerele sunt suprafețe, nu înălțimi: 1600 înseamnă cam 40x40.
 */
export const LOGO_AREA = {
  inline: 640,
  tile: 1600,
  hero: 3600,
} as const;

/**
 * Rezultatul: cât de mare se desenează sigla.
 *
 * `height` merge pe `style`, iar `maxWidth` e plasa pentru siglele foarte late.
 * About You are raportul 9,13: la suprafață egală iese de 110px lățime, ceea ce
 * într-o casetă de 96px n-are unde încăpea. Cu `maxWidth` plus `object-contain`
 * se micșorează singură până intră, în loc să spargă aranjarea.
 */
export interface LogoSize {
  height: number;
  maxWidth: number;
}

/**
 * Cât de mare se desenează o siglă ca să pară la fel de mare ca vecinele ei.
 *
 * Din suprafață și raport iese înălțimea: dacă desenul acoperă `ink` din cutie,
 * atunci `h · (h·ratio) · ink = area`, deci `h = √(area / (ratio · ink))`.
 *
 * `maxWidth` nu e o alegere de stil, e limita cutiei în care stă sigla. Fără el,
 * cele foarte late ies din casetă.
 */
export function logoSize(
  logo: ProviderLogo,
  area: number,
  maxWidth = Number.POSITIVE_INFINITY,
): LogoSize {
  const ink = logo.ink ?? 1;
  const height = Math.sqrt(area / (logo.ratio * ink));
  return {
    height: Math.round(height * 10) / 10,
    maxWidth: Math.round(Math.min(maxWidth, height * logo.ratio) * 10) / 10,
  };
}

const I = "/integrations";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ⚠ DE CE ATÂTEA `-mic.webp` — ȘI DE CE ORIGINALELE RĂMÂN PE DISC
  ═══════════════════════════════════════════════════════════════════════════

  Măsurat pe 01.09.2026: douăsprezece sigle raster cântăreau împreună 460.659 de
  octeți. Cea mai grasă, `ing.webp`, avea 3840×955 px. Se desenează într-o
  casetă de cel mult 120 px lățime (`BibliotecaIntegrari.tsx`: ARIE_SIGLA 1200,
  LATIME_SIGLA 120) — adică de treizeci și două de ori mai mică.

  Recodate la 400 px pe latura lungă (de trei ori peste ce se afișează vreodată,
  deci curate și pe ecrane dense): 460.659 → 107.974 octeți. Minus 352.685, adică
  77%.

  ⚠ LOADERUL NU FACE ASTA SINGUR. `supabase-image-loader` întoarce adresa
  neatinsă pentru orice nu e cheie R2, iar `/api/img` respinge prefixul
  `integrations/` prin `KEY_RE`. Pentru fișiere din `public/` nu există nicio
  cale de redimensionare la cerere — singura soluție e un fișier pre-tăiat.
  De asta există convenția `-mic`, și tot de asta a apărut înainte la Cargus,
  Sameday, Oblio, notice.ro, SmartBill și iPay.

  ⚠ NUME NOU, NU RESCRIERE PE LOC. Fișierele din `public/` se servesc cu
  `Cache-Control: max-age=31536000, immutable`. O recodare sub același nume ar
  fi rămas nevăzută un an de oricine avea deja fișierul vechi. Aceeași lecție ca
  la `logo-128.png`.

  ⚠ ORIGINALELE NU S-AU ȘTERS, și nu din neglijență: `(dashboard)/dashboard/
  features/page.tsx` și `components/dashboard/IntegrationHeader.tsx` le cer în
  continuare. Panoul ar câștiga aceiași 352 kB dacă ar trece și el pe variantele
  mici — dar acolo siglele se desenează la alte mărimi, deci trebuie măsurat
  separat înainte. Nu s-a atins nimic din panou aici.
*/

export const PROVIDER_LOGOS = {
  /* ── Curieri ───────────────────────────────────────────────────────────── */
  fanCourier: { name: "FAN Courier", src: `${I}/fan-courier.svg`, ratio: 1.64 },
  sameday: { name: "Sameday", src: `${I}/sameday-mic.webp`, ratio: 0.99 },
  cargus: { name: "Cargus", src: `${I}/cargus-mic.webp`, ratio: 1.3 },
  dpd: { name: "DPD", src: `${I}/dpd.svg`, ratio: 2.38 },
  /* Cutia e PĂTRATĂ (`width`/`height` 256px pe `<svg>`), iar viewBox-ul strâns
     la 0,60 e desenul dinăuntru. Aici scria 0,60 și sigla ieșea la 60% din
     mărimea vecinelor. Vezi avertismentul de la `ratio`. */
  coleteOnline: { name: "Colete Online", src: `${I}/colete-online.svg`, ratio: 1, ink: 0.6 },
  /* Singura care nu e taiata: 200x200 si 3,8KB, iar reincodarea a iesit de trei
     ori mai mare. Desenul acopera 183x161 din cutie, adica 74%. */
  woot: { name: "Woot", src: `${I}/woot.webp`, ratio: 1, ink: 0.74 },

  /* ── Plăți ─────────────────────────────────────────────────────────────── */
  stripe: { name: "Stripe", src: `${I}/stripe.svg`, ratio: 2.4 },
  /* Desenata integral in alb, pentru fundal inchis. E monocroma, deci inversarea
     da exact aceeasi marca in negru — spre deosebire de Oblio, unde ar fi
     stricat un gem policrom. Restul aplicatiei face la fel de mult timp. */
  netopia: { name: "Netopia Payments", src: `${I}/netopia.svg`, ratio: 2.65, invert: true },
  /* Fisierul arata sigla „BT ePOS". Numele ramane „BT iPay": asa se cheama
     integrarea peste tot in platforma (`lib/ipay.ts`, mailuri, dashboard). */
  ipay: { name: "BT iPay", src: `${I}/ipay-mic.webp`, ratio: 1.68 },
  klarna: { name: "Klarna", src: `${I}/klarna.svg`, ratio: 4.49 },
  revolut: { name: "Revolut", src: `${I}/revolut.svg`, ratio: 4.32, ink: 0.97 },

  /* ── Facturare ─────────────────────────────────────────────────────────── */
  smartbill: { name: "SmartBill", src: `${I}/smartbill-mic.webp`, ratio: 0.84 },
  /* Doar GEMUL, nu lockup-ul intreg: in `oblio.webp` cuvantul „oblio.eu" e scris
     in ALB, pentru fundal inchis, si pe alb dispare. Inversarea ar fi desenat
     gemul policrom in negativ, adica marca lor gresit. Gemul singur e corect si
     se citeste — acelasi tratament pe care il are si Mailchimp (maimuta, fara
     cuvant). Cand Oblio da un fisier pentru fundal deschis, se pune intregul. */
  oblio: { name: "Oblio", src: `${I}/oblio-mic.webp`, ratio: 1 },
  fgo: { name: "FGO", src: `${I}/fgo.svg`, ratio: 2.61 },

  /* ── Email marketing ───────────────────────────────────────────────────── */
  mailchimp: { name: "Mailchimp", src: `${I}/mailchimp.svg`, ratio: 0.89 },
  brevo: { name: "Brevo", src: `${I}/brevo.svg`, ratio: 3.38 },
  klaviyo: { name: "Klaviyo", src: `${I}/klaviyo.svg`, ratio: 3.38 },

  /* ── SMS ───────────────────────────────────────────────────────────────── */
  notice: { name: "Notice.ro", src: `${I}/notice.ro-mic.webp`, ratio: 1.58 },
  smso: { name: "SMSO", src: `${I}/smso.svg`, ratio: 4.41 },

  /* ── Marketplace ───────────────────────────────────────────────────────── */
  olx: { name: "OLX", src: `${I}/olx.svg`, ratio: 1.73 },
  aboutYou: { name: "About You", src: `${I}/aboutyou.png`, ratio: 9.86, ink: 0.92 },
  trendyol: { name: "Trendyol", src: `${I}/trendyol.svg`, ratio: 4.35 },

  /* ── Marketing și statistici ───────────────────────────────────────────── */
  facebookPixel: { name: "Facebook Pixel", src: `${I}/facebook-pixel.svg`, ratio: 1 },
  tiktokPixel: { name: "TikTok Pixel", src: `${I}/tiktok-pixel.svg`, ratio: 0.73, ink: 0.88 },
  googleAds: { name: "Google Ads", src: `${I}/google-ads.svg`, ratio: 1.09 },
  googleMerchant: {
    name: "Google Merchant Center",
    src: `${I}/google-merchant-center.svg`,
    ratio: 1,
  },
  googleAnalytics: {
    name: "Google Analytics",
    src: `${I}/google-analytics.svg`,
    ratio: 1,
    ink: 0.81,
  },

  /* ══════════════════════════════════════════════════════════════════════════
     RESTUL BIBLIOTECII: ce apare în „Biblioteca de integrări" de pe `/integrari`

     Cele de mai sus sunt siglele din banda de pe pagina de start. Astea de aici
     sunt restul catalogului — livrate care nu încăpuseră în bandă, plus cele 34
     anunțate cu „În curând".

     ⚠ NU sunt în `LOGO_GROUPS`, deci NU intră în bandă, și e dinadins: banda
     spune „astea merg azi". O siglă anunțată, pusă acolo, ar fi o promisiune.

     Toate numerele sunt MĂSURATE la 2026-08-13, cu rețeta din avertismentul de
     la `ratio`: cutia din `getBoundingClientRect()` pe un `<img>` cu
     `max-width: none`, cerneala din pânză cu marginile tăiate.
     ══════════════════════════════════════════════════════════════════════════ */

  /* ── Curieri ───────────────────────────────────────────────────────────── */
  gls: { name: "GLS", src: `${I}/gls.svg`, ratio: 2.85, ink: 0.94 },
  pallex: { name: "Pall-Ex", src: `${I}/pallex.avif`, ratio: 2.85, ink: 0.78 },
  ecolet: { name: "eColet", src: `${I}/ecolet.png`, ratio: 3.23 },
  dhl: { name: "DHL", src: `${I}/dhl.svg`, ratio: 3.23 },
  fedex: { name: "FedEx", src: `${I}/fedex.svg`, ratio: 3.61 },
  ups: { name: "UPS", src: `${I}/ups.svg`, ratio: 0.84 },
  postaRomana: { name: "Poșta Română", src: `${I}/posta_romana.svg`, ratio: 2.01 },
  packeta: { name: "Packeta", src: `${I}/packeta-mic.webp`, ratio: 0.96, ink: 0.86 },
  innoship: { name: "Innoship", src: `${I}/innoship.svg`, ratio: 2.6, ink: 0.67 },
  smartship: { name: "SmartShip", src: `${I}/smartship-mic.webp`, ratio: 4.72, ink: 0.84 },
  shipo: { name: "Shipo.ro", src: `${I}/shipo.ro.svg`, ratio: 1.81 },

  /* ── Facturare ─────────────────────────────────────────────────────────── */
  saga: { name: "SAGA", src: `${I}/saga.svg`, ratio: 5.97 },
  /* Desenată integral în ALB, măsurat: 100% din cerneală peste 225 luminozitate.
     Fără inversare, cardul ei e literalmente gol. La fel ca Netopia. */
  facturis: { name: "Facturis", src: `${I}/facturis.png`, ratio: 3.55, ink: 0.94, invert: true },
  easybill: { name: "EasyBill", src: `${I}/easybill.png`, ratio: 1.25, ink: 0.55 },
  factureaza: { name: "Factureaza.ro", src: `${I}/factureaza.ro.webp`, ratio: 5.85 },

  /* ── Email marketing ───────────────────────────────────────────────────── */
  theMarketer: { name: "TheMarketer", src: `${I}/themarketer.svg`, ratio: 5.89 },

  /* ── Plăți ─────────────────────────────────────────────────────────────── */
  ingWebPay: { name: "ING WebPay", src: `${I}/ing-mic.webp`, ratio: 4.02 },
  payu: { name: "PayU", src: `${I}/payu.png`, ratio: 1.99 },
  euplatesc: { name: "EuPlătesc", src: `${I}/euplatesc.svg`, ratio: 5.56 },
  tbi: { name: "TBI Bank", src: `${I}/tbi.svg`, ratio: 2.3 },
  unicredit: { name: "UniCredit", src: `${I}/unicredit.png`, ratio: 5.13 },
  viva: { name: "Viva.com", src: `${I}/viva-mic.webp`, ratio: 3.19, ink: 0.93 },
  libraPay: { name: "Libra Pay", src: `${I}/librapay-mic.webp`, ratio: 3.57 },
  bcr: { name: "BCR", src: `${I}/bcr-mic.webp`, ratio: 2.73 },
  saltBank: { name: "Salt Bank", src: `${I}/saltbank.svg`, ratio: 2.15 },

  /* ── Marketplace ───────────────────────────────────────────────────────── */
  emag: { name: "eMAG", src: `${I}/emag-mic.webp`, ratio: 3.73, ink: 0.99 },
  altex: { name: "Altex", src: `${I}/altex-mic.webp`, ratio: 3.71 },
  cel: { name: "Cel.ro", src: `${I}/cel.ro.webp`, ratio: 3.7, ink: 0.94 },
  okazii: { name: "Okazii.ro", src: `${I}/okazii.ro.svg`, ratio: 6.05 },
  pepita: { name: "Pepita.com", src: `${I}/pepita.svg`, ratio: 3.64, ink: 0.57 },
  compari: { name: "Compari.ro", src: `${I}/compari.ro-mic.webp`, ratio: 4.44, ink: 0.4 },
  baseLinker: { name: "BaseLinker", src: `${I}/baselinker-mic.webp`, ratio: 3.82, ink: 0.91 },

  /* ── Marketing ─────────────────────────────────────────────────────────── */
  /* Același fișier ca Facebook Pixel: e aceeași marcă, iar Meta n-are o siglă
     separată pentru catalog. Numele le deosebește. */
  facebookCatalog: { name: "Facebook Catalog", src: `${I}/facebook-pixel.svg`, ratio: 1 },
  optinMonster: { name: "OptinMonster", src: `${I}/optinmonster-mic.webp`, ratio: 6.69 },

  /* ── Suport clienți ────────────────────────────────────────────────────── */
  tidio: { name: "Tidio", src: `${I}/tidio.png`, ratio: 2.2, ink: 0.43 },
  intercom: { name: "Intercom", src: `${I}/intercom.svg`, ratio: 3.89 },
  zendesk: { name: "Zendesk", src: `${I}/zendesk.svg`, ratio: 1.4 },
  tawkto: { name: "Tawk.to", src: `${I}/tawkto-mic.webp`, ratio: 3, ink: 0.69 },
} as const satisfies Record<string, ProviderLogo>;

export type LogoKey = keyof typeof PROVIDER_LOGOS;

/**
 * Grupurile, în ordinea în care contează pentru un magazin din România.
 *
 * Aceleași categorii ca în pagina de funcții din dashboard, ca să nu învețe omul
 * o împărțire pe site și alta înăuntru.
 */
export interface LogoGroup {
  /** Numele categoriei, asa cum il vede clientul. */
  label: string;
  keys: LogoKey[];
}

export const LOGO_GROUPS: LogoGroup[] = [
  {
    label: "Curieri",
    keys: ["fanCourier", "sameday", "cargus", "dpd", "coleteOnline", "woot"],
  },
  { label: "Plăți online", keys: ["stripe", "netopia", "ipay", "klarna", "revolut"] },
  { label: "Facturare", keys: ["smartbill", "oblio", "fgo"] },
  { label: "Email marketing", keys: ["mailchimp", "brevo", "klaviyo"] },
  { label: "SMS", keys: ["notice", "smso"] },
  { label: "Marketplace", keys: ["olx", "aboutYou", "trendyol"] },
  {
    label: "Marketing și statistici",
    keys: ["facebookPixel", "tiktokPixel", "googleAds", "googleMerchant", "googleAnalytics"],
  },
];

/** Toate, in ordinea grupurilor. */
export const ALL_LOGOS: LogoKey[] = LOGO_GROUPS.flatMap((g) => g.keys);

/**
 * Peste ce raport o siglă nu mai încape într-o casetă pătrată.
 *
 * Într-o casetă pătrată, lățimea e limita. Egalizarea de suprafață dă unei sigle
 * cu raportul R înălțimea √(A/R) și lățimea √(A·R) — deci cu cât e mai lată, cu
 * atât iese mai scundă, iar când lățimea lovește peretele casetei, `object-contain`
 * o mai micșorează o dată. Măsurat într-o casetă de 84px cu 56px utili: la
 * raportul 4,5 (Klarna) sigla iese de 12,4px înălțime și încă se citește; la 9,13
 * (About You) iese de 6,1px, adică o mâzgălitură.
 *
 * 5 e pragul: peste el nu mai e o siglă mică, e o siglă ilizibilă.
 */
export const RAPORT_MAX_CASETA = 5;

/**
 * Siglele care se pot pune într-o casetă pătrată.
 *
 * Azi taie una singură, About You (9,13). NU e o scoatere din listă: About You
 * rămâne în `LOGO_GROUPS` și se numără în „27 de integrări", fiindcă integrarea
 * există. Doar nu se desenează într-un pătrat.
 *
 * Dacă o variantă are casete DREPTUNGHIULARE, late, atunci foloseşte `ALL_LOGOS`,
 * nu lista asta — acolo o siglă lată se simte bine.
 */
export const LOGOS_CASETA: LogoKey[] = ALL_LOGOS.filter(
  (k) => PROVIDER_LOGOS[k].ratio <= RAPORT_MAX_CASETA,
);
