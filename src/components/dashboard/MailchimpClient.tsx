"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, KeyRound, Loader2, MailCheck, Plug, RefreshCw, ShoppingBag, Users } from "lucide-react";
import {
  connectMailchimp, disconnectMailchimp, getMailchimpAudiences,
  saveMailchimpSettings, syncExistingCustomers, syncMailchimpCatalog,
} from "@/lib/actions/mailchimp.actions";
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
import type { MailchimpPublicConfig, MailchimpAudience } from "@/lib/mailchimp";

export function MailchimpClient({ businessId, initialConfig }: { businessId: string; initialConfig: MailchimpPublicConfig }) {
  const [config, setConfig] = useState<MailchimpPublicConfig>(initialConfig);
  const [apiKey, setApiKey] = useState("");
  const [audiences, setAudiences] = useState<MailchimpAudience[]>([]);
  const [audiencesLoaded, setAudiencesLoaded] = useState(false);

  // Editable draft (persisted on "Salveaza").
  const [audienceId, setAudienceId] = useState(initialConfig.audience_id ?? "");
  const [doubleOptin, setDoubleOptin] = useState(initialConfig.double_optin);
  const [tagsInput, setTagsInput] = useState((initialConfig.default_tags ?? []).join(", "));
  const [checkoutSource, setCheckoutSource] = useState(initialConfig.sources.checkout);
  const [ecommerceSync, setEcommerceSync] = useState(initialConfig.ecommerce_sync);

  /* Bara de salvare: apare doar cand setarile s-au departat de ultima salvare. */
  const valori = { audienceId, doubleOptin, tagsInput, checkoutSource, ecommerceSync };
  const [reper, setReper] = useState(valori);
  const modificat = config.connected && JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setAudienceId(reper.audienceId); setDoubleOptin(reper.doubleOptin); setTagsInput(reper.tagsInput);
    setCheckoutSource(reper.checkoutSource); setEcommerceSync(reper.ecommerceSync);
  }

  const [connecting, startConnect] = useTransition();
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();
  const [loadingAudiences, startAudiences] = useTransition();

  function connect() {
    if (!apiKey.trim()) { toast.error("Introdu cheia API Mailchimp."); return; }
    startConnect(async () => {
      let res: Awaited<ReturnType<typeof connectMailchimp>>;
      try {
        res = await connectMailchimp(businessId, apiKey.trim());
      } catch {
        /* ⚠ Cheia pleaca la Mailchimp ca sa fie validata. Nestiut: daca s-a legat contul. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a conectat contul Mailchimp. "
          + "Reimprospateaza pagina si uita-te daca apare conectat inainte sa incerci din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setConfig(res.config);
      setAudiences(res.audiences);
      setAudiencesLoaded(true);
      setApiKey("");
      toast.success(`Conectat la Mailchimp${res.config.account_name ? ` (${res.config.account_name})` : ""}.`);
    });
  }

  function reloadAudiences() {
    startAudiences(async () => {
      let res: Awaited<ReturnType<typeof getMailchimpAudiences>>;
      try {
        res = await getMailchimpAudiences(businessId);
      } catch {
        /* ⚠ O CITIRE: nu se schimba nimic, nici la noi, nici la ei. Singurul loc din arc unde
           reincercarea chiar e raspunsul corect, si se spune. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca audientele s-au putut citi. "
          + "Nu s-a schimbat nimic, deci poti incerca din nou linistit.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      setAudiences(res.audiences);
      setAudiencesLoaded(true);
      if (res.audiences.length === 0) toast.info("Contul nu are nicio audiență. Creează una în Mailchimp.");
    });
  }

  function save() {
    startSave(async () => {
      const default_tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const selected = audiences.find((a) => a.id === audienceId);
      let res: Awaited<ReturnType<typeof saveMailchimpSettings>>;
      try {
        res = await saveMailchimpSettings(businessId, {
          audience_id: audienceId || undefined,
          audience_name: selected?.name ?? config.audience_name,
          double_optin: doubleOptin,
          default_tags,
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
      let res: Awaited<ReturnType<typeof disconnectMailchimp>>;
      try {
        res = await disconnectMailchimp(businessId);
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
      setConfig({ ...config, enabled: false, connected: false, account_name: undefined, audience_id: undefined, audience_name: undefined });
      setAudiences([]);
      setAudiencesLoaded(false);
      setAudienceId("");
      setReper({ ...valori, audienceId: "" });
      toast.success("Cont Mailchimp deconectat.");
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
          + "Uita-te in audienta din contul Mailchimp inainte sa apesi din nou: data ultimei "
          + "sincronizari de pe ecran se scrie abia dupa ce raspunde furnizorul, deci poate "
          + "ramane in urma.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      if (res.total === 0) { toast.info("Nu există clienți cu email de sincronizat."); return; }
      toast.success(`Sincronizat: ${res.created} adăugați, ${res.updated} actualizați${res.errors ? `, ${res.errors} eșuate` : ""} (din ${res.total}).`);
      setConfig({ ...config, last_sync_at: new Date().toISOString() });
    });
  }

  const hasAudience = !!config.audience_id;

  const stari: StareAntet[] = config.connected
    ? [{ ton: "bun", text: "Conectat" }]
    : [{ ton: "neutru", text: "Neconectat" }];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="mailchimp"
      titlu="Email marketing"
      descriere="Abonații din magazin intră în audiența ta Mailchimp, de unde trimiți campanii."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul Mailchimp legat", facut: config.connected },
          { text: "Audiența aleasă", facut: config.connected && hasAudience },
          { text: "Abonarea la comandă", facut: config.connected && !!config.sources.checkout },
        ]} />
        {config.connected && (
          <CardCifre titlu="Contul legat" randuri={[
            { eticheta: "Cont", valoare: config.account_name || "Mailchimp" },
            { eticheta: "Audiența", valoare: config.audience_name || "nealeasă" },
            ...(config.last_sync_at ? [{ eticheta: "Ultima sincronizare", valoare: new Date(config.last_sync_at).toLocaleString("ro-RO") }] : []),
          ]} />
        )}
        <CumFunctioneaza id="mailchimp" puncte={[
          { Icon: KeyRound, text: "Te conectezi cu o cheie API din Mailchimp: Account, Extras, API keys." },
          { Icon: Users, text: "Alegi audiența în care intră abonații magazinului." },
          { Icon: MailCheck, text: "Cine bifează abonarea la comandă intră în audiență; cu confirmarea dublă primește întâi un email." },
          { Icon: ShoppingBag, text: "Cu sincronizarea e-commerce, produsele și comenzile ajung în Mailchimp, pentru venit atribuit și segmente." },
        ]} />
      </>}
    >
      {!config.connected ? (
        <Sectiune pas={1} titlu="Contul Mailchimp" descriere="Te conectezi cu o cheie API din contul tău Mailchimp.">
          <Field label="Cheie API Mailchimp" htmlFor="mailchimp-cheie"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia API Mailchimp"
              text="În Mailchimp: Account, apoi Extras, apoi API keys. Generezi o cheie și o copiezi aici." />}>
            <Input id="mailchimp-cheie" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ex: 0123abcd...-us21" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="animate-spin" /> : <Plug />}
              Conectează contul
            </Button>
            <a href="https://us1.admin.mailchimp.com/account/api/" target="_blank" rel="noopener noreferrer" className={legatura}>
              Cheile API în Mailchimp <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Sectiune>
      ) : (
        <>
          <Sectiune pas={1} titlu="Audiența (listă)" descriere="Lista din Mailchimp în care intră abonații magazinului.">
            {audiencesLoaded && audiences.length > 0 ? (
              <select aria-label="Audiența" value={audienceId} onChange={(e) => setAudienceId(e.target.value)} className={selectCls}>
                <option value="">Alege o audiență...</option>
                {audiences.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.member_count} abonați)</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {hasAudience
                  ? `Audiența curentă: ${config.audience_name ?? ""}. Apasă „Reîncarcă” ca s-o schimbi.`
                  : "Apasă „Încarcă audiențele” ca să alegi lista în care se adaugă abonații."}
              </p>
            )}
            <div>
              <Button variant="outline" size="sm" onClick={reloadAudiences} disabled={loadingAudiences}>
                {loadingAudiences ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {audiencesLoaded ? "Reîncarcă" : "Încarcă audiențele"}
              </Button>
            </div>
          </Sectiune>

          <Sectiune pas={2} titlu="Abonarea" descriere="Cine ajunge în audiență și cu ce etichete.">
            <RandComutator
              titlu="Abonare la finalizarea comenzii"
              text="Când clientul bifează căsuța de abonare la comandă, emailul lui intră în audiență."
              activ={checkoutSource}
              onChange={setCheckoutSource}
            />
            <RandComutator
              separat
              titlu="Confirmare dublă (double opt-in)"
              text="Mailchimp trimite un email de confirmare înainte de abonare. Recomandat pentru conformitatea cu GDPR."
              activ={doubleOptin}
              onChange={setDoubleOptin}
            />
            <div className="border-t border-border pt-4">
              <Field label="Etichete implicite (opțional)" htmlFor="mailchimp-etichete"
                hint="Se aplică tuturor abonaților trimiși, separate prin virgulă. Sursa (Checkout sau Clienți) se adaugă singură ca etichetă.">
                <Input id="mailchimp-etichete" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex: Edinio, Newsletter" />
              </Field>
            </div>
          </Sectiune>

          <Sectiune pas={3} titlu="Sincronizare e-commerce" descriere="Produsele și comenzile, pentru venit atribuit, segmente după cumpărături și recomandări.">
            <RandComutator
              titlu="Sincronizare e-commerce (produse + comenzi)"
              text="Trimite produsele și comenzile în Mailchimp. Coșurile rămân pe sistemul Edinio."
              activ={ecommerceSync}
              onChange={setEcommerceSync}
            />
            {/* Catalogul intreg (pleaca singur la pornirea sincronizarii e-commerce). */}
            <SincronizareCatalogEmail furnizor="Mailchimp" pornita={config.ecommerce_sync} sincronizeaza={() => syncMailchimpCatalog(businessId)} />
          </Sectiune>

          <Sectiune pas={4} titlu="Sincronizează clienții existenți"
            descriere="Trimite în audiență emailurile clienților care au comandat deja, deduplicate. Folosește-o doar dacă ai consimțământul lor de marketing.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Comenzile din marketplace (Pepita, eMAG, Trendyol, About You) sunt sărite: cumpărătorii lor nu sunt clienții tăi.
              {config.last_sync_at && <> Ultima sincronizare: {new Date(config.last_sync_at).toLocaleString("ro-RO")}.</>}
            </p>
            <div>
              <Button variant="outline" onClick={syncCustomers} disabled={syncing || !hasAudience}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Sincronizează acum
              </Button>
              {!hasAudience && <p className="mt-1.5 text-xs text-warning">Alege și salvează o audiență întâi.</p>}
            </div>
          </Sectiune>

          {/* ⚠ `cePierzi` e citit din `disconnectMailchimp`: scoate webhookurile noastre de pe
              audienta, apoi pune `mailchimp_config` pe null, adica cheia SI toate setarile. */}
          <ZonaDeconectare descriere="Șterge cheia și setările din Edinio. Abonații trimiși deja rămân în Mailchimp.">
            <ButonDeconectare
              nume="Mailchimp"
              cePierzi="Cheia API și setările se șterg din Edinio, iar webhookurile puse de noi pe audiență se scot din Mailchimp. Abonații trimiși deja rămân acolo, dar ca să te întorci ceri o cheie nouă de acolo."
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
