"use client";

import { useEffect, useState } from "react";
import { getNetopiaBadge } from "@/lib/actions/netopia.actions";

/**
 * Netopia "Identitate Vizuala" badge shown in the storefront footer when the
 * merchant has Netopia card payment enabled (mandatory branding). The markup is
 * the official Netopia iframe embed, fetched and sanitized server-side
 * (Netopia-domain iframe only) by `getNetopiaBadge`, so rendering it via
 * dangerouslySetInnerHTML here is safe. Renders nothing when no badge is set.
 */
export function NetopiaBadge({ businessId }: { businessId: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let active = true;
    getNetopiaBadge(businessId).then((h) => {
      if (active) setHtml(h);
    });
    return () => {
      active = false;
    };
  }, [businessId]);

  if (!html) return null;

  return (
    <div className="shrink-0">
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Plata securizata</p>
      <div
        className="[&_iframe]:max-w-full [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
