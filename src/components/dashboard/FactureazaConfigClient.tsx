"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle, CreditCard, ExternalLink, FileText, FlaskConical, KeyRound, Layers, Loader2,
  ReceiptText, RefreshCw, RotateCcw,
} from "lucide-react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { saveFactureazaConfig, disconnectFactureaza, testFactureazaConfig } from "@/lib/actions/factureaza.actions";
import { mediul, stareaMediului, type FactureazaConfig, type MediuFactureaza, type SerieFactura } from "@/lib/factureaza/config";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune,
  ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";

/** Optiunile listei de serii: un PREFIX (seriile lor sunt pe an), cu starea lui pe anul curent. */
type OptiuneSerie = { prefix: string; areAnCurent: boolean; ultimulNumar: number | null };

function optiuniSerii(serii: SerieFactura[], an: string): OptiuneSerie[] {
  const pePrefix = new Map<string, OptiuneSerie>();
  for (const s of serii) {
    if (!s.prefix) continue;
    const o = pePrefix.get(s.prefix) ?? { prefix: s.prefix, areAnCurent: false, ultimulNumar: null };
    if (s.an === an) {
      o.areAnCurent = true;
      o.ultimulNumar = s.ultimulNumar;
    }
    pePrefix.set(s.prefix, o);
  }
  return [...pePrefix.values()].sort((a, b) => a.prefix.localeCompare(b.prefix, "ro"));
}

/**
 * Configurarea Factureaza.ro. Scheletul e cel comun al paginilor de integrari (`PaginaIntegrare`).
 *
 * ⚠ Cheia API soseste MASCATA (goala, cu `_completate`): orice hotarare pe ea trece prin
 * `secretulEsteSalvat`, nu prin valoarea din formular. Altfel un comerciant deja conectat n-ar mai
 * putea salva nicio modificare (lectia din 04.08.2026, `credentiale-write-only-mascare`).
 *
 * ⚠ „Testează conexiunea” NU salveaza nimic; aduce doar seriile, pentru lista. Salvarea face singura
 * proba pe server si refuza cheile pe care Factureaza.ro le respinge (vezi `saveFactureazaConfig`).
 *
 * ⚠ Seria se alege dupa PREFIX: la Factureaza.ro fiecare an are seria lui, iar Edinio o cauta pe
 * cea a anului la fiecare emitere. Din 1 ianuarie nu trebuie schimbat nimic aici, doar creata seria
 * noului an in Factureaza.ro.
 */
