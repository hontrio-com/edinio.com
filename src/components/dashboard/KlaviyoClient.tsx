"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, KeyRound, Loader2, MailCheck, Plug, RefreshCw, ShoppingBag, Users } from "lucide-react";
import {
  connectKlaviyo, disconnectKlaviyo, getKlaviyoLists,
  saveKlaviyoSettings, syncExistingCustomers, syncKlaviyoCatalog,
} from "@/lib/actions/klaviyo.actions";
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
import type { KlaviyoPublicConfig, KlaviyoList } from "@/lib/klaviyo";

export function KlaviyoClient({ businessId, initialConfig }: { businessId: string; initialConfig: KlaviyoPublicConfig }) {
  const [config, setConfig] = useState<KlaviyoPublicConfig>(initialConfig);
  const [apiKey, setApiKey] = useState("");
  const [lists, setLists] = useState<KlaviyoList[]>([]);
  const [listsLoaded, setListsLoaded] = useState(false);

  // Editable draft (persisted on "Salveaza").
  const [listId, setListId] = useState(initialConfig.list_id ?? "");
  const [checkoutSource, setCheckoutSource] = useState(initialConfig.sources.checkout);
  const [ecommerceSync, setEcommerceSync] = useState(initialConfig.ecommerce_sync);

  /* Bara de salvare: apare doar cand setarile s-au departat de ultima salvare. */
  const valori = { listId, checkoutSource, ecommerceSync };
  const [reper, setReper] = useState(valori);
  const modificat = config.connected && JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setListId(reper.listId); setCheckoutSource(reper.checkoutSource); setEcommerceSync(reper.ecommerceSync);
  }

  const [connecting, startConnect] = useTransition();
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();
  const [loadingLists, startLists] = useTransition();

  function connect() {
    if (!apiKey.trim()) { toast.error("Introdu cheia API Klaviyo."); return; }
    startConnect(async () => {
      let res: Awaited<ReturnType<typeof connectKlaviyo>>;
      try {
        res = await connectKlaviyo(businessId, apiKey.trim());
      } catch {
        /* ⚠ Cheia pleaca la Klaviyo ca sa fie validata. Nestiut: daca s-a legat contul. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a conectat contul Klaviyo. "
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
      toast.success(`Conectat la Klaviyo${res.config.account_name ? ` (${res.config.account_name})` : ""}.`);
    });
  }

  function reloadLists() {
    startLists(async () => {
      let res: Awaited<ReturnType<typeof getKlaviyoLists>>;
      try {
        res = await getKlaviyoLists(businessId);
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
      if (res.lists.length === 0) toast.info("Contul nu are nicio listă. Creează una în Klaviyo.");
    });
  }

  function save() {
    startSave(async () => {
      const selected = lists.find((l) => l.id === listId);
      let res: Awaited<ReturnType<typeof saveKlaviyoSettings>>;
      try {
        res = await saveKlaviyoSettings(businessId, {
          list_id: listId || undefined,
          list_name: selected?.name ?? config.list_name,
          sources: { checkout: checkoutSource },
          ecommerce_sync: ecommerceSync,
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
    });
  }

  function disconnect() {
    startSave(async () => {
      let res: Awaited<ReturnType<typeof disconnectKlaviyo>>;
      try {
        res = await disconnectKlaviyo(businessId);
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
      setConfig({ ...config, enabled: false, connected: false, account_name: undefined, list_id: undefined, list_name: undefined });
      setLists([]);
      setListsLoaded(false);
      setListId("");
      setReper({ ...valori, listId: "" });
      toast.success("Cont Klaviyo deconectat.");
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
          + "Uita-te in lista din contul Klaviyo inainte sa apesi din nou: data ultimei "
          + "sincronizari de pe ecran se scrie abia dupa ce raspunde furnizorul, deci poate "
          + "ramane in urma.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      const sariti = res.sariti > 0 ? ` ${res.sariti} săriți: s-au dezabonat, au reclamat spam sau au adresa respinsă în Klaviyo.` : "";
      if (res.total === 0) { toast.info(`Nu există clienți de abonat.${sariti}`); return; }
      toast.success(`Sincronizare pornită pentru ${res.total} contacte. Apar în listă după procesarea în Klaviyo.${sariti}`);
      setConfig({ ...config, last_sync_at: new Date().toISOString() });
    });
  }

  const hasList = !!config.list_id;

  const stari: StareAntet[] = config.connected
    ? [{ ton: "bun", text: "Conectat" }]
    : [{ ton: "neutru", text: "Neconectat" }];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="klaviyo"
      titlu="Email marketing"
      descriere="Contactele din magazin intră în lista ta Klaviyo, de unde trimiți campanii și flows."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul Klaviyo legat", facut: config.connected },
          { text: "Lista aleasă", facut: config.connected && hasList },
          { text: "Abonarea la comandă", facut: config.connected && !!config.sources.checkout },
        ]} />
        {config.connected && (
          <CardCifre titlu="Contul legat" randuri={[
            { eticheta: "Cont", valoare: config.account_name || "Klaviyo" },
            { eticheta: "Lista", valoare: config.list_name || "nealeasă" },
            ...(config.last_sync_at ? [{ eticheta: "Ultima sincronizare", valoare: new Date(config.last_sync_at).toLocaleString("ro-RO") }] : []),
          ]} />
        )}
        <CumFunctioneaza id="klaviyo" puncte={[
          { Icon: KeyRound, text: "Te conectezi cu o cheie API privată din Klaviyo (Settings, API keys), cu acces complet." },
          { Icon: Users, text: "Alegi lista în care intră contactele magazinului, cu consimțământ de marketing." },
          { Icon: MailCheck, text: "Confirmarea dublă (GDPR) o pornești pe listă, în contul Klaviyo; abonarea noastră o respectă." },
          { Icon: ShoppingBag, text: "Cu sincronizarea e-commerce, comenzile și catalogul ajung în Klaviyo, pentru venit, segmente și flows." },
        ]} />
      </>}
    >
      {!config.connected ? (
        <Sectiune pas={1} titlu="Contul Klaviyo" descriere="Te conectezi cu cheia API privată din contul tău Klaviyo.">
          <Field label="Cheie API privată Klaviyo" htmlFor="klaviyo-cheie"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia API privată Klaviyo"
              text="În Klaviyo: Settings, apoi API keys. Creezi o cheie privată, cu acces complet (începe cu pk_), și o copiezi aici." />}>
            <Input id="klaviyo-cheie" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ex: pk_..." />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="animate-spin" /> : <Plug />}
              Conectează contul
            </Button>
            <a href="https://www.klaviyo.com/settings/account/api-keys" target="_blank" rel="noopener noreferrer" className={legatura}>
              Cheile API în Klaviyo <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Sectiune>
      ) : (
        <>
          <Sectiune pas={1} titlu="Listă de contacte" descriere="Lista din Klaviyo în care intră contactele magazinului.">
            {listsLoaded && lists.length > 0 ? (
              <select aria-label="Lista de contacte" value={listId} onChange={(e) => setListId(e.target.value)} className={selectCls}>
                <option value="">Alege o listă...</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
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

          <Sectiune pas={2} titlu="Abonarea" descriere="Cine ajunge în listă.">
            <RandComutator
              titlu="Abonare la finalizarea comenzii"
              text="Când clientul bifează căsuța de abonare la comandă, emailul lui intră în listă, cu acordul lui."
              activ={checkoutSource}
              onChange={setCheckoutSource}
            />
            <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Contactele se adaugă cu consimțământ de marketing. Pentru <span className="font-medium text-foreground">confirmare dublă (double opt-in)</span> GDPR,
              pornește-o pe listă, în contul tău Klaviyo (abonarea noastră o respectă). Adăugăm singuri proprietăți pentru segmentare:
              sursa, județul și valoarea comenzii. Cine s-a dezabonat, a reclamat spam sau are adresa respinsă în Klaviyo nu mai e abonat din nou.
            </p>
          </Sectiune>

          <Sectiune pas={3} titlu="Sincronizare e-commerce" descriere="Comenzile și catalogul, pentru venit, segmente după cumpărături și flows.">
            <RandComutator
              titlu="Sincronizare e-commerce (comenzi + produse)"
              text="Trimite comenzile (Placed Order și Ordered Product; plata cu cardul abia când banii au intrat), anulările, rambursările și catalogul de produse în Klaviyo. Coșurile rămân pe sistemul Edinio."
              activ={ecommerceSync}
              onChange={setEcommerceSync}
            />
            {/* Catalogul intreg (pleaca singur la pornirea sincronizarii e-commerce). */}
            <SincronizareCatalogEmail furnizor="Klaviyo" pornita={config.ecommerce_sync} sincronizeaza={() => syncKlaviyoCatalog(businessId)} />
          </Sectiune>

          <Sectiune pas={4} titlu="Sincronizează clienții existenți"
            descriere="Abonează în listă emailurile clienților care au comandat deja, deduplicate. Folosește-o doar dacă ai consimțământul lor de marketing.">
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

          {/* ⚠ `cePierzi` e citit din `disconnectKlaviyo`: pune `klaviyo_config` pe null, deci
              cheia privata SI setarile. La ei nu atinge nimic, nici macar un webhook. */}
          <ZonaDeconectare descriere="Șterge cheia și setările din Edinio. Contactele trimise deja rămân în Klaviyo.">
            <ButonDeconectare
              nume="Klaviyo"
              cePierzi="Cheia API privată și setările se șterg din Edinio. Contactele trimise deja rămân în contul tău Klaviyo, dar ca să te întorci ceri o cheie nouă de acolo."
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
