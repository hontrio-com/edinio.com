"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ChevronRight, ExternalLink, FileSignature, Loader2, Ruler, Truck } from "lucide-react";
import {
  saveFanCourierConfig,
  disconnectFanCourier,
  loadFanCourierAccountAction,
} from "@/lib/actions/fancourier.actions";
import type { FanCourierConfig, FanCourierBranch } from "@/lib/fancourier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

export function FanCourierConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FanCourierConfig | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "settings">(
    initialConfig?.enabled ? "settings" : "credentials",
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState(initialConfig?.password ?? "");
  const [branches, setBranches] = useState<FanCourierBranch[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number>(initialConfig?.client_id ?? 0);
  const [selectedClientName, setSelectedClientName] = useState(initialConfig?.client_name ?? "");
  const [epod, setEpod] = useState(initialConfig?.epod ?? false);
  /* ⚠ Implicit STINS: asigurarea costa, deci nu se porneste in locul comerciantului. */
  const [asigurare, setAsigurare] = useState(initialConfig?.declared_value_enabled ?? false);
  // Coletul obisnuit, in centimetri. Text, nu numar: un camp gol trebuie sa
  // ramana gol, iar `useState(0)` ar arata un zero pe care nimeni nu l-a scris.
  const [coletL, setColetL] = useState(String(initialConfig?.colet_implicit?.length ?? ""));
  const [coletl, setColetl] = useState(String(initialConfig?.colet_implicit?.width ?? ""));
  const [coletH, setColetH] = useState(String(initialConfig?.colet_implicit?.height ?? ""));

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { username, password, selectedClientId, selectedClientName, epod, asigurare, coletL, coletl, coletH };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setSelectedClientId(reper.selectedClientId);
    setSelectedClientName(reper.selectedClientName); setEpod(reper.epod); setAsigurare(reper.asigurare);
    setColetL(reper.coletL); setColetl(reper.coletl); setColetH(reper.coletH);
  }

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completează username-ul selfAWB.");
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) return toast.error("Completează parola.");

    setLoading(true);
    const result = await loadFanCourierAccountAction(businessId, username.trim(), password.trim());
    setLoading(false);

    if ("error" in result) {
      toast.error(`Eroare FAN Courier: ${result.error}`);
      return;
    }

    setBranches(result.branches);

    if (result.branches.length > 0 && !selectedClientId) {
      setSelectedClientId(result.branches[0].id);
      setSelectedClientName(result.branches[0].name);
    }

    toast.success(`Cont FAN Courier conectat: ${result.branches.length} branch(-uri) disponibil(e).`);
    setStep("settings");
  }

  /**
   * Coletul implicit din formular, sau `null` cand toate trei sunt goale.
   *
   * ⚠ `parseFloat`, nu `parseInt`: cutiile reale au zecimale, iar compartimentul
   * mare FANbox e 44,3 cm. Taiat la 44, un colet de 44,3 ar fi trecut validarea
   * si ar fi fost refuzat la locker, chiar defectul gasit in modal.
   */
  function coletDinFormular(): { length: number; width: number; height: number } | null {
    const v = [coletL, coletl, coletH].map(x => x.trim());
    if (v.every(x => !x)) return null;
    const [length, width, height] = v.map(x => parseFloat(x.replace(",", ".")));
    return { length, width, height };
  }

  async function handleSave() {
    if (!selectedClientId) return toast.error("Alege un branch.");
    /* ⚠ Aceeasi conditie ca pe server, doar ca aici se afla INAINTE de drum:
       o configurare activa fara parola arata verde pe trei ecrane si e refuzata
       de fiecare actiune. Serverul ramane poarta adevarata. */
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) {
      return toast.error("Completează parola selfAWB înainte să salvezi.");
    }

    const colet = coletDinFormular();
    if (colet && !Object.values(colet).every(n => Number.isFinite(n) && n > 0 && n <= 999)) {
      return toast.error("Dimensiunile coletului se completează toate trei, între 0,1 și 999 cm.");
    }

    const config: FanCourierConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      client_id: selectedClientId,
      client_name: selectedClientName,
      epod,
      declared_value_enabled: asigurare,
      colet_implicit: coletDinFormular(),
      /*
       * ⚠ EVIDENTA RIDICARII NU SE MAI CARA PRIN BROWSER.
       *
       * Se trimiteau inapoi `last_pickup_date`/`last_pickup_id` dintr-o fotografie luata la
       * randarea paginii. O fila de Setari deschisa inaintea programarii stergea ridicarea la
       * prima salvare; una deschisa inaintea anularii invia un id mort. Acum le pastreaza
       * SERVERUL, din configul salvat (vezi `saveFanCourierConfig`), fiindca el e singurul
       * care le vede proaspete.
       */
    };

    setSaving(true);
    const result = await saveFanCourierConfig(businessId, config);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configurația FAN Courier a fost salvată.");
      setReper(valori);
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectFanCourier(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("FAN Courier a fost deconectat.");
      setStep("credentials");
      setBranches([]);
      router.refresh();
    }
  }

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const areContul = !!username.trim() && (!!password.trim() || parolaSalvata);
  const arataSetarile = step === "settings" || branches.length > 0;
  const stari: StareAntet[] = isActive ? [{ ton: "bun", text: "Activ" }] : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="fan-courier"
      titlu="Livrare"
      descriere="Generezi AWB-uri FAN Courier din comenzi, cu branch-ul și contractul tău selfAWB."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul selfAWB", facut: areContul },
          { text: "Branch-ul expeditor", facut: !!selectedClientId },
          { text: "Coletul obișnuit", facut: !!(coletL.trim() && coletl.trim() && coletH.trim()) },
          { text: "FAN Courier activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Branch", valoare: initialConfig?.client_name || "-" },
            { eticheta: "Client ID", valoare: <span className="font-mono">{initialConfig?.client_id}</span> },
            { eticheta: "Asigurare", valoare: initialConfig?.declared_value_enabled ? "pornită" : "oprită" },
          ]} />
        )}
        <CumFunctioneaza id="fan-courier" puncte={[
          { Icon: FileSignature, text: "Ai nevoie de un contract cu FAN Courier; credențialele selfAWB le ceri la customer@fancourier.ro." },
          { Icon: Building2, text: "Alegi branch-ul de pe care pleacă coletele și pe care se emit AWB-urile." },
          { Icon: Ruler, text: "Dimensiunile coletului intră în greutatea volumetrică: fără ele, curierul refacturează diferența." },
          { Icon: Truck, text: "AWB-ul îl generezi din pagina comenzii sau în masă, din lista de comenzi." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul selfAWB" descriere="Datele contului tău de pe platforma selfAWB a FAN Courier.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username selfAWB" htmlFor="fan-user" required>
            <Input id="fan-user" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="username selfAWB" />
          </Field>
          <Field label="Parola" htmlFor="fan-parola" required>
            <Input
              id="fan-parola"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : "Parola contului selfAWB"}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleConnect} disabled={loading || !areContul}>
            {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {loading ? "Se conectează..." : "Conectează și încarcă datele"}
          </Button>
          <a href="https://www.selfawb.ro/new/login" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide selfAWB <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      {arataSetarile && (
        <Sectiune pas={2} titlu="Branch expeditor și colet" descriere="De pe ce branch pleacă coletele și cum arată coletul tău obișnuit.">
          <Field label="Client / Branch" required>
            {branches.length > 0 ? (
              <select
                aria-label="Client / Branch"
                value={selectedClientId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const branch = branches.find(b => b.id === id);
                  setSelectedClientId(id);
                  setSelectedClientName(branch?.name ?? "");
                }}
                className={selectCls}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} (ID: {b.id}) · {b.address?.locality}, {b.address?.county}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.client_name
                  ? `${initialConfig.client_name} (ID: ${initialConfig.client_id})`
                  : "Conectează contul ca să încarci branch-urile"}
              </div>
            )}
          </Field>

          <Field label="Coletul tău obișnuit (cm)"
            hint="Lungime × lățime × înălțime. Obligatoriu pentru generarea în masă, care nu are de unde să le știe; la emiterea din fereastra comenzii le poți scrie de fiecare dată."
            ajutor={<ExplicatieCard marime="mic" intrebare="De ce contează" eticheta="Dimensiunile coletului"
              text="FAN cere dimensiunile la fiecare AWB, iar ele intră în greutatea volumetrică. Fără ele coletul pleacă subdeclarat și curierul refacturează diferența." />}>
            <div className="grid grid-cols-3 gap-2">
              <Input inputMode="decimal" aria-label="Lungime (cm)" placeholder="Lungime" value={coletL} onChange={e => setColetL(e.target.value)} />
              <Input inputMode="decimal" aria-label="Lățime (cm)" placeholder="Lățime" value={coletl} onChange={e => setColetl(e.target.value)} />
              <Input inputMode="decimal" aria-label="Înălțime (cm)" placeholder="Înălțime" value={coletH} onChange={e => setColetH(e.target.value)} />
            </div>
          </Field>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Etichetă proprie (ePOD)</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Printezi tu eticheta AWB (A6), în loc de AWB-ul A5 pretipărit adus de curier. Pornește-o doar dacă printezi etichetele înainte de predare.
              </p>
            </div>
            <Switch checked={epod} onCheckedChange={setEpod} aria-label="Etichetă proprie (ePOD)" />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Asigură coletele la valoarea mărfii</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Pornită, FAN asigură coletul la valoarea produselor din comandă (fără transport și fără taxa de ramburs) și
                taxează asigurarea pe fiecare AWB. Oprită, coletele pleacă declarate cu valoarea zero, deci un colet pierdut
                sau stricat nu se despăgubește.
              </p>
            </div>
            <Switch checked={asigurare} onCheckedChange={setAsigurare} aria-label="Asigură coletele la valoarea mărfii" />
          </div>
        </Sectiune>
      )}

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheile selfAWB din Edinio. AWB-urile deja emise rămân pe comenzi.">
          <ButonDeconectare
            nume="FAN Courier"
            cePierzi="Cheile selfAWB se șterg din Edinio, cu tot cu branch-ul și coletul implicit. Ca să te întorci, le ceri din nou de la FAN Courier."
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
