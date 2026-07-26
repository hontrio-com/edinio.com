import { Globe } from "lucide-react";
import type { StoreSocial } from "@/lib/storefront/store-content.types";

/**
 * Retelele sociale ale magazinului.
 *
 * Iconitele erau desenate inline in footer; cu mai multe variante de header si
 * de footer care le arata, aveau sa fie copiate de fiecare data. Ordinea si
 * marcajul sunt cele de dinainte, ca footerele existente sa ramana identice.
 */
export function areSocialLinks(social: StoreSocial): boolean {
  return !!(social.instagram || social.facebook || social.tiktok || social.youtube || social.website);
}

export function SocialLinks({
  social,
  className,
  iconClass = "h-3.5 w-3.5",
}: {
  social: StoreSocial;
  /** Clasa fiecarui link — forma si culoarea le da varianta care le foloseste. */
  className: string;
  iconClass?: string;
}) {
  return (
    <>
      {social.instagram && (
        <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={className}>
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
          </svg>
        </a>
      )}
      {social.facebook && (
        <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={className}>
          <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
          </svg>
        </a>
      )}
      {social.tiktok && (
        <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className={className}>
          <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.82a8.16 8.16 0 004.77 1.52V6.9a4.85 4.85 0 01-1-.21z"/>
          </svg>
        </a>
      )}
      {social.website && (
        <a href={social.website} target="_blank" rel="noopener noreferrer" aria-label="Website" className={className}>
          <Globe className={iconClass} />
        </a>
      )}
      {social.youtube && (
        <a href={social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className={className}>
          <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
            <path d="M23 12s0-3.8-.48-5.6a2.9 2.9 0 00-2.05-2.06C18.68 3.86 12 3.86 12 3.86s-6.68 0-8.47.48A2.9 2.9 0 001.48 6.4C1 8.2 1 12 1 12s0 3.8.48 5.6a2.9 2.9 0 002.05 2.06c1.79.48 8.47.48 8.47.48s6.68 0 8.47-.48a2.9 2.9 0 002.05-2.06C23 15.8 23 12 23 12zM9.82 15.43V8.57L15.64 12z"/>
          </svg>
        </a>
      )}
    </>
  );
}
