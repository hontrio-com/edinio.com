"use client";

import { useState } from "react";
import { ChevronDown, Mail, MapPin, Phone } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { menuItemHref } from "@/lib/pages/menu";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import { FooterCredit, FooterLegal, type TonFooter } from "@/components/storefront/sections/_shared/FooterLegal";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";

/**
 * Footer deschis, pe coloane, varianta „columns".
 *
 * Structura pe care o are orice magazin mare: identitatea magazinului intr-o
 * parte, iar restul impartit pe intrebarile vizitatorului — ce vindeti, unde
 * citesc mai multe, cum va gasesc. Pe fundal deschis, ca sa nu inchida pagina la
 * capat.
 *
 * Pe telefon coloanele se pliaza. Patru liste una sub alta fac un subsol de doua
 * ecrane, prin care nimeni nu deruleaza; inchise, se vad toate patru deodata si
 * se deschide doar cea cautata.
 *
 * `FooterLegal` si `FooterCredit` sunt compuse obligatoriu — vezi comentariul de
 * acolo pentru ce contin si de ce nu pot lipsi din nicio varianta.
 */
export function FooterColumns({ ton = "deschis" }: { ton?: TonFooter }) {
  const { business, basePath, menu, pageContent, social, hasStickyBottomBar, searchCategories } = useStoreChrome();
  const catalog = useStorefrontOptional();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.footer_logo_size ?? 36;
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-8" : "pb-8";

  // Pe pagina de magazin categoriile vin din catalogul deja incarcat; pe
  // celelalte pagini, din lista adusa pentru sectiunile fixe. Fara a doua sursa,
  // coloana ar fi fost goala peste tot in afara paginii de magazin.
  const categorii = (
    catalog?.rootCategoryItems.map((c) => ({ key: c.key, name: c.name })) ??
    (searchCategories ?? []).map((name) => ({ key: name, name }))
  ).slice(0, 6);
  const inchis = ton === "inchis";
  // Pe fundal inchis culorile vin din perechea de footer a magazinului, ca sa
  // ramana reglabila dintr-un singur loc.
  const fundal = inchis
    ? "bg-[var(--st-footer-bg)] text-[var(--st-footer-text)]"
    : "bg-[var(--st-bg)] text-[var(--st-text)] border-t border-[var(--st-border)]";
  const separator = inchis ? "border-[var(--st-footer-text)]/10" : "border-[var(--st-border)]";
  const marunt = inchis ? "text-[var(--st-footer-text)]/50" : "text-[var(--st-muted)]";
  const legatura = inchis
    ? "flex items-start gap-2 text-[13px] text-[var(--st-footer-text)]/50 hover:text-[var(--st-footer-text)] transition-colors"
    : "flex items-start gap-2 text-[13px] text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors";
  const cerc = inchis
    ? "w-9 h-9 rounded-full border border-[var(--st-footer-text)]/15 flex items-center justify-center hover:bg-[var(--st-footer-text)]/10 transition-colors"
    : "w-9 h-9 rounded-full border border-[var(--st-border)] flex items-center justify-center text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors";
  const pagini = menu.filter((m) => m.type === "page" || m.type === "link");

  return (
    <footer className={fundal}>
      <div className={`max-w-6xl mx-auto px-5 pt-10 sm:pt-12 ${spatiuJos}`}>
        <div className="grid gap-8 sm:gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] pb-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              {business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 320)} alt={nume}
                  style={{ height: logoSize, maxWidth: logoSize * 5 }}
                  className="w-auto object-contain" />
              ) : (
                <span className="text-lg font-black tracking-tight truncate">{nume}</span>
              )}
            </div>
            {business.tagline && (
              <p className={`mt-3 text-[13px] leading-relaxed max-w-xs ${marunt}`}>{business.tagline}</p>
            )}
            {areSocialLinks(social) && (
              <div className="mt-4 flex items-center gap-2">
                <SocialLinks social={social} className={cerc} iconClass="h-4 w-4" />
              </div>
            )}
          </div>

          <Coloana titlu="Magazin" separator={separator} marunt={marunt}>
            <Legatura cls={legatura} href={`${basePath}/`}>Toate produsele</Legatura>
            {categorii.map((c) => (
              <Legatura key={c.key} cls={legatura} href={`${basePath}/?cat=${encodeURIComponent(c.name)}`}>{c.name}</Legatura>
            ))}
          </Coloana>

          <Coloana titlu="Informatii" separator={separator} marunt={marunt}>
            {pagini.map((it) => (
              <Legatura key={it.id} cls={legatura} href={menuItemHref(it, basePath)}>{it.label}</Legatura>
            ))}
            <Legatura cls={legatura} href={`${basePath}/retur`}>Retur produs</Legatura>
          </Coloana>

          <Coloana titlu="Contact" separator={separator} marunt={marunt}>
            {business.phone && (
              <Legatura cls={legatura} href={`tel:${business.phone}`} icon={<Phone className="h-4 w-4" strokeWidth={1.6} />}>
                {business.phone}
              </Legatura>
            )}
            {business.whatsapp && (
              <Legatura cls={legatura} href={whatsappLink(business.whatsapp)} extern
                icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>}>
                WhatsApp
              </Legatura>
            )}
            {business.email && (
              <Legatura cls={legatura} href={`mailto:${business.email}`} icon={<Mail className="h-4 w-4" strokeWidth={1.6} />}>
                {business.email}
              </Legatura>
            )}
            {(business.store_city || business.city) && (
              <span className={`flex items-start gap-2 text-[13px] ${marunt}`}>
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.6} />
                {business.store_city || business.city}
              </span>
            )}
          </Coloana>
        </div>

        <div className={`border-t ${separator}`}>
          {/* Paginile apar deja in coloana „Informatii". */}
          <FooterLegal ton={ton} cuPagini={false} />
          <div className={`border-t ${separator}`}>
            <FooterCredit ton={ton} />
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Coloana de linkuri: deschisa pe desktop, pliata pe telefon. */
function Coloana({ titlu, children, separator, marunt }: {
  titlu: string;
  children: React.ReactNode;
  separator: string;
  marunt: string;
}) {
  const [deschisa, setDeschisa] = useState(false);

  return (
    <div className={`min-w-0 border-t md:border-0 pt-3 md:pt-0 ${separator}`}>
      <button type="button" onClick={() => setDeschisa((v) => !v)} aria-expanded={deschisa}
        className="w-full flex items-center justify-between gap-2 md:pointer-events-none">
        <span className={`text-[11px] font-semibold uppercase tracking-widest ${marunt}`}>{titlu}</span>
        <ChevronDown className={`h-4 w-4 md:hidden transition-transform ${marunt} ${deschisa ? "rotate-180" : ""}`} />
      </button>
      <div className={`flex-col gap-2 pt-3 ${deschisa ? "flex" : "hidden"} md:flex`}>
        {children}
      </div>
    </div>
  );
}

function Legatura({
  cls,
  href,
  children,
  icon,
  extern = false,
}: {
  cls: string;
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  extern?: boolean;
}) {
  return (
    <a href={href} {...(extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cls}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}
