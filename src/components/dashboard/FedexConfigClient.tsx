"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, Info, Loader2, Unplug } from "lucide-react";
import {
  disconnectFedex, getFedexServiciiAction, saveFedexConfig, testFedexConnectionAction,
} from "@/lib/actions/fedex.actions";
import {
  RAMBURS_INDISPONIBIL, STOCURI_ETICHETA, STOC_IMPLICIT,
  type ExpeditorFedex, type FedexConfig, type FormatEticheta, type MediuFedex, type TipRidicare,
} from "@/lib/fedex/client";
import { serviciiPropuse } from "@/lib/fedex/servicii";
import { GREUTATE_MAXIMA_EXPRESS_KG } from "@/lib/fedex/expediere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea FedEx.
 *
 * ═══ ⚠ TREI LUCRURI CARE SE GRESESC USOR ═══
 *
 * 1. **Cheile de test NU merg in productie, si invers.** Proiectul din portalul
 *    FedEx are doua perechi diferite. Comutatorul de mediu de aici alege gazda, iar
 *    o nepotrivire iese ca „credentiale respinse" — adica exact mesajul care il
 *    face pe comerciant sa-si regenereze cheile bune.
 *
 * 2. **Sandbox-ul lor e VIRTUALIZAT.** Raspunde cu preturi predefinite, indiferent
 *    de adresa („only country is validated"). E bun ca sa vezi ca legatura merge,
 *    nu ca sa afli cat costa un colet spre Cluj.
 *
 * 3. **Codul postal e obligatoriu de facto.** Romania e tara „postal-aware" la ei,
 *    cu sablonul `NNNNNN`. Fara el, fiecare cotare raspunde `POSTALCODE.ZIPCODE.REQUIRED`.
 *
 * ═══ ⚠ SI UNUL CARE NU SE POATE REPARA DIN CONFIGURARE ═══
 *
 * **Rambursul.** Nu e un comutator lipsa — FedEx l-a retras in iulie 2023. Se spune
 * sus de tot, nu la subsol: pentru un magazin romanesc e prima intrebare.
 */

const MEDII: { valoare: MediuFedex; eticheta: string }[] = [
  { valoare: "productie", eticheta: "Productie (apis.fedex.com) — expedieri reale" },
  { valoare: "test", eticheta: "Test / sandbox (apis-sandbox.fedex.com) — raspunsuri simulate" },
];

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "PDF", eticheta: "PDF (imprimanta obisnuita)" },
  { valoare: "PNG", eticheta: "PNG (imagine)" },
  { valoare: "ZPLII", eticheta: "ZPL II (imprimanta termica de etichete)" },
];

const RIDICARI: { valoare: TipRidicare; eticheta: string }[] = [
  { valoare: "USE_SCHEDULED_PICKUP", eticheta: "Ridicare programata (ai deja o ridicare zilnica la FedEx)" },
  { valoare: "CONTACT_FEDEX_TO_SCHEDULE", eticheta: "Suni la FedEx pentru fiecare ridicare" },
  { valoare: "DROPOFF_AT_FEDEX_LOCATION", eticheta: "Duci coletul la un punct FedEx" },
];

type Proba = {
  mediu: MediuFedex;
  ok: boolean;
  mesaj: string;
  servicii: string[];
  valuta: string | null;
  virtual: boolean;
  /** ⚠ Preturile contului includ TVA? Dedus din numerele cotarii de proba. */
  tva: string;
};

