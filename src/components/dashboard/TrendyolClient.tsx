"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import {
  connectTrendyol, disconnectTrendyol, getTrendyolAddresses, saveTrendyolSettings,
  subscribeTrendyolWebhook, unsubscribeTrendyolWebhook,
  type TrendyolStatus,
} from "@/lib/actions/trendyol.actions";
import {
  TRENDYOL_STOREFRONTS, curieriVitrina, esteAdresaDe, infoVitrina,
  type TrendyolStoreFront, type TrendyolSupplierAddress,
} from "@/lib/trendyol/types";

const PREREQUISITES = [
  "Cont Trendyol de vânzător aprobat, cu procesul de înregistrare finalizat.",
  "Cele trei credențiale din panoul Trendyol: Seller ID, API Key și API Secret (Informații cont > Detalii integrare).",
  "Produse cu barcode (EAN) pentru fiecare variantă și brand existent în catalogul Trendyol.",
  "Categorie leaf (fără subcategorii) + atributele obligatorii ale categoriei.",
];

type Actiune = null | "conectare" | "deconectare" | "setari" | "webhook";

export function TrendyolClient({ businessId, status }: { businessId: string; status: TrendyolStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Care buton a pornit tranzitia. `useTransition` da un singur `pending` pe toata
  // componenta, deci fara asta salvarea setarilor punea spinner si pe butonul de
  // webhook, de parca s-ar fi intamplat doua lucruri deodata.
  const [actiune, setActiune] = useState<Actiune>(null);
  const ruleaza = (a: Actiune) => pending && actiune === a;

  const [supplierId, setSupplierId] = useState(status?.supplierId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [environment, setEnvironment] = useState<"stage" | "production">(status?.environment ?? "production");
  const [storefront, setStorefront] = useState<TrendyolStoreFront>(status?.storefront ?? "RO");

  const [shipmentAddressId, setShipmentAddressId] = useState(status?.shipmentAddressId != null ? String(status.shipmentAddressId) : "");
  const [returningAddressId, setReturningAddressId] = useState(status?.returningAddressId != null ? String(status.returningAddressId) : "");
  const [carrierCode, setCarrierCode] = useState(status?.defaultCarrierCode ?? "");
  const [autoSync, setAutoSync] = useState(status?.autoSync ?? true);
  const [autoPublish, setAutoPublish] = useState(status?.autoPublish ?? false);
  const [addresses, setAddresses] = useState<TrendyolSupplierAddress[]>([]);
  // Eticheta si butonul de webhook se schimba instant; actiunea reuseste sau nu,
  // nu are alt rezultat de aratat. La eroare React readuce singur starea reala.
  const [webhookActiv, aplicaWebhook] = useOptimistic(status?.webhookActive ?? false, (_stare, nou: boolean) => nou);

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

  const curieri = curieriVitrina(status.storefront);
  const vitrinaAleasa = infoVitrina(storefront);

  const handleConnect = () => {
    if (!supplierId.trim() || !apiKey.trim() || apiSecret.trim().length < 8) {
      toast.error("Completează Seller ID, API Key și API Secret.");
      return;
    }
    setActiune("conectare");
    startTransition(async () => {
      const res = await connectTrendyol(businessId, {
        supplierId: supplierId.trim(), apiKey, apiSecret, environment, storefront,
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont Trendyol conectat.");
      setApiKey(""); setApiSecret("");
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    if (!window.confirm("Sigur deconectezi Trendyol? Listările locale se șterg (produsele rămân pe Trendyol).")) return;
    setActiune("deconectare");
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
    for (const [v, label] of [[ship, "adresa de expediere"], [ret, "adresa de retur"]] as const) {
      if (v != null && (!Number.isInteger(v) || v <= 0)) { toast.error(`ID invalid pentru ${label}.`); return; }
    }
    setActiune("setari");
    startTransition(async () => {
      const res = await saveTrendyolSettings(businessId, {
        shipment_address_id: ship, returning_address_id: ret,
        default_carrier_code: carrierCode.trim() === "" ? null : carrierCode,
        auto_sync: autoSync,
        // Publicarea automata nu are sens fara sincronizare: fara ea nimic nu
        // ajunge in coada, deci nici produsele noi.
        auto_publish: autoSync && autoPublish,
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Setări salvate.");
      router.refresh();
    });
  };

  const handleSubscribeWebhook = () => {
    setActiune("webhook");
    startTransition(async () => {
      aplicaWebhook(true);
      const res = await subscribeTrendyolWebhook(businessId);
      // La eroare NU dam refresh: React face singur revenirea la starea reala.
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Webhook comenzi activat.");
      router.refresh();
    });
  };

  const handleUnsubscribeWebhook = () => {
    setActiune("webhook");
    startTransition(async () => {
      aplicaWebhook(false);
      const res = await unsubscribeTrendyolWebhook(businessId);
      // La eroare NU dam refresh: React face singur revenirea la starea reala.
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
            În panoul Trendyol mergi la <span className="font-medium text-foreground">Informații cont &gt; Detalii integrare</span> (vizibil
            doar utilizatorului principal al contului). Ai nevoie de exact trei valori: Seller ID, API Key și API Secret.
          </p>
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground mb-4">
            Vei mai vedea acolo un <span className="font-medium text-foreground">cod de referință al integrării</span> și
            un <span className="font-medium text-foreground">token</span>. Nu îți trebuie aici: codul de referință se folosește doar când
            deschizi un tichet la suportul Trendyol.
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Seller ID</label>
                <input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="ex. 123456"
                  inputMode="numeric" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <p className="text-[11px] text-muted-foreground mt-1">Doar cifre.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Țara magazinului</label>
                <select value={storefront} onChange={(e) => setStorefront(e.target.value as TrendyolStoreFront)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {TRENDYOL_STOREFRONTS.map((s) => <option key={s.code} value={s.code}>{s.tara}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Prețurile vor fi citite de Trendyol în {vitrinaAleasa.moneda}.
                </p>
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
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mediu</label>
              <select value={environment} onChange={(e) => setEnvironment(e.target.value as "stage" | "production")}
                className="w-full sm:w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="production">Producție</option>
                <option value="stage">Stage (testare)</option>
              </select>
              {environment === "stage" && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Stage-ul are chei separate și cere ca Trendyol să autorizeze IP-ul serverului nostru. Dacă nu ai cerut asta, folosește Producție.
                </p>
              )}
            </div>
            <button onClick={handleConnect} disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
              {ruleaza("conectare") ? "Se verifică..." : "Conectează și testează"}
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
                  Seller: <span className="font-mono">{status.supplierId}</span> · Cheie: <span className="font-mono">{status.apiKeyMasked}</span> · {status.storefrontLabel} ({status.currency})
                </p>
              </div>
              <button onClick={handleDisconnect} disabled={ruleaza("deconectare")}
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
            {status.currency !== "RON" && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Prețurile din Edinio sunt în lei, dar vitrina {status.storefrontLabel} le citește
                  ca {status.currency}. Setează manual prețurile de vânzare pe fiecare listare înainte de a trimite produse.
                </span>
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
                    <option value="">Implicită din contul Trendyol</option>
                    {addresses.filter((a) => esteAdresaDe(a, "Shipment")).map((a) => (
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
                    <option value="">Implicită din contul Trendyol</option>
                    {addresses.filter((a) => esteAdresaDe(a, "Returning")).map((a) => (
                      <option key={a.id} value={a.id}>{a.fullAddress || a.city || `#${a.id}`}</option>
                    ))}
                  </select>
                ) : (
                  <input type="number" min="0" inputMode="numeric" value={returningAddressId} onChange={(e) => setReturningAddressId(e.target.value)}
                    placeholder="ID adresă" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Curier implicit</label>
                <select value={carrierCode} onChange={(e) => setCarrierCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Fără curier implicit</option>
                  {curieri.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}{c.platesteVanzatorul ? " (plătit de tine)" : " (plătit de Trendyol)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Adresele se încarcă din contul tău Trendyol; lăsate goale, se folosesc cele implicite de acolo. Curierii
              „plătiți de Trendyol” își completează singuri AWB-ul; la cei plătiți de tine, trimiți tu numărul AWB din pagina comenzii.
            </p>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="rounded" />
              Sincronizează automat schimbările de produs, stoc și preț
            </label>

            <label className="mt-3 flex items-start gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox" checked={autoPublish}
                onChange={(e) => setAutoPublish(e.target.checked)}
                disabled={!autoSync}
                className="rounded mt-0.5 disabled:opacity-50"
              />
              <span>
                Publicare automată
                <span className="block text-[11px] text-muted-foreground">
                  Fiecare produs nou din magazin pleacă singur pe Trendyol, folosind categoria mapată și brandul ei.
                  Produsele cu categoria nemapată rămân pe loc și îți apar ca eroare aici.
                </span>
              </span>
            </label>

            <div className="mt-4">
              <button onClick={handleSaveSettings} disabled={pending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                {ruleaza("setari") ? "Se salvează..." : "Salvează setările"}
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
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${webhookActiv ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                {webhookActiv ? "Webhook activ" : "Webhook inactiv"}
              </span>
            </div>
            <div className="mt-3">
              {webhookActiv ? (
                <button onClick={handleUnsubscribeWebhook} disabled={pending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
                  {ruleaza("webhook") ? "Se procesează..." : "Dezactivează webhook"}
                </button>
              ) : (
                <button onClick={handleSubscribeWebhook} disabled={pending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                  {ruleaza("webhook") ? "Se activează..." : "Activează webhook comenzi"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
