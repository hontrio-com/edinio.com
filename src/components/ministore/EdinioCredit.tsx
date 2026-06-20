"use client";

import { useEffect, useState } from "react";
import { getEdinioBadgeHidden } from "@/lib/actions/branding.actions";

/**
 * "Creat cu Edinio" footer credit. Hidden only when the store is on a purchased
 * plan and the merchant opted to hide it (enforced server-side). Renders nothing
 * until the check resolves, so a store that hid it never flashes the credit.
 */
export function EdinioCredit({ businessId, color, className }: { businessId: string; color: string; className?: string }) {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getEdinioBadgeHidden(businessId)
      .then((hidden) => { if (active) setShow(!hidden); })
      .catch(() => { if (active) setShow(true); });
    return () => { active = false; };
  }, [businessId]);

  if (!show) return null;
  return (
    <p className={className}>
      Creat cu <span className="font-semibold" style={{ color }}>Edinio</span>
    </p>
  );
}
