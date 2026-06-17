"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { BlockShell } from "../BlockShell";
import type { FaqBlock } from "@/lib/pages/blocks.types";

export function FaqBlockView({ block }: { block: FaqBlock }) {
  const items = block.items ?? [];
  const [open, setOpen] = useState<number | null>(0);
  if (items.length === 0) return null;
  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      {block.title && (
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground text-center mb-8">{block.title}</h2>
      )}
      <div className="bg-surface border border-border rounded-2xl px-4 sm:px-8">
        {items.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="border-b border-border last:border-0">
              <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
                className="w-full flex items-start gap-4 py-5 text-left hover:opacity-80 transition-opacity">
                <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center">
                  {isOpen ? <Minus size={12} /> : <Plus size={12} />}
                </span>
                <span className="font-semibold text-foreground text-base pr-4">{faq.q}</span>
              </button>
              {isOpen && (
                <p className="text-muted-foreground text-sm leading-relaxed pb-5 pl-10 pr-4">{faq.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </BlockShell>
  );
}
