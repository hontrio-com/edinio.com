/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CIFRĂ DE CARD STĂ PE UN SINGUR RÂND                         (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECT SEMNALAT DE EL, A DOUA OARĂ. Prima dată pe telefon, la Clienți:
 * „Valoare medie per comandă” trecea pe rândul următor. Atunci s-a reparat
 * grila. Acum s-a văzut pe DESKTOP, la Discounturi: `15.831,80 lei` la 44px
 * cere vreo 310px, iar un card dintr-o grilă de patru are sub 200px.
 *
 * Grila nu mai e de vină: cifra e prea mare pentru cutia ei, oricât de bine ar
 * fi așezate cutiile. Și nu se poate repara cu o măsură fixă, fiindcă suma nu e
 * mărginită: un magazin mare scrie `1.234.567,89 lei`.
 *
 * ⚠ DE-AIA MĂRIMEA SE IA DIN LUNGIMEA TEXTULUI, nu din tipul cifrei. Cardul nu
 * știe dacă primește lei, bucăți sau procente — primește un șir gata scris.
 *
 * ⚠⚠ ȘI SE ÎNGUSTEAZĂ DOAR DE LA `lg` ÎN SUS, acolo unde stau patru pe rând.
 * Pe telefon cardul e singur pe lățimea ecranului și are loc berechet; micșorat
 * și acolo, s-ar fi reparat un defect de desktop stricând ecranul pe care omul
 * chiar se uită cel mai des.
 *
 * ═══ ⚠⚠ PRAGURILE SUNT MĂSURATE, NU GHICITE ═══
 *
 * Prima variantă le-a socotit dintr-o regulă din burtă — „o cifră ține cam 0,6
 * din mărimea fontului” — și a ieșit mult prea aspră: `15.831,80 lei` cădea la
 * 22px, adică pierdut într-o cutie de 170px înălțime. El a văzut pe loc: „parcă
 * mi se pare că sunt cam mici cifrele pentru chenarul ăsta mare”.
 *
 * Măsurat apoi în browser, în chiar fontul și cardul de pe ecran (lățime utilă
 * 197px într-o grilă de patru, la 1568px lățime de fereastră):
 *
 *     „6”                 1 semn   încape la 44px
 *     „54”                2        44px
 *     „2.224,60 lei”     12        36px
 *     „15.831,80 lei”    13        34px
 *     „118.875,72 lei”   14        32px
 *
 * Adică ~0,45 din mărimea fontului pe semn, nu 0,6: separatorii („.”, „,”) și
 * spațiul sunt mult mai înguste decât cifrele, iar `tracking-[-0.03em]` strânge
 * și el. Pragurile stau pe 0,45, ceva mai aspru decât măsurătoarea — atât cât să
 * încapă și un font puțin mai lat.
 */


/** Cât din mărimea fontului ține, în medie, un semn. Măsurat — vezi mai sus. */
const LATIMEA_UNUI_SEMN = 0.45;

/**
 * Lățimea de scris a unui card, într-o grilă de patru.
 *
 * ⚠ 231px, nu 197: pagina Discounturi era pe `max-w-5xl`, singura din panou mai
 * îngustă decât restul. Lățită la `max-w-6xl`, ca Panoul și Clienții — și de
 * acolo venea jumătate din înghesuială.
 */
const LATIME_CARD = 231;

/** Aceeași lățime pe telefon, unde cardul e singur pe rând. */
const LATIME_TELEFON = 290;

/** Mărimea la care cardul scrie unitatea („lei", „%"), din `CardStatistica`. */
const MARIMEA_UNITATII = 20;

/** Ce se arată într-un card: cifra și, uneori, unitatea de lângă ea. */
export interface CifraDeCard {
  valoare: string | number;
  /** „lei", „%", „buc." — scrisă mic, lângă cifră. */
  unitate?: string;
}

/**
 * Cât loc rămâne pentru CIFRĂ, după ce unitatea își ia partea.
 *
 * ⚠⚠ UNITATEA NU SE NUMĂRĂ CA UN SEMN DE-AL CIFREI. Ea se scrie la 20px, orice
 * mărime ar avea cifra. Numărată la fel ca restul, „lei" costa cât trei cifre
 * uriașe și împingea totul în jos degeaba — chiar defectul pe care el l-a
 * văzut: „parcă mi se pare că sunt cam mici cifrele pentru chenarul ăsta mare”.
 *
 * ⚠⚠ ȘI DE-AIA UNITATEA SE DĂ SEPARAT, nu lipită de sumă. `formatPrice(1e6)` dă
 * „1.000.000 lei” — treisprezece semne; `formatPriceValue(1e6)` dă „1.000.000”,
 * nouă. Panoul și Statisticile o făceau de mult așa; Discounturile și Clienții
 * nu, și de-aia acolo s-au și văzut cifrele mici. Cerut de el: „vreau să încapă
 * și 1 milion de lei, 10 milioane de lei”.
 */
function locRamas(latime: number, unitate?: string): number {
  if (!unitate) return latime;
  /* Spațiul dinaintea ei intră și el în socoteală. */
  return latime - (unitate.length + 1) * MARIMEA_UNITATII * LATIMEA_UNUI_SEMN;
}

/*
 * ⚠⚠ TREPTELE SUNT ȘIRURI LITERALE, ȘI TREBUIE SĂ RĂMÂNĂ AȘA.
 *
 * Tailwind își strânge clasele citind SURSA, ca text. O mărime compusă la
 * rulare, compusă prin interpolare din mărimea în pixeli, n-ar fi generată
 * niciodată, iar cifra ar cădea în
 * tăcere pe mărimea implicită: nicio eroare, nicăieri, doar un ecran care arată
 * altfel decât scrie codul. Vezi proba de alături.
 */
const TREPTE = [
  { px: 44, cls: "text-[44px]", lg: "lg:text-[44px]" },
  { px: 40, cls: "text-[40px]", lg: "lg:text-[40px]" },
  { px: 36, cls: "text-[36px]", lg: "lg:text-[36px]" },
  { px: 32, cls: "text-[32px]", lg: "lg:text-[32px]" },
  { px: 28, cls: "text-[28px]", lg: "lg:text-[28px]" },
  { px: 24, cls: "text-[24px]", lg: "lg:text-[24px]" },
  { px: 20, cls: "text-[20px]", lg: "lg:text-[20px]" },
] as const;

type Treapta = (typeof TREPTE)[number];

/** Cea mai mare treaptă la care textul mai încape. */
function treapta(semne: number, latime: number, unitate?: string): Treapta {
  const loc = locRamas(latime, unitate);
  return TREPTE.find((t) => semne * t.px * LATIMEA_UNUI_SEMN <= loc) ?? TREPTE[TREPTE.length - 1];
}

/**
 * Clasele de mărime pentru o cifră de card, ca să nu treacă pe două rânduri.
 *
 * ⚠ Două mărimi: una pentru telefon și tabletă, unde cardul e lat (o coloană,
 * apoi două), și una de la `lg` în sus, unde stau patru pe rând.
 */
export function marimeaCifrei(text: string | number, unitate?: string): string {
  const n = String(text).trim().length || 1;
  const peTelefon = treapta(n, LATIME_TELEFON, unitate);
  const laPatru = treapta(n, LATIME_CARD, unitate);
  return peTelefon.px === laPatru.px ? peTelefon.cls : `${peTelefon.cls} ${laPatru.lg}`;
}

/**
 * ⚠⚠ TOATE CARDURILE DE PE UN RÂND POARTĂ ACEEAȘI MĂRIME, dată de cea care are
 * nevoie de cel mai mult loc.
 *
 * Prima variantă alegea mărimea fiecărui card în parte — și el a văzut pe loc ce
 * ieșea: „6” și „54” rămâneau mari, iar „15.831,80 lei” scădea, deci cele patru
 * cutii nu mai arătau ca un set. Cuvintele lui: „tipografia pare diferită între
 * carduri, textele alea 2 sunt groase și celelalte subțiri”.
 *
 * ⚠ NU se ia cea mai LUNGĂ, ci cea care cere cea mai MICĂ mărime: o cifră
 * scurtă cu o unitate lungă poate cere mai mult loc decât una lungă fără ea.
 */
export function marimeaRandului(valori: readonly (CifraDeCard | string | number)[]): string {
  let alesa: string | null = null;
  let ceaMaiMica = Infinity;

  for (const v of valori) {
    const c: CifraDeCard = typeof v === "object" && v !== null && "valoare" in v
      ? v
      : { valoare: v as string | number };
    const n = String(c.valoare).trim().length || 1;
    const px = treapta(n, LATIME_CARD, c.unitate).px;
    if (px < ceaMaiMica) {
      ceaMaiMica = px;
      alesa = marimeaCifrei(c.valoare, c.unitate);
    }
  }

  return alesa ?? marimeaCifrei("0");
}
