"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Copy, Info, KeyRound, ListFilter, Loader2, Radio, Stethoscope } from "lucide-react";
import {
  diagnosticInnoshipAction,
  disconnectInnoship,
  saveInnoshipConfig,
  testInnoshipConnectionAction,
} from "@/lib/actions/innoship.actions";
import type { CurierInnoship, FormatEticheta, InnoshipConfig, TipEticheta } from "@/lib/innoship/client";
import { suprapuneri, textSuprapunere } from "@/lib/innoship/suprapunere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea Innoship.
 *
 * ⚠ Doua lucruri fac ecranul asta altfel decat celelalte configurari de curier:
 *
 * 1. **Filtrul de curieri nu e o inlesnire, e o conditie de lizibilitate.**
 *    Innoship agrega ~230 de curieri; nefiltrat, un cont larg poate umple
 *    checkout-ul cu zeci de oferte aproape identice.
 *
 * 2. **Avertismentul de suprapunere** (varianta B, hotarata cu clientul): cand un
 *    curier e activ si direct, si prin Innoship, cumparatorul vede ambele variante
 *    la preturi diferite. Nu e defect — sunt doua contracte adevarate, si cel
 *    direct e adesea mai ieftin — dar trebuie SPUS, altfel arata a dublura.
 */

const FORMATE: FormatEticheta[] = ["A4", "A6", "A5", "A6_300dpi", "A4_4xA6", "A6_10x9", "T_85x85"];
const TIPURI: TipEticheta[] = ["Pdf", "Zpl", "Html", "Epl", "Clp"];

