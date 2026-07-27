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

/**
 * Textul cu contrastul mai bun pe un fundal colorat. Doar pentru culori hex.
 *
 * Se compara cele doua rapoarte, nu luminanta cu un prag fix: cu pragul de 0.5
 * verdele implicit al platformei (#1AB554) primea alb — 2,7:1, sub minimul AA de
 * 4,5:1 — desi pe inchis da 6,6:1.
 */
function contrastOn(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return TEXT_DESCHIS;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const lum = luminanta(hex);
  return contrast(lum, LUM_INCHIS) >= contrast(lum, LUM_DESCHIS) ? TEXT_INCHIS : TEXT_DESCHIS;
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
  };
}
