"use client";

import { resolveActions } from "@/lib/storefront/design/actions";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import type { HeaderAction } from "@/lib/storefront/design/registry";

/**
 * Setarile comune tuturor variantelor de header: ce iconite se vad, in ce
 * ordine, si cum arata textul meniului.
 *
 * Fiecare varianta spune ce actiuni STIE sa afiseze ca iconita — cele cu bara de
 * cautare permanenta nu au si o lupa, deci nu ofera „cautare". Din ele se scot
 * apoi cele fara date in magazin (telefon necompletat, WhatsApp oprit), fiindca
 * o iconita care duce nicaieri e mai rea decat lipsa ei.
 */
export function useHeaderSettings(
  settings: Record<string, unknown>,
  suportate: readonly HeaderAction[],
): {
  actiuni: HeaderAction[];
  are: (a: HeaderAction) => boolean;
  /** Clasele textului de meniu, dupa font si scriere. */
  meniuCls: string;
  meniuStyle: { fontFamily: string };
} {
  const { business, features, cartMode } = useStoreChrome();

  const areDate: Record<HeaderAction, boolean> = {
    cautare: true,
    telefon: features.floating_call === true && !!business.phone,
    whatsapp: features.floating_whatsapp !== false && !!business.whatsapp,
    cos: cartMode !== "hidden",
  };
  const disponibile = suportate.filter((a) => areDate[a]);
  const actiuni = resolveActions(settings.actions, disponibile, suportate);

  const majuscule = settings.menuCase === "majuscule";
  return {
    actiuni,
    are: (a) => actiuni.includes(a),
    meniuCls: majuscule ? "uppercase tracking-[0.08em]" : "",
    meniuStyle: {
      fontFamily: settings.menuFont === "heading" ? "var(--st-font-heading)" : "var(--st-font-body)",
    },
  };
}
