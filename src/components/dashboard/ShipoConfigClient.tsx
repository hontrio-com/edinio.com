"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Info, Loader2, Unplug } from "lucide-react";
import {
  disconnectShipo, getShipoServiciiAction, saveShipoConfig, testShipoConnectionAction,
} from "@/lib/actions/shipo.actions";
import type { AdresaExpeditor, CurierShipo, FormatEticheta, ServiciuShipo, ShipoConfig } from "@/lib/shipo/client";
import { VALOARE_DECLARATA } from "@/lib/shipo/expediere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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
  { valoare: "A4", eticheta: "A4 (foaie intreaga)" },
  { valoare: "A6", eticheta: "A6 (eticheta compacta, imprimante de etichete)" },
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
  const [config, setConfig] = useState<ShipoConfig>({
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
    toast.success("Configurarea Shipo a fost salvata.");
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
    setContInfo(`${r.cont.name || "cont Shipo"} · ${r.cont.billing_type || "—"} · ${r.cont.status || "—"}`);
    if (r.adrese.length === 0) {
      toast.warning("Conexiunea merge, dar contul n-are nicio adresa de ridicare. Adauga una in contul Shipo.");
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
    toast.success(`Conexiune reusita. ${r.adrese.length} adrese de ridicare gasite.`);
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

  return (
    <div className="space-y-6">
      <Panel step={1} title="Conectare">
        <Field label="Cheia de API" hint="O generezi din contul Shipo, la Setari → API.">
          <Input
            type="password"
            value={config.api_key}
            placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "cheia ta de API"}
            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={proba} disabled={probeaza || !areCheie}>
            {probeaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Testeaza conexiunea
          </Button>
          {areCheie && (
            <Button type="button" variant="ghost" onClick={deconecteaza}>
              <Unplug className="h-4 w-4" /> Deconecteaza
            </Button>
          )}
        </div>

        {contInfo && <Callout variant="success" icon={CheckCircle}>{contInfo}</Callout>}
      </Panel>

      <Panel step={2} title="Adresa de ridicare">
        <Callout variant="info" icon={Info}>
          Shipo nu primeste un <strong>nume de oras</strong> pentru ridicare, ci id-ul unei adrese salvate in contul
          tau — si tot el pleaca la cotare. De aceea se alege din lista, nu se scrie de mana: un id gresit ar cota si
          ar expedia dintr-un alt depozit, fara nicio eroare.
        </Callout>
        {/*
          ⚠ NU e un camp de text, si nu poate fi: valoarea e id-ul unei adrese din
          contul lor, iar acelasi id se trimite si ca `sender_city` la cotare. Scris
          de mana, un id gresit coteaza si expediaza dintr-un alt depozit, tacut.
        */}
        {adrese.length > 0 ? (
          <div className="space-y-2">
            {adrese.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer">
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
              ? `Aleasa: ${config.sender_address_label}`
              : "Apasa „Testeaza conexiunea” ca sa aduci adresele din contul tau Shipo."}
          </p>
        )}
      </Panel>

      <Panel step={3} title="Ce se ofera in checkout">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ofera si livrare in locker sau punct de ridicare</p>
            <p className="text-xs text-muted-foreground">Shipo coteaza si serviciile la locker, cu pret real — spre deosebire de SmartShip, unde lockerul primeste tariful fix. Punctul se alege de client, dupa ce a ales oferta.</p>
          </div>
          <Switch checked={!!config.foloseste_lockere} onCheckedChange={(v) => setConfig({ ...config, foloseste_lockere: v })} />
        </div>

        <div>
          <p className="text-xs font-semibold mb-2">Curierii pe care ii arati clientilor</p>
          <p className="text-[11px] text-muted-foreground mb-2">
            Nimic bifat = toti curierii pe care ii da contul tau.
          </p>
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
                  onClick={() => setConfig({
                    ...config,
                    curieri_permisi: bifat ? permisi.filter((x) => x !== slug) : [...permisi, slug],
                  })}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                    bifat ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
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
            {suprapuse.join(", ")} {suprapuse.length === 1 ? "apare" : "apar"} si pe contractul tau direct, si prin
            Shipo. Cumparatorul o sa vada ambele variante, la preturi diferite — poate fi exact ce vrei (alegi
            contractul mai ieftin), dar poate parea si o dublura.
          </Callout>
        )}

        {servicii.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Contul tau are {servicii.length} servicii active, dintre care{" "}
            {servicii.filter((s) => s.recipient_address_type !== "address").length} livreaza in locker sau punct PUDO.
          </p>
        )}
        <Button type="button" variant="ghost" onClick={incarcaServicii} disabled={!esteActiv}>
          Vezi serviciile contului
        </Button>
      </Panel>

      <Panel step={4} title="Servicii care costa in plus">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Asigura coletul</p>
            <p className="text-xs text-muted-foreground">
              Se asigura la valoarea comenzii, plafonat la {VALOARE_DECLARATA.max} lei (limita Shipo). Comenzile sub
              1 leu nu se asigura deloc: fara o valoare valida, cererea ar cadea la validarea lor.
            </p>
          </div>
          <Switch checked={!!config.asigura_coletul} onCheckedChange={(v) => setConfig({ ...config, asigura_coletul: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Deschidere la livrare</p>
            <p className="text-xs text-muted-foreground">Clientul poate verifica coletul inainte de a plati. Unii curieri taxeaza separat.</p>
          </div>
          <Switch checked={!!config.deschidere_la_livrare} onCheckedChange={(v) => setConfig({ ...config, deschidere_la_livrare: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">SMS catre destinatar la emiterea AWB-ului</p>
            <p className="text-xs text-muted-foreground">Costa per mesaj, dupa tariful contului tau Shipo.</p>
          </div>
          <Switch checked={!!config.notifica_destinatarul} onCheckedChange={(v) => setConfig({ ...config, notifica_destinatarul: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ramburs Turbo</p>
            <p className="text-xs text-muted-foreground">Banii din ramburs vin mai repede, contra cost. Se aplica doar comenzilor cu plata la livrare.</p>
          </div>
          <Switch checked={!!config.ramburs_turbo} onCheckedChange={(v) => setConfig({ ...config, ramburs_turbo: v })} />
        </div>
      </Panel>

      <Panel step={5} title="Coletul implicit">
        <p className="text-xs text-muted-foreground">Se folosesc cand comanda n-are dimensiuni proprii.</p>
        <div className="grid grid-cols-3 gap-3">
          {([["lungime_cm", "Lungime"], ["latime_cm", "Latime"], ["inaltime_cm", "Inaltime"]] as const).map(([cheie, eticheta]) => (
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
        <Field
          label="Textul de pe AWB"
          hint="Maxim 40 de caractere, doar litere si cifre — asa cere Shipo. Diacriticele si semnele se curata automat."
        >
          <Input
            value={config.continut_implicit ?? ""}
            placeholder="Colet"
            onChange={(e) => setConfig({ ...config, continut_implicit: e.target.value })}
          />
        </Field>
        <Field label="Formatul etichetei">
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={config.format_eticheta ?? "A4"}
            onChange={(e) => setConfig({ ...config, format_eticheta: e.target.value as FormatEticheta })}
          >
            {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
          </select>
        </Field>
      </Panel>

      <Panel step={6} title="Pornire">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Foloseste Shipo pentru livrare</p>
            <p className="text-xs text-muted-foreground">Dupa salvare, activeaza metoda „Shipo.ro” si din Setari → Livrare, ca sa apara in checkout.</p>
          </div>
          <Switch checked={!!config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
        </div>
        {config.enabled && !areAdresa && (
          <Callout variant="warning" icon={AlertTriangle}>
            Fara o adresa de ridicare aleasa, Shipo nu poate cota nimic — clientii vor vedea tariful fix.
          </Callout>
        )}
        <Callout variant="info" icon={Info}>
          Shipo n-are mediu de proba: fiecare AWB emis e real si facturat. Inainte de emiterile in masa, datele se
          verifica automat prin validarea lor, care nu creeaza nimic.
        </Callout>
        <Button type="button" onClick={salvare} disabled={salveaza}>
          {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salveaza
        </Button>
      </Panel>
    </div>
  );
}

function etichetaAdresa(a: AdresaExpeditor): string {
  return [a.alias || a.name, a.company_name, a.phone].filter(Boolean).join(" · ") || `Adresa ${a.id}`;
}
