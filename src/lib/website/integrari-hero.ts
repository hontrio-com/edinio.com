/**
 * Câmpul de sigle care plutesc în hero-ul paginii „Integrări".
 *
 * ═══ DE CE STAU POZIȚIILE ÎNTR-UN FIȘIER DE DATE, ȘI NU ÎN CLASE ═══
 *
 * Fiindcă întrebarea „încape?" are un răspuns care se CALCULEAZĂ, nu unul care
 * se vede. Siglele sunt așezate absolut peste text: dacă una cade cu 20px prea
 * spre mijloc, ea nu dispare și nu dă nicio eroare — se așază peste titlu, iar
 * asta se observă doar dacă cineva deschide chiar lățimea aia de ecran.
 *
 * Aici pozițiile sunt numere, iar `problemeDeAsezare()` le verifică pe toate, la
 * o listă de lățimi, în `integrari-hero.test.ts`. Ce păzește proba:
 *   - nicio siglă peste coridorul textului;
 *   - nicio siglă ieșită din ecran, nici măcar cu umbra;
 *   - nicio siglă peste bara de sus;
 *   - nicio pereche de sigle una peste alta.
 *
 * ⚠ Și toate astea NU în repaus, ci cu casetele duse la capătul plutirii. Vezi
 * `umflarea()`: o siglă care stă bine nemișcată și intră peste titlu la secunda
 * a șaptea e exact defectul pe care nu-l prinde nimeni uitându-se o dată.
 *
 * ═══ CELE DOUĂ AȘEZĂRI, ȘI DE CE NU E UNA SINGURĂ ═══
 *
 * Coridorul textului e LAT: titlul are `max-w-[900px]`. Pe un ecran de 1024px
 * rămân 62px de fiecare parte — adică nicăieri unde să încapă o siglă de 84px.
 * Deci „sigle risipite în jurul textului" e cu putință doar de la ~1280px în
 * sus, unde marginile chiar au loc.
 *
 * De aceea așezarea nu e o singură hartă micșorată, ci două, plus o treaptă:
 *
 *   sub 1024px  →  8 sigle, DOUĂ BENZI, sus și jos de text. Zero risc de
 *                  suprapunere peste text: benzile sunt în afara zonei de
 *                  conținut prin construcție, fiindcă chiar ele dau spațierea
 *                  secțiunii.
 *   1024-1279   →  12 sigle, tot în benzi, dar mai multe și mai mari.
 *   de la 1280  →  16 sigle: cele 12 plus patru pe laturi, la mijlocul înălțimii,
 *                  acolo unde marginile s-au deschis destul.
 *
 * ═══ ANCORAREA E DE MUCHIE, NU PROCENTUALĂ ═══
 *
 * `y` e o distanță în PIXELI, nu un procent din înălțime. Motivul e practic:
 * înălțimea hero-ului depinde de câte rânduri ia titlul, iar titlul se rupe
 * altfel la fiecare lățime. Cu procente, o siglă „la 88% din înălțime" coboară
 * odată cu textul și intră peste rândul de dedesubt. Ancorată de muchie, banda
 * rămâne bandă oricât ar crește textul dintre ele.
 *
 * `x` rămâne procentual: acolo chiar vrem ca siglele să se răsfire odată cu
 * ecranul.
 */

import { PROVIDER_LOGOS, type LogoKey } from "./logos";

/**
 * Cât intră hero-ul sub bara lipicioasă (`-mt-18` din `HeroCadru`).
 *
 * Câmpul e `inset-0` pe secțiune, deci `y = 0` e chiar marginea de sus a
 * paginii, ADICĂ SUB BARĂ. Fără numărul ăsta, prima siglă ar fi ieșit fix peste
 * siglă și meniu.
 */
export const SPATIU_BARA = 72;

/** De la ce înălțime în jos are voie să înceapă o siglă. Bara are 72-73px. */
export const LIBER_SUB_BARA = 80;

/**
 * Cât iese umbra casetei în lateral, în px.
 *
 * `--umbra-placa` are `0 10px 22px -8px`, deci se întinde `22 - 8 = 14px` în
 * toate direcțiile pe orizontală și cu 10 mai mult în jos. Secțiunea are
 * `overflow-hidden`, așa că o siglă lipită de margine își pierde umbra tăiată
 * drept — exact defectul pe care clientul l-a văzut imediat la benzile de pe
 * pagina de start.
 */
