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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { selectCls } from "@/lib/ui";

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
  const [repaymentType, setRepaymentType] = useState<"cash" | "bank">(initialConfig?.repayment_type ?? "cash");
  const [declaredValue, setDeclaredValue] = useState(initialConfig?.declared_value_enabled ?? false);

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

    // The sender county/locality feed the live ShippingCalculation quotes.
    const selectedLocation = locations.find((l) => Number(l.LocationId) === Number(selectedLocationId));
    const config: CargusConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      subscription_key: subscriptionKey.trim(),
      location_id: selectedLocationId,
      location_name: selectedLocationName,
      price_table_id: selectedPriceTableId,
      price_table_name: selectedPriceTableName,
      location_county: selectedLocation?.CountyName ?? initialConfig?.location_county,
      location_locality: selectedLocation?.LocalityName ?? initialConfig?.location_locality,
      repayment_type: repaymentType,
      declared_value_enabled: declaredValue,
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
        <Callout
          variant="success"
          icon={CheckCircle}
          title="Cargus activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          {initialConfig?.location_name} · {initialConfig?.price_table_name}
        </Callout>
      )}

      {/* Step 1: Credentials */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</span>
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont Cargus</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username Webexpress" required>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="utilizator.webexpress"
            />
          </Field>
          <Field label="Parola" required>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola contului webexpress"
            />
          </Field>
        </div>

        <Field
          label="Subscription Key"
          required
          hint="Gasesti cheia in portalul Azure API Cargus la PRODUCTS → StandardUrgentOnlineAPI → Primary Key"
        >
          <Input
            type="text"
            value={subscriptionKey}
            onChange={e => setSubscriptionKey(e.target.value.trim())}
            placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            className="font-mono"
          />
        </Field>

        <Button
          onClick={handleLoadAccount}
          disabled={loading || !username.trim() || !password.trim() || !subscriptionKey.trim()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {loading ? "Se conecteaza..." : "Conecteaza si incarca datele"}
        </Button>
      </Panel>

      {/* Step 2: Select location & price table */}
      {(step === "settings" || locations.length > 0) && (
        <Panel className="space-y-4 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">2</span>
            <h3 className="text-sm font-semibold text-foreground">Punct de ridicare si tarif</h3>
          </div>

          <Field label="Punct de ridicare expeditor" required>
            {locations.length > 0 ? (
              <select
                aria-label="Punct de ridicare expeditor"
                value={selectedLocationId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const loc = locations.find(l => l.LocationId === id);
                  setSelectedLocationId(id);
                  setSelectedLocationName(loc?.Name ?? "");
                }}
                className={selectCls}
              >
                {locations.map(loc => (
                  <option key={loc.LocationId} value={loc.LocationId}>
                    {loc.Name} — {loc.LocalityName}, {loc.CountyName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.location_name || "Conecteaza contul pentru a incarca punctele de ridicare"}
              </div>
            )}
          </Field>

          <Field label="Tarif contractat" required>
            {priceTables.length > 0 ? (
              <select
                aria-label="Tarif contractat"
                value={selectedPriceTableId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const pt = priceTables.find(p => p.PriceTableId === id);
                  setSelectedPriceTableId(id);
                  setSelectedPriceTableName(pt?.Name ?? "");
                }}
                className={selectCls}
              >
                {priceTables.map(pt => (
                  <option key={pt.PriceTableId} value={pt.PriceTableId}>
                    {pt.Name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.price_table_name || "Conecteaza contul pentru a incarca tarifele"}
              </div>
            )}
          </Field>

          <Field label="Returnarea rambursului">
            <select
              aria-label="Returnarea rambursului"
              value={repaymentType}
              onChange={e => setRepaymentType(e.target.value as "cash" | "bank")}
              className={selectCls}
            >
              <option value="cash">Numerar in plic (adus de curier)</option>
              <option value="bank">In cont bancar (cont colector Cargus)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Cum iti returneaza Cargus banii incasati ramburs de la clienti.
            </p>
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={declaredValue}
              onChange={e => setDeclaredValue(e.target.checked)}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Asigurare (valoare declarata).</span>{" "}
              Fiecare AWB se asigura pentru valoarea produselor din comanda. Cargus percepe o prima de asigurare conform contractului.
            </span>
          </label>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSave}
              disabled={saving || !selectedLocationId || !selectedPriceTableId}
            >
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Se salveaza..." : "Salveaza configuratia"}
            </Button>
          </div>
        </Panel>
      )}

      {/* How to get credentials */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Cum obtii credentialele Cargus?</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Creaza un cont pe portalul Azure API Cargus si asteapta aprobarea</li>
          <li>Mergi la <span className="font-semibold text-foreground">PRODUCTS → StandardUrgentOnlineAPI</span> si copiaza <span className="font-semibold text-foreground">Primary Key</span></li>
          <li>Foloseste credentialele contului tau Webexpress Cargus (username + parola)</li>
          <li>Apasa &quot;Conecteaza&quot; si selecteaza punctul de ridicare si tarifele</li>
        </ol>
        <a
          href="https://urgentcargus.portal.azure-api.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide portalul Azure API Cargus
        </a>
      </div>
    </div>
  );
}
