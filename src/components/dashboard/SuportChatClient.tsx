"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Copy, Cookie, Gauge, Loader2, MessageCircle, MessagesSquare, ShieldCheck, UserCheck } from "lucide-react";
import { deconecteazaSuport, salveazaSuport, verificaSuport, type CampSuport } from "@/lib/actions/suport.actions";
import {
  ASPECT_IMPLICIT, DATE_IMPLICITE, LUNGIME_TEXT_BUTON, SECRETUL_FURNIZORULUI, contPublic,
  type AspectSuport, type DateSuport, type FurnizorSuport, type RegiuneIntercom, type SuportConfig,
} from "@/lib/suport/config";
import { FURNIZORI, numeleFurnizorului, paragrafPolitica, scoateIdentificatorii } from "@/lib/suport/furnizori";
import { PLACEHOLDER_SECRET_SALVAT, secretulEsteSalvat } from "@/lib/integrari/secrete";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  AlegereCarduri, BaraSalvare, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator,
  Sectiune, ZonaDeconectare, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

/*
 * Pagina unui furnizor de chat (Tidio, tawk.to, Intercom, Zendesk). Una singura pentru toti patru: difera
 * doar identificatorul de lipit si felul in care se semneaza identitatea clientului.
 *
 * ⚠ Configurarea vine MASCATA: secretele goale, cu `_completate`. Un camp de secret lasat gol inseamna
 * „ramane cel salvat”, nu „sterge-l”.
 *
 * ⚠ Aici NU ajunge nimic de server: actiunile se cheama, nu se importa cod din `lib/suport/server`,
 * `semnaturi` sau `verifica`.
 *
 * Textele sunt pentru COMERCIANT: cu diacritice.
 */

export type SuportMascat = SuportConfig & { _completate?: Record<string, boolean> };

type Formular = {
  /** Ce e scris in campul identificatorului: valoarea, codul de instalare sau o adresa. */
  lipit: string;
  regiune: RegiuneIntercom;
  kid: string;
  /** Gol = ramane secretul salvat. */
  secret: string;
  activ: boolean;
  aspect: AspectSuport;
  date: DateSuport;
};

const TEXTE: Record<FurnizorSuport, {
  etichetaCheie: string;
  exemplu: string;
  etichetaSecret: string;
  undeESecretul: string;
}> = {
  tidio: {
    etichetaCheie: "Cheia publică Tidio",
    exemplu: "32 de litere și cifre, sau tot codul de instalare",
    etichetaSecret: "",
    undeESecretul: "",
  },
  tawkto: {
    etichetaCheie: "Property ID și Widget ID",
    exemplu: "Lipește „Direct Chat Link” sau codul widgetului",
    etichetaSecret: "Cheia „JavaScript API”",
    undeESecretul: "În tawk.to: Administration, apoi Overview. Copiază valoarea de la „JavaScript API Key”. O folosim doar pe server, ca să semnăm cine e clientul.",
  },
  intercom: {
    etichetaCheie: "Workspace ID",
    exemplu: "De exemplu abcd1234, sau adresa din browser",
    etichetaSecret: "Messenger API secret",
    undeESecretul: "În Intercom: Settings, apoi Workspace, apoi Security, fila Messenger. Generează cheia secretă și copiaz-o. O folosim doar pe server, ca să semnăm cine e clientul.",
  },
  zendesk: {
    etichetaCheie: "Cheia widgetului",
    exemplu: "Lipește codul de instalare sau valoarea de după „key=”",
    etichetaSecret: "Secretul cheii de semnare",
    undeESecretul: "În Admin Center: Account, apoi Security, apoi End user authentication, fila Messaging. Creează o cheie: primești un Key ID și un secret. Secretul se arată o singură dată.",
  },
};

