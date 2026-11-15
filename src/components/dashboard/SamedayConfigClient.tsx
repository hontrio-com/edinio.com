"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, ExternalLink, FileSignature, Loader2, MapPin, Truck } from "lucide-react";
import {
  saveSamedayConfig,
  disconnectSameday,
  loadSamedayAccountAction,
} from "@/lib/actions/sameday.actions";
import type { SamedayConfig, SamedayPickupPoint, SamedayService } from "@/lib/sameday/client";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  AlegereCarduri, BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

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

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { username, password, sandbox, selectedPickupPointId, selectedContactPersonId, selectedServiceId, selectedServiceName };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setSandbox(reper.sandbox);
    setSelectedPickupPointId(reper.selectedPickupPointId); setSelectedContactPersonId(reper.selectedContactPersonId);
    setSelectedServiceId(reper.selectedServiceId); setSelectedServiceName(reper.selectedServiceName);
  }

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.pickup_point_id);

  const selectedPickupPoint = pickupPoints.find(p => p.id === selectedPickupPointId);
  const contactPersons = selectedPickupPoint?.contactPersons ?? [];

  async function handleConnect() {
    if (!username.trim()) return toast.error("Completează username-ul Sameday.");
    if (!password.trim() && !secretulEsteSalvat(initialConfig, "password")) return toast.error("Completează parola.");

    setLoading(true);
    let result: Awaited<ReturnType<typeof loadSamedayAccountAction>>;
    try {
      result = await loadSamedayAccountAction(businessId, username.trim(), password.trim(), sandbox);
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
      toast.warning("Cont conectat, dar nu există puncte de ridicare. Adaugă un punct de ridicare în panoul Sameday.");
    } else {
      toast.success(`Cont Sameday conectat: ${result.pickupPoints.length} punct(e) de ridicare.`);
    }
    setStep("settings");
  }

  async function handleSave() {
    if (!selectedPickupPointId) return toast.error("Alege un punct de ridicare.");
    if (!selectedContactPersonId && contactPersons.length > 0) return toast.error("Alege o persoană de contact.");
    if (!selectedServiceId) return toast.error("Alege un serviciu.");

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
      toast.success("Configurația Sameday a fost salvată.");
      setReper(valori);
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
      toast.success("Sameday a fost deconectat.");
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

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const areContul = !!username.trim() && (!!password.trim() || parolaSalvata);
  const arataSetarile = step === "settings" || pickupPoints.length > 0;
  const stari: StareAntet[] = isActive
    ? [{ ton: "bun", text: "Activ" }, ...(initialConfig?.sandbox ? [{ ton: "asteptare" as const, text: "Mod test" }] : [])]
    : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="sameday"
      titlu="Livrare"
      descriere="Generezi AWB-uri Sameday din comenzi, cu punctul de ridicare și serviciul din contul tău."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul Sameday", facut: areContul },
          { text: "Punctul de ridicare", facut: !!selectedPickupPointId },
          { text: "Serviciul", facut: !!selectedServiceId },
          { text: "Sameday activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Serviciu", valoare: initialConfig?.service_name || "-" },
            { eticheta: "Punct de ridicare", valoare: <span className="font-mono">{initialConfig?.pickup_point_id}</span> },
            { eticheta: "Mediu", valoare: initialConfig?.sandbox ? "test" : "real" },
          ]} />
        )}
        <CumFunctioneaza id="sameday" puncte={[
          { Icon: FileSignature, text: "Ai nevoie de un contract cu Sameday Courier; accesul la API îl activează Sameday." },
          { Icon: MapPin, text: "Alegi punctul de ridicare, persoana de contact și serviciul din contul tău." },
          { Icon: Truck, text: "AWB-ul îl generezi din pagina comenzii." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul Sameday" descriere="Utilizatorul și parola contului tău Sameday.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="sameday-user" required>
            <Input id="sameday-user" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username Sameday" />
          </Field>
          <Field label="Parola" htmlFor="sameday-parola" required>
            <Input
              id="sameday-parola"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : "Parola contului Sameday"}
            />
          </Field>
        </div>
        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={sandbox}
          onChange={setSandbox}
          optiuni={[
            { valoare: true, titlu: "Test (sandbox)", text: "AWB-urile nu sunt reale. Pentru probe.", avertizare: true },
            { valoare: false, titlu: "Real", text: "AWB-uri adevărate, pe contractul tău." },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleConnect} disabled={loading || !areContul}>
            {loading ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {loading ? "Se conectează..." : "Conectează și încarcă datele"}
          </Button>
          <a href="https://www.sameday.ro" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide site-ul Sameday <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      {arataSetarile && (
        <Sectiune pas={2} titlu="Punct de ridicare și serviciu" descriere="De unde ridică Sameday coletele și cu ce serviciu pleacă.">
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
                    {pp.alias} · {pp.address?.city?.name ?? ""}{pp.address?.county?.name ? `, ${pp.address.county.name}` : ""}
                  </option>
                ))}
              </select>
            ) : step === "settings" ? (
              <Callout variant="warning">
                Nu există puncte de ridicare în contul Sameday. Adaugă unul din panoul Sameday și apasă din nou „Conectează și încarcă datele”.
              </Callout>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {initialConfig?.pickup_point_id
                  ? `Pickup ID: ${initialConfig.pickup_point_id}`
                  : "Conectează contul ca să încarci punctele de ridicare"}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    : "Conectează contul ca să încarci serviciile"}
                </div>
              )}
            </Field>
          </div>
        </Sectiune>
      )}

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheile și setările Sameday din Edinio. AWB-urile deja emise rămân valabile la curier.">
          <ButonDeconectare
            nume="Sameday"
            cePierzi="Cheile se șterg din Edinio, împreună cu punctul de ridicare și serviciul ales. Ca să te întorci, ceri din nou utilizatorul și parola din contul tău Sameday. AWB-urile deja emise rămân valabile la curier."
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
