"use client";

import { useState, useEffect, useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Building2, CreditCard, Home, Loader2, Mail, MapPin, Phone, Truck, User, UserPlus, Wifi, WifiOff,
} from "lucide-react";
import { saveWootConfig, disconnectWoot, testWootConnection } from "@/lib/actions/woot.actions";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import type { WootConfig, WootCounty, WootCity } from "@/lib/woot";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare, useFormularIntegrare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
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
  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<WootConfig>({
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

  const isConnected = !!initialConfig?.enabled && (!!initialConfig?.public_key || secretulEsteSalvat(initialConfig, "public_key"));

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
    if ((!cfg.public_key.trim() && !secretulEsteSalvat(initialConfig, "public_key")) || (!cfg.secret_key.trim() && !secretulEsteSalvat(initialConfig, "secret_key"))) {
      toast.error("Introdu Public Key și Secret Key înainte de testare.");
      return;
    }
    /*
     * ⚠ PROBA NU MAI SALVEAZA INAINTE (14.09.2026).
     *
     * Pana azi aici se chema `saveWootConfig` ca actiunea de pe server sa aiba ce citi din
     * baza. Deci o cheie tastata gresit o STERGEA pe cea care mergea, tocmai in clipa in
     * care omul voia doar sa afle daca e buna. Acum configul pleaca odata cu proba, ca la
     * toti ceilalti curieri. Vezi nota din `testWootConnection`.
     */
    setTesting(true);
    setTestResult(null);
    const result = await testWootConnection(businessId, cfg);
    setTesting(false);
    if (result.success) {
      setTestResult({ ok: true, name: result.name, email: result.email, credit: result.credit });
    } else {
      setTestResult({ ok: false, message: result.error });
    }
  }

  function handleSave() {
    if ((!cfg.public_key.trim() && !secretulEsteSalvat(initialConfig, "public_key")) || (!cfg.secret_key.trim() && !secretulEsteSalvat(initialConfig, "secret_key"))) {
      toast.error("Public Key și Secret Key sunt obligatorii.");
      return;
    }
    if (cfg.enabled) {
      if (!cfg.sender.contact.trim() || !cfg.sender.phone.trim() || !cfg.sender.email.trim()) {
        toast.error("Completează datele expeditorului (contact, telefon, email).");
        return;
      }
      if (!cfg.sender.city_id || !cfg.sender.address.trim()) {
        toast.error("Alege orașul și introdu adresa expeditorului.");
        return;
      }
    }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof saveWootConfig>>;
      try {
        result = await saveWootConfig(businessId, cfg);
      } catch {
        /* ⚠ Scrie configurarea Woot. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Woot s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configurația Woot a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    });
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      let result: Awaited<ReturnType<typeof disconnectWoot>>;
      try {
        result = await disconnectWoot(businessId);
      } catch {
        /* ⚠ `disconnectWoot` scrie DOAR la noi: nu vorbeste cu Woot. Deci singurul lucru
           nestiut e daca stergerea a apucat sa se scrie, iar contul de la ei e neatins. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Pagina se reincarca: uita-te daca mai apare conectat inainte sa incerci "
          + "din nou: la Woot nu s-a atins nimic.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare"); return; }
      toast.success("Woot a fost deconectat.");
      marcheazaSalvat(DEFAULT_CONFIG);
      setTestResult(null);
      router.refresh();
    });
  }

  const cheiSalvate = secretulEsteSalvat(initialConfig, "public_key") || !!initialConfig?.public_key;
  const areChei = (!!cfg.public_key.trim() || secretulEsteSalvat(initialConfig, "public_key")) && (!!cfg.secret_key.trim() || secretulEsteSalvat(initialConfig, "secret_key"));
  const expeditorGata = !!(cfg.sender.contact.trim() && cfg.sender.phone.trim() && cfg.sender.email.trim() && cfg.sender.city_id && cfg.sender.address.trim());
  const stari: StareAntet[] = !cheiSalvate
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [isConnected ? { ton: "bun", text: "Activ" } : { ton: "neutru", text: "Oprit" }];
  const eticheta = "mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground";

  return (
    <PaginaIntegrare
      id="woot"
      titlu="Livrare"
      descriere="Generezi AWB-uri Woot direct din comenzile magazinului."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Woot la comenzi" activ={cfg.enabled} onChange={v => set("enabled", v)} ariaLabel="Activează Woot" textPornit="Pornit" textOprit="Oprit" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheile API", facut: areChei },
          { text: "Adresa expeditorului", facut: expeditorGata },
          { text: "Woot activ", facut: isConnected },
        ]} />
        {testResult?.ok && (
          <CardCifre titlu="Contul Woot" cifre={[{ eticheta: "credit disponibil (RON)", valoare: testResult.credit?.toFixed(2) ?? "-" }]}
            randuri={[{ eticheta: "Cont", valoare: testResult.name ?? "-" }]} />
        )}
        <CumFunctioneaza id="woot" puncte={[
          { Icon: UserPlus, text: "Îți faci cont pe woot.ro, apoi generezi Public Key și Secret Key din Setări, API." },
          { Icon: Wifi, text: "„Testează conexiunea” verifică cheile și îți arată creditul disponibil." },
          { Icon: MapPin, text: "Adresa expeditorului e cea de unde se ridică coletele." },
          { Icon: Truck, text: "Cu Woot pornit, în pagina comenzii apare butonul „Creează AWB”." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Cheile API" descriere="Le generezi în contul Woot, la Setări, API.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="woot-public" className={eticheta}>
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />Public Key
            </label>
            <Input id="woot-public" type="text" value={cfg.public_key} onChange={e => set("public_key", e.target.value)}
              placeholder={secretulEsteSalvat(initialConfig, "public_key") ? PLACEHOLDER_SECRET_SALVAT : ""} />
          </div>
          <div>
            <label htmlFor="woot-secret" className={eticheta}>
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />Secret Key
            </label>
            <Input id="woot-secret" type="password" value={cfg.secret_key} onChange={e => set("secret_key", e.target.value)}
              placeholder={secretulEsteSalvat(initialConfig, "secret_key") ? PLACEHOLDER_SECRET_SALVAT : ""} />
          </div>
        </div>

        <div>
          <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
            {testing || saving
              ? <Loader2 className="animate-spin" />
              : testResult?.ok ? <Wifi className="text-success" /> : <WifiOff className="text-muted-foreground" />}
            Testează conexiunea
          </Button>
        </div>

        {testResult && (testResult.ok ? (
          <Callout variant="success" icon={Wifi} title="Conexiune reușită">
            {testResult.name} · {testResult.email}. Credit disponibil: <strong>{testResult.credit?.toFixed(2)} RON</strong>.
          </Callout>
        ) : (
          <Callout variant="danger" title={testResult.message ?? "Conexiunea nu a mers."} />
        ))}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa expeditorului" descriere="Adresa de unde se ridică coletele (firma ta).">
        {/* Company type */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSender("company", 1)}
            className={cn("flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all",
              cfg.sender.company === 1 ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground")}>
            <Building2 className="h-4 w-4" />Firmă
          </button>
          <button type="button" onClick={() => setSender("company", 0)}
            className={cn("flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all",
              cfg.sender.company === 0 ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground")}>
            <User className="h-4 w-4" />Persoană fizică
          </button>
        </div>

        {cfg.sender.company === 1 && (
          <div>
            <label htmlFor="woot-firma" className={eticheta}>
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />Nume firmă
            </label>
            <Input id="woot-firma" type="text" value={cfg.sender.company_name ?? ""} onChange={e => setSender("company_name", e.target.value)}
              placeholder="S.C. Firma S.R.L." />
          </div>
        )}

        <div>
          <label htmlFor="woot-contact" className={eticheta}>
            <User className="h-3.5 w-3.5 text-muted-foreground" />Persoana de contact
          </label>
          <Input id="woot-contact" type="text" value={cfg.sender.contact} onChange={e => setSender("contact", e.target.value)} placeholder="Prenume Nume" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="woot-telefon" className={eticheta}>
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />Telefon
            </label>
            <Input id="woot-telefon" type="tel" value={cfg.sender.phone} onChange={e => setSender("phone", e.target.value)} placeholder="+40721000000" />
          </div>
          <div>
            <label htmlFor="woot-email" className={eticheta}>
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />Email
            </label>
            <Input id="woot-email" type="email" value={cfg.sender.email} onChange={e => setSender("email", e.target.value)} placeholder="firma@email.ro" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="woot-judet" className={eticheta}>
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />Județ
            </label>
            <select
              id="woot-judet"
              value={cfg.sender.county_id || ""}
              onChange={e => {
                setSender("county_id", Number(e.target.value));
                setSender("city_id", 0);
              }}
              className={selectCls}
            >
              <option value="">Alege județul</option>
              {counties.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="woot-oras" className={eticheta}>
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />Oraș
            </label>
            <select
              id="woot-oras"
              value={cfg.sender.city_id || ""}
              onChange={e => setSender("city_id", Number(e.target.value))}
              disabled={!cfg.sender.county_id || loadingCities}
              className={selectCls}
            >
              <option value="">{loadingCities ? "Se încarcă..." : "Alege orașul"}</option>
              {cities.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="woot-adresa" className={eticheta}>
              <Home className="h-3.5 w-3.5 text-muted-foreground" />Adresa
            </label>
            <Input id="woot-adresa" type="text" value={cfg.sender.address} onChange={e => setSender("address", e.target.value)} placeholder="Strada, nr., etc." />
          </div>
          <div>
            <label htmlFor="woot-cod" className={eticheta}>Cod poștal (opțional)</label>
            <Input id="woot-cod" type="text" value={cfg.sender.zipcode ?? ""} onChange={e => setSender("zipcode", e.target.value)} placeholder="000000" />
          </div>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Expedierea">
        <RandComutator
          titlu="Asigurare (valoare declarată)"
          text="Fiecare AWB se asigură pentru valoarea produselor din comandă. Prima de asigurare apare în prețul Woot."
          activ={cfg.insurance_enabled ?? false}
          onChange={v => setCfg(c => ({ ...c, insurance_enabled: v }))}
        />

        {/*
          ⚠ Doua valori, nu trei. Woot accepta si `card`, dar acolo raspunsul lor NU poarta AWB,
          ci un identificator de plata (documentat la POST /orders: `awb_number` e „for
          credit/term payments", `payment_id` e „for card payments"). Oferit aici, comerciantul ar
          fi ales o expediere fara eticheta si fara numar. Vezi nota din `WootConfig`.
        */}
        <div className="border-t border-border pt-4">
          <label htmlFor="woot-plata" className="mb-1.5 block text-sm font-medium text-foreground">
            Cum se plătește expedierea
          </label>
          <select
            id="woot-plata"
            value={cfg.payment_method ?? "credit"}
            onChange={e => setCfg(c => ({ ...c, payment_method: e.target.value as "credit" | "term" }))}
            className={cn(selectCls, "max-w-64")}
          >
            <option value="credit">Din creditul contului</option>
            <option value="term">La termen (pe factură)</option>
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Alege cum e configurat contul tău la Woot. Pe credit, emiterea se oprește când contul rămâne fără sold, iar AWB-ul nu se creează.
          </p>
        </div>
      </Sectiune>

      {isConnected && (
        <ZonaDeconectare descriere="Șterge cheile și datele expeditorului din Edinio. La Woot nu se atinge nimic.">
          <ButonDeconectare
            nume="Woot"
            cePierzi="Cheile se șterg din Edinio, împreună cu datele expeditorului. Ca să te întorci, le ceri din nou din contul tău Woot. La Woot nu se atinge nimic: AWB-urile deja emise rămân valabile."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={handleSave} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
