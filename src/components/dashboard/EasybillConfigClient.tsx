"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, ExternalLink, FileText, KeyRound, Landmark, Loader2, ReceiptText, RefreshCw, RotateCcw } from "lucide-react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { saveEasybillConfig, disconnectEasybill, testEasybillConfig } from "@/lib/actions/easybill.actions";
import { legaturaAnafValida, type EasybillConfig } from "@/lib/easybill/config";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * Configurarea easybill. Scheletul e cel comun al paginilor de integrari (`PaginaIntegrare`).
 *
 * ⚠ Parola soseste MASCATA (goala, cu `_completate`): orice hotarare pe ea trece prin
 * `secretulEsteSalvat`, nu prin valoarea din formular. Altfel un comerciant deja conectat n-ar mai
 * putea salva nicio modificare (lectia din 04.08.2026, `credentiale-write-only-mascare`).
 *
 * ⚠ „Testează conexiunea” NU salveaza nimic; salvarea face singura proba pe server si refuza
 * acreditarile pe care easybill le respinge (vezi `saveEasybillConfig`).
 *
 * Firma legata si legatura ANAF le scrie serverul, din raspunsul easybill; formularul doar le arata.
 */
export function EasybillConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: EasybillConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tested, setTested] = useState(false);
  /* Legatura ANAF adusa de ultima proba, inainte ca salvarea s-o scrie in configurare. */
  const [anafProba, setAnafProba] = useState<string | null>(null);

  const { cfg: form, setCfg: setForm, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<EasybillConfig>({
    enabled: initialConfig?.enabled ?? false,
    username: initialConfig?.username ?? "",
    password: initialConfig?.password ?? "",
    serie: initialConfig?.serie ?? "",
    due_days: initialConfig?.due_days ?? 0,
    auto_invoice: initialConfig?.auto_invoice ?? false,
    auto_invoice_trigger: initialConfig?.auto_invoice_trigger ?? "confirmed",
    mark_paid_online: initialConfig?.mark_paid_online ?? false,
  });

  function set<K extends keyof EasybillConfig>(field: K, value: EasybillConfig[K]) {
    /* Orice schimbare a contului face proba de dinainte invechita. */
    if (field === "username" || field === "password") {
      setTested(false);
      setAnafProba(null);
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const areParola = !!form.password || parolaSalvata;
  const contulComplet = areParola && !!form.username.trim();
  const isActive = !!(initialConfig?.enabled && parolaSalvata && initialConfig?.username);
  const anafSalvat = initialConfig?.anaf_url;
  const anafUrl = anafProba ?? (legaturaAnafValida(anafSalvat) ? anafSalvat : null);

  async function handleTest() {
    if (!contulComplet) {
      toast.error("Completează utilizatorul și parola API easybill.");
      return;
    }
    setTesting(true);
    try {
      const r = await testEasybillConfig(businessId, { username: form.username, password: form.password });
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
      } else {
        setTested(true);
        if (r.anafUrl && legaturaAnafValida(r.anafUrl)) setAnafProba(r.anafUrl);
        const firma = [r.firma, r.cui ? `CUI ${r.cui}` : ""].filter(Boolean).join(", ");
        toast.success(firma ? `easybill a acceptat utilizatorul API. Contul e al firmei ${firma}.` : "easybill a acceptat utilizatorul API.");
      }
    } catch {
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!form.username.trim()) return toast.error("Utilizatorul API easybill este obligatoriu.");
    if (!areParola) return toast.error("Parola utilizatorului API este obligatorie.");

    setSaving(true);
    try {
      const r = await saveEasybillConfig(businessId, { ...form, enabled: true });
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
        return;
      }
      if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
      else toast.success(isActive ? "Setările easybill au fost salvate." : "easybill e conectat. Facturile se pot emite din comenzi.");
      if (r.anafUrl && legaturaAnafValida(r.anafUrl)) setAnafProba(r.anafUrl);
      /* Parola tastata nu ramane in formular: dupa salvare apare ca „salvat”. */
      marcheazaSalvat({ ...form, enabled: true, password: "" });
      router.refresh();
    } catch {
      toast.error("Nu am primit răspuns de la server. Verifică dacă setările s-au salvat, apoi încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const r = await disconnectEasybill(businessId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("easybill a fost deconectat.");
      marcheazaSalvat({ ...form, enabled: false, password: "", username: "" });
      setTested(false);
      setAnafProba(null);
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  const stari: StareAntet[] = isActive
    ? [{ ton: "bun", text: "Activă" }, { ton: "info", text: "Facturi fiscale" }]
    : [{ ton: "neutru", text: "Neconfigurată" }];

  return (
    <PaginaIntegrare
      id="easybill"
      titlu="Facturare"
      descriere="Emiți facturi easybill din comenzi, manual sau automat, cu PDF-ul la îndemână în Edinio."
      stari={stari}
      aside={<>
        {isActive && (
          <CardCifre titlu="Contul legat" randuri={[
            { eticheta: "Utilizator API", valoare: <span className="font-mono">{initialConfig?.username}</span> },
            ...(initialConfig?.firma_nume ? [{ eticheta: "Firmă", valoare: initialConfig.firma_nume }] : []),
            ...(initialConfig?.firma_cui ? [{ eticheta: "CUI", valoare: <span className="font-mono">{initialConfig.firma_cui}</span> }] : []),
            { eticheta: "Serie", valoare: <span className="font-mono">{initialConfig?.serie || "implicită"}</span> },
          ]} />
        )}
        <ListaConfigurare pasi={[
          { text: "Utilizatorul API și parola", facut: contulComplet },
          { text: "Conexiunea verificată", facut: tested || isActive },
          { text: "Facturarea activă", facut: isActive },
        ]} />
        <CumFunctioneaza id="easybill" puncte={[
          { Icon: KeyRound, text: "În easybill: Setări, Automatizări, API Management. Creezi acolo un utilizator de tip API și îi scrii aici numele și parola." },
          { Icon: ReceiptText, text: "Emiți factura din pagina comenzii, în lot din lista de comenzi, sau automat, la statusul ales." },
          { Icon: RotateCcw, text: "Stornarea se face în easybill, din pagina facturii (Acțiuni factură, Stornare factură), apoi o înregistrezi în Edinio, din pagina comenzii. API-ul easybill nu are stornare." },
          { Icon: FileText, text: "PDF-ul îl aduce Edinio din easybill. Trimiterea în e-Factura o face easybill, după ce îi conectezi contul la ANAF." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul easybill" descriere="Utilizatorul de tip API din easybill și parola lui.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator API" htmlFor="easybill-utilizator" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Utilizatorul API"
              text="În contul easybill: Setări, Automatizări, API Management. Creează acolo un utilizator de tip API și folosește-i numele și parola. Un utilizator dedicat se poate opri oricând, fără să-ți atingă contul tău de lucru." />}>
            <Input id="easybill-utilizator" type="text" autoComplete="off" value={form.username}
              onChange={(e) => set("username", e.target.value)} className="font-mono" />
          </Field>
          {/* Si parola are semnul de intrebare: fara el, eticheta ei era mai joasa decat a utilizatorului,
              iar cele doua campuri stateau decalate pe acelasi rand. */}
          <Field label="Parolă" htmlFor="easybill-parola" required hint="Se păstrează criptată."
            ajutor={<ExplicatieCard marime="mic" intrebare="Care parolă" eticheta="Parola"
              text="Parola utilizatorului de tip API, cea pusă când l-ai creat în easybill (Setări, Automatizări, API Management), nu parola contului tău. O păstrăm criptată și n-o mai arătăm după salvare." />}>
            <Input id="easybill-parola" type="password" autoComplete="new-password" value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !contulComplet}>
            {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : <RefreshCw />}
            {testing ? "Se verifică..." : tested ? "Conexiune reușită" : "Testează conexiunea"}
          </Button>
          <a href="https://apps.easybill.ro/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide easybill <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Documentele" descriere="Seria și termenul de plată cu care pleacă facturile.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serie facturi" htmlFor="easybill-serie" hint="Gol = seria implicită din easybill."
            ajutor={<ExplicatieCard marime="mic" intrebare="Când o completez" eticheta="Seria facturilor"
              text="Lasă gol ca facturile să plece în seria implicită a contului easybill. Dacă vrei alta, scrie aici doar o serie care există deja în easybill; numărul îl dă easybill." />}>
            <Input id="easybill-serie" type="text" value={form.serie ?? ""} onChange={(e) => set("serie", e.target.value.trim())}
              placeholder="seria implicită" className="font-mono" />
          </Field>
          <Field label="Termen de plată (zile)" htmlFor="easybill-scadenta" hint="Pentru clienții noi creați de Edinio. 0 sau gol = ziua emiterii.">
            <Input id="easybill-scadenta" type="number" min={0} max={365} value={form.due_days || ""}
              onChange={(e) => set("due_days", Math.min(365, Math.max(0, Math.floor(Number(e.target.value) || 0))))} placeholder="0" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="e-Factura (ANAF)" descriere="easybill trimite facturile în SPV după ce îi dai acces la contul tău ANAF.">
        {anafUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={anafUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
              <Landmark />
              Conectează ANAF (e-Factura)
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Te duce la easybill, apoi la ANAF, unde te autentifici cu certificatul digital al firmei. Dacă ai conectat deja contul, nu mai e nevoie.
            </p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Apasă „Testează conexiunea” și aducem legătura de conectare la ANAF a contului tău easybill.
          </p>
        )}
      </Sectiune>

      <Sectiune pas={4} titlu="Încasarea" descriere="Factura unei comenzi plătite deja cu cardul poate pleca direct încasată.">
        <RandComutator
          titlu="Marchează factura încasată la plata online cu cardul"
          text="Când la emitere comanda e plătită cu cardul (Netopia, Stripe, BT iPay, Klarna, Revolut), înregistrăm plata în easybill, pe factură. Rambursul îl marchezi tu, când primești banii."
          activ={!!form.mark_paid_online}
          onChange={(v) => set("mark_paid_online", v)}
        />
      </Sectiune>

      <Sectiune pas={5} titlu="Generare automată" descriere="Factura se poate emite singură, când comanda ajunge la statusul ales.">
        <RandComutator
          titlu="Generare automată factură"
          text="Fără să mai apeși nimic în pagina comenzii."
          activ={!!form.auto_invoice}
          onChange={(v) => set("auto_invoice", v)}
        />
        {form.auto_invoice && (
          <Field label="Declanșează generarea când comanda devine" htmlFor="easybill-declansator"
            hint="Cu mai multe programe de facturare pe automat, se emite o singură factură: întâi SmartBill, apoi Oblio, fGO, Facturis, Factureaza.ro și easybill.">
            <select id="easybill-declansator" value={form.auto_invoice_trigger ?? "confirmed"}
              onChange={(e) => set("auto_invoice_trigger", e.target.value as AutoInvoiceTrigger)} className={selectCls}>
              {AUTO_INVOICE_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        )}
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge parola din Edinio. Facturile deja emise rămân în contul tău easybill.">
          <ButonDeconectare
            nume="easybill"
            cePierzi="Parola se șterge din Edinio și facturile nu se mai emit automat. Facturile deja emise rămân în contul tău easybill. Ca să te întorci, completezi din nou utilizatorul API și parola."
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
