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
              placeholder="Parola cont selfAWB"
            />
          </Field>
        </div>

        <Button
          onClick={handleConnect}
          disabled={loading || !username.trim() || !password.trim()}
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
