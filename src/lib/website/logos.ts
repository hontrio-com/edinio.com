/**
 * Siglele furnizorilor, afișate lângă bifele din cardurile de funcții.
 *
 * ═══ DE CE E NEVOIE DE UN FIȘIER ÎNTREG PENTRU NIȘTE SIGLE ═══
 *
 * Cerința a fost „toate de aceeași dimensiune, nu una mai mare și alta mai mică".
 * Sună simplu, dar nu se rezolvă cu o înălțime fixă, și iată de ce.
 *
 * Siglele astea au rapoarte între 0,84 (SmartBill, aproape pătrată) și 4,49
 * (Klarna, un cuvânt lung). La ÎNĂLȚIME egală, Klarna iese de cinci ori mai lată
 * decât SmartBill și pare uriașă lângă ea. La LĂȚIME egală se întâmplă pe dos.
 *
 * Ochiul nu compară nici înălțimea, nici lățimea: compară cât „cerneală" ocupă
 * fiecare. Deci se egalizează SUPRAFAȚA. Din `LOGO_AREA` și din raportul fiecărei
 * sigle iese înălțimea ei: `h = √(suprafață / raport)`. O pătrată primește 26px
 * înălțime, un cuvânt lung primește 12px — și amândouă par la fel de mari.
 *
 * Marginile sunt strânse între 12 și 26px: sub 12 un cuvânt devine mâzgălitură,
 * peste 26 o siglă pătrată începe să concureze cu textul de lângă ea.
 *
 * ═══ RAPOARTELE SUNT MĂSURATE, NU CITITE DIN FIȘIER ═══
 *
 * `ratio` e raportul CONȚINUTULUI, aflat rasterizând fiecare fișier și tăindu-i
 * marginile goale. Nu e raportul declarat în fișier, fiindcă ăla minte des:
 * `ipay.webp` e un pătrat de 200x200 în care desenul are 166x99, iar
 * `fan-courier.svg` n-avea deloc `viewBox`. Fișierele au fost normalizate odată
 * cu asta — SVG-urilor li s-a strâns `viewBox`-ul pe contur, rasterele au fost
 * tăiate și micșorate la 160px pe latura lungă (notice.ro a scăzut de la 126KB la
 * 5KB).
 *
 * Dacă adaugi o siglă: taie-i marginile goale, măsoară-i raportul conținutului și
 * pune-l aici. Cu un raport greșit, sigla iese vizibil altfel decât vecinele.
 *
 * ═══ CE NU E AICI, ȘI DE CE ═══
 *
 * - **Netopia** — `netopia.svg` e desenat integral în alb, pentru fundal închis.
 *   Pe cardurile noastre albe e invizibilă. Nu poate fi recolorată: e marcă
 *   înregistrată. Are nevoie de fișierul lor pentru fundal deschis.
 * - **Cargus** — `cargus.svg` e un SVG doar cu numele: înăuntru are 210KB de
 *   imagine matriceală încorporată, care la 16px devine o pată.
 *
 * ═══ DOUĂ SIGLE CU O POVESTE ═══
 *
 * **Oblio** are aceeași boală ca Netopia: în `oblio.webp` cuvântul „oblio.eu" e
 * scris în ALB, fișierul e făcut pentru fundal închis. Pe cardurile noastre se
 * vedea doar gemul, cu o umbră palidă lângă el. Restul aplicației rezolvă asta cu
 * `filter: invert(1)`, dar inversarea ar transforma gemul multicolor în negativul
 * lui — adică o marcă înregistrată desenată greșit.
 *
 * Aici e păstrat doar GEMUL, decupat din original. E policrom, se citește pe alb
 * și e marca lor nemodificată — exact tratamentul pe care îl are deja Mailchimp în
 * rândul de lângă (maimuța, fără cuvânt). Când Oblio dă un fișier pentru fundal
 * deschis, se poate pune lockup-ul întreg.
 *
 * **BT** — fișierul `ipay.webp` arată sigla „BT ePOS", nu „BT iPay". Numele de
 * aici e „BT iPay" DINADINS: așa se numește integrarea peste tot în platformă
 * (`lib/ipay.ts`, mailurile către client, pagina de funcții din dashboard), și
 * asta caută omul. Dacă se schimbă vreodată, se schimbă în toate locurile odată.
 */

