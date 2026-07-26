"use client";

import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { Marquee, marqueeDuration } from "@/components/storefront/sections/_shared/Marquee";

/**
 * Bara de anunt cu text derulant, varianta classic.
 *
 * Textul se repeta de opt ori ca banda sa para continua indiferent cat de scurt
 * e mesajul. Bara e `sticky top-0`, iar header-ul se aseaza sub ea (`top-9`)
 * cand exista — vezi `hasAnnouncementBar` din context.
 */
export function AnnouncementMarquee() {
  const { pageContent, color } = useStoreChrome();
  const bar = pageContent.announcement_bar;
  const pornita = pageContent.show_announcement_on_store !== false && bar?.enabled === true;
  if (!pornita || !bar) return null;

  return (
    <div className="h-9 overflow-hidden flex items-center sticky top-0 z-40"
      style={{ background: bar.bg_color || color }}>
      <Marquee durata={marqueeDuration(bar.speed)} className="inline-block text-xs font-medium tracking-wide text-white">
        {bar.text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      </Marquee>
    </div>
  );
}
