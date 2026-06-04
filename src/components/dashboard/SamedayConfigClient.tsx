"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Unplug, ChevronRight, ExternalLink } from "lucide-react";
import {
  saveSamedayConfig,
  disconnectSameday,
  loadSamedayAccountAction,
} from "@/lib/actions/sameday.actions";
import type { SamedayConfig, SamedayPickupPoint, SamedayService } from "@/lib/sameday";

export function SamedayConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: SamedayConfig | null;
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
  const [sandbox, setSandbox] = useState(initialConfig?.sandbox ?? false);
  const [pickupPoints, setPickupPoints] = useState<SamedayPickupPoint[]>([]);
  const [services, setServices] = useState<SamedayService[]>([]);

  const [selectedPickupPointId, setSelectedPickupPointId] = useState<number>(initialConfig?.pickup_point_id ?? 0);
  const [selectedContactPersonId, setSelectedContactPersonId] = useState<number>(initialConfig?.contact_person_id ?? 0);
  const [selectedServiceId, setSelectedServiceId] = useState<number>(initialConfig?.service_id ?? 0);
  const [selectedServiceName, setSelectedServiceName] = useState(initialConfig?.service_name ?? "");

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.pickup_point_id);

  const selectedPickupPoint = pickupPoints.find(p => p.id === selectedPickupPointId);
  const contactPersons = selectedPickupPoint?.contactPersons ?? [];

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completeaza username-ul Sameday");
    if (!password.trim()) return toast.error("Completeaza parola");

    setLoading(true);
    let result: Awaited<ReturnType<typeof loadSamedayAccountAction>>;
    try {
      result = await loadSamedayAccountAction(username.trim(), password.trim(), sandbox);
    } catch (e) {
      setLoading(false);
      toast.error(`Eroare la conectare: ${(e as Error).message}`);
      return;
    }
    setLoading(false);

    if ("error" in result) {
      toast.error(`Eroare Sameday: ${result.error}`);
      return;
    }

    setPickupPoints(result.pickupPoints ?? []);
    setServices(result.services ?? []);

    if (result.pickupPoints.length > 0 && !selectedPickupPointId) {
      const first = result.pickupPoints[0];
      setSelectedPickupPointId(first.id);
      const contacts = first.contactPersons ?? [];
      const defaultContact = contacts.find(c => c.isDefault) ?? contacts[0];
      if (defaultContact) setSelectedContactPersonId(defaultContact.id);
    }

    if (result.services.length > 0 && !selectedServiceId) {
      const sameday = result.services.find(s => s.code === "SD") ?? result.services[0];
      if (sameday) {
        setSelectedServiceId(sameday.id);
        setSelectedServiceName(sameday.name);
      }
    }

    if (result.pickupPoints.length === 0) {
      toast.warning("Cont conectat, dar nu exista puncte de ridicare. Adauga un punct de ridicare in panoul Sameday.");
    } else {
      toast.success(`Cont Sameday conectat — ${result.pickupPoints.length} punct(e) de ridicare`);
    }
    setStep("settings");
  }

  async function handleSave() {
    if (!selectedPickupPointId) return toast.error("Selecteaza un punct de ridicare");
    if (!selectedContactPersonId && contactPersons.length > 0) return toast.error("Selecteaza o persoana de contact");
    if (!selectedServiceId) return toast.error("Selecteaza un serviciu");

    const config: SamedayConfig = {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      sandbox,
      pickup_point_id: selectedPickupPointId,
      contact_person_id: selectedContactPersonId,
      service_id: selectedServiceId,
      service_name: selectedServiceName,
    };

    setSaving(true);
    const result = await saveSamedayConfig(businessId, config);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configuratie Sameday salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectSameday(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Sameday deconectat");
      setStep("credentials");
      setPickupPoints([]);
      setServices([]);
      router.refresh();
    }
  }

  function handlePickupPointChange(id: number) {
    setSelectedPickupPointId(id);
    const pp = pickupPoints.find(p => p.id === id);
    if (pp) {
      const contacts = pp.contactPersons ?? [];
      const defaultContact = contacts.find(c => c.isDefault) ?? contacts[0];
      if (defaultContact) setSelectedContactPersonId(defaultContact.id);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      {isActive && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Sameday activ</p>
            <p className="text-xs text-green-700 truncate">
              {initialConfig?.service_name} · Pickup ID {initialConfig?.pickup_point_id}
              {initialConfig?.sandbox && " · Sandbox"}
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
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont Sameday</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username *</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username Sameday"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Parola *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola cont Sameday"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={e => setSandbox(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
          />
          <span className="text-xs font-medium text-muted-foreground">Mod sandbox (testare)</span>
        </label>

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

      {/* Step 2: Settings */}
      {(step === "settings" || pickupPoints.length > 0) && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold flex-shrink-0">2</span>
            <h3 className="text-sm font-semibold text-foreground">Configurare punct ridicare si serviciu</h3>
          </div>

          {/* Pickup point */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Punct de ridicare *</label>
            {pickupPoints.length > 0 ? (
              <select
                value={selectedPickupPointId}
                onChange={e => handlePickupPointChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {pickupPoints.map(pp => (
                  <option key={pp.id} value={pp.id}>
                    {pp.alias} — {pp.address?.city?.name ?? ""}{pp.address?.county?.name ? `, ${pp.address.county.name}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`w-full px-3 py-2 text-sm border rounded-lg ${step === "settings" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-muted/30 text-muted-foreground"}`}>
                {initialConfig?.pickup_point_id
                  ? `Pickup ID: ${initialConfig.pickup_point_id}`
                  : step === "settings"
                    ? "Nu exista puncte de ridicare in contul Sameday. Adauga unul din panoul Sameday si apasa din nou 'Conecteaza'."
                    : "Conecteaza contul pentru a incarca punctele de ridicare"}
              </div>
            )}
          </div>

          {/* Contact person */}
          {(contactPersons.length > 0 || initialConfig?.contact_person_id) && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Persoana de contact *</label>
              {contactPersons.length > 0 ? (
                <select
                  value={selectedContactPersonId}
                  onChange={e => setSelectedContactPersonId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                >
                  {contactPersons.map(cp => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name}{cp.isDefault ? " (implicit)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted/30 text-muted-foreground">
                  Contact ID: {initialConfig?.contact_person_id}
                </div>
              )}
            </div>
          )}

          {/* Service */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Serviciu *</label>
            {services.length > 0 ? (
              <select
                value={selectedServiceId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const svc = services.find(s => s.id === id);
                  setSelectedServiceId(id);
                  setSelectedServiceName(svc?.name ?? "");
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted/30 text-muted-foreground">
                {initialConfig?.service_name
                  ? `${initialConfig.service_name} (ID: ${initialConfig.service_id})`
                  : "Conecteaza contul pentru a incarca serviciile"}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedPickupPointId || !selectedServiceId}
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
        <p className="text-sm font-semibold text-foreground mb-2">Cum obtii accesul API Sameday?</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Trebuie sa ai un contract semnat cu Sameday Courier</li>
          <li>Contacteaza Sameday pentru a activa accesul API</li>
          <li>Introdu username + parola si apasa &quot;Conecteaza&quot;</li>
          <li>Selecteaza punctul de ridicare, persoana de contact si serviciul</li>
        </ol>
        <a
          href="https://www.sameday.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide site Sameday
        </a>
      </div>
    </div>
  );
}
