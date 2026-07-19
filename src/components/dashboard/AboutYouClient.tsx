"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import {
  connectAboutYou, disconnectAboutYou, saveAboutYouSettings,
  subscribeAboutYouWebhook, unsubscribeAboutYouWebhook,
  type AboutYouStatus,
} from "@/lib/actions/aboutyou.actions";

const PREREQUISITES = [
  "Cont About You Seller Center aprobat (contract + verificare). Integrarea folosește cheia ta API.",
  "Produse fashion/lifestyle cu brand aprobat pe About You.",
  "Cod EAN (GTIN) pentru fiecare mărime a produsului.",
  "Prețurile pe About You sunt în EUR (conversia din RON o facem automat).",
];

export function AboutYouClient({ businessId, status }: { businessId: string; status: AboutYouStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(status?.environment ?? "production");

  // Settings form (only used when connected).
  const [fxRate, setFxRate] = useState(status?.fxRate != null ? String(status.fxRate) : "");
  const [fxMargin, setFxMargin] = useState(status?.fxMarginPct != null ? String(status.fxMarginPct) : "");
  const [brandId, setBrandId] = useState(status?.brandId != null ? String(status.brandId) : "");
  const [shipCountries, setShipCountries] = useState((status?.shipCountries ?? []).join(", "));
  const [countryOfOrigin, setCountryOfOrigin] = useState(status?.defaultCountryOfOrigin ?? "RO");
  const [autoSync, setAutoSync] = useState(status?.autoSync ?? true);

  if (!status) {
    return <p className="text-sm text-red-600">Nu am putut încărca starea integrării. Reîncarcă pagina.</p>;
  }

  if (!status.globallyEnabled) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        Integrarea About You este momentan indisponibilă. Revino în curând.
      </div>
    );
  }

  const handleConnect = () => {
    if (apiKey.trim().length < 8) { toast.error("Introdu cheia API din Seller Center."); return; }
    startTransition(async () => {
      const res = await connectAboutYou(businessId, apiKey, environment);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont About You conectat.");
      setApiKey("");
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    if (!window.confirm("Sigur deconectezi About You? Listările locale se șterg (produsele rămân pe About You).")) return;
    startTransition(async () => {
      const res = await disconnectAboutYou(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont deconectat.");
      router.refresh();
    });
  };

  const handleSaveSettings = () => {
    const rate = fxRate.trim() === "" ? null : Number(fxRate);
    const margin = fxMargin.trim() === "" ? null : Number(fxMargin);
    if (rate != null && (!Number.isFinite(rate) || rate <= 0)) { toast.error("Cursul RON -> EUR trebuie să fie un număr pozitiv."); return; }
    if (margin != null && (!Number.isFinite(margin) || margin < 0)) { toast.error("Marja trebuie să fie un număr pozitiv."); return; }
    const bId = brandId.trim() === "" ? null : Number(brandId);
    if (bId != null && !Number.isInteger(bId)) { toast.error("ID-ul de brand trebuie să fie un număr întreg."); return; }
    const countries = shipCountries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

    startTransition(async () => {
      const res = await saveAboutYouSettings(businessId, {
        fx_rate: rate,
        fx_margin_pct: margin,
        brand_id: bId,
        ship_countries: countries,
        default_country_of_origin: countryOfOrigin.trim().toUpperCase() || "RO",
        auto_sync: autoSync,
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Setări salvate.");
      router.refresh();
    });
  };

  const toggleWebhook = () => {
    startTransition(async () => {
      const res = status.webhookActive
        ? await unsubscribeAboutYouWebhook(businessId)
        : await subscribeAboutYouWebhook(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(status.webhookActive ? "Notificări dezactivate." : "Notificări activate.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Prerequisites */}
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-900">Înainte de a începe</p>
        </div>
        <ul className="space-y-1.5">
          {PREREQUISITES.map((p) => (
            <li key={p} className="text-xs text-amber-900/90 flex gap-2">
              <span className="text-amber-600">•</span><span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {!status.connected ? (
        /* ── Connect form ── */
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Conectează contul About You</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Generează o cheie API în Seller Center: Settings {">"} API Keys {">"} + Add. Copiaz-o aici (se afișează o singură dată).
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mediu</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="production">Producție (date reale)</option>
                <option value="sandbox">Sandbox (testare)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Cheie API</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Lipește cheia API About You"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Se verifică..." : "Conectează și testează"}
            </button>
          </div>
        </div>
      ) : (
        /* ── Connected ── */
        <>
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-foreground">Cont conectat</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {status.environment === "sandbox" ? "Sandbox" : "Producție"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Cheie: <span className="font-mono">{status.apiKeyMasked}</span>
                  {status.sellerName ? ` · ${status.sellerName}` : ""}
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                Deconectează
              </button>
            </div>

            {status.needsReconnect && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                Sesiunea a expirat. Reconectează cheia API.
              </div>
            )}
            {status.readinessError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{status.readinessError}</span>
              </div>
            )}
            {status.ready && (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                Configurarea de bază este completă. Maparea produselor și listarea vin în pasul următor.
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Listări", value: status.counts.listings },
                { label: "Publicate", value: status.counts.published },
                { label: "Respinse", value: status.counts.rejected },
                { label: "În coadă", value: status.counts.queued },
              ].map((c) => (
                <div key={c.label} className="rounded-lg bg-muted/50 p-3 text-center">
                  <div className="text-lg font-semibold text-foreground">{c.value}</div>
                  <div className="text-[11px] text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold text-foreground mb-4">Setări</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Curs 1 EUR (în RON)</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={fxRate} onChange={(e) => setFxRate(e.target.value)}
                  placeholder="ex. 4.97"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {status.fxUpdatedAt && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Actualizat: {new Date(status.fxUpdatedAt).toLocaleDateString("ro-RO")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Marjă preț (%)</label>
                <input
                  type="number" step="0.1" min="0" inputMode="decimal"
                  value={fxMargin} onChange={(e) => setFxMargin(e.target.value)}
                  placeholder="ex. 5"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">ID brand About You</label>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={brandId} onChange={(e) => setBrandId(e.target.value)}
                  placeholder="selector cu branduri în pasul următor"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Țară de origine (ISO2)</label>
                <input
                  type="text" maxLength={2}
                  value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)}
                  placeholder="RO"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Țări de listare (coduri ISO2, separate prin virgulă)</label>
                <input
                  type="text"
                  value={shipCountries} onChange={(e) => setShipCountries(e.target.value)}
                  placeholder="ex. RO, DE, AT"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="rounded" />
              Sincronizează automat schimbările de produs, stoc și preț
            </label>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Notificări About You (stoc)</p>
                <p className="text-xs text-muted-foreground">
                  {status.webhookActive ? "Active — stocul se sincronizează în ambele sensuri." : "Inactive."}
                </p>
              </div>
              <button
                onClick={toggleWebhook}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                {status.webhookActive ? "Dezactivează" : "Activează"}
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={handleSaveSettings}
                disabled={pending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? "Se salvează..." : "Salvează setările"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Livrarea folosește curierii tăi din Edinio (dropshipping); tracking-ul se trimite automat către About You.
              Selectoarele cu branduri, categorii și curieri live vin în pasul următor.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
