"use client";

import { useStorefront } from "@/components/storefront/StorefrontProvider";

/** Trepte de viteza, de la cea mai lenta la cea mai rapida (secunde pe ciclu). */
const SPEEDS = [80, 50, 30, 18, 10];

/**
 * Bara de anunt cu text derulant, varianta classic.
 *
 * Textul se repeta de opt ori ca banda sa para continua indiferent cat de scurt
 * e mesajul. Bara e `sticky top-0`, iar header-ul se aseaza sub ea (`top-9`)
 * cand exista — vezi `hasAnnouncementBar` din context.
 */
export function AnnouncementMarquee() {
  const { pageContent, color } = useStorefront();
  const bar = pageContent.announcement_bar;
  const pornita = pageContent.show_announcement_on_store !== false && bar?.enabled === true;
  if (!pornita || !bar) return null;

  const durata = SPEEDS[(bar.speed ?? 3) - 1] ?? SPEEDS[2];

  return (
    <div className="h-9 overflow-hidden flex items-center sticky top-0 z-40"
      style={{ background: bar.bg_color || color }}>
      <div className="flex whitespace-nowrap">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="inline-block text-xs font-medium tracking-wide text-white"
            style={{ animation: `marquee ${durata}s linear infinite` }}>
            {bar.text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          </span>
        ))}
      </div>
    </div>
  );
}
