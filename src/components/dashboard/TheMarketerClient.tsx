"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Bell, Check, CheckCircle, Copy, ExternalLink, Eye, EyeOff, Gift, KeyRound, Loader2,
  MailCheck, RefreshCw, ShieldCheck, ShoppingBag, Star,
} from "lucide-react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import {
  ascundeRecenziaTheMarketer, conecteazaTheMarketer, deconecteazaTheMarketer, rotesteCheiaTheMarketer,
  salveazaModuleleTheMarketer, testeazaTheMarketer, type ModuleTheMarketer,
} from "@/lib/actions/themarketer.actions";
import { MODULE_IMPLICITE, type TheMarketerConfig } from "@/lib/themarketer/config";
import type { DatePanouTM } from "@/lib/themarketer/panou";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { LasateAfara } from "@/components/dashboard/FacebookCatalogClient";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

/**
 * Pagina theMarketer. Scheletul e cel comun al paginilor de integrari (`PaginaIntegrare`).
 *
 * ⚠ Cheia REST soseste MASCATA (goala, cu `_completate`): orice hotarare pe ea trece prin
 * `secretulEsteSalvat`, nu prin valoarea din formular. Un camp gol inseamna „pastreaza cheia salvata”.
 *
 * ⚠ Adresele (feeduri, coduri, webhookuri) vin calculate de server (`datePanou`) si poarta cheia
 * adreselor: se arata numai aici, ca omul sa le poata lipi in contul theMarketer.
 */

type Chei = { tracking_key: string; customer_id: string; rest_key: string };

const MODULE_START = (c: TheMarketerConfig | null): Required<ModuleTheMarketer> => ({
  urmarire: c?.urmarire ?? MODULE_IMPLICITE.urmarire,
  captura_email: c?.captura_email ?? MODULE_IMPLICITE.captura_email,
  comenzi: c?.comenzi ?? MODULE_IMPLICITE.comenzi,
  coduri: c?.coduri ?? MODULE_IMPLICITE.coduri,
  export_comenzi: c?.export_comenzi ?? MODULE_IMPLICITE.export_comenzi,
  recenzii: c?.recenzii ?? MODULE_IMPLICITE.recenzii,
  fidelitate: c?.fidelitate ?? MODULE_IMPLICITE.fidelitate,
  push: c?.push ?? MODULE_IMPLICITE.push,
  dezabonari: c?.dezabonari ?? MODULE_IMPLICITE.dezabonari,
  anonimizare: c?.anonimizare ?? MODULE_IMPLICITE.anonimizare,
  abonati: {
    checkout: c?.abonati?.checkout ?? true,
    popup: c?.abonati?.popup ?? true,
    forms: c?.abonati?.forms ?? true,
  },
});

