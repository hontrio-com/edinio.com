"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Info, KeyRound, Loader2, MapPin, Truck } from "lucide-react";
import {
  disconnectShipo, getShipoServiciiAction, saveShipoConfig, testShipoConnectionAction,
} from "@/lib/actions/shipo.actions";
import type { AdresaExpeditor, CurierShipo, FormatEticheta, ServiciuShipo, ShipoConfig } from "@/lib/shipo/client";
import { VALOARE_DECLARATA } from "@/lib/shipo/expediere";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare, useFormularIntegrare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea Shipo.
 *
 * ═══ ⚠ DOUA LUCRURI CARE SE GRESESC USOR ═══
 *
 * 1. **Adresa de ridicare NU e un oras.** E id-ul unei adrese salvate in contul
 *    Shipo, si tot el pleaca — cu numele derutant `sender_city` — la cotare. De
 *    aia nu se scrie de mana: butonul „Testeaza conexiunea" aduce lista si omul
 *    alege din ea.
 *
 * 2. **Cheia se schimba pe un token de o ora.** Deci o cheie gresita nu se vede
 *    la salvare, ci la prima cotare — motiv pentru care proba de aici CERE datele
 *    contului, nu doar raspunde „merge".
 *
 * ═══ ⚠ NU EXISTA MEDIU DE PROBA ═══
 *
 * Fiecare emitere e reala si facturata. Shipo are insa `POST /shipment/validate`,
 * care verifica datele FARA sa creeze nimic — folosit inainte de emiterile in lot.
 */

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "A4", eticheta: "A4 (foaie întreagă)" },
  { valoare: "A6", eticheta: "A6 (etichetă compactă, imprimante de etichete)" },
];

/**
 * ⚠ SINGURELE sloguri care apar in documentatia lor: `fancourier`, `cargus`,
 * `dpd` si `sameday`. Restul brandurilor (GLS, Posta Romana, FedEx) apar acolo
 * doar ca nume de afisat pe site-ul lor, NU ca sloguri de API.
 *
 * Un slug ghicit gresit e cel mai scump lucru pe care l-ar putea contine lista:
 * filtrul `curieri_permisi` compara pe EGALITATE de sir, deci bifat, ar scoate
 * TACUT curierul acela din checkout — comerciantul crede ca l-a pornit, si el nu
 * apare niciodata.
 *
 * De aia lista de bifat vine din CONTUL comerciantului (`POST /couriers`), iar
 * astea patru sunt doar rezerva de dinaintea primei citiri.
 */
const SLUGURI_DOCUMENTATE: Record<string, string> = {
  fancourier: "FAN Courier",
  cargus: "Cargus",
  dpd: "DPD",
  sameday: "Sameday",
};

/** Curierii Shipo care se suprapun peste contractele directe ale magazinului. */
const ECHIVALENT_DIRECT: Record<string, string> = {
  fancourier: "fan-courier",
  cargus: "cargus",
  dpd: "dpd",
  gls: "gls",
  sameday: "sameday",
  posta: "posta",
  /* FedEx e integrare directa din 16.08.2026. Slugul vine din `/couriers`, ca toti
     ceilalti — nu e ghicit. */
  fedex: "fedex",
};