export function FedexConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: FedexConfig | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<FedexConfig>({
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
    pickup_type: initialConfig?.pickup_type ?? "USE_SCHEDULED_PICKUP",
    format_eticheta: initialConfig?.format_eticheta ?? "PDF",
    stoc_eticheta: initialConfig?.stoc_eticheta ?? STOC_IMPLICIT,
    lungime_cm: initialConfig?.lungime_cm,
    latime_cm: initialConfig?.latime_cm,
    inaltime_cm: initialConfig?.inaltime_cm,
    continut_implicit: initialConfig?.continut_implicit ?? "",
    valoare_declarata: initialConfig?.valoare_declarata ?? false,
  });

  const [salveaza, setSalveaza] = useState(false);
  const [probeaza, setProbeaza] = useState(false);
  const [proba, setProba] = useState<Proba | null>(null);
  const [servicii, setServicii] = useState<{ cod: string; nume: string; marfaGrea: boolean }[]>(
    serviciiPropuse(initialConfig?.expeditor?.tara ?? "RO"),
  );

  const expeditor = config.expeditor ?? ({} as ExpeditorFedex);
  const setExpeditor = (patch: Partial<ExpeditorFedex>) =>
    setConfig((c) => ({ ...c, expeditor: { ...(c.expeditor ?? {} as ExpeditorFedex), ...patch } }));

  /*
   * ⚠ „Secretul e pus?" se citeste din CONFIGUL SALVAT, nu din campul din ecran.
   *
   * Campul poarta substituentul cand exista deja un secret criptat in baza, iar o
   * verificare pe lungimea lui ar raspunde „da" si pentru substituent, si pentru un
   * secret sters din greseala.
   */
  const areSecret = secretulEsteSalvat(initialConfig, "client_secret") || !!config.client_secret.trim();
  const areChei = !!config.client_id.trim() && areSecret && !!config.account_number.trim();
  const areExpeditor = !!(expeditor.oras ?? "").trim() && !!(expeditor.cod_postal ?? "").trim();

  /* ⚠ IDENTIC cu `fedexGata()` de pe server, cu `activeCourierIds`, cu pagina
     comenzii si cu cardul din hub. Cinci locuri care trebuie sa spuna acelasi lucru,
     altfel panoul arata „conectat" pentru o integrare care nu poate cota nimic. */
  const esteActiv = !!config.enabled && areChei && areExpeditor;

  /** Ce se trimite la server. ⚠ Secretul neatins pleaca GOL, ca sa fie pastrat. */
  const construieste = (): FedexConfig => ({
    ...config,
    client_id: config.client_id.trim(),
    client_secret: config.client_secret === PLACEHOLDER_SECRET_SALVAT ? "" : config.client_secret.trim(),
    account_number: config.account_number.trim(),
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
    const r = await saveFedexConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Configurarea FedEx a fost salvata.");
    const s = await getFedexServiciiAction(businessId);
    if (s.ok) setServicii(s.servicii);
    router.refresh();
  };

  const testeaza = async () => {
    setProbeaza(true);
    const r = await testFedexConnectionAction(businessId, construieste());
    setProbeaza(false);
    if (!r.ok) { toast.error(r.error, { duration: 15000 }); return; }

    setProba({
      mediu: r.proba.mediu,
      ok: r.proba.cotare.ok,
      mesaj: r.proba.cotare.mesaj,
      servicii: r.proba.cotare.servicii,
      valuta: r.proba.cotare.valuta,
      virtual: r.proba.cotare.virtual,
      tva: r.proba.cotare.tva,
    });

    if (!r.proba.cotare.ok) { toast.error(r.proba.cotare.mesaj, { duration: 15000 }); return; }
    toast.success(r.proba.cotare.mesaj);
  };

  const deconecteaza = async () => {
    const r = await disconnectFedex(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("FedEx a fost deconectat.");
    router.refresh();
  };

  const permise = config.servicii_permise ?? [];

  return (
    <div className="space-y-5">
      {/*
        ⚠ SUS DE TOT, nu la subsol. Pentru un magazin romanesc rambursul e prima
        intrebare, iar raspunsul nu se poate schimba din nicio setare.
      */}
      <Callout variant="warning" icon={Ban}>
        <strong>FedEx nu ofera plata la livrare.</strong> {RAMBURS_INDISPONIBIL} In checkout, FedEx nu apare
        deloc la comenzile cu ramburs — restul curierilor raman.
      </Callout>

      <Panel title="Conectare">
        <Field
          label="API Key (client_id)"
          hint="Din portalul FedEx pentru dezvoltatori, la proiectul tau. Nu e mascat: iti spune ce proiect ai legat."
        >
          <Input
            value={config.client_id}
            placeholder="l7xx..."
            onChange={(e) => setConfig({ ...config, client_id: e.target.value })}
          />
        </Field>

        <Field label="Secret Key (client_secret)" hint="Din acelasi proiect. Se cripteaza in baza si nu se mai afiseaza.">
          <Input
            type="password"
            value={config.client_secret}
            placeholder={secretulEsteSalvat(initialConfig, "client_secret") ? PLACEHOLDER_SECRET_SALVAT : "secretul tau"}
            onChange={(e) => setConfig({ ...config, client_secret: e.target.value })}
          />
        </Field>

        <Field label="Numar de cont FedEx" hint="Noua cifre. Il gasesti pe factura FedEx.">
          <Input
            value={config.account_number}
            placeholder="123456789"
            maxLength={9}
            onChange={(e) => setConfig({ ...config, account_number: e.target.value })}
          />
        </Field>

        <Field
          label="Mediu"
          hint="⚠ Cheile de test NU merg in productie, si invers. O nepotrivire iese ca „credentiale respinse”."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.mediu ?? "productie"}
            onChange={(e) => setConfig({ ...config, mediu: e.target.value as MediuFedex })}
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
            Completeaza intai orasul si codul postal de expeditie: proba chiar cere o cotare, nu doar un token.
          </p>
        )}

        {proba && (
          <Callout variant={proba.ok ? "success" : "warning"} icon={proba.ok ? CheckCircle : AlertTriangle}>
            <span className="block">{proba.mesaj}</span>
            {proba.servicii.length > 0 && (
              <span className="block mt-1 text-xs">Servicii intoarse: {proba.servicii.join(", ")}</span>
            )}
            {proba.valuta && (
              <span className="block mt-1 text-xs">
                Valuta cotarii: <strong>{proba.valuta}</strong>
                {proba.valuta.includes("RON")
                  ? ""
                  : " — ⚠ magazinul lucreaza in lei. Nu convertim noi sumele, deci FedEx va aparea in checkout la tariful fix. Cere-i reprezentantului FedEx tarife in RON."}
              </span>
            )}
            {/*
              ⚠ Raspunsul la intrebarea „preturile FedEx sunt cu sau fara TVA?".
              Documentatia lor nu o spune pentru Romania, dar raspunsul de cotare
              aduce toate cele trei numere, deci se DEDUCE aici — o data pe cont,
              in loc sa fie masurat de om la prima expediere.
            */}
            {proba.ok && <span className="block mt-1 text-xs">{proba.tva}</span>}
            {proba.virtual && (
              <span className="block mt-1 text-xs">
                ⚠ Raspuns din sandbox-ul FedEx: preturile sunt simulate si nu depind de adresa reala.
              </span>
            )}
          </Callout>
        )}
      </Panel>

      <Panel title="Adresa de expeditie">
        <Callout variant="info" icon={Info}>
          De aici pleaca fiecare colet, si tot de aici se calculeaza tariful. Codul postal e obligatoriu:
          Romania e tara „postal-aware” la FedEx (sase cifre), iar fara el cotarea nu se poate face deloc.
        </Callout>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nume persoana de contact">
            <Input value={expeditor.nume ?? ""} onChange={(e) => setExpeditor({ nume: e.target.value })} />
          </Field>
          <Field label="Firma">
            <Input value={expeditor.companie ?? ""} onChange={(e) => setExpeditor({ companie: e.target.value })} />
          </Field>
          <Field label="Telefon" hint="Maxim 15 caractere la FedEx.">
            <Input value={expeditor.telefon ?? ""} onChange={(e) => setExpeditor({ telefon: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={expeditor.email ?? ""} onChange={(e) => setExpeditor({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Strada si numarul" hint="Se imparte automat pe trei linii de cate 35 de caractere, cum cere FedEx.">
          <Input value={expeditor.strada ?? ""} onChange={(e) => setExpeditor({ strada: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Oras">
            <Input value={expeditor.oras ?? ""} onChange={(e) => setExpeditor({ oras: e.target.value })} />
          </Field>
          <Field label="Judet" hint="Optional: FedEx cere judetul doar pentru SUA, Canada si Puerto Rico.">
            <Input value={expeditor.judet ?? ""} onChange={(e) => setExpeditor({ judet: e.target.value })} />
          </Field>
          <Field label="Cod postal">
            <Input value={expeditor.cod_postal ?? ""} onChange={(e) => setExpeditor({ cod_postal: e.target.value })} />
          </Field>
        </div>
      </Panel>

      <Panel title="Ce se ofera in checkout">
        <p className="text-xs font-semibold">Serviciile pe care le arati clientilor</p>
        <p className="text-[11px] text-muted-foreground">
          Nimic bifat = toate serviciile pe care le intoarce cotarea. Serviciile de marfa grea nu se ofera
          cumparatorilor cu colete sub {GREUTATE_MAXIMA_EXPRESS_KG} kg, oricum ar fi bifate — raman disponibile la
          emiterea din pagina comenzii.
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
                title={s.marfaGrea ? "Marfa grea — nu se ofera in checkout la colete usoare" : undefined}
              >
                {s.nume}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Ridicare si eticheta">
        <Field label="Cum ajunge coletul la FedEx">
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.pickup_type ?? "USE_SCHEDULED_PICKUP"}
            onChange={(e) => setConfig({ ...config, pickup_type: e.target.value as TipRidicare })}
          >
            {RIDICARI.map((r) => <option key={r.valoare} value={r.valoare}>{r.eticheta}</option>)}
          </select>
        </Field>

        <Field label="Formatul etichetei">
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.format_eticheta ?? "PDF"}
            onChange={(e) => setConfig({ ...config, format_eticheta: e.target.value as FormatEticheta })}
          >
            {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
          </select>
        </Field>

        <Field
          label="Dimensiunea hartiei"
          hint="Numele contine dimensiunea in inch: 4X6 = 4×6&quot;, 85X11 = jumatate de coala A4-ish. PAPER = coala, STOCK = rola termica."
        >
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.stoc_eticheta ?? STOC_IMPLICIT}
            onChange={(e) => setConfig({ ...config, stoc_eticheta: e.target.value })}
          >
            {STOCURI_ETICHETA.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Callout variant="info" icon={Info}>
          FedEx nu permite reimprimarea etichetei prin API, iar linkul din raspunsul lor expira in cateva ore.
          De aceea o pastram noi, la emitere, si o poti descarca oricand din pagina comenzii.
        </Callout>
      </Panel>

      {/*
        ⚠ Se spune PE FATA, nu se lasa comerciantul sa descopere singur.
        FedEx cere codul postal al destinatarului ca sa coteze (Romania e tara
        „postal-aware" la ei), iar checkout-ul nu il colecteaza la livrarile interne.
        Fara randurile astea, omul ar vedea „conexiunea merge" aici si un pret fix in
        magazin, si ar cauta o zi ce a stricat.
      */}
      <Panel title="Cum apare pretul in magazin">
        <Callout variant="info" icon={Info}>
          <span className="block">
            In checkout, FedEx apare la <strong>tariful fix</strong> pe care il pui in Setari → Livrare.
          </span>
          <span className="block mt-1 text-xs">
            Motivul: FedEx cere codul postal al destinatarului ca sa calculeze un pret, iar formularul de
            comanda il cere doar la livrarile in strainatate. Pretul real — cu toate serviciile si termenele —
            il vezi cand emiti AWB-ul din pagina comenzii, unde poti completa codul postal.
          </span>
          <span className="block mt-1 text-xs">
            Pune deci un tarif fix realist: cel mai ieftin serviciu intern FedEx porneste mult peste tarifele
            curierilor locali.
          </span>
        </Callout>
      </Panel>

      <Panel title="Coletul implicit">
        <p className="text-xs text-muted-foreground">
          Se folosesc cand comanda n-are dimensiuni proprii. FedEx factureaza pe maximul dintre greutatea fizica si
          cea volumetrica, deci dimensiuni prea mari scumpesc fiecare colet.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Latime"], ["inaltime_cm", "Inaltime"]] as const).map(([cheie, eticheta]) => (
            <Field key={cheie} label={`${eticheta} (cm)`}>
              <Input
                type="number"
                min={1}
                max={999}
                value={config[cheie] ?? ""}
                onChange={(e) => setConfig({ ...config, [cheie]: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
          ))}
        </div>
        <Field
          label="Descrierea marfii"
          hint="Se tipareste pe factura comerciala, la expedierile internationale. La cele interne nu pleaca nicaieri."
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
              FedEx taxeaza separat valoarea declarata. Stins, coletul merge cu despagubirea standard.
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
            <p className="text-sm font-medium">Foloseste FedEx pentru livrare</p>
            <p className="text-xs text-muted-foreground">
              Dupa salvare, activeaza metoda „FedEx” si din Setari → Livrare, ca sa apara in checkout.
            </p>
          </div>
          <Switch checked={!!config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
        </div>
        {config.enabled && !areExpeditor && (
          <Callout variant="warning" icon={AlertTriangle}>
            Fara oras si cod postal de expeditie, FedEx nu poate cota nimic — clientii vor vedea tariful fix.
          </Callout>
        )}
        {config.mediu === "test" && (
          <Callout variant="warning" icon={AlertTriangle}>
            Esti pe sandbox-ul FedEx. Raspunsurile sunt simulate: preturile nu depind de adresa, iar AWB-urile emise
            nu exista in realitate. Treci pe productie inainte de prima comanda adevarata.
          </Callout>
        )}
        {esteActiv && config.mediu !== "test" && (
          <Callout variant="info" icon={Info}>
            Fiecare AWB emis e real si facturat — FedEx nu are protectie contra dublurilor, deci daca emiterea pare
            ca a esuat foloseste „Verifica la FedEx” din pagina comenzii in loc sa incerci din nou.
          </Callout>
        )}
        <Button type="button" className="mt-3" onClick={salvare} disabled={salveaza}>
          {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salveaza
        </Button>
      </Panel>
    </div>
  );
}
