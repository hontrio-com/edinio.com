"use client";

import { useEffect, useState } from "react";
import { getEdinioBadgeHidden } from "@/lib/actions/branding.actions";
import { useIdentitateMagazin } from "@/components/storefront/IdentitateMagazin";

/**
 * "Creat cu Edinio" footer credit. Hidden only when the store is on a purchased
 * plan and the merchant opted to hide it (enforced server-side). Renders nothing
 * until the check resolves, so a store that hid it never flashes the credit.
 *
 * ⚠ 19.11.2026: pe paginile magazinului verdictul vine de la layout, de pe server (`IdentitateMagazin`), deci creditul
 * e in HTML-ul paginii si nu mai costa o actiune de server la fiecare afisare. Cererea din browser e doar rezerva.
 */
export function EdinioCredit({ businessId, color, className }: { businessId: string; color: string; className?: string }) {
  const { creditAscuns } = useIdentitateMagazin();
  const [aflat, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (creditAscuns !== null) return;
    let active = true;
    getEdinioBadgeHidden(businessId)
      .then((hidden) => { if (active) setShow(!hidden); })
      .catch(() => { if (active) setShow(true); });
    return () => { active = false; };
  }, [businessId, creditAscuns]);

  const show = creditAscuns !== null ? !creditAscuns : aflat;
  if (!show) return null;
  return (
    <p className={className}>
      Creat cu <span className="font-semibold" style={{ color }}>Edinio</span>
    </p>
  );
}
