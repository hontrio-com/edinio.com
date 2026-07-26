"use client";

import type { ElementType } from "react";
import { Phone, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { useStorefront } from "@/components/storefront/StorefrontProvider";

/** Iconitele disponibile pentru insignele de incredere, alese din editor. */
const TRUST_ICONS: Record<string, ElementType> = {
  truck: Truck,
  shield: ShieldCheck,
  "rotate-ccw": RotateCcw,
  phone: Phone,
};

/**
 * Banda de incredere de sub hero, varianta classic: pana la patru insigne cu
 * iconita, titlu si descriere. Continutul vine din
 * `page_content.store_trust_badges` si e optional.
 */
export function UspStripIcons() {
  const { pageContent, color } = useStorefront();
  const pornita = pageContent.show_trust_strip_on_store === true;
  const badges = pageContent.store_trust_badges;
  if (!pornita || !badges || badges.length === 0) return null;

  return (
    <section className="border-b border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {badges.map((badge, i) => {
            const Icon = TRUST_ICONS[badge.icon] ?? ShieldCheck;
            return (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: `${color}15`, color }}>
                  <Icon className="h-4.5 w-4.5" size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{badge.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">{badge.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
