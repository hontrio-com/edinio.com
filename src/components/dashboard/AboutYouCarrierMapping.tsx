"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getAboutYouCarriers, saveAboutYouCarrierMap } from "@/lib/actions/aboutyou.actions";
import type { AboutYouCarrier } from "@/lib/aboutyou/types";

const COURIERS: { code: string; label: string }[] = [
  { code: "fan-courier", label: "FAN Courier" },
  { code: "dpd", label: "DPD" },
  { code: "cargus", label: "Cargus" },
  { code: "sameday", label: "Sameday" },
  { code: "woot", label: "Woot" },
  { code: "colete", label: "Colete Online" },
];

export function AboutYouCarrierMapping({
  businessId, carrierMap,
}: {
  businessId: string; carrierMap: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [carriers, setCarriers] = useState<AboutYouCarrier[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getAboutYouCarriers(businessId);
      if (!alive) return;
      if (!("error" in res)) setCarriers(res.carriers);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [businessId]);

  // Dedupe carriers by key (the same key repeats across country_code rows).
  const byKey = new Map<string, AboutYouCarrier>();
  for (const c of carriers) if (!byKey.has(c.key)) byKey.set(c.key, c);
  const options = [...byKey.values()];

  const setMapping = (courierCode: string, carrierKey: string) => {
    startTransition(async () => {
      const res = await saveAboutYouCarrierMap(businessId, courierCode, carrierKey || null);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Curier mapat.");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground mb-1">Mapare curieri</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Leagă fiecare curier Edinio de un carrier About You. Când generezi AWB-ul pentru o comandă About You, tracking-ul se trimite automat cu carrier-ul mapat.
      </p>

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Se încarcă curierii...</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nu am putut încărca lista de carriere About You. Reîncearcă.</p>
      ) : (
        <div className="divide-y divide-border">
          {COURIERS.map((c) => (
            <div key={c.code} className="py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{c.label}</p>
              <select
                value={carrierMap[c.code] ?? ""}
                onChange={(e) => setMapping(c.code, e.target.value)}
                disabled={pending}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-[60%]"
              >
                <option value="">Nemapat</option>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>{o.display_label || o.carrier_name || o.key}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
