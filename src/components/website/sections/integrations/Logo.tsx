import { cn } from "@/lib/utils/cn";
import {
  PROVIDER_LOGOS,
  logoSize,
  type LogoKey,
  type ProviderLogo,
} from "@/lib/website/logos";

/**
 * O siglă de furnizor, desenată la mărimea la care pare egală cu vecinele ei.
 *
 * Toate variantele de secțiune folosesc componenta asta, ca să nu ajungă una
 * dintre ele să deseneze siglele altfel. Socoteala e în `lib/website/logos.ts`;
 * pe scurt, se egalizează SUPRAFAȚA, nu înălțimea — la înălțime egală, un cuvânt
 * lung pare de câteva ori mai mare decât o siglă pătrată.
 *
 * `area` spune cât de mare, în pixeli pătrați: `LOGO_AREA.inline` pentru un rând
 * lângă text, `.tile` pentru o casetă, `.hero` pentru piesa centrală.
 *
 * `maxWidth` e lățimea cutiei în care stă sigla, și e OBLIGATORIU acolo unde
 * cutia are o lățime fixă. About You are raportul 9,13: la suprafață egală iese
 * de 110px lățime, iar într-o casetă de 96px n-are unde încăpea. Cu `maxWidth`
 * plus `object-contain` se micșorează singură până intră.
 *
 * `<img>` simplu, nu `next/image`, și e o decizie: loaderul proiectului lasă
 * neatinse fișierele locale, deci `next/image` n-ar produce niciun `srcset`
 * pentru ele. Aici oricum n-ar avea ce optimiza — sunt SVG-uri și WebP-uri de
 * 1-9KB, deja la mărimea potrivită.
 */
export function Logo({
  k,
  area,
  maxWidth,
  className,
}: {
  k: LogoKey;
  area: number;
  maxWidth?: number;
  className?: string;
}) {
  /*
   * Adnotarea NU e de forma. `PROVIDER_LOGOS` e declarat
   * `as const satisfies Record<string, ProviderLogo>`, ca sa pastreze cheile
   * literale pentru `LogoKey`. Efectul secundar e ca `PROVIDER_LOGOS[k]` iese o
   * UNIUNE de 27 de tipuri literale, iar `invert` exista doar pe Netopia — deci
   * `logo.invert` nu compileaza pe uniune. Largirea la `ProviderLogo` o rezolva
   * fara sa strice inferenta cheilor.
   */
  const logo: ProviderLogo = PROVIDER_LOGOS[k];
  const size = logoSize(logo, area, maxWidth);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logo.src}
      alt={logo.name}
      style={{
        height: size.height,
        maxWidth: size.maxWidth,
        /* Netopia e desenata in alb, pentru fundal inchis. E monocroma, deci
           inversarea da aceeasi marca in negru. Vezi nota din `logos.ts`. */
        ...(logo.invert ? { filter: "invert(1)" } : null),
      }}
      loading="lazy"
      decoding="async"
      className={cn("w-auto shrink-0 object-contain", className)}
    />
  );
}
