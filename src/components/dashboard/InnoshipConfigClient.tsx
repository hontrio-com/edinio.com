"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Copy, Info, Loader2, Stethoscope, Unplug } from "lucide-react";
import {
  diagnosticInnoshipAction,
  disconnectInnoship,
  saveInnoshipConfig,
  testInnoshipConnectionAction,
} from "@/lib/actions/innoship.actions";
import type { CurierInnoship, FormatEticheta, InnoshipConfig, TipEticheta } from "@/lib/innoship/client";
import { suprapuneri, textSuprapunere } from "@/lib/innoship/suprapunere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea Innoship.
 *
 * ⚠ Doua lucruri fac ecranul asta altfel decat celelalte configurari de curier:
 *
 * 1. **Filtrul de curieri nu e o inlesnire, e o conditie de lizibilitate.**
 *    Innoship agrega ~230 de curieri; nefiltrat, un cont larg poate umple
 *    checkout-ul cu zeci de oferte aproape identice.
 *
 * 2. **Avertismentul de suprapunere** (varianta B, hotarata cu clientul): cand un
 *    curier e activ si direct, si prin Innoship, cumparatorul vede ambele variante
 *    la preturi diferite. Nu e defect — sunt doua contracte adevarate, si cel
 *    direct e adesea mai ieftin — dar trebuie SPUS, altfel arata a dublura.
 */

const FORMATE: FormatEticheta[] = ["A4", "A6", "A5", "A6_300dpi", "A4_4xA6", "A6_10x9", "T_85x85"];
const TIPURI: TipEticheta[] = ["Pdf", "Zpl", "Html", "Epl", "Clp"];