export const MARGINE_UMBRA = 14;
/** Cât coboară umbra sub casetă: `10 + 22 - 8`. */
export const UMBRA_JOS = 24;

/** Latura casetei pe ecran lat. */
export const MARIME_LAT = 84;
/**
 * Latura casetei sub `lg`, ca în CSS: `clamp(52px, 17vw, 68px)`.
 *
 * ⚠ FLUIDĂ, nu fixă, și asta repară un defect real. Cu 68px ficși, patru casete
 * ocupă 272px dintr-un ecran de 320: rămân 48px de joc pe tot rândul, adică 16
 * între vecine — mai puțin decât cursa plutirii, deci la un moment din tură
 * casetele chiar se ating. În `vw`, pe ecran îngust se micșorează în loc să se
 * înghesuie. (Aceeași lecție ca la petele de lumină din hero: dacă mărimea e în
 * px și poziția în procente, efectul se îndeasă pe ecran mic.)
 */
export function marimeaIngusta(latime: number): number {
  return Math.min(68, Math.max(52, 0.17 * latime));
}

export function marimea(latime: number): number {
  return latime >= PRAG_LAT ? MARIME_LAT : marimeaIngusta(latime);
}

/**
 * Peste ce raport o siglă nu mai are ce căuta aici.
 *
 * `RAPORT_MAX_CASETA` din `logos.ts` e 5, și e pragul „încă se citește" pentru
 * casetele din banda de pe pagina de start. Aici pragul e mai strâns, și are alt
 * motiv: acolo caseta trece prin dreptul ochiului într-un șir de paisprezece,
 * aici e una dintre șaisprezece piese care stau pe o pagină albă și fiecare e
 * privită separat.
 *
 * Numerele, într-o casetă de 84px cu 56px utili: la raportul 2,4 (Stripe) sigla
 * iese de 23,3px înălțime; la 2,8 de 20px; la 4,35 (Trendyol) de 12,9px, adică o
 * zgârietură în mijlocul unei plăci goale. Pragul e 2,8 — sub el nicio siglă nu
 * arată ca o greșeală de încărcare.
 *
 * Nu e o scoatere din ofertă: Trendyol, Klarna, Revolut, Brevo, Klaviyo și SMSO
 * rămân în `LOGO_GROUPS` și în banda de pe pagina de start. Doar nu plutesc.
 */
export const RAPORT_MAX_PLUTA = 2.8;

/* ── Plutirea ──────────────────────────────────────────────────────────────── */

/**
 * Cea mai mare deplasare dintr-un traseu de plutire, în px, și cea mai mare
 * rotație, în grade.
 *
 * ⚠ Numerele astea trebuie să rămână în pas cu `@keyframes pluta-a…e` din
 * globals.css. Ele sunt ce transformă „unde e caseta" în „unde poate ajunge
 * caseta", deci toată verificarea de așezare atârnă de ele. Dacă cineva mărește
 * o cheie din CSS fără să le urce și pe astea, proba trece și siglele intră
 * peste titlu.
 */
export const CURSA_MAX = 9;
export const ROTATIE_MAX = 3;

/**
 * Cât de tare plutesc casetele, pe fiecare treaptă.
 *
 * Sub `lg` cursa e tăiată la 70%: acolo casetele sunt și mai mici, și mai
 * apropiate, iar 9px de deplasare le-ar duce una peste alta. Traseele sunt
 * aceleași; se înmulțesc cu numărul ăsta, direct în `@keyframes`.
 */
export const CURSA = { ingust: 0.7, lat: 1 } as const;

/**
 * Cu cât se umflă cutia unei casete când e dusă la capătul plutirii.
 *
 * Două lucruri o fac mai mare decât pare: deplasarea, și rotația — un pătrat de
 * latura `s` rotit cu θ ocupă `s·(cosθ + sinθ)`, adică puțin mai mult decât
 * latura lui.
 */
export function umflarea(marime: number, cursa: number): number {
  const unghi = ((ROTATIE_MAX * cursa) * Math.PI) / 180;
  const bombare = (marime * (Math.cos(unghi) + Math.sin(unghi) - 1)) / 2;
  return Math.ceil(CURSA_MAX * cursa + bombare);
}

/* ── Benzile ───────────────────────────────────────────────────────────────── */

