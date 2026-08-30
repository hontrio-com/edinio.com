"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Info, Loader2, Unplug, Wallet } from "lucide-react";
import {
  diagnosticSmartshipAction, disconnectSmartship, getSmartshipCurieriAction,
  getSmartshipDeconturiAction, getSmartshipFacturiAction, saveSmartshipConfig,
  testSmartshipConnectionAction,
} from "@/lib/actions/smartship.actions";
import type { DecontSmartship, ExpeditorSalvat, FacturaSmartship, FormatEticheta, SmartshipConfig, SoldSmartship } from "@/lib/smartship/client";
import { ibanValid } from "@/lib/smartship/expediere";
import { suprapuneri, textSuprapunere } from "@/lib/smartship/suprapunere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea SmartShip.
 *
 * ═══ ⚠ DOUA LUCRURI CARE SE GRESESC USOR SI COSTA MULT ═══
 *
 * 1. **Adresa de ridicare cere un ID NUMERIC de localitate**, nu un nume. De aia
 *    exista butonul „Incarca expeditorii": el aduce adresele salvate in contul
 *    SmartShip, cu `localitate_id` si `sector` gata completate. Scris de mana, un
 *    id gresit trimite coletele in alt oras fara nicio eroare.
 *
 * 2. **IBAN-ul e obligatoriu la orice comanda cu ramburs**, si SmartShip il
 *    valideaza la FIECARE cerere — cotare inclusa. Gresit, TOATE comenzile cu
 *    plata la livrare cad tacut pe tariful fix din „Setari → Livrare", fiindca
 *    `/cost` raspunde 201 si cotarea se pierde. De aceea se verifica aici, in
 *    formular, cu cifra de control.
 *
 * ═══ ⚠ NU EXISTA MEDIU DE PROBA ═══
 *
 * Spre deosebire de Innoship (`/validate`, `/simulate`), la SmartShip fiecare
 * emitere e reala si facturata din prima. Ecranul o spune, ca omul sa stie asta
 * inainte de primul buton, nu dupa.
 */

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "A4", eticheta: "A4 (foaie intreaga)" },
  { valoare: "A6", eticheta: "A6 (eticheta compacta, imprimante de etichete)" },
];

