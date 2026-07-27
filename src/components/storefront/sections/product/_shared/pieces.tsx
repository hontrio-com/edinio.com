"use client";

import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Plus, Minus, Eye } from "lucide-react";
import type { FaqItem } from "./product-page.types";

/**
 * Piese folosite de mai multe variante de pagina de produs.
 *
 * Mutate VERBATIM din ProductPageClassic cand a aparut a doua varianta: orice
 * schimbare de marcaj aici se vede la toate magazinele, nu doar la varianta
 * noua. Galeria a ramas la fiecare varianta, fiindca acolo designurile chiar
 * difera (banda de miniaturi jos la classic, sina verticala la detailed).
 */

/* ─── Miscare redusa ──────────────────────────────────────────────────────── */

const MQ_MISCARE_REDUSA = "(prefers-reduced-motion: reduce)";

export function abonareMiscareRedusa(la: () => void) {
  const mq = window.matchMedia(MQ_MISCARE_REDUSA);
  mq.addEventListener("change", la);
  return () => mq.removeEventListener("change", la);
}

export function citesteMiscareRedusa() { return window.matchMedia(MQ_MISCARE_REDUSA).matches; }

/** Hash stabil, ca numarul de vizitatori sa iasa acelasi pe server si in browser. */
export function hashSir(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Cosul e detinut de `CartProvider` (contorul din antet citeste de acolo), dar
 * pagina de produs scrie direct in `cart_<slug>`. Evenimentul „storage" nu se
 * declanseaza in fila care a scris, deci il emitem noi: fara el antetul ramane pe
 * cifra veche dupa o adaugare din „Merge bine cu", iar cosul sters dupa comanda
 * ramane plin in memoria providerului.
 */
export function anuntaCosSchimbat(cheie: string, valoare: string | null) {
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: cheie, newValue: valoare }));
  } catch {}
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

export function SocialProof({ count, color }: { count: number; color: string }) {
  return (
    <div className="inline-flex items-center gap-2 bg-surface border border-border shadow-sm rounded-full px-4 py-2 text-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
      </span>
      <Eye size={14} className="text-muted-foreground" />
      <span className="font-medium text-muted-foreground">
        <span className="text-foreground font-bold">{count}</span> persoane se uita acum
      </span>
    </div>
  );
}

export function FAQItem({ faq, isOpen, onToggle }: { faq: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" onClick={onToggle} aria-expanded={isOpen}
        className="w-full flex items-start gap-4 py-5 text-left hover:text-foreground transition-colors">
        <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center">
          {isOpen ? <Minus size={12} className="text-foreground" /> : <Plus size={12} className="text-muted-foreground" />}
        </span>
        <span className="font-semibold text-foreground text-base pr-4">{faq.q}</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden">
            <p className="text-muted-foreground text-sm leading-relaxed pb-5 pl-10 pr-4">{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── CTA Button with effects ─────────────────────────────────────────────── */

const BTN_CLS = "w-full py-4 text-base font-bold text-white rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30";

export function CTAButton({ color, isOutOfStock, isPreorder, needsVariant, hasCardPayment, effect, onClick, eticheta }: {
  color: string; isOutOfStock: boolean; isPreorder: boolean; needsVariant: boolean; hasCardPayment: boolean; effect: string; onClick: () => void;
  /** Inlocuieste eticheta calculata. Variantele care au si un buton de cos numesc altfel actiunea de comanda. */
  eticheta?: ReactNode;
}) {
  // Drop the "- Plata la livrare" suffix when card payment is available.
  const codSuffix = hasCardPayment ? "" : " - Plata la livrare";
  const label = eticheta ?? (
    <>
      <ShoppingBag size={18} />
      {isOutOfStock ? "Stoc epuizat"
        : needsVariant ? "Selecteaza optiunile"
        : isPreorder ? `Precomanda${codSuffix}`
        : `Comanda acum${codSuffix}`}
    </>
  );
  const base = { backgroundColor: color, boxShadow: `0px 4px 16px ${color}55` };

  const disabled = isOutOfStock || needsVariant;

  if (effect === "pulse") return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ backgroundColor: color }}
        animate={{ opacity: [0.7, 0], scale: [1, 1.15] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
      />
      <button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}>{label}</button>
    </div>
  );

  if (effect === "shake") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}
      animate={{ x: [0, -5, 5, -5, 5, 0] }}
      transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}>
      {label}
    </motion.button>
  );

  if (effect === "bounce") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}>
      {label}
    </motion.button>
  );

  if (effect === "glow") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS}
      style={{ backgroundColor: color }}
      animate={{ boxShadow: [`0px 4px 16px ${color}44`, `0px 4px 36px ${color}CC`, `0px 4px 16px ${color}44`] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
      {label}
    </motion.button>
  );

  if (effect === "heartbeat") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}
      animate={{ scale: [1, 1.06, 1, 1.06, 1] }}
      transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }}>
      {label}
    </motion.button>
  );

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS + " transition-all"} style={base}>
      {label}
    </button>
  );
}