export function InnoshipConfigClient({
  businessId,
  initialConfig,
  /** Curierii pe care magazinul ii are pornit in „Setari → Livrare". */
  curieriActiviDirect,
  /** URL-ul de baza al platformei, pentru adresa de webhook. */
  baseUrl,
}: {
  businessId: string;
  initialConfig: InnoshipConfig | null;
  curieriActiviDirect: string[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [diagnosticand, setDiagnosticand] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Awaited<ReturnType<typeof diagnosticInnoshipAction>> | null>(null);
  const [curieri, setCurieri] = useState<CurierInnoship[] | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [depozit, setDepozit] = useState(initialConfig?.external_client_location ?? "");
  const [permisi, setPermisi] = useState<number[]>(initialConfig?.curieri_permisi ?? []);
  const [format, setFormat] = useState<FormatEticheta>(initialConfig?.format_eticheta ?? "A6");
  const [tip, setTip] = useState<TipEticheta>(initialConfig?.tip_eticheta ?? "Pdf");
  const [observatii, setObservatii] = useState(initialConfig?.observatii ?? "");
  const s = initialConfig?.servicii ?? {};
  const [openPackage, setOpenPackage] = useState(!!s.openPackage);
  const [saturday, setSaturday] = useState(!!s.saturdayDelivery);
  const [returDocumente, setReturDocumente] = useState(!!s.returnOfDocuments);

  const areCheie = apiKey.trim() !== "" || secretulEsteSalvat(initialConfig, "api_key");
  const isActive = !!(initialConfig?.enabled && initialConfig.external_client_location && secretulEsteSalvat(initialConfig, "api_key"));

  /*
   * ⚠ URL-ul de webhook se arata DOAR daca secretul exista deja in configurare.
   * El se naste la prima salvare, iar aratat inainte ar fi un link mort pe care
   * omul l-ar lipi in portalul Innoship si ar astepta degeaba.
   */
  const urlWebhook = initialConfig?.webhook_secret
    ? `${baseUrl}/api/innoship/track?secret=${initialConfig.webhook_secret}`
    : null;

  /* Varianta B: se calculeaza din catalogul VIU, deci apare dupa proba de conexiune. */
  const lista = suprapuneri(curieri ?? [], curieriActiviDirect, permisi);
  const avertismentSuprapunere = textSuprapunere(lista);

  function construieste(): InnoshipConfig {
    return {
      enabled: true,
      api_key: apiKey.trim(),
      external_client_location: depozit.trim(),
      webhook_secret: initialConfig?.webhook_secret,
      curieri_permisi: permisi,
      format_eticheta: format,
      tip_eticheta: tip,
      observatii: observatii.trim(),
      servicii: {
        openPackage,
        saturdayDelivery: saturday,
        returnOfDocuments: returDocumente,
      },
    };
  }

  async function handleTest() {
    if (!areCheie) return toast.error("Completeaza cheia de API");
    setTesting(true);
    const r = await testInnoshipConnectionAction(businessId, construieste());
    setTesting(false);
    if (!r.ok) { setCurieri(null); return toast.error(`Innoship: ${r.error}`); }
    setCurieri(r.curieri);
    toast.success(`Conexiune reusita — ${r.curieri.length} curieri disponibili`);
  }

  async function handleDiagnostic() {
    setDiagnosticand(true);
    const r = await diagnosticInnoshipAction(businessId);
    setDiagnosticand(false);
    setDiagnostic(r);
    if (!r.ok) toast.error(r.error);
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completeaza cheia de API");
    if (!depozit.trim()) {
      return toast.error("Completeaza id-ul depozitului („External Client Location” din portalul Innoship)");
    }
    setSaving(true);
    const r = await saveInnoshipConfig(businessId, construieste());
    setSaving(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Configurare salvata");
    setApiKey("");
    router.refresh();
  }

  async function handleDisconnect() {
    if (!confirm("Sigur deconectezi Innoship? Comenzile cu AWB emis isi pastreaza numarul.")) return;
    setDisconnecting(true);
    const r = await disconnectInnoship(businessId);
    setDisconnecting(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Innoship deconectat");
    router.refresh();
  }

  function comutaCurier(id: number) {
    setPermisi((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="Innoship activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          Depozit {initialConfig?.external_client_location}
          {permisi.length > 0 ? ` · ${permisi.length} curieri alesi` : " · toti curierii contului"}
        </Callout>
      )}

      {avertismentSuprapunere && (
        <Callout variant="warning" icon={AlertTriangle} title="Acelasi curier, pe doua contracte">
          {avertismentSuprapunere}
        </Callout>
      )}

      {/* ── 1. Contul ────────────────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</span>
          <h3 className="text-sm font-semibold text-foreground">Contul Innoship</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Cheia de API si id-ul depozitului le primesti de la Innoship. Depozitul e cel
          configurat la ei in „Locations”, iar el declanseaza fiecare expediere.
        </p>

        <Field label="Cheie de API" required>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setCurieri(null); }}
            placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "Cheia primita de la Innoship"}
          />
        </Field>

        <Field label="Id depozit (External Client Location)" required hint="Din portalul Innoship, sectiunea Locations.">
          <Input value={depozit} onChange={(e) => setDepozit(e.target.value)} placeholder="DEPOZIT-1" />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTest} disabled={testing || !areCheie}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifica..." : "Testeaza conexiunea"}
          </Button>
          {isActive && (
            <Button variant="outline" onClick={handleDiagnostic} disabled={diagnosticand}>
              {diagnosticand ? <Loader2 className="animate-spin" /> : <Stethoscope />}
              Diagnostic
            </Button>
          )}
        </div>

        {diagnostic?.ok && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Ce a raspuns Innoship</p>
            <p>{diagnostic.curieri} curieri · {diagnostic.puncte} puncte de ridicare in Romania
              {diagnostic.puncteFaraNume > 0 ? `, dintre care ${diagnostic.puncteFaraNume} fara denumire recunoscuta` : ""}.</p>
            {diagnostic.puncteFaraNume > 0 && (
              <p className="text-warning">
                Punctele fara denumire apar in checkout doar cu localitatea. Trimite-ne lista
                de campuri de mai jos si o reparam.
              </p>
            )}
            {diagnostic.cheiPuncte.length > 0 && (
              <details>
                <summary className="cursor-pointer">Campurile nomenclatorului de puncte</summary>
                <ul className="mt-1 space-y-0.5">
                  {diagnostic.cheiPuncte.map((c) => <li key={c.cheie}><code>{c.cheie}</code>: {c.exemplu}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </Panel>

      {/* ── 2. Curierii ──────────────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">2</span>
          <h3 className="text-sm font-semibold text-foreground">Ce curieri vede cumparatorul</h3>
        </div>
        {/*
          ⚠ Nu e o inlesnire: Innoship agrega ~230 de curieri. Nefiltrat, un cont
          larg poate intoarce zeci de oferte pentru aceeasi comanda, iar un checkout
          cu douazeci de randuri aproape identice nu se citeste.
        */}
        <p className="text-xs text-muted-foreground">
          Bifeaza curierii pe care vrei sa-i vada cumparatorul. Nimic bifat inseamna toti
          cei pe care ii da contul tau — ceea ce, la un cont larg, poate umple checkout-ul.
        </p>

        {curieri === null ? (
          <p className="text-xs text-muted-foreground">Apasa „Testeaza conexiunea” ca sa se incarce lista.</p>
        ) : curieri.length === 0 ? (
          <p className="text-xs text-muted-foreground">Contul nu are niciun curier activ.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {curieri.map((c) => {
              const id = Number(c.courierId);
              const seSuprapune = lista.some((x) => x.courierIdInnoship === id);
              return (
                <label key={id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={permisi.includes(id)} onChange={() => comutaCurier(id)} />
                  <span className="flex-1">{c.courierDisplayName || c.courier}</span>
                  {seSuprapune && (
                    <span className="text-warning">il ai si direct</span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── 3. Urmarirea ─────────────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">3</span>
          <h3 className="text-sm font-semibold text-foreground">Urmarirea coletelor</h3>
        </div>
        <Callout variant="info" icon={Info} title="Pune adresa asta in portalul Innoship">
          La „Track push”. Innoship o sa trimita acolo fiecare schimbare de status, iar
          comenzile se misca singure. Fara ea, urmarirea merge tot — dar dintr-o
          verificare periodica, deci mai rar.
        </Callout>

        {urlWebhook ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">{urlWebhook}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void navigator.clipboard.writeText(urlWebhook); toast.success("Adresa copiata"); }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiaza
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Adresa se genereaza la prima salvare a configurarii.
          </p>
        )}
      </Panel>

      {/* ── 4. Eticheta si serviciile ────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">4</span>
          <h3 className="text-sm font-semibold text-foreground">Eticheta si serviciile</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Format eticheta">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as FormatEticheta)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {FORMATE.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Tip fisier" hint="Zpl si Epl sunt pentru imprimante de etichete.">
            <select
              value={tip}
              onChange={(e) => setTip(e.target.value as TipEticheta)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {TIPURI.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Observatii pe eticheta" hint="Cel mult 500 de caractere.">
          <Input value={observatii} onChange={(e) => setObservatii(e.target.value)} maxLength={500} />
        </Field>

        {[
          { v: openPackage, set: setOpenPackage, eticheta: "Deschidere colet la livrare", explicatie: "Destinatarul poate verifica marfa inainte sa plateasca." },
          { v: saturday, set: setSaturday, eticheta: "Livrare sambata", explicatie: "Doar la curierii care o ofera in contractul tau." },
          { v: returDocumente, set: setReturDocumente, eticheta: "Retur de documente", explicatie: "Curierul aduce inapoi documentele semnate." },
        ].map((b) => (
          <div key={b.eticheta} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">{b.eticheta}</p>
              <p className="text-xs text-muted-foreground">{b.explicatie}</p>
            </div>
            <Switch checked={b.v} onCheckedChange={b.set} />
          </div>
        ))}
      </Panel>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza configurarea"}
      </Button>
    </div>
  );
}