export interface ProviderLogo {
  /** Numele furnizorului. Merge in `alt`, deci se citeste cu voce tare. */
  name: string;
  src: string;
  /** Raportul CONTINUTULUI, masurat. Vezi nota de sus. */
  ratio: number;
}

/**
 * Suprafata pe care o ocupa fiecare sigla, in pixeli patrati.
 *
 * 640 inseamna cam 25x25. Singurul numar de reglat daca vrei siglele mai mari
 * sau mai mici peste tot.
 */
export const LOGO_AREA = 640;

/** Sub 12px un cuvant lung devine mazgalitura; peste 26 o sigla patrata concureaza cu textul. */
export const LOGO_MIN_HEIGHT = 12;
export const LOGO_MAX_HEIGHT = 26;

/** Inaltimea la care se afiseaza o sigla, ca sa para la fel de mare ca vecinele. */
export function logoHeight(ratio: number): number {
  const ideal = Math.sqrt(LOGO_AREA / ratio);
  return Math.round(Math.min(LOGO_MAX_HEIGHT, Math.max(LOGO_MIN_HEIGHT, ideal)) * 10) / 10;
}

const I = "/integrations";

export const PROVIDER_LOGOS = {
  fanCourier: { name: "FAN Courier", src: `${I}/fan-courier.svg`, ratio: 1.64 },
  sameday: { name: "Sameday", src: `${I}/sameday-mic.webp`, ratio: 0.99 },
  dpd: { name: "DPD", src: `${I}/dpd.svg`, ratio: 2.38 },

  smartbill: { name: "SmartBill", src: `${I}/smartbill-mic.webp`, ratio: 0.84 },
  /* Doar gemul, nu lockup-ul intreg: cuvantul e alb in fisier. Vezi nota de sus. */
  oblio: { name: "Oblio", src: `${I}/oblio-mic.webp`, ratio: 1 },
  fgo: { name: "FGO", src: `${I}/fgo.svg`, ratio: 2.61 },

  stripe: { name: "Stripe", src: `${I}/stripe.svg`, ratio: 2.4 },
  ipay: { name: "BT iPay", src: `${I}/ipay-mic.webp`, ratio: 1.68 },
  klarna: { name: "Klarna", src: `${I}/klarna.svg`, ratio: 4.49 },

  mailchimp: { name: "Mailchimp", src: `${I}/mailchimp.svg`, ratio: 0.89 },
  brevo: { name: "Brevo", src: `${I}/brevo.svg`, ratio: 3.38 },
  klaviyo: { name: "Klaviyo", src: `${I}/klaviyo.svg`, ratio: 3.38 },

  notice: { name: "Notice.ro", src: `${I}/notice.ro-mic.webp`, ratio: 1.58 },
  smso: { name: "SMSO", src: `${I}/smso.svg`, ratio: 4.41 },
} as const satisfies Record<string, ProviderLogo>;

export type LogoKey = keyof typeof PROVIDER_LOGOS;

/** Grupurile folosite de mai multe ori, ca sa nu se rescrie si sa iasa altfel. */
export const CURIERI: LogoKey[] = ["fanCourier", "sameday", "dpd"];
export const FACTURARE: LogoKey[] = ["smartbill", "oblio", "fgo"];
export const PLATI: LogoKey[] = ["stripe", "ipay", "klarna"];
export const EMAIL: LogoKey[] = ["mailchimp", "brevo", "klaviyo"];
export const SMS: LogoKey[] = ["notice", "smso"];