/** Identificatorul salvat, in forma in care il recunoaste omul. */
function identificatorAfisat(furnizor: FurnizorSuport, c: SuportConfig | null): string {
  const conturi = c?.conturi ?? {};
  if (furnizor === "tidio") return conturi.tidio?.cheie ?? "";
  if (furnizor === "tawkto") {
    const { proprietate, widget } = conturi.tawkto ?? {};
    return proprietate && widget ? `${proprietate}/${widget}` : "";
  }
  if (furnizor === "intercom") return conturi.intercom?.app ?? "";
  return conturi.zendesk?.cheie ?? "";
}

/** Ce a lipit omul, adus la forma scurta cand se recunoaste un identificator in el. */
function formaScurta(furnizor: FurnizorSuport, lipit: string): string {
  const gasit = scoateIdentificatorii(furnizor, lipit);
  if (!gasit) return lipit.trim();
  if (furnizor === "tawkto") {
    const t = gasit as { proprietate?: string; widget?: string };
    return `${t.proprietate}/${t.widget}`;
  }
  if (furnizor === "intercom") return (gasit as { app?: string }).app ?? lipit.trim();
  return (gasit as { cheie?: string }).cheie ?? lipit.trim();
}

function dataScurta(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

export function SuportChatClient({
  businessId,
  furnizor,
  initial,
  pornit,
  bannerPornit,
  conturiPeDomeniu,
  areContactRapid,
  adresaMagazinului,
  eroareCitire,
}: {
  businessId: string;
  furnizor: FurnizorSuport;
  /** Configurarea mascata, sau `null` cand magazinul nu are inca niciuna. */
  initial: SuportMascat | null;
  /** Furnizorul al carui chat e acum in magazin (poate fi altul decat cel al paginii). */
  pornit: FurnizorSuport | null;
  /** Bannerul de cookie-uri al magazinului e pornit. */
  bannerPornit: boolean;
  /** Magazinul are conturi de client pornite, pe domeniul lui. */
  conturiPeDomeniu: boolean;
  /** Magazinul are deja butoane plutitoare de WhatsApp sau telefon. */
  areContactRapid: boolean;
  adresaMagazinului: string;
  eroareCitire: boolean;
}) {
  const router = useRouter();
  const nume = numeleFurnizorului(furnizor);
  const texte = TEXTE[furnizor];
  const campSecret = SECRETUL_FURNIZORULUI[furnizor];
  const secretSalvat = campSecret ? secretulEsteSalvat(initial, campSecret) : false;
  const configurat = contPublic(furnizor, initial?.conturi) !== null;
  const esteCelPornit = pornit === furnizor;

  const { cfg, setCfg, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<Formular>({
    lipit: identificatorAfisat(furnizor, initial),
    regiune: initial?.conturi?.intercom?.regiune ?? "us",
    kid: initial?.conturi?.zendesk?.kid ?? "",
    secret: "",
    activ: esteCelPornit,
    aspect: initial?.aspect ?? ASPECT_IMPLICIT,
    date: initial?.date ?? DATE_IMPLICITE,
  });
  const [saving, startSave] = useTransition();
  const [verifying, startVerify] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [campGresit, setCampGresit] = useState<CampSuport>(null);

  function set<K extends keyof Formular>(cheie: K, valoare: Formular[K]) {
    setCfg((c) => ({ ...c, [cheie]: valoare }));
    setCampGresit(null);
  }
  function setAspect<K extends keyof AspectSuport>(cheie: K, valoare: AspectSuport[K]) {
    setCfg((c) => {
      const aspect = { ...c.aspect, [cheie]: valoare };
      /* Butonul furnizorului exista numai dupa ce scriptul lui s-a incarcat. */
      if (aspect.buton === "furnizor") aspect.incarcare = "automat";
      return { ...c, aspect };
    });
  }
  function setDate<K extends keyof DateSuport>(cheie: K, valoare: DateSuport[K]) {
    setCfg((c) => ({ ...c, date: { ...c.date, [cheie]: valoare } }));
    setCampGresit(null);
  }

  const areSecret = !!cfg.secret.trim() || secretSalvat;
  const poateSemna = !campSecret || (areSecret && (furnizor !== "zendesk" || !!cfg.kid.trim()));

  function verifica() {
    if (!cfg.lipit.trim()) { setCampGresit("cheie"); toast.error(`Completează întâi: ${texte.etichetaCheie}.`); return; }
    startVerify(async () => {
      let r: Awaited<ReturnType<typeof verificaSuport>>;
      try {
        r = await verificaSuport(businessId, furnizor, { lipit: cfg.lipit, ...(furnizor === "intercom" ? { regiune: cfg.regiune } : {}) });
      } catch {
        toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
        return;
      }
      if ("error" in r) { setCampGresit(r.camp ?? null); toast.error(r.error); return; }
      if (r.avertisment) toast.warning(r.avertisment, { duration: 10000 });
      else toast.success(`${nume} recunoaște identificatorul.`);
    });
  }

  function save() {
    if (!cfg.lipit.trim()) { setCampGresit("cheie"); toast.error(`Completează întâi: ${texte.etichetaCheie}.`); return; }
    if (cfg.date.identitate && !poateSemna) {
      setCampGresit(furnizor === "zendesk" && areSecret ? "kid" : "secret");
      toast.error("Ca să trimiți numele și emailul clientului, completează cheia de semnare.");
      return;
    }
    startSave(async () => {
      let r: Awaited<ReturnType<typeof salveazaSuport>>;
      try {
        r = await salveazaSuport(businessId, furnizor, {
          lipit: cfg.lipit,
          ...(furnizor === "intercom" ? { regiune: cfg.regiune } : {}),
          ...(furnizor === "zendesk" ? { kid: cfg.kid } : {}),
          secret: cfg.secret,
          activ: cfg.activ,
          aspect: cfg.aspect,
          date: cfg.date,
        });
      } catch {
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă setările chatului s-au salvat. Reîmprospătează pagina ca să vezi cum au rămas, înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in r) { setCampGresit(r.camp ?? null); toast.error(r.error); return; }
      if (r.avertisment) toast.warning(r.avertisment, { duration: 10000 });
      else toast.success(cfg.activ ? `Chatul ${nume} este în magazin.` : `Setările ${nume} au fost salvate.`);
      marcheazaSalvat({ ...cfg, lipit: formaScurta(furnizor, cfg.lipit), secret: "" });
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      let r: Awaited<ReturnType<typeof deconecteazaSuport>>;
      try {
        r = await deconecteazaSuport(businessId, furnizor);
      } catch {
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă deconectarea s-a făcut. Reîmprospătează pagina și uită-te dacă mai apare conectat înainte să încerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`${nume} a fost deconectat.`);
      marcheazaSalvat({ ...cfg, lipit: "", kid: "", secret: "", activ: false });
      router.refresh();
    });
  }

  const copiaza = (v: string) => { navigator.clipboard?.writeText(v); toast.success("Copiat."); };

  const stari: StareAntet[] = !configurat
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : esteCelPornit
      ? [{ ton: "bun", text: "Activ în magazin" }]
      : pornit
        ? [{ ton: "neutru", text: "Oprit" }, { ton: "info", text: `În magazin e ${numeleFurnizorului(pornit)}` }]
        : [{ ton: "neutru", text: "Oprit" }];

  const verificatLa = dataScurta(initial?.verificat_la?.[furnizor]);
  const inlocuieste = cfg.activ && pornit !== null && pornit !== furnizor;
  const butonulLor = cfg.aspect.buton === "furnizor";

  return (
    <PaginaIntegrare
      id={furnizor}
      titlu="Chat în magazin"
      descriere={`Clienții îți scriu direct din magazin, iar tu le răspunzi din ${nume}, de pe calculator sau de pe telefon.`}
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="Chat în magazin" activ={cfg.activ} onChange={(v) => set("activ", v)}
        textPornit="Pornit" textOprit="Oprit" ariaLabel={`Pornește chatul ${nume} în magazin`} disabled={eroareCitire} />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: texte.etichetaCheie, facut: !!cfg.lipit.trim() },
          { text: "Chatul pornit în magazin", facut: configurat && esteCelPornit },
          ...(FURNIZORI[furnizor].semneaza ? [{ text: "Identitatea clientului, semnată", facut: cfg.date.identitate && poateSemna }] : []),
        ]} />
        <CumFunctioneaza id={furnizor} puncte={[
          { Icon: MessageCircle, text: "În magazin apare un buton de chat, pe toate paginile. Pe telefon stă deasupra barei de cumpărare." },
          { Icon: MessagesSquare, text: `Conversațiile le citești și le răspunzi în ${nume}, nu în Edinio.` },
          { Icon: Gauge, text: "Cu încărcarea „la prima apăsare”, chatul nu încetinește deloc magazinul." },
          { Icon: Cookie, text: bannerPornit
            ? "Bannerul de cookie-uri primește singur categoria „Funcționale”, cu numele furnizorului."
            : "Bannerul de cookie-uri al magazinului e oprit, deci chatul se deschide fără nicio întrebare." },
        ]} />
        <Panel className="p-4">
          <p className="text-sm font-semibold text-foreground">Unde răspunzi</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Mesajele ajung în contul tău {nume}. Instalează și aplicația lor de telefon, ca să nu pierzi niciun client.
          </p>
          <a href={FURNIZORI[furnizor].aplicatie} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
            Deschide {nume} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold text-foreground">Pentru Politica de confidențialitate</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{paragrafPolitica(furnizor, cfg.date.identitate)}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3"
            onClick={() => copiaza(paragrafPolitica(furnizor, cfg.date.identitate))}>
            <Copy /> Copiază textul
          </Button>
        </Panel>
      </>}
    >
      {eroareCitire && (
        <Callout variant="danger" title="Setările chatului nu s-au putut citi">
          Reîmprospătează pagina. Până atunci nu salva nimic, ca să nu se piardă ce era deja configurat.
        </Callout>
      )}

      {inlocuieste && (
        <Callout variant="warning" title={`Acum în magazin e chatul ${numeleFurnizorului(pornit!)}`}>
          Poate fi pornit un singur chat. Când salvezi, {nume} îi ia locul. Setările {numeleFurnizorului(pornit!)} rămân salvate.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Leagă contul" descriere={`Ai nevoie de un cont ${nume}. Identificatorul de mai jos e public: apare în pagina oricărui magazin care folosește ${nume}.`}>
        <Field label={texte.etichetaCheie} htmlFor="suport-cheie"
          error={campGresit === "cheie" ? "Verifică această valoare." : undefined}
          hint={verificatLa ? `Verificată la ${nume} pe ${verificatLa}.` : undefined}
          ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta={texte.etichetaCheie} text={FURNIZORI[furnizor].undeECheia} />}>
          <Input id="suport-cheie" type="text" value={cfg.lipit} spellCheck={false} autoComplete="off"
            aria-invalid={campGresit === "cheie"}
            onChange={(e) => set("lipit", e.target.value)}
            onBlur={() => { const scurt = formaScurta(furnizor, cfg.lipit); if (scurt !== cfg.lipit) set("lipit", scurt); }}
            placeholder={texte.exemplu} />
        </Field>

        {furnizor === "intercom" && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Regiunea spațiului Intercom</p>
            <AlegereCarduri<RegiuneIntercom>
              eticheta="Regiunea spațiului Intercom"
              valoare={cfg.regiune}
              onChange={(v) => set("regiune", v)}
              coloane={3}
              optiuni={[
                { valoare: "us", titlu: "SUA", text: "Intri pe app.intercom.com." },
                { valoare: "eu", titlu: "Europa", text: "Intri pe app.eu.intercom.com." },
                { valoare: "au", titlu: "Australia", text: "Intri pe app.au.intercom.com." },
              ]}
            />
          </div>
        )}

        {furnizor === "zendesk" && (
          <Callout variant="neutral" marime="mic">
            Lucrează cu widgetul de mesagerie Zendesk (Messaging), cel pe care îl primesc conturile de azi. „Web Widget
            (Classic)”, de pe conturile vechi, nu este acceptat: pentru el, creează un widget de mesagerie în Admin Center.
          </Callout>
        )}

        <div>
          <Button type="button" variant="outline" onClick={verifica} disabled={verifying || saving || eroareCitire}>
            {verifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Verifică la {nume}
          </Button>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Cum apare în magazin" descriere="Butonul de chat stă jos, pe toate paginile magazinului.">
        <AlegereCarduri<AspectSuport["buton"]>
          eticheta="Butonul de chat"
          valoare={cfg.aspect.buton}
          onChange={(v) => setAspect("buton", v)}
          optiuni={[
            {
              valoare: "magazin",
              titlu: "Butonul magazinului",
              text: areContactRapid
                ? "În culoarea magazinului. Stă deasupra barei de cumpărare și ține la un loc chatul, WhatsApp și telefonul."
                : "În culoarea magazinului. Pe telefon stă deasupra barei de cumpărare, nu peste ea.",
            },
            {
              valoare: "furnizor",
              titlu: `Butonul ${nume}`,
              text: "Cel desenat de furnizor. Pe telefon poate sta peste bara de cumpărare, iar poziția lui se reglează din contul tău de acolo.",
              avertizare: true,
            },
          ]}
        />

        {!butonulLor && (
          <>
            <AlegereCarduri<AspectSuport["pozitie"]>
              eticheta="Partea ecranului"
              valoare={cfg.aspect.pozitie}
              onChange={(v) => setAspect("pozitie", v)}
              optiuni={[
                { valoare: "dreapta", titlu: "Dreapta jos", text: "Locul în care îl caută cei mai mulți." },
                { valoare: "stanga", titlu: "Stânga jos", text: "Dacă în dreapta ai deja altceva." },
              ]}
            />
            <Field label="Text lângă buton (opțional)" htmlFor="suport-text"
              hint={`Apare pe calculator, lângă buton. Cel mult ${LUNGIME_TEXT_BUTON} de caractere.`}>
              <Input id="suport-text" type="text" value={cfg.aspect.text} maxLength={LUNGIME_TEXT_BUTON}
                onChange={(e) => setAspect("text", e.target.value)} placeholder="Ai nevoie de ajutor?" />
            </Field>
          </>
        )}

        <RandComutator separat titlu="Arată și pe telefon" text="Oprit, chatul apare doar pe calculator și pe tabletă."
          activ={cfg.aspect.pe_telefon} onChange={(v) => setAspect("pe_telefon", v)} />
        <RandComutator separat titlu="Arată și pe pagina de comandă" text="Acolo clientul are cele mai multe întrebări, dar și cea mai mare nevoie de liniște."
          activ={cfg.aspect.la_comanda} onChange={(v) => setAspect("la_comanda", v)} />

        <div className="space-y-1.5 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">Când se încarcă chatul</p>
          <AlegereCarduri<AspectSuport["incarcare"]>
            eticheta="Când se încarcă chatul"
            valoare={cfg.aspect.incarcare}
            onChange={(v) => { if (!butonulLor) setAspect("incarcare", v); }}
            optiuni={[
              {
                valoare: "apasare",
                titlu: "La prima apăsare",
                text: butonulLor
                  ? `Nu se poate cu butonul ${nume}: el apare abia după ce chatul s-a încărcat.`
                  : "Magazinul rămâne la fel de rapid. Chatul se încarcă atunci când clientul apasă pe buton.",
              },
              {
                valoare: "automat",
                titlu: "Automat",
                text: "Se încarcă singur, după ce pagina s-a afișat, la fiecare pagină deschisă. Alege-o dacă folosești mesaje automate sau vrei să vezi vizitatorii în timp real.",
              },
            ]}
          />
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Ce știe operatorul despre client" descriere={`Informațiile de mai jos apar lângă conversație, în ${nume}.`}>
        <RandComutator titlu="Pagina și produsul" text="Produsul la care se uită clientul și valoarea coșului. Fără date personale."
          activ={cfg.date.pagina} onChange={(v) => setDate("pagina", v)} />
        <RandComutator separat titlu="Comanda abia plasată" text="Numărul și valoarea comenzii, pe pagina de mulțumire."
          activ={cfg.date.comanda} onChange={(v) => setDate("comanda", v)} />
        <RandComutator separat titlu="Numele și emailul clientului cu cont"
          text={campSecret
            ? `Clientul intrat în cont nu mai completează nimic, iar tu știi cu cine vorbești. Datele ajung la ${nume}, semnate de server.`
            : `Clientul intrat în cont nu mai completează nimic, iar tu știi cu cine vorbești. Datele ajung la ${nume}.`}
          activ={cfg.date.identitate} onChange={(v) => setDate("identitate", v)} />

        {cfg.date.identitate && !conturiPeDomeniu && (
          <Callout variant="neutral" marime="mic">
            Clienții pot intra în cont doar pe domeniul propriu al magazinului, cu „Conturi de client” pornite din Setări.
            Până atunci, comutatorul de mai sus nu are efect.
          </Callout>
        )}

        {campSecret && (cfg.date.identitate || secretSalvat) && (
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            {furnizor === "zendesk" && (
              <Field label="Key ID" htmlFor="suport-kid" error={campGresit === "kid" ? "Verifică această valoare." : undefined}
                ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Key ID" text={texte.undeESecretul} />}>
                <Input id="suport-kid" type="text" value={cfg.kid} spellCheck={false} autoComplete="off"
                  aria-invalid={campGresit === "kid"} onChange={(e) => set("kid", e.target.value)} placeholder="app_..." />
              </Field>
            )}
            <Field label={texte.etichetaSecret} htmlFor="suport-secret" error={campGresit === "secret" ? "Verifică această valoare." : undefined}
              ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta={texte.etichetaSecret} text={texte.undeESecretul} />}>
              <Input id="suport-secret" type="password" value={cfg.secret} autoComplete="new-password"
                aria-invalid={campGresit === "secret"} onChange={(e) => set("secret", e.target.value)}
                placeholder={secretSalvat ? PLACEHOLDER_SECRET_SALVAT : "Lipește cheia secretă"} />
            </Field>
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
              <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
              Cheia rămâne pe server. Cu ea semnăm identitatea, ca nimeni să nu se poată da drept alt client al tău.
            </p>
          </div>
        )}
      </Sectiune>

      {configurat && (
        <ZonaDeconectare descriere={`Șterge identificatorul și cheia ${nume} din Edinio. Conversațiile din ${nume} rămân neatinse.`}>
          <ButonDeconectare
            nume={nume}
            cePierzi={`Identificatorul și cheia de semnare se șterg din Edinio${esteCelPornit ? ", iar butonul de chat dispare din magazin" : ""}. Conversațiile și contul tău ${nume} rămân neatinse. Ca să te întorci, lipești din nou identificatorul.`}
            pending={disconnecting}
            marime="default"
            onConfirma={disconnect}
          />
        </ZonaDeconectare>
      )}

      {configurat && esteCelPornit && (
        <p className="text-xs text-muted-foreground">
          <a href={adresaMagazinului} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
            Vezi butonul în magazin <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </p>
      )}

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={save} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