export function SmartshipConfigClient({
  businessId,
  initialConfig,
  activiDirect = [],
}: {
  businessId: string;
  initialConfig: SmartshipConfig | null;
  /** Curierii pe care magazinul ii are deja pornit pe cont propriu. */
  activiDirect?: string[];
}) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState("");
  const [iban, setIban] = useState(initialConfig?.iban ?? "");
  const [expeditor, setExpeditor] = useState(initialConfig?.expeditor ?? null);

  const [contractPropriu, setContractPropriu] = useState(initialConfig?.contract_propriu === true);
  const [arataContractPropriu, setArataContractPropriu] = useState(initialConfig?.arata_contract_propriu === true);
  const [folosesteEasybox, setFolosesteEasybox] = useState(initialConfig?.foloseste_easybox === true);
  const [folosesteFanbox, setFolosesteFanbox] = useState(initialConfig?.foloseste_fanbox === true);
  const [deschidere, setDeschidere] = useState(initialConfig?.deschidere_la_livrare === true);
  const [asigura, setAsigura] = useState(initialConfig?.asigura_coletul === true);
  const [faraRidicare, setFaraRidicare] = useState(initialConfig?.fara_ridicare_automata === true);
  const [lungime, setLungime] = useState(String(initialConfig?.lungime_cm ?? 30));
  const [latime, setLatime] = useState(String(initialConfig?.latime_cm ?? 20));
  const [inaltime, setInaltime] = useState(String(initialConfig?.inaltime_cm ?? 10));
  const [continut, setContinut] = useState(initialConfig?.continut_implicit ?? "Produse");
  const [format, setFormat] = useState<FormatEticheta>(initialConfig?.format_eticheta ?? "A4");
  const [curieriPermisi, setCurieriPermisi] = useState<number[]>(initialConfig?.curieri_permisi ?? []);

  const [expeditori, setExpeditori] = useState<ExpeditorSalvat[]>([]);
  const [sold, setSold] = useState<SoldSmartship | null>(null);
  const [curieri, setCurieri] = useState<{ id: number; nume: string; siContractPropriu: boolean }[]>([]);
  const [deconturi, setDeconturi] = useState<DecontSmartship[] | null>(null);
  const [facturi, setFacturi] = useState<FacturaSmartship[] | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const [salveaza, setSalveaza] = useState(false);
  const [proba, setProba] = useState(false);
  const [incarcCurieri, setIncarcCurieri] = useState(false);
  const [incarcDeconturi, setIncarcDeconturi] = useState(false);
  const [incarcFacturi, setIncarcFacturi] = useState(false);
  const [rulezDiagnostic, setRulezDiagnostic] = useState(false);

  /* Cheia nu ajunge in browser (e mascata), deci prezenta ei se citeste din config. */
  const areCheie = apiKey.trim() !== "" || secretulEsteSalvat(initialConfig, "api_key");
  const expeditorGata = !!(expeditor?.name && expeditor.address && expeditor.phone && Number(expeditor.city) > 0);
  /* ⚠ ACEEASI regula ca `smartshipGata` de pe server. */
  const isActive = !!(initialConfig?.enabled && secretulEsteSalvat(initialConfig, "api_key") && expeditorGata);

  const ibanCurat = iban.replace(/\s/g, "");
  const ibanGresit = ibanCurat.length > 0 && !ibanValid(ibanCurat);

  function construieste(): SmartshipConfig {
    return {
      enabled: true,
      /* Gol = „n-am schimbat"; serverul pastreaza valoarea veche. */
      api_key: apiKey.trim(),
      expeditor: expeditor ?? undefined,
      iban: ibanCurat.toUpperCase(),
      curieri_permisi: curieriPermisi,
      contract_propriu: contractPropriu,
      arata_contract_propriu: arataContractPropriu,
      foloseste_easybox: folosesteEasybox,
      foloseste_fanbox: folosesteFanbox,
      deschidere_la_livrare: deschidere,
      asigura_coletul: asigura,
      fara_ridicare_automata: faraRidicare,
      lungime_cm: Number(lungime) || 30,
      latime_cm: Number(latime) || 20,
      inaltime_cm: Number(inaltime) || 10,
      continut_implicit: continut.trim() || "Produse",
      format_eticheta: format,
    };
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completeaza cheia de API");
    if (!expeditorGata) {
      return toast.error("Alege adresa de ridicare — apasa „Verifica si incarca expeditorii”");
    }
    if (ibanGresit) return toast.error("IBAN-ul nu e valid. Verifica cifrele de control.");

    setSalveaza(true);
    const r = await saveSmartshipConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea SmartShip a fost salvata");
    router.refresh();
  }

  async function handleProba() {
    setProba(true);
    const r = await testSmartshipConnectionAction(businessId, apiKey.trim() || undefined);
    setProba(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });

    setExpeditori(r.expeditori);
    setSold(r.sold);
    if (r.expeditori.length === 0) {
      return toast.warning("Cheia e buna, dar contul n-are nicio adresa de ridicare salvata. Adauga una in SmartShip.");
    }
    /* Un singur expeditor: il alegem noi, ca omul sa nu mai apese inca o data. */
    if (r.expeditori.length === 1 && !expeditorGata) alegeExpeditorul(r.expeditori[0]);
    toast.success(`Conexiune reusita — ${r.expeditori.length} adrese de ridicare`);
  }

  function alegeExpeditorul(e: ExpeditorSalvat) {
    setExpeditor({
      name: (e.nume ?? "").trim(),
      address: (e.adresa ?? "").trim(),
      email: (e.email ?? "").trim() || undefined,
      city: Number(e.localitate_id) || 0,
      phone: (e.telefon ?? "").trim(),
      country: "RO",
      sector: Number(e.sector) || 0,
    });
  }

  async function incarcaCurieri() {
    setIncarcCurieri(true);
    const r = await getSmartshipCurieriAction(businessId);
    setIncarcCurieri(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });
    setCurieri(r.curieri);
    if (r.curieri.length === 0) toast.info("Niciun curier nu a intors pret pentru ruta de proba.");
  }

  async function incarcaDeconturi() {
    setIncarcDeconturi(true);
    const r = await getSmartshipDeconturiAction(businessId);
    setIncarcDeconturi(false);
    if (!r.ok) return toast.error(r.error);
    setDeconturi(r.deconturi);
    if (r.deconturi.length === 0) toast.info("Nu exista deconturi de ramburs.");
  }

  async function incarcaFacturi() {
    setIncarcFacturi(true);
    const r = await getSmartshipFacturiAction(businessId);
    setIncarcFacturi(false);
    if (!r.ok) return toast.error(r.error);
    setFacturi(r.facturi);
    if (r.facturi.length === 0) toast.info("Nu exista facturi emise catre contul tau.");
  }

  async function ruleazaDiagnostic() {
    setRulezDiagnostic(true);
    const r = await diagnosticSmartshipAction(businessId);
    setRulezDiagnostic(false);
    if (!r.ok) return toast.error(r.error, { duration: 10000 });
    setDiagnostic(
      [
        `easybox: ${r.easybox} lockere${r.easyboxFaraId > 0 ? `, din care ${r.easyboxFaraId} FARA id recunoscut` : ""}`,
        `FANbox: ${r.eroareFanbox ? `indisponibil (${r.eroareFanbox})` : `${r.fanbox} lockere${r.fanboxFaraId > 0 ? `, din care ${r.fanboxFaraId} FARA id recunoscut` : ""}`}`,
        r.chei.length > 0 ? `Campurile raspunsului: ${r.chei.map((c) => `${c.cheie}=${c.exemplu}`).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  async function handleDisconnect() {
    if (!confirm("Sigur deconectezi SmartShip? Expedierile deja emise raman la ei.")) return;
    const r = await disconnectSmartship(businessId);
    if ("error" in r) return toast.error(r.error);
    toast.success("SmartShip a fost deconectat");
    router.refresh();
  }

  const suprapunerea = textSuprapunere(
    suprapuneri(curieri.map((c) => ({ id: c.id, nume: c.nume })), activiDirect, curieriPermisi),
  );

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout variant="success" icon={CheckCircle}>
          SmartShip e conectat. Expedierile se emit din pagina comenzii.
        </Callout>
      )}

      {/*
        * ⚠ Se spune DE LA INCEPUT ce nu se poate: nu exista mediu de proba si nu
        * exista niciun apel care sa valideze datele fara sa creeze expedierea.
        */}
      <Callout variant="warning" icon={AlertTriangle}>
        <strong>SmartShip nu are mediu de test.</strong> Fiecare AWB emis e real si se scade
        din creditul contului. Anularea exista si intoarce banii in credit, dar numai pana
        cand curierul ridica coletul.
      </Callout>

      <Panel step={1} title="Cheia de API">
        <Callout variant="info" icon={Info}>
          O gasesti in platforma SmartShip, la <strong>Contul meu {"->"} Setari {"->"} API</strong>.
        </Callout>

        <Field label="Cheia API" hint="Se trimite la fiecare cerere. Nu o publica nicaieri.">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "Cheia API"}
          />
        </Field>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={salveaza}>
            {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salveaza"}
          </Button>
          <Button variant="outline" onClick={handleProba} disabled={proba || !areCheie}>
            {proba ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifica si incarca expeditorii"}
          </Button>
        </div>

        {sold && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Disponibil pentru expediere: <strong>{sold.available_for_shipping ?? 0} {sold.currency ?? "RON"}</strong>
            {sold.payment_on_terms ? " (plata la termen)" : ""}
          </p>
        )}
      </Panel>

      <Panel step={2} title="Adresa de ridicare">
        {/*
          * ⚠ Aici sta cel mai usor de gresit camp din toata configurarea.
          * `sender.city` e un ID numeric din nomenclatorul lor.
          */}
        <Callout variant="info" icon={Info}>
          SmartShip identifica localitatile prin <strong>id numeric</strong>, nu prin nume. De
          aceea adresa de ridicare se alege din cele salvate in contul tau — nu se scrie de mana.
        </Callout>

        {expeditori.length > 0 && (
          <div className="space-y-1">
            {expeditori.map((e) => (
              <button
                key={e.id ?? e.nume}
                type="button"
                onClick={() => alegeExpeditorul(e)}
                className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-xs ${
                  expeditor?.city === Number(e.localitate_id) ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span className="font-medium text-foreground">{e.nume}</span>
                <span className="text-muted-foreground">
                  {[e.adresa, e.localitate, e.judet].filter(Boolean).join(", ")}
                  {e.sector ? ` · sector ${e.sector}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {expeditorGata ? (
          <p className="text-xs text-muted-foreground">
            Ales: <strong>{expeditor!.name}</strong> — {expeditor!.address}
            {expeditor!.sector ? `, sector ${expeditor!.sector}` : ""} (id localitate {expeditor!.city})
          </p>
        ) : (
          <p className="text-xs text-warning">
            Nicio adresa de ridicare aleasa. Apasa „Verifica si incarca expeditorii”.
          </p>
        )}
      </Panel>

      <Panel step={3} title="Ramburs">
        {/*
          * ⚠ Cel mai scump camp gresit din toata configurarea: un IBAN invalid
          * face ca TOATE comenzile cu ramburs sa cada tacut pe tariful fix.
          */}
        <Field
          label="IBAN pentru virarea rambursului"
          hint="Obligatoriu la orice comanda cu plata la livrare. SmartShip il verifica la fiecare cerere — gresit, comenzile cu ramburs raman fara pret real."
        >
          <Input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="RO49AAAA1B31007593840000"
            className={ibanGresit ? "border-destructive" : undefined}
          />
        </Field>
        {ibanGresit && (
          <p className="text-xs text-destructive">
            IBAN-ul nu trece verificarea cifrelor de control. Verifica-l inainte de salvare.
          </p>
        )}
      </Panel>

      <Panel step={4} title="Ce se ofera in checkout">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Lockere Sameday Easybox</p>
            <p className="text-xs text-muted-foreground">
              Clientul isi alege lockerul in checkout. Pretul e cel fix din „Setari {"->"} Livrare”:
              SmartShip nu poate cota un locker inainte sa stie CARE locker.
            </p>
          </div>
          <Switch checked={folosesteEasybox} onCheckedChange={setFolosesteEasybox} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Lockere FAN Courier FANbox</p>
            <p className="text-xs text-muted-foreground">
              {/* ⚠ Documentat de ei: FANbox merge doar cu `use_own_contract: 1`. */}
              Merge <strong>numai pe contractul tau de FAN Courier</strong>. Fara contract
              propriu, optiunea nu apare in checkout.
            </p>
          </div>
          <Switch checked={folosesteFanbox} onCheckedChange={setFolosesteFanbox} />
        </div>
        {folosesteFanbox && !contractPropriu && (
          <Callout variant="warning" icon={AlertTriangle}>
            Ai pornit FANbox fara contract propriu. Optiunea nu va aparea in checkout pana cand
            nu activezi „Emite pe contractele tale”.
          </Callout>
        )}

        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Curierii oferiti</p>
              <p className="text-xs text-muted-foreground">
                Fara niciunul bifat, apar toti curierii pe care ii da contul. SmartShip n-are
                lista de curieri in API, deci se afla dintr-o cotare de proba
                (Bucuresti {"->"} Cluj-Napoca, 1 kg) — pe alte rute pot aparea si altii.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={incarcaCurieri} disabled={incarcCurieri || !isActive}>
              {incarcCurieri ? <Loader2 className="h-4 w-4 animate-spin" /> : "Incarca curierii"}
            </Button>
          </div>

          {curieri.length > 0 && (
            <div className="space-y-1">
              {curieri.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-border accent-primary"
                    checked={curieriPermisi.includes(c.id)}
                    onChange={(e) =>
                      setCurieriPermisi((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))
                    }
                  />
                  <span>{c.nume}</span>
                  {c.siContractPropriu && (
                    <span className="text-[10px] text-muted-foreground">(exista si pe contractul tau)</span>
                  )}
                </label>
              ))}
            </div>
          )}

          {/*
            * ⚠ Suprapunerea, a PATRA oara: acelasi curier poate ajunge in checkout
            * direct, prin Innoship, prin Packeta si prin SmartShip.
            */}
          {suprapunerea && <Callout variant="warning" icon={AlertTriangle}>{suprapunerea}</Callout>}
        </div>
      </Panel>

      <Panel step={5} title="Contract propriu (BYOC)">
        <Callout variant="info" icon={Info}>
          Daca ai conturi proprii de curier legate in SmartShip („Curieri Proprii”) si abonament
          BYOC activ, expedierile pot pleca pe contractele tale, la tarifele tale.
        </Callout>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Emite pe contractele tale</p>
            <p className="text-xs text-muted-foreground">Fara asta, AWB-ul pleaca pe contractul SmartShip, la tariful standard.</p>
          </div>
          <Switch checked={contractPropriu} onCheckedChange={setContractPropriu} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Arata si preturile contractelor tale in checkout</p>
            {/*
              * ⚠ Acelasi curier apare atunci de DOUA ori, cu doua preturi. Nu e un
              * defect, dar cumparatorul trebuie sa le poata deosebi — de aia
              * eticheta ofertei spune „(contractul tau)".
              */}
            <p className="text-xs text-muted-foreground">
              Acelasi curier poate aparea de doua ori — o data pe contractul tau, o data pe cel
              SmartShip. In lista se vede care e care.
            </p>
          </div>
          <Switch checked={arataContractPropriu} onCheckedChange={setArataContractPropriu} />
        </div>
      </Panel>

      <Panel step={6} title="Coletul">
        {/*
          * ⚠ Dimensiunile nu sunt decor: se factureaza MAXIMUL dintre greutatea
          * fizica si cea volumetrica (L×l×h / 6000).
          */}
        <Callout variant="info" icon={Info}>
          SmartShip factureaza <strong>maximul</strong> dintre greutatea reala si cea volumetrica
          (L × l × h / 6000). Dimensiuni prea mari scumpesc fiecare colet.
        </Callout>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Lungime (cm)">
            <Input type="number" min={1} value={lungime} onChange={(e) => setLungime(e.target.value)} />
          </Field>
          <Field label="Latime (cm)">
            <Input type="number" min={1} value={latime} onChange={(e) => setLatime(e.target.value)} />
          </Field>
          <Field label="Inaltime (cm)">
            <Input type="number" min={1} value={inaltime} onChange={(e) => setInaltime(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Greutate volumetrica la dimensiunile astea:{" "}
          <strong>{((Number(lungime) * Number(latime) * Number(inaltime)) / 6000 || 0).toFixed(2)} kg</strong>
        </p>

        <Field label="Descrierea implicita a continutului" hint="Apare pe AWB cand comanda n-are alta.">
          <Input value={continut} onChange={(e) => setContinut(e.target.value)} maxLength={255} />
        </Field>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Deschidere la livrare</p>
            <p className="text-xs text-muted-foreground">
              Unde curierul o suporta. La locker nu se aplica — nu e nimeni acolo care sa deschida coletul.
            </p>
          </div>
          <Switch checked={deschidere} onCheckedChange={setDeschidere} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Asigura coletul la valoarea comenzii</p>
            <p className="text-xs text-muted-foreground">Asigurarea se factureaza separat de curier.</p>
          </div>
          <Switch checked={asigura} onCheckedChange={setAsigura} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Nu comanda automat ridicarea</p>
            <p className="text-xs text-muted-foreground">
              Util daca ai deja o ridicare zilnica programata. Se aplica la curierii unde
              SmartShip comanda ridicarea singur (FanCourier, DragonStar, PTT Express).
            </p>
          </div>
          <Switch checked={faraRidicare} onCheckedChange={setFaraRidicare} />
        </div>

        <Field label="Formatul etichetei">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as FormatEticheta)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground"
          >
            {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
          </select>
        </Field>
      </Panel>

      <Panel title="Facturi de la SmartShip">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Facturile emise catre contul tau, cu link public catre PDF. Se citesc doar; nu intra
            nicaieri in contabilitatea magazinului.
          </p>
          <Button variant="outline" size="sm" onClick={incarcaFacturi} disabled={incarcFacturi || !isActive}>
            {incarcFacturi ? <Loader2 className="h-4 w-4 animate-spin" /> : "Incarca"}
          </Button>
        </div>

        {facturi && facturi.length > 0 && (
          <ul className="space-y-1">
            {facturi.slice(0, 10).map((f) => (
              <li key={f.number} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>
                  {f.number} · {f.date}
                  {f.due_date ? ` · scadenta ${f.due_date}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <strong>{f.total} {f.currency ?? "RON"}</strong>
                  {f.pdf_link && (
                    <a href={f.pdf_link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      PDF
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Deconturi de ramburs">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Banii din ramburs, asa cum ii vede SmartShip. Informativ: statusul platii comenzilor
            nu se schimba singur dupa ele.
          </p>
          <Button variant="outline" size="sm" onClick={incarcaDeconturi} disabled={incarcDeconturi || !isActive}>
            {incarcDeconturi ? <Loader2 className="h-4 w-4 animate-spin" /> : "Incarca"}
          </Button>
        </div>

        {deconturi && deconturi.length > 0 && (
          <ul className="space-y-1">
            {deconturi.slice(0, 10).map((d) => (
              <li key={d.number} className="flex justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>{d.number} · {d.date}{d.awb_count ? ` · ${d.awb_count} AWB` : ""}</span>
                <span className="font-semibold">{d.valoare} lei</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {isActive && (
        <Panel title="Diagnostic">
          {/*
            * ⚠ Masoara SINGURA necunoscuta din tot contractul lor: forma randului
            * din cele doua endpointuri de lockere, care n-au exemplu de raspuns.
            */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Verifica listele de lockere si arata cum se numesc campurile in raspunsul lor —
              singurele doua endpointuri fara exemplu in documentatie.
            </p>
            <Button variant="outline" size="sm" onClick={ruleazaDiagnostic} disabled={rulezDiagnostic}>
              {rulezDiagnostic ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ruleaza"}
            </Button>
          </div>
          {diagnostic && (
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-foreground">
              {diagnostic}
            </pre>
          )}
        </Panel>
      )}

      {isActive && (
        <Button variant="outline" onClick={handleDisconnect} className="text-red-600">
          <Unplug className="h-4 w-4 mr-2" /> Deconecteaza SmartShip
        </Button>
      )}
    </div>
  );
}