/**
 * Cât spațiu ține fiecare bandă, de la muchia secțiunii.
 *
 * ⚠ Numerele astea sunt ȘI spațierea de sus/jos a hero-ului: `HeroCadru` le
 * primește prin `stiluriBanda()` și le pune ca `padding`. Adică zona în care
 * plutesc siglele e chiar zona în care textul NU are voie să intre. Cu două
 * seturi de numere — unul pentru padding, altul pentru sigle — s-ar fi desfăcut
 * la prima corectură, și abia pe telefonul cuiva.
 *
 * `sus` se măsoară de la marginea paginii, deci include cei 72px de sub bară.
 */
export const BANDA = {
  ingust: { sus: 200, jos: 140 },
  lat: { sus: 232, jos: 176 },
} as const;

/**
 * Cel mai scund conținut cu care mai poate ieși hero-ul, ca înălțime.
 *
 * Nu e o măsurătoare, e o margine de siguranță pentru probă: siglele de pe
 * laturi stau la mijlocul ÎNĂLȚIMII, deci cu cât hero-ul e mai scurt, cu atât
 * sunt mai aproape de benzi. Cifrele vin dintr-un titlu pe un singur rând, un
 * lead pe două și rândul de garanții — adică mai puțin decât are pagina azi.
 * Dacă cineva scurtează cândva titlul, proba spune dinainte că laturile nu mai
 * încap.
 */
export const CONTINUT_MINIM = { ingust: 340, lat: 290 } as const;

/** Lățimea maximă a titlului (`max-w-[900px]` în `HeroCadru`). */
const LATIME_TITLU = 900;
/** `max-w-[1200px]` pe containerul de conținut. */
const LATIME_CONTAINER = 1200;

/** `px-5 sm:px-6 lg:px-8` */
function respiratieLaterala(latime: number): number {
  if (latime >= 1024) return 32;
  if (latime >= 640) return 24;
  return 20;
}

export type Treapta = "ingust" | "lat";

/** De la ce lățime se trece la așezarea largă. Tailwind `lg`. */
export const PRAG_LAT = 1024;
/** De la ce lățime apar siglele de pe laturi. Tailwind `xl`. */
export const PRAG_LATURI = 1280;

export function treapta(latime: number): Treapta {
  return latime >= PRAG_LAT ? "lat" : "ingust";
}

/**
 * Unde stă o siglă.
 *
 * „sus" și „jos" sunt cele două benzi, măsurate de la muchia lor; „mijloc" e o
 * siglă de pe laturi, măsurată de la jumătatea înălțimii (poate fi negativ).
 *
 * De ce laturile se agață de MIJLOC și nu de sus, ca benzile: ele sunt singurele
 * care stau la aceeași înălțime cu textul, deci singurele care trebuie să rămână
 * ÎNTRE benzi. Măsurate de sus, la un hero mai scurt ar fi coborât peste banda de
 * jos; măsurate de la mijloc, se strâng odată cu el.
 */
export type Zona = "sus" | "jos" | "mijloc";

export interface Loc {
  /** Centrul casetei, în procente din lățimea câmpului. */
  x: number;
  /** Distanța de la reperul zonei până la CENTRUL casetei, în px. */
  y: number;
  zona: Zona;
}

export interface SiglaPlutitoare {
  cheie: LogoKey;
  /** Poziția sub `lg`. Lipsește exact la siglele care apar doar pe ecran lat. */
  ingust?: Loc;
  /** Poziția de la `lg` în sus. O are fiecare siglă. */
  lat: Loc;
  /** De la ce lățime se arată. Lipsă = mereu. */
  deLa?: "lg" | "xl";
  /** Care dintre cele cinci trasee de plutire (`@keyframes pluta-a…e`). */
  cale: "a" | "b" | "c" | "d" | "e";
  /** Cât ține o tură, în secunde. */
  durata: number;
  /**
   * Decalajul de pornire, NEGATIV: animația începe deja pornită.
   *
   * Cu decalaj zero, toate siglele ar pleca din același punct al traseului și
   * s-ar vedea imediat că e o singură animație pusă de șaisprezece ori. Numerele
   * sunt scrise de mână, nu din `Math.random()` — acela ar da altă valoare pe
   * server decât în browser și ar rupe hidratarea.
   */
  decalaj: number;
}

