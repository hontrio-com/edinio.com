"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import {
  Save, Loader2, Wifi, WifiOff,
  Building2, User, Phone, Mail, MapPin, Home, CreditCard, Info,
} from "lucide-react";
import { saveWootConfig, disconnectWoot, testWootConnection } from "@/lib/actions/woot.actions";
import type { WootConfig, WootCounty, WootCity } from "@/lib/woot";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { selectCls } from "@/lib/ui";

const DEFAULT_CONFIG: WootConfig = {
  enabled: false,
  public_key: "",
  secret_key: "",
  sender: {
    company: 1,
    company_name: "",
    contact: "",
    phone: "",
    email: "",
    country_id: 189,
    county_id: 0,
    city_id: 0,
    address: "",
    zipcode: "",
  },
};

interface TestResult {
  ok: boolean;
  name?: string;
  email?: string;
  credit?: number;
  message?: string;
}

export default function WootConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: WootConfig | null;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<WootConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
    sender: { ...DEFAULT_CONFIG.sender, ...initialConfig?.sender },
  });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [counties, setCounties] = useState<WootCounty[]>([]);
  const [cities, setCities] = useState<WootCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  const isConnected = !!initialConfig?.enabled && !!initialConfig?.public_key;

  // Load counties on mount
  useEffect(() => {
    fetch("/api/woot/counties")
      .then(r => r.json())
      .then((data: WootCounty[]) => setCounties(data))
      .catch(() => {});
  }, []);

  // Load cities when county changes
  useEffect(() => {
    if (!cfg.sender.county_id) { setCities([]); return; }
    setLoadingCities(true);
    fetch(`/api/woot/cities?county_id=${cfg.sender.county_id}`)
      .then(r => r.json())
      .then((data: WootCity[]) => { setCities(data); setLoadingCities(false); })
      .catch(() => setLoadingCities(false));
  }, [cfg.sender.county_id]);

  function set<K extends keyof WootConfig>(key: K, value: WootConfig[K]) {
    setCfg(c => ({ ...c, [key]: value }));
  }

  function setSender<K extends keyof WootConfig["sender"]>(key: K, value: WootConfig["sender"][K]) {
    setCfg(c => ({ ...c, sender: { ...c.sender, [key]: value } }));
  }

  async function handleTest() {
    if (!cfg.public_key.trim() || !cfg.secret_key.trim()) {
      toast.error("Introdu Public Key si Secret Key inainte de testare.");
      return;
    }
    // Save first so server action can read config
    await new Promise<void>(resolve => {
      startSave(async () => {
        await saveWootConfig(businessId, cfg);
        resolve();
      });
    });
    setTesting(true);
    setTestResult(null);
    const result = await testWootConnection(businessId);
    setTesting(false);
    if (result.success) {
      setTestResult({ ok: true, name: result.name, email: result.email, credit: result.credit });
    } else {
      setTestResult({ ok: false, message: result.error });
    }
  }

  function handleSave() {
    if (!cfg.public_key.trim() || !cfg.secret_key.trim()) {
      toast.error("Public Key si Secret Key sunt obligatorii.");
      return;
    }
    if (cfg.enabled) {
      if (!cfg.sender.contact.trim() || !cfg.sender.phone.trim() || !cfg.sender.email.trim()) {
        toast.error("Completeaza datele expeditorului (contact, telefon, email).");
        return;
      }
      if (!cfg.sender.city_id || !cfg.sender.address.trim()) {
        toast.error("Selecteaza orasul si introdu adresa expeditorului.");
        return;
      }
    }
    startSave(async () => {
      const result = await saveWootConfig(businessId, cfg);
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configuratia Woot a fost salvata.");
      router.refresh();
    });
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      const result = await disconnectWoot(businessId);
      if (!result.success) { toast.error(result.error ?? "Eroare"); return; }
      toast.success("Woot deconectat.");
      setCfg(DEFAULT_CONFIG);
      setTestResult(null);
      router.refresh();
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="woot" description="Genereaza AWB-uri Woot direct din comenzile magazinului tau." />

      <div className="space-y-5">
        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Woot.ro iti permite sa compari preturi intre toti curierii (Fan Courier, DPD, Cargus, Sameday, GLS si altii) si sa creezi AWB-uri direct din comenzile tale. Ai nevoie de un cont pe woot.ro.
          </p>
        </div>

        {/* Ghid */}
        <Panel className="overflow-hidden">
          <PanelHeader>
            <PanelTitle>Cum te conectezi?</PanelTitle>
          </PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              { step: "1", title: "Creeaza un cont Woot.ro", desc: "Mergi pe woot.ro si inregistreaza-te sau logheaza-te." },
              { step: "2", title: "Obtine cheile API", desc: "In contul Woot, mergi la Setari → API → genereaza Public Key si Secret Key." },
              { step: "3", title: "Introdu cheile si testeaza", desc: "Lipeste cheile mai jos si apasa Testeaza conexiunea pentru a verifica." },
              { step: "4", title: "Configureaza adresa expeditor", desc: "Completeaza datele firmei tale (adresa de unde se ridica coletele)." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* API Keys card */}
        <Panel className="space-y-5 p-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza Woot</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Afiseaza butonul &quot;Creeaza AWB&quot; in pagina comenzilor</p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={v => set("enabled", v)} />
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />Public Key
              </label>
              <Input type="text" value={cfg.public_key} onChange={e => set("public_key", e.target.value)}
                placeholder="32 caractere" />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />Secret Key
              </label>
              <Input type="password" value={cfg.secret_key} onChange={e => set("secret_key", e.target.value)}
                placeholder="32 caractere" />
            </div>

            {/* Test connection */}
            <div>
              <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
                {testing || saving
                  ? <Loader2 className="animate-spin" />
                  : testResult?.ok ? <Wifi className="text-success" /> : <WifiOff className="text-muted-foreground" />}
                Testeaza conexiunea
              </Button>

              {testResult && (
                <div className={cn(
                  "mt-3 rounded-lg border p-3 text-xs",
                  testResult.ok
                    ? "border-success/20 bg-success/5 text-success"
                    : "border-destructive/20 bg-destructive/5 text-destructive"
                )}>
                  {testResult.ok ? (
                    <div className="space-y-0.5">
                      <p className="font-semibold">Conexiune reusita!</p>
                      <p>{testResult.name} — {testResult.email}</p>
                      <p>Credit disponibil: <strong>{testResult.credit?.toFixed(2)} RON</strong></p>
                    </div>
                  ) : (
                    <p>{testResult.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Sender address card */}
        <Panel className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Adresa expeditor implicit</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Adresa de unde se ridica coletele (firma ta)</p>
          </div>

          {/* Company type */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSender("company", 1)}
              className={cn("flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all",
                cfg.sender.company === 1 ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground")}>
              <Building2 className="h-4 w-4" />Firma
            </button>
            <button type="button" onClick={() => setSender("company", 0)}
              className={cn("flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all",
                cfg.sender.company === 0 ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground")}>
              <User className="h-4 w-4" />Persoana fizica
            </button>
          </div>

          {cfg.sender.company === 1 && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />Nume firma
              </label>
              <Input type="text" value={cfg.sender.company_name ?? ""} onChange={e => setSender("company_name", e.target.value)}
                placeholder="S.C. Firma S.R.L." />
            </div>
          )}

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <User className="h-3.5 w-3.5 text-muted-foreground" />Persoana de contact
            </label>
            <Input type="text" value={cfg.sender.contact} onChange={e => setSender("contact", e.target.value)}
              placeholder="Prenume Nume" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />Telefon
              </label>
              <Input type="tel" value={cfg.sender.phone} onChange={e => setSender("phone", e.target.value)}
                placeholder="+40721000000" />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />Email
              </label>
              <Input type="email" value={cfg.sender.email} onChange={e => setSender("email", e.target.value)}
                placeholder="firma@email.ro" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />Judet
              </label>
              <select
                aria-label="Judet"
                value={cfg.sender.county_id || ""}
                onChange={e => {
                  setSender("county_id", Number(e.target.value));
                  setSender("city_id", 0);
                }}
                className={selectCls}
              >
                <option value="">Selecteaza judetul</option>
                {counties.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />Oras
              </label>
              <select
                aria-label="Oras"
                value={cfg.sender.city_id || ""}
                onChange={e => setSender("city_id", Number(e.target.value))}
                disabled={!cfg.sender.county_id || loadingCities}
                className={selectCls}
              >
                <option value="">
                  {loadingCities ? "Se incarca..." : "Selecteaza orasul"}
                </option>
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Home className="h-3.5 w-3.5 text-muted-foreground" />Adresa
            </label>
            <Input type="text" value={cfg.sender.address} onChange={e => setSender("address", e.target.value)}
              placeholder="Strada, nr., etc." />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              Cod postal (optional)
            </label>
            <Input type="text" value={cfg.sender.zipcode ?? ""} onChange={e => setSender("zipcode", e.target.value)}
              placeholder="000000" className="max-w-40" />
          </div>

        </Panel>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Salveaza
          </Button>
          {isConnected && (
            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="animate-spin" />}
              Deconecteaza
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
