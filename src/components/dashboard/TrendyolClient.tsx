"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import {
  connectTrendyol, disconnectTrendyol, getTrendyolAddresses, saveTrendyolSettings,
  subscribeTrendyolWebhook, unsubscribeTrendyolWebhook,
  type TrendyolStatus,
} from "@/lib/actions/trendyol.actions";
import { TRENDYOL_CARGO_PROVIDERS, type TrendyolSupplierAddress } from "@/lib/trendyol/types";

const PREREQUISITES = [
  "Cont Trendyol seller aprobat + credențiale (SupplierID, API Key, API Secret) din panoul Trendyol > Integrare.",
  "Produse cu barcode (EAN) pentru fiecare variantă și brand aprobat pe Trendyol.",
  "Categorie leaf (fără subcategorii) + atributele obligatorii ale categoriei.",
  "Livrarea folosește curierul contractat Trendyol (nu curierul tău din Edinio).",
];

export function TrendyolClient({ businessId, status }: { businessId: string; status: TrendyolStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState(status?.supplierId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [environment, setEnvironment] = useState<"stage" | "production">(status?.environment ?? "production");

  const [shipmentAddressId, setShipmentAddressId] = useState(status?.shipmentAddressId != null ? String(status.shipmentAddressId) : "");
  const [returningAddressId, setReturningAddressId] = useState(status?.returningAddressId != null ? String(status.returningAddressId) : "");
  const [cargoCompanyId, setCargoCompanyId] = useState(status?.defaultCargoCompanyId != null ? String(status.defaultCargoCompanyId) : "");
  const [autoSync, setAutoSync] = useState(status?.autoSync ?? true);
  const [addresses, setAddresses] = useState<TrendyolSupplierAddress[]>([]);

  useEffect(() => {
    if (!status?.connected) return;
    let alive = true;
    (async () => {
      const res = await getTrendyolAddresses(businessId);
      if (alive && !("error" in res)) setAddresses(res.addresses);
    })();
    return () => { alive = false; };
  }, [businessId, status?.connected]);

  if (!status) {
    return <p className="text-sm text-red-600">Nu am putut încărca starea integrării. Reîncarcă pagina.</p>;
  }

  if (!status.globallyEnabled) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        Integrarea Trendyol este momentan indisponibilă. Revino în curând.
      </div>
    );
  }

  const handleConnect = () => {
    if (!supplierId.trim() || !apiKey.trim() || apiSecret.trim().length < 8) {
      toast.error("Completează SupplierID, API Key și API Secret.");
      return;
    }
    startTransition(async () => {
      const res = await connectTrendyol(businessId, {
        supplierId: supplierId.trim(), apiKey, apiSecret, environment,
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont Trendyol conectat.");
      setApiKey(""); setApiSecret("");
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    if (!window.confirm("Sigur deconectezi Trendyol? Listările locale se șterg (produsele rămân pe Trendyol).")) return;
    startTransition(async () => {
      const res = await disconnectTrendyol(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont deconectat.");
      router.refresh();
    });
  };

  const handleSaveSettings = () => {
    const nOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
    const ship = nOrNull(shipmentAddressId);
    const ret = nOrNull(returningAddressId);
    const cargo = nOrNull(cargoCompanyId);
    for (const [v, label] of [[ship, "adresa de expediere"], [ret, "adresa de retur"], [cargo, "compania de curierat"]] as const) {
      if (v != null && (!Number.isInteger(v) || v <= 0)) { toast.error(`ID invalid pentru ${label}.`); return; }
    }
    startTransition(async () => {
      const res = await saveTrendyolSettings(businessId, {
        shipment_address_id: ship, returning_address_id: ret, default_cargo_company_id: cargo, auto_sync: autoSync,
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Setări salvate.");
      router.refresh();
    });
  };

  const handleSubscribeWebhook = () => {
    startTransition(async () => {
      const res = await subscribeTrendyolWebhook(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Webhook comenzi activat.");
      router.refresh();
    });
  };

  const handleUnsubscribeWebhook = () => {
    startTransition(async () => {
      const res = await unsubscribeTrendyolWebhook(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Webhook dezactivat.");
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
          <h2 className="text-base font-semibold text-foreground mb-1">Conectează contul Trendyol</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Găsești SupplierID, API Key și API Secret în contul tău de vânzător Trendyol, la secțiunea de integrare (Integrare / API).
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">SupplierID</label>
                <input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="ex. 123456"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mediu</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value as "stage" | "production")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="production">Producție</option>
                  <option value="stage">Stage (testare)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off"
                placeholder="Cheia API" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">API Secret</label>
              <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off"
                placeholder="Cheia secretă API" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
            </div>
            <button onClick={handleConnect} disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
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
                    {status.environment === "stage" ? "Stage" : "Producție"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Seller: <span className="font-mono">{status.supplierId}</span> · Cheie: <span className="font-mono">{status.apiKeyMasked}</span> · {status.currency}
                </p>
              </div>
              <button onClick={handleDisconnect} disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
                Deconectează
              </button>
            </div>

            {status.needsReconnect && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                Sesiunea a expirat. Reconectează credențialele.
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
                { label: "Aprobate", value: status.counts.approved },
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Adresă expediere</label>
                {addresses.length > 0 ? (
                  <select value={shipmentAddressId} onChange={(e) => setShipmentAddressId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="">Alege adresa</option>
                    {addresses.filter((a) => a.isShipmentAddress || a.addressType === "Shipment").map((a) => (
                      <option key={a.id} value={a.id}>{a.fullAddress || a.city || `#${a.id}`}</option>
                    ))}
                  </select>
                ) : (
                  <input type="number" min="0" inputMode="numeric" value={shipmentAddressId} onChange={(e) => setShipmentAddressId(e.target.value)}
                    placeholder="ID adresă" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Adresă retur</label>
                {addresses.length > 0 ? (
                  <select value={returningAddressId} onChange={(e) => setReturningAddressId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="">Alege adresa</option>
                    {addresses.filter((a) => a.isReturningAddress || a.addressType === "Returning").map((a) => (
                      <option key={a.id} value={a.id}>{a.fullAddress || a.city || `#${a.id}`}</option>
                    ))}
                  </select>
                ) : (
                  <input type="number" min="0" inputMode="numeric" value={returningAddressId} onChange={(e) => setReturningAddressId(e.target.value)}
                    placeholder="ID adresă" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Companie curierat</label>
                <select value={cargoCompanyId} onChange={(e) => setCargoCompanyId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Alege curierul</option>
                  {TRENDYOL_CARGO_PROVIDERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Adresele se încarcă din contul tău Trendyol. Curierul trebuie să fie cel contractat de tine.</p>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="rounded" />
              Sincronizează automat schimbările de produs, stoc și preț
            </label>

            <div className="mt-4">
              <button onClick={handleSaveSettings} disabled={pending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                {pending ? "Se salvează..." : "Salvează setările"}
              </button>
            </div>
          </div>

          {/* Comenzi & webhook */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">Comenzi Trendyol</h2>
                <p className="text-sm text-muted-foreground">
                  Comenzile intră automat în „Comenzi”. Activează webhook-ul pentru livrare instant; altfel sincronizarea are loc periodic.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {status.counts.orders} comenzi importate
                  {status.ordersSyncedAt ? ` · ultima sincronizare ${new Date(status.ordersSyncedAt).toLocaleString("ro-RO")}` : ""}
                </p>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${status.webhookActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                {status.webhookActive ? "Webhook activ" : "Webhook inactiv"}
              </span>
            </div>
            <div className="mt-3">
              {status.webhookActive ? (
                <button onClick={handleUnsubscribeWebhook} disabled={pending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
                  {pending ? "Se procesează..." : "Dezactivează webhook"}
                </button>
              ) : (
                <button onClick={handleSubscribeWebhook} disabled={pending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                  {pending ? "Se activează..." : "Activează webhook comenzi"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