/**
 * Cele 16 sigle, în ordinea în care se citesc pe ecran lat.
 *
 * ALEGEREA MĂRCILOR nu e la întâmplare: primele opt sunt și singurele care apar
 * pe telefon, deci ele trebuie să acopere singure toate familiile de integrări —
 * curier, plată, facturare, marketplace, marketing. Restul îmbogățesc imaginea
 * pe ecran mare, unde e loc.
 *
 * Nu e o listă a integrărilor: aia e `LOGO_GROUPS` din `logos.ts` și e completă.
 * Asta e o mână de mărci pe care le recunoaște un magazin din România dintr-o
 * privire, cât să înțeleagă despre ce e pagina înainte să citească titlul.
 */
export const SIGLE_PLUTITOARE: SiglaPlutitoare[] = [
  /* ── Mereu vizibile: banda de sus ─────────────────────────────────────── */
  {
    cheie: "fanCourier",
    ingust: { x: 15, y: 124, zona: "sus" },
    lat: { x: 7, y: 138, zona: "sus" },
    cale: "a",
    durata: 12.5,
    decalaj: -1.7,
  },
  {
    cheie: "stripe",
    ingust: { x: 38, y: 156, zona: "sus" },
    lat: { x: 34, y: 142, zona: "sus" },
    cale: "c",
    durata: 15,
    decalaj: -6.2,
  },
  {
    cheie: "smartbill",
    ingust: { x: 61, y: 126, zona: "sus" },
    lat: { x: 76, y: 136, zona: "sus" },
    cale: "b",
    durata: 11,
    decalaj: -3.4,
  },
  {
    cheie: "olx",
    ingust: { x: 85, y: 152, zona: "sus" },
    lat: { x: 92, y: 170, zona: "sus" },
    cale: "e",
    durata: 16.5,
    decalaj: -8.1,
  },

  /* ── Mereu vizibile: banda de jos ─────────────────────────────────────── */
  {
    cheie: "sameday",
    ingust: { x: 16, y: 64, zona: "jos" },
    lat: { x: 9, y: 70, zona: "jos" },
    cale: "d",
    durata: 13.5,
    decalaj: -2.9,
  },
  {
    cheie: "googleAds",
    ingust: { x: 39, y: 94, zona: "jos" },
    lat: { x: 42, y: 76, zona: "jos" },
    cale: "a",
    durata: 17,
    decalaj: -5.5,
  },
  {
    cheie: "dpd",
    ingust: { x: 62, y: 66, zona: "jos" },
    lat: { x: 80, y: 68, zona: "jos" },
    cale: "b",
    durata: 14,
    decalaj: -9.3,
  },
  {
    cheie: "facebookPixel",
    ingust: { x: 85, y: 92, zona: "jos" },
    lat: { x: 93, y: 110, zona: "jos" },
    cale: "c",
    durata: 12,
    decalaj: -4.6,
  },

  /* ── De la `lg`: benzile se îndesesc de la patru la șase ───────────────── */
  {
    cheie: "cargus",
    lat: { x: 20, y: 176, zona: "sus" },
    deLa: "lg",
    cale: "d",
    durata: 15.5,
    decalaj: -7.2,
  },
  {
    cheie: "oblio",
    lat: { x: 58, y: 174, zona: "sus" },
    deLa: "lg",
    cale: "e",
    durata: 13,
    decalaj: -0.9,
  },
  {
    cheie: "mailchimp",
    lat: { x: 25, y: 118, zona: "jos" },
    deLa: "lg",
    cale: "a",
    durata: 16,
    decalaj: -10.4,
  },
  {
    cheie: "notice",
    lat: { x: 63, y: 120, zona: "jos" },
    deLa: "lg",
    cale: "b",
    durata: 11.5,
    decalaj: -2.1,
  },

  /* ── De la `xl`: laturile, în dreptul textului ─────────────────────────── */
  /*
    Astea patru sunt singurele care stau la aceeași înălțime cu textul, deci
    singurele pentru care verificarea de coridor chiar face treabă. La 1280px au
    peste 20px de joc până la marginea titlului; sub 1280 n-ar mai avea niciunul,
    de aceea dispar de tot în loc să se strângă.

    `y` e față de jumătatea înălțimii, și e ușor coborât la toate patru: benzile
    nu sunt egale (200/232 sus față de 140/176 jos), deci mijlocul câmpului cade
    puțin deasupra mijlocului textului.
  */
  {
    cheie: "netopia",
    lat: { x: 7, y: -56, zona: "mijloc" },
    deLa: "xl",
    cale: "c",
    durata: 14.5,
    decalaj: -6.8,
  },
  {
    cheie: "coleteOnline",
    lat: { x: 9, y: 72, zona: "mijloc" },
    deLa: "xl",
    cale: "d",
    durata: 12.5,
    decalaj: -3.7,
  },
  {
    cheie: "tiktokPixel",
    lat: { x: 91, y: -34, zona: "mijloc" },
    deLa: "xl",
    cale: "e",
    durata: 15,
    decalaj: -8.6,
  },
  {
    cheie: "googleMerchant",
    lat: { x: 94, y: 96, zona: "mijloc" },
    deLa: "xl",
    cale: "a",
    durata: 13,
    decalaj: -1.3,
  },
];

