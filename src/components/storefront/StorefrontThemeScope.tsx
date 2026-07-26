import type { CSSProperties, ReactNode } from "react";
import { styleToCssVars } from "@/lib/storefront/design/css-vars";
import { fontSetup } from "@/lib/storefront/design/fonts";
import type { ResolvedStyle } from "@/lib/storefront/design/types";

/**
 * Radacina vizuala a oricarei pagini publice de magazin.
 *
 * Emite variabilele `--st-*` si clasele de font ale magazinului, ca tot ce e
 * dedesubt sa poata fi scris o singura data si sa se adapteze la stilul ales.
 * Inlocuieste exact wrapper-ul care exista azi in MiniStoreRenderer
 * (`min-h-screen` + `backgroundColor: store_bg_color || var(--color-background)`),
 * deci pentru un magazin fara stil salvat randarea e identica: `--st-bg` are
 * chiar acea valoare ca implicit.
 *
 * Variabilele CSS custom nu intra in tipul `CSSProperties`, de aici cast-ul —
 * acelasi pattern ca in restul aplicatiei.
 */
export function StorefrontThemeScope({
  style,
  className,
  children,
}: {
  style: ResolvedStyle;
  className?: string;
  children: ReactNode;
}) {
  const fonts = fontSetup(style.fontHeading, style.fontBody);
  const vars = { ...styleToCssVars(style), ...fonts.vars, backgroundColor: "var(--st-bg)" };

  return (
    <div
      data-store-theme=""
      className={[fonts.className, className].filter(Boolean).join(" ")}
      style={vars as CSSProperties}
    >
      {children}
    </div>
  );
}
