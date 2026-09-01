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
  prioritara,
}: {
  k: LogoKey;
  area: number;
  maxWidth?: number;
  className?: string;
  /**
   * Sigla se vede din prima clipă, deci se cere imediat, nu leneș.
   *
   * Implicit e `lazy`, fiindcă siglele apar mai jos pe pagină. În hero-ul paginii
   * „Integrări" însă opt dintre ele sunt chiar primul ecran, iar `lazy` acolo le
   * arată cu o clipă mai târziu decât titlul, ca niște casete goale care se
   * umplu pe rând.
   */
  prioritara?: boolean;
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
      /*
        ⚠ `width` ȘI `height` CA ATRIBUTE, pe lângă `style`. Măsurat pe HTML-ul
        de producție: pagina de start are 163 de `<img>`, iar 110 din ele — TOATE
        randate de aici — n-aveau nici atribute, nici dimensiuni în CSS.
        `unsized-images` din Lighthouse: 0,5 → 1.

        ⚠ NU E O REPARAȚIE DE CLS, și nici nu strică CLS-ul. `style` rezervă deja
        caseta din HTML. Am crezut o clipă că am introdus o regresie (0,014 →
        0,017), dar am măsurat și varianta fără schimbare: tot 0,014–0,017. E
        zgomotul rulării, nu un efect.

        Ce lipsea era RAPORTUL intrinsec, pe care browserul îl folosește înainte
        să aibă fișierul.

        ⚠ VALORILE VIN DIN ACEEAȘI SOCOTEALĂ CA STILUL (`logoSize` plus
        `logo.ratio`), deci nu pot devia una de alta. `ratio` e o aproximare
        scrisă de mână în `logos.ts` — dacă vreodată se rotunjește prost pentru o
        siglă anume, se vede ca o mișcare mică la încărcare, și atunci se
        corectează `ratio`, nu rândurile astea.
      */
      width={Math.round(size.height * logo.ratio)}
      height={Math.round(size.height)}
      loading={prioritara ? "eager" : "lazy"}
      decoding="async"
      className={cn("w-auto shrink-0 object-contain", className)}
    />
  );
}
