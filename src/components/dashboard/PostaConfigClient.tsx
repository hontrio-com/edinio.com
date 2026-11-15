"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, FileSignature, Hash, Info, KeyRound, Loader2, Stethoscope } from "lucide-react";
import {
  diagnosticPostaAction,
  disconnectPosta,
  getPostaPlajaAction,
  savePostaConfig,
  savePostaPlajaAction,
  testPostaConnectionAction,
} from "@/lib/actions/posta.actions";
import type { PostaConfig, ServiciiPosta } from "@/lib/posta/client";
import { problemePlaja, type PlajaConfig } from "@/lib/posta/plaja";
import { JUDETE } from "@/lib/ro/judete";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea Poșta Română.
 *
 * ═══ ⚠ ECRANUL ASTA DUCE MAI MULT DECAT CELELALTE, SI DIN DOUA MOTIVE ═══
 *
 * 1. **Aproape tot ce se completeaza aici vine din CONTRACTUL comerciantului**, nu
 *    din documentatia API. `codTrimitere`, bifele de servicii si plaja de coduri
 *    difera de la un magazin la altul, iar documentatia spune limpede ca optiunile
 *    sunt „valide doar dacă în contract vor fi permise". Deci fiecare camp are
 *    nevoie de o explicatie despre DE UNDE se ia, nu doar de o eticheta.
 *
 * 2. **Nu exista mediu de test si nu am vazut niciodata raspunsurile lor.** De
 *    aceea exista butonul de diagnostic: el masoara pe fir ce documentatia nu
 *    spune (ce coduri de status au aparut, cate oficii au denumire, cum se cheama
 *    de fapt campurile nomenclatorului).
 *
 * ⚠ TOATE BIFELE PORNESC STINSE. Una aprinsa „ca sa fie" e o afirmatie despre
 * contractul altcuiva, iar refuzul Postei vine intr-un format pe care nu-l putem
 * traduce in ceva folositor.
 */

/** Bifele de servicii, cu explicatia fiecareia. Ordinea e cea din documentatie. */
const SERVICII: { cheie: keyof ServiciiPosta; eticheta: string; explicatie: string }[] = [
  {
    cheie: "retur",
    eticheta: "Retur la expeditor",
    explicatie: "Dacă destinatarul nu ridică trimiterea, se întoarce la tine. Fără ea, marfa rămâne la oficiu.",
  },
  {
    cheie: "confirmarePrimire",
    eticheta: "Confirmare de primire",
    explicatie: "Primești dovada semnată că trimiterea a fost predată.",
  },
  {
    cheie: "confirmarePrimirePostRestant",
    eticheta: "Confirmare de primire la oficiu",
    explicatie: "Aceeași dovadă, pentru trimiterile ridicate de la oficiu.",
  },
  {
    cheie: "rambursPostRestant",
    eticheta: "Ramburs la oficiu",
    explicatie: "Banii se încasează la ghișeu, când destinatarul ridică trimiterea.",
  },
  {
    cheie: "avizareSms",
    eticheta: "Avizare prin SMS",
    explicatie: "Destinatarul e anunțat prin SMS.",
  },
  {
    cheie: "desfacereColet",
    eticheta: "Desfacere colet la livrare",
    explicatie: "Destinatarul poate verifica coletul înainte să-l ridice.",
  },
  {
    cheie: "garantieLivrare",
    eticheta: "Garanție de livrare",
    explicatie: "În 3 zile, coletul poate fi returnat de destinatar, cu taxele poștale în sarcina ta.",
  },
  { cheie: "fragil", eticheta: "Fragil", explicatie: "Manipulare cu grijă." },
  { cheie: "voluminos", eticheta: "Voluminos", explicatie: "Trimitere peste dimensiunile obișnuite." },
  {
    cheie: "manaProprie",
    eticheta: "Mână proprie",
    explicatie: "Se predă numai destinatarului. Nu se combină cu livrarea la oficiu.",
  },
  {
    cheie: "factajLivrare",
    eticheta: "Factaj la livrare",
    explicatie: "Transport la domiciliu pentru trimiteri grele. Nu se combină cu livrarea la oficiu.",
  },
  { cheie: "factajPreluare", eticheta: "Factaj la preluare", explicatie: "Același serviciu, la ridicare." },
  { cheie: "pcp", eticheta: "PCP", explicatie: "Opțiune de contract. Pornește-o doar dacă o ai în contract." },
  { cheie: "ec", eticheta: "EC", explicatie: "Opțiune de contract. Pornește-o doar dacă o ai în contract." },
];

