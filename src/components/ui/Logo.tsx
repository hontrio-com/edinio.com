import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type LogoSize = "sm" | "md" | "lg";

const SIZES: Record<LogoSize, { icon: number; text: string }> = {
  sm: { icon: 24, text: "text-base" },
  md: { icon: 28, text: "text-lg" },
  lg: { icon: 32, text: "text-xl" },
};

interface LogoProps {
  size?: LogoSize;
  iconSize?: number;
  href?: string;
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

export function Logo({
  size = "md",
  iconSize,
  href = "/",
  className,
  showText = true,
  textClassName,
}: LogoProps) {
  const { icon, text } = SIZES[size];
  const finalIcon = iconSize ?? icon;

  const content = (
    <>
      <Image
        /*
          ⚠ FIȘIER PROPRIU, MIC — nu `/logo.png`. Măsurat pe 31.08.2026:
          originalul avea 96.469 octeți (284×289) și se afișa la 24–32 px, în
          bară ȘI în subsol, pe fiecare pagină publică. 94 kB pentru un pătrat
          de 32 px, adică 43% din tot JavaScriptul paginii de start.

          ⚠ DE CE NU S-A MICȘORAT ORIGINALUL: `/logo.png` mai e folosit în trei
          locuri unde 128 px ar strica ceva tăcut — sigla `Organization` din
          datele structurate (Google cere minimum 112 px) și antetul
          e-mailurilor, la 44 px, adică 88 la 2x. El a rămas 284×289; s-a
          recodat doar, 96.469 → 21.588 octeți, fără pierdere vizibilă.

          ⚠ 128, NU 64: `(auth)/layout.tsx` cere `iconSize={64}`, deci 64 ar fi
          fost neclar pe ecrane retina chiar acolo. La 128 acoperă orice folosire
          din depozit la 2x, și tot costă 6.792 octeți.

          ⚠ LOADERUL NU REDIMENSIONEAZĂ FIȘIERELE LOCALE. `supabase-image-loader`
          întoarce adresa neatinsă pentru orice nu e cheie R2, deci `width={32}`
          NU produce o variantă mică — de asta era nevoie de un fișier separat,
          nu doar de un atribut.
        */
        src="/logo-128.png"
        alt="Edinio"
        width={finalIcon}
        height={finalIcon}
        className="flex-shrink-0"
      />
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight",
            text,
            textClassName,
          )}
        >
          Edinio<span className="text-primary">.com</span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn("flex items-center gap-2", className)}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {content}
    </div>
  );
}