function cand(iso: string | null): string {
  if (!iso) return "încă niciodată";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "încă niciodată";
  return d.toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CampAdresa({ eticheta, adresa, citit, nota }: { eticheta: string; adresa: string; citit?: string | null; nota?: string }) {
  const [copiat, setCopiat] = useState(false);
  const copiaza = () => {
    void navigator.clipboard?.writeText(adresa).then(() => {
      setCopiat(true);
      toast.success("Adresa a fost copiată.");
      setTimeout(() => setCopiat(false), 1500);
    }).catch(() => toast.error("Nu am putut copia. Selectează adresa și copiaz-o de mână."));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-xs font-medium text-foreground">{eticheta}</span>
        {citit !== undefined && (
          <span className="text-[11px] text-muted-foreground">Citit de theMarketer: {cand(citit)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input readOnly aria-label={eticheta} value={adresa} onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground" />
        <Button type="button" variant="outline" size="sm" onClick={copiaza}>
          {copiat ? <Check /> : <Copy />} {copiat ? "Copiat" : "Copiază"}
        </Button>
      </div>
      {nota && <p className="text-[11px] leading-relaxed text-muted-foreground">{nota}</p>}
    </div>
  );
}

export function TheMarketerClient({
  businessId,
  initialConfig,
  date,
  statusuri,
  domeniuPropriu,
  gazdaMagazinului,
  eroareCitire,
}: {
  businessId: string;
  initialConfig: TheMarketerConfig | null;
  date: DatePanouTM;
  statusuri: string[];
  domeniuPropriu: boolean;
  /** Domeniul pe care merge vitrina: theMarketer da scriptul numai pe domeniile trecute in contul lor. */
  gazdaMagazinului: string;
  eroareCitire: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [rotesc, setRotesc] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [recenzii, setRecenzii] = useState(date.recenzii.ultimele);

  const cheieSalvata = secretulEsteSalvat(initialConfig, "rest_key");
  const conectat = !!(initialConfig?.enabled && cheieSalvata && initialConfig.tracking_key && initialConfig.customer_id);

  const [chei, setChei] = useState<Chei>({
    tracking_key: initialConfig?.tracking_key ?? "",
    customer_id: initialConfig?.customer_id ?? "",
    rest_key: "",
  });
  const cheiModificate = chei.rest_key.trim() !== ""
    || chei.tracking_key.trim() !== (initialConfig?.tracking_key ?? "")
    || chei.customer_id.trim() !== (initialConfig?.customer_id ?? "");
  const cheiComplete = !!chei.tracking_key.trim() && !!chei.customer_id.trim() && (!!chei.rest_key.trim() || cheieSalvata);

  const { cfg: m, setCfg: setM, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<Required<ModuleTheMarketer>>(MODULE_START(initialConfig));
  const pune = <K extends keyof ModuleTheMarketer>(k: K, v: Required<ModuleTheMarketer>[K]) => setM((p) => ({ ...p, [k]: v }));
  const puneSursa = (s: "checkout" | "forms", v: boolean) => setM((p) => ({ ...p, abonati: { ...p.abonati, [s]: v } }));

  function setCheie<K extends keyof Chei>(k: K, v: string) {
    setTested(false);
    setChei((p) => ({ ...p, [k]: v }));
  }

  async function handleTest() {
    if (!cheiComplete) return toast.error("Completează Tracking Key, Customer ID și REST API Key.");
    setTesting(true);
    try {
      const r = await testeazaTheMarketer(businessId, chei);
      if ("error" in r) toast.error(r.error, { duration: 10000 });
      else {
        setTested(true);
        toast.success(`theMarketer a acceptat toate cele trei chei. Verifică și ca ${gazdaMagazinului} să fie printre domeniile contului.`, { duration: 8000 });
      }
    } catch {
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!conectat && !cheiComplete) return toast.error("Completează Tracking Key, Customer ID și REST API Key.");
    setSaving(true);
    try {
      if (!conectat || cheiModificate) {
        const r = await conecteazaTheMarketer(businessId, chei);
        if ("error" in r) { toast.error(r.error, { duration: 10000 }); return; }
      }
      if (conectat && modificat) {
        const r = await salveazaModuleleTheMarketer(businessId, m);
        if ("error" in r) { toast.error(r.error, { duration: 10000 }); return; }
      }
      toast.success(conectat ? "Setările theMarketer au fost salvate." : "theMarketer e conectat. Mai jos găsești adresele de lipit în contul tău.");
      marcheazaSalvat(m);
      setChei((p) => ({ ...p, rest_key: "" }));
      router.refresh();
    } catch {
      toast.error("Nu am primit răspuns de la server. Verifică dacă s-a salvat, apoi încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRotire() {
    if (!window.confirm("Generez adrese noi? Cele vechi nu mai merg din clipa asta, deci trebuie să le lipești din nou în theMarketer (feedurile, generatorul de coduri și webhookurile).")) return;
    setRotesc(true);
    try {
      const r = await rotesteCheiaTheMarketer(businessId);
      if ("error" in r) toast.error(r.error, { duration: 10000 });
      else { toast.success("Adresele noi sunt gata. Lipește-le în theMarketer."); router.refresh(); }
    } finally {
      setRotesc(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const r = await deconecteazaTheMarketer(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("theMarketer a fost deconectat.");
      setTested(false);
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  async function comutaRecenzia(id: number, ascunsa: boolean) {
    setRecenzii((lista) => lista.map((r) => (r.id === id ? { ...r, ascunsa } : r)));
    const r = await ascundeRecenziaTheMarketer(businessId, id, ascunsa);
    if ("error" in r) {
      setRecenzii((lista) => lista.map((x) => (x.id === id ? { ...x, ascunsa: !ascunsa } : x)));
      toast.error(r.error);
    }
  }

  const a = date.adrese;
  const stari: StareAntet[] = conectat
    ? [
        { ton: "bun", text: "Conectat" },
        ...(date.stare.produse ? [] : [{ ton: "asteptare" as const, text: "Feedul de produse necitit" }]),
      ]
    : [{ ton: "neutru", text: "Neconectat" }];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="themarketer"
      titlu="Email marketing"
      descriere="Conectezi magazinul cu theMarketer: emailuri, SMS și notificări push, recomandări de produse, coș abandonat, fidelitate și recenzii."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Contul theMarketer legat", facut: conectat },
          { text: "Feedul de produse citit de theMarketer", facut: !!date.stare.produse },
          { text: "Urmărirea vizitatorilor pornită", facut: conectat && m.urmarire },
          { text: "Comenzile trimise", facut: conectat && m.comenzi && date.coada.trimise > 0 },
        ]} />
        {conectat && (
          <CardCifre titlu="Ultimele 30 de zile" randuri={[
            { eticheta: "Comenzi trimise", valoare: date.coada.trimise },
            ...(date.coada.inAsteptare > 0 ? [{ eticheta: "În așteptare", valoare: date.coada.inAsteptare }] : []),
            ...(date.coada.esuate > 0 ? [{ eticheta: "Netrimise (după reîncercări)", valoare: date.coada.esuate }] : []),
            { eticheta: "Coduri generate", valoare: `${date.coduri.generate} (${date.coduri.folosite} folosite)` },
            { eticheta: "Recenzii aduse", valoare: date.recenzii.total },
            { eticheta: "Dezabonați aduși", valoare: cand(date.stare.dezabonari) },
          ]} />
        )}
        <CumFunctioneaza id="themarketer" puncte={[
          { Icon: KeyRound, text: "Cheile sunt în theMarketer, la Settings, Technical Integration: Tracking Key, REST API Key și Customer ID." },
          { Icon: ShoppingBag, text: "Feedul de produse e obligatoriu: fără el, theMarketer nu recunoaște produsele din evenimente și nici nu le poate recomanda." },
          { Icon: MailCheck, text: "Abonarea pleacă numai cu acordul omului. Emailul de confirmare (dubla opțiune) îl trimite theMarketer." },
          { Icon: ShieldCheck, text: "Scriptul se încarcă doar după acordul pentru cookie-uri de marketing, ca pixelii Meta și TikTok." },
        ]} />
      </>}
    >
      {eroareCitire && (
        <Callout variant="danger" icon={AlertTriangle} title="Setările theMarketer nu s-au putut citi">
          Reîncarcă pagina înainte să salvezi: altfel ai salva peste setări pe care nu le vezi.
        </Callout>
      )}
      {conectat && date.stare.eroare && (
        <Callout variant="warning" icon={AlertTriangle} title="Ultima problemă raportată">
          {date.stare.eroare} <span className="text-muted-foreground">({cand(date.stare.eroareLa)})</span>
        </Callout>
      )}

      <Sectiune pas={1} titlu="Contul theMarketer" descriere="Cele trei chei din theMarketer, de la Settings, Technical Integration.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tracking Key" htmlFor="tm-tracking" required
            ajutor={<ExplicatieCard marime="mic" intrebare="Ce e" eticheta="Tracking Key"
              text="Cheia scriptului de urmărire. E publică: ajunge în pagina fiecărui vizitator, deci nu e o parolă." />}>
            <Input id="tm-tracking" type="text" autoComplete="off" value={chei.tracking_key}
              onChange={(e) => setCheie("tracking_key", e.target.value.trim())} className="font-mono" />
          </Field>
          <Field label="Customer ID" htmlFor="tm-customer" required hint="Identificatorul contului tău theMarketer.">
            <Input id="tm-customer" type="text" autoComplete="off" value={chei.customer_id}
              onChange={(e) => setCheie("customer_id", e.target.value.trim())} className="font-mono" />
          </Field>
          <Field label="REST API Key" htmlFor="tm-rest" required
            hint={cheieSalvata ? "Salvată și criptată. Scrie una nouă doar dacă vrei s-o schimbi." : "Se păstrează criptată și nu se mai afișează."}>
            <Input id="tm-rest" type="password" value={chei.rest_key} onChange={(e) => setCheie("rest_key", e.target.value.trim())}
              placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} className="font-mono" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !cheiComplete}>
            {testing ? <Loader2 className="animate-spin" /> : tested ? <CheckCircle className="text-success" /> : <RefreshCw />}
            {testing ? "Se verifică..." : tested ? "Conexiune reușită" : "Testează conexiunea"}
          </Button>
          <a href="https://app.themarketer.com/settings/technical-integration" target="_blank" rel="noopener noreferrer" className={legatura}>
            Deschide Technical Integration <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {/*
          ⚠ theMarketer da scriptul NUMAI pe domeniile contului: pe altul raspunde 403 si nu urmareste nimic,
          fara nicio eroare in Edinio. Proba de conexiune nu poate vedea asta (cererea ei n-are domeniu).
        */}
        <p className="text-xs text-muted-foreground">
          theMarketer încarcă scriptul numai pe domeniile contului tău. Magazinul tău e pe{" "}
          <span className="font-mono text-foreground">{gazdaMagazinului}</span>: dacă în theMarketer ai alt domeniu
          principal, adaugă-l pe acesta la Settings, Technical Integration, Extra domains. Altfel vizitele și
          coșurile nu ajung în theMarketer.
        </p>
      </Sectiune>

      {conectat && a && (<>
        <Sectiune pas={2} titlu="Feedurile" descriere="Le lipești o singură dată în theMarketer, la Settings, Products. Se actualizează singure.">
          <CampAdresa eticheta="Feedul de produse (obligatoriu)" adresa={a.produse} citit={date.stare.produse}
            nota="Cu variante, preț redus, stoc și categoria completă. Produsele fără imagine sau cu prețul la metru pătrat rămân afară, ca în catalogul Meta." />
          {/* Care anume rămân afară, cu legătura spre produs: aceeași regulă și aceeași citire ca la Meta. */}
          <LasateAfara explicatii={{
            "fara-imagine": "theMarketer cere o imagine pentru fiecare produs din feed: fără ea nu-l poate arăta în emailuri și nici recomanda, așa că produsul nu pleacă deloc. Adaugă-i cel puțin o imagine și intră singur la următoarea citire a feedului.",
          }} />
          <CampAdresa eticheta="Feedul de categorii" adresa={a.categorii} citit={date.stare.categorii} />
          <CampAdresa eticheta="Feedul de branduri" adresa={a.branduri} citit={date.stare.branduri} />
          <RandComutator
            separat
            titlu="Comenzile vechi, pentru importul istoric"
            text="theMarketer le citește o singură dată (ultimii 3 ani), pentru programul de fidelitate și analiza RFM. Adresa scoate date ale clienților: pornește-o doar cât durează importul."
            activ={m.export_comenzi}
            onChange={(v) => pune("export_comenzi", v)}
          />
          {initialConfig?.export_comenzi && (
            <CampAdresa eticheta="Feedul de comenzi (import istoric)" adresa={a.comenzi} citit={date.stare.comenzi}
              nota="Paginat cu „page”, câte 50 de comenzi, cum cere theMarketer. Fără comenzile de pe marketplace-uri și fără plățile online neîncasate." />
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={handleRotire} disabled={rotesc}>
              {rotesc ? <Loader2 className="animate-spin" /> : <RefreshCw />} Generează adrese noi
            </Button>
            <span className="text-[11px] text-muted-foreground">Dacă o adresă a ajuns unde nu trebuia. Cele vechi se opresc pe loc.</span>
          </div>
        </Sectiune>

        <Sectiune pas={3} titlu="Vitrina" descriere="Ce vede theMarketer din magazin. Totul pleacă numai cu acordul pentru cookie-uri de marketing.">
          <RandComutator
            titlu="Urmărirea vizitatorilor"
            text="Scriptul theMarketer și evenimentele: pagina principală, categoria, brandul, produsul văzut, adăugat și scos din coș, checkout-ul, comanda și căutarea. De aici vin recomandările și coșul abandonat."
            activ={m.urmarire}
            onChange={(v) => pune("urmarire", v)}
          />
          <RandComutator
            separat
            titlu="Emailul din checkout, pentru coșul abandonat"
            text="Emailul și telefonul scrise în checkout pleacă spre theMarketer când omul iese din câmp, înainte să comande. Fără ele, automatizarea de coș abandonat din theMarketer nu are cui să scrie. Pornește-o doar dacă ai spus asta în politica de confidențialitate."
            activ={m.captura_email}
            onChange={(v) => pune("captura_email", v)}
            disabled={!m.urmarire}
          />
          <RandComutator
            separat
            titlu="Notificări push"
            text={domeniuPropriu
              ? "Pune pe domeniul tău fișierele de care au nevoie notificările push theMarketer. Cererea de permisiune o arată theMarketer, după cum o configurezi la ei."
              : "Merg numai pe domeniul propriu al magazinului: notificările cer un fișier la rădăcina domeniului. Conectează-ți domeniul din Setări, Domeniu."}
            activ={m.push}
            onChange={(v) => pune("push", v)}
            disabled={!m.urmarire || (!domeniuPropriu && !m.push)}
          />
        </Sectiune>

        <Sectiune pas={4} titlu="Comenzi și abonați" descriere="Ce trimite Edinio spre theMarketer, din server.">
          <RandComutator
            titlu="Comenzile și statusul lor"
            text="Comanda cu ramburs pleacă la creare, cea cu cardul abia după plată. Apoi fiecare schimbare: expediată, livrată, anulată, rambursată. Comenzile de pe marketplace-uri nu pleacă."
            activ={m.comenzi}
            onChange={(v) => pune("comenzi", v)}
          />
          {m.comenzi && (
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                Statusurile trimise. Leagă-le în theMarketer de statusurile lor (de exemplu Delivered la „Fulfilled”), ca punctele de fidelitate să se dea la livrare:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {statusuri.map((s) => (
                  <span key={s} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground">{s}</span>
                ))}
              </div>
            </div>
          )}
          <RandComutator separat titlu="Abonare din checkout" text="Cine bifează newsletterul la comandă intră în theMarketer, numai pe canalul email."
            activ={m.abonati.checkout !== false} onChange={(v) => puneSursa("checkout", v)} />
          <RandComutator separat titlu="Abonare din formulare" text="Blocul de newsletter din pagini și formularele bifate „Adaugă abonații în theMarketer”."
            activ={m.abonati.forms !== false} onChange={(v) => puneSursa("forms", v)} />
        </Sectiune>

        <Sectiune pas={5} titlu="Coduri de reducere unice" descriere="Pentru automatizări și programul de fidelitate: theMarketer cere câte un cod pentru fiecare om.">
          <RandComutator
            titlu="Generatorul de coduri"
            text="Fiecare cod e bun pentru o singură comandă: valoare fixă, procent sau transport gratuit, cu expirarea cerută de theMarketer. Nu apar în lista de reduceri (ar fi mii), dar le găsești căutându-le."
            activ={m.coduri}
            onChange={(v) => pune("coduri", v)}
          />
          {initialConfig?.coduri !== false && (
            <CampAdresa eticheta="Adresa generatorului" adresa={a.coduri} citit={date.stare.cod}
              nota="O dai la theMarketer pentru regulile de reducere. Ei adaugă singuri cheia REST la fiecare cerere, iar fără ea nu se generează nimic." />
          )}
        </Sectiune>

        <Sectiune pas={6} titlu="Dezabonări și date personale" descriere="Un „nu” spus într-un loc se aude și în celălalt.">
          <RandComutator
            titlu="Dezabonații din theMarketer opresc și emailurile Edinio"
            text="Cine se dezabonează în theMarketer (sau are adresa respinsă ori te raportează ca spam) nu mai primește nici emailurile de coș abandonat trimise de Edinio. Se verifică în fiecare oră; cu webhookurile de mai jos, pe loc."
            activ={m.dezabonari}
            onChange={(v) => pune("dezabonari", v)}
          />
          {m.dezabonari && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                Opțional, în theMarketer la Settings, Webhooks: câte un webhook pe adresă, cu autentificarea „None” (cheia e în adresă).
              </p>
              <CampAdresa eticheta="Contact unsubscribed" adresa={a.webhookDezabonat} citit={date.stare.webhook} />
              <CampAdresa eticheta="Email bounced" adresa={a.webhookRespins} nota="Contează doar respingerile definitive (bounce_hard)." />
              <CampAdresa eticheta="Email marked as spam" adresa={a.webhookSpam} />
            </div>
          )}
          <RandComutator
            separat
            titlu="Anonimizarea ajunge și în theMarketer"
            text="Când anonimizezi un client în Edinio (Clienți), adresa lui se anonimizează și în theMarketer, iar recenziile lui aduse aici se șterg."
            activ={m.anonimizare}
            onChange={(v) => pune("anonimizare", v)}
          />
        </Sectiune>

        <Sectiune pas={7} titlu="Recenzii și fidelitate" descriere="Din modulele Feedback și Loyalty ale theMarketer (planul Ecommerce PRO).">
          <RandComutator
            titlu="Recenziile pe pagina produsului"
            text="Recenziile lăsate prin theMarketer vin în fiecare oră și apar pe pagina produsului, cu nota și pozele clienților. Numele se arată prescurtat."
            activ={m.recenzii}
            onChange={(v) => pune("recenzii", v)}
          />
          {recenzii.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {recenzii.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                  <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      {r.produs} <span className="font-normal text-muted-foreground">· {Math.round(r.nota / 2 * 10) / 10}/5 · {r.autor || "Client"}</span>
                    </p>
                    {r.text && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.text}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => comutaRecenzia(r.id, !r.ascunsa)}
                    aria-label={r.ascunsa ? "Arată recenzia" : "Ascunde recenzia"}>
                    {r.ascunsa ? <EyeOff /> : <Eye />} {r.ascunsa ? "Ascunsă" : "Vizibilă"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <RandComutator
            separat
            titlu="Punctele de fidelitate în contul clientului"
            text="În contul clientului din magazin apar punctele, nivelul și codurile de reducere primite și nefolosite. Cere conturile de client pornite."
            activ={m.fidelitate}
            onChange={(v) => pune("fidelitate", v)}
          />
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            Punctele se dau după statusurile comenzilor, legate la pasul 4. Pentru comenzile dinainte de conectare, folosește importul istoric de la pasul 2.
          </p>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            Emailurile și SMS-urile de comandă rămân cele trimise de Edinio; theMarketer le-ar factura separat.
          </p>
        </Sectiune>

        <ZonaDeconectare descriere="Șterge cheile din Edinio și oprește adresele. Contactele și comenzile rămân în contul tău theMarketer.">
          <ButonDeconectare
            nume="theMarketer"
            cePierzi="Cheile și setările se șterg din Edinio, adresele feedurilor și ale generatorului de coduri se opresc, iar scriptul dispare din magazin. Datele deja trimise rămân în contul tău theMarketer. Ca să te întorci, scrii din nou cele trei chei."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      </>)}

      <BaraSalvare
        modificat={conectat ? (modificat || cheiModificate) : undefined}
        saving={saving}
        onSalveaza={handleSave}
        onRenunta={conectat ? () => { renunta(); setChei({ tracking_key: initialConfig?.tracking_key ?? "", customer_id: initialConfig?.customer_id ?? "", rest_key: "" }); setTested(false); } : undefined}
        textSalveaza={conectat ? "Salvează" : "Conectează"}
      />
    </PaginaIntegrare>
  );
}
