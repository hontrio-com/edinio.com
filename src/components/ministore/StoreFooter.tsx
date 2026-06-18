import Image from "next/image";
import { Globe } from "lucide-react";
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon } from "./social-icons";
import { NetopiaBadge } from "./NetopiaBadge";
import { menuItemHref, type MenuItem } from "@/lib/pages/menu";

interface Social { facebook?: string; instagram?: string; tiktok?: string; youtube?: string; website?: string }

const POLICY_LINKS = [
  { slug: "termeni", label: "Termeni si conditii" },
  { slug: "livrare", label: "Politica de livrare" },
  { slug: "retur", label: "Politica de retur" },
  { slug: "confidentialitate", label: "Confidentialitate" },
  { slug: "gdpr", label: "GDPR" },
  { slug: "anulare", label: "Anulare comanda" },
] as const;

export function StoreFooter({ business, menu, basePath, businessId, footerLogoSize = 36 }: {
  business: { business_name: string; store_name: string | null; logo_url: string | null; store_city: string | null; primary_color: string; social: Social };
  menu: MenuItem[];
  basePath: string;
  businessId: string;
  footerLogoSize?: number;
}) {
  const name = business.store_name ?? business.business_name;
  const color = business.primary_color ?? "#1AB554";
  const social = business.social ?? {};
  const pageLinks = menu.filter((m) => m.type === "page" || m.type === "link");

  return (
    <footer className="bg-[#0A0A0A] text-white mt-10">
      <div className="max-w-6xl mx-auto px-5 pt-10 pb-6 sm:pt-12">
        <div className="flex items-center justify-between gap-4 pb-8">
          <div className="flex items-center gap-3 min-w-0">
            {business.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={name} style={{ height: footerLogoSize, maxWidth: footerLogoSize * 4.2 }} className="w-auto object-contain shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: color }}>
                {name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {social.instagram && <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"><InstagramIcon className="h-3.5 w-3.5" /></a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"><FacebookIcon className="h-3.5 w-3.5" /></a>}
            {social.tiktok && <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"><TikTokIcon className="h-3.5 w-3.5" /></a>}
            {social.youtube && <a href={social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"><YoutubeIcon className="h-3.5 w-3.5" /></a>}
            {social.website && <a href={social.website} target="_blank" rel="noopener noreferrer" aria-label="Website" className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"><Globe className="h-3.5 w-3.5" /></a>}
          </div>
        </div>

        <div className="h-px bg-white/[0.06]" />

        <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-16">
          {pageLinks.length > 0 && (
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Pagini</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {pageLinks.map((it) => (
                  <a key={it.id} href={menuItemHref(it, basePath)} className="text-[13px] text-white/50 hover:text-white transition-colors">{it.label}</a>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Informatii legale</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {POLICY_LINKS.map(({ slug, label }) => (
                <a key={slug} href={`${basePath}/politici/${slug}`} className="text-[13px] text-white/50 hover:text-white transition-colors">{label}</a>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Protectia consumatorilor</p>
            <div className="flex items-center gap-3">
              <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" title="SAL">
                <Image src="/anpc-sal.avif" alt="ANPC SAL" width={98} height={40} className="rounded-md" />
              </a>
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" title="SOL">
                <Image src="/anpc-sol.avif" alt="ANPC SOL" width={98} height={40} className="rounded-md" />
              </a>
            </div>
          </div>
          {/* Plata securizata (Netopia) — badge obligatoriu cand plata cu cardul e activa */}
          <NetopiaBadge businessId={businessId} />
        </div>

        <div className="h-px bg-white/[0.06]" />

        <div className="pt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-white/25">&copy; {new Date().getFullYear()} {name}</p>
          <p className="text-[11px] text-white/25">Creat cu <span className="font-semibold" style={{ color }}>Edinio</span></p>
        </div>
      </div>
    </footer>
  );
}
