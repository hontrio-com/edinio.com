"use client";

import { cdnImage } from "@/lib/cdn-image";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { FooterCredit, FooterLegal } from "@/components/storefront/sections/_shared/FooterLegal";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";

/**
 * Footerul „placa neagra", varianta classic: logo si retele sociale sus, blocul
 * legal la mijloc, drepturi de autor jos.
 *
 * `FooterLegal` si `FooterCredit` sunt compuse obligatoriu — vezi comentariul de
 * acolo pentru ce contin si de ce nu pot lipsi din nicio varianta.
 */
export function FooterDark() {
  const { business, color, social, pageContent, hasStickyBottomBar } = useStoreChrome();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.footer_logo_size ?? 36;
  // Pagina de produs are o bara de cumparare lipita jos pe mobil, care ar taia
  // ultimele randuri din subsol.
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-6" : "pb-6";
  const areSocial = areSocialLinks(social);
  const socialCls =
    "w-8 h-8 rounded-lg bg-surface/[0.06] hover:bg-surface/[0.12] flex items-center justify-center transition-colors";

  return (
    <footer className="bg-[#0A0A0A] text-white">
      <div className={`max-w-6xl mx-auto px-5 pt-10 ${spatiuJos} sm:pt-12`}>
        <div className="flex items-center justify-between gap-4 pb-8">
          <div className="flex items-center gap-3 min-w-0">
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 320)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 4.2 }}
                className="w-auto object-contain shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                style={{ backgroundColor: color }}>
                {nume[0]?.toUpperCase()}
              </div>
            )}
            {/* Numele si localitatea erau doar in footerul paginii de produs.
                Acum apar peste tot: un logo singur, fara nume, nu spune cine e
                magazinul. */}
            <div className="min-w-0">
              <p className="font-semibold text-sm text-white truncate">{nume}</p>
              {business.store_city && <p className="text-[11px] text-white/40">{business.store_city}</p>}
            </div>
          </div>
          {areSocial && (
            <div className="flex items-center gap-1.5 shrink-0">
              <SocialLinks social={social} className={socialCls} />
            </div>
          )}
        </div>

        <div className="h-px bg-surface/[0.06]" />
        <FooterLegal />
        <div className="h-px bg-surface/[0.06]" />
        <FooterCredit />
      </div>
    </footer>
  );
}
