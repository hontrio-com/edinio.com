"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Cookie, X, Check } from "lucide-react";
import {
  readConsent, writeConsent, bannerDecis, CONSENT_ALL, CONSENT_NONE,
  OPEN_SETTINGS_EVENT,
  type ConsentCategory, type ConsentState, type CookieBannerPosition,
} from "@/lib/cookie-consent";
import { contrastOn, raportContrast } from "@/lib/storefront/design/css-vars";

const CATEGORY_LABELS: Record<ConsentCategory, { title: string; desc: string }> = {
  analytics: {
    title: "Analiza",
    desc: "Ne ajuta sa intelegem cum este folosit magazinul (Google Analytics).",
  },
  marketing: {
    title: "Marketing",
    desc: "Permit afisarea de reclame relevante (Facebook, TikTok).",
  },
  functional: {
    title: "Functionale",
    desc: "Chatul magazinului. Fara ele, chatul porneste doar cand il deschizi tu.",
  },
};

export function CookieConsent({ slug, color, categories, position, policyHref, storeName, furnizoriMarketing, furnizorChat, googleAdsInainteDeAcord, marketingDoarGoogleAds }: {
  slug: string;
  color: string;
  categories: ConsentCategory[];
  position: CookieBannerPosition;
  policyHref: string | null;
  storeName: string;
  /**
   * Instrumentele de marketing pornite chiar in magazinul asta („Facebook, TikTok, theMarketer”). Lipsa lor
   * pastreaza textul de pana acum. ⚠ Omul isi da acordul pentru ce e scris aici, deci lista trebuie sa fie
   * cea adevarata, nu una generica.
   */
  furnizoriMarketing?: string[];
  /** Furnizorul chatului pornit in magazin („Tidio”), numit in categoria „Functionale”. */
  furnizorChat?: string;
  /**
   * Eticheta Google Ads porneste in magazinul asta si fara acord, cu semnalele refuzate (consent mode
   * avansat). ⚠ Se SPUNE in banner: omul nu trebuie lasat sa creada ca refuzul opreste orice legatura cu Google.
   */
  googleAdsInainteDeAcord?: boolean;
  /**
   * „Marketing” exista in magazin numai din cauza Google Ads. Cine a raspuns bannerului inainte ca Google Ads
   * sa fie o categorie n-a fost intrebat de marketing: e intrebat o data. Vezi `bannerDecis`.
   */
  marketingDoarGoogleAds?: boolean;
}) {
  /* Panoul e alb: culoarea magazinului prea deschisa (lime-ul temei Canopus, 1,28:1) nu se vede pe el. */
  const culoareIconita = (raportContrast(color, "#FFFFFF") ?? 3) < 3 ? "#374151" : color;
  const hasChoices = categories.length > 0;
  const [mounted, setMounted] = useState(false); // render nothing until storage is read (no SSR flash)
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [decided, setDecided] = useState(true);
  const [prefs, setPrefs] = useState<{ analytics: boolean; marketing: boolean; functional: boolean }>({ analytics: false, marketing: false, functional: false });

  /* Lista categoriilor ca text: aceeasi valoare la fiecare desenare, deci efectul de mai jos nu se reia degeaba. */
  const cheieCategorii = categories.join(",");

  // First visit → open banner. Reopen via the global settings event / reopen button.
  useEffect(() => {
    const existing = readConsent(slug);
    /* ⚠ Un acord dat doar chatului (cartonasul de la butonul de chat) nu e un raspuns la banner: bannerul
       se deschide in continuare, cu „Functionale” deja pornita. */
    if (existing) setPrefs({ analytics: existing.analytics, marketing: existing.marketing, functional: existing.functional });
    /* ⚠ Si cine a raspuns e intrebat o data de o categorie care nu i s-a aratat atunci. Vezi `bannerDecis`. */
    const aratate = cheieCategorii.split(",").filter(Boolean) as ConsentCategory[];
    if (bannerDecis(slug, { categorii: aratate, marketingDoarGoogleAds: marketingDoarGoogleAds === true })) {
      setDecided(true);
    } else {
      setDecided(false);
      setOpen(true);
    }
    setMounted(true);
  }, [slug, cheieCategorii, marketingDoarGoogleAds]);

  const reopen = useCallback(() => {
    const existing = readConsent(slug);
    if (existing) setPrefs({ analytics: existing.analytics, marketing: existing.marketing, functional: existing.functional });
    setShowDetails(hasChoices);
    setOpen(true);
  }, [slug, hasChoices]);

  useEffect(() => {
    const handler = () => reopen();
    window.addEventListener(OPEN_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
  }, [reopen]);

  const persist = (state: ConsentState) => {
    /* Cu lista categoriilor aratate: o categorie aparuta mai tarziu n-a fost refuzata, n-a fost intrebata. */
    writeConsent(slug, state, categories);
    setDecided(true);
    setOpen(false);
    setShowDetails(false);
  };

  const acceptAll = () => persist(CONSENT_ALL);
  const rejectAll = () => persist(CONSENT_NONE);
  const savePrefs = () => persist({ necessary: true, analytics: prefs.analytics, marketing: prefs.marketing, functional: prefs.functional });

  /*
   * Bara de jos isi anunta inaltimea prin `--banner-cookie`, pentru butonul de chat al magazinului (`ButonContact`),
   * care sta fix in coltul de jos. Fara asta, la prima vizita butonul ramanea SUB bara, cu o fasie de 13 px iesita
   * deasupra ei (masurat la 1280 px, 22.11.2026): nici nu se vedea, nici nu se putea apasa pana la raspuns, iar
   * acordul dat chiar la buton (cartonasul lui) n-avea cum sa fie cerut.
   *
   * ⚠ Numai la magazinele cu chat (`furnizorChat`): celelalte nu au cine sa citeasca variabila, deci nu primesc
   * nimic in plus. Cartonasele din colt si fereastra din centru acopera butonul cu totul: acolo intai se raspunde
   * bannerului, deci nu anunta nimic.
   */
  const bara = useRef<HTMLDivElement>(null);
  const baraDeschisa = mounted && open && hasChoices && position === "bottom-bar" && !showDetails;
  useEffect(() => {
    if (!furnizorChat || !baraDeschisa) return;
    const el = bara.current;
    if (!el) return;
    const radacina = document.documentElement;
    const anunta = () => radacina.style.setProperty("--banner-cookie", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    anunta();
    /* Textul barei se rupe altfel la fiecare latime, deci inaltimea se urmareste, nu se socoteste. */
    const observator = typeof ResizeObserver === "function" ? new ResizeObserver(anunta) : null;
    observator?.observe(el);
    return () => {
      observator?.disconnect();
      radacina.style.removeProperty("--banner-cookie");
    };
  }, [furnizorChat, baraDeschisa]);

  // Retragerea consimtamantului trebuie sa fie la fel de usoara ca acordarea lui,
  // dar nu printr-un buton care pluteste peste magazin tot timpul: legatura sta
  // in blocul legal din footer, unde o cauta oricine, si deschide acelasi panou
  // prin `OPEN_SETTINGS_EVENT`.
  if (!mounted) return null;
  if (!open) return null;

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
      <div role="region" aria-label="Cookie-uri" className={wrapperClass}>
        <div className={isBar
          ? "bg-white border-t border-black/10 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
          : "bg-white rounded-2xl border border-black/10 shadow-xl"}>
          <div className={isBar
            ? "max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            : "p-5"}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Cookie className="h-5 w-5 shrink-0 mt-0.5" style={{ color: culoareIconita }} />
              <p className="text-[13px] leading-relaxed text-gray-600">
                Folosim doar cookie-uri esentiale, necesare functionarii magazinului.{" "}
                {policyHref && <a href={policyHref} className="underline hover:text-gray-900">Afla mai mult</a>}
              </p>
            </div>
            <button type="button" onClick={() => persist(CONSENT_NONE)}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: color, color: contrastOn(color) }}>
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
      <div ref={bara} role="region" aria-label="Cookie-uri" className={wrapperClass}>
        <div className="bg-white border-t border-black/10 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Cookie className="h-5 w-5 shrink-0 mt-0.5" style={{ color: culoareIconita }} />
              <p className="text-[13px] leading-relaxed text-gray-600">
                Folosim cookie-uri pentru a imbunatati experienta pe {storeName}.{" "}
                {/*
                  Spus si aici, la primul nivel, nu doar in panoul de setari: cine apasa „Refuza” direct din bara
                  trebuie sa fi putut citi ca eticheta Google Ads se incarca oricum (gasit la recenzie, 25.11.2026).
                */}
                {googleAdsInainteDeAcord && <>{NOTA_GOOGLE_ADS}{" "}</>}
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
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: color, color: contrastOn(color) }}>
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
    <div role="region" aria-label="Cookie-uri" className={wrapperClass}>
      {/*
        ⚠ Cardul se deruleaza cand e mai inalt decat ecranul (25.11.2026). Cu patru categorii avea 609 px la 343 px
        latime, iar pe un telefon mic (667 px inaltime, mai putin cu barele browserului) capatul de sus iesea din
        ecran, fara nicio cale de a ajunge la el. `dvh`, nu `vh`: inaltimea care chiar se vede.
      */}
      <div className={`bg-white rounded-2xl border border-black/10 shadow-xl w-full ${isCenter ? "max-w-md" : ""} max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A` }}>
                <Cookie className="h-5 w-5" style={{ color: culoareIconita }} />
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
                desc={descriereMarketing(furnizoriMarketing, googleAdsInainteDeAcord)}
                checked={prefs.marketing}
                onChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
                color={color}
              />
            )}
            {categories.includes("functional") && (
              <ConsentRow
                title={CATEGORY_LABELS.functional.title}
                desc={descriereFunctionale(furnizorChat)}
                checked={prefs.functional}
                onChange={(v) => setPrefs((p) => ({ ...p, functional: v }))}
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
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: color, color: contrastOn(color) }}>
              Accepta tot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Textul categoriei „Marketing”, cu instrumentele pornite chiar in magazin. Fara lista, textul vechi.
 * theMarketer nu afiseaza reclame: personalizeaza emailurile si recomandarile, deci textul spune si asta.
 */
function descriereMarketing(furnizori?: string[], googleAdsInainteDeAcord?: boolean): string {
  const baza = !furnizori || furnizori.length === 0
    ? CATEGORY_LABELS.marketing.desc
    : `Permit reclame si mesaje personalizate (${furnizori.join(", ")}).`;
  return googleAdsInainteDeAcord ? `${baza} ${NOTA_GOOGLE_ADS}` : baza;
}

/**
 * Ce se intampla cu eticheta Google Ads si fara acord, spus pe sleau (25.11.2026). Text de vitrina, fara
 * diacritice.
 */
export const NOTA_GOOGLE_ADS =
  "Eticheta Google Ads se incarca si daca refuzi: trimite semnale tehnice, fara cookie-uri.";

/** Textul categoriei „Functionale”, cu furnizorul chatului pe nume: omul isi da acordul pentru ce citeste. */
function descriereFunctionale(furnizor?: string): string {
  if (!furnizor) return CATEGORY_LABELS.functional.desc;
  return `Chatul magazinului (${furnizor}). Fara ele, chatul porneste doar cand il deschizi tu.`;
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
