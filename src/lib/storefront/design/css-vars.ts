import { CONTAINER_REM, DENSITY_REM, FONT_SCALE, RADIUS_PX } from "./defaults";
import type { ResolvedStyle } from "./types";

/**
 * Traduce stilul rezolvat in variabile CSS `--st-*`.
 *
 * Toate variantele de sectiuni consuma EXCLUSIV aceste variabile. Fara stratul
 * asta, fiecare din cele ~160 de variante planificate ar trebui sa isi expuna
 * propriile campuri de culoare si rotunjire, iar un magazin ar arata ca un
 * colaj. Cu el, comerciantul schimba o data paleta si se propaga peste tot.
 *
 * Valorile implicite trimit inapoi catre token-ii globali din globals.css
 * (`var(--color-surface)` etc.), deci un magazin care n-a atins stilul ramane
 * identic cu ce era inainte de sistemul de design.
 */

/** Cele doua culori de text pe care le poate primi un fundal colorat. */
const TEXT_INCHIS = "#111827";
const TEXT_DESCHIS = "#FFFFFF";

/** Luminanta relativa WCAG a unei culori hex de 6 cifre, fara diez. */
function luminanta(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

const LUM_INCHIS = luminanta("111827");
const LUM_DESCHIS = 1;

/** Raportul de contrast WCAG dintre doua luminante relative. */
function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Minimul WCAG AA pentru text normal. */
const PRAG_AA = 4.5;
/**
 * Negrul de rezerva.
 *
 * Cand nici textul inchis, nici cel deschis nu trec pragul pe fundalul ales —
 * culorile de mijloc, ca un galben-mustar sau un turcoaz mediu — se coboara la
 * negru curat, care are contrastul maxim posibil pe orice fundal deschis.
 */
const TEXT_NEGRU = "#000000";
const TEXT_ALB = "#FFFFFF";

/**
 * Textul care se citeste pe un fundal colorat. Doar pentru culori hex.
 *
 * Se compara rapoartele de contrast, nu luminanta cu un prag fix: cu pragul de
 * 0.5 verdele implicit al platformei (#07c527) primea alb — 2,33:1, sub minimul
 * AA de 4,5:1 — desi pe inchis da 7,62:1.
 *
 * Dar „cel mai bun din doua" nu inseamna „destul de bun": exista culori pe care
 * ambele variante cad sub prag, iar magazinul respectiv ramanea cu text pe care
 * nu-l poate citi nimeni. Cand se intampla, se trece pe negru sau alb curat,
 * care castiga cateva zecimi in plus. Pentru culorile care treceau deja — marea
 * lor majoritate — rezultatul e neschimbat.
 */
export function contrastOn(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return TEXT_DESCHIS;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const lum = luminanta(hex);

  const peInchis = contrast(lum, LUM_INCHIS);
  const peDeschis = contrast(lum, LUM_DESCHIS);
  if (Math.max(peInchis, peDeschis) >= PRAG_AA) {
    return peInchis >= peDeschis ? TEXT_INCHIS : TEXT_DESCHIS;
  }
  // Niciunul nu trece: mergem pe extremele absolute. Alegerea asta nu poate da
  // gres — cea mai proasta luminanta posibila (0,179) lasa si negrul si albul
  // la 4,58:1, adica tot peste prag. Deci orice culoare isi primeste un text
  // lizibil, oricat de nefericit ar fi aleasa.
  return contrast(lum, luminanta("000000")) >= contrast(lum, 1) ? TEXT_NEGRU : TEXT_ALB;
}

/**
 * Textul care se citeste DIRECT pe fundalul magazinului (titlul unei pagini, file).
 *
 * ⚠ Exista pentru un caz masurat: un magazin de pe productie are fundalul #5b2067,
 * iar textul implicit (#111827) scris direct pe el iese la 1,56:1. Cardurile stau
 * pe `--st-surface` si nu au problema; titlurile scrise pe fundal, da.
 *
 * ⚠ Numai pentru fundaluri HEX: `contrastOn` intoarce alb pentru orice altceva, iar
 * fundalul implicit e `var(--color-background)` (deschis). Cand textul temei trece
 * deja pragul, ramane EL (`var(--st-text)`), deci la un magazin obisnuit nu se
 * schimba nimic. Il citeste deocamdata numai zona de cont.
 */
function textPeFundal(fundal: string, text: string): string {
  const hex = (v: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
    return m ? (m[1].length === 3 ? m[1].replace(/./g, (ch) => ch + ch) : m[1]) : null;
  };
  const f = hex(fundal);
  if (!f) return "var(--st-text)";
  const t = hex(text);
  /* Textul implicit al temei e un `var(...)` care inseamna #111827. */
  const lumText = t ? luminanta(t) : LUM_INCHIS;
  if (contrast(luminanta(f), lumText) >= PRAG_AA) return "var(--st-text)";
  return contrastOn(`#${f}`);
}

const CARD_SHADOW = {
  plain: { rest: "none", hover: "none" },
  // Cardul de azi: fara umbra in repaus, `hover:shadow-xl` la trecerea mouse-ului.
  bordered: {
    rest: "none",
    hover: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },
  elevated: {
    rest: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
    hover: "0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },
} as const;

const CARD_RATIO = { square: "1 / 1", portrait: "3 / 4", landscape: "4 / 3" } as const;

/**
 * Scara tipografica, in rem, aliniata cu treptele Tailwind.
 *
 * `--st-font-scale` nu poate fi aplicata direct pe subarbore: Tailwind masoara
 * in `rem`, care se raporteaza la `<html>`, nu la containerul nostru. Deci
 * emitem treptele deja inmultite, iar variantele le folosesc in loc de clase
 * fixe de marime. Componentele „classic" raman pe clasele Tailwind si nu sunt
 * afectate de reglaj — exact ce vrem cat timp nu si-au primit inca variantele.
 */
const TEXT_REM = {
  xs: 0.75,
  sm: 0.875,
  base: 1,
  lg: 1.125,
  xl: 1.25,
  "2xl": 1.5,
  "3xl": 1.875,
  "4xl": 2.25,
  "5xl": 3,
} as const;

export function styleToCssVars(style: ResolvedStyle): Record<string, string> {
  const c = style.colors;
  const base = RADIUS_PX[style.radius];
  const shadow = CARD_SHADOW[style.cardStyle];
  const containerRem = CONTAINER_REM[style.container];

  const btnRadius =
    style.buttonRadius === "full" ? "9999px" : style.buttonRadius === "none" ? "0px" : "var(--st-radius)";

  const scale = FONT_SCALE[style.fontScale];
  const text: Record<string, string> = {};
  for (const [step, rem] of Object.entries(TEXT_REM)) {
    text[`--st-text-${step}`] = `${(rem * scale).toFixed(4).replace(/\.?0+$/, "")}rem`;
  }

  return {
    ...text,
    "--st-primary": c.primary,
    "--st-primary-contrast": contrastOn(c.primary),
    // Fundalul difuz folosit azi ca `${color}15` pe pastile si iconite.
    "--st-primary-soft": `color-mix(in srgb, ${c.primary} 12%, transparent)`,
    "--st-accent": c.accent,
    "--st-accent-contrast": contrastOn(c.accent),
    "--st-bg": c.background,
    "--st-on-bg": textPeFundal(c.background, c.text),
    "--st-surface": c.surface,
    "--st-text": c.text,
    "--st-muted": c.muted,
    "--st-border": c.border,
    "--st-footer-bg": c.footerBg,
    "--st-footer-text": c.footerText,

    "--st-radius-sm": `${Math.max(base - 4, 0)}px`,
    "--st-radius": `${base}px`,
    "--st-radius-lg": `${base >= 9999 ? base : base + 4}px`,
    "--st-radius-btn": btnRadius,

    "--st-container": containerRem === 0 ? "100%" : `${containerRem}rem`,
    "--st-space": `${DENSITY_REM[style.density]}rem`,
    "--st-font-scale": String(FONT_SCALE[style.fontScale]),

    "--st-card-shadow": shadow.rest,
    "--st-card-shadow-hover": shadow.hover,
    "--st-card-border": style.cardStyle === "bordered" ? "1px solid var(--st-border)" : "1px solid transparent",
    "--st-card-ratio": CARD_RATIO[style.cardRatio],
    ...tokeniPeCulorileMagazinului(c.surface),
  };
}

/**
 * Amestecul a doua culori hex de 6 cifre, ca `color-mix(in srgb, a p, b)`; `b` cand vreuna nu e hex. Pentru socoteala
 * contrastului pe fondurile scrise cu `color-mix` (bara de sus a antetului si subsolul „hipermarket”).
 */
export function amestecHex(a: string, b: string, p: number): string {
  const ok = /^#[0-9a-f]{6}$/i;
  if (!ok.test(a) || !ok.test(b)) return b;
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(c(a, i) * p + c(b, i) * (1 - p)).toString(16).padStart(2, "0")).join("");
}

/** Raportul de contrast WCAG dintre doua culori hex; `null` daca vreuna nu e hex. */
export function raportContrast(a: string | undefined | null, b: string | undefined | null): number | null {
  const hex = (v: string | undefined | null) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v ?? "").trim());
    return m ? (m[1].length === 3 ? m[1].replace(/./g, (ch) => ch + ch) : m[1]) : null;
  };
  const x = hex(a), y = hex(b);
  return x && y ? contrast(luminanta(x), luminanta(y)) : null;
}

