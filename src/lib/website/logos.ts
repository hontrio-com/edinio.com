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

export const PROVIDER_LOGOS = {
  /* ── Curieri ───────────────────────────────────────────────────────────── */
  fanCourier: { name: "FAN Courier", src: `${I}/fan-courier.svg`, ratio: 1.64 },
  sameday: { name: "Sameday", src: `${I}/sameday-mic.webp`, ratio: 0.99 },
  cargus: { name: "Cargus", src: `${I}/cargus-mic.webp`, ratio: 1.3 },
  dpd: { name: "DPD", src: `${I}/dpd.svg`, ratio: 2.38 },
  coleteOnline: { name: "Colete Online", src: `${I}/colete-online.svg`, ratio: 0.6 },
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
  revolut: { name: "Revolut", src: `${I}/revolut.svg`, ratio: 4.41 },

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
  aboutYou: { name: "About You", src: `${I}/aboutyou.png`, ratio: 9.13 },
  trendyol: { name: "Trendyol", src: `${I}/trendyol.svg`, ratio: 4.35 },

  /* ── Marketing și statistici ───────────────────────────────────────────── */
  facebookPixel: { name: "Facebook Pixel", src: `${I}/facebook-pixel.svg`, ratio: 1 },
  tiktokPixel: { name: "TikTok Pixel", src: `${I}/tiktok-pixel.svg`, ratio: 0.83, ink: 0.88 },
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
