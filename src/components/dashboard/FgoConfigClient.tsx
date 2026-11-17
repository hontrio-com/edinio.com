"use client";

import { useState } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ExternalLink, FlaskConical, KeyRound, Layers, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { saveFgoConfig, disconnectFgo, testFgoConfig } from "@/lib/actions/fgo.actions";
import type { FgoConfig } from "@/lib/fgo";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";

export function FgoConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FgoConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tested, setTested] = useState(false);

  const { cfg: form, setCfg: setForm, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<FgoConfig>({
    enabled: initialConfig?.enabled ?? false,
    sandbox: initialConfig?.sandbox ?? false,
    cod_unic: initialConfig?.cod_unic ?? "",
    private_key: initialConfig?.private_key ?? "",
    serie: initialConfig?.serie ?? "",
    platforma_url: initialConfig?.platforma_url ?? "",
    tip_factura: initialConfig?.tip_factura ?? "Factura",
    valuta: initialConfig?.valuta ?? "RON",
    auto_invoice: initialConfig?.auto_invoice ?? false,
    auto_invoice_trigger: initialConfig?.auto_invoice_trigger ?? "confirmed",
    due_days: initialConfig?.due_days ?? 0,
  });

  function set(field: keyof FgoConfig, value: string | boolean | number) {
    setTested(false);
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const isActive = !!(initialConfig?.enabled && initialConfig?.cod_unic && (initialConfig?.private_key || secretulEsteSalvat(initialConfig, "private_key")) && initialConfig?.serie);

  async function handleTest() {
    if (!form.cod_unic.trim() || (!form.private_key.trim() && !secretulEsteSalvat(initialConfig, "private_key"))) {
      toast.error("Completează CUI-ul și cheia privată.");
      return;
    }
    setTesting(true);
    const result = await testFgoConfig(businessId, form);
    setTesting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      setTested(true);
      // Mesajul spune exact ce s-a dovedit. Inainte scria „— N judete disponibile",
      // un numar venit dintr-un nomenclator PUBLIC, care nu avea nicio legatura cu
      // credentialele testate si dadea greutate unei confirmari care nu verificase
      // nimic. Vezi testFgoConnection in src/lib/fgo.ts.
      toast.success("fGO a acceptat CUI-ul și cheia privată.");
    }
  }

  async function handleSave() {
    if (!form.cod_unic.trim()) return toast.error("CUI-ul firmei este obligatoriu.");
    if ((!form.private_key.trim() && !secretulEsteSalvat(initialConfig, "private_key"))) return toast.error("Cheia privată este obligatorie.");
    if (!form.serie.trim()) return toast.error("Seria documentelor este obligatorie.");
    if (!form.platforma_url.trim()) return toast.error("URL-ul platformei este obligatoriu.");

    setSaving(true);
    const result = await saveFgoConfig(businessId, { ...form, enabled: true });
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configurația fGO a fost salvată.");
      marcheazaSalvat();
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectFgo(businessId);
    setDisconnecting(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("fGO a fost deconectat.");
      marcheazaSalvat({ ...form, enabled: false, cod_unic: "", private_key: "", serie: "" });
      setTested(false);
      router.refresh();
    }
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "private_key");
  const areCheia = !!form.private_key.trim() || cheieSalvata;
  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      { ton: "bun", text: "Activă" },
      initialConfig?.sandbox ? { ton: "asteptare", text: "Mod test" } : { ton: "info", text: "Facturi fiscale" },
    ];

  return (
    <PaginaIntegrare
      id="fgo"
      titlu="Facturare"
      descriere="Emiți facturi fGO din comenzi, manual sau automat."
      stari={stari}
      aside={<>
        {isActive && (
          <CardCifre titlu="Contul legat" randuri={[
            { eticheta: "CUI", valoare: <span className="font-mono">{initialConfig?.cod_unic}</span> },
            { eticheta: "Serie", valoare: <span className="font-mono">{initialConfig?.serie}</span> },
          ]} />
        )}
        <ListaConfigurare pasi={[
          { text: "CUI-ul și cheia privată", facut: !!form.cod_unic.trim() && areCheia },
          { text: "Seria documentelor", facut: !!form.serie.trim() },
          { text: "URL-ul platformei", facut: !!form.platforma_url.trim() },
          { text: "Facturarea activă", facut: isActive },
        ]} />
        <CumFunctioneaza id="fgo" puncte={[
          { Icon: KeyRound, text: "În contul fGO: Setări, Utilizatori. Generezi un utilizator API și copiezi cheia privată." },
          { Icon: Layers, text: "Seria facturilor o găsești în fGO, la Setări, Serii documente." },
          { Icon: ReceiptText, text: "Emiți factura din pagina comenzii sau automat, când comanda ajunge la statusul ales." },
          { Icon: FlaskConical, text: "Pe serverul de test (UAT) documentele NU sunt fiscale. Treci pe Real înainte de comenzile adevărate." },
        ]} />
      </>}
    >
      {/*
        ⚠⚠ MODUL DE TESTARE SE VEDE CAT TIMP E PORNIT (16.09.2026).

        Pana acum, singurul semn ca facturile nu sunt fiscale era numele comutatorului, si acela
        spunea doar CE SERVER se foloseste, nu CE INSEAMNA. Documentele emise in sandbox au numar,
        serie, link si PDF valid: pe pagina comenzii nu se deosebeau cu nimic de unele adevarate.

        ⚠ Masurat: magazinul `itp-blk` are trei astfel de facturi, toate pe `testuat.fgo.ro`.

        Scenariul de care ne aparam nu e cel manual, unde omul tocmai a apasat un buton, ci cel
        automat: comutatorul pornit, facturarea automata pornita, si luni intregi de „facturi" de
        test in urma. Un rand in jurnal nu se citeste; un panou rosu deasupra configurarii, da.
      */}
      {form.sandbox && (
        <Callout variant="warning" icon={AlertTriangle} title="Ești în modul de testare">
          Facturile emise acum pleacă pe serverul de test fGO și <strong>NU sunt documente fiscale</strong>,
          deși au număr, serie și PDF. Nu se pot trimite la eMAG sau Trendyol, iar la final de an nu țin
          loc de nimic. Alege „Real” la Mediul de lucru înainte de a factura comenzi adevărate.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Contul fGO" descriere="Codul fiscal al firmei și cheia privată a utilizatorului API din fGO.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="CUI firmă" htmlFor="fgo-cui" required hint="Codul fiscal al firmei (CUI sau CIF).">
            <Input id="fgo-cui" type="text" value={form.cod_unic} onChange={e => set("cod_unic", e.target.value.trim())} placeholder="ex: RO12345678" />
          </Field>
          <Field label="Cheie privată API" htmlFor="fgo-cheie" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia privată API"
              text="În contul fGO: Setări, apoi Utilizatori. Generezi un utilizator API și copiezi cheia privată afișată." />}>
            <Input id="fgo-cheie" type="password" value={form.private_key} onChange={e => set("private_key", e.target.value.trim())}
              placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} className="font-mono" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !form.cod_unic.trim() || !areCheia}>
            {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : <RefreshCw />}
            {testing ? "Se verifică..." : tested ? "Conexiune reușită" : "Testează conexiunea"}
          </Button>
          <a href="https://fgo.ro" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide fGO <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Documentele" descriere="Seria, valuta și scadența cu care se emit facturile.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serie documente" htmlFor="fgo-serie" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Seria documentelor"
              text="O configurezi în fGO, la Setări, apoi Serii documente." />}>
            <Input id="fgo-serie" type="text" value={form.serie} onChange={e => set("serie", e.target.value.trim().toUpperCase())}
              placeholder="ex: FCT" className="font-mono" />
          </Field>
          <Field label="Valuta" htmlFor="fgo-valuta">
            <select id="fgo-valuta" value={form.valuta} onChange={e => set("valuta", e.target.value)} className={selectCls}>
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </Field>
          <Field label="Tip factură" htmlFor="fgo-tip" hint="Lasă „Factura” dacă nu știi ce să alegi.">
            <Input id="fgo-tip" type="text" value={form.tip_factura} onChange={e => set("tip_factura", e.target.value)} placeholder="Factura" />
          </Field>
          <Field label="URL platformă" htmlFor="fgo-url" required
            ajutor={<ExplicatieCard marime="mic" intrebare="Ce scriu aici" eticheta="URL-ul platformei"
              text="Adresa principală a magazinului, de exemplu https://magazinul-tau.ro. fGO o primește la fiecare document emis." />}>
            <Input id="fgo-url" type="url" value={form.platforma_url} onChange={e => set("platforma_url", e.target.value.trim())} placeholder="https://edinio.com" />
          </Field>
          <Field label="Scadență factură (zile)" htmlFor="fgo-scadenta" hint="0 sau gol = data emiterii.">
            <Input id="fgo-scadenta" type="number" min={0} max={120} value={form.due_days || ""}
              onChange={e => set("due_days", Math.max(0, Math.floor(Number(e.target.value) || 0)))} placeholder="0" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Generare automată" descriere="Factura se poate emite singură, când comanda ajunge la statusul ales.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Generare automată factură</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Fără să mai apeși nimic în pagina comenzii.</p>
          </div>
          <Switch checked={form.auto_invoice} onCheckedChange={v => set("auto_invoice", v)} aria-label="Generare automată factură" />
        </div>
        {form.auto_invoice && (
          <Field label="Declanșează generarea când comanda devine" htmlFor="fgo-declansator"
            hint="Cu mai multe programe de facturare pe automat, se emite o singură factură: întâi SmartBill, apoi Oblio, fGO, Facturis, Factureaza.ro și easybill.">
            <select id="fgo-declansator" value={form.auto_invoice_trigger ?? "confirmed"}
              onChange={e => set("auto_invoice_trigger", e.target.value as AutoInvoiceTrigger)} className={selectCls}>
              {AUTO_INVOICE_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        )}
      </Sectiune>

      <Sectiune pas={4} titlu="Mediul de lucru" descriere="Pe serverul de test probezi emiterea fără documente fiscale.">
        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={form.sandbox}
          onChange={v => set("sandbox", v)}
          optiuni={[
            {
              valoare: true,
              titlu: "Test (UAT)",
              text: <>Serverul <span className="font-mono">api-testuat.fgo.ro</span>. Documentele emise așa NU sunt fiscale.</>,
              avertizare: true,
            },
            { valoare: false, titlu: "Real", text: "Facturi fiscale, pe serverul fGO." },
          ]}
        />
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheile din Edinio. Facturile deja emise rămân în contul tău fGO.">
          <ButonDeconectare
            nume="fGO"
            cePierzi="Cheile se șterg din Edinio și facturile nu se mai emit automat. Facturile deja emise rămân în contul tău fGO. Ca să te întorci, ceri din nou codul unic și cheia privată din contul tău fGO."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      {/* Salvarea ACTIVEAZA (`enabled: true`), deci pana la prima salvare bara sta mereu acolo. */}
      <BaraSalvare
        modificat={isActive ? modificat : undefined}
        saving={saving}
        onSalveaza={handleSave}
        onRenunta={isActive ? () => { renunta(); setTested(false); } : undefined}
        textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
      />
    </PaginaIntegrare>
  );
}
