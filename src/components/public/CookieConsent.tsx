"use client";

import { useEffect, useState, useCallback } from "react";
import { Cookie, X, Check } from "lucide-react";
import {
  readConsent, writeConsent, CONSENT_ALL, CONSENT_NONE,
  OPEN_SETTINGS_EVENT,
  type ConsentCategory, type ConsentState, type CookieBannerPosition,
} from "@/lib/cookie-consent";

const CATEGORY_LABELS: Record<ConsentCategory, { title: string; desc: string }> = {
  analytics: {
    title: "Analiza",
    desc: "Ne ajuta sa intelegem cum este folosit magazinul (Google Analytics).",
  },
  marketing: {
    title: "Marketing",
    desc: "Permit afisarea de reclame relevante (Facebook, TikTok).",
  },
};

export function CookieConsent({ slug, color, categories, position, policyHref, storeName }: {
  slug: string;
  color: string;
  categories: ConsentCategory[];
  position: CookieBannerPosition;
  policyHref: string | null;
  storeName: string;
}) {
  const hasChoices = categories.length > 0;
  const [mounted, setMounted] = useState(false); // render nothing until storage is read (no SSR flash)
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [decided, setDecided] = useState(true);
  const [prefs, setPrefs] = useState<{ analytics: boolean; marketing: boolean }>({ analytics: false, marketing: false });

  // First visit → open banner. Reopen via the global settings event / reopen button.
  useEffect(() => {
    const existing = readConsent(slug);
    if (existing) {
      setDecided(true);
      setPrefs({ analytics: existing.analytics, marketing: existing.marketing });
    } else {
      setDecided(false);
      setOpen(true);
    }
    setMounted(true);
  }, [slug]);

  const reopen = useCallback(() => {
    const existing = readConsent(slug);
    if (existing) setPrefs({ analytics: existing.analytics, marketing: existing.marketing });
    setShowDetails(hasChoices);
    setOpen(true);
  }, [slug, hasChoices]);

  useEffect(() => {
    const handler = () => reopen();
    window.addEventListener(OPEN_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
  }, [reopen]);

  const persist = (state: ConsentState) => {
    writeConsent(slug, state);
    setDecided(true);
    setOpen(false);
    setShowDetails(false);
  };

  const acceptAll = () => persist(CONSENT_ALL);
  const rejectAll = () => persist(CONSENT_NONE);
  const savePrefs = () => persist({ necessary: true, analytics: prefs.analytics, marketing: prefs.marketing });

  // Persistent, subtle reopen control (GDPR: withdraw consent as easily as given).
  const ReopenButton = hasChoices && decided && !open ? (
    <button
      type="button"
      onClick={reopen}
      aria-label="Setari cookie-uri"
      className="fixed bottom-4 left-4 z-40 w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-black/10 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-800 opacity-60 hover:opacity-100 transition-opacity"
    >
      <Cookie className="h-5 w-5" />
    </button>
  ) : null;

  if (!mounted) return null;
  if (!open) return ReopenButton;

  // ── Layout: where the banner/card sits ───────────────────────────────────
  const isCenter = position === "center" || (showDetails && position === "bottom-bar");
  const wrapperClass =
    isCenter ? "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-[2px]"
    : position === "bottom-left" ? "fixed bottom-4 left-4 z-50 max-w-[26rem] w-[calc(100vw-2rem)]"
    : position === "bottom-right" ? "fixed bottom-4 right-4 z-50 max-w-[26rem] w-[calc(100vw-2rem)]"
    : "fixed bottom-0 inset-x-0 z-50"; // bottom-bar (simple view)

  const isBar = position === "bottom-bar" && !showDetails;

  // ── Informational only (store has no trackers) ───────────────────────────
  if (!hasChoices) {
    return (
      <div className={wrapperClass}>
        <div className={isBar
          ? "bg-white border-t border-black/10 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
          : "bg-white rounded-2xl border border-black/10 shadow-xl"}>
          <div className={isBar
            ? "max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            : "p-5"}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Cookie className="h-5 w-5 shrink-0 mt-0.5" style={{ color }} />
              <p className="text-[13px] leading-relaxed text-gray-600">
                Folosim doar cookie-uri esentiale, necesare functionarii magazinului.{" "}
                {policyHref && <a href={policyHref} className="underline hover:text-gray-900">Afla mai mult</a>}
              </p>
            </div>
            <button type="button" onClick={() => persist(CONSENT_NONE)}
              className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: color }}>
              Am inteles
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Simple bottom-bar view (first visit, full-consent quick choice) ──────
  if (isBar) {
    return (
      <div className={wrapperClass}>
        <div className="bg-white border-t border-black/10 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Cookie className="h-5 w-5 shrink-0 mt-0.5" style={{ color }} />
              <p className="text-[13px] leading-relaxed text-gray-600">
                Folosim cookie-uri pentru a imbunatati experienta pe {storeName}.{" "}
                {policyHref && <a href={policyHref} className="underline hover:text-gray-900">Detalii</a>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setShowDetails(true)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                Setari
              </button>
              <button type="button" onClick={rejectAll}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 border border-black/10 hover:bg-gray-50 transition-colors">
                Refuza
              </button>
              <button type="button" onClick={acceptAll}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: color }}>
                Accepta
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Card / details view (corner cards + center modal + bottom-bar "Setari") ─
  return (
    <div className={wrapperClass}>
      <div className={`bg-white rounded-2xl border border-black/10 shadow-xl w-full ${isCenter ? "max-w-md" : ""} overflow-hidden`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A` }}>
                <Cookie className="h-5 w-5" style={{ color }} />
              </span>
              <h2 className="text-[15px] font-semibold text-gray-900">Preferinte cookie-uri</h2>
            </div>
            {decided && (
              <button type="button" onClick={() => setOpen(false)} aria-label="Inchide"
                className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <p className="text-[13px] leading-relaxed text-gray-600 mb-4">
            Alege ce cookie-uri permiti pe {storeName}. Cele esentiale sunt mereu active.{" "}
            {policyHref && <a href={policyHref} className="underline hover:text-gray-900">Politica de cookie-uri</a>}
          </p>

          <div className="space-y-2.5 mb-5">
            {/* Necessary — always on, read-only */}
            <ConsentRow
              title="Esentiale"
              desc="Necesare functionarii magazinului (cos, sesiune). Mereu active."
              checked
              disabled
              color={color}
            />
            {categories.includes("analytics") && (
              <ConsentRow
                title={CATEGORY_LABELS.analytics.title}
                desc={CATEGORY_LABELS.analytics.desc}
                checked={prefs.analytics}
                onChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
                color={color}
              />
            )}
            {categories.includes("marketing") && (
              <ConsentRow
                title={CATEGORY_LABELS.marketing.title}
                desc={CATEGORY_LABELS.marketing.desc}
                checked={prefs.marketing}
                onChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
                color={color}
              />
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            <button type="button" onClick={rejectAll}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-black/10 hover:bg-gray-50 transition-colors">
              Refuza tot
            </button>
            <button type="button" onClick={savePrefs}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-black/10 hover:bg-gray-50 transition-colors">
              Salveaza alegerea
            </button>
            <button type="button" onClick={acceptAll}
              className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: color }}>
              Accepta tot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsentRow({ title, desc, checked, onChange, disabled, color }: {
  title: string; desc: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; color: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/[0.07] bg-gray-50/60 p-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-900">{title}</p>
        <p className="text-[12px] leading-snug text-gray-500 mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative shrink-0 mt-0.5 w-10 h-6 rounded-full transition-colors ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${checked ? "" : "bg-gray-300"}`}
        style={checked ? { backgroundColor: color } : undefined}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform flex items-center justify-center ${checked ? "translate-x-4" : ""}`}>
          {checked && <Check className="h-3 w-3" style={{ color }} />}
        </span>
      </button>
    </div>
  );
}
