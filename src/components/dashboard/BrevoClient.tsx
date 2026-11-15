"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, KeyRound, Loader2, MailCheck, Plug, RefreshCw, ShoppingBag, Users } from "lucide-react";
import {
  connectBrevo, disconnectBrevo, getBrevoLists, getBrevoTemplates,
  saveBrevoSettings, syncExistingCustomers, syncBrevoCatalog,
} from "@/lib/actions/brevo.actions";
import { SincronizareCatalogEmail } from "@/components/dashboard/SincronizareCatalogEmail";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { selectCls } from "@/lib/ui";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import type { BrevoPublicConfig, BrevoList, BrevoTemplate } from "@/lib/brevo";

export function BrevoClient({ businessId, initialConfig }: { businessId: string; initialConfig: BrevoPublicConfig }) {
  const [config, setConfig] = useState<BrevoPublicConfig>(initialConfig);
  const [apiKey, setApiKey] = useState("");
  const [lists, setLists] = useState<BrevoList[]>([]);
  const [listsLoaded, setListsLoaded] = useState(false);

  // Editable draft (persisted on "Salveaza").
  const [listId, setListId] = useState(initialConfig.list_id != null ? String(initialConfig.list_id) : "");
  const [checkoutSource, setCheckoutSource] = useState(initialConfig.sources.checkout);
  const [ecommerceSync, setEcommerceSync] = useState(initialConfig.ecommerce_sync);
  const [doubleOptin, setDoubleOptin] = useState(initialConfig.double_optin);
  const [doiTemplateId, setDoiTemplateId] = useState(initialConfig.doi_template_id != null ? String(initialConfig.doi_template_id) : "");
  const [templates, setTemplates] = useState<BrevoTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  /* Bara de salvare: apare doar cand setarile s-au departat de ultima salvare. */
  const valori = { listId, checkoutSource, ecommerceSync, doubleOptin, doiTemplateId };
  const [reper, setReper] = useState(valori);
  const modificat = config.connected && JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setListId(reper.listId); setCheckoutSource(reper.checkoutSource); setEcommerceSync(reper.ecommerceSync);
    setDoubleOptin(reper.doubleOptin); setDoiTemplateId(reper.doiTemplateId);
  }

  const [connecting, startConnect] = useTransition();
  const [loadingTemplates, startTemplates] = useTransition();
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();
  const [loadingLists, startLists] = useTransition();

  function connect() {
    if (!apiKey.trim()) { toast.error("Introdu cheia API Brevo."); return; }
    startConnect(async () => {
      let res: Awaited<ReturnType<typeof connectBrevo>>;
      try {
        res = await connectBrevo(businessId, apiKey.trim());
      } catch {
        /* ⚠ Cheia pleaca la Brevo ca sa fie validata. Nestiut: daca s-a legat contul. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a conectat contul Brevo. "
          + "Reimprospateaza pagina si uita-te daca apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setConfig(res.config);
      setLists(res.lists);
      setListsLoaded(true);
      setApiKey("");
      toast.success(`Conectat la Brevo${res.config.account_name ? ` (${res.config.account_name})` : ""}.`);
    });
  }

  function reloadLists() {
    startLists(async () => {
      let res: Awaited<ReturnType<typeof getBrevoLists>>;
      try {
        res = await getBrevoLists(businessId);
      } catch {
        /* ⚠ O CITIRE: nu se schimba nimic, nici la noi, nici la ei. Singurul loc din arc unde
           reincercarea chiar e raspunsul corect, si se spune. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca listele s-au putut citi. "
          + "Nu s-a schimbat nimic, deci poti incerca din nou linistit.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setLists(res.lists);
      setListsLoaded(true);
      if (res.lists.length === 0) toast.info("Contul nu are nicio listă. Creează una în Brevo.");
    });
  }

  function reloadTemplates() {
    startTemplates(async () => {
      let res: Awaited<ReturnType<typeof getBrevoTemplates>>;
      try {
        res = await getBrevoTemplates(businessId);
      } catch {
        /* O CITIRE: nu se schimba nimic, deci reincercarea e raspunsul corect. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca sabloanele s-au putut citi. "
          + "Nu s-a schimbat nimic, deci poti incerca din nou linistit.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setTemplates(res.templates);
      setTemplatesLoaded(true);
      if (res.templates.length === 0) toast.info("Contul nu are niciun șablon activ. Fă în Brevo unul de tip „Double opt-in confirmation”.");
    });
  }

  function save() {
    startSave(async () => {
      const selected = lists.find((l) => String(l.id) === listId);
      let res: Awaited<ReturnType<typeof saveBrevoSettings>>;
      try {
        res = await saveBrevoSettings(businessId, {
          list_id: listId ? Number(listId) : undefined,
          list_name: selected?.name ?? config.list_name,
          sources: { checkout: checkoutSource },
          ecommerce_sync: ecommerceSync,
          double_optin: doubleOptin,
          doi_template_id: doiTemplateId ? Number(doiTemplateId) : null,
        });
      } catch {
        /* ⚠ Scrie setarile. Mesajul nu pretinde nimic despre contul de la furnizor. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca setarile s-au salvat. "
          + "Reimprospateaza pagina si uita-te la ce apare pe ecran inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setConfig(res.config);
      setReper(valori);
      toast.success("Setări salvate.");
      if (res.aviz) toast.info(res.aviz, { duration: 12000 });
    });
  }

  function disconnect() {
    startSave(async () => {
      let res: Awaited<ReturnType<typeof disconnectBrevo>>;
      try {
        res = await disconnectBrevo(businessId);
      } catch {
        /* ⚠ Mesajul NU pretinde nimic despre contul de la furnizor: n-am masurat ce face
           `disconnect` acolo, deci nu spun. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca deconectarea s-a salvat. "
          + "Reimprospateaza pagina si uita-te daca mai apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setConfig({ ...config, enabled: false, connected: false, account_name: undefined, account_email: undefined, list_id: undefined, list_name: undefined });
      setLists([]);
      setListsLoaded(false);
      setListId("");
      setReper({ ...valori, listId: "" });
      toast.success("Cont Brevo deconectat.");
    });
  }

  function syncCustomers() {
    startSync(async () => {
      let res: Awaited<ReturnType<typeof syncExistingCustomers>>;
      try {
        res = await syncExistingCustomers(businessId);
      } catch {
        /* ⚠⚠ Cel mai scump buton din panou: impinge toti clientii catre contul de marketing.
           ⚠ NU se pretinde aici ca o a doua apasare nu dubleaza nimic: ar fi o deducere din
           numele functiei care trimite, nu o masuratoare. Ce E masurat: `last_sync_at` se
           scrie ABIA DUPA ce raspunde furnizorul, deci data de pe ecran poate ramane in urma. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca sincronizarea a pornit. "
          + "Uita-te in lista din contul Brevo inainte sa apesi din nou: data ultimei "
          + "sincronizari de pe ecran se scrie abia dupa ce raspunde furnizorul, deci poate "
          + "ramane in urma.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      if (res.total === 0) { toast.info("Nu există clienți cu email de sincronizat."); return; }
      toast.success(`Sincronizare pornită pentru ${res.total} contacte. Apar în listă după procesarea în Brevo.`);
      setConfig({ ...config, last_sync_at: new Date().toISOString() });
    });
  }

  const hasList = config.list_id != null;

  const stari: StareAntet[] = config.connected
    ? [{ ton: "bun", text: "Conectat" }]
    : [{ ton: "neutru", text: "Neconectat" }];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="brevo"
      titlu="Email marketing"
      descriere="Contactele din magazin intră în lista ta Brevo, de unde trimiți campanii."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul Brevo legat", facut: config.connected },
          { text: "Lista aleasă", facut: config.connected && hasList },
          { text: "Abonarea la comandă", facut: config.connected && !!config.sources.checkout },
        ]} />
        {config.connected && (
          <CardCifre titlu="Contul legat" randuri={[
            { eticheta: "Cont", valoare: config.account_name || config.account_email || "Brevo" },
            { eticheta: "Lista", valoare: config.list_name || "nealeasă" },
            ...(config.last_sync_at ? [{ eticheta: "Ultima sincronizare", valoare: new Date(config.last_sync_at).toLocaleString("ro-RO") }] : []),
          ]} />
        )}
        <CumFunctioneaza id="brevo" puncte={[
          { Icon: KeyRound, text: "Te conectezi cu o cheie API din Brevo: SMTP & API, API Keys." },
          { Icon: Users, text: "Alegi lista în care intră contactele magazinului." },
          { Icon: MailCheck, text: "Cu confirmarea dublă, clientul primește un email din șablonul tău Brevo și intră în listă după ce confirmă." },
          { Icon: ShoppingBag, text: "Cu sincronizarea e-commerce, produsele și comenzile ajung în Brevo, pentru venit atribuit și segmente." },
        ]} />
      </>}
    >
      {!config.connected ? (
        <Sectiune pas={1} titlu="Contul Brevo" descriere="Te conectezi cu o cheie API din contul tău Brevo.">
          <Field label="Cheie API Brevo" htmlFor="brevo-cheie"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia API Brevo"
              text="În Brevo: SMTP & API, apoi API Keys. Generezi o cheie și o copiezi aici." />}>
            <Input id="brevo-cheie" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ex: xkeysib-..." />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="animate-spin" /> : <Plug />}
              Conectează contul
            </Button>
            <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer" className={legatura}>
              Cheile API în Brevo <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Sectiune>
      ) : (
        <>
          <Sectiune pas={1} titlu="Listă de contacte" descriere="Lista din Brevo în care intră contactele magazinului.">
            {listsLoaded && lists.length > 0 ? (
              <select aria-label="Lista de contacte" value={listId} onChange={(e) => setListId(e.target.value)} className={selectCls}>
                <option value="">Alege o listă...</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.member_count} contacte)</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {hasList
                  ? `Lista curentă: ${config.list_name ?? ""}. Apasă „Reîncarcă” ca s-o schimbi.`
                  : "Apasă „Încarcă listele” ca să alegi lista în care se adaugă contactele."}
              </p>
            )}
            <div>
              <Button variant="outline" size="sm" onClick={reloadLists} disabled={loadingLists}>
                {loadingLists ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {listsLoaded ? "Reîncarcă" : "Încarcă listele"}
              </Button>
            </div>
          </Sectiune>

          <Sectiune pas={2} titlu="Abonarea" descriere="Cine ajunge în listă și cum își confirmă abonarea.">
            <RandComutator
              titlu="Abonare la finalizarea comenzii"
              text="Când clientul bifează căsuța de abonare la comandă, emailul lui intră în listă."
              activ={checkoutSource}
              onChange={setCheckoutSource}
            />
            {/*
              ⚠ Pana pe 18.09.2026 aici scria sa „activezi confirmarea dubla pe lista in Brevo”.
              La Brevo asa ceva nu exista pentru contactele trimise prin API: intrau direct in
              lista. Confirmarea se cere acum chiar de aici, cu un sablon DOI din contul lor.
            */}
            <RandComutator
              separat
              titlu="Confirmare dublă (double opt-in)"
              text="Clientul primește un email de confirmare din șablonul tău Brevo și intră în listă abia după ce confirmă. După confirmare ajunge înapoi în magazinul tău."
              activ={doubleOptin}
              onChange={(v) => { setDoubleOptin(v); if (v && !templatesLoaded) reloadTemplates(); }}
            />
            {doubleOptin && (
              <Field label="Șablonul de confirmare" htmlFor="brevo-sablon"
                hint="Îl faci în Brevo, din șabloanele de tip „Double opt-in confirmation”. La salvare verificăm în Brevo că șablonul ales chiar e unul de confirmare.">
                <div className="flex gap-2">
                  <select id="brevo-sablon" value={doiTemplateId} onChange={(e) => setDoiTemplateId(e.target.value)} className={selectCls}>
                    <option value="">Alege șablonul...</option>
                    {doiTemplateId && !templates.some((t) => String(t.id) === doiTemplateId) && (
                      <option value={doiTemplateId}>{config.doi_template_name ?? `Șablon ${doiTemplateId}`}</option>
                    )}
                    {templates.map((t) => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" size="icon" aria-label={templatesLoaded ? "Reîncarcă șabloanele" : "Încarcă șabloanele"}
                    onClick={reloadTemplates} disabled={loadingTemplates}>
                    {loadingTemplates ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  </Button>
                </div>
              </Field>
            )}
            <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Adăugăm singuri atribute pentru segmentare: sursa, județul și valoarea comenzii. Cine se dezabonează, are adresa
              respinsă definitiv sau marchează un email ca spam nu mai e adăugat din nou.
            </p>
          </Sectiune>

          <Sectiune pas={3} titlu="Sincronizare e-commerce" descriere="Produsele și comenzile, pentru venit atribuit, segmente după cumpărături și recomandări.">
            <RandComutator
              titlu="Sincronizare e-commerce (produse + comenzi)"
              text="Trimite produsele și comenzile în Brevo. Coșurile rămân pe sistemul Edinio."
              activ={ecommerceSync}
              onChange={setEcommerceSync}
            />
            {/* Catalogul intreg (pleaca singur la pornirea sincronizarii e-commerce). */}
            <SincronizareCatalogEmail furnizor="Brevo" pornita={config.ecommerce_sync} sincronizeaza={() => syncBrevoCatalog(businessId)} />
          </Sectiune>

          <Sectiune pas={4} titlu="Sincronizează clienții existenți"
            descriere="Trimite în listă emailurile clienților care au comandat deja, deduplicate. Folosește-o doar dacă ai consimțământul lor de marketing.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Comenzile din marketplace (Pepita, eMAG, Trendyol, About You) sunt sărite: cumpărătorii lor nu sunt clienții tăi.
              {config.last_sync_at && <> Ultima sincronizare: {new Date(config.last_sync_at).toLocaleString("ro-RO")}.</>}
            </p>
            <div>
              <Button variant="outline" onClick={syncCustomers} disabled={syncing || !hasList}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Sincronizează acum
              </Button>
              {!hasList && <p className="mt-1.5 text-xs text-warning">Alege și salvează o listă întâi.</p>}
            </div>
          </Sectiune>

          {/* ⚠ `cePierzi` e citit din `disconnectBrevo`: sterge webhookul de la ei, apoi pune
              `brevo_config` pe null, adica cheia SI toate setarile din Edinio. */}
          <ZonaDeconectare descriere="Șterge cheia și setările din Edinio. Contactele trimise deja rămân în Brevo.">
            <ButonDeconectare
              nume="Brevo"
              cePierzi="Cheia API și setările se șterg din Edinio, iar webhookul pus de noi în contul tău Brevo se șterge și el. Contactele trimise deja rămân în Brevo, dar ca să te întorci ceri o cheie nouă de acolo."
              pending={saving}
              marime="default"
              onConfirma={disconnect}
            />
          </ZonaDeconectare>

          <BaraSalvare modificat={modificat} saving={saving} onSalveaza={save} onRenunta={renunta} />
        </>
      )}
    </PaginaIntegrare>
  );
}
