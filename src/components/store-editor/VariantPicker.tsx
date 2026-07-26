"use client";

import { Check } from "lucide-react";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance } from "@/lib/storefront/design/types";

/**
 * Alegerea designului pentru sectiunea selectata.
 *
 * Fiecare varianta e un card cu numele si etichetele ei. Click aplica varianta
 * imediat in preview: totul e ciorna, deci comerciantul poate incerca toate
 * variantele si vedea rezultatul pe magazinul lui real, fara nicio consecinta
 * pana la Publica.
 *
 * Cand o sectiune are o singura varianta, panoul nu are ce arata si nu apare.
 */
export function VariantPicker({
  section,
  onPick,
}: {
  section: SectionInstance;
  onPick: (variant: string) => void;
}) {
  const meta = sectionMeta(section.kind);
  const variante = Object.entries(meta?.variants ?? {});
  if (variante.length < 2) return null;

  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs font-semibold text-foreground mb-2">
        Design pentru {meta?.label ?? section.kind}
      </p>
      <div className="space-y-1.5">
        {variante.map(([id, v]) => {
          const activ = id === section.variant;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              aria-pressed={activ}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                activ ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`flex-1 text-sm font-medium ${activ ? "text-primary" : "text-foreground"}`}>
                  {v.label}
                </span>
                {activ && <Check className="h-4 w-4 text-primary shrink-0" />}
              </span>
              {v.tags.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {v.tags.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
