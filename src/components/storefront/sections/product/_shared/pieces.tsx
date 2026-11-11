"use client";

import type { ReactNode } from "react";
import { ShoppingBag, Plus, Minus, Eye } from "lucide-react";
import type { FaqItem } from "./product-page.types";
import { textulContorului, type FereastraContor } from "@/lib/storefront/contor-vizitatori";

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

/**
 * Contorul de vizitatori (etapa 12): oameni masurati, nu un numar inventat. Cine il cheama decide
 * daca apare (`numarulContorului`); la zero nu se randeaza deloc.
 */
export function SocialProof({ count, fereastra, color }: { count: number; fereastra: FereastraContor; color: string }) {
  return (
    <div className="inline-flex items-center gap-2 bg-surface border border-border shadow-sm rounded-full px-4 py-2 text-sm">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
      </span>
      <Eye size={14} className="shrink-0 text-muted-foreground" />
      <span className="font-medium text-muted-foreground">
        <span className="text-foreground font-bold">{count}</span> {textulContorului(count, fereastra)}
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
      {/*
        Etapa 25.25 (11.11.2026): deschiderea in CSS (randurile grilei de la 0fr la 1fr, 0,3 s), nu cu framer-motion (~54 KB pe
        pagina de produs). Raspunsul inchis ramane in pagina, dar `inert`: nu se citeste si nu primeste focus.
      */}
      <div inert={!isOpen}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="text-muted-foreground text-sm leading-relaxed pb-5 pl-10 pr-4">{faq.a}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── CTA Button with effects ─────────────────────────────────────────────── */

/** Efectul ales de comerciant -> clasa lui din `stil-comun.css` (`pulse` si `glow` deseneaza halo-ul din `box-shadow`). */
const CLASA_EFECT: Record<string, string> = {
  pulse: "cta-puls",
  shake: "cta-scutura",
  bounce: "cta-salt",
  glow: "cta-stralucire",
  heartbeat: "cta-bataie",
};

const BTN_CLS = "w-full py-4 text-base font-bold text-[var(--st-primary-contrast,#fff)] rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30";

export function CTAButton({ color, isOutOfStock, isPreorder, needsVariant, hasCardPayment, effect, onClick, eticheta, clase }: {
  color: string; isOutOfStock: boolean; isPreorder: boolean; needsVariant: boolean; hasCardPayment: boolean; effect: string; onClick: () => void;
  /** Inlocuieste eticheta calculata. Variantele care au si un buton de cos numesc altfel actiunea de comanda. */
  eticheta?: ReactNode;
  /**
   * Inlocuieste complet sirul de clase.
   *
   * Butonul poarta cele sase efecte alese de comerciant, deci fiecare varianta
   * de design trebuie sa il poata folosi si cu forma ei — altfel un design plat
   * si drept ar fi nevoit sa isi scrie propriul buton si ar pierde efectele.
   * Sirul se da INTREG, nu compus, ca la orice alta clasa din proiect.
   */
  clase?: string;
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
  const cls = clase ?? BTN_CLS;
  const base = { backgroundColor: color, boxShadow: `0px 4px 16px ${color}55` };

  const disabled = isOutOfStock || needsVariant;

  /*
   * Halo-ul de puls se face din `box-shadow`, ca la `glow`, nu dintr-un dreptunghi
   * asezat in spate si marit cu `scale`.
   *
   * Cum era: un `<div absolute inset-0>` peste toata latimea butonului, animat
   * `scale: [1, 1.15]`. Butonul e `w-full`, deci pe telefon inelul avea latimea
   * coloanei (352px) si la varf iesea cu ~27px de fiecare parte, adica pana la
   * 394px la o fereastra de 384. O cutie transformata intra in regiunea de
   * derulare a paginii, deci pagina culisa laterala IN RITMUL animatiei, la
   * infinit. Marginea de 16px a containerului nu ajungea: ar fi permis cel mult
   * `scale` 1,09.
   *
   * De ce `box-shadow` e echivalent, nu un compromis: inelul statea IN SPATELE
   * butonului, care il acopera complet, deci singurul lucru care se vedea era
   * franjurul din afara. Umbra deseneaza exact acel franjur — si, in plus, nu
   * intra niciodata in regiunea de derulare, la nicio latime. Urmareste si raza
   * colturilor butonului, deci varianta „detaliat", care isi da butonul cu
   * `rounded-md`, nu mai primeste un halo `rounded-xl` peste el.
   *
   * Umbra de asezare din `base` intra in cadrele animatiei: altfel animarea lui
   * `box-shadow` ar fi sters-o.
   */
  /*
   * Etapa 25.25 (11.11.2026): efectele in CSS (`stil-comun.css`, `.cta-*`), cu aceleasi cadre si timpi ca in framer-motion,
   * care aducea ~54 KB pe pagina de produs. Umbra de asezare sta in `base`; la puls si stralucire o reia chiar animatia
   * (animarea lui `box-shadow` ar fi sters-o). Cu miscare redusa, efectele se opresc si ramane butonul cu umbra lui.
   */
  const efect = CLASA_EFECT[effect];
  if (efect) return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} ${efect}`}
      style={{ ...base, ["--fx-c" as string]: color }}>
      {label}
    </button>
  );

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={clase ?? BTN_CLS + " transition-all"} style={base}>
      {label}
    </button>
  );
}