export function ShipoConfigClient({
  businessId,
  initialConfig,
  activiDirect = [],
}: {
  businessId: string;
  initialConfig: ShipoConfig | null;
  /** Curierii pe care magazinul ii are deja pornit pe cont propriu. */
  activiDirect?: string[];
}) {
  const router = useRouter();
  const { cfg: config, setCfg: setConfig, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<ShipoConfig>({
    enabled: initialConfig?.enabled ?? false,
    api_key: initialConfig?.api_key ?? "",
    sender_address_id: initialConfig?.sender_address_id,
    sender_address_label: initialConfig?.sender_address_label,
    curieri_permisi: initialConfig?.curieri_permisi ?? [],
    foloseste_lockere: initialConfig?.foloseste_lockere ?? false,
    deschidere_la_livrare: initialConfig?.deschidere_la_livrare ?? false,
    asigura_coletul: initialConfig?.asigura_coletul ?? false,
    notifica_destinatarul: initialConfig?.notifica_destinatarul ?? false,
    ramburs_turbo: initialConfig?.ramburs_turbo ?? false,
    lungime_cm: initialConfig?.lungime_cm,
    latime_cm: initialConfig?.latime_cm,
    inaltime_cm: initialConfig?.inaltime_cm,
    continut_implicit: initialConfig?.continut_implicit ?? "",
    format_eticheta: initialConfig?.format_eticheta ?? "A4",
  });

  const [salveaza, setSalveaza] = useState(false);
  const [probeaza, setProbeaza] = useState(false);
  const [adrese, setAdrese] = useState<AdresaExpeditor[]>([]);
  const [servicii, setServicii] = useState<ServiciuShipo[]>([]);
  const [curieriCont, setCurieriCont] = useState<CurierShipo[]>([]);
  const [contInfo, setContInfo] = useState<string | null>(null);

  /*
   * ⚠ „Cheia e pusa?" se citeste din CONFIGUL SALVAT, nu din campul din ecran.
   *
   * Campul poarta substituentul cand exista deja o cheie criptata in baza, iar o
   * verificare pe lungimea lui ar raspunde „da" si pentru substituent, si pentru
   * o cheie stearsa din greseala.
   */
  const areCheie = secretulEsteSalvat(initialConfig, "api_key") || !!config.api_key.trim();
  const areAdresa = Number(config.sender_address_id) > 0;

  /* ⚠ IDENTIC cu `shipoGata()` de pe server si cu regula din `activeCourierIds`.
     Trei locuri care trebuie sa spuna acelasi lucru, altfel panoul arata
     „conectat" pentru o integrare care nu poate cota nimic. */
  const esteActiv = !!config.enabled && areCheie && areAdresa;

  /** Ce se trimite la server. ⚠ Secretul neatins pleaca GOL, ca sa fie pastrat. */
  const construieste = (): ShipoConfig => ({
    ...config,
    api_key: config.api_key === PLACEHOLDER_SECRET_SALVAT ? "" : config.api_key.trim(),
    continut_implicit: (config.continut_implicit ?? "").trim(),
    curieri_permisi: (config.curieri_permisi ?? []).filter(Boolean),
  });

  const salvare = async () => {
    setSalveaza(true);
    const r = await saveShipoConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Configurarea Shipo a fost salvată.");
    marcheazaSalvat();
    router.refresh();
  };

  const proba = async () => {
    setProbeaza(true);
    const r = await testShipoConnectionAction(
      businessId,
      config.api_key === PLACEHOLDER_SECRET_SALVAT ? undefined : config.api_key.trim(),
    );
    setProbeaza(false);
    if (!r.ok) { toast.error(r.error); return; }

    setAdrese(r.adrese);
    setContInfo(`${r.cont.name || "cont Shipo"} · ${r.cont.billing_type || "-"} · ${r.cont.status || "-"}`);
    if (r.adrese.length === 0) {
      toast.warning("Conexiunea merge, dar contul n-are nicio adresă de ridicare. Adaugă una în contul Shipo.");
      return;
    }
    /* O singura adresa: se alege singura, ca omul sa n-aiba de facut un pas fara rost. */
    if (r.adrese.length === 1 && !areAdresa) {
      setConfig((c) => ({
        ...c,
        sender_address_id: r.adrese[0].id,
        sender_address_label: etichetaAdresa(r.adrese[0]),
      }));
    }
    toast.success(`Conexiune reușită: ${r.adrese.length} adrese de ridicare găsite.`);
  };

  const incarcaServicii = async () => {
    const r = await getShipoServiciiAction(businessId);
    if (!r.ok) { toast.error(r.error); return; }
    setServicii(r.servicii);
    setCurieriCont(r.curieri);
    if (r.servicii.length === 0) toast.warning("Contul n-are niciun serviciu activ.");
  };

  const deconecteaza = async () => {
    const r = await disconnectShipo(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Shipo a fost deconectat.");
    router.refresh();
  };

  /* Curierii care apar si direct, si prin Shipo. */
  const permisi = config.curieri_permisi ?? [];
  const suprapuse = Object.entries(ECHIVALENT_DIRECT)
    .filter(([slug, direct]) => activiDirect.includes(direct) && (permisi.length === 0 || permisi.includes(slug)))
    .map(([slug]) => curieriCont.find((c) => c.slug === slug)?.name ?? SLUGURI_DOCUMENTATE[slug] ?? slug);

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const activSalvat = !!initialConfig?.enabled && cheieSalvata && Number(initialConfig?.sender_address_id) > 0;
  const stari: StareAntet[] = !cheieSalvata
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [activSalvat ? { ton: "bun", text: "Activ" } : { ton: "neutru", text: "Oprit" }];

  return (
    <PaginaIntegrare
      id="shipo"
      titlu="Livrare"
      descriere="Colete prin Shipo.ro: un cont, mai mulți curieri și tarife negociate de ei, la adresă, în lockere sau în puncte de ridicare."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Shipo la livrare" activ={!!config.enabled} onChange={(v) => setConfig({ ...config, enabled: v })} ariaLabel="Folosește Shipo pentru livrare" textPornit="Pornit" textOprit="Oprit" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia de API", facut: areCheie },
          { text: "Adresa de ridicare", facut: areAdresa },
          { text: "Shipo pornit", facut: esteActiv },
        ]} />
        {contInfo && <CardCifre titlu="Contul Shipo" randuri={[{ eticheta: "Cont", valoare: contInfo }]} />}
        <CumFunctioneaza id="shipo" puncte={[
          { Icon: KeyRound, text: "Cheia de API o generezi din contul Shipo, la Setări, API." },
          { Icon: MapPin, text: "Adresa de ridicare se alege din cele salvate în contul Shipo: e un id, nu un oraș." },
          { Icon: Truck, text: "După salvare, pornește și metoda „Shipo.ro” din Setări, Livrare, ca să apară la comandă." },
          { Icon: AlertTriangle, text: "Shipo nu are mediu de probă: fiecare emitere e reală și facturată." },
        ]} />
      </>}
    >
      {config.enabled && !areAdresa && (
        <Callout variant="warning" icon={AlertTriangle}>
          Fără o adresă de ridicare aleasă, Shipo nu poate cota nimic, iar clienții vor vedea tariful fix.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Conectare">
        <Field label="Cheia de API" htmlFor="shipo-cheie" hint="O generezi din contul Shipo, la Setări, API.">
          <Input
            id="shipo-cheie"
            type="password"
            value={config.api_key}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "cheia ta de API"}
            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
          />
        </Field>
        <div>
          <Button type="button" variant="outline" onClick={proba} disabled={probeaza || !areCheie}>
            {probeaza ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            Testează conexiunea
          </Button>
        </div>
        {contInfo && <Callout variant="success" icon={CheckCircle} title={contInfo} />}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de ridicare">
        <Callout variant="info" icon={Info}>
          Shipo nu primește un <strong>nume de oraș</strong> pentru ridicare, ci id-ul unei adrese salvate în contul tău, și tot
          el pleacă la cotare. De aceea se alege din listă, nu se scrie de mână: un id greșit ar cota și ar expedia dintr-un
          alt depozit, fără nicio eroare.
        </Callout>
        {/*
          ⚠ NU e un camp de text, si nu poate fi: valoarea e id-ul unei adrese din
          contul lor, iar acelasi id se trimite si ca `sender_city` la cotare. Scris
          de mana, un id gresit coteaza si expediaza dintr-un alt depozit, tacut.
        */}
        {adrese.length > 0 ? (
          <div className="space-y-2">
            {adrese.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="shipo-adresa"
                  className="mt-1"
                  checked={config.sender_address_id === a.id}
                  onChange={() => setConfig({ ...config, sender_address_id: a.id, sender_address_label: etichetaAdresa(a) })}
                />
                <span>{etichetaAdresa(a)}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {config.sender_address_label
              ? `Aleasă: ${config.sender_address_label}`
              : "Apasă „Testează conexiunea” ca să aduci adresele din contul tău Shipo."}
          </p>
        )}
      </Sectiune>

      <Sectiune pas={3} titlu="Ce se oferă la comandă">
        <RandComutator
          titlu="Oferă și livrare în locker sau punct de ridicare"
          text="Shipo cotează și serviciile la locker, cu preț real (la SmartShip lockerul primește tariful fix). Punctul îl alege clientul, după ce a ales oferta."
          activ={!!config.foloseste_lockere}
          onChange={(v) => setConfig({ ...config, foloseste_lockere: v })}
        />

        <div className="border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium text-foreground">Curierii pe care îi arăți clienților</p>
          <p className="mb-2 text-xs text-muted-foreground">Nimic bifat înseamnă toți curierii din contul tău.</p>
          <div className="flex flex-wrap gap-2">
            {(curieriCont.length > 0
              ? curieriCont.filter((c) => c.enabled).map((c) => [c.slug, c.name] as const)
              : Object.entries(SLUGURI_DOCUMENTATE)
            ).map(([slug, nume]) => {
              const bifat = permisi.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={bifat}
                  onClick={() => setConfig({
                    ...config,
                    curieri_permisi: bifat ? permisi.filter((x) => x !== slug) : [...permisi, slug],
                  })}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {nume}
                </button>
              );
            })}
          </div>
        </div>

        {suprapuse.length > 0 && (
          <Callout variant="warning" icon={AlertTriangle}>
            {suprapuse.join(", ")} {suprapuse.length === 1 ? "apare" : "apar"} și pe contractul tău direct, și prin Shipo.
            Cumpărătorul vede ambele variante, la prețuri diferite: poate fi exact ce vrei (alegi contractul mai ieftin), dar
            poate părea și o dublură.
          </Callout>
        )}

        {servicii.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Contul tău are {servicii.length} servicii active, dintre care{" "}
            {servicii.filter((s) => s.recipient_address_type !== "address").length} livrează în locker sau punct PUDO.
          </p>
        )}
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={incarcaServicii} disabled={!esteActiv}>
            Vezi serviciile contului
          </Button>
        </div>
      </Sectiune>

      <Sectiune pas={4} titlu="Servicii care costă în plus">
        <RandComutator
          titlu="Asigură coletul"
          text={`Se asigură la valoarea comenzii, plafonat la ${VALOARE_DECLARATA.max} lei (limita Shipo). Comenzile sub 1 leu nu se asigură deloc: fără o valoare validă, cererea ar cădea la validarea lor.`}
          activ={!!config.asigura_coletul}
          onChange={(v) => setConfig({ ...config, asigura_coletul: v })}
        />
        <RandComutator
          separat
          titlu="Deschidere la livrare"
          text="Clientul poate verifica coletul înainte de a plăti. Unii curieri taxează separat."
          activ={!!config.deschidere_la_livrare}
          onChange={(v) => setConfig({ ...config, deschidere_la_livrare: v })}
        />
        <RandComutator
          separat
          titlu="SMS către destinatar la emiterea AWB-ului"
          text="Costă per mesaj, după tariful contului tău Shipo."
          activ={!!config.notifica_destinatarul}
          onChange={(v) => setConfig({ ...config, notifica_destinatarul: v })}
        />
        <RandComutator
          separat
          titlu="Ramburs Turbo"
          text="Banii din ramburs vin mai repede, contra cost. Se aplică doar comenzilor cu plata la livrare."
          activ={!!config.ramburs_turbo}
          onChange={(v) => setConfig({ ...config, ramburs_turbo: v })}
        />
      </Sectiune>

      <Sectiune pas={5} titlu="Coletul implicit" descriere="Se folosesc când comanda n-are dimensiuni proprii.">
        <div className="grid grid-cols-3 gap-3">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Lățime"], ["inaltime_cm", "Înălțime"]] as const).map(([cheie, eticheta]) => (
            <Field key={cheie} label={`${eticheta} (cm)`}>
              <Input
                type="number"
                min={1}
                value={config[cheie] ?? ""}
                onChange={(e) => setConfig({ ...config, [cheie]: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Textul de pe AWB" htmlFor="shipo-continut"
            hint="Maxim 40 de caractere, doar litere și cifre, așa cere Shipo. Diacriticele și semnele se curăță automat.">
            <Input id="shipo-continut" value={config.continut_implicit ?? ""} placeholder="Colet" onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })} />
          </Field>
          <Field label="Formatul etichetei" htmlFor="shipo-format">
            <select
              id="shipo-format"
              className={selectCls}
              value={config.format_eticheta ?? "A4"}
              onChange={(e) => setConfig({ ...config, format_eticheta: e.target.value as FormatEticheta })}
            >
              {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
            </select>
          </Field>
        </div>
      </Sectiune>

      {cheieSalvata && (
        <ZonaDeconectare descriere="Șterge cheia și setările Shipo din Edinio. Expedierile deja emise rămân la Shipo.">
          <ButonDeconectare
            nume="Shipo"
            cePierzi="Cheia de API se șterge din Edinio, împreună cu adresa de ridicare și serviciile alese. Ca să te întorci, generezi din nou o cheie din contul Shipo. Expedierile deja emise rămân la ei."
            marime="default"
            onConfirma={deconecteaza}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare modificat={modificat} saving={salveaza} onSalveaza={salvare} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}

function etichetaAdresa(a: AdresaExpeditor): string {
  return [a.alias || a.name, a.company_name, a.phone].filter(Boolean).join(" · ") || `Adresa ${a.id}`;
}
