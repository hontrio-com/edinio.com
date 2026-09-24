"use client";

import Link, { useLinkStatus } from "next/link";

/**
 * Legatura din zona de cont care raspunde PE LOC la apasare.
 *
 * ⚠ Paginile de cont sunt ale unui singur om, deci Next le trimite cu `no-store`:
 * routerul nu le poate prelua dinainte si nici tine minte, iar intre clic si pagina
 * noua ecranul statea nemiscat cateva sute de milisecunde. Aceeasi problema a fost
 * masurata in panou (vezi `LegaturaDePanou`): acolo bara de mai jos s-a aprins la
 * 67-79 ms, fata de nimic pana la 300-500 ms. Preluarea la trecerea cu mausul NU
 * ajuta (pe `no-store` nu se cere nimic) si de aceea nu e aici.
 *
 * ⚠ Legatura trebuie sa fie `relative` (bara se asaza fata de ea), iar bara e COPIL
 * al lui `<Link>`: `useLinkStatus` citeste contextul deschis de legatura.
 */
export function LegaturaCont({
  href,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  return (
    <Link href={href} className={className} {...props}>
      <BaraInCurs />
      {children}
    </Link>
  );
}

function BaraInCurs() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? "" : undefined}
      className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left rounded-full transition-transform duration-[400ms] ease-out ${
        pending ? "scale-x-100" : "scale-x-0"
      }`}
      /* Culoarea TEXTULUI, nu primara: pe o tema cu primara deschisa, o bara de 2px in primara nu se vedea. */
      style={{ backgroundColor: "var(--st-text)" }}
    />
  );
}