/**
 * Daca o culoare hex e deschisa (luminanta peste jumatate). `null` pentru orice nu e hex (`var(...)`): nu se stie.
 * O citeste subsolul „dark”, ca sa nu scrie alb pe un fundal de subsol ales deschis (tema Uranus).
 */
export function esteDeschisa(culoare: string | undefined | null): boolean | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((culoare ?? "").trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (ch) => ch + ch) : m[1];
  return luminanta(hex) > 0.5;
}

/**
 * Pe un magazin cu SUPRAFATA din design (o tema, etapa 24 din `docs/editor-magazin/PLAN.md`), tokenii aplicatiei pe
 * care ii folosesc paginile comune (pagina de produs, cosul, rândul clasic: `text-foreground`, `bg-muted`,
 * `border-border`, `bg-surface`) trec pe culorile magazinului. Altfel titlul si pretul produsului ramaneau inchise pe
 * fond inchis (Marte), iar textul secundar sub prag pe fondurile gri-deschis (Alnilam). `@theme inline` pune
 * `var(--foreground)` direct in utilitare, deci suprascrierea pe radacina vitrinei ajunge peste tot in ea. Inversarea
 * „negrului” si placile cu poze decupate se schimba DOAR pe suprafata inchisa.
 *
 * ⚠ Dupa SUPRAFATA din stilul designului, nu dupa fondul paginii: suprafata o pune doar o tema (implicit e alba), iar
 * productia n-are niciun magazin cu culori in design (verificat 08.11.2026), deci niciun magazin de azi nu se schimba.
 * Un magazin cu fond inchis ales din „Stil” (unul singur azi) ramane cum e.
 */
