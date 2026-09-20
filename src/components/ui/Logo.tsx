import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SIGLA EDINIO
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CUVANTUL E IN IMAGINE, NU IN COD. Pana la rebrandingul din 20.09.2026,
  „Edinio.com" era text scris aici, cu „.com" colorat verde, si numai semnul era
  imagine. Sigla noua vine cu literele desenate de el, cu chenarele si spatiile
  lui; scrise cu fontul paginii, ar fi fost alta sigla, care doar seamana.

  ⚠ DOUA FORME, NU DOUA MARCI:
    - sigla intreaga (semn + „edinio") pe ecrane, unde e loc;
    - semnul singur in pictograme, care sunt PATRATE si coboara la 16 px.
      Cuvantul la 16 px nu e text, e o dunga gri.

  ⚠ SVG, NU PNG: se deseneaza din nou la fiecare marime, deci nu mai e nevoie de
  un fisier separat pentru ecranele retina si nu mai exista intrebarea „la ce
  latime il taiem". Sigla intreaga are 4,4 kB, mai putin decat avea PNG-ul de
  128 px de dinainte. Incarcatorul nostru de imagini intoarce caile locale
  neatinse, deci fisierul pleaca asa cum e.

  ⚠ ALBUL NU E UN FILTRU, e alt fisier. „e"-ul ramane verde si pe fundal inchis;
  numai cuvantul trece pe alb. Un `filter: invert()` ar fi facut si semnul alb,
  adica ar fi stins marca exact acolo unde trebuie sa se vada.
*/

type LogoSize = "sm" | "md" | "lg";

/** Inaltimea siglei. Latimea vine din desen (raportul e 4:1). */
const INALTIMI: Record<LogoSize, number> = {
  sm: 24,
  md: 28,
  lg: 32,
};

const RAPORT = 3000 / 750.2;

interface LogoProps {
  size?: LogoSize;
  /**
   * Sigla e above-the-fold aici, deci se cere imediat.
   *
   * ⚠ IMPLICITUL LUI `next/image` E `loading="lazy"`, verificat in sursa
   * versiunii instalate (`get-img-props.js:278`): fara `priority`, `preload` sau
   * `loading`, iesirea e `lazy`. O imagine lenesa e sarita de scanerul de
   * preincarcare si se cere abia dupa ce CSS-ul blocant a ajuns, s-a parsat si
   * s-a facut asezarea — masurat pe productie, cam 100-150 ms mai tarziu.
   *
   * ⚠ NU `priority` SI NU `preload`: `priority` e DEPRECAT in Next 16 (vezi
   * `docs/.../image.md:293`) si nici nu mai pune `fetchPriority="high"` in
   * 16.3.3. Documentatia recomanda chiar `loading="eager"` in locul lor.
   */
  eager?: boolean;
  /**
   * Inaltimea siglei, in pixeli, cand cele trei marimi nu se potrivesc.
   *
   * ⚠ Se aplica si siglei intregi, si semnului: inainte se numea `iconSize` si
   * lucra DOAR cu `showText={false}`, deci o inaltime ceruta pe sigla intreaga
   * era inghitita in tacere.
   */
  inaltime?: number;
  href?: string;
  className?: string;
  /** `false` inseamna doar semnul, fara cuvant. */
  showText?: boolean;
  /**
   * Suprafata pe care sta sigla e inchisa INTOTDEAUNA, nu doar in tema
   * intunecata. Bara laterala de admin e asa: e neagra si pe tema deschisa.
   */
  peFundalInchis?: boolean;
}

export function Logo({
  size = "md",
  eager = false,
  inaltime: inaltimeCeruta,
  href = "/",
  className,
  showText = true,
  peFundalInchis = false,
}: LogoProps) {
  const inaltime = inaltimeCeruta ?? INALTIMI[size];
  const incarcare = eager ? "eager" : "lazy";

  const semn = (
    <Image
      src={peFundalInchis ? "/semn-alb.svg" : "/semn.svg"}
      alt="Edinio"
      width={inaltime}
      height={inaltime}
      className="flex-shrink-0"
      loading={incarcare}
      unoptimized
    />
  );

  /*
    ⚠ Amandoua siglele sunt in pagina, iar tema o alege pe a ei din CSS.
    Alegerea in JavaScript, dupa tema citita la randare, ar fi dat o nepotrivire
    intre ce trimite serverul si ce deseneaza browserul: sigla ar fi clipit din
    neagra in alba la fiecare incarcare.
  */
  const lockup = peFundalInchis ? (
    <Image
      src="/logo-alb.svg"
      alt="Edinio"
      width={Math.round(inaltime * RAPORT)}
      height={inaltime}
      className="flex-shrink-0"
      loading={incarcare}
      unoptimized
    />
  ) : (
    <>
      <Image
        src="/logo.svg"
        alt="Edinio"
        width={Math.round(inaltime * RAPORT)}
        height={inaltime}
        className="flex-shrink-0 dark:hidden"
        loading={incarcare}
        unoptimized
      />
      <Image
        src="/logo-alb.svg"
        alt=""
        aria-hidden
        width={Math.round(inaltime * RAPORT)}
        height={inaltime}
        className="hidden flex-shrink-0 dark:block"
        loading={incarcare}
        unoptimized
      />
    </>
  );

  const continut = showText ? lockup : semn;

  if (href) {
    return (
      <Link href={href} className={cn("flex items-center", className)}>
        {continut}
      </Link>
    );
  }

  return <div className={cn("flex items-center", className)}>{continut}</div>;
}
