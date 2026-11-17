"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, CreditCard, ExternalLink, FileText, KeyRound, Loader2, ReceiptText, RefreshCw, RotateCcw } from "lucide-react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { saveFacturisConfig, disconnectFacturis, testFacturisConfig } from "@/lib/actions/facturis.actions";
import type { FacturisConfig } from "@/lib/facturis/config";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";

/**
 * Configurarea Facturis Online. Scheletul e cel comun al paginilor de integrari (`PaginaIntegrare`).
 *
 * ⚠ Cheia API si parola sosesc MASCATE (goale, cu `_completate`): orice hotarare pe ele trece prin
 * `secretulEsteSalvat`, nu prin valoarea din formular. Altfel un comerciant deja conectat n-ar mai
 * putea salva nicio modificare (lectia din 04.08.2026, `credentiale-write-only-mascare`).
 *
 * ⚠ „Testează conexiunea" NU salveaza nimic; salvarea face singura proba pe server si refuza cheile
 * pe care Facturis le respinge (vezi `saveFacturisConfig`).
 */
export function FacturisConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FacturisConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tested, setTested] = useState(false);

  const { cfg: form, setCfg: setForm, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<FacturisConfig>({
    enabled: initialConfig?.enabled ?? false,
    api_key: initialConfig?.api_key ?? "",
    username: initialConfig?.username ?? "",
    password: initialConfig?.password ?? "",
    cif: initialConfig?.cif ?? "",
    serie: initialConfig?.serie ?? "",
    serie_storno: initialConfig?.serie_storno ?? "",
    due_days: initialConfig?.due_days ?? 0,
    auto_invoice: initialConfig?.auto_invoice ?? false,
    auto_invoice_trigger: initialConfig?.auto_invoice_trigger ?? "confirmed",
    mark_paid_online: initialConfig?.mark_paid_online ?? false,
    gestiune: initialConfig?.gestiune ?? "",
    punct_de_lucru: initialConfig?.punct_de_lucru ?? "",
  });

  function set<K extends keyof FacturisConfig>(field: K, value: FacturisConfig[K]) {
    /* Orice schimbare a contului face proba de dinainte invechita. */
    if (field === "api_key" || field === "username" || field === "password" || field === "cif") setTested(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const areCheia = !!form.api_key.trim() || cheieSalvata;
  const areParola = !!form.password || parolaSalvata;
  const contulComplet = areCheia && areParola && !!form.username.trim() && !!form.cif.trim();
  const isActive = !!(initialConfig?.enabled && cheieSalvata && parolaSalvata && initialConfig?.username && initialConfig?.cif && initialConfig?.serie);

  async function handleTest() {
    if (!contulComplet) {
      toast.error("Completează cheia API, utilizatorul, parola și codul fiscal.");
      return;
    }
    setTesting(true);
    try {
      const r = await testFacturisConfig(businessId, {
        api_key: form.api_key, username: form.username, password: form.password, cif: form.cif,
      });
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
      } else {
        setTested(true);
        toast.success("Facturis a acceptat cheia API, utilizatorul și codul fiscal.");
      }
    } catch {
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!areCheia) return toast.error("Cheia API Facturis este obligatorie.");
    if (!form.username.trim()) return toast.error("Utilizatorul Facturis este obligatoriu.");
    if (!areParola) return toast.error("Parola utilizatorului Facturis este obligatorie.");
    if (!form.cif.trim()) return toast.error("Codul fiscal al firmei este obligatoriu.");
    if (!form.serie?.trim()) return toast.error("Seria facturilor este obligatorie.");

    setSaving(true);
    try {
      const r = await saveFacturisConfig(businessId, { ...form, enabled: true });
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
        return;
      }
      if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
      else toast.success(isActive ? "Setările Facturis au fost salvate." : "Facturis e conectat. Facturile se pot emite din comenzi.");
      /* Secretele tastate nu raman in formular: dupa salvare apar ca „salvat". */
      marcheazaSalvat({ ...form, enabled: true, api_key: "", password: "" });
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
      const r = await disconnectFacturis(businessId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Facturis a fost deconectat.");
      marcheazaSalvat({ ...form, enabled: false, api_key: "", password: "", username: "", cif: "" });
      setTested(false);
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
      id="facturis"
      titlu="Facturare"
      descriere="Emiți facturi Facturis Online din comenzi, manual sau automat, și le stornezi la nevoie."
      stari={stari}
      aside={<>
        {isActive && (
          <CardCifre titlu="Contul legat" randuri={[
            { eticheta: "Utilizator", valoare: <span className="font-mono">{initialConfig?.username}</span> },
            { eticheta: "Cod fiscal", valoare: <span className="font-mono">{initialConfig?.cif}</span> },
            { eticheta: "Serie", valoare: <span className="font-mono">{initialConfig?.serie}</span> },
          ]} />
        )}
        <ListaConfigurare pasi={[
          { text: "Cheia API și utilizatorul", facut: areCheia && areParola && !!form.username.trim() },
          { text: "Codul fiscal al firmei", facut: !!form.cif.trim() },
          { text: "Seria facturilor", facut: !!form.serie?.trim() },
          { text: "Facturarea activă", facut: isActive },
        ]} />
        <CumFunctioneaza id="facturis" puncte={[
          { Icon: KeyRound, text: "În Facturis: Setări, Integrări, API. Apeși „Generează Cheia” și lași câmpul „Ip Acces” gol." },
          { Icon: ReceiptText, text: "Emiți factura din pagina comenzii, în lot din lista de comenzi, sau automat, la statusul ales." },
          { Icon: RotateCcw, text: "Stornarea e o factură cu cantitățile cu minus, copiată din factura originală." },
          { Icon: FileText, text: "PDF-ul îl aduce Edinio din Facturis. Trimiterea în e-Factura (SPV) o face Facturis, din contul tău." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul Facturis" descriere="Cheia API și datele utilizatorului care a generat-o, plus codul fiscal al firmei.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cheie API" htmlFor="facturis-cheie" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia API"
              text="În contul Facturis, cu utilizatorul administrator: Setări, Integrări, API, apoi „Generează Cheia”. Lasă câmpul „Ip Acces” gol: Edinio trimite cererile de pe mai multe adrese, iar o cheie legată de un IP ar fi refuzată." />}>
            <Input id="facturis-cheie" type="password" value={form.api_key} onChange={(e) => set("api_key", e.target.value.trim())}
              placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} className="font-mono" />
          </Field>
          <Field label="Cod fiscal firmă" htmlFor="facturis-cif" required
            ajutor={<ExplicatieCard marime="mic" intrebare="Cum îl scriu" eticheta="Codul fiscal"
              text="Exact cum apare în Facturis, la datele firmei (de exemplu RO 31234567). Facturis verifică cheia pe firma asta." />}>
            <Input id="facturis-cif" type="text" value={form.cif} onChange={(e) => set("cif", e.target.value)} placeholder="ex: RO 31234567" />
          </Field>
          <Field label="Utilizator Facturis" htmlFor="facturis-utilizator" required hint="Utilizatorul care a generat cheia API.">
            <Input id="facturis-utilizator" type="text" autoComplete="off" value={form.username} onChange={(e) => set("username", e.target.value)} />
          </Field>
          <Field label="Parolă" htmlFor="facturis-parola" required hint="Parola acelui utilizator. Se păstrează criptată.">
            <Input id="facturis-parola" type="password" value={form.password} onChange={(e) => set("password", e.target.value)}
              placeholder={parolaSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !contulComplet}>
            {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : <RefreshCw />}
            {testing ? "Se verifică..." : tested ? "Conexiune reușită" : "Testează conexiunea"}
          </Button>
          <a href="https://app.facturis-online.ro/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Deschide Facturis <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Documentele" descriere="Seriile și scadența cu care se emit facturile și stornările.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serie facturi" htmlFor="facturis-serie" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Seria facturilor"
              text="Seria trebuie să existe deja în Facturis; numărul îl dă Facturis. O serie necunoscută e refuzată la emitere." />}>
            <Input id="facturis-serie" type="text" value={form.serie} onChange={(e) => set("serie", e.target.value.trim())}
              placeholder="ex: EDN" className="font-mono" />
          </Field>
          <Field label="Serie stornări" htmlFor="facturis-serie-storno" hint="Gol = aceeași serie cu facturile.">
            <Input id="facturis-serie-storno" type="text" value={form.serie_storno ?? ""} onChange={(e) => set("serie_storno", e.target.value.trim())}
              placeholder={form.serie || "aceeași serie"} className="font-mono" />
          </Field>
          <Field label="Scadență factură (zile)" htmlFor="facturis-scadenta" hint="0 sau gol = data emiterii.">
            <Input id="facturis-scadenta" type="number" min={0} max={365} value={form.due_days || ""}
              onChange={(e) => set("due_days", Math.min(365, Math.max(0, Math.floor(Number(e.target.value) || 0))))} placeholder="0" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Încasarea" descriere="Factura unei comenzi plătite deja cu cardul poate pleca direct încasată.">
        <RandComutator
          titlu="Marchează factura încasată la plata online cu cardul"
          text="Când la emitere comanda e plătită cu cardul (Netopia, Stripe, BT iPay, Klarna, Revolut), înregistrăm încasarea în Facturis, legată de factură. Rambursul îl marchezi tu, când primești banii."
          activ={!!form.mark_paid_online}
          onChange={(v) => set("mark_paid_online", v)}
        />
      </Sectiune>

      <Sectiune pas={4} titlu="Generare automată" descriere="Factura se poate emite singură, când comanda ajunge la statusul ales.">
        <RandComutator
          titlu="Generare automată factură"
          text="Fără să mai apeși nimic în pagina comenzii."
          activ={!!form.auto_invoice}
          onChange={(v) => set("auto_invoice", v)}
        />
        {form.auto_invoice && (
          <Field label="Declanșează generarea când comanda devine" htmlFor="facturis-declansator"
            hint="Cu mai multe programe de facturare pe automat, se emite o singură factură: întâi SmartBill, apoi Oblio, fGO, Facturis, Factureaza.ro și easybill.">
            <select id="facturis-declansator" value={form.auto_invoice_trigger ?? "confirmed"}
              onChange={(e) => set("auto_invoice_trigger", e.target.value as AutoInvoiceTrigger)} className={selectCls}>
              {AUTO_INVOICE_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        )}
      </Sectiune>

      <Sectiune pas={5} titlu="Gestiunea" descriere="Doar dacă ții stocul în Facturis, pe mai multe gestiuni sau puncte de lucru.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gestiune" htmlFor="facturis-gestiune" hint="Gol = gestiunea implicită a contului.">
            <Input id="facturis-gestiune" type="text" value={form.gestiune ?? ""} onChange={(e) => set("gestiune", e.target.value)} />
          </Field>
          <Field label="Punct de lucru" htmlFor="facturis-punct" hint="Gol = punctul de lucru implicit.">
            <Input id="facturis-punct" type="text" value={form.punct_de_lucru ?? ""} onChange={(e) => set("punct_de_lucru", e.target.value)} />
          </Field>
        </div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
          Produsele se leagă de stocul din Facturis după codul SKU din Edinio. Un produs fără SKU apare pe factură doar cu numele.
        </p>
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheile din Edinio. Facturile deja emise rămân în contul tău Facturis.">
          <ButonDeconectare
            nume="Facturis"
            cePierzi="Cheile se șterg din Edinio și facturile nu se mai emit automat. Facturile deja emise rămân în contul tău Facturis. Ca să te întorci, completezi din nou cheia API și datele utilizatorului."
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
