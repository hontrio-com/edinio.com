"use client";

import { useEffect, useState } from "react";
import { getNetopiaBadge } from "@/lib/actions/netopia.actions";
import { useIdentitateMagazin } from "@/components/storefront/IdentitateMagazin";

/**
 * Netopia "Identitate Vizuala" badge shown in the storefront footer when the
 * merchant has Netopia card payment enabled (mandatory branding). The markup is
 * the official Netopia iframe embed, fetched and sanitized server-side
 * (Netopia-domain iframe only) by `getNetopiaBadge`, so rendering it via
 * dangerouslySetInnerHTML here is safe. Renders nothing when no badge is set.
 *
 * ⚠ 19.11.2026: pe paginile magazinului insigna vine de la layout, adusa pe server (`IdentitateMagazin`), deci e in
 * HTML-ul paginii si nu mai costa o actiune de server la fiecare afisare. Cererea din browser a ramas doar ca rezerva
 * (in afara layoutului magazinului sau cand citirea de pe server a cazut), acum cu `catch`: fara el, o cerere taiata de
 * o navigare lasa o eroare neprinsa in Firefox si Safari.
 */
export function NetopiaBadge({ businessId, ton = "inchis" }: {
  businessId: string;
  /** Fundalul footerului care il compune: „inchis" (implicit) sau „deschis". */
  ton?: "inchis" | "deschis";
}) {
  const { insignaNetopia } = useIdentitateMagazin();
  const [adusa, setAdusa] = useState("");

  useEffect(() => {
    if (insignaNetopia !== null) return;
    let active = true;
    getNetopiaBadge(businessId)
      .then((h) => { if (active) setAdusa(h); })
      .catch(() => { /* fara insigna, nu cu o eroare neprinsa */ });
    return () => {
      active = false;
    };
  }, [businessId, insignaNetopia]);

  const html = insignaNetopia ?? adusa;

  if (!html) return null;

  return (
    <div className="shrink-0">
      <p className={ton === "deschis"
        ? "text-[10px] font-semibold text-[var(--st-muted)] uppercase tracking-widest mb-3"
        : "text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-3"}>Plata securizata</p>
      <div
        className="[&_iframe]:max-w-full [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
