"use client";

import { ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { useCart } from "@/components/storefront/cart/CartProvider";

/**
 * Mânerul de coș lipit de marginea din dreapta, pe ecrane mari.
 *
 * Pe telefon coșul are deja bara de jos, care nu se poate rata. Pe calculator
 * rămăsese doar iconița din bara de sus, iar aceea iese din ecran la prima
 * derulare: clientul care a adăugat ceva nu mai are pe unde să se întoarcă la
 * coș decât derulând înapoi până sus. De aici plecau coșuri pline.
 *
 * Stă pe mijlocul înălțimii, nu jos: jos sunt deja butoanele de telefon și
 * WhatsApp, iar trei lucruri plutitoare în același colț se acoperă unul pe
 * altul. Iese din margine ca o clapetă, cu colțurile rotunjite doar în stânga,
 * ca să se citească drept „mai e ceva dincolo de marginea asta", nu ca un buton
 * scăpat acolo.
 *
 * Apare doar când coșul are ceva în el. Un mâner gol n-ar avea ce să deschidă și
 * ar acoperi degeaba conținutul paginii.
 */
export function StickyCartTab({
  color,
  onOpen,
  hidden = false,
}: {
  /** Culoarea magazinului. */
  color: string;
  /** Deschide sertarul, sau duce la pagina de coș când magazinul are pagină. */
  onOpen: () => void;
  /** Ascuns cât sertarul sau formularul de comandă e deschis: ar sta peste ele. */
  hidden?: boolean;
}) {
  const { count, total } = useCart();

  if (hidden || count === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Deschide cosul: ${count} ${count === 1 ? "produs" : "produse"}, ${formatPrice(total)}`}
      /*
       * `hidden lg:flex`: sub `lg` exista bara de jos, iar amandoua deodata ar
       * fi doua indemnuri la acelasi lucru, unul peste altul.
       *
       * `z-30` il aseaza sub sertar (`z-50`) si sub stratul lui (`z-40`), deci
       * dispare firesc sub ele chiar daca `hidden` ar intarzia o clipa.
       */
      className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-2xl px-3 py-4 text-white shadow-lg transition-transform duration-200 hover:scale-[1.03] active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 lg:flex"
      style={{ backgroundColor: color, boxShadow: `0 10px 30px -10px ${color}` }}
    >
      <span className="relative">
        <ShoppingCart className="h-5 w-5" aria-hidden />
        {/*
          Numarul sta pe iconita, nu langa ea: asa manerul rimane ingust si nu
          musca din pagina. `tabular-nums` ca sa nu-si schimbe latimea de la 9 la
          10 produse.
        */}
        <span
          className="absolute -right-2.5 -top-2 min-w-[18px] rounded-full bg-white px-1 text-[11px] font-bold leading-[18px] tabular-nums"
          style={{ color }}
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      </span>
      <span className="text-[11px] font-semibold tabular-nums" aria-hidden>
        {formatPrice(total)}
      </span>
    </button>
  );
}
