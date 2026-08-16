"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Info, Loader2, Unplug } from "lucide-react";
import {
  disconnectUps, getUpsServiciiAction, saveUpsConfig, testUpsConnectionAction,
} from "@/lib/actions/ups.actions";
import {
  FONDURI_RAMBURS, FONDURI_RAMBURS_IMPLICIT, FORMAT_IMPLICIT,
  type ExpeditorUps, type FormatEticheta, type MediuUps, type UpsConfig,
} from "@/lib/ups/client";
import { serviciiPropuse } from "@/lib/ups/servicii";
import {
  AVERTISMENT_ACEEASI_LOCALITATE, GREUTATE_MAXIMA_KG, GREUTATE_MAXIMA_PUNCT_KG,
  LUNGIME_MAXIMA_PUNCT_CM, PRAG_COLET_GREU_KG,
} from "@/lib/ups/expediere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea UPS.
 *
 * ═══ ⚠ PATRU LUCRURI CARE SE GRESESC USOR ═══
 *
 * 1. **Numarul de cont are EXACT sase caractere.** UPS il numeste „Shipper Number", si
 *    descrierea lor e „Shipper's six digit alphanumeric account number". Nu e numarul de
 *    noua cifre al FedEx si nu e Client ID-ul.
 *
 * 2. **Rambursul cere un tip anume de cont.** Verbatim: „C.O.D. shipments are only
 *    available for Shippers with **Daily Pickup and Drop Shipping** accounts." Tipul
 *    contului nu se poate citi din API — de aia „Testeaza conexiunea" coteaza si CU
 *    ramburs, si spune rezultatul.
 *
 * 3. **Tarifele contractului nu vin singure.** Fara `NegotiatedRatesIndicator`, UPS
 *    intoarce pretul de LISTA. Il cerem din oficiu; cand contul nu e indreptatit, ei
 *    raspund tot 200 si pun un avertisment.
 *
 * 4. **UPS nu livreaza in aceeasi localitate din Romania.** Nota lor, in ghidul de
 *    servicii postale romanesti. Se scrie aici, ca sa nu fie descoperita dintr-o comanda
 *    ramasa fara pret.
 */

const MEDII: { valoare: MediuUps; eticheta: string }[] = [
  { valoare: "productie", eticheta: "Productie (onlinetools.ups.com) — expedieri reale" },
  { valoare: "test", eticheta: "Test / CIE (wwwcie.ups.com) — etichete cu filigran „Sample”" },
];

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "GIF", eticheta: "GIF (imprimanta obisnuita)" },
  { valoare: "ZPL", eticheta: "ZPL (imprimanta termica de etichete)" },
  { valoare: "EPL", eticheta: "EPL2 (imprimanta termica)" },
  { valoare: "SPL", eticheta: "SPL (imprimanta termica)" },
];

type Proba = {
  mediu: MediuUps;
  ok: boolean;
  mesaj: string;
  servicii: { cod: string; nume: string }[];
  valuta: string | null;
  negociat: boolean;
  alerte: string[];
  rambursOk: boolean;
  rambursMesaj: string;
};

