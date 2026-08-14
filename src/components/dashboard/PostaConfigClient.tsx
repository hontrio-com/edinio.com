"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Info, Loader2, Stethoscope, Unplug } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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
    explicatie: "Daca destinatarul nu ridica trimiterea, se intoarce la tine. Fara ea, marfa ramane la oficiu.",
  },
  {
    cheie: "confirmarePrimire",
    eticheta: "Confirmare de primire",
    explicatie: "Primesti dovada semnata ca trimiterea a fost predata.",
  },
  {
    cheie: "confirmarePrimirePostRestant",
    eticheta: "Confirmare de primire la oficiu",
    explicatie: "Aceeasi dovada, pentru trimiterile ridicate de la oficiu.",
  },
  {
    cheie: "rambursPostRestant",
    eticheta: "Ramburs la oficiu",
    explicatie: "Banii se incaseaza la ghiseu, cand destinatarul ridica trimiterea.",
  },
  {
    cheie: "avizareSms",
    eticheta: "Avizare prin SMS",
    explicatie: "Destinatarul e anuntat prin SMS.",
  },
  {
    cheie: "desfacereColet",
    eticheta: "Desfacere colet la livrare",
    explicatie: "Destinatarul poate verifica coletul inainte sa-l ridice.",
  },
  {
    cheie: "garantieLivrare",
    eticheta: "Garantie de livrare",
    explicatie: "In 3 zile, coletul poate fi returnat de destinatar, cu taxele postale in sarcina ta.",
  },
  { cheie: "fragil", eticheta: "Fragil", explicatie: "Manipulare cu grija." },
  { cheie: "voluminos", eticheta: "Voluminos", explicatie: "Trimitere peste dimensiunile obisnuite." },
  {
    cheie: "manaProprie",
    eticheta: "Mana proprie",
    explicatie: "Se preda numai destinatarului. ⚠ Nu se combina cu livrarea la oficiu.",
  },
  {
    cheie: "factajLivrare",
    eticheta: "Factaj la livrare",
    explicatie: "Transport la domiciliu pentru trimiteri grele. ⚠ Nu se combina cu livrarea la oficiu.",
  },
  { cheie: "factajPreluare", eticheta: "Factaj la preluare", explicatie: "Acelasi serviciu, la ridicare." },
  { cheie: "pcp", eticheta: "PCP", explicatie: "Optiune de contract. Aprinde-o doar daca o ai in contract." },
  { cheie: "ec", eticheta: "EC", explicatie: "Optiune de contract. Aprinde-o doar daca o ai in contract." },
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
    if (!username.trim()) return toast.error("Completeaza utilizatorul");
    if (!areParola) return toast.error("Completeaza parola");
    setTesting(true);
    const r = await testPostaConnectionAction(businessId, construieste());
    setTesting(false);

    if (r.fel === "autentificat") {
      toast.success(`Conexiune reusita — ${r.unitati} oficii de livrare`);
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
        `Serverul Postei raspunde (${r.unitati} oficii), dar aceeasi lista se obtine si fara `
        + "date de acces — deci proba NU dovedeste ca utilizatorul si parola sunt bune. "
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
    if (!username.trim()) return toast.error("Completeaza utilizatorul");
    if (!areParola) return toast.error("Completeaza parola");
    if (!codTrimitere.trim()) {
      return toast.error("Completeaza codul de trimitere din contract — fara el nu se poate emite niciun AWB");
    }
    if (expeditorPropriu && (!exNume.trim() || !exStrada.trim() || !exOras.trim())) {
      return toast.error("Adresa de ridicare are nevoie de nume, strada si localitate");
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
    toast.success("Configurare salvata");
    setPassword("");
    router.refresh();
  }

  async function handleDisconnect() {
    if (!confirm("Sigur deconectezi Posta Romana? Comenzile cu AWB emis isi pastreaza numarul.")) return;
    setDisconnecting(true);
    const r = await disconnectPosta(businessId);
    setDisconnecting(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Posta Romana deconectata");
    router.refresh();
  }

  async function reincarcaPlaja() {
    const r = await getPostaPlajaAction(businessId);
    if (r.ok && r.plaja) toast.info(`Au mai ramas ${r.plaja.ramase} coduri din plaja.`);
  }

  const comuta = (cheie: keyof ServiciiPosta) => (v: boolean) =>
    setServicii((s) => ({ ...s, [cheie]: v }));

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="Poșta Română activa"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          Cont {initialConfig?.username}
          {initialPlaja ? ` · ${initialPlaja.ramase} coduri ramase in plaja` : ""}
        </Callout>
      )}

      {/*
        ⚠ Trei lucruri pe care comerciantul TREBUIE sa le stie inainte sa emita
        ceva, si pe care nicio interfata nu le poate ascunde fara sa mintă.
      */}
      <Callout variant="warning" icon={AlertTriangle} title="Ce poate si ce nu poate face integrarea">
        Fiecare AWB emis din panou e o <strong>trimitere reala</strong>: Posta nu are
        mediu de test.
        <br />
        <strong>Eticheta se tipareste din aplicatia Postei</strong>, nu de aici: API-ul
        lor nu are metoda de tiparire.
        <br />
        <strong>Anularea se face tot la ei</strong>, la oficiu sau in aplicatia lor. Din
        panou poti doar sa scoti numarul de pe comanda, dupa ce ai anulat.
        <br />
        Si nu vine nimeni sa ridice: <strong>coletele le duci tu la oficiu</strong>.
      </Callout>

      {/* ── 1. Contul ────────────────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            1
          </span>
          <h3 className="text-sm font-semibold text-foreground">Contul de la Poșta Română</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Utilizatorul si parola cu care intri in aplicatia lor de AWB-uri.
        </p>

        <Field label="Utilizator" required>
          <Input value={username} onChange={(ev) => setUsername(ev.target.value)} placeholder="Utilizatorul tau" />
        </Field>

        <Field label="Parola" required>
          <Input
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            placeholder={
              secretulEsteSalvat(initialConfig, "password")
                ? PLACEHOLDER_SECRET_SALVAT
                : "Parola contului"
            }
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTest} disabled={testing || !username.trim() || !areParola}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifica..." : "Testeaza conexiunea"}
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
            <p className="font-semibold text-foreground">Ce a raspuns Posta</p>
            <p className="text-muted-foreground">
              {diagnostic.unitati} oficii de livrare
              {diagnostic.unitatiFaraNume > 0
                ? `, dintre care ${diagnostic.unitatiFaraNume} fara denumire recunoscuta`
                : ", toate cu denumire"}
              .
            </p>
            {diagnostic.unitatiFaraNume > 0 && (
              <p className="text-warning">
                Oficiile fara denumire apar in checkout doar cu localitatea. Trimite-ne
                lista de campuri de mai jos si o reparam.
              </p>
            )}
            {diagnostic.statusuriNoi.length > 0 && (
              <p className="text-warning">
                Statusuri noi, pe care platforma nu le cunoaste inca:{" "}
                {diagnostic.statusuriNoi.map((s) => `${s.cod} (${s.nume})`).join(", ")}.
                Comenzile cu ele nu se misca automat.
              </p>
            )}
            {diagnostic.cheiUnitati.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  Campurile nomenclatorului de oficii
                </summary>
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
      </Panel>

      {/* ── 2. Datele din contract ──────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            2
          </span>
          <h3 className="text-sm font-semibold text-foreground">Datele din contract</h3>
        </div>
        <Callout variant="info" icon={Info} title="De unde le iei">
          Valorile de mai jos nu se pot deduce si nu se pot ghici: ti le comunica Posta
          in functie de contractul tau. Le gasesti in contract sau la persoana de
          contact de la ei.
        </Callout>

        <Field
          label="Cod de trimitere"
          required
          hint="Identificatorul tipului de trimitere din contractul tau. Arata de obicei ca „3,1,10”. Fara el nu se poate emite niciun AWB."
        >
          <Input value={codTrimitere} onChange={(ev) => setCodTrimitere(ev.target.value)} placeholder="3,1,10" />
        </Field>

        <Field
          label="Tip mandat"
          hint="Se trimite doar la trimiterile cu ramburs si mandat postal. Lasa gol daca nu ai in contract — necompletat, campul nu pleaca deloc."
        >
          <Input value={tipMandat} onChange={(ev) => setTipMandat(ev.target.value)} placeholder="POSTAL" />
        </Field>

        <Field
          label="Tip achitare ramburs"
          hint="Documentatia nu descrie valorile acceptate; singurul exemplu dat de ei e „LA_ADRESA”. Lasa gol daca nu stii sigur."
        >
          <Input value={tipAchitare} onChange={(ev) => setTipAchitare(ev.target.value)} placeholder="LA_ADRESA" />
        </Field>
      </Panel>

      {/* ── 3. Plaja de coduri ──────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            3
          </span>
          <h3 className="text-sm font-semibold text-foreground">Plaja de coduri AWB</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Unele contracte vin cu un interval de numere AWB alocat. Daca il ai, completeaza-l:
          atunci numarul e stiut dinainte, iar o apasare gresita pe „Creeaza AWB” nu mai poate
          produce doua trimiteri. Fara el, codul il genereaza Posta la fiecare emitere.
        </p>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-foreground">Am plaja de coduri alocata</span>
          <Switch checked={plajaPornita} onCheckedChange={setPlajaPornita} />
        </div>

        {plajaPornita && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix" hint="Partea cu litere, din fata numarului.">
              <Input value={prefix} onChange={(ev) => setPrefix(ev.target.value)} placeholder="LN" />
            </Field>
            <Field label="Cate cifre" hint="Numarul se completeaza cu zerouri in fata.">
              <Input value={cifre} onChange={(ev) => setCifre(ev.target.value)} inputMode="numeric" />
            </Field>
            <Field label="De la">
              <Input value={deLa} onChange={(ev) => setDeLa(ev.target.value)} inputMode="numeric" placeholder="91000000000" />
            </Field>
            <Field label="Pana la">
              <Input value={panaLa} onChange={(ev) => setPanaLa(ev.target.value)} inputMode="numeric" placeholder="91000000999" />
            </Field>
            {initialPlaja && (
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Au mai ramas <strong>{initialPlaja.ramase}</strong> coduri.
                </span>
                <Button variant="ghost" size="sm" onClick={reincarcaPlaja}>Verifica</Button>
              </div>
            )}
            <p className="col-span-2 text-xs text-muted-foreground">
              ⚠ Schimbarea intervalului porneste consumul de la capatul lui. Nu-l schimba
              decat cand primesti o plaja noua — altfel se pot reda coduri deja folosite.
            </p>
          </div>
        )}
      </Panel>

      {/* ── 4. Cum livram ───────────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            4
          </span>
          <h3 className="text-sm font-semibold text-foreground">Cum livram</h3>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Livrare la oficiu poștal</p>
            <p className="text-xs text-muted-foreground">
              Cumparatorul poate alege un oficiu de unde isi ridica singur coletul
              (post-restant). Lista de oficii vine de la Posta.
            </p>
          </div>
          <Switch checked={postRestant} onCheckedChange={setPostRestant} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Grupeaza AWB-urile in borderou</p>
            <p className="text-xs text-muted-foreground">
              ⚠ Lasa oprit daca nu stii sigur ca ai nevoie. API-ul lor nu are metoda de
              „prezentare” a borderoului, deci noi nu putem sti cand l-ai inchis.
            </p>
          </div>
          <Switch checked={borderou} onCheckedChange={setBorderou} />
        </div>

        <Field
          label="Peste cate zile lucratoare duci coletele la oficiu"
          hint="Data ajunge pe documentul de transport si scurteaza prelucrarea la ghiseu. 0 inseamna chiar azi. Sarbatorile legale nu sunt luate in calcul."
        >
          <Input value={zilePrezentare} onChange={(ev) => setZilePrezentare(ev.target.value)} inputMode="numeric" />
        </Field>

        <Field
          label="Valoarea declarata la trimiterile cu ramburs"
          hint="Posta cere minim 20 de lei la orice trimitere cu ramburs. Poti declara pragul (mai ieftin) sau valoarea marfii (te acopera daca se pierde coletul)."
        >
          <div className="flex gap-2">
            <Button
              type="button"
              variant={valoareDeclarata === "minim" ? "default" : "outline"}
              size="sm"
              onClick={() => setValoareDeclarata("minim")}
            >
              Minimul de 20 lei
            </Button>
            <Button
              type="button"
              variant={valoareDeclarata === "comanda" ? "default" : "outline"}
              size="sm"
              onClick={() => setValoareDeclarata("comanda")}
            >
              Valoarea comenzii
            </Button>
          </div>
        </Field>
      </Panel>

      {/* ── 5. Serviciile din contract ──────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            5
          </span>
          <h3 className="text-sm font-semibold text-foreground">Servicii</h3>
        </div>
        <Callout variant="warning" icon={AlertTriangle} title="Aprinde doar ce ai in contract">
          Documentatia Postei spune ca aceste optiuni sunt valide „doar dacă în contract
          vor fi permise”. Una aprinsa fara acoperire in contract face ca Posta sa
          respinga trimiterea — si mesajul de refuz nu spune intotdeauna care bifa e de vina.
        </Callout>

        {SERVICII.map((s) => (
          <div key={s.cheie} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-foreground">{s.eticheta}</p>
              <p className="text-xs text-muted-foreground">{s.explicatie}</p>
            </div>
            <Switch checked={!!servicii[s.cheie]} onCheckedChange={comuta(s.cheie)} />
          </div>
        ))}
      </Panel>

      {/* ── 6. Expeditorul ──────────────────────────────────────────────── */}
      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            6
          </span>
          <h3 className="text-sm font-semibold text-foreground">Adresa de expeditor</h3>
        </div>
        {/*
          ⚠ Implicitul e sa NU trimitem nimic: documentatia spune ca datele lipsa „se
          vor completa automat cu detaliile contului după care se face apelul" — adica
          din contract, care e sursa adevarata. Trimise de noi, s-ar putea sa nu se
          potriveasca.
        */}
        <p className="text-xs text-muted-foreground">
          Implicit, Posta completeaza expeditorul din datele contului tau — cele din
          contract. Completeaza mai jos doar daca expediezi de la alta adresa.
        </p>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-foreground">Expediez de la alta adresa</span>
          <Switch checked={expeditorPropriu} onCheckedChange={setExpeditorPropriu} />
        </div>

        {expeditorPropriu && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nume / firma" required className="col-span-2">
              <Input value={exNume} onChange={(ev) => setExNume(ev.target.value)} />
            </Field>
            <Field label="Persoana de contact" className="col-span-2">
              <Input value={exContact} onChange={(ev) => setExContact(ev.target.value)} />
            </Field>
            <Field label="Strada si numarul" required className="col-span-2">
              <Input value={exStrada} onChange={(ev) => setExStrada(ev.target.value)} />
            </Field>
            <Field label="Localitate" required>
              <Input value={exOras} onChange={(ev) => setExOras(ev.target.value)} />
            </Field>
            <Field label="Judet">
              <select
                value={exJudet}
                onChange={(ev) => setExJudet(ev.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Alege judetul</option>
                {JUDETE.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </Field>
            <Field label="Cod postal">
              <Input value={exCodPostal} onChange={(ev) => setExCodPostal(ev.target.value)} />
            </Field>
            <Field label="Telefon">
              <Input value={exTelefon} onChange={(ev) => setExTelefon(ev.target.value)} />
            </Field>
            <Field label="Email" className="col-span-2" hint="Posta accepta cel mult 32 de caractere pe acest camp.">
              <Input value={exEmail} onChange={(ev) => setExEmail(ev.target.value)} />
            </Field>
          </div>
        )}
      </Panel>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza configurarea"}
      </Button>
    </div>
  );
}
