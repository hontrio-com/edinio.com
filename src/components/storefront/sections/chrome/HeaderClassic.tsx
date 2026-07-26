"use client";

import { ShoppingCart } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { StoreNavHamburger, StoreNavLinks } from "@/components/ministore/StoreNav";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStorefront } from "@/components/storefront/StorefrontProvider";

/**
 * Header-ul magazinului, varianta classic: hamburger + logo la stanga, meniu la
 * mijloc, butoane de contact si cos la dreapta.
 *
 * Se lipeste sub bara de anunt cand aceasta exista (`top-9`), altfel sus de tot.
 * Logo-ul se afiseaza liber, la orice raport, cu inaltimea aleasa de comerciant
 * si fara chenar sau decupare.
 */
export function HeaderClassic() {
  const { business, basePath, color, menu, pageContent, features, hasAnnouncementBar, openCart } =
    useStorefront();
  const { count } = useCart();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.logo_size ?? 36;
  const showCall = features.floating_call === true && !!business.phone;
  const showWhatsApp = features.floating_whatsapp !== false && !!business.whatsapp;

  return (
    <header className={`sticky ${hasAnnouncementBar ? "top-9" : "top-0"} z-30 bg-background/95 backdrop-blur-md border-b border-border`}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
        <StoreNavHamburger items={menu} basePath={basePath} color={color} logoUrl={business.logo_url} storeName={nume} />
        <a href="#" className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity">
          {business.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={cdnImage(business.logo_url, 320)} alt={nume}
              style={{ height: logoSize, maxWidth: logoSize * 4.2 }}
              className="w-auto object-contain flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: color }}>
              {nume[0]?.toUpperCase()}
            </div>
          )}
        </a>

        <StoreNavLinks items={menu} basePath={basePath} color={color} className="flex-1 justify-center" />

        <div className="flex items-center gap-2 ml-auto">
          {showCall && (
            <a href={`tel:${business.phone}`}
              className="hidden sm:flex items-center justify-center hover:opacity-80 transition-opacity">
              <svg viewBox="0 0 64 64" className="h-9 w-9" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="32" fill={color}/>
                <svg x="16" y="16" width="32" height="32" viewBox="0 0 24 24">
                  <path fill="white" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </svg>
            </a>
          )}
          {showWhatsApp && (
            <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center justify-center hover:opacity-80 transition-opacity">
              <svg viewBox="0 0 64 64" className="h-9 w-9" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="32" fill="#25D366"/>
                <svg x="15" y="13" width="34" height="38" viewBox="0 0 448 512">
                  <path fill="white" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                </svg>
              </svg>
            </a>
          )}
          <button type="button" aria-label="Deschide cosul de cumparaturi" onClick={openCart}
            className="relative flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-surface hover:bg-muted transition-colors">
            <ShoppingCart className="h-4 w-4 text-foreground" />
            {count > 0 ? (
              <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
            ) : (
              <span className="hidden sm:inline text-sm text-muted-foreground">Cos</span>
            )}
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ backgroundColor: color }}>
                {count > 9 ? "9+" : count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
