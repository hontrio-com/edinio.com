import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import { BUTOANE_IPHONE } from "@/lib/website/iphone";

/**
 * Rama de iPhone 17 Pro Max, cu ecranul liber pentru orice conținut.
 *
 * ⚠ CERUT „1 LA 1 CU REALITATEA", deci nimic nu e ales din ochi: toate mărimile
 * ies dintr-un singur număr — lățimea corpului — prin fracțiile aparatului.
 * Socoteala, cu cifrele de la care pleacă și cu ce e sigur și ce e de confirmat,
 * e în `globals.css`, la `.iphone`. Fracțiile sunt și în `lib/website/iphone.ts`,
 * unde o probă verifică faptul că se potrivesc între ele — de pildă că rama plus
 * ecranul plus rama fac exact corpul, și că razele colțurilor sunt concentrice.
 *
 * ═══ DE CE `--l` ȘI NU CLASE ═══
 *
 * Fiindcă mărimea vine din afară și trebuie să scaleze cu ilustrația cardului.
 * O singură variabilă intră, restul se calculează în CSS. Cu clase pe trepte,
 * proporțiile s-ar fi rupt exact la trecerea de prag, unde cardul își schimbă
 * lățimea — lecția de la cadranele de scoruri și de la casetele cu imagini.
 */
export function IPhoneMockup({
  latime,
  className,
  children,
}: {
  /** Lățimea CORPULUI, ca expresie CSS. Tot restul se derivă din ea. */
  latime: string;
  className?: string;
  /** Ce se vede pe ecran. */
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("iphone", className)}
      style={{ "--l": latime } as CSSProperties}
      aria-hidden="true"
    >
      {/*
        Butoanele. Ies în afara ramei cu jumătate din grosime, ca la aparat.
        Rolul lor e ca silueta să nu pară un dreptunghi rotunjit — de aceea sunt
        și foarte discrete.
      */}
      {BUTOANE_IPHONE.map((buton) => (
        <span
          key={`${buton.parte}-${buton.sus}`}
          className={cn(
            "iphone-buton",
            buton.parte === "stanga" ? "iphone-buton-stanga" : "iphone-buton-dreapta",
          )}
          style={{ top: `${buton.sus * 100}%`, height: `${buton.lungime * 100}%` }}
        />
      ))}

      <div className="iphone-ecran">
        <span className="iphone-insula" />
        {children}
      </div>
    </div>
  );
}