export function InnoshipConfigClient({
  businessId,
  initialConfig,
  /** Curierii pe care magazinul ii are pornit in „Setari → Livrare". */
  curieriActiviDirect,
  /** URL-ul de baza al platformei, pentru adresa de webhook. */
  baseUrl,
}: {
  businessId: string;
  initialConfig: InnoshipConfig | null;
  curieriActiviDirect: string[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [diagnosticand, setDiagnosticand] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Awaited<ReturnType<typeof diagnosticInnoshipAction>> | null>(null);
  const [curieri, setCurieri] = useState<CurierInnoship[] | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [depozit, setDepozit] = useState(initialConfig?.external_client_location ?? "");
  const [permisi, setPermisi] = useState<number[]>(initialConfig?.curieri_permisi ?? []);
  const [format, setFormat] = useState<FormatEticheta>(initialConfig?.format_eticheta ?? "A6");
  const [tip, setTip] = useState<TipEticheta>(initialConfig?.tip_eticheta ?? "Pdf");
  const [observatii, setObservatii] = useState(initialConfig?.observatii ?? "");
  const s = initialConfig?.servicii ?? {};
  const [openPackage, setOpenPackage] = useState(!!s.openPackage);
  const [saturday, setSaturday] = useState(!!s.saturdayDelivery);
  const [returDocumente, setReturDocumente] = useState(!!s.returnOfDocuments);

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { apiKey, depozit, permisi, format, tip, observatii, openPackage, saturday, returDocumente };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setApiKey(reper.apiKey); setDepozit(reper.depozit); setPermisi(reper.permisi); setFormat(reper.format); setTip(reper.tip);
    setObservatii(reper.observatii); setOpenPackage(reper.openPackage); setSaturday(reper.saturday); setReturDocumente(reper.returDocumente);
  }

  const areCheie = apiKey.trim() !== "" || secretulEsteSalvat(initialConfig, "api_key");
  const isActive = !!(initialConfig?.enabled && initialConfig.external_client_location && secretulEsteSalvat(initialConfig, "api_key"));

  /*
   * ⚠ URL-ul de webhook se arata DOAR daca secretul exista deja in configurare.
   * El se naste la prima salvare, iar aratat inainte ar fi un link mort pe care
   * omul l-ar lipi in portalul Innoship si ar astepta degeaba.
   */
  /*
   * ⚠ SI CU SELECTORUL DE MAGAZIN (14.09.2026), care NU e secret.
   *
   * Fara el, ruta cauta magazinul filtrand pe valoarea DECRIPTATA a secretului, adica
   * pe o coloana calculata a vederii: niciun index nu o poate servi, deci fiecare
   * cerere venita de oriunde decripteaza configul fiecarui magazin. Cu `business`,
   * se citeste un singur rand si secretul se compara in timp constant.
   *
   * ⚠ Adresele VECHI raman valabile, si ruta le primeste mai departe: cine a lipit deja
   * forma fara `business` nu pierde urmarirea. Se sting singure, pe masura ce
   * comerciantii copiaza adresa de aici.
   */
  const urlWebhook = initialConfig?.webhook_secret
    ? `${baseUrl}/api/innoship/track?business=${businessId}&secret=${initialConfig.webhook_secret}`
    : null;

  /* Varianta B: se calculeaza din catalogul VIU, deci apare dupa proba de conexiune. */
  const lista = suprapuneri(curieri ?? [], curieriActiviDirect, permisi);
  const avertismentSuprapunere = textSuprapunere(lista);

  function construieste(): InnoshipConfig {
    return {
      enabled: true,
      api_key: apiKey.trim(),
      external_client_location: depozit.trim(),
      webhook_secret: initialConfig?.webhook_secret,
      curieri_permisi: permisi,
      format_eticheta: format,
      tip_eticheta: tip,
      observatii: observatii.trim(),
      servicii: {
        openPackage,
        saturdayDelivery: saturday,
        returnOfDocuments: returDocumente,
      },
    };
  }

  async function handleTest() {
    if (!areCheie) return toast.error("Completează cheia de API.");
    setTesting(true);
    const r = await testInnoshipConnectionAction(businessId, construieste());
    setTesting(false);
    if (!r.ok) { setCurieri(null); return toast.error(`Innoship: ${r.error}`); }
    setCurieri(r.curieri);
    toast.success(`Conexiune reușită: ${r.curieri.length} curieri disponibili.`);
  }

  async function handleDiagnostic() {
    setDiagnosticand(true);
    const r = await diagnosticInnoshipAction(businessId);
    setDiagnosticand(false);
    setDiagnostic(r);
    if (!r.ok) toast.error(r.error);
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completează cheia de API.");
    if (!depozit.trim()) {
      return toast.error("Completează id-ul depozitului („External Client Location” din portalul Innoship).");
    }
    setSaving(true);
    const r = await saveInnoshipConfig(businessId, construieste());
    setSaving(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea Innoship a fost salvată.");
    setApiKey("");
    setReper({ ...valori, apiKey: "" });
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectInnoship(businessId);
    setDisconnecting(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Innoship a fost deconectat.");
    router.refresh();
  }

  function comutaCurier(id: number) {
    setPermisi((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const stari: StareAntet[] = isActive ? [{ ton: "bun", text: "Activ" }] : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="innoship"
      titlu="Livrare"
      descriere="Un singur cont, zeci de curieri: cumpărătorul alege oferta la comandă, iar tu emiți dintr-un singur loc."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia de API", facut: areCheie },
          { text: "Depozitul (External Client Location)", facut: !!depozit.trim() },
          { text: "Adresa de urmărire în portal", facut: !!urlWebhook },
          { text: "Innoship activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Depozit", valoare: initialConfig?.external_client_location || "-" },
            { eticheta: "Curieri", valoare: permisi.length > 0 ? `${permisi.length} aleși` : "toți ai contului" },
          ]} />
        )}
        <CumFunctioneaza id="innoship" puncte={[
          { Icon: KeyRound, text: "Cheia de API și id-ul depozitului le primești de la Innoship; depozitul e cel din „Locations”." },
          { Icon: ListFilter, text: "Innoship are sute de curieri: alegi doar pe cei pe care vrei să-i vadă cumpărătorul." },
          { Icon: Radio, text: "Cu adresa de urmărire pusă la „Track push”, comenzile se mișcă singure, pe loc." },
        ]} />
      </>}
    >
      {avertismentSuprapunere && (
        <Callout variant="warning" icon={AlertTriangle} title="Același curier, pe două contracte">
          {avertismentSuprapunere}
        </Callout>
      )}

      <Sectiune pas={1} titlu="Contul Innoship"
        descriere="Cheia de API și id-ul depozitului le primești de la Innoship. Depozitul e cel configurat la ei în „Locations” și declanșează fiecare expediere.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cheie de API" htmlFor="innoship-cheie" required>
            <Input
              id="innoship-cheie"
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setCurieri(null); }}
              placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "Cheia primită de la Innoship"}
            />
          </Field>
          <Field label="Id depozit (External Client Location)" htmlFor="innoship-depozit" required hint="Din portalul Innoship, secțiunea Locations.">
            <Input id="innoship-depozit" value={depozit} onChange={(e) => setDepozit(e.target.value)} placeholder="DEPOZIT-1" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || !areCheie}>
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

        {diagnostic?.ok && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Ce a răspuns Innoship</p>
            <p>{diagnostic.curieri} curieri · {diagnostic.puncte} puncte de ridicare în România
              {diagnostic.puncteFaraNume > 0 ? `, dintre care ${diagnostic.puncteFaraNume} fără denumire recunoscută` : ""}.</p>
            {diagnostic.puncteFaraNume > 0 && (
              <p className="text-warning">
                Punctele fără denumire apar la comandă doar cu localitatea. Trimite-ne lista de câmpuri de mai jos și o reparăm.
              </p>
            )}
            {diagnostic.puncteDoarCurier > 0 && (
              <p className="text-warning">
                {diagnostic.puncteDoarCurier} puncte au doar id-ul de la curier, nu și pe cel Innoship, deci nu apar la comandă.
                Sunt două câmpuri diferite în API-ul lor, iar trimis în locul celuilalt, id-ul de curier ar duce coletul în alt
                punct decât cel ales de client. Trimite-ne lista de câmpuri de mai jos.
              </p>
            )}
            {diagnostic.cheiPuncte.length > 0 && (
              <details>
                <summary className="cursor-pointer">Câmpurile nomenclatorului de puncte</summary>
                <ul className="mt-1 space-y-0.5">
                  {diagnostic.cheiPuncte.map((c) => <li key={c.cheie}><code>{c.cheie}</code>: {c.exemplu}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </Sectiune>

      {/*
        ⚠ Nu e o inlesnire: Innoship agrega ~230 de curieri. Nefiltrat, un cont
        larg poate intoarce zeci de oferte pentru aceeasi comanda, iar un checkout
        cu douazeci de randuri aproape identice nu se citeste.
      */}
      <Sectiune pas={2} titlu="Ce curieri vede cumpărătorul"
        descriere="Bifează curierii pe care vrei să-i vadă cumpărătorul. Nimic bifat înseamnă toți cei din contul tău, ceea ce, la un cont larg, poate umple pagina de comandă.">
        {curieri === null ? (
          <p className="text-sm text-muted-foreground">Apasă „Testează conexiunea” ca să se încarce lista.</p>
        ) : curieri.length === 0 ? (
          <p className="text-sm text-muted-foreground">Contul nu are niciun curier activ.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {curieri.map((c) => {
              const id = Number(c.courierId);
              const seSuprapune = lista.some((x) => x.courierIdInnoship === id);
              return (
                <label key={id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={permisi.includes(id)} onChange={() => comutaCurier(id)} />
                  <span className="flex-1">{c.courierDisplayName || c.courier}</span>
                  {seSuprapune && <span className="text-warning">îl ai și direct</span>}
                </label>
              );
            })}
          </div>
        )}
      </Sectiune>

      <Sectiune pas={3} titlu="Urmărirea coletelor">
        <Callout variant="info" icon={Info} title="Pune adresa asta în portalul Innoship">
          La „Track push”. Innoship trimite acolo fiecare schimbare de status, iar comenzile se mișcă singure. Fără ea,
          urmărirea merge tot, dar dintr-o verificare periodică, deci mai rar.
        </Callout>

        {urlWebhook ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">{urlWebhook}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void navigator.clipboard.writeText(urlWebhook); toast.success("Adresa a fost copiată."); }}
            >
              <Copy />
              Copiază
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Adresa apare după prima salvare a configurării.</p>
        )}
      </Sectiune>

      <Sectiune pas={4} titlu="Eticheta și serviciile">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format etichetă" htmlFor="innoship-format">
            <select id="innoship-format" value={format} onChange={(e) => setFormat(e.target.value as FormatEticheta)} className={selectCls}>
              {FORMATE.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Tip fișier" htmlFor="innoship-tip" hint="Zpl și Epl sunt pentru imprimante de etichete.">
            <select id="innoship-tip" value={tip} onChange={(e) => setTip(e.target.value as TipEticheta)} className={selectCls}>
              {TIPURI.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Observații pe etichetă" htmlFor="innoship-observatii" hint="Cel mult 500 de caractere.">
          <Input id="innoship-observatii" value={observatii} onChange={(e) => setObservatii(e.target.value)} maxLength={500} />
        </Field>

        <RandComutator separat titlu="Deschidere colet la livrare" text="Destinatarul poate verifica marfa înainte să plătească." activ={openPackage} onChange={setOpenPackage} />
        <RandComutator separat titlu="Livrare sâmbătă" text="Doar la curierii care o oferă în contractul tău." activ={saturday} onChange={setSaturday} />
        <RandComutator separat titlu="Retur de documente" text="Curierul aduce înapoi documentele semnate." activ={returDocumente} onChange={setReturDocumente} />
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheia și adresa de urmărire din Edinio. Comenzile cu AWB emis își păstrează numărul.">
          {/*
            ⚠ Adresa de urmarire se naste din `webhook_secret`, care traieste chiar in
            configul sters aici: la reconectare se genereaza alta, deci cea lipita in
            portalul Innoship ramane moarta pana o inlocuieste omul.
          */}
          <ButonDeconectare
            nume="Innoship"
            cePierzi="Cheia de API și adresa de urmărire se șterg din Edinio: la reconectare se face altă adresă, pe care o lipești din nou în portalul Innoship. Comenzile cu AWB emis își păstrează numărul."
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