export function FactureazaConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FactureazaConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tested, setTested] = useState(false);
  const [serii, setSerii] = useState<{ lista: SerieFactura[]; an: string } | null>(null);
  const [firmaTestata, setFirmaTestata] = useState<{ nume: string; cif: string } | null>(null);

  const { cfg: form, setCfg: setForm, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<FactureazaConfig>({
    enabled: initialConfig?.enabled ?? false,
    api_key: initialConfig?.api_key ?? "",
    mediu: mediul(initialConfig),
    serie: initialConfig?.serie ?? "",
    serie_storno: initialConfig?.serie_storno ?? "",
    due_days: initialConfig?.due_days ?? 0,
    auto_invoice: initialConfig?.auto_invoice ?? false,
    auto_invoice_trigger: initialConfig?.auto_invoice_trigger ?? "confirmed",
    mark_paid_online: initialConfig?.mark_paid_online ?? false,
  });

  function set<K extends keyof FactureazaConfig>(field: K, value: FactureazaConfig[K]) {
    /* Orice schimbare a cheii sau a mediului face proba (si seriile aduse) invechite. */
    if (field === "api_key" || field === "mediu") {
      setTested(false);
      setSerii(null);
      setFirmaTestata(null);
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  /* ⚠ Mediul SALVAT (dupa el se emite acum) si cel ales in formular se spun separat; vezi
     `stareaMediului`. Antetul, randul „Mediu” si avertizarea vin toate de acolo. */
  const mediuSalvat = mediul(initialConfig);
  const stareMediu = stareaMediului(mediuSalvat, form.mediu ?? "productie");
  /* ⚠ Cheia salvata e a mediului salvat: dupa o schimbare de mediu nu se mai foloseste (serverul o
     refuza oricum, vezi `cheiaDeFolosit`), deci formularul cere cheia noului mediu. */
  const cheiaSalvataMerge = cheieSalvata && (form.mediu ?? "productie") === mediuSalvat;
  const ceriCheiaNoua = cheieSalvata && !cheiaSalvataMerge && !form.api_key.trim();
  const areCheia = !!form.api_key.trim() || cheiaSalvataMerge;
  const isActive = !!(initialConfig?.enabled && cheieSalvata && initialConfig?.serie);
  const eTest = form.mediu === "test";
  const optiuni = useMemo(() => (serii ? optiuniSerii(serii.lista, serii.an) : []), [serii]);
  const lipsaCheii = ceriCheiaNoua
    ? `Lipește cheia API pentru ${eTest ? "„Test”" : "„Real”"}: cheia salvată e a celuilalt mediu.`
    : "Completează cheia API Factureaza.ro.";

  async function handleTest() {
    if (!areCheia) {
      toast.error(lipsaCheii);
      return;
    }
    setTesting(true);
    try {
      const r = await testFactureazaConfig(businessId, { api_key: form.api_key, mediu: form.mediu });
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
        return;
      }
      setTested(true);
      setSerii({ lista: r.serii, an: r.an });
      setFirmaTestata(r.firma);
      const pe = optiuniSerii(r.serii, r.an);
      if (pe.length === 0) {
        toast.warning("Cheia e bună, dar contul nu are nicio serie de facturi. Creează una în Factureaza.ro (Setări, Serii documente), apoi testează din nou.", { duration: 12000 });
      } else {
        toast.success(r.firma?.nume ? `Factureaza.ro a acceptat cheia. Contul: ${r.firma.nume}.` : "Factureaza.ro a acceptat cheia API.");
        /* O singura serie pe anul curent: se alege singura, daca nu era aleasa alta. */
        const curente = pe.filter((o) => o.areAnCurent);
        if (!form.serie.trim() && curente.length === 1) set("serie", curente[0].prefix);
      }
    } catch {
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!areCheia) return toast.error(lipsaCheii);
    if (!form.serie.trim()) return toast.error("Alege seria facturilor.");

    setSaving(true);
    try {
      const r = await saveFactureazaConfig(businessId, { ...form, enabled: true });
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
        return;
      }
      if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
      else toast.success(isActive ? "Setările Factureaza.ro au fost salvate." : "Factureaza.ro e conectat. Facturile se pot emite din comenzi.");
      /* Cheia tastata nu ramane in formular: dupa salvare apare ca „salvat”. */
      marcheazaSalvat({ ...form, enabled: true, api_key: "" });
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
      const r = await disconnectFactureaza(businessId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Factureaza.ro a fost deconectat.");
      marcheazaSalvat({ ...form, enabled: false, api_key: "", serie: "", serie_storno: "" });
      setTested(false);
      setSerii(null);
      setFirmaTestata(null);
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [
      { ton: "bun", text: "Activă" },
      stareMediu.salvat === "test" ? { ton: "asteptare", text: "Mod test" } : { ton: "info", text: "Facturi fiscale" },
    ];

  const firma = firmaTestata ?? (initialConfig?.cont_firma || initialConfig?.cont_cif
    ? { nume: initialConfig?.cont_firma ?? "", cif: initialConfig?.cont_cif ?? "" }
    : null);

  /** Lista de serii, cand s-a adus; altfel un camp de text cu valoarea salvata (ca la Oblio). */
  function campSerie(id: string, valoare: string, onChange: (v: string) => void, gol: string) {
    if (!serii || optiuni.length === 0) {
      return (
        <Input id={id} type="text" value={valoare} onChange={(e) => onChange(e.target.value.trim())}
          placeholder={gol} className="font-mono" />
      );
    }
    const lipsa = valoare && !optiuni.some((o) => o.prefix === valoare);
    return (
      <select id={id} value={valoare} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        <option value="">{gol}</option>
        {lipsa && <option value={valoare}>{valoare} (nu mai există în cont)</option>}
        {optiuni.map((o) => (
          <option key={o.prefix} value={o.prefix} disabled={!o.areAnCurent}>
            {o.prefix}{o.areAnCurent
              ? (o.ultimulNumar !== null ? ` (ultimul număr ${o.ultimulNumar})` : "")
              : ` (nu are serie pe ${serii.an})`}
          </option>
        ))}
      </select>
    );
  }

  return (
    <PaginaIntegrare
      id="factureaza"
      titlu="Facturare"
      descriere="Emiți facturi Factureaza.ro din comenzi, manual sau automat, și le stornezi la nevoie."
      stari={stari}
      aside={<>
        {(isActive || firma) && (
          <CardCifre titlu="Contul legat" randuri={[
            ...(firma?.nume ? [{ eticheta: "Firmă", valoare: <span>{firma.nume}</span> }] : []),
            ...(firma?.cif ? [{ eticheta: "Cod fiscal", valoare: <span className="font-mono">{firma.cif}</span> }] : []),
            ...(initialConfig?.serie ? [{ eticheta: "Serie", valoare: <span className="font-mono">{initialConfig.serie}</span> }] : []),
            { eticheta: "Mediu", valoare: <span>{stareMediu.rand}</span> },
          ]} />
        )}
        <ListaConfigurare pasi={[
          { text: "Cheia API", facut: areCheia },
          { text: "Conexiunea verificată", facut: tested || isActive },
          { text: "Seria facturilor", facut: !!form.serie.trim() },
          { text: "Facturarea activă", facut: isActive },
        ]} />
        <CumFunctioneaza id="factureaza" puncte={[
          { Icon: KeyRound, text: "În Factureaza.ro: Contul meu, Cheie API. La „Ce poate face cheia” lași scrierea facturilor și a clienților." },
          { Icon: Layers, text: "Alegi prefixul seriei. Factureaza.ro are câte o serie pe an; Edinio o folosește pe cea a anului facturii." },
          { Icon: ReceiptText, text: "Emiți factura din pagina comenzii, în lot din lista de comenzi, sau automat, la statusul ales." },
          { Icon: RotateCcw, text: "Stornarea e o factură legată de cea stornată, cu liniile ei cu minus." },
          { Icon: FileText, text: "PDF-ul îl aduce Edinio din Factureaza.ro. Trimiterea în e-Factura (SPV) o face Factureaza.ro, din contul tău." },
          { Icon: FlaskConical, text: "În modul de test documentele merg în sandbox-ul public al Factureaza.ro, NU sunt fiscale și au un client inventat." },
        ]} />
      </>}
    >
      {/*
        ⚠⚠ MODUL DE TESTARE SE VEDE CAT TIMP E ALES (aceeasi lectie ca la fGO, 16.09.2026).
        Documentele din sandbox au numar, serie si PDF valid: pe pagina comenzii nu s-ar deosebi de
        unele adevarate. Un rand in jurnal nu se citeste; un panou deasupra configurarii, da.
      */}
      {stareMediu.avertizare && (
        <Callout variant="warning" icon={AlertTriangle} title={stareMediu.avertizare.titlu}>
          {stareMediu.avertizare.text}
        </Callout>
      )}

      <Sectiune pas={1} titlu="Contul Factureaza.ro" descriere="Cheia API a utilizatorului din Factureaza.ro. Cu ea aducem și seriile de facturi.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cheie API" htmlFor="factureaza-cheie" required
            hint={ceriCheiaNoua ? lipsaCheii : undefined}
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia API"
              text={eTest
                ? "În modul de test folosești cheia publică de test din documentația Factureaza.ro (Documentație API, secțiunea „Sistem sandbox”)."
                : "În contul Factureaza.ro: Contul meu, apoi Cheie API. La „Ce poate face cheia” cheia trebuie să poată scrie facturi și clienți. Fiecare utilizator are cheia lui."} />}>
            <Input id="factureaza-cheie" type="password" value={form.api_key}
              onChange={(e) => set("api_key", e.target.value.trim())}
              placeholder={cheiaSalvataMerge ? PLACEHOLDER_SECRET_SALVAT : ""} className="font-mono" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !areCheia}>
            {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : <RefreshCw />}
            {testing ? "Se verifică..." : tested ? "Conexiune reușită" : "Testează conexiunea"}
          </Button>
          <a href={eTest ? "https://factureaza.ro/documentatie-api" : "https://factureaza.ro/users/sign_in"} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            {eTest ? "Documentația Factureaza.ro" : "Deschide Factureaza.ro"} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {!serii && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            „Testează conexiunea” aduce și seriile de facturi din cont, ca să le alegi din listă.
          </p>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Documentele" descriere="Seriile și scadența cu care se emit facturile și stornările.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serie facturi" htmlFor="factureaza-serie" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Seria facturilor"
              text="Prefixul seriei din Factureaza.ro (Setări, Serii documente). Factureaza.ro are câte o serie pe an: în ianuarie creezi acolo seria noului an, cu același prefix, iar aici nu schimbi nimic." />}>
            {campSerie("factureaza-serie", form.serie, (v) => set("serie", v), serii ? "Alege seria" : "ex: FCT")}
          </Field>
          <Field label="Serie stornări" htmlFor="factureaza-serie-storno" hint="Gol = aceeași serie cu facturile.">
            {campSerie("factureaza-serie-storno", form.serie_storno ?? "", (v) => set("serie_storno", v), serii ? "Aceeași serie cu facturile" : (form.serie || "aceeași serie"))}
          </Field>
          <Field label="Scadență factură (zile)" htmlFor="factureaza-scadenta" hint="0 sau gol = data emiterii.">
            <Input id="factureaza-scadenta" type="number" min={0} max={365} value={form.due_days || ""}
              onChange={(e) => set("due_days", Math.min(365, Math.max(0, Math.floor(Number(e.target.value) || 0))))} placeholder="0" />
          </Field>
        </div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
          Pe linii pleacă și codul SKU din Edinio, ca să recunoști produsul. Clientul se caută în Factureaza.ro după nume și
          date; dacă nu există exact așa, se creează.
        </p>
      </Sectiune>

      <Sectiune pas={3} titlu="Încasarea" descriere="Factura unei comenzi plătite deja cu cardul poate pleca direct încasată.">
        <RandComutator
          titlu="Marchează factura încasată la plata online cu cardul"
          text="Când la emitere comanda e plătită cu cardul (Netopia, Stripe, BT iPay, Klarna, Revolut), înregistrăm plata în Factureaza.ro, legată de factură. Rambursul îl marchezi tu, când primești banii."
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
          <Field label="Declanșează generarea când comanda devine" htmlFor="factureaza-declansator"
            hint="Cu mai multe programe de facturare pe automat, se emite o singură factură: întâi SmartBill, apoi Oblio, fGO, Facturis, Factureaza.ro și easybill.">
            <select id="factureaza-declansator" value={form.auto_invoice_trigger ?? "confirmed"}
              onChange={(e) => set("auto_invoice_trigger", e.target.value as AutoInvoiceTrigger)} className={selectCls}>
              {AUTO_INVOICE_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        )}
      </Sectiune>

      <Sectiune pas={5} titlu="Mediul de lucru" descriere="În sandbox-ul Factureaza.ro probezi emiterea fără documente fiscale.">
        <AlegereCarduri<MediuFactureaza>
          eticheta="Mediul de lucru"
          valoare={form.mediu ?? "productie"}
          onChange={(v) => set("mediu", v)}
          optiuni={[
            {
              valoare: "test",
              titlu: "Test (sandbox)",
              text: <>Serverul <span className="font-mono">sandbox.factureaza.ro</span>, un cont public. Documentele NU sunt fiscale.</>,
              avertizare: true,
            },
            { valoare: "productie", titlu: "Real", text: "Facturi fiscale, în contul tău Factureaza.ro." },
          ]}
        />
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheia din Edinio. Facturile deja emise rămân în contul tău Factureaza.ro.">
          <ButonDeconectare
            nume="Factureaza.ro"
            cePierzi="Cheia se șterge din Edinio și facturile nu se mai emit automat. Facturile deja emise rămân în contul tău Factureaza.ro. Ca să te întorci, lipești din nou cheia API."
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
