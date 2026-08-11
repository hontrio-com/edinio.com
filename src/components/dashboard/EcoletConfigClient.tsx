"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Loader2, Unplug } from "lucide-react";
import {
  disconnectEcolet,
  saveEcoletConfig,
  testEcoletConnectionAction,
  type ServiciuAratat,
} from "@/lib/actions/ecolet.actions";
import type { EcoletConfig } from "@/lib/ecolet/client";
import { JUDETE } from "@/lib/ro/judete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea eColet.
 *
 * ⚠ „Testeaza conexiunea" merge pe `GET /services`, nu pe `/me`: `/me` raspunde
 * 200 cu `{"unauthenticated": true}` si cu token gresit, deci un test scris pe
 * statusul HTTP ar iesi VERDE fara nicio credentiala. Si tot el aduce catalogul
 * de servicii, de care are nevoie oricum pagina.
 *
 * ⚠ Adresa de ridicare se completeaza AICI, si nu se ia din datele magazinului ca
 * la ceilalti curieri: eColet cere `locality_id`, un intreg din nomenclatorul lor,
 * care se cauta cand se salveaza — nu la fiecare expediere.
 */
export function EcoletConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: EcoletConfig | null;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [servicii, setServicii] = useState<ServiciuAratat[] | null>(null);

  const [token, setToken] = useState("");
  const e = initialConfig?.expeditor ?? {};
  const [nume, setNume] = useState(e.name ?? "");
  const [contact, setContact] = useState(e.contact_person ?? "");
  const [telefon, setTelefon] = useState(e.phone ?? "");
  const [email, setEmail] = useState(e.email ?? "");
  const [oras, setOras] = useState(e.locality ?? "");
  const [judet, setJudet] = useState(e.county ?? "");
  const [strada, setStrada] = useState(e.street_name ?? "");
  const [numar, setNumar] = useState(e.street_number ?? "");
  const [codPostal, setCodPostal] = useState(e.postal_code ?? "");

  const [permise, setPermise] = useState<string[]>(initialConfig?.servicii_permise ?? []);
  const [deschidere, setDeschidere] = useState(initialConfig?.deschidere_la_livrare ?? false);
  const [sambata, setSambata] = useState(initialConfig?.livrare_sambata ?? false);
  const [sms, setSms] = useState(initialConfig?.sms_notificare ?? false);

  const areToken = token.trim() !== "" || secretulEsteSalvat(initialConfig, "api_token");
  /*
   * ⚠ ACEEASI regula ca in `ecoletGata` si ca in celelalte patru locuri:
   * `enabled` + token. Prima forma cerea si `locality_id`, iar cand localitatea nu
   * se rezolva, configul ramanea salvat si activ, dar bannerul nu se randa — si
   * odata cu el disparea SINGURUL buton de Deconectare din interfata.
   *
   * Tokenul nu ajunge in browser (e mascat), deci prezenta lui se citeste din
   * `_completate`, prin `secretulEsteSalvat`.
   */
  const isActive = !!(initialConfig?.enabled && secretulEsteSalvat(initialConfig, "api_token"));
  const faraLocalitate = isActive && !(Number(initialConfig?.expeditor?.locality_id) > 0);

  function construieste(): EcoletConfig {
    return {
      enabled: true,
      api_token: token.trim(),
      expeditor: {
        /* `locality_id` se pastreaza; il rezolva serverul la salvare. */
        ...(initialConfig?.expeditor ?? {}),
        name: nume.trim(),
        contact_person: contact.trim() || nume.trim(),
        phone: telefon.trim(),
        email: email.trim(),
        locality: oras.trim(),
        county: judet,
        street_name: strada.trim(),
        street_number: numar.trim(),
        postal_code: codPostal.trim(),
      },
      servicii_permise: permise,
      deschidere_la_livrare: deschidere,
      livrare_sambata: sambata,
      sms_notificare: sms,
    };
  }

  async function handleTest() {
    if (!areToken) return toast.error("Completeaza tokenul din panel.ecolet.ro");
    setTesting(true);
    const r = await testEcoletConnectionAction(businessId, construieste());
    setTesting(false);

    if ("error" in r) {
      setServicii(null);
      toast.error(`eColet: ${r.error}`);
      return;
    }
    setServicii(r.servicii);
    toast.success(`Conexiune eColet reusita — ${r.servicii.length} servicii`);
  }

  async function handleSave() {
    if (!areToken) return toast.error("Completeaza tokenul");
    /* ⚠ Aceeasi lista ca `lipsuriAdresa` de pe server. Codul postal lipsea de aici
       si era cerut acolo, deci configurarea se salva „activa" si nicio cotare nu
       mergea — iar in storefront cadea tacut pe tariful fix. */
    if (!nume.trim() || !strada.trim() || !oras.trim() || !judet || !codPostal.trim()) {
      return toast.error("Completeaza adresa de ridicare: nume, strada, localitate, judet si cod postal");
    }
    if (!telefon.trim()) return toast.error("Telefonul de la ridicare e obligatoriu");

    setSaving(true);
    const r = await saveEcoletConfig(businessId, construieste());
    setSaving(false);

    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Configuratie eColet salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectEcolet(businessId);
    setDisconnecting(false);
    if ("error" in r) toast.error(r.error);
    else {
      toast.success("eColet deconectat");
      setServicii(null);
      router.refresh();
    }
  }

  function comutaServiciu(slug: string) {
    setPermise((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="eColet activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          Ridicare din {initialConfig?.expeditor?.locality}
          {initialConfig?.expeditor?.county ? `, ${initialConfig.expeditor.county}` : ""}
        </Callout>
      )}

      {faraLocalitate && (
        <Callout variant="warning" icon={AlertTriangle} title="Localitatea de ridicare nu e recunoscuta">
          eColet nu a gasit localitatea din adresa de ridicare, iar fara ea cotarea
          din checkout nu porneste si nu se poate emite nicio expediere. Corecteaza
          numele localitatii mai jos si salveaza din nou.
        </Callout>
      )}

      <Callout variant="warning" icon={AlertTriangle} title="Fiecare expediere e reala">
        eColet nu are mediu de test: orice expediere trimisa din panou e un transport
        adevarat, care intra pe factura.
        <br />
        Emiterea nu e instantanee — eColet prelucreaza expedierea si abia apoi apare
        AWB-ul. Fereastra din comanda iti arata cand e gata; nu trimite de doua ori.
      </Callout>

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            1
          </span>
          <h3 className="text-sm font-semibold text-foreground">Token de acces</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Se genereaza din contul tau de pe panel.ecolet.ro. E singura credentiala:
          eColet nu foloseste utilizator si parola pentru API.
        </p>

        <Field label="Token" required>
          <Input
            type="password"
            value={token}
            onChange={(ev) => { setToken(ev.target.value); setServicii(null); }}
            placeholder={
              secretulEsteSalvat(initialConfig, "api_token")
                ? PLACEHOLDER_SECRET_SALVAT
                : "Tokenul din panel.ecolet.ro"
            }
          />
        </Field>

        <Button onClick={handleTest} disabled={testing || !areToken}>
          {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {testing ? "Se verifica..." : "Testeaza conexiunea"}
        </Button>

        {servicii !== null && (
          <div className="space-y-2 rounded-lg border border-success/20 bg-success/5 p-3">
            <p className="text-xs font-semibold text-success">Tokenul e valid.</p>
            {servicii.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Serviciile contului tau. Bifeaza-le pe cele pe care vrei sa le vada
                  cumparatorul in checkout; nebifat nimic inseamna toate.
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {servicii.map((s) => (
                    <label key={s.slug} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={permise.includes(s.slug)}
                        onChange={() => comutaServiciu(s.slug)}
                      />
                      <span className="flex-1">
                        {s.curier ? `${s.curier} · ` : ""}{s.nume}
                      </span>
                      {!s.activ && <span className="text-muted-foreground">oprit</span>}
                      {!s.ramburs && <span className="text-muted-foreground">fara ramburs</span>}
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Contul nu are niciun serviciu activ. Verifica in panel.ecolet.ro.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            2
          </span>
          <h3 className="text-sm font-semibold text-foreground">De unde se ridica marfa</h3>
        </div>
        {/*
          ⚠ Nu se ia din datele magazinului ca la ceilalti curieri: eColet cere un
          `locality_id` din nomenclatorul lor, care se cauta la salvare. Fara el,
          cotarea din checkout nici nu porneste.
        */}
        <p className="text-xs text-muted-foreground">
          eColet are nevoie de localitatea din nomenclatorul lui, nu doar de numele
          orasului — de aceea adresa de ridicare se completeaza aici, o singura data.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nume expeditor" required>
            <Input value={nume} onChange={(ev) => setNume(ev.target.value)} placeholder="Magazinul Meu SRL" />
          </Field>
          <Field label="Persoana de contact">
            <Input value={contact} onChange={(ev) => setContact(ev.target.value)} placeholder="Andrei" />
          </Field>
          <Field label="Telefon" required>
            <Input value={telefon} onChange={(ev) => setTelefon(ev.target.value)} placeholder="0722000000" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="depozit@magazin.ro" />
          </Field>
          <Field label="Localitate" required>
            <Input value={oras} onChange={(ev) => setOras(ev.target.value)} placeholder="Cluj-Napoca" />
          </Field>
          <Field label="Judet" required>
            <select
              value={judet}
              onChange={(ev) => setJudet(ev.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Alege judetul</option>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </Field>
          <Field label="Strada" required>
            <Input value={strada} onChange={(ev) => setStrada(ev.target.value)} placeholder="Bulevardul Eroilor" />
          </Field>
          <Field label="Numar">
            <Input value={numar} onChange={(ev) => setNumar(ev.target.value)} placeholder="12" />
          </Field>
          <Field label="Cod postal" required>
            <Input value={codPostal} onChange={(ev) => setCodPostal(ev.target.value)} placeholder="400129" />
          </Field>
        </div>
      </Panel>

      <Panel className="space-y-3 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            3
          </span>
          <h3 className="text-sm font-semibold text-foreground">Servicii aditionale</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Se aplica la fiecare expediere si se tarifeaza separat de eColet. Nu toate
          serviciile le accepta — cele care nu pot, le ignora.
        </p>

        {([
          ["Deschidere la livrare", deschidere, setDeschidere],
          ["Livrare sambata", sambata, setSambata],
          ["Notificare prin SMS", sms, setSms],
        ] as const).map(([eticheta, valoare, seteaza]) => (
          <div key={eticheta} className="flex items-center justify-between rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{eticheta}</p>
            <Switch checked={valoare} onCheckedChange={seteaza} />
          </div>
        ))}
      </Panel>

      <Button onClick={handleSave} disabled={saving || !areToken} className="w-full sm:w-auto">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza configuratia"}
      </Button>
    </div>
  );
}
