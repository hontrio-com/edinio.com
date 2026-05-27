"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ChevronRight, ExternalLink } from "lucide-react";
import {
  saveCargusConfig,
  disconnectCargus,
  loadCargusAccountAction,
} from "@/lib/actions/cargus.actions";
import type { CargusConfig, CargusPickupLocation, CargusPriceTable } from "@/lib/cargus";

type Step = "credentials" | "settings";

export function CargusConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: CargusConfig | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialConfig?.enabled ? "settings" : "credentials");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState(initialConfig?.password ?? "");
  const [subscriptionKey, setSubscriptionKey] = useState(initialConfig?.subscription_key ?? "");

  const [locations, setLocations] = useState<CargusPickupLocation[]>([]);
  const [priceTables, setPriceTables] = useState<CargusPriceTable[]>([]);

  const [selectedLocationId, setSelectedLocationId] = useState<number>(initialConfig?.location_id ?? 0);
  const [selectedLocationName, setSelectedLocationName] = useState(initialConfig?.location_name ?? "");
  const [selectedPriceTableId, setSelectedPriceTableId] = useState<number>(initialConfig?.price_table_id ?? 0);
  const [selectedPriceTableName, setSelectedPriceTableName] = useState(initialConfig?.price_table_name ?? "");

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.subscription_key);

  async function handleLoadAccount() {
    if (!username.trim()) return toast.error("Completeaza username-ul");
    if (!password.trim()) return toast.error("Completeaza parola");
    if (!subscriptionKey.trim()) return toast.error("Completeaza Subscription Key");

    setLoading(true);
    const result = await loadCargusAccountAction(username.trim(), password.trim(), subscriptionKey.trim());
    setLoading(false);

    if ("error" in result) {
      toast.error(`Eroare Cargus: ${result.error}`);
      return;
    }

    setLocations(result.locations);
    setPriceTables(result.priceTables);

    // Pre-select first options
    if (result.locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(result.locations[0].LocationId);
      setSelectedLocationName(result.locations[0].Name);
    }
    if (result.priceTables.length > 0 && !selectedPriceTableId) {
      setSelectedPriceTableId(result.priceTables[0].PriceTableId);
      setSelectedPriceTableName(result.priceTables[0].Name);
    }

    toast.success(`Cont Cargus conectat — ${result.locations.length} puncte de ridicare, ${result.priceTables.length} tarife`);
    setStep("settings");
  }

  async function handleSave() {
    if (!selectedLocationId) return toast.error("Selecteaza un punct de ridicare");
    if (!selectedPriceTableId) return toast.error("Selecteaza un tarif");

    const config: CargusConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      subscription_key: subscriptionKey.trim(),
      location_id: selectedLocationId,
      location_name: selectedLocationName,
      price_table_id: selectedPriceTableId,
      price_table_name: selectedPriceTableName,
    };

    setSaving(true);
    const result = await saveCargusConfig(businessId, config);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configuratie Cargus salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectCargus(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Cargus deconectat");
      setStep("credentials");
      setLocations([]);
      setPriceTables([]);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      {isActive && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Cargus activ</p>
            <p className="text-xs text-green-700 truncate">
              {initialConfig?.location_name} · {initialConfig?.price_table_name}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
            Deconecteaza
          </button>
        </div>
      )}

      {/* Step 1: Credentials */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">1</span>
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont Cargus</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username Webexpress *</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="utilizator.webexpress"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Parola *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola contului webexpress"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Subscription Key *</label>
          <input
            type="text"
            value={subscriptionKey}
            onChange={e => setSubscriptionKey(e.target.value.trim())}
            placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Gasesti cheia in portalul Azure API Cargus la PRODUCTS → StandardUrgentOnlineAPI → Primary Key
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadAccount}
          disabled={loading || !username.trim() || !password.trim() || !subscriptionKey.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {loading ? "Se conecteaza..." : "Conecteaza si incarca datele"}
        </button>
      </div>

      {/* Step 2: Select location & price table */}
      {(step === "settings" || locations.length > 0) && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">2</span>
            <h3 className="text-sm font-semibold text-foreground">Punct de ridicare si tarif</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Punct de ridicare expeditor *</label>
            {locations.length > 0 ? (
              <select
                value={selectedLocationId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const loc = locations.find(l => l.LocationId === id);
                  setSelectedLocationId(id);
                  setSelectedLocationName(loc?.Name ?? "");
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {locations.map(loc => (
                  <option key={loc.LocationId} value={loc.LocationId}>
                    {loc.Name} — {loc.LocalityName}, {loc.CountyName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted/30 text-muted-foreground">
                {initialConfig?.location_name || "Conecteaza contul pentru a incarca punctele de ridicare"}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarif contractat *</label>
            {priceTables.length > 0 ? (
              <select
                value={selectedPriceTableId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const pt = priceTables.find(p => p.PriceTableId === id);
                  setSelectedPriceTableId(id);
                  setSelectedPriceTableName(pt?.Name ?? "");
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {priceTables.map(pt => (
                  <option key={pt.PriceTableId} value={pt.PriceTableId}>
                    {pt.Name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted/30 text-muted-foreground">
                {initialConfig?.price_table_name || "Conecteaza contul pentru a incarca tarifele"}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedLocationId || !selectedPriceTableId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Se salveaza..." : "Salveaza configuratia"}
            </button>
          </div>
        </div>
      )}

      {/* How to get credentials */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-semibold text-foreground mb-2">Cum obtii credentialele Cargus?</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Creaza un cont pe portalul Azure API Cargus si asteapta aprobarea</li>
          <li>Mergi la <span className="font-semibold text-foreground">PRODUCTS → StandardUrgentOnlineAPI</span> si copiaza <span className="font-semibold text-foreground">Primary Key</span></li>
          <li>Foloseste credentialele contului tau Webexpress Cargus (username + parola)</li>
          <li>Apasa &quot;Conecteaza&quot; si selecteaza punctul de ridicare si tarifele</li>
        </ol>
        <a
          href="https://urgentcargus.portal.azure-api.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide portalul Azure API Cargus
        </a>
      </div>
    </div>
  );
}
