"use client";

import { ArrowUp, Mail, Phone } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { menuItemHref } from "@/lib/pages/menu";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { FooterCredit, FooterLegal } from "@/components/storefront/sections/_shared/FooterLegal";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";

/**
 * Footer centrat, varianta „centered".
 *
 * Opusul celui pe coloane: nu organizeaza, ci incheie. Logo mare la mijloc, o
 * singura linie de legaturi, contactul si retelele — atat. Potrivit magazinelor
 * cu putine pagini, unde patru coloane ar fi patru liste de cate doua randuri.
 *
 * Blocul legal ramane la fel de complet, doar ca sub o linie de separare, ca sa
 * nu incarce partea de sus.
 *
 * `FooterLegal` si `FooterCredit` sunt compuse obligatoriu — vezi comentariul de
 * acolo pentru ce contin si de ce nu pot lipsi din nicio varianta.
 */
export function FooterCentered() {
  const { business, basePath, categoriiRoot, menu, pageContent, social, hasStickyBottomBar } = useStoreChrome();

  const nume = business.store_name ?? business.business_name;
  const logoSize = (pageContent.footer_logo_size ?? 36) * 1.4;
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-8" : "pb-8";
  const pagini = menu.filter((m) => m.type === "page" || m.type === "link");

  const contact = "inline-flex items-center gap-2 text-sm text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors";

  return (
    <footer className="bg-[var(--st-surface)] text-[var(--st-text)] border-t border-[var(--st-border)]">
      <div className={`max-w-6xl mx-auto px-5 pt-12 sm:pt-14 ${spatiuJos}`}>
        <div className="flex flex-col items-center text-center gap-5">
          <a href={`${basePath}/`} className="hover:opacity-80 transition-opacity" aria-label={nume}>
            {business.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 480)} alt={nume}
                style={{ height: logoSize, maxWidth: logoSize * 5 }}
                className="w-auto object-contain" />
            ) : (
              <span className="text-2xl font-black tracking-tight">{nume}</span>
            )}
          </a>

          {business.tagline && (
            <p className="text-sm leading-relaxed text-[var(--st-muted)] max-w-md">{business.tagline}</p>
          )}

          {pagini.length > 0 && (
            <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
              {pagini.map((it) => (
                <a key={it.id} href={menuItemHref(it, basePath, categoriiRoot)}
                  className="text-sm font-medium hover:opacity-60 transition-opacity">
                  {it.label}
                </a>
              ))}
            </nav>
          )}

          {(business.phone || business.email || business.whatsapp) && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {business.phone && (
                <a href={`tel:${business.phone}`} className={contact}>
                  <Phone className="h-4 w-4" strokeWidth={1.6} />
                  {business.phone}
                </a>
              )}
              {business.whatsapp && (
                <a href={whatsappLink(business.whatsapp)} target="_blank" rel="noopener noreferrer" className={contact}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  WhatsApp
                </a>
              )}
              {business.email && (
                <a href={`mailto:${business.email}`} className={contact}>
                  <Mail className="h-4 w-4" strokeWidth={1.6} />
                  {business.email}
                </a>
              )}
            </div>
          )}

          {areSocialLinks(social) && (
            <div className="flex items-center justify-center gap-2">
              <SocialLinks social={social}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-75"
                iconClass="h-[18px] w-[18px]" />
            </div>
          )}

          {/* Subsolul unei pagini lungi e cel mai departe de meniu; scurtatura
              inapoi sus costa un rand si scuteste o derulare intreaga.
              Buton, nu ancora: nu e o destinatie, iar un `href="#"` ar lasa un
              al doilea URL pentru aceeasi pagina si ar sari brusc sus. */}
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
            <ArrowUp className="h-3.5 w-3.5" />
            Inapoi sus
          </button>
        </div>

        <div className="mt-10 border-t border-[var(--st-border)]">
          {/* Paginile apar deja in navigatia de mai sus. */}
          <FooterLegal ton="deschis" cuPagini={false} />
          <div className="border-t border-[var(--st-border)]">
            <FooterCredit ton="deschis" />
          </div>
        </div>
      </div>
    </footer>
  );
}
