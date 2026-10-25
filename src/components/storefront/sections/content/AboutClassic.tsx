"use client";

import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Sectiunea „Despre noi”, varianta classic. Textul vine din `businesses.description`.
 *
 * ⚠ Fara a doua poarta pe `features.show_about`: pornit sau oprit spune `enabled`
 * din design, derivat din flagul acela cat timp ochiul din editor n-a spus altceva.
 */
export function AboutClassic() {
  const { business } = useStoreChrome();
  if (!business.description) return null;

  return (
    <section className="mb-16">
      <h2 className="text-xl font-semibold text-foreground mb-4">Despre noi</h2>
      <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8">
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{business.description}</p>
      </div>
    </section>
  );
}
