"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import { fontSetup } from "@/lib/storefront/design/fonts";
import { FONT_OPTIONS } from "@/lib/storefront/design/font-options";
import type { FontKey } from "@/lib/storefront/design/types";

/**
 * Alegerea fonturilor magazinului: unul pentru titluri, unul pentru text.
 *
 * Fiecare varianta se arata IN fontul ei (clasa `next/font` + variabila), nu
 * doar cu numele: „Playfair Display" nu spune nimic unui comerciant, un titlu
 * scris cu el spune. Fisierele se descarca numai pentru ce se vede.
 *
 * Valoarea goala inseamna implicitul, Geist. Vezi `lib/storefront/design/fonturi-magazin.ts`.
 */
export function AlegeFonturi({
  titluri, text, onTitluri, onText,
}: {
  titluri: FontKey | undefined;
  text: FontKey | undefined;
  onTitluri: (v: FontKey) => void;
  onText: (v: FontKey) => void;
}) {
  return (
    <div className="space-y-4">
      <Grila eticheta="Font titluri" mostra="Colectia noua" valoare={titluri ?? "geist"} onAlege={onTitluri} titlu />
      <Grila eticheta="Font text" mostra="Livrare rapida, retur 14 zile" valoare={text ?? "geist"} onAlege={onText} />
      <p className="text-[11px] text-muted-foreground">
        Se aplica pe tot magazinul: pagina principala, produse, cos si paginile tale. Blocurile din Pagini cu font ales anume il pastreaza pe al lor.
      </p>
    </div>
  );
}

function Grila({ eticheta, mostra, valoare, onAlege, titlu = false }: {
  eticheta: string; mostra: string; valoare: FontKey; onAlege: (v: FontKey) => void; titlu?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">{eticheta}</label>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label={eticheta}>
        {FONT_OPTIONS.map((f) => {
          const { className, vars } = fontSetup(f.key, f.key);
          const ales = f.key === valoare;
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={ales}
              onClick={() => onAlege(f.key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                ales ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40",
              )}
            >
              <span className="block text-[10px] font-medium text-muted-foreground">
                {f.label}{f.key === "geist" ? " (implicit)" : ""}
              </span>
              <span
                className={cn("mt-0.5 block truncate text-foreground", className, titlu ? "text-base font-semibold" : "text-xs")}
                style={{ ...vars, fontFamily: "var(--st-font-body)" } as CSSProperties}
              >
                {mostra}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
