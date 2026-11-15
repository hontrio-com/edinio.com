"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, Landmark, Layers, Loader2, ReceiptText, RefreshCw, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { saveOblioConfig, disconnectOblio, loadOblioAccountData, loadOblioSeriesForCif } from "@/lib/actions/oblio.actions";
import type { OblioConfig } from "@/lib/oblio";
import { AUTO_INVOICE_TRIGGERS, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { Callout } from "@/components/ui/callout";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { alegeGestiunea, gestiuneaECeruta, stareOblio, type ListaGestiuni } from "@/lib/oblio-stare";

type AccountData = {
  companies: { cif: string; name: string }[];
  series: { type: string; name: string; default: boolean }[];
  vatRates: { name: string; percent: number; default: boolean }[];
  /* ⚠ `null` = n-am putut intreba, `[]` = contul n-are stocuri, lista = are.
     Vezi `ListaGestiuni` in src/lib/oblio-stare.ts — deosebirea asta e chiar
     defectul reparat pe 01.09.2026. */
  management: ListaGestiuni;
};

export default function OblioConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: OblioConfig | null;
}) {
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false);
  const [clientId, setClientId] = useState(initialConfig?.client_id ?? "");
  const [clientSecret, setClientSecret] = useState(initialConfig?.client_secret ?? "");
  const [cif, setCif] = useState(initialConfig?.cif ?? "");
  const [companyName, setCompanyName] = useState(initialConfig?.company_name ?? "");
  const [seriesInvoice, setSeriesInvoice] = useState(initialConfig?.series_invoice ?? "");
  const [seriesProforma, setSeriesProforma] = useState(initialConfig?.series_proforma ?? "");
  const [management, setManagement] = useState(initialConfig?.management ?? "");
  const [vatName, setVatName] = useState(initialConfig?.vat_name ?? "Normala");
  const [vatPercentage, setVatPercentage] = useState(initialConfig?.vat_percentage ?? 19);
  const [autoInvoice, setAutoInvoice] = useState(initialConfig?.auto_invoice ?? false);
  const [autoInvoiceTrigger, setAutoInvoiceTrigger] = useState<AutoInvoiceTrigger>(initialConfig?.auto_invoice_trigger ?? "confirmed");
  const [productType, setProductType] = useState(initialConfig?.product_type ?? "Marfa");
  const [dueDays, setDueDays] = useState(initialConfig?.due_days ?? 0);
  const [sendToSpv, setSendToSpv] = useState(initialConfig?.send_to_spv ?? false);
  const [noStock, setNoStock] = useState(initialConfig?.no_stock ?? false);
  /* ⚠ `?? false`: oprit din oficiu, ca la SmartBill. Vezi comutatorul si motivul de mai jos. */
  const [sendEmail, setSendEmail] = useState(initialConfig?.send_email ?? false);

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [loadError, setLoadError] = useState("");

  const [loading, startLoadTransition] = useTransition();
  const [loadingCif, startLoadCifTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const [disconnecting, startDisconnectTransition] = useTransition();
  const router = useRouter();

  const isConnected = !!(initialConfig?.client_id && initialConfig?.cif);
  const invoiceSeries = accountData?.series.filter(s => s.type === "Factura") ?? [];
  const proformaSeries = accountData?.series.filter(s => s.type === "Proforma") ?? [];
  /* ⚠ `null` cat timp n-am intrebat inca sau intrebarea a picat. NU se
     prefacere in `[]`: aia ar insemna „contul n-are stocuri", si tocmai
     confuzia asta lasa integrarea sa se salveze fara gestiune. */
  const gestiuni: ListaGestiuni = accountData ? accountData.management : null;

  /*
    ═══ ⚠ CE VEDE OMUL DESPRE STAREA INTEGRARII ═══

    Pana pe 01.09.2026 pagina asta nu spunea NIMIC despre starea ei. Un client
    (VetDepo) a apasat „Testeaza si incarca date", a primit „Conexiune reusita!
    1 firma gasita", a apasat „Salveaza", a primit „Configuratie Oblio salvata"
    — doua mesaje verzi — si integrarea a ramas stinsa. La Integrari scria
    neconectat, in Comenzi nu era butonul de factura, si nimic de pe pagina nu
    lamurea de ce.

    ⚠ SI NU E VINA LUI. Configuratia lui purta chiar semnatura butonului de test:
    numele firmei, seria si cota se completeaza SINGURE, numai de acolo. A urmat
    fluxul asa cum e desenat.

    ⚠ DE CE NU FACEM CA LA fGO, unde salvarea inseamna activare (`{ ...form,
    enabled: true }`) si nu exista comutator: aici comutatorul e o purtare
    ceruta — opresti facturarea fara sa pierzi acreditarile. Se pastreaza, dar
    starea lui devine vizibila, iar salvarea unei configuratii complete cu el
    stins nu mai trece in tacere.
  */
  const { complet, activ, lipsesteGestiunea, poateSalva } = stareOblio({
    clientId, cif, seriesInvoice, enabled, management, gestiuni,
  });

  /*
    Bara de salvare apare doar cand formularul s-a departat de ultima salvare. Fara „Renunta":
    listele (serii, cote, gestiuni) vin din Oblio pentru firma aleasa, deci intoarcerea doar a
    valorilor ar lasa firma veche langa seriile celei noi.
  */
  const valori = {
    enabled, clientId, clientSecret, cif, companyName, seriesInvoice, seriesProforma, management, vatName,
    vatPercentage, autoInvoice, autoInvoiceTrigger, productType, dueDays, sendToSpv, noStock, sendEmail,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);

  /*
    ═══ ⚠ NOMENCLATORUL SE CERE LA DESCHIDEREA PAGINII ═══

    ⚠ FARA EFECTUL ASTA, TOATA REPARATIA DE GESTIUNE E MOARTA. `accountData`
    pornea `null` si se umplea DOAR la apasarea butonului „Testeaza si incarca
    date". Cine deschidea pagina unei integrari deja configurate si apasa direct
    „Salveaza" nu vedea campul de gestiune (se arata doar cand lista e negoala),
    nu declansa validarea, si trimitea un config fara `management`.

    Masurat: campul a fost desfasurat, si VetDepo tot a salvat fara gestiune la
    10:19:40 UTC. Codul era in productie si nu schimba nimic pe calea umblata.

    ⚠ RULEAZA O SINGURA DATA, si numai cand exista deja acreditari salvate.
    `pornit` opreste a doua rulare: fara el, `cif` se schimba din raspuns si
    efectul s-ar rechema singur. Nu se cere nimic pentru o integrare noua — acolo
    omul apasa oricum butonul de test.

    ⚠ UN ESEC AICI NU STRICA NIMIC: `management` ramane `null` („n-am putut
    intreba"), campul nu se arata, alegerea salvata nu se sterge, si pe server
    gestiunea veche se pastreaza oricum. Vezi `saveOblioConfig`.
  */
  const pornit = useRef(false);
  useEffect(() => {
    if (pornit.current || !isConnected || !initialConfig?.cif) return;
    pornit.current = true;
    startLoadCifTransition(async () => {
      let r: Awaited<ReturnType<typeof loadOblioSeriesForCif>>;
      try {
        r = await loadOblioSeriesForCif(
          businessId, initialConfig.client_id, PLACEHOLDER_SECRET_SALVAT, initialConfig.cif,
        );
      } catch {
        /* ⚠ TACE DINADINS, si nu din scapare.
           Asta nu e un buton: efectul porneste singur la deschiderea paginii. Casa a scris mai
           sus, cu masuratoare, ca un esec aici nu strica nimic, iar doua randuri mai jos trece
           sub tacere chiar eroarea intoarsa de server. Un mesaj rosu la simpla deschidere a
           paginii ar contrazice amandoua hotararile. Catchul sta aici ca pagina sa nu moara,
           nu ca omul sa fie anuntat. */
        return;
      }
      if ("error" in r) return; // tacut: pagina ramane exact cum era
      setAccountData(prev => ({
        companies: prev?.companies ?? [{ cif: initialConfig.cif, name: initialConfig.company_name ?? "" }],
        series: r.series,
        vatRates: r.vatRates,
        management: r.management,
      }));
      setManagement(m => alegeGestiunea(r.management, m));
    });
  }, [businessId, isConnected, initialConfig]);

  function handleLoad() {
    if (!clientId || (!clientSecret && !secretulEsteSalvat(initialConfig, "client_secret"))) { toast.error("Introdu emailul și tokenul contului Oblio."); return; }
    setLoadError("");
    setAccountData(null);
    startLoadTransition(async () => {
      let result: Awaited<ReturnType<typeof loadOblioAccountData>>;
      try {
        result = await loadOblioAccountData(businessId, clientId, clientSecret);
      } catch {
        /* ⚠ Cere datele contului Oblio. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-au putut citi datele contului Oblio. "
          + "Reimprospateaza si incearca din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) {
        setLoadError(result.error);
        toast.error(result.error);
        return;
      }
      setAccountData(result);
      // Auto-select first company
      if (!cif && result.firstCif) {
        const firstCompany = result.companies.find(c => c.cif === result.firstCif);
        setCif(result.firstCif);
        setCompanyName(firstCompany?.name ?? "");
      }
      // Auto-select default invoice series
      const defInvoice = result.series.find(s => s.type === "Factura" && s.default);
      if (defInvoice && !seriesInvoice) setSeriesInvoice(defInvoice.name);
      // Auto-select default proforma series
      const defProforma = result.series.find(s => s.type === "Proforma" && s.default);
      if (defProforma && !seriesProforma) setSeriesProforma(defProforma.name);
      // Auto-select default VAT rate
      const defVat = result.vatRates.find(v => v.default);
      if (defVat) { setVatName(defVat.name); setVatPercentage(defVat.percent); }
      setManagement(m => alegeGestiunea(result.management, m));
      toast.success(`Conexiune reușită: ${result.companies.length} ${result.companies.length === 1 ? "firmă găsită" : "firme găsite"}.`);
    });
  }

  function handleCifChange(newCif: string) {
    if (!accountData) return;
    const company = accountData.companies.find(c => c.cif === newCif);
    setCif(newCif);
    setCompanyName(company?.name ?? "");
    // Reload series + VAT for this CIF
    startLoadCifTransition(async () => {
      let result: Awaited<ReturnType<typeof loadOblioSeriesForCif>>;
      try {
        result = await loadOblioSeriesForCif(businessId, clientId, clientSecret, newCif);
      } catch {
        /* ⚠ Aceeasi cerere de serii, pentru un CIF nou. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-au putut citi seriile pentru CIF-ul nou. "
          + "Reimprospateaza si incearca din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      setAccountData(prev => prev ? { ...prev, series: result.series, vatRates: result.vatRates, management: result.management } : prev);
      /*
        O singura gestiune inseamna ca nu exista nimic de ales — se pune singura.
        Cu mai multe, alege omul: nu ghicim din care gestiune isi scoate marfa.
      */
      /*
        ⚠ AICI SE STERGEA GESTIUNEA. Randul vechi era
        `else if (!result.management.some(...)) setManagement("")` — deci o lista
        goala, fie ea „contul n-are stocuri" fie un nomenclator cazut inghitit de
        `catch`, golea alegerea salvata. `alegeGestiunea` nu sterge niciodata pe
        gol; vezi src/lib/oblio-stare.ts.
      */
      setManagement(m => alegeGestiunea(result.management, m));
      const defInvoice = result.series.find(s => s.type === "Factura" && s.default);
      if (defInvoice) setSeriesInvoice(defInvoice.name);
      const defProforma = result.series.find(s => s.type === "Proforma" && s.default);
      if (defProforma) setSeriesProforma(defProforma.name);
      const defVat = result.vatRates.find(v => v.default);
      if (defVat) { setVatName(defVat.name); setVatPercentage(defVat.percent); }
    });
  }

  function handleSave() {
    if (!clientId || (!clientSecret && !secretulEsteSalvat(initialConfig, "client_secret"))) { toast.error("Introdu emailul și tokenul contului Oblio."); return; }
    if (!cif) { toast.error("Alege firma: apasă întâi „Testează și încarcă date”."); return; }
    if (!seriesInvoice) { toast.error("Alege seria facturilor."); return; }
    /*
      ⚠ PAZA CARE LIPSEA, SI CARE A COSTAT TREI SAPTAMANI. Un cont Oblio cu stocuri
      refuza ORICE factura fara gestiune. Pana acum formularul se salva multumit,
      integrarea aparea configurata, si abia la prima comanda pica documentul — in
      lista de operatii, unde nu se uita nimeni.

      Masurat pe VetDepo: patru facturi intre 11.08 si 01.09.2026, toate patru
      refuzate cu acelasi mesaj, zero emise.

      Daca nomenclatorul a intors gestiuni, contul ARE stocuri si campul e
      obligatoriu. Daca a intors gol, conditia nici nu se aprinde.
    */
    /*
      ⚠ Nu OPRIM salvarea — poate omul chiar vrea sa pregateasca datele si sa
      porneasca mai tarziu. Dar nu-l mai lasam sa plece crezand ca a terminat.
    */
    if (!enabled) {
      toast.warning(
        "Datele se salvează, dar integrarea rămâne OPRITĂ. Pornește comutatorul „Facturarea Oblio” de sus, ca să poți emite facturi.",
      );
    }
    if (!poateSalva) {
      toast.error("Contul tău Oblio are gestiuni. Alege din care iese marfa, altfel facturile vor fi refuzate.");
      return;
    }

    const config: OblioConfig = {
      enabled,
      client_id: clientId,
      client_secret: clientSecret,
      cif,
      company_name: companyName,
      series_invoice: seriesInvoice,
      series_proforma: seriesProforma,
      vat_name: vatName,
      vat_percentage: vatPercentage,
      ...(management ? { management } : {}),
      auto_invoice: autoInvoice,
      auto_invoice_trigger: autoInvoiceTrigger,
      product_type: productType,
      due_days: dueDays,
      send_to_spv: sendToSpv,
      no_stock: noStock,
      send_email: sendEmail,
    };

    startSaveTransition(async () => {
      let result: Awaited<ReturnType<typeof saveOblioConfig>>;
      try {
        result = await saveOblioConfig(businessId, config);
      } catch {
        /* ⚠ Scrie configurarea Oblio. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Oblio s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Configurația Oblio a fost salvată.");
        setReper(valori);
        router.refresh();
      }
    });
  }

  function handleDisconnect() {
    startDisconnectTransition(async () => {
      let result: Awaited<ReturnType<typeof disconnectOblio>>;
      try {
        result = await disconnectOblio(businessId);
      } catch {
        /* ⚠ `disconnectOblio` scrie DOAR la noi: nu vorbeste cu Oblio. Deci singurul lucru
           nestiut e daca stergerea a apucat sa se scrie, iar contul de la ei e neatins. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Reimprospateaza pagina si uita-te daca mai apare conectat inainte sa incerci "
          + "din nou: la Oblio nu s-a atins nimic.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Oblio a fost deconectat.");
        setClientId(""); setClientSecret(""); setCif(""); setCompanyName("");
        setSeriesInvoice(""); setSeriesProforma("");
        setAccountData(null); setEnabled(false);
        setReper({ ...valori, enabled: false, clientId: "", clientSecret: "", cif: "", companyName: "", seriesInvoice: "", seriesProforma: "" });
        router.refresh();
      }
    });
  }

  const secretSalvat = secretulEsteSalvat(initialConfig, "client_secret");
  const areAcces = !!clientId && (!!clientSecret || secretSalvat);
  const arataDocumentele = !!(accountData || isConnected);
  const stari: StareAntet[] = !isConnected
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [initialConfig?.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" }];

  return (
    <PaginaIntegrare
      id="oblio"
      titlu="Facturare"
      descriere="Emiți facturi și proforme Oblio din comenzi, manual sau automat."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Facturarea Oblio" activ={enabled} onChange={setEnabled} ariaLabel="Activează Oblio" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul Oblio", facut: areAcces },
          { text: "Firma și seria facturilor", facut: !!cif && !!seriesInvoice },
          ...(gestiuneaECeruta(gestiuni) ? [{ text: "Gestiunea", facut: !!management }] : []),
          { text: "Facturarea activă", facut: isConnected && !!initialConfig?.enabled },
        ]} />
        <CumFunctioneaza id="oblio" puncte={[
          { Icon: ReceiptText, text: "Emiți factura din pagina comenzii sau automat, când comanda ajunge la statusul ales." },
          { Icon: Layers, text: "Firma, seriile și cotele TVA vin din contul tău Oblio: le aduci cu „Testează și încarcă date”." },
          { Icon: Warehouse, text: "Dacă ții stocul în Oblio, alegi gestiunea din care iese marfa. Fără ea, Oblio refuză factura." },
          { Icon: Landmark, text: "Factura poate pleca singură în SPV (e-Factura), dacă trimiterea automată e pornită și în Oblio." },
        ]} />
      </>}
    >
      {/* Starea, primul lucru de pe pagina. Vezi nota de la `activ`. */}
      {activ ? (
        <Callout variant="success" icon={CheckCircle} title="Oblio activ">
          Facturile se pot emite din pagina Comenzi.
        </Callout>
      ) : lipsesteGestiunea ? (
        /*
          ⚠ CAZUL CARE MINTEA. `complet` nu numara gestiunea, asa ca pentru un
          cont cu stocuri si fara gestiune aleasa se aprindea caseta VERDE
          „Facturile se pot emite", pentru un cont caruia Oblio ii refuza
          fiecare factura. Masurat pe VetDepo: patru refuzuri, caseta verde.
        */
        <Callout variant="warning" icon={AlertTriangle} title="Mai lipsește gestiunea">
          Contul tău Oblio are stocuri, deci fiecare factură trebuie să spună din ce gestiune iese marfa.
          Alege <strong>Gestiune</strong> mai jos și salvează: până atunci Oblio refuză documentele,
          chiar dacă restul e configurat.
        </Callout>
      ) : complet ? (
        <Callout variant="warning" icon={AlertTriangle} title="Oblio configurat, dar OPRIT">
          Datele contului sunt salvate, dar comutatorul <strong>Facturarea Oblio</strong> de sus e stins. De aceea
          integrarea apare neconectată la Integrări și nu apare butonul de factură în Comenzi.
        </Callout>
      ) : null}

      <Sectiune pas={1} titlu="Contul Oblio" descriere="Emailul contului și tokenul API. Cu ele aducem din Oblio firma, seriile și cotele TVA.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email cont Oblio" htmlFor="oblio-email" required>
            <Input id="oblio-email" type="email" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="email@exemplu.ro" />
          </Field>
          <Field label="Token secret" htmlFor="oblio-token" required
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Tokenul API Oblio"
              text="Emailul e chiar cel cu care intri în Oblio (client_id). Tokenul (client_secret) îl găsești în contul Oblio, la Setări, apoi Date cont." />}>
            <Input id="oblio-token" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
              placeholder={secretSalvat ? PLACEHOLDER_SECRET_SALVAT : "Din Setări, Date cont"} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleLoad} disabled={loading || !areAcces}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Testează și încarcă date
          </Button>
          {loadingCif && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Aduc seriile din Oblio...
            </span>
          )}
        </div>
        {loadError && <Callout variant="danger" title={loadError} />}
      </Sectiune>

      {arataDocumentele && (
        <Sectiune pas={2} titlu="Firmă și documente" descriere="Firma care emite, seriile și cota TVA, așa cum sunt în contul tău Oblio.">
          <Field label="Firmă" htmlFor="oblio-firma" required>
            {accountData && accountData.companies.length > 1 ? (
              <select
                id="oblio-firma"
                value={cif}
                onChange={e => handleCifChange(e.target.value)}
                className={selectCls}
                disabled={loadingCif}
              >
                {accountData.companies.map(c => (
                  <option key={c.cif} value={c.cif}>{c.name} ({c.cif})</option>
                ))}
              </select>
            ) : (
              <Input
                id="oblio-firma"
                type="text"
                value={cif ? `${companyName} (${cif})` : cif}
                readOnly
                className="bg-muted/40"
                placeholder="Apare după „Testează și încarcă date”"
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Serie factură" htmlFor="oblio-serie" required>
              {accountData && invoiceSeries.length > 0 ? (
                <select id="oblio-serie" value={seriesInvoice} onChange={e => setSeriesInvoice(e.target.value)} className={selectCls}>
                  <option value="">Alege seria</option>
                  {invoiceSeries.map(s => (
                    <option key={s.name} value={s.name}>{s.name}{s.default ? " (implicită)" : ""}</option>
                  ))}
                </select>
              ) : (
                <Input id="oblio-serie" type="text" value={seriesInvoice} onChange={e => setSeriesInvoice(e.target.value)} placeholder="ex: FCT" />
              )}
            </Field>
            <Field label="Serie proformă (opțional)" htmlFor="oblio-proforma">
              {accountData && proformaSeries.length > 0 ? (
                <select id="oblio-proforma" value={seriesProforma} onChange={e => setSeriesProforma(e.target.value)} className={selectCls}>
                  <option value="">Fără proformă</option>
                  {proformaSeries.map(s => (
                    <option key={s.name} value={s.name}>{s.name}{s.default ? " (implicită)" : ""}</option>
                  ))}
                </select>
              ) : (
                <Input id="oblio-proforma" type="text" value={seriesProforma} onChange={e => setSeriesProforma(e.target.value)} placeholder="ex: PR" />
              )}
            </Field>
          </div>

          {/*
            Gestiunea. ⚠ SE ARATA DOAR CAND CONTUL ARE STOCURI: nomenclatorul
            intoarce lista goala altfel, si atunci campul n-ar avea niciun
            inteles pentru om. Un camp gol pe care nu-l poate completa nimeni e
            mai rau decat niciun camp.
          */}
          {gestiuneaECeruta(gestiuni) && (
            <Field label="Gestiune" htmlFor="oblio-gestiune" required
              hint="Contul tău Oblio are stocuri, deci fiecare factură spune din ce gestiune iese marfa. Fără ea, Oblio refuză documentul.">
              <select
                id="oblio-gestiune"
                value={management}
                onChange={e => setManagement(e.target.value)}
                className={selectCls}
              >
                <option value="">Alege gestiunea</option>
                {gestiuni.map(gest => (
                  <option key={gest.name} value={gest.name}>
                    {gest.name}{gest.tip ? ` (${gest.tip})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Cotă TVA implicită" htmlFor="oblio-tva"
            ajutor={<ExplicatieCard marime="mic" intrebare="Când se folosește" eticheta="Cota TVA implicită"
              text="Se folosește când produsul nu are o cotă proprie. Cota se aplică după setările de TVA ale magazinului." />}>
            {accountData && accountData.vatRates.length > 0 ? (
              <select
                id="oblio-tva"
                value={vatName}
                onChange={e => {
                  const selected = accountData.vatRates.find(v => v.name === e.target.value);
                  setVatName(e.target.value);
                  if (selected) setVatPercentage(selected.percent);
                }}
                className={selectCls}
              >
                {accountData.vatRates.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.percent}%){v.default ? ", implicită" : ""}</option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <Input id="oblio-tva" type="text" value={vatName} onChange={e => setVatName(e.target.value)} placeholder="Normala" />
                <Input type="number" aria-label="Procentul cotei TVA" value={vatPercentage} onChange={e => setVatPercentage(Number(e.target.value))} placeholder="19" className="max-w-20" />
              </div>
            )}
          </Field>
        </Sectiune>
      )}

      {arataDocumentele && (
        <Sectiune pas={3} titlu="Opțiuni document" descriere="Cum arată liniile facturii și ce se întâmplă după ce o emiți.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tip produse" htmlFor="oblio-tip"
              ajutor={<ExplicatieCard marime="mic" intrebare="Ce aleg aici" eticheta="Tip produse"
                text="Tipul liniilor de produs pe factură. Pentru produse fizice alegi „Marfă”. Transportul rămâne „Serviciu”." />}>
              <select id="oblio-tip" value={productType} onChange={e => setProductType(e.target.value)} className={selectCls}>
                {["Marfa", "Serviciu", "Produs finit", "Semifabricate", "Materii prime", "Materiale consumabile", "Ambalaje", "Obiecte de inventar"].map(t => (
                  <option key={t} value={t}>{t === "Marfa" ? "Marfă" : t}</option>
                ))}
              </select>
            </Field>
            <Field label="Scadență factură (zile)" htmlFor="oblio-scadenta" hint="Gol = scadența e chiar data emiterii.">
              <Input id="oblio-scadenta" type="number" min={0} max={120} value={dueDays || ""}
                onChange={e => setDueDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                placeholder="0 = fără scadență" />
            </Field>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Trimite în SPV (e-Factura)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Factura pleacă singură în SPV, dacă trimiterea automată e pornită și în contul tău Oblio.
                </p>
              </div>
              <Switch checked={sendToSpv} onCheckedChange={setSendToSpv} aria-label="Trimite în SPV (e-Factura)" />
            </div>

            {/*
              ⚠ OPRIT DIN OFICIU. Pornit implicit, ar fi inceput sa trimita emailuri cumparatorilor
              unor magazine care azi nu primesc niciunul. E un buton nou, nu o reparatie.

              ⚠ SI SE SPUNE CA NU PUTEM CONFIRMA. Oblio ia emailul ca pe un camp al cererii de
              emitere si nu intoarce nimic despre el, spre deosebire de SmartBill, care are
              `/document/send` cu `status.code`. Fara randul asta am repeta exact situatia de la
              SmartBill: 187 de trimiteri incercate si zero dovezi ca vreuna a ajuns.
            */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Trimite factura pe email</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Oblio trimite cu șablonul din contul tău (Setări, E-mail-uri alarmă, Document prin email).
                  Dacă nu e configurat acolo, nu se trimite nimic, iar Oblio nu ne spune, deci nici noi nu-ți
                  putem confirma. Verifică primul email tu.
                </p>
              </div>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Trimite factura pe email" />
            </div>

            {/*
              ⚠ SE ARATA DOAR CONTURILOR CU STOCURI. Pentru celelalte, parametrul
              n-are niciun inteles la Oblio, iar un comutator in plus intr-un ecran
              deja lung inseamna doar o intrebare la care omul n-are cum sa raspunda.
            */}
            {gestiuneaECeruta(gestiuni) && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Nu descărca stocul din Oblio</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Doar dacă <strong>NU</strong> ții stocul în Oblio: facturile nu mai scad cantitățile din gestiune.
                    Rezolvă refuzul <em>produsul nu are stoc suficient</em>, dar schimbă felul în care Oblio îți ține stocul.
                  </p>
                </div>
                <Switch checked={noStock} onCheckedChange={setNoStock} aria-label="Nu descărca stocul din Oblio" />
              </div>
            )}
          </div>
        </Sectiune>
      )}

      {arataDocumentele && (
        <Sectiune pas={4} titlu="Generare automată" descriere="Factura se poate emite singură, când comanda ajunge la statusul ales.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Generare automată factură</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Fără să mai apeși nimic în pagina comenzii.</p>
            </div>
            <Switch checked={autoInvoice} onCheckedChange={setAutoInvoice} aria-label="Generare automată factură" />
          </div>
          {autoInvoice && (
            <Field label="Declanșează generarea când comanda devine" htmlFor="oblio-declansator"
              hint="Cu mai multe programe de facturare pe automat, se emite o singură factură: întâi SmartBill, apoi Oblio, apoi fGO.">
              <select id="oblio-declansator" value={autoInvoiceTrigger} onChange={e => setAutoInvoiceTrigger(e.target.value as AutoInvoiceTrigger)} className={selectCls}>
                {AUTO_INVOICE_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
          )}
        </Sectiune>
      )}

      {isConnected && (
        <ZonaDeconectare descriere="Șterge cheile din Edinio. Facturile deja emise rămân în contul tău Oblio.">
          <ButonDeconectare
            nume="Oblio"
            cePierzi="Cheile se șterg din Edinio și facturile nu se mai emit automat. Facturile deja emise rămân în contul tău Oblio. Ca să te întorci, ceri din nou Client ID și Client Secret din contul tău Oblio."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={handleSave} />
    </PaginaIntegrare>
  );
}
