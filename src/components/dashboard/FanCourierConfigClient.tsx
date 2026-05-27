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

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_id);

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completeaza username-ul selfAWB");
    if (!password.trim()) return toast.error("Completeaza parola");

    setLoading(true);
    const result = await loadFanCourierAccountAction(username.trim(), password.trim());
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

  async function handleSave() {
    if (!selectedClientId) return toast.error("Selecteaza un branch");

    const config: FanCourierConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      client_id: selectedClientId,
      client_name: selectedClientName,
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
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">FAN Courier activ</p>
            <p className="text-xs text-green-700 truncate">
              {initialConfig?.client_name} · Client ID {initialConfig?.client_id}
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
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont selfAWB</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username selfAWB *</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username selfAWB"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Parola *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola cont selfAWB"
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
          {loading ? "Se conecteaza..." : "Conecteaza si incarca datele"}
        </button>
      </div>

      {/* Step 2: Select branch */}
      {(step === "settings" || branches.length > 0) && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">2</span>
            <h3 className="text-sm font-semibold text-foreground">Branch expeditor</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Client / Branch *</label>
            {branches.length > 0 ? (
              <select
                value={selectedClientId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const branch = branches.find(b => b.id === id);
                  setSelectedClientId(id);
                  setSelectedClientName(branch?.name ?? "");
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} (ID: {b.id}) — {b.address?.locality}, {b.address?.county}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted/30 text-muted-foreground">
                {initialConfig?.client_name
                  ? `${initialConfig.client_name} (ID: ${initialConfig.client_id})`
                  : "Conecteaza contul pentru a incarca branch-urile"}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedClientId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Se salveaza..." : "Salveaza configuratia"}
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-semibold text-foreground mb-2">Cum obtii accesul API FAN Courier?</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Trebuie sa ai un contract semnat cu FAN Courier</li>
          <li>Solicita credentialele selfAWB la <span className="font-semibold text-foreground">selfawb@fancourier.ro</span></li>
          <li>Introdu username + parola si apasa &quot;Conecteaza&quot;</li>
          <li>Selecteaza branch-ul expeditor si salveaza</li>
        </ol>
        <a
          href="https://selfawb.fancourier.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide platforma selfAWB
        </a>
      </div>
    </div>
  );
}
