"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ChevronRight, ExternalLink } from "lucide-react";
import {
  saveDpdConfig,
  disconnectDpd,
  loadDpdAccountAction,
} from "@/lib/actions/dpd.actions";
import type { DpdConfig } from "@/lib/dpd";

export function DpdConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: DpdConfig | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState(initialConfig?.password ?? "");
  const [clientId, setClientId] = useState<number | null>(initialConfig?.client_id ?? null);
  const [clientName, setClientName] = useState("");
  const [international, setInternational] = useState(initialConfig?.international_enabled ?? false);
  const [useWeight, setUseWeight] = useState(initialConfig?.use_product_weight ?? false);

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completeaza username-ul DPD");
    if (!password.trim()) return toast.error("Completeaza parola DPD");

    setLoading(true);
    const result = await loadDpdAccountAction(username.trim(), password.trim());
    setLoading(false);

    if ("error" in result) {
      toast.error(`Eroare DPD: ${result.error}`);
      return;
    }

    setClientId(result.clientId);
    setClientName(result.name);
    toast.success(`Cont DPD conectat — Client ID: ${result.clientId}`);
  }

  async function handleSave() {
    if (!clientId) return toast.error("Conecteaza-te mai intai pentru a obtine Client ID");

    const config: DpdConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      client_id: clientId,
      international_enabled: international,
      use_product_weight: useWeight,
    };

    setSaving(true);
    const result = await saveDpdConfig(businessId, config);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configuratie DPD salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectDpd(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("DPD deconectat");
      setClientId(null);
      setClientName("");
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
            <p className="text-sm font-semibold text-green-800">DPD activ</p>
            <p className="text-xs text-green-700 truncate">
              {initialConfig?.username} · Client ID {initialConfig?.client_id}
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

      {/* Credentials */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">1</span>
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont DPD</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username *</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="user@firma.ro"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Parola *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola contului DPD"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleConnect}
          disabled={loading || !username.trim() || !password.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {loading ? "Se conecteaza..." : "Testeaza si conecteaza"}
        </button>

        {clientId && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs font-semibold text-green-800">
              Conectat ca: {clientName || "DPD Client"} (ID: {clientId})
            </p>
          </div>
        )}
      </div>

      {/* International (EU) */}
      {clientId && (
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Livrare internationala (UE)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Permite comenzi catre tarile UE. Clientul alege tara la checkout, iar pretul livrarii se calculeaza live prin DPD.</p>
            </div>
            <button type="button" onClick={() => setInternational(v => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${international ? "bg-primary" : "bg-muted-foreground/30"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${international ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {international && (
            <label className="flex items-start gap-2.5 mt-3 pt-3 border-t border-border cursor-pointer">
              <input type="checkbox" checked={useWeight} onChange={e => setUseWeight(e.target.checked)}
                className="mt-0.5 rounded border-border accent-primary" />
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Calculeaza dupa greutatea reala a produselor.</span> Pretul livrarii internationale se ia din greutatea setata pe fiecare produs. Daca e oprit, se foloseste o estimare de 1kg.
              </span>
            </label>
          )}
        </div>
      )}

      {/* Save */}
      {clientId && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza configuratia"}
          </button>
        </div>
      )}

      {/* Help */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-semibold text-foreground mb-2">Cum obtii credentialele DPD?</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Contacteaza DPD Romania pentru activarea accesului API (myDPD Business)</li>
          <li>Vei primi un username si parola pentru API</li>
          <li>Introdu credentialele si apasa &quot;Testeaza si conecteaza&quot;</li>
        </ol>
        <a
          href="https://api.dpd.ro/api/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Documentatie API DPD
        </a>
      </div>
    </div>
  );
}
