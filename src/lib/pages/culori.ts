/*
  Culorile din blocuri. Doua lucruri, fiecare cu un defect in spate:

  1. `cuTransparenta`: butonul facea `${color}44` pentru umbra si `${color}1f`
     pentru varianta „Subtil". Merge doar pe hex cu 6 cifre; `#fff` devenea
     `#fff44`, o culoare invalida, deci umbra si fundalul dispareau tacut.
     Acum hex-ul scurt se lungeste, iar orice alta forma trece prin `color-mix`.

  2. `culoareSigura`: culorile ajung in `style` pe pagina publica. React pune
     valoarea asa cum e, iar un `red;background:url(//altundeva)` ar fi adaugat
     inca o proprietate. Trec numai formele de culoare cunoscute.
*/

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIE = /^(rgb|rgba|hsl|hsla)\(\s*[\d.\s,%/+-]+\)$/i;
const NUME = /^[a-z]{3,20}$/i;

export function culoareSigura(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim();
  if (!c || c.length > 40) return null;
  return HEX.test(c) || FUNCTIE.test(c) || NUME.test(c) ? c : null;
}

/** Culoarea data, cu opacitatea `alfa` (0-1). */
export function cuTransparenta(culoare: string, alfa: number): string {
  const a = Math.min(1, Math.max(0, alfa));
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(culoare.trim());
  if (m) {
    const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
    return `#${h}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  }
  return `color-mix(in srgb, ${culoare} ${Math.round(a * 100)}%, transparent)`;
}

/** Cheile de culoare din blocuri si din `style`, curatate de `prepareBlocksForPublic`. */
export const CHEI_CULOARE = new Set([
  "bg", "textColor", "boxBg", "borderColor", "color", "buttonColor", "buttonTextColor", "bgColor",
  "accent", "questionColor", "answerColor", "cardBg", "cellBg",
  "iconColor", "iconBg", "titleColor", "descColor", "badgeColor",
]);

/**
 * Curata toate culorile unui obiect (bloc sau `style`), plus degradeurile.
 * O culoare necunoscuta devine `null`, adica „fara culoare", nu o eroare.
 */
export function curataCulorile<T extends Record<string, unknown>>(o: T): T {
  const r: Record<string, unknown> = { ...o };
  for (const k of Object.keys(r)) {
    if (CHEI_CULOARE.has(k) && r[k] != null) r[k] = culoareSigura(r[k]);
  }
  for (const k of ["gradient", "bgGradient"]) {
    const g = r[k] as { from?: unknown; to?: unknown; angle?: unknown } | null | undefined;
    if (g && typeof g === "object") {
      const from = culoareSigura(g.from);
      const to = culoareSigura(g.to);
      r[k] = from && to ? { from, to, ...(typeof g.angle === "number" ? { angle: g.angle } : {}) } : null;
    }
  }
  return r as T;
}
