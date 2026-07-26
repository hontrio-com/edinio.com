"use client";

import { Globe } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { FooterCredit, FooterLegal } from "@/components/storefront/sections/_shared/FooterLegal";

/**
 * Footerul „placa neagra", varianta classic: logo si retele sociale sus, blocul
 * legal la mijloc, drepturi de autor jos.
 *
 * `FooterLegal` si `FooterCredit` sunt compuse obligatoriu — vezi comentariul de
 * acolo pentru ce contin si de ce nu pot lipsi din nicio varianta.
 */
export function FooterDark() {
  const { business, color, social, pageContent } = useStorefront();

  const nume = business.store_name ?? business.business_name;
  const logoSize = pageContent.footer_logo_size ?? 36;
  const areSocial = !!(social.instagram || social.facebook || social.tiktok || social.website);
  const socialCls =
    "w-8 h-8 rounded-lg bg-surface/[0.06] hover:bg-surface/[0.12] flex items-center justify-center transition-colors";

  return (
    <footer className="bg-[#0A0A0A] text-white">
      <div className="max-w-6xl mx-auto px-5 pt-10 pb-6 sm:pt-12">
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
          </div>
          {areSocial && (
            <div className="flex items-center gap-1.5 shrink-0">
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={socialCls}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                  </svg>
                </a>
              )}
              {social.facebook && (
                <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={socialCls}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
                  </svg>
                </a>
              )}
              {social.tiktok && (
                <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className={socialCls}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.82a8.16 8.16 0 004.77 1.52V6.9a4.85 4.85 0 01-1-.21z"/>
                  </svg>
                </a>
              )}
              {social.website && (
                <a href={social.website} target="_blank" rel="noopener noreferrer" aria-label="Website" className={socialCls}>
                  <Globe className="h-3.5 w-3.5" />
                </a>
              )}
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
