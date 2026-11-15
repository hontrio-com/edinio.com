"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, ChevronRight, KeyRound, Loader2, MapPin, Truck } from "lucide-react";
import {
  saveCargusConfig,
  disconnectCargus,
  loadCargusAccountAction,
} from "@/lib/actions/cargus.actions";
import type { CargusConfig, CargusPickupLocation, CargusPriceTable } from "@/lib/cargus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

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

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    username, password, subscriptionKey, selectedLocationId, selectedLocationName,
    selectedPriceTableId, selectedPriceTableName, repaymentType, declaredValue,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setSubscriptionKey(reper.subscriptionKey);
    setSelectedLocationId(reper.selectedLocationId); setSelectedLocationName(reper.selectedLocationName);
    setSelectedPriceTableId(reper.selectedPriceTableId); setSelectedPriceTableName(reper.selectedPriceTableName);
    setRepaymentType(reper.repaymentType); setDeclaredValue(reper.declaredValue);
  }

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && secretulEsteSalvat(initialConfig, "subscription_key"));

  async function handleLoadAccount() {
    if (!username.trim()) return toast.error("Completează username-ul.");
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) return toast.error("Completează parola.");
    if (!subscriptionKey.trim() && !secretulEsteSalvat(initialConfig, "subscription_key")) return toast.error("Completează Subscription Key.");

    setLoading(true);
    const result = await loadCargusAccountAction(businessId, username.trim(), password.trim(), subscriptionKey.trim());
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

    toast.success(`Cont Cargus conectat: ${result.locations.length} puncte de ridicare, ${result.priceTables.length} tarife.`);
    setStep("settings");
  }

  async function handleSave() {
    if (!selectedLocationId) return toast.error("Alege un punct de ridicare.");
    if (!selectedPriceTableId) return toast.error("Alege un tarif.");

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
      toast.success("Configurația Cargus a fost salvată.");
      setReper(valori);
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
      toast.success("Cargus a fost deconectat.");
      setStep("credentials");
      setLocations([]);
      setPriceTables([]);
      router.refresh();
    }
  }

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const cheieSalvata = secretulEsteSalvat(initialConfig, "subscription_key");
  const areContul = !!username.trim() && (!!password.trim() || parolaSalvata) && (!!subscriptionKey.trim() || cheieSalvata);
  const arataSetarile = step === "settings" || locations.length > 0;
  const stari: StareAntet[] = isActive ? [{ ton: "bun", text: "Activ" }] : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="cargus"
      titlu="Livrare"
      descriere="Generezi AWB-uri Cargus din comenzi, cu punctul de ridicare și tariful din contractul tău."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul Cargus", facut: areContul },
          { text: "Punctul de ridicare", facut: !!selectedLocationId },
          { text: "Tariful", facut: !!selectedPriceTableId },
          { text: "Cargus activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Punct de ridicare", valoare: initialConfig?.location_name || "-" },
            { eticheta: "Tarif", valoare: initialConfig?.price_table_name || "-" },
            { eticheta: "Rambursul", valoare: initialConfig?.repayment_type === "bank" ? "în cont" : "numerar" },
          ]} />
        )}
        <CumFunctioneaza id="cargus" puncte={[
          { Icon: KeyRound, text: "Te conectezi cu contul WebExpress și cu Subscription Key din portalul API Cargus." },
          { Icon: MapPin, text: "Alegi punctul de ridicare și tariful contractat; costul livrării se calculează pe loc, la comandă." },
          { Icon: Truck, text: "AWB-ul îl generezi din pagina comenzii." },
          { Icon: Banknote, text: "Rambursul îl primești în numerar sau în contul colector Cargus, după contract." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul Cargus" descriere="Datele contului WebExpress și cheia de acces la API.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username WebExpress" htmlFor="cargus-user" required>
            <Input id="cargus-user" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="utilizator.webexpress" />
          </Field>
          <Field label="Parola" htmlFor="cargus-parola" required>
            <Input
              id="cargus-parola"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : "Parola contului WebExpress"}
            />
          </Field>
        </div>
        <Field label="Subscription Key" htmlFor="cargus-cheie" required
          ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Subscription Key Cargus"
            text="În portalul Azure API Cargus: PRODUCTS, apoi StandardUrgentOnlineAPI, apoi Primary Key." />}>
          <Input
            id="cargus-cheie"
            type="text"
            value={subscriptionKey}
            onChange={e => setSubscriptionKey(e.target.value.trim())}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}
            className="font-mono"
          />
        </Field>
        <div>
          <Button onClick={handleLoadAccount} disabled={loading || !areContul}>
            {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {loading ? "Se conectează..." : "Conectează și încarcă datele"}
          </Button>
        </div>
      </Sectiune>

      {arataSetarile && (
        <Sectiune pas={2} titlu="Punct de ridicare și tarif" descriere="De unde ridică Cargus coletele și cu ce tarif se calculează livrarea.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      {loc.Name} · {loc.LocalityName}, {loc.CountyName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {initialConfig?.location_name || "Conectează contul ca să încarci punctele de ridicare"}
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
                  {initialConfig?.price_table_name || "Conectează contul ca să încarci tarifele"}
                </div>
              )}
            </Field>
          </div>

          <Field label="Returnarea rambursului" htmlFor="cargus-ramburs" hint="Cum îți returnează Cargus banii încasați ramburs de la clienți.">
            <select
              id="cargus-ramburs"
              value={repaymentType}
              onChange={e => setRepaymentType(e.target.value as "cash" | "bank")}
              className={selectCls}
            >
              <option value="cash">Numerar în plic (adus de curier)</option>
              <option value="bank">În cont bancar (cont colector Cargus)</option>
            </select>
          </Field>

          <RandComutator
            separat
            titlu="Asigurare (valoare declarată)"
            text="Fiecare AWB se asigură pentru valoarea produselor din comandă. Cargus percepe o primă de asigurare, conform contractului."
            activ={declaredValue}
            onChange={setDeclaredValue}
          />
        </Sectiune>
      )}

      {isActive && (
        <ZonaDeconectare descriere="Șterge configurarea Cargus din Edinio. AWB-urile deja emise rămân pe comenzi.">
          <ButonDeconectare
            nume="Cargus"
            cePierzi="Se șterge toată configurarea Cargus din Edinio: username, parolă, Subscription Key, punctul de ridicare și tariful ales. Ca să te întorci, le ceri din nou din contul tău Cargus; AWB-urile deja emise rămân pe comenzi."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      {arataSetarile && (
        <BaraSalvare
          modificat={isActive ? modificat : undefined}
          saving={saving}
          onSalveaza={handleSave}
          onRenunta={isActive ? renunta : undefined}
          textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
        />
      )}
    </PaginaIntegrare>
  );
}