/** Siglele care se văd la o lățime dată. */
export function vizibile(latime: number): SiglaPlutitoare[] {
  if (latime >= PRAG_LATURI) return SIGLE_PLUTITOARE;
  if (latime >= PRAG_LAT) return SIGLE_PLUTITOARE.filter((s) => s.deLa !== "xl");
  return SIGLE_PLUTITOARE.filter((s) => s.ingust !== undefined);
}

/** Poziția unei sigle pe o treaptă, sau `null` dacă nu se arată acolo. */
export function locul(sigla: SiglaPlutitoare, pe: Treapta): Loc | null {
  return pe === "lat" ? sigla.lat : (sigla.ingust ?? null);
}

export interface Cutie {
  stanga: number;
  dreapta: number;
  sus: number;
  jos: number;
}

/**
 * Cutia pe care o ocupă o siglă, în pixeli, într-un câmp de `W x H`.
 *
 * `umflare` e cât se lărgește cutia ca să cuprindă și plutirea. Zero dă poziția
 * de repaus; `umflarea()` dă tot ce poate atinge caseta într-o tură.
 */
export function cutia(
  loc: Loc,
  marime: number,
  W: number,
  H: number,
  umflare = 0,
): Cutie {
  const centruX = (loc.x / 100) * W;
  const centruY =
    loc.zona === "jos" ? H - loc.y : loc.zona === "mijloc" ? H / 2 + loc.y : loc.y;
  const raza = marime / 2 + umflare;
  return {
    stanga: centruX - raza,
    dreapta: centruX + raza,
    sus: centruY - raza,
    jos: centruY + raza,
  };
}

/**
 * Dreptunghiul în care stă textul hero-ului și în care nu are voie nicio siglă.
 *
 * Lățimea vine din titlu (`max-w-[900px]` în containerul de 1200 cu respirația
 * lui), nu din textul chiar desenat. E dinadins mai lat decât adevărul: titlul e
 * centrat, deci rândurile lui sunt mai scurte decât cutia — dar cutia e ce se
 * poate socoti fără să randezi fontul, iar o margine în plus la un titlu costă
 * mai puțin decât o siglă peste o literă.
 */
export function coridorul(W: number, H: number): Cutie {
  const banda = BANDA[treapta(W)];
  const container = Math.min(LATIME_CONTAINER, W) - 2 * respiratieLaterala(W);
  const latime = Math.min(LATIME_TITLU, container);
  return {
    stanga: (W - latime) / 2,
    dreapta: (W + latime) / 2,
    sus: banda.sus,
    jos: H - banda.jos,
  };
}

export function seIntersecteaza(a: Cutie, b: Cutie): boolean {
  return (
    a.stanga < b.dreapta && a.dreapta > b.stanga && a.sus < b.jos && a.jos > b.sus
  );
}

/**
 * Tot ce e greșit în așezare la o lățime și o înălțime date. Gol = e bine.
 *
 * Se cheamă din probă pentru fiecare lățime pe care o susținem. Fiecare rând
 * întors e un defect pe care ochiul l-ar fi găsit doar dacă nimerea exact ecranul
 * ăla, și doar dacă se uita în clipa potrivită din tura de plutire.
 */
