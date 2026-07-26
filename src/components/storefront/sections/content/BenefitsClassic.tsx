"use client";

import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Sectiunea „De ce sa alegi produsele noastre", varianta classic.
 * Continutul vine din `page_content.store_benefits_section`.
 */
export function BenefitsClassic() {
  const { pageContent, color } = useStoreChrome();
  const benefits = pageContent.store_benefits_section;
  if (!benefits?.enabled || benefits.items.length === 0) return null;

  return (
    <section className="mb-16">
      <h2 className="text-xl font-semibold text-foreground mb-6">{benefits.title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {benefits.items.map((item, i) => (
          <div key={i} className="flex gap-4 p-5 bg-surface border border-border rounded-2xl">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm text-white"
              style={{ backgroundColor: color }}>
              {i + 1}
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm mb-1">{item.title}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