export function tokeniPeCulorileMagazinului(suprafata: string): Record<string, string> {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(suprafata.trim());
  if (!m) return {};
  const hex = m[1].length === 3 ? m[1].replace(/./g, (ch) => ch + ch) : m[1];
  const inchisa = luminanta(hex) < 0.18;
  const nuanta = "color-mix(in srgb, var(--st-text) 8%, var(--st-surface))";
  return {
    ...tokeniAplicatiei(nuanta),
    ...(inchisa ? {
      // A doua actiune, „negrul” variantelor (ex. „Comanda acum” din pagina Detaliat): pe suprafata inchisa se
      // inverseaza, altfel butonul negru disparea in fond (gasit la proba pe temele Marte si Saturn).
      "--st-actiune-inchisa": "var(--st-text)",
      "--st-actiune-inchisa-text": "var(--st-surface)",
      // Fondul placilor cu poze decupate (`FOND_PLACA`): pe suprafata inchisa, o nuanta a ei, nu griul deschis al
      // temelor albe (tema Aldebaran, lotul 4: placile de categorii ieseau ca niste ferestre albe pe fond negru).
      "--st-fond-placa": "color-mix(in srgb, var(--st-text) 10%, var(--st-surface))",
      // Si fara `multiply` pe pozele lor: pe fond inchis le stingea (ramaneau spalacite, gasit la proba).
      "--st-amestec-placa": "normal",
    } : {}),
  };
}

/**
 * Tokenii aplicatiei, pe culorile magazinului. Pe orice suprafata HEX, nu doar pe cele inchise: pe fondul gri-deschis
 * al temelor (Alnilam #F4F5F7) textul secundar al aplicatiei iesea la 4,43:1, sub prag, desi tema are un gri al ei care
 * trece (gasit la proba temelor 2-30). Suprafata hex o pune doar o tema sau culorile alese de om in „Stil”; productia
 * n-are magazine cu culori in design (verificat 08.11.2026), deci magazinele de azi nu se schimba.
 */
function tokeniAplicatiei(nuanta: string): Record<string, string> {
  return {
    // Textul mostenit: `body` isi ia culoarea de pe radacina documentului, deja rezolvata acolo, deci fara asta tot ce
    // nu-si pune singur o culoare (randul „Total” din formularul de comanda, gasit la proba) ramanea aproape negru.
    color: "var(--st-text)",
    "--background": "var(--st-bg)",
    "--foreground": "var(--st-text)",
    "--card": "var(--st-surface)",
    "--card-foreground": "var(--st-text)",
    "--popover": "var(--st-surface)",
    "--popover-foreground": "var(--st-text)",
    "--muted": nuanta,
    "--muted-foreground": "var(--st-muted)",
    "--border": "var(--st-border)",
    "--input": "var(--st-border)",
    "--color-surface": "var(--st-surface)",
    "--color-surface-raised": nuanta,
    // Aceiasi tokeni, cititi DIRECT ca `var(--color-*)` (in `style`, nu prin utilitare): `@theme inline` ii declara pe
    // radacina documentului, deja rezolvati acolo, deci fara rescriere aici ramaneau pe culorile temei albe (fila
    // „Descriere”, cifra cantitatii si butoanele +/- din formularul de comanda ieseau negre pe negru).
    "--color-foreground": "var(--st-text)",
    "--color-muted-foreground": "var(--st-muted)",
    "--color-background": "var(--st-bg)",
    "--color-card": "var(--st-surface)",
    "--color-muted": nuanta,
    "--color-input": "var(--st-border)",
    "--color-border": "var(--st-border)",
    "--color-border-strong": "color-mix(in srgb, var(--st-text) 22%, var(--st-surface))",
    "--color-text-primary": "var(--st-text)",
    "--color-text-secondary": "var(--st-muted)",
    "--color-text-tertiary": "var(--st-muted)",
  };
}
