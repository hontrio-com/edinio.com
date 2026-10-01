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
  /*
    ⚠ Fonturile ALESE se pun si pe utilitarele Tailwind (01.10.2026).

    `--st-font-*` le citeau doar meniul si contul clientului: textul paginii lua
    fontul de pe `<html>` (calculat acolo, deci mostenit gata rezolvat), iar
    titlurile regula globala `font-heading`. Asa ca:
      - `fontFamily` aici, ca textul de dedesubt sa-l mosteneasca;
      - `--font-app` (textul) si `--font-app-heading` (titlurile), pe care le
        citesc `font-sans`, `font-heading` si regula titlurilor din `stil-comun.css`.

    Pe Geist nu se pune nimic: vitrinele care n-au ales niciun font raman
    exact cum erau, pana la ultimul atribut.
  */
  const fonturiAlese = style.fontHeading !== "geist" || style.fontBody !== "geist";
  const vars = {
    ...styleToCssVars(style),
    ...fonts.vars,
    ...(fonturiAlese
      ? { "--font-app": fonts.vars["--st-font-body"], "--font-app-heading": fonts.vars["--st-font-heading"], fontFamily: "var(--st-font-body)" }
      : {}),
    backgroundColor: "var(--st-bg)",
  };

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
