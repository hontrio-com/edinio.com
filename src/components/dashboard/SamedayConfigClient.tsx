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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { selectCls } from "@/lib/ui";

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
        <Callout
          variant="success"
          icon={CheckCircle}
          title="Sameday activ"
          action={
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          {initialConfig?.service_name} · Pickup ID {initialConfig?.pickup_point_id}
          {initialConfig?.sandbox && " · Sandbox"}
        </Callout>
      )}

      {/* Step 1: Credentials */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</span>
          <h3 className="text-sm font-semibold text-foreground">Credentiale cont Sameday</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" required>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username Sameday"
            />
          </Field>
          <Field label="Parola" required>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parola cont Sameday"
            />
          </Field>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={e => setSandbox(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
          />
          <span className="text-xs font-medium text-muted-foreground">Mod sandbox (testare)</span>
        </label>

        <Button
          onClick={handleConnect}
          disabled={loading || !username.trim() || !password.trim()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {loading ? "Se conecteaza..." : "Conecteaza si incarca datele"}
        </Button>
      </Panel>

      {/* Step 2: Settings */}
      {(step === "settings" || pickupPoints.length > 0) && (
        <Panel className="space-y-4 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">2</span>
            <h3 className="text-sm font-semibold text-foreground">Configurare punct ridicare si serviciu</h3>
          </div>

          {/* Pickup point */}
          <Field label="Punct de ridicare" required>
            {pickupPoints.length > 0 ? (
              <select
                aria-label="Punct de ridicare"
                value={selectedPickupPointId}
                onChange={e => handlePickupPointChange(Number(e.target.value))}
                className={selectCls}
              >
                {pickupPoints.map(pp => (
                  <option key={pp.id} value={pp.id}>
                    {pp.alias} — {pp.address?.city?.name ?? ""}{pp.address?.county?.name ? `, ${pp.address.county.name}` : ""}
                  </option>
                ))}
              </select>
            ) : step === "settings" ? (
              <Callout variant="warning">
                Nu exista puncte de ridicare in contul Sameday. Adauga unul din panoul Sameday si apasa din nou &quot;Conecteaza&quot;.
              </Callout>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.pickup_point_id
                  ? `Pickup ID: ${initialConfig.pickup_point_id}`
                  : "Conecteaza contul pentru a incarca punctele de ridicare"}
              </div>
            )}
          </Field>

          {/* Contact person */}
          {(contactPersons.length > 0 || initialConfig?.contact_person_id) && (
            <Field label="Persoana de contact" required>
              {contactPersons.length > 0 ? (
                <select
                  aria-label="Persoana de contact"
                  value={selectedContactPersonId}
                  onChange={e => setSelectedContactPersonId(Number(e.target.value))}
                  className={selectCls}
                >
                  {contactPersons.map(cp => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name}{cp.isDefault ? " (implicit)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Contact ID: {initialConfig?.contact_person_id}
                </div>
              )}
            </Field>
          )}

          {/* Service */}
          <Field label="Serviciu" required>
            {services.length > 0 ? (
              <select
                aria-label="Serviciu"
                value={selectedServiceId}
                onChange={e => {
                  const id = Number(e.target.value);
                  const svc = services.find(s => s.id === id);
                  setSelectedServiceId(id);
                  setSelectedServiceName(svc?.name ?? "");
                }}
                className={selectCls}
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.service_name
                  ? `${initialConfig.service_name} (ID: ${initialConfig.service_id})`
                  : "Conecteaza contul pentru a incarca serviciile"}
              </div>
            )}
          </Field>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSave}
              disabled={saving || !selectedPickupPointId || !selectedServiceId}
            >
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Se salveaza..." : "Salveaza configuratia"}
            </Button>
          </div>
        </Panel>
      )}

      {/* Help */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Cum obtii accesul API Sameday?</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Trebuie sa ai un contract semnat cu Sameday Courier</li>
          <li>Contacteaza Sameday pentru a activa accesul API</li>
          <li>Introdu username + parola si apasa &quot;Conecteaza&quot;</li>
          <li>Selecteaza punctul de ridicare, persoana de contact si serviciul</li>
        </ol>
        <a
          href="https://www.sameday.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide site Sameday
        </a>
      </div>
    </div>
  );
}
