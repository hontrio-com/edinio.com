"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, KeyRound, ListChecks, Loader2, MapPin } from "lucide-react";
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
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
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

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { token, nume, contact, telefon, email, oras, judet, strada, numar, codPostal, permise, deschidere, sambata, sms };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setToken(reper.token); setNume(reper.nume); setContact(reper.contact); setTelefon(reper.telefon); setEmail(reper.email);
    setOras(reper.oras); setJudet(reper.judet); setStrada(reper.strada); setNumar(reper.numar); setCodPostal(reper.codPostal);
    setPermise(reper.permise); setDeschidere(reper.deschidere); setSambata(reper.sambata); setSms(reper.sms);
  }

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
    if (!areToken) return toast.error("Completează tokenul din panel.ecolet.ro.");
    setTesting(true);
    const r = await testEcoletConnectionAction(businessId, construieste());
    setTesting(false);

    if ("error" in r) {
      setServicii(null);
      toast.error(`eColet: ${r.error}`);
      return;
    }
    setServicii(r.servicii);
    toast.success(`Conexiune eColet reușită: ${r.servicii.length} servicii.`);
  }

  async function handleSave() {
    if (!areToken) return toast.error("Completează tokenul.");
    /* ⚠ Aceeasi lista ca `lipsuriAdresa` de pe server. Codul postal lipsea de aici
       si era cerut acolo, deci configurarea se salva „activa" si nicio cotare nu
       mergea — iar in storefront cadea tacut pe tariful fix. */
    if (!nume.trim() || !strada.trim() || !oras.trim() || !judet || !codPostal.trim()) {
      return toast.error("Completează adresa de ridicare: nume, stradă, localitate, județ și cod poștal.");
    }
    if (!telefon.trim()) return toast.error("Telefonul de la ridicare e obligatoriu.");

    setSaving(true);
    const r = await saveEcoletConfig(businessId, construieste());
    setSaving(false);

    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Configurația eColet a fost salvată.");
      setReper(valori);
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectEcolet(businessId);
    setDisconnecting(false);
    if ("error" in r) toast.error(r.error);
    else {
      toast.success("eColet a fost deconectat.");
      setServicii(null);
      router.refresh();
    }
  }

  function comutaServiciu(slug: string) {
    setPermise((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  }

  const adresaCompleta = !!(nume.trim() && strada.trim() && oras.trim() && judet && codPostal.trim() && telefon.trim());
  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [faraLocalitate ? { ton: "rau", text: "Localitate nerecunoscută" } : { ton: "bun", text: "Activ" }];

  return (
    <PaginaIntegrare
      id="ecolet"
      titlu="Livrare"
      descriere="Platformă cu mai mulți curieri: cumpărătorul alege oferta la comandă, iar tu emiți dintr-un singur cont."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Tokenul eColet", facut: areToken },
          { text: "Adresa de ridicare", facut: adresaCompleta },
          { text: "eColet activ", facut: isActive && !faraLocalitate },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Ridicare din", valoare: [initialConfig?.expeditor?.locality, initialConfig?.expeditor?.county].filter(Boolean).join(", ") || "-" },
            { eticheta: "Servicii alese", valoare: (initialConfig?.servicii_permise?.length ?? 0) > 0 ? String(initialConfig?.servicii_permise?.length) : "toate" },
          ]} />
        )}
        <CumFunctioneaza id="ecolet" puncte={[
          { Icon: KeyRound, text: "Tokenul îl generezi din contul tău de pe panel.ecolet.ro. E singura credențială." },
          { Icon: ListChecks, text: "„Testează conexiunea” aduce serviciile contului; alegi ce vede cumpărătorul la comandă." },
          { Icon: MapPin, text: "Adresa de ridicare se completează aici o singură dată: eColet cere localitatea din nomenclatorul lui." },
        ]} />
      </>}
    >
      {faraLocalitate && (
        <Callout variant="warning" icon={AlertTriangle} title="Localitatea de ridicare nu e recunoscută">
          eColet nu a găsit localitatea din adresa de ridicare, iar fără ea cotarea de la comandă nu pornește și nu se
          poate emite nicio expediere. Corectează numele localității mai jos și salvează din nou.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Token de acces"
        descriere="Se generează din contul tău de pe panel.ecolet.ro. E singura credențială: eColet nu folosește utilizator și parolă pentru API.">
        <Field label="Token" htmlFor="ecolet-token" required>
          <Input
            id="ecolet-token"
            type="password"
            value={token}
            onChange={(ev) => { setToken(ev.target.value); setServicii(null); }}
            placeholder={secretulEsteSalvat(initialConfig, "api_token") ? PLACEHOLDER_SECRET_SALVAT : "Tokenul din panel.ecolet.ro"}
          />
        </Field>

        <div>
          <Button variant="outline" onClick={handleTest} disabled={testing || !areToken}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifică..." : "Testează conexiunea"}
          </Button>
        </div>

        {servicii !== null && (
          <div className="space-y-2 rounded-xl border border-success/25 bg-success/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle className="h-3.5 w-3.5" /> Tokenul e valid.</p>
            {servicii.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Serviciile contului tău. Bifează-le pe cele pe care vrei să le vadă cumpărătorul la comandă; nimic bifat înseamnă toate.
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
                      {!s.ramburs && <span className="text-muted-foreground">fără ramburs</span>}
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Contul nu are niciun serviciu activ. Verifică în panel.ecolet.ro.</p>
            )}
          </div>
        )}
      </Sectiune>

      {/*
        ⚠ Nu se ia din datele magazinului ca la ceilalti curieri: eColet cere un
        `locality_id` din nomenclatorul lor, care se cauta la salvare. Fara el,
        cotarea din checkout nici nu porneste.
      */}
      <Sectiune pas={2} titlu="De unde se ridică marfa"
        descriere="eColet are nevoie de localitatea din nomenclatorul lui, nu doar de numele orașului, de aceea adresa de ridicare se completează aici, o singură dată.">
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
          <Field label="Județ" htmlFor="ecolet-judet" required>
            <select id="ecolet-judet" value={judet} onChange={(ev) => setJudet(ev.target.value)} className={selectCls}>
              <option value="">Alege județul</option>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </Field>
          <Field label="Strada" required>
            <Input value={strada} onChange={(ev) => setStrada(ev.target.value)} placeholder="Bulevardul Eroilor" />
          </Field>
          <Field label="Număr">
            <Input value={numar} onChange={(ev) => setNumar(ev.target.value)} placeholder="12" />
          </Field>
          <Field label="Cod poștal" required>
            <Input value={codPostal} onChange={(ev) => setCodPostal(ev.target.value)} placeholder="400129" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Servicii adiționale"
        descriere="Se aplică la fiecare expediere și se tarifează separat de eColet. Serviciile care nu le acceptă, le ignoră.">
        <RandComutator titlu="Deschidere la livrare" activ={deschidere} onChange={setDeschidere} />
        <RandComutator separat titlu="Livrare sâmbătă" activ={sambata} onChange={setSambata} />
        <RandComutator separat titlu="Notificare prin SMS" activ={sms} onChange={setSms} />
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge tokenul și setările eColet din Edinio. Expedierile deja emise rămân pe comenzi.">
          <ButonDeconectare
            nume="eColet"
            cePierzi="Se șterge toată configurarea eColet din Edinio: tokenul, adresa de ridicare și serviciile bifate. Tokenul nu se mai poate citi din Edinio, deci ca să te întorci pui din nou unul din panel.ecolet.ro; expedierile deja emise rămân pe comenzi."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare
        modificat={isActive ? modificat : undefined}
        saving={saving}
        onSalveaza={handleSave}
        onRenunta={isActive ? renunta : undefined}
        textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
      />
    </PaginaIntegrare>
  );
}
