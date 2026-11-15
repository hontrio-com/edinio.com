"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Banknote, CheckCircle, Info, KeyRound, Loader2, Tag, Truck } from "lucide-react";
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
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare, useFormularIntegrare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
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
  { valoare: "productie", eticheta: "Producție (onlinetools.ups.com) · expedieri reale" },
  { valoare: "test", eticheta: "Test / CIE (wwwcie.ups.com) · etichete cu filigran „Sample”" },
];

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "GIF", eticheta: "GIF (imprimantă obișnuită)" },
  { valoare: "ZPL", eticheta: "ZPL (imprimantă termică de etichete)" },
  { valoare: "EPL", eticheta: "EPL2 (imprimantă termică)" },
  { valoare: "SPL", eticheta: "SPL (imprimantă termică)" },
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
  const { cfg: config, setCfg: setConfig, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<UpsConfig>({
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
    toast.success("Configurarea UPS a fost salvată.");
    marcheazaSalvat();
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

  const secretSalvat = secretulEsteSalvat(initialConfig, "client_secret");
  const activSalvat = !!initialConfig?.enabled && !!initialConfig?.client_id && secretSalvat && !!initialConfig?.account_number
    && !!(initialConfig?.expeditor?.oras ?? "").trim() && !!(initialConfig?.expeditor?.cod_postal ?? "").trim();
  const stari: StareAntet[] = !secretSalvat
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      activSalvat ? { ton: "bun", text: "Activ" } : { ton: "neutru", text: "Oprit" },
      ...(initialConfig?.mediu === "test" ? [{ ton: "asteptare" as const, text: "Mediu de test" }] : []),
    ];

  return (
    <PaginaIntegrare
      id="ups"
      titlu="Livrare"
      descriere="Colete prin UPS: livrări interne și către Uniunea Europeană, cu tarifele contractului tău, plată la livrare și puncte UPS Access Point."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="UPS la livrare" activ={!!config.enabled} onChange={(v) => setConfig({ ...config, enabled: v })} ariaLabel="Folosește UPS pentru livrare" textPornit="Pornit" textOprit="Oprit" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheile și numărul de cont (6 caractere)", facut: areChei },
          { text: "Orașul și codul poștal de expediție", facut: areExpeditor },
          { text: "UPS pornit", facut: esteActiv },
        ]} />
        <CumFunctioneaza id="ups" puncte={[
          { Icon: KeyRound, text: "Client ID și Client Secret vin din aplicația ta din portalul UPS pentru dezvoltatori." },
          { Icon: Banknote, text: "Rambursul merge doar pe conturi „Daily Pickup” sau „Drop Shipping”; proba de conexiune îl verifică." },
          { Icon: Tag, text: "Cerem tarifele contractului: fără ele, UPS întoarce prețurile de listă." },
          { Icon: Truck, text: "După salvare, pornește și metoda „UPS” din Setări, Livrare." },
        ]} />
      </>}
    >
      {config.enabled && !areExpeditor && (
        <Callout variant="warning" icon={AlertTriangle}>
          Fără oraș și cod poștal de expediție, UPS nu poate cota nimic, iar clienții vor vedea tariful fix.
        </Callout>
      )}
      {config.mediu === "test" && (
        <Callout variant="warning" icon={AlertTriangle}>
          Ești pe mediul de test al UPS. Etichetele emise poartă filigran „Sample” și nu sunt valabile, iar tarifele negociate
          sunt simulate. Treci pe producție înainte de prima comandă adevărată.
        </Callout>
      )}
      {esteActiv && config.mediu !== "test" && (
        <Callout variant="info" icon={Info}>
          Fiecare AWB emis e real și facturat, iar UPS nu are protecție contra dublurilor: dacă emiterea pare că a eșuat,
          folosește „Verifică la UPS” din pagina comenzii, în loc să încerci din nou.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Conectare">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client ID" htmlFor="ups-id"
            hint="Din aplicația ta din portalul UPS pentru dezvoltatori. Nu e mascat: îți spune ce aplicație ai legat.">
            <Input id="ups-id" value={config.client_id} onChange={(e) => setConfig({ ...config, client_id: e.target.value })} />
          </Field>
          <Field label="Client Secret" htmlFor="ups-secret" hint="Din aceeași aplicație. Se criptează și nu se mai afișează.">
            <Input
              id="ups-secret"
              type="password"
              value={config.client_secret}
              placeholder={secretSalvat ? PLACEHOLDER_SECRET_SALVAT : "secretul tău"}
              onChange={(e) => setConfig({ ...config, client_secret: e.target.value })}
            />
          </Field>
          <Field
            label="Număr de cont UPS (Shipper Number)"
            htmlFor="ups-cont"
            hint="EXACT șase caractere alfanumerice, așa îl cere UPS. Îl găsești pe factura UPS."
            error={config.account_number.trim().length > 0 && !contBun ? `Numărul are ${config.account_number.trim().length} caractere. UPS cere exact 6.` : undefined}
          >
            <Input id="ups-cont" value={config.account_number} placeholder="A1B2C3" maxLength={6} onChange={(e) => setConfig({ ...config, account_number: e.target.value })} />
          </Field>
          <Field label="Mediu" htmlFor="ups-mediu"
            hint="În CIE etichetele au filigran „Sample”, iar tarifele negociate sunt simulate (în jur de 1% sub cele de listă).">
            <select id="ups-mediu" className={selectCls} value={config.mediu ?? "productie"} onChange={(e) => setConfig({ ...config, mediu: e.target.value as MediuUps })}>
              {MEDII.map((m) => <option key={m.valoare} value={m.valoare}>{m.eticheta}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={testeaza} disabled={probeaza || !areChei || !areExpeditor}>
            {probeaza ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            Testează conexiunea
          </Button>
          {!areExpeditor && (
            <p className="text-xs text-muted-foreground">
              Completează întâi orașul și codul poștal de expediție: proba chiar cere două cotări, nu doar un token.
            </p>
          )}
        </div>

        {proba && (
          <Callout variant={proba.ok ? "success" : "warning"} icon={proba.ok ? CheckCircle : AlertTriangle}>
            <span className="block">{proba.mesaj}</span>
            {proba.servicii.length > 0 && (
              <span className="mt-1 block text-xs">
                Servicii întoarse: {proba.servicii.map((s) => `${s.cod}${s.nume ? ` (${s.nume})` : ""}`).join(", ")}
              </span>
            )}
            {proba.valuta && (
              <span className="mt-1 block text-xs">
                Valuta cotării: <strong>{proba.valuta}</strong>
                {proba.valuta.includes("RON")
                  ? ""
                  : ". Magazinul lucrează în lei. UPS nu are niciun câmp prin care să ceri valuta răspunsului, iar noi nu convertim sumele, deci UPS va apărea la comandă la tariful fix. Cere-i reprezentantului UPS tarife în RON."}
              </span>
            )}
            {proba.ok && (
              <span className="mt-1 block text-xs">
                {proba.negociat
                  ? "Contul primește tarifele CONTRACTULUI, nu prețurile de listă."
                  : "Contul a întors doar prețuri de LISTĂ. Verifică în portalul UPS că aplicația și numărul de cont sunt legate de același contract."}
              </span>
            )}
            {/*
              ⚠ Raspunsul la intrebarea „merge rambursul pe contul meu?".
              Nu se poate citi din niciun camp: se afla dintr-o cotare cu ramburs.
            */}
            <span className={`mt-1 block text-xs ${proba.rambursOk ? "" : "text-warning"}`}>{proba.rambursMesaj}</span>
            {proba.alerte.length > 0 && (
              <span className="mt-1 block text-xs">UPS a răspuns cu: {proba.alerte.join(" | ")}</span>
            )}
            {proba.mediu === "test" && (
              <span className="mt-1 block text-xs">
                Răspuns din mediul lor de test: etichetele poartă filigran „Sample”, iar tarifele negociate nu sunt cele reale.
              </span>
            )}
          </Callout>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de expediție">
        <Callout variant="info" icon={Info}>
          De aici pleacă fiecare colet, și tot de aici se calculează tariful. Codul poștal e obligatoriu în practică: UPS nu are
          nomenclator de județe românești, iar cotarea lor cere un cod de județ de exact două caractere, deci codul poștal rămâne
          singurul semnal după care pot zona ruta.
        </Callout>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nume persoană de contact">
            <Input value={expeditor.nume ?? ""} onChange={(e) => setExpeditor({ nume: e.target.value })} />
          </Field>
          <Field label="Firmă">
            <Input value={expeditor.companie ?? ""} onChange={(e) => setExpeditor({ companie: e.target.value })} />
          </Field>
          <Field label="Telefon" hint="Numai cifre la UPS, maxim 15. Se trimite cu prefixul țării.">
            <Input value={expeditor.telefon ?? ""} onChange={(e) => setExpeditor({ telefon: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={expeditor.email ?? ""} onChange={(e) => setExpeditor({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Strada și numărul" hint="Se împarte automat pe trei linii de câte 35 de caractere, cum cere UPS.">
          <Input value={expeditor.strada ?? ""} onChange={(e) => setExpeditor({ strada: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Oraș">
            <Input value={expeditor.oras ?? ""} onChange={(e) => setExpeditor({ oras: e.target.value })} />
          </Field>
          <Field
            label="Județ"
            hint="Se trimite DOAR dacă are exact două caractere. UPS cere un cod de județ pentru tarifele negociate, dar nu publică niciunul pentru România: pune-l doar dacă ți l-au dat ei."
          >
            <Input maxLength={2} value={expeditor.judet ?? ""} onChange={(e) => setExpeditor({ judet: e.target.value })} />
          </Field>
          <Field label="Cod poștal">
            <Input value={expeditor.cod_postal ?? ""} onChange={(e) => setExpeditor({ cod_postal: e.target.value })} />
          </Field>
        </div>
        <Callout variant="warning" icon={AlertTriangle}>{AVERTISMENT_ACEEASI_LOCALITATE}</Callout>
      </Sectiune>

      <Sectiune pas={3} titlu="Ce se oferă la comandă"
        descriere="Serviciile pe care le arăți clienților. Nimic bifat înseamnă toate serviciile întoarse de cotare. „Extern” înseamnă că serviciul merge numai către alte țări, după ghidul comercial UPS; filtrul real e cotarea lor.">
        <div className="flex flex-wrap gap-2">
          {servicii.map((s) => {
            const bifat = permise.includes(s.cod);
            return (
              <button
                key={s.cod}
                type="button"
                aria-pressed={bifat}
                onClick={() => setConfig({
                  ...config,
                  servicii_permise: bifat ? permise.filter((x) => x !== s.cod) : [...permise, s.cod],
                })}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
                title={s.intern ? "Se poate folosi și intern" : "Numai către alte țări"}
              >
                {s.nume}{s.intern ? "" : " · extern"}
              </button>
            );
          })}
        </div>
        <RandComutator
          separat
          titlu="Cere tarifele contractului"
          text="Fără asta, UPS întoarce prețurile de LISTĂ, care sunt mai mari decât ce plătești tu."
          activ={config.tarife_negociate !== false}
          onChange={(v) => setConfig({ ...config, tarife_negociate: v })}
        />
        <RandComutator
          separat
          titlu="Oferă livrare în puncte UPS Access Point"
          text={`Cel mult ${GREUTATE_MAXIMA_PUNCT_KG} kg și ${LUNGIME_MAXIMA_PUNCT_CM} cm lungime, după regulile lor din România. Punctele se oferă la tariful fix: UPS nu poate cota un punct anume înainte să fie ales.`}
          activ={!!config.puncte_activate}
          onChange={(v) => setConfig({ ...config, puncte_activate: v })}
        />
      </Sectiune>

      <Sectiune pas={4} titlu="Plata la livrare (ramburs)">
        <Callout variant="info" icon={Info}>
          UPS <strong>oferă</strong> ramburs pentru expedierile care pleacă din Uniunea Europeană (FedEx l-a retras). Dar numai pe
          conturi de tip <strong>„Daily Pickup”</strong> sau <strong>„Drop Shipping”</strong>. Tipul contului nu se poate citi prin
          API, deci „Testează conexiunea” îl probează printr-o cotare cu ramburs. Dacă proba spune că nu merge, oprește
          comutatorul: altfel comenzile cu plata la livrare primesc tăcut tariful fix.
        </Callout>
        <RandComutator
          titlu="Acceptă comenzi cu plata la livrare"
          text="Oprit, UPS dispare de la comandă la comenzile cu ramburs; nu apare la tarif fix."
          activ={config.ramburs_activ !== false}
          onChange={(v) => setConfig({ ...config, ramburs_activ: v })}
        />
        {config.ramburs_activ !== false && (
          <Field label="Cum se încasează rambursul" htmlFor="ups-fonduri"
            hint="Din tabelul UPS de țări cu ramburs. Pentru Uniunea Europeană există două valori, la nivel de expediere.">
            <select id="ups-fonduri" className={selectCls} value={config.cod_funds_code ?? FONDURI_RAMBURS_IMPLICIT} onChange={(e) => setConfig({ ...config, cod_funds_code: e.target.value })}>
              {FONDURI_RAMBURS.map((f) => <option key={f.cod} value={f.cod}>{f.eticheta}</option>)}
            </select>
          </Field>
        )}
      </Sectiune>

      <Sectiune pas={5} titlu="Eticheta">
        <Field
          label="Formatul etichetei"
          htmlFor="ups-format"
          hint="UPS NU dă PDF la emitere: enumerarea lor e GIF, ZPL, EPL și SPL. PDF-ul există doar la retipărire, și îl cerem de acolo când copia noastră lipsește."
        >
          <select id="ups-format" className={selectCls} value={config.format_eticheta ?? FORMAT_IMPLICIT} onChange={(e) => setConfig({ ...config, format_eticheta: e.target.value as FormatEticheta })}>
            {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
          </select>
        </Field>
        <p className="text-xs leading-relaxed text-muted-foreground">
          La fiecare AWB se descarcă și <strong className="text-foreground">caseta de semnătură</strong> (UPS o întoarce la toate
          expedierile din afara Statelor Unite) și trebuie tipărită odată cu eticheta. La comenzile cu ramburs mai vine și
          <strong className="text-foreground"> documentul de ramburs</strong> („COD Turn In Page”), pe care șoferul îl ia odată cu
          banii. Se descarcă automat, în HTML.
        </p>
      </Sectiune>

      <Sectiune pas={6} titlu="Coletul implicit"
        descriere={`Se folosesc când comanda n-are dimensiuni proprii. UPS facturează maximul dintre greutatea fizică și cea volumetrică. Limita lor e ${GREUTATE_MAXIMA_KG} kg pe colet; peste ${PRAG_COLET_GREU_KG} kg intra-comunitar, coletul cere eticheta lor de „colet greu”.`}>
        <div className="grid grid-cols-3 gap-3">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Lățime"], ["inaltime_cm", "Înălțime"]] as const).map(([cheie, eticheta]) => (
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
        <Field label="Descrierea mărfii" htmlFor="ups-continut" hint="Se trimite la expedierile în altă țară. La cele interne nu pleacă nicăieri.">
          <Input id="ups-continut" value={config.continut_implicit ?? ""} placeholder="Bunuri de consum" onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })} />
        </Field>
        <RandComutator
          separat
          titlu="Declară valoarea comenzii la transport"
          text="UPS taxează separat valoarea declarată. Oprită, coletul merge cu despăgubirea standard."
          activ={!!config.valoare_declarata}
          onChange={(v) => setConfig({ ...config, valoare_declarata: v })}
        />
      </Sectiune>

      {secretSalvat && (
        <ZonaDeconectare descriere="Șterge cheile și adresa UPS din Edinio. Expedierile deja emise rămân la UPS.">
          <ButonDeconectare
            nume="UPS"
            cePierzi="Client ID-ul, secretul, numărul de cont și adresa de expediere se șterg din Edinio. Ca să te întorci, le iei din nou din aplicația ta din portalul UPS. Expedierile deja emise rămân la ei."
            marime="default"
            onConfirma={deconecteaza}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={salveaza} onSalveaza={salvare} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