type Diagnostic = Awaited<ReturnType<typeof diagnosticPostaAction>>;

export function PostaConfigClient({
  businessId,
  initialConfig,
  initialPlaja,
}: {
  businessId: string;
  initialConfig: PostaConfig | null;
  initialPlaja: (PlajaConfig & { urmator: number; ramase: number }) | null;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [diagnosticand, setDiagnosticand] = useState(false);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [codTrimitere, setCodTrimitere] = useState(initialConfig?.cod_trimitere ?? "");
  const [tipMandat, setTipMandat] = useState(initialConfig?.tip_mandat ?? "");
  const [tipAchitare, setTipAchitare] = useState(initialConfig?.tip_achitare_ramburs ?? "");

  const [postRestant, setPostRestant] = useState(initialConfig?.post_restant ?? false);
  const [borderou, setBorderou] = useState(initialConfig?.foloseste_borderou ?? false);
  const [valoareDeclarata, setValoareDeclarata] = useState(initialConfig?.valoare_declarata ?? "minim");
  const [zilePrezentare, setZilePrezentare] = useState(String(initialConfig?.zile_pana_la_prezentare ?? 0));
  const [servicii, setServicii] = useState<ServiciiPosta>(initialConfig?.servicii ?? {});

  /* Expeditorul: implicit gol, adica „ia-l din contul meu de la Posta". */
  const ex = initialConfig?.expeditor ?? {};
  const [expeditorPropriu, setExpeditorPropriu] = useState(Object.keys(ex).length > 0);
  const [exNume, setExNume] = useState(ex.nume ?? "");
  const [exContact, setExContact] = useState(ex.persoanaDeContact ?? "");
  const [exStrada, setExStrada] = useState(ex.adresa ?? "");
  const [exOras, setExOras] = useState(ex.localitate ?? "");
  const [exJudet, setExJudet] = useState(ex.judet ?? "");
  const [exCodPostal, setExCodPostal] = useState(ex.codPostal ?? "");
  const [exTelefon, setExTelefon] = useState(ex.telefon ?? "");
  const [exEmail, setExEmail] = useState(ex.email ?? "");

  /* Plaja de coduri. Goala inseamna „codul il genereaza Posta". */
  const [plajaPornita, setPlajaPornita] = useState(!!initialPlaja);
  const [prefix, setPrefix] = useState(initialPlaja?.prefix ?? "LN");
  const [deLa, setDeLa] = useState(initialPlaja ? String(initialPlaja.deLa) : "");
  const [panaLa, setPanaLa] = useState(initialPlaja ? String(initialPlaja.panaLa) : "");
  const [cifre, setCifre] = useState(String(initialPlaja?.cifre ?? 11));

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    username, password, codTrimitere, tipMandat, tipAchitare, postRestant, borderou, valoareDeclarata, zilePrezentare,
    servicii, expeditorPropriu, exNume, exContact, exStrada, exOras, exJudet, exCodPostal, exTelefon, exEmail,
    plajaPornita, prefix, deLa, panaLa, cifre,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setCodTrimitere(reper.codTrimitere); setTipMandat(reper.tipMandat);
    setTipAchitare(reper.tipAchitare); setPostRestant(reper.postRestant); setBorderou(reper.borderou);
    setValoareDeclarata(reper.valoareDeclarata); setZilePrezentare(reper.zilePrezentare); setServicii(reper.servicii);
    setExpeditorPropriu(reper.expeditorPropriu); setExNume(reper.exNume); setExContact(reper.exContact); setExStrada(reper.exStrada);
    setExOras(reper.exOras); setExJudet(reper.exJudet); setExCodPostal(reper.exCodPostal); setExTelefon(reper.exTelefon);
    setExEmail(reper.exEmail); setPlajaPornita(reper.plajaPornita); setPrefix(reper.prefix); setDeLa(reper.deLa);
    setPanaLa(reper.panaLa); setCifre(reper.cifre);
  }

  const areParola = password.trim() !== "" || secretulEsteSalvat(initialConfig, "password");
  /*
   * ⚠ ACEEASI regula ca `postaGata` de pe server: `enabled` + user + parola +
   * codul de trimitere. Parola nu ajunge in browser (e mascata), deci prezenta ei
   * se citeste din `_completate`.
   */
  const isActive = !!(
    initialConfig?.enabled
    && initialConfig.username
    && initialConfig.cod_trimitere
    && secretulEsteSalvat(initialConfig, "password")
  );

  function construieste(): PostaConfig {
    return {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      cod_trimitere: codTrimitere.trim(),
      tip_mandat: tipMandat.trim(),
      tip_achitare_ramburs: tipAchitare.trim(),
      post_restant: postRestant,
      foloseste_borderou: borderou,
      valoare_declarata: valoareDeclarata,
      zile_pana_la_prezentare: Math.max(0, Number(zilePrezentare) || 0),
      servicii,
      expeditor: expeditorPropriu
        ? {
            nume: exNume.trim(),
            persoanaDeContact: exContact.trim() || exNume.trim(),
            adresa: exStrada.trim(),
            localitate: exOras.trim(),
            judet: exJudet,
            codPostal: exCodPostal.trim(),
            telefon: exTelefon.trim(),
            email: exEmail.trim(),
          }
        : undefined,
    };
  }

  function plajaCurenta(): PlajaConfig {
    return {
      prefix: prefix.trim(),
      deLa: Number(deLa) || 0,
      panaLa: Number(panaLa) || 0,
      cifre: Number(cifre) || 11,
    };
  }

  async function handleTest() {
    if (!username.trim()) return toast.error("Completează utilizatorul.");
    if (!areParola) return toast.error("Completează parola.");
    setTesting(true);
    const r = await testPostaConnectionAction(businessId, construieste());
    setTesting(false);

    if (r.fel === "autentificat") {
      toast.success(`Conexiune reușită: ${r.unitati} oficii de livrare.`);
      return;
    }
    if (r.fel === "raspunde_dar_public") {
      /*
       * ⚠ Nu e „verde". Vezi `probaConexiune`: daca nomenclatorul raspunde si
       * FARA credentiale, proba nu dovedeste nimic despre user si parola — iar o
       * bifa verde mincinoasa l-ar face pe comerciant sa afle ca nu e conectat
       * abia la prima expediere. Exact capcana platita la eColet.
       */
      toast.warning(
        `Serverul Poștei răspunde (${r.unitati} oficii), dar aceeași listă se obține și fără `
        + "date de acces, deci proba NU dovedește că utilizatorul și parola sunt bune. "
        + "Asta se vede sigur abia la prima trimitere.",
        { duration: 12000 },
      );
      return;
    }
    toast.error(`Posta Romana: ${r.mesaj}`);
  }

  async function handleDiagnostic() {
    setDiagnosticand(true);
    const r = await diagnosticPostaAction(businessId);
    setDiagnosticand(false);
    setDiagnostic(r);
    if (!r.ok) toast.error(r.error);
  }

  async function handleSave() {
    if (!username.trim()) return toast.error("Completează utilizatorul.");
    if (!areParola) return toast.error("Completează parola.");
    if (!codTrimitere.trim()) {
      return toast.error("Completează codul de trimitere din contract: fără el nu se poate emite niciun AWB.");
    }
    if (expeditorPropriu && (!exNume.trim() || !exStrada.trim() || !exOras.trim())) {
      return toast.error("Adresa de ridicare are nevoie de nume, stradă și localitate.");
    }
    if (plajaPornita) {
      const probleme = problemePlaja(plajaCurenta());
      if (probleme.length) return toast.error(`Plaja de coduri: ${probleme.join("; ")}`);
    }

    setSaving(true);
    const [rConfig, rPlaja] = await Promise.all([
      savePostaConfig(businessId, construieste()),
      savePostaPlajaAction(businessId, plajaPornita ? plajaCurenta() : null),
    ]);
    setSaving(false);

    if ("error" in rConfig) return toast.error(rConfig.error);
    if ("error" in rPlaja) return toast.error(`Plaja de coduri: ${rPlaja.error}`);

    for (const av of rPlaja.avertismente) toast.warning(av, { duration: 10000 });
    toast.success("Configurarea Poștei Române a fost salvată.");
    setPassword("");
    setReper({ ...valori, password: "" });
    router.refresh();
  }

  /* ⚠ Fara `window.confirm`: intrebarea o pune `ButonDeconectare`, in fereastra
     casei. Doua intrebari una peste alta se invata sa se apese fara citire. */
  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectPosta(businessId);
    setDisconnecting(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Poșta Română a fost deconectată.");
    router.refresh();
  }

  async function reincarcaPlaja() {
    const r = await getPostaPlajaAction(businessId);
    if (r.ok && r.plaja) toast.info(`Au mai rămas ${r.plaja.ramase} coduri din plajă.`);
  }

  const comuta = (cheie: keyof ServiciiPosta) => (v: boolean) =>
    setServicii((s) => ({ ...s, [cheie]: v }));

  const stari: StareAntet[] = isActive
    ? [{ ton: "bun", text: "Activă" }, ...(initialPlaja ? [{ ton: "info" as const, text: `${initialPlaja.ramase} coduri în plajă` }] : [])]
    : [{ ton: "neutru", text: "Neconfigurată" }];

  return (
    <PaginaIntegrare
      id="posta"
      titlu="Livrare"
      descriere="Emiți AWB-uri Poșta Română din panou și le duci la oficiu. Cumpărătorul alege livrarea acasă sau ridicarea de la un oficiu poștal."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Utilizatorul și parola", facut: !!username.trim() && areParola },
          { text: "Codul de trimitere din contract", facut: !!codTrimitere.trim() },
          { text: "Poșta Română activă", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Cont", valoare: initialConfig?.username || "-" },
            { eticheta: "Plaja de coduri", valoare: initialPlaja ? `${initialPlaja.ramase} rămase` : "fără" },
            { eticheta: "Livrare la oficiu", valoare: initialConfig?.post_restant ? "da" : "nu" },
          ]} />
        )}
        <CumFunctioneaza id="posta" puncte={[
          { Icon: KeyRound, text: "Te conectezi cu utilizatorul și parola din aplicația lor de AWB-uri." },
          { Icon: FileSignature, text: "Codul de trimitere și celelalte valori vin din contract: nu se pot deduce, ți le comunică Poșta." },
          { Icon: Hash, text: "Cu o plajă de coduri alocată, numărul AWB e știut dinainte și nu se pot produce dubluri." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul de la Poșta Română" descriere="Utilizatorul și parola cu care intri în aplicația lor de AWB-uri.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator" htmlFor="posta-user" required>
            <Input id="posta-user" value={username} onChange={(ev) => setUsername(ev.target.value)} placeholder="Utilizatorul tău" />
          </Field>
          <Field label="Parola" htmlFor="posta-parola" required>
            <Input
              id="posta-parola"
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder={secretulEsteSalvat(initialConfig, "password") ? PLACEHOLDER_SECRET_SALVAT : "Parola contului"}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || !username.trim() || !areParola}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifică..." : "Testează conexiunea"}
          </Button>
          {isActive && (
            <Button variant="outline" onClick={handleDiagnostic} disabled={diagnosticand}>
              {diagnosticand ? <Loader2 className="animate-spin" /> : <Stethoscope />}
              Diagnostic
            </Button>
          )}
        </div>

        {diagnostic && diagnostic.ok && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <p className="font-semibold text-foreground">Ce a răspuns Poșta</p>
            <p className="text-muted-foreground">
              {diagnostic.unitati} oficii de livrare
              {diagnostic.unitatiFaraNume > 0
                ? `, dintre care ${diagnostic.unitatiFaraNume} fără denumire recunoscută`
                : ", toate cu denumire"}
              .
            </p>
            {diagnostic.unitatiFaraLocalitate > 0 && (
              <p className="text-warning">
                {diagnostic.unitatiFaraLocalitate} oficii n-au localitate recunoscută, deci NU apar la comandă: lista de oficii se
                filtrează după localitatea cumpărătorului, iar un oficiu fără ea nu se potrivește cu nimeni. Trimite-ne lista de
                câmpuri de mai jos.
              </p>
            )}
            {diagnostic.unitatiFaraNume > 0 && (
              <p className="text-warning">
                Oficiile fără denumire apar la comandă doar cu localitatea. Trimite-ne lista de câmpuri de mai jos și o reparăm.
              </p>
            )}
            {diagnostic.statusuriNoi.length > 0 && (
              <p className="text-warning">
                Statusuri noi, pe care platforma nu le cunoaște încă:{" "}
                {diagnostic.statusuriNoi.map((s) => `${s.cod} (${s.nume})`).join(", ")}. Comenzile cu ele nu se mișcă automat.
              </p>
            )}
            {diagnostic.cheiUnitati.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Câmpurile nomenclatorului de oficii</summary>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {diagnostic.cheiUnitati.map((c) => (
                    <li key={c.cheie}>
                      <code>{c.cheie}</code>: {c.exemplu}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Datele din contract">
        <Callout variant="info" icon={Info} title="De unde le iei">
          Valorile de mai jos nu se pot deduce și nu se pot ghici: ți le comunică Poșta în funcție de contractul tău. Le găsești
          în contract sau la persoana de contact de la ei.
        </Callout>
        <Field
          label="Cod de trimitere"
          htmlFor="posta-cod"
          required
          hint="Identificatorul tipului de trimitere din contractul tău. Arată de obicei ca „3,1,10”. Fără el nu se poate emite niciun AWB."
        >
          <Input id="posta-cod" value={codTrimitere} onChange={(ev) => setCodTrimitere(ev.target.value)} placeholder="3,1,10" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Tip mandat"
            htmlFor="posta-mandat"
            hint="Se trimite doar la trimiterile cu ramburs și mandat poștal. Lasă gol dacă nu ai în contract: necompletat, câmpul nu pleacă deloc."
          >
            <Input id="posta-mandat" value={tipMandat} onChange={(ev) => setTipMandat(ev.target.value)} placeholder="POSTAL" />
          </Field>
          <Field
            label="Tip achitare ramburs"
            htmlFor="posta-achitare"
            hint="Documentația nu descrie valorile acceptate; singurul exemplu dat de ei e „LA_ADRESA”. Lasă gol dacă nu știi sigur."
          >
            <Input id="posta-achitare" value={tipAchitare} onChange={(ev) => setTipAchitare(ev.target.value)} placeholder="LA_ADRESA" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Plaja de coduri AWB"
        descriere="Unele contracte vin cu un interval de numere AWB alocat. Dacă îl ai, completează-l: numărul e știut dinainte, iar o apăsare greșită pe „Creează AWB” nu mai poate produce două trimiteri. Fără el, codul îl generează Poșta la fiecare emitere.">
        <RandComutator titlu="Am plajă de coduri alocată" activ={plajaPornita} onChange={setPlajaPornita} />

        {plajaPornita && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix" hint="Partea cu litere, din fața numărului.">
              <Input value={prefix} onChange={(ev) => setPrefix(ev.target.value)} placeholder="LN" />
            </Field>
            <Field label="Câte cifre" hint="Numărul se completează cu zerouri în față.">
              <Input value={cifre} onChange={(ev) => setCifre(ev.target.value)} inputMode="numeric" />
            </Field>
            <Field label="De la">
              <Input value={deLa} onChange={(ev) => setDeLa(ev.target.value)} inputMode="numeric" placeholder="91000000000" />
            </Field>
            <Field label="Până la">
              <Input value={panaLa} onChange={(ev) => setPanaLa(ev.target.value)} inputMode="numeric" placeholder="91000000999" />
            </Field>
            {initialPlaja && (
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Au mai rămas <strong>{initialPlaja.ramase}</strong> coduri.
                </span>
                <Button variant="ghost" size="sm" onClick={reincarcaPlaja}>Verifică</Button>
              </div>
            )}
            <p className="col-span-2 text-xs text-muted-foreground">
              Schimbarea intervalului pornește consumul de la capătul lui. Nu-l schimba decât când primești o plajă nouă, altfel se
              pot reda coduri deja folosite.
            </p>
          </div>
        )}
      </Sectiune>

      <Sectiune pas={4} titlu="Cum livrăm">
        <RandComutator
          titlu="Livrare la oficiu poștal"
          text="Cumpărătorul poate alege un oficiu de unde își ridică singur coletul (post-restant). Lista de oficii vine de la Poșta."
          activ={postRestant}
          onChange={setPostRestant}
        />
        <RandComutator
          separat
          titlu="Grupează AWB-urile în borderou"
          text="Lasă oprit dacă nu știi sigur că ai nevoie. API-ul lor nu are metodă de „prezentare” a borderoului, deci noi nu putem ști când l-ai închis."
          activ={borderou}
          onChange={setBorderou}
        />
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field
            label="Peste câte zile lucrătoare duci coletele la oficiu"
            htmlFor="posta-zile"
            hint="Data ajunge pe documentul de transport și scurtează prelucrarea la ghișeu. 0 înseamnă chiar azi. Sărbătorile legale nu se iau în calcul."
          >
            <Input id="posta-zile" value={zilePrezentare} onChange={(ev) => setZilePrezentare(ev.target.value)} inputMode="numeric" />
          </Field>
          <Field
            label="Valoarea declarată la trimiterile cu ramburs"
            hint="Poșta cere minim 20 de lei la orice trimitere cu ramburs. Poți declara pragul (mai ieftin) sau valoarea mărfii (te acoperă dacă se pierde coletul)."
          >
            <div className="flex gap-2">
              <Button type="button" variant={valoareDeclarata === "minim" ? "default" : "outline"} size="sm" onClick={() => setValoareDeclarata("minim")}>
                Minimul de 20 lei
              </Button>
              <Button type="button" variant={valoareDeclarata === "comanda" ? "default" : "outline"} size="sm" onClick={() => setValoareDeclarata("comanda")}>
                Valoarea comenzii
              </Button>
            </div>
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={5} titlu="Servicii" descriere="Pornește doar serviciile pe care le ai în contractul cu Poșta.">
        {SERVICII.map((s, i) => (
          <RandComutator
            key={s.cheie}
            separat={i > 0}
            titlu={s.eticheta}
            text={s.explicatie}
            activ={!!servicii[s.cheie]}
            onChange={comuta(s.cheie)}
          />
        ))}
      </Sectiune>

      {/*
        ⚠ Implicitul e sa NU trimitem nimic: documentatia spune ca datele lipsa „se
        vor completa automat cu detaliile contului după care se face apelul", adica
        din contract, care e sursa adevarata. Trimise de noi, s-ar putea sa nu se
        potriveasca.
      */}
      <Sectiune pas={6} titlu="Adresa de expeditor"
        descriere="Implicit, Poșta completează expeditorul din datele contului tău, cele din contract. Completează mai jos doar dacă expediezi de la altă adresă.">
        <RandComutator titlu="Expediez de la altă adresă" activ={expeditorPropriu} onChange={setExpeditorPropriu} />

        {expeditorPropriu && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nume / firmă" required className="col-span-2">
              <Input value={exNume} onChange={(ev) => setExNume(ev.target.value)} />
            </Field>
            <Field label="Persoana de contact" className="col-span-2">
              <Input value={exContact} onChange={(ev) => setExContact(ev.target.value)} />
            </Field>
            <Field label="Strada și numărul" required className="col-span-2">
              <Input value={exStrada} onChange={(ev) => setExStrada(ev.target.value)} />
            </Field>
            <Field label="Localitate" required>
              <Input value={exOras} onChange={(ev) => setExOras(ev.target.value)} />
            </Field>
            <Field label="Județ">
              <select aria-label="Județ" value={exJudet} onChange={(ev) => setExJudet(ev.target.value)} className={selectCls}>
                <option value="">Alege județul</option>
                {JUDETE.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </Field>
            <Field label="Cod poștal">
              <Input value={exCodPostal} onChange={(ev) => setExCodPostal(ev.target.value)} />
            </Field>
            <Field label="Telefon">
              <Input value={exTelefon} onChange={(ev) => setExTelefon(ev.target.value)} />
            </Field>
            <Field label="Email" className="col-span-2" hint="Poșta acceptă cel mult 32 de caractere pe acest câmp.">
              <Input value={exEmail} onChange={(ev) => setExEmail(ev.target.value)} />
            </Field>
          </div>
        )}
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge utilizatorul și parola din Edinio. Plaja de coduri rămâne salvată.">
          <ButonDeconectare
            nume="Poșta Română"
            cePierzi="Utilizatorul și parola se șterg din Edinio, împreună cu serviciile bifate. Plaja de coduri rămâne salvată cu tot cu cursorul ei, iar AWB-urile deja emise își păstrează numărul."
            pending={disconnecting}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare
        modificat={isActive ? modificat : undefined}
        saving={saving}
        onSalveaza={handleSave}
        onRenunta={isActive ? renunta : undefined}
        textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
      />
    </PaginaIntegrare>
  );
}
