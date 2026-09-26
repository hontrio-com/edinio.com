import type { CSSProperties, ReactNode } from "react";
import type { BlockStyle } from "@/lib/pages/blocks.types";
import { atributeAnimatie } from "@/lib/pages/animatii";

const PAD: Record<string, string> = {
  none: "py-0",
  sm: "py-4",
  md: "py-8",
  lg: "py-14",
  xl: "py-20",
};
const WIDTH: Record<NonNullable<BlockStyle["width"]>, string> = {
  narrow: "max-w-3xl",
  container: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
  custom: "",
};
const ALIGN: Record<NonNullable<BlockStyle["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
export const RAZA: Record<string, string> = {
  none: "rounded-none", sm: "rounded-md", md: "rounded-xl", lg: "rounded-2xl", xl: "rounded-[2rem]",
};
export const UMBRA: Record<string, string> = {
  none: "", sm: "shadow-sm", md: "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]", lg: "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.28)]",
};
/*
  ⚠ Clase proprii, nu `hidden pg-md:block`. Clasele Tailwind raspund la latimea
  FERESTREI, iar editorul arata telefonul intr-un cadru de 400 px pe un ecran
  lat: un bloc „doar pe telefon” disparea cu totul din editor (nu se mai putea
  nici selecta), iar unul „doar pe desktop” se vedea si in cadrul de telefon.
  Regulile stau in `stil-comun.css`: pe magazin raspund la ecran, in editor
  (`[data-editor-device]`) la dispozitivul ales, si blocul ramane selectabil.
*/
export const ASCUNS: Record<string, string> = { mobile: "pg-ascuns-mobil", desktop: "pg-ascuns-desktop" };

/**
 * Fundalul unei sectiuni: imagine (cu strat intunecat), degrade sau culoare,
 * in aceasta ordine. Adresa imaginii a trecut deja prin `prepareBlocksForPublic`
 * (numai https); ghilimelele si parantezele se scot oricum, ca `url()` sa nu se
 * poata inchide din valoare.
 */
function fundal(style?: BlockStyle): CSSProperties {
  const s: CSSProperties = {};
  if (style?.bgImage) {
    const u = style.bgImage.replace(/["'()\\\s]/g, "");
    const strat = Math.min(80, Math.max(0, style.bgOverlay ?? 0)) / 100;
    s.backgroundImage = `linear-gradient(rgba(0,0,0,${strat}), rgba(0,0,0,${strat})), url("${u}")`;
    s.backgroundSize = "cover";
    s.backgroundPosition = "center";
    if (style.bgFixed) s.backgroundAttachment = "fixed";
  } else if (style?.bgGradient?.from && style.bgGradient.to) {
    s.backgroundImage = `linear-gradient(${Math.round(style.bgGradient.angle ?? 135)}deg, ${style.bgGradient.from}, ${style.bgGradient.to})`;
  }
  if (style?.bg) s.backgroundColor = style.bg;
  return s;
}

/**
 * Shared wrapper for content blocks. Applies padding (preset or custom px),
 * optional background (color, gradient or image), max width, text alignment,
 * text color, an optional card box, device visibility and the entrance
 * animation from the block's `style`. Hero / spacer manage their own spacing.
 *
 * ⚠ Toate campurile din 25.09.2026 sunt optionale: un bloc salvat inainte are
 * exact aceleasi clase ca pana atunci.
 */
export function BlockShell({
  style,
  children,
  innerClassName,
}: {
  style?: BlockStyle;
  children: ReactNode;
  innerClassName?: string;
}) {
  const isCustomPad = style?.padding === "custom";
  const pad = isCustomPad ? "" : (PAD[style?.padding ?? "md"] ?? PAD.md);
  const width = WIDTH[style?.width ?? "container"] ?? WIDTH.container;
  const align = ALIGN[style?.align ?? "left"];

  const sectionStyle: CSSProperties = fundal(style);
  if (isCustomPad) {
    const p = Math.max(0, style?.paddingCustom ?? 32);
    sectionStyle.paddingTop = p;
    sectionStyle.paddingBottom = p;
  }

  const innerStyle: CSSProperties = {};
  if (style?.textColor) innerStyle.color = style.textColor;
  if (style?.width === "custom") innerStyle.maxWidth = Math.min(1600, Math.max(320, style.widthCustom ?? 960));

  const cutie = style?.boxed
    ? [
      "p-6 pg-sm:p-10",
      RAZA[style.radius ?? "lg"],
      UMBRA[style.shadow ?? "none"],
      // Fara contur, fara umbra si fara culoare aleasa, cutia alba se pierdea pe pagina alba.
      style.borderColor ? "border" : !style.boxBg && (style.shadow ?? "none") === "none" ? "border border-border" : "",
    ].join(" ")
    : "";
  const cutieStyle: CSSProperties = style?.boxed
    ? { backgroundColor: style.boxBg ?? "var(--color-surface)", ...(style.borderColor ? { borderColor: style.borderColor } : {}) }
    : {};

  const anim = atributeAnimatie(style);

  return (
    <section
      className={`${pad} ${style?.hideOn ? ASCUNS[style.hideOn] ?? "" : ""}`}
      style={Object.keys(sectionStyle).length ? sectionStyle : undefined}
      {...anim.attrs}
      /* `data-anim-in` il pune scriptul animatiilor inainte de hidratare, dinadins. */
      suppressHydrationWarning={anim.attrs["data-anim"] ? true : undefined}
    >
      <div
        className={`mx-auto w-full px-4 ${width} ${align} ${innerClassName ?? ""}`}
        style={Object.keys(innerStyle).length ? innerStyle : undefined}
      >
        {style?.boxed ? <div className={cutie} style={cutieStyle}>{children}</div> : children}
      </div>
    </section>
  );
}