export function UpsConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: UpsConfig | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<UpsConfig>({
    enabled: initialConfig?.enabled ?? false,
    client_id: initialConfig?.client_id ?? "",
    client_secret: initialConfig?.client_secret ?? "",
    account_number: initialConfig?.account_number ?? "",
    mediu: initialConfig?.mediu ?? "productie",
    expeditor: {
      nume: initialConfig?.expeditor?.nume ?? "",
      companie: initialConfig?.expeditor?.companie ?? "",
      telefon: initialConfig?.expeditor?.telefon ?? "",
      email: initialConfig?.expeditor?.email ?? "",
      strada: initialConfig?.expeditor?.strada ?? "",
      oras: initialConfig?.expeditor?.oras ?? "",
      judet: initialConfig?.expeditor?.judet ?? "",
      cod_postal: initialConfig?.expeditor?.cod_postal ?? "",
      tara: initialConfig?.expeditor?.tara ?? "RO",
    },
    servicii_permise: initialConfig?.servicii_permise ?? [],
    format_eticheta: initialConfig?.format_eticheta ?? FORMAT_IMPLICIT,
    lungime_cm: initialConfig?.lungime_cm,
    latime_cm: initialConfig?.latime_cm,
    inaltime_cm: initialConfig?.inaltime_cm,
    continut_implicit: initialConfig?.continut_implicit ?? "",
    valoare_declarata: initialConfig?.valoare_declarata ?? false,
    tarife_negociate: initialConfig?.tarife_negociate ?? true,
    ramburs_activ: initialConfig?.ramburs_activ ?? true,
    cod_funds_code: initialConfig?.cod_funds_code ?? FONDURI_RAMBURS_IMPLICIT,
    puncte_activate: initialConfig?.puncte_activate ?? false,
  });

  const [salveaza, setSalveaza] = useState(false);
  const [probeaza, setProbeaza] = useState(false);
  const [proba, setProba] = useState<Proba | null>(null);
  const [servicii, setServicii] = useState(serviciiPropuse(initialConfig?.expeditor?.tara ?? "RO"));

  const expeditor = config.expeditor ?? ({} as ExpeditorUps);
  const setExpeditor = (patch: Partial<ExpeditorUps>) =>
    setConfig((c) => ({ ...c, expeditor: { ...(c.expeditor ?? {} as ExpeditorUps), ...patch } }));

  /*
   * ⚠ „Secretul e pus?" se citeste din CONFIGUL SALVAT, nu din campul din ecran.
   *
   * Campul poarta substituentul cand exista deja un secret criptat in baza, iar o
   * verificare pe lungimea lui ar raspunde „da" si pentru substituent, si pentru un
   * secret sters din greseala.
   */
  const areSecret = secretulEsteSalvat(initialConfig, "client_secret") || !!config.client_secret.trim();
  const contBun = config.account_number.trim().length === 6;
  const areChei = !!config.client_id.trim() && areSecret && contBun;
  const areExpeditor = !!(expeditor.oras ?? "").trim() && !!(expeditor.cod_postal ?? "").trim();

  /* ⚠ IDENTIC cu `upsGata()` de pe server, cu `activeCourierIds`, cu pagina comenzii si
     cu cardul din hub. Cinci locuri care trebuie sa spuna acelasi lucru, altfel panoul
     arata „conectat" pentru o integrare care nu poate cota nimic. */
  const esteActiv = !!config.enabled && !!config.client_id.trim() && areSecret
    && !!config.account_number.trim() && areExpeditor;

  /** Ce se trimite la server. ⚠ Secretul neatins pleaca GOL, ca sa fie pastrat. */
  const construieste = (): UpsConfig => ({
    ...config,
    client_id: config.client_id.trim(),
    client_secret: config.client_secret === PLACEHOLDER_SECRET_SALVAT ? "" : config.client_secret.trim(),
    account_number: config.account_number.trim().toUpperCase(),
    continut_implicit: (config.continut_implicit ?? "").trim(),
    servicii_permise: (config.servicii_permise ?? []).filter(Boolean),
    expeditor: {
      ...expeditor,
      nume: (expeditor.nume ?? "").trim(),
      companie: (expeditor.companie ?? "").trim(),
      telefon: (expeditor.telefon ?? "").trim(),
      email: (expeditor.email ?? "").trim(),
      strada: (expeditor.strada ?? "").trim(),
      oras: (expeditor.oras ?? "").trim(),
      judet: (expeditor.judet ?? "").trim(),
      cod_postal: (expeditor.cod_postal ?? "").trim(),
      tara: ((expeditor.tara ?? "RO").trim() || "RO").toUpperCase(),
    },
  });

  const salvare = async () => {
    setSalveaza(true);
    const r = await saveUpsConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Configurarea UPS a fost salvata.");
    const s = await getUpsServiciiAction(businessId);
    if (s.ok) setServicii(s.servicii);
    router.refresh();
  };

  const testeaza = async () => {
    setProbeaza(true);
    const r = await testUpsConnectionAction(businessId, construieste());
    setProbeaza(false);
    if (!r.ok) { toast.error(r.error, { duration: 15000 }); return; }

    setProba({
      mediu: r.proba.mediu,
      ok: r.proba.cotare.ok,
      mesaj: r.proba.cotare.mesaj,
      servicii: r.proba.cotare.servicii,
      valuta: r.proba.cotare.valuta,
      negociat: r.proba.cotare.negociat,
      alerte: r.proba.cotare.alerte,
      rambursOk: r.proba.ramburs.ok,
      rambursMesaj: r.proba.ramburs.mesaj,
    });

    if (!r.proba.cotare.ok) { toast.error(r.proba.cotare.mesaj, { duration: 15000 }); return; }
    toast.success(r.proba.cotare.mesaj);
  };

  const deconecteaza = async () => {
    const r = await disconnectUps(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("UPS a fost deconectat.");
    router.refresh();
  };

  const permise = config.servicii_permise ?? [];

  return (
    <div className="space-y-5">
      <Panel title="Conectare">
        <Field
          label="Client ID"
          hint="Din aplicatia ta din portalul UPS pentru dezvoltatori. Nu e mascat: iti spune ce aplicatie ai legat."
        >
          <Input
            value={config.client_id}
            onChange={(e) => setConfig({ ...config, client_id: e.target.value })}
          />
        </Field>

        <Field label="Client Secret" hint="Din aceeasi aplicatie. Se cripteaza in baza si nu se mai afiseaza.">
          <Input
            type="password"
            value={config.client_secret}
            placeholder={secretulEsteSalvat(initialConfig, "client_secret") ? PLACEHOLDER_SECRET_SALVAT : "secretul tau"}
            onChange={(e) => setConfig({ ...config, client_secret: e.target.value })}
          />
        </Field>

        <Field
          label="Numar de cont UPS (Shipper Number)"
          hint="⚠ EXACT sase caractere alfanumerice — asa il cere UPS („six digit alphanumeric account number”). Il gasesti pe factura UPS."
        >
          <Input
            value={config.account_number}
            placeholder="A1B2C3"
            maxLength={6}
            onChange={(e) => setConfig({ ...config, account_number: e.target.value })}
          />
        </Field>
        {config.account_number.trim().length > 0 && !contBun && (
          <p className="text-[11px] text-warning">
            Numarul are {config.account_number.trim().length} caractere. UPS cere exact 6.
          </p>
        )}

        <Field
          label="Mediu"
          hint="⚠ In CIE etichetele au filigran „Sample”, iar tarifele negociate sunt simulate (in jur de 1% sub cele de lista)."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.mediu ?? "productie"}
            onChange={(e) => setConfig({ ...config, mediu: e.target.value as MediuUps })}
          >
            {MEDII.map((m) => <option key={m.valoare} value={m.valoare}>{m.eticheta}</option>)}
          </select>
        </Field>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="outline" onClick={testeaza} disabled={probeaza || !areChei || !areExpeditor}>
            {probeaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Testeaza conexiunea
          </Button>
          {areChei && (
            <Button type="button" variant="ghost" onClick={deconecteaza}>
              <Unplug className="h-4 w-4" /> Deconecteaza
            </Button>
          )}
        </div>
        {!areExpeditor && (
          <p className="text-[11px] text-muted-foreground">
            Completeaza intai orasul si codul postal de expeditie: proba chiar cere doua cotari, nu doar un token.
          </p>
        )}

        {proba && (
          <Callout variant={proba.ok ? "success" : "warning"} icon={proba.ok ? CheckCircle : AlertTriangle}>
            <span className="block">{proba.mesaj}</span>
            {proba.servicii.length > 0 && (
              <span className="block mt-1 text-xs">
                Servicii intoarse: {proba.servicii.map((s) => `${s.cod}${s.nume ? ` (${s.nume})` : ""}`).join(", ")}
              </span>
            )}
            {proba.valuta && (
              <span className="block mt-1 text-xs">
                Valuta cotarii: <strong>{proba.valuta}</strong>
                {proba.valuta.includes("RON")
                  ? ""
                  : " — ⚠ magazinul lucreaza in lei. UPS nu are niciun camp prin care sa ceri valuta raspunsului, iar noi nu convertim sumele, deci UPS va aparea in checkout la tariful fix. Cere-i reprezentantului UPS tarife in RON."}
              </span>
            )}
            {proba.ok && (
              <span className="block mt-1 text-xs">
                {proba.negociat
                  ? "Contul primeste tarifele CONTRACTULUI, nu preturile de lista."
                  : "⚠ Contul a intors doar preturi de LISTA. Verifica in portalul UPS ca aplicatia si numarul de cont sunt legate de acelasi contract."}
              </span>
            )}
            {/*
              ⚠ Raspunsul la intrebarea „merge rambursul pe contul meu?".
              Nu se poate citi din niciun camp — se afla dintr-o cotare cu ramburs.
            */}
            <span className={`block mt-1 text-xs ${proba.rambursOk ? "" : "text-warning"}`}>
              {proba.rambursMesaj}
            </span>
            {proba.alerte.length > 0 && (
              <span className="block mt-1 text-xs">UPS a raspuns cu: {proba.alerte.join(" | ")}</span>
            )}
            {proba.mediu === "test" && (
              <span className="block mt-1 text-xs">
                ⚠ Raspuns din mediul lor de test: etichetele poarta filigran „Sample”, iar tarifele negociate
                nu sunt cele reale.
              </span>
            )}
          </Callout>
        )}
      </Panel>

      <Panel title="Adresa de expeditie">
        <Callout variant="info" icon={Info}>
          De aici pleaca fiecare colet, si tot de aici se calculeaza tariful. Codul postal e obligatoriu in
          practica: UPS nu are nomenclator de judete romanesti, iar cotarea lor cere un cod de judet de exact
          doua caractere — deci codul postal ramane singurul semnal dupa care pot zona ruta.
        </Callout>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nume persoana de contact">
            <Input value={expeditor.nume ?? ""} onChange={(e) => setExpeditor({ nume: e.target.value })} />
          </Field>
          <Field label="Firma">
            <Input value={expeditor.companie ?? ""} onChange={(e) => setExpeditor({ companie: e.target.value })} />
          </Field>
          <Field label="Telefon" hint="Numai cifre la UPS, maxim 15. Se trimite cu prefixul tarii.">
            <Input value={expeditor.telefon ?? ""} onChange={(e) => setExpeditor({ telefon: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={expeditor.email ?? ""} onChange={(e) => setExpeditor({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Strada si numarul" hint="Se imparte automat pe trei linii de cate 35 de caractere, cum cere UPS.">
          <Input value={expeditor.strada ?? ""} onChange={(e) => setExpeditor({ strada: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Oras">
            <Input value={expeditor.oras ?? ""} onChange={(e) => setExpeditor({ oras: e.target.value })} />
          </Field>
          <Field
            label="Judet"
            hint="⚠ Se trimite DOAR daca are exact doua caractere. UPS cere un cod de judet pentru tarifele negociate, dar nu publica niciunul pentru Romania — pune-l doar daca ti l-au dat ei."
          >
            <Input maxLength={2} value={expeditor.judet ?? ""} onChange={(e) => setExpeditor({ judet: e.target.value })} />
          </Field>
          <Field label="Cod postal">
            <Input value={expeditor.cod_postal ?? ""} onChange={(e) => setExpeditor({ cod_postal: e.target.value })} />
          </Field>
        </div>
        <Callout variant="warning" icon={AlertTriangle}>
          {AVERTISMENT_ACEEASI_LOCALITATE}
        </Callout>
      </Panel>

      <Panel title="Ce se ofera in checkout">
        <p className="text-xs font-semibold">Serviciile pe care le arati clientilor</p>
        <p className="text-[11px] text-muted-foreground">
          Nimic bifat = toate serviciile pe care le intoarce cotarea. „Intern” arata care dintre ele se pot
          folosi si pentru livrari in Romania, dupa ghidul comercial al UPS — dar filtrul real e al lor: ce
          intoarce cotarea, aia se poate expedia.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {servicii.map((s) => {
            const bifat = permise.includes(s.cod);
            return (
              <button
                key={s.cod}
                type="button"
                onClick={() => setConfig({
                  ...config,
                  servicii_permise: bifat ? permise.filter((x) => x !== s.cod) : [...permise, s.cod],
                })}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                  bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
                title={s.intern ? "Se poate folosi si intern" : "Numai catre alte tari"}
              >
                {s.nume}{s.intern ? "" : " · extern"}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3">
          <div>
            <p className="text-sm font-medium">Cere tarifele contractului</p>
            <p className="text-xs text-muted-foreground">
              Fara asta UPS intoarce preturile de LISTA, care sunt mai mari decat ce platesti tu.
            </p>
          </div>
          <Switch
            checked={config.tarife_negociate !== false}
            onCheckedChange={(v) => setConfig({ ...config, tarife_negociate: v })}
          />
        </div>

        <div className="flex items-center justify-between pt-3">
          <div>
            <p className="text-sm font-medium">Ofera livrare in puncte UPS Access Point</p>
            <p className="text-xs text-muted-foreground">
              Cel mult {GREUTATE_MAXIMA_PUNCT_KG} kg si {LUNGIME_MAXIMA_PUNCT_CM} cm lungime, dupa regulile lor
              din Romania. Punctele se ofera la tariful fix — UPS nu poate cota un punct anume inainte ca el sa
              fie ales.
            </p>
          </div>
          <Switch
            checked={!!config.puncte_activate}
            onCheckedChange={(v) => setConfig({ ...config, puncte_activate: v })}
          />
        </div>
      </Panel>

      <Panel title="Plata la livrare (ramburs)">
        <Callout variant="info" icon={Info}>
          <span className="block">
            UPS <strong>ofera</strong> ramburs pentru expedierile care pleaca din Uniunea Europeana — spre
            deosebire de FedEx, care l-a retras.
          </span>
          <span className="block mt-1 text-xs">
            ⚠ Dar numai pe conturi de tip <strong>„Daily Pickup”</strong> sau <strong>„Drop Shipping”</strong>.
            Tipul contului nu se poate citi prin API, deci „Testeaza conexiunea” il probeaza printr-o cotare cu
            ramburs. Daca proba spune ca nu merge, stinge comutatorul: altfel comenzile cu plata la livrare vor
            primi tacut tariful fix.
          </span>
        </Callout>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Accepta comenzi cu plata la livrare</p>
            <p className="text-xs text-muted-foreground">
              Stins, UPS dispare din checkout la comenzile cu ramburs — nu apare la tarif fix.
            </p>
          </div>
          <Switch
            checked={config.ramburs_activ !== false}
            onCheckedChange={(v) => setConfig({ ...config, ramburs_activ: v })}
          />
        </div>

        {config.ramburs_activ !== false && (
          <Field
            label="Cum se incaseaza rambursul"
            hint="Din tabelul UPS de tari cu ramburs. Pentru Uniunea Europeana exista doua valori, la nivel de expediere."
          >
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={config.cod_funds_code ?? FONDURI_RAMBURS_IMPLICIT}
              onChange={(e) => setConfig({ ...config, cod_funds_code: e.target.value })}
            >
              {FONDURI_RAMBURS.map((f) => <option key={f.cod} value={f.cod}>{f.eticheta}</option>)}
            </select>
          </Field>
        )}
      </Panel>

      <Panel title="Eticheta">
        <Field
          label="Formatul etichetei"
          hint="⚠ UPS NU da PDF la emitere — enumerarea lor e GIF, ZPL, EPL si SPL. PDF-ul exista doar la reimprimare, si il cerem de acolo cand copia noastra lipseste."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.format_eticheta ?? FORMAT_IMPLICIT}
            onChange={(e) => setConfig({ ...config, format_eticheta: e.target.value as FormatEticheta })}
          >
            {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
          </select>
        </Field>

        <Callout variant="info" icon={Info}>
          <span className="block">
            La fiecare AWB se descarca si <strong>caseta de semnatura</strong> — UPS o intoarce la toate
            expedierile din afara Statelor Unite, si trebuie tiparita odata cu eticheta.
          </span>
          <span className="block mt-1 text-xs">
            La comenzile cu ramburs mai vine si <strong>documentul de ramburs</strong> („COD Turn In Page”), pe
            care soferul il ia odata cu banii. Se descarca automat, in HTML.
          </span>
        </Callout>
      </Panel>

      <Panel title="Coletul implicit">
        <p className="text-xs text-muted-foreground">
          Se folosesc cand comanda n-are dimensiuni proprii. UPS factureaza pe maximul dintre greutatea fizica
          si cea volumetrica, deci dimensiuni prea mari scumpesc fiecare colet. Limita lor e {GREUTATE_MAXIMA_KG} kg
          pe colet; peste {PRAG_COLET_GREU_KG} kg intra-comunitar, coletul cere eticheta lor speciala de „colet greu”.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Latime"], ["inaltime_cm", "Inaltime"]] as const).map(([cheie, eticheta]) => (
            <Field key={cheie} label={`${eticheta} (cm)`}>
              <Input
                type="number"
                min={1}
                max={270}
                value={config[cheie] ?? ""}
                onChange={(e) => setConfig({ ...config, [cheie]: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
          ))}
        </div>
        <Field
          label="Descrierea marfii"
          hint="Se trimite la expedierile in alta tara. La cele interne nu pleaca nicaieri."
        >
          <Input
            value={config.continut_implicit ?? ""}
            placeholder="Bunuri de consum"
            onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })}
          />
        </Field>
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-sm font-medium">Declara valoarea comenzii la transport</p>
            <p className="text-xs text-muted-foreground">
              UPS taxeaza separat valoarea declarata. Stins, coletul merge cu despagubirea standard.
            </p>
          </div>
          <Switch
            checked={!!config.valoare_declarata}
            onCheckedChange={(v) => setConfig({ ...config, valoare_declarata: v })}
          />
        </div>
      </Panel>

      <Panel title="Pornire">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Foloseste UPS pentru livrare</p>
            <p className="text-xs text-muted-foreground">
              Dupa salvare, activeaza metoda „UPS” si din Setari → Livrare, ca sa apara in checkout.
            </p>
          </div>
          <Switch checked={!!config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
        </div>
        {config.enabled && !areExpeditor && (
          <Callout variant="warning" icon={AlertTriangle}>
            Fara oras si cod postal de expeditie, UPS nu poate cota nimic — clientii vor vedea tariful fix.
          </Callout>
        )}
        {config.mediu === "test" && (
          <Callout variant="warning" icon={AlertTriangle}>
            Esti pe mediul de test al UPS. Etichetele emise poarta filigran „Sample” si nu sunt valabile, iar
            tarifele negociate sunt simulate. Treci pe productie inainte de prima comanda adevarata.
          </Callout>
        )}
        {esteActiv && config.mediu !== "test" && (
          <Callout variant="info" icon={Info}>
            Fiecare AWB emis e real si facturat — UPS nu are protectie contra dublurilor, deci daca emiterea pare
            ca a esuat foloseste „Verifica la UPS” din pagina comenzii in loc sa incerci din nou.
          </Callout>
        )}
        <Button type="button" className="mt-3" onClick={salvare} disabled={salveaza}>
          {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salveaza
        </Button>
      </Panel>
    </div>
  );
}
