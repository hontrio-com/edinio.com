"use client";

import { isValueAvailable, type VariantsData } from "@/lib/storefront/variants";

/**
 * Presentational variant option selector — one row of buttons per option axis,
 * with unavailable combinations struck through and disabled. Controlled: the
 * parent owns the `selected` map and derives the chosen combination from it
 * (same model as the product page). Reused by the product page and the
 * quick-add sheets so the picking UX is identical everywhere.
 */
export function VariantPicker({ variants, selected, onSelect, color, compact = false }: {
  variants: VariantsData;
  selected: Record<string, string>;
  onSelect: (optionName: string, value: string) => void;
  color: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {variants.options.map((option) => (
        <div key={option.id}>
          <p className="text-sm font-semibold text-foreground mb-2">
            {option.name}
            {selected[option.name] && (
              <span className="font-normal text-muted-foreground ml-2">- {selected[option.name]}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {option.values.map((val) => {
              const isSelected = selected[option.name] === val;
              const available = isValueAvailable(variants, selected, option.name, val);
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onSelect(option.name, isSelected ? "" : val)}
                  disabled={!available}
                  className={`rounded-xl text-sm font-medium border-2 transition-all ${compact ? "px-3 py-1.5" : "px-4 py-2"}`}
                  style={isSelected
                    ? { borderColor: color, backgroundColor: `${color}18`, color: "var(--color-foreground)" }
                    : available
                    ? { borderColor: "var(--color-border)", color: "var(--color-foreground)" }
                    : { borderColor: "var(--color-border)", color: "var(--color-muted-foreground)", textDecoration: "line-through", cursor: "not-allowed" }
                  }
                >
                  {val}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