export function problemeDeAsezare(W: number, H: number): string[] {
  const pe = treapta(W);
  const marime = marimea(W);
  const banda = BANDA[pe];
  const umflare = umflarea(marime, CURSA[pe]);
  const coridor = coridorul(W, H);
  const probleme: string[] = [];

  const asezate = vizibile(W)
    .map((sigla) => {
      const loc = locul(sigla, pe);
      if (!loc) return null;
      return {
        sigla,
        loc,
        /* Cutia de REPAUS: cât ocupă chiar placa, pentru umbră și margini. */
        placa: cutia(loc, marime, W, H),
        /* Cutia PLUTITĂ: tot ce poate atinge caseta într-o tură. */
        cursa: cutia(loc, marime, W, H, umflare),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  for (const { sigla, loc, placa, cursa } of asezate) {
    const nume = PROVIDER_LOGOS[sigla.cheie].name;

    /* Umbra intră și ea în socoteală: secțiunea are `overflow-hidden`, deci ce
       iese pe lângă siglă se taie drept și se vede. Aici se măsoară placa în
       repaus — o umbră care se ciupește o clipă în timpul plutirii nu e defect. */
    if (placa.stanga < MARGINE_UMBRA || placa.dreapta > W - MARGINE_UMBRA) {
      probleme.push(
        `${nume}: prea aproape de marginea laterală (${placa.stanga.toFixed(1)}…${placa.dreapta.toFixed(1)} din ${W})`,
      );
    }
    if (placa.jos > H - UMBRA_JOS) {
      probleme.push(`${nume}: umbra iese pe sub marginea de jos (${placa.jos.toFixed(1)} din ${H})`);
    }
    /* Placa însăși nu are voie să iasă din ecran nici în timpul plutirii. */
    if (cursa.stanga < 0 || cursa.dreapta > W) {
      probleme.push(`${nume}: iese din ecran când plutește`);
    }
    if (cursa.sus < LIBER_SUB_BARA) {
      probleme.push(`${nume}: urcă peste bara de sus (${cursa.sus.toFixed(1)}px)`);
    }

    /* Cele din benzi nu au voie să iasă din banda lor: acolo e tot ce le ține
       departe de text, indiferent cât de înalt devine titlul. */
    if (loc.zona === "sus" && cursa.jos > banda.sus) {
      probleme.push(`${nume}: coboară din banda de sus (${cursa.jos.toFixed(1)} > ${banda.sus})`);
    }
    if (loc.zona === "jos" && cursa.sus < H - banda.jos) {
      probleme.push(`${nume}: urcă din banda de jos (${cursa.sus.toFixed(1)} < ${H - banda.jos})`);
    }
    /* Iar cele de pe laturi trebuie să rămână ÎNTRE benzi: ele sunt în dreptul
       textului, deci se apără doar pe orizontală. */
    if (loc.zona === "mijloc" && (cursa.sus < banda.sus || cursa.jos > H - banda.jos)) {
      probleme.push(`${nume}: iese din dreptul textului, în bandă`);
    }

    if (seIntersecteaza(cursa, coridor)) {
      probleme.push(`${nume}: intră peste textul hero-ului`);
    }
  }

  for (let i = 0; i < asezate.length; i++) {
    for (let j = i + 1; j < asezate.length; j++) {
      if (seIntersecteaza(asezate[i].cursa, asezate[j].cursa)) {
        probleme.push(
          `${PROVIDER_LOGOS[asezate[i].sigla.cheie].name} peste ${PROVIDER_LOGOS[asezate[j].sigla.cheie].name}`,
        );
      }
    }
  }

  return probleme;
}

/**
 * Spațierea hero-ului, ca variabile CSS.
 *
 * De sus se scade bara: secțiunea intră sub ea cu `-mt-18` și își pune cei 72px
 * la loc cu `pt-18`, deci `padding-top` trebuie să fie restul până la bandă. Jos
 * nu e nimic de scăzut.
 */
export function stiluriBanda(): Record<string, string> {
  return {
    "--banda-sus": `${BANDA.ingust.sus - SPATIU_BARA}px`,
    "--banda-jos": `${BANDA.ingust.jos}px`,
    "--banda-sus-lg": `${BANDA.lat.sus - SPATIU_BARA}px`,
    "--banda-jos-lg": `${BANDA.lat.jos}px`,
  };
}

/**
 * Ce aude cine nu vede câmpul.
 *
 * Câmpul e `role="img"` cu eticheta asta, nu 16 imagini cu `alt` fiecare: altfel
 * un cititor de ecran ar fi enumerat șaisprezece mărci ÎNAINTE de titlul paginii.
 * Așa e o singură imagine compusă, cu o descriere care spune ce arată.
 */
export function etichetaCampului(): string {
  const nume = SIGLE_PLUTITOARE.map((s) => PROVIDER_LOGOS[s.cheie].name);
  return `Sigle ale serviciilor integrate cu Edinio: ${nume.join(", ")}.`;
}
