"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ChevronRight, ExternalLink } from "lucide-react";
import {
  saveFanCourierConfig,
  disconnectFanCourier,
  loadFanCourierAccountAction,
} from "@/lib/actions/fancourier.actions";
import type { FanCourierConfig, FanCourierBranch } from "@/lib/fancourier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completeaza username-ul selfAWB");
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) return toast.error("Completeaza parola");

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

    toast.success(`Cont FAN Courier conectat — ${result.branches.length} branch(e) disponibil(e)`);
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
    if (!selectedClientId) return toast.error("Selecteaza un branch");
    /* ⚠ Aceeasi conditie ca pe server, doar ca aici se afla INAINTE de drum:
       o configurare activa fara parola arata verde pe trei ecrane si e refuzata
       de fiecare actiune. Serverul ramane poarta adevarata. */
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) {
      return toast.error("Completeaza parola selfAWB inainte de a salva");
    }

    const colet = coletDinFormular();
    if (colet && !Object.values(colet).every(n => Number.isFinite(n) && n > 0 && n <= 999)) {
      return toast.error("Dimensiunile coletului trebuie completate toate trei, intre 0,1 si 999 cm");
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
      toast.success("Configuratie FAN Courier salvata");
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
      toast.success("FAN Courier deconectat");
      setStep("credentials");
      setBranches([]);
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
          title="FAN Courier activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          {initialConfig?.client_name} · Client ID {initialConfig?.client_id}
        </Callout>
      )}

      {/* Step 1: Credentials */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</span>
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont selfAWB</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username selfAWB" required>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username selfAWB"
            />
          </Field>
          <Field label="Parola" required>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={secretulEsteSalvat(initialConfig, "password") ? PLACEHOLDER_SECRET_SALVAT : "Parola cont selfAWB"}
            />
          </Field>
        </div>

        <Button
          onClick={handleConnect}
          disabled={loading || !username.trim() || (!password.trim() && !secretulEsteSalvat(initialConfig, "password"))}
        >
          {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {loading ? "Se conecteaza..." : "Conecteaza si incarca datele"}
        </Button>
      </Panel>

      {/* Step 2: Select branch */}
      {(step === "settings" || branches.length > 0) && (
        <Panel className="space-y-4 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">2</span>
            <h3 className="text-sm font-semibold text-foreground">Branch expeditor</h3>
          </div>

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
                    {b.name} (ID: {b.id}) — {b.address?.locality}, {b.address?.county}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.client_name
                  ? `${initialConfig.client_name} (ID: ${initialConfig.client_id})`
                  : "Conecteaza contul pentru a incarca branch-urile"}
              </div>
            )}
          </Field>

          <Field label="Coletul tau obisnuit (cm)" hint="Lungime x latime x inaltime. FAN cere dimensiunile la fiecare AWB, iar ele intra in greutatea volumetrica: fara ele coletul pleaca subdeclarat si curierul refactureaza diferenta. Obligatoriu pentru generarea in MASA, care nu are de unde sa le stie; la emiterea din fereastra comenzii le poti scrie de fiecare data.">
            <div className="grid grid-cols-3 gap-2">
              <Input inputMode="decimal" placeholder="Lungime" value={coletL} onChange={e => setColetL(e.target.value)} />
              <Input inputMode="decimal" placeholder="Latime" value={coletl} onChange={e => setColetl(e.target.value)} />
              <Input inputMode="decimal" placeholder="Inaltime" value={coletH} onChange={e => setColetH(e.target.value)} />
            </div>
          </Field>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={epod}
              onChange={e => setEpod(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Eticheta proprie (ePOD)</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Printezi tu eticheta AWB (A6) in loc de AWB-ul A5 pretiparit adus de curier.
                Activeaza doar daca printezi etichetele inainte de predare.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={asigurare}
              onChange={e => setAsigurare(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Asigura coletele la valoarea marfii</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Pana acum coletele plecau declarate cu valoarea zero, deci un colet pierdut sau
                stricat nu se despagubea. Activat, FAN il asigura la valoarea produselor din
                comanda (fara transport si fara taxa de ramburs) si taxeaza asigurarea pe fiecare
                AWB. Lasa stins daca preferi sa nu platesti asigurarea.
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSave}
              disabled={saving || !selectedClientId}
            >
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Se salveaza..." : "Salveaza configuratia"}
            </Button>
          </div>
        </Panel>
      )}

      {/* Help */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Cum obtii accesul API FAN Courier?</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Trebuie sa ai un contract semnat cu FAN Courier</li>
          <li>Solicita credentialele selfAWB la <span className="font-semibold text-foreground">selfawb@fancourier.ro</span></li>
          <li>Introdu username + parola si apasa &quot;Conecteaza&quot;</li>
          <li>Selecteaza branch-ul expeditor si salveaza</li>
        </ol>
        <a
          href="https://selfawb.fancourier.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide platforma selfAWB
        </a>
      </div>
    </div>
  );
}
