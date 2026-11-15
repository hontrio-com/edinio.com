"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Info, KeyRound, ListChecks, Loader2, MapPin } from "lucide-react";
import {
  disconnectCuriera,
  saveCurieraConfig,
  testCurieraConnectionAction,
} from "@/lib/actions/curiera.actions";
import {
  curieraGata,
  SERVICIU_ADRESA_IMPLICIT,
  SERVICIU_PUNCT_IMPLICIT,
  type CurieraConfig,
  type DimensiuneEticheta,
  type DreptAnulare,
  type RezultatProbaCuriera,
  type ServiciuCuriera,
} from "@/lib/curiera/client";
import { JUDETE } from "@/lib/ro/judete";
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
import { aPropusCeva, type ExpeditorPropus } from "@/lib/curiera/precompletare";

/**
 * Configurarea Curiera.
 *
 * ⚠ „Testeaza conexiunea" NU se bizuie pe statusul HTTP: o cheie gresita sau lipsa
 * raspunde tot 200, cu `{status: "failed", error: "BAD_LOGIN"}` (masurat 29.09.2026).
 * Proba e pe server (`probaConexiuneCuriera`), e o citire pura, si nu salveaza nimic:
 * o cheie gresita tastata aici nu are voie sa o inlocuiasca pe cea buna.
 *
 * ⚠ Serviciile se aleg din lista CONTULUI, nu se scriu din cap: un serviciu gresit nu e
 * refuzat de Curiera, expedierea iese ciorna cu motivele in `errors`. Campul text
 * ramane doar pana la prima proba reusita.
 *
 * ⚠ Bannerul „activ" (singurul loc cu Deconectarea) cere doar `enabled` si cheia salvata.
 * Adresa incompleta are avertismentul ei separat: legata de banner, ar fi ascuns si
 * butonul de deconectare exact cand configurarea e pe jumatate (lectia eColet).
 */

const MARIMI: { valoare: DimensiuneEticheta; eticheta: string }[] = [
  { valoare: "a6", eticheta: "A6 (etichetă compactă, imprimante de etichete)" },
  { valoare: "a5", eticheta: "A5 (eticheta A6 mărită de Edinio)" },
  { valoare: "a4", eticheta: "A4 (foaie întreagă)" },
];

const TEXT_ANULARE: Record<DreptAnulare, string> = {
  oricand: "Cheia poate anula un AWB oricând, și după ridicare.",
  pana_la_ridicare: "Cheia poate anula un AWB doar până când curierul ridică coletul.",
  niciodata: "Cheia nu are dreptul să anuleze AWB-uri: anularea se cere din contul Curiera.",
  necunoscut: "Nu am putut afla ce drept de anulare are cheia.",
};

/**
 * Optiunile unui select de servicii: lista contului, plus valoarea deja aleasa daca nu e
 * in ea. Fara a doua parte, `<select>` ar arata alt serviciu decat cel salvat, iar prima
 * salvare l-ar schimba tacut (lectia formatului GLS).
 */
function optiuni(lista: ServiciuCuriera[], ales: string): ServiciuCuriera[] {
  if (!ales || lista.some((s) => s.id === ales)) return lista;
  return [...lista, { id: ales, nume: `${ales} (nu apare în lista contului)` }];
}

export function CurieraConfigClient({
  businessId,
  initialConfig,
  propunere = null,
}: {
  businessId: string;
  initialConfig: CurieraConfig | null;
  /** Adresa de ridicare din datele magazinului; vine numai cat timp nu e salvata niciuna. */
  propunere?: ExpeditorPropus | null;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [proba, setProba] = useState<RezultatProbaCuriera | null>(null);

  const [cheie, setCheie] = useState("");
  const e = initialConfig?.expeditor ?? {};
  /* Propunerea umple doar ce e gol; pagina o trimite numai cand nu e salvat niciun camp. */
  const p = propunere;
  const [nume, setNume] = useState((e.nume ?? "") || (p?.nume ?? ""));
  const [contact, setContact] = useState(e.persoana_contact ?? "");
  const [telefon, setTelefon] = useState((e.telefon ?? "") || (p?.telefon ?? ""));
  const [email, setEmail] = useState((e.email ?? "") || (p?.email ?? ""));
  const [adresa, setAdresa] = useState((e.adresa ?? "") || (p?.adresa ?? ""));
  const [oras, setOras] = useState((e.oras ?? "") || (p?.oras ?? ""));
  const [judet, setJudet] = useState((e.judet ?? "") || (p?.judet ?? ""));
  const [codPostal, setCodPostal] = useState(e.cod_postal ?? "");

  const [serviciuAdresa, setServiciuAdresa] = useState(
    (initialConfig?.serviciu_adresa ?? "").trim() || SERVICIU_ADRESA_IMPLICIT,
  );
  const [serviciuPunct, setServiciuPunct] = useState(
    (initialConfig?.serviciu_punct ?? "").trim() || SERVICIU_PUNCT_IMPLICIT,
  );
  const [lockere, setLockere] = useState(initialConfig?.lockere === true);
  const [extra, setExtra] = useState<string[]>(initialConfig?.servicii_extra ?? []);
  const [asigurare, setAsigurare] = useState(initialConfig?.asigurare === true);
  const [marime, setMarime] = useState<DimensiuneEticheta>(initialConfig?.dimensiune_eticheta ?? "a6");
  const [continut, setContinut] = useState(initialConfig?.continut_implicit ?? "");

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    cheie, nume, contact, telefon, email, adresa, oras, judet, codPostal, serviciuAdresa, serviciuPunct, lockere, extra,
    asigurare, marime, continut,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setCheie(reper.cheie); setNume(reper.nume); setContact(reper.contact); setTelefon(reper.telefon); setEmail(reper.email);
    setAdresa(reper.adresa); setOras(reper.oras); setJudet(reper.judet); setCodPostal(reper.codPostal);
    setServiciuAdresa(reper.serviciuAdresa); setServiciuPunct(reper.serviciuPunct); setLockere(reper.lockere);
    setExtra(reper.extra); setAsigurare(reper.asigurare); setMarime(reper.marime); setContinut(reper.continut);
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const areCheie = cheie.trim() !== "" || cheieSalvata;
  const isActive = !!(initialConfig?.enabled && cheieSalvata);
  /*
   * ⚠ `curieraGata` insasi, ca bulina din hub, Setari si checkout sa spuna acelasi lucru ca
   * pagina asta. Cheia e mascata in browser (soseste goala), deci prezenta ei s-a citit mai
   * sus din `_completate`; aici functia raspunde doar pentru restul regulii.
   */
  const adresaIncompleta = isActive && !curieraGata({ ...initialConfig!, api_key: "salvata" });

  /* Cele bifate deja raman in lista si inainte de proba, ca sa poata fi scoase. */
  const listaExtra = proba?.extra ?? [];
  const extraDeAratat: ServiciuCuriera[] = [
    ...listaExtra,
    ...extra.filter((id) => !listaExtra.some((s) => s.id === id)).map((id) => ({ id, nume: `Serviciul ${id}` })),
  ];

  const judeteDeAles: string[] = judet && !(JUDETE as readonly string[]).includes(judet)
    ? [...JUDETE, judet]
    : [...JUDETE];

  function construieste(): CurieraConfig {
    return {
      enabled: true,
      /* Gol = „n-am schimbat"; serverul pastreaza cheia salvata. */
      api_key: cheie.trim(),
      expeditor: {
        nume: nume.trim(),
        persoana_contact: contact.trim(),
        telefon: telefon.trim(),
        email: email.trim(),
        adresa: adresa.trim(),
        oras: oras.trim(),
        judet: judet.trim(),
        cod_postal: codPostal.trim(),
      },
      serviciu_adresa: serviciuAdresa.trim() || SERVICIU_ADRESA_IMPLICIT,
      serviciu_punct: serviciuPunct.trim() || SERVICIU_PUNCT_IMPLICIT,
      lockere,
      servicii_extra: extra,
      asigurare,
      dimensiune_eticheta: marime,
      continut_implicit: continut.trim(),
    };
  }

  async function handleTest() {
    if (!areCheie) return toast.error("Completează cheia API din contul Curiera.");
    /* ⚠ Doar cheia pleaca la proba, si NIMIC nu se salveaza: o cheie gresita tastata aici
       nu are voie sa o inlocuiasca pe cea buna. Gol = cheia salvata, rezolvata pe server. */
    setTesting(true);
    let r: Awaited<ReturnType<typeof testCurieraConnectionAction>>;
    try {
      r = await testCurieraConnectionAction(businessId, cheie.trim());
    } catch (err) {
      setProba(null);
      toast.error("Curiera nu a răspuns: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setTesting(false);
    }

    if (!r.ok) {
      setProba(null);
      toast.error(`Curiera: ${r.error}`, { duration: 10000 });
      return;
    }
    setProba(r.proba);
    toast.success(`Conectat la Curiera${r.proba.firma ? `: ${r.proba.firma}` : ""}.`);
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completează cheia API.");
    /* ⚠ Aceleasi campuri ca `curieraGata`: fara oricare, Curiera pune expedierea in
       ciorna („Lipseste orasul expeditorului"), deci configurarea n-ar emite nimic. */
    if (!nume.trim() || !adresa.trim() || !oras.trim() || !judet.trim()) {
      return toast.error("Completează adresa de ridicare: nume, adresă, oraș și județ.");
    }
    if (!telefon.trim()) return toast.error("Telefonul de la ridicare e obligatoriu.");

    setSaving(true);
    let r: Awaited<ReturnType<typeof saveCurieraConfig>>;
    try {
      r = await saveCurieraConfig(businessId, construieste());
    } catch (err) {
      toast.error("Configurarea nu s-a putut salva: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setSaving(false);
    }

    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea Curiera a fost salvată.");
    setCheie("");
    setReper({ ...valori, cheie: "" });
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    let r: Awaited<ReturnType<typeof disconnectCuriera>>;
    try {
      r = await disconnectCuriera(businessId);
    } catch (err) {
      toast.error("Deconectarea nu s-a putut face: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setDisconnecting(false);
    }

    if ("error" in r) return toast.error(r.error);
    toast.success("Curiera a fost deconectat.");
    setProba(null);
    router.refresh();
  }

  function comutaExtra(id: string) {
    setExtra((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [adresaIncompleta ? { ton: "rau", text: "Adresă incompletă" } : { ton: "bun", text: "Activ" }];

  return (
    <PaginaIntegrare
      id="curiera"
      titlu="Livrare"
      descriere="Generezi AWB-uri Curiera din comenzi, cu ramburs, livrare la adresă sau în lockere FANbox, și urmărirea coletului."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia API", facut: areCheie },
          { text: "Adresa de ridicare", facut: !!(nume.trim() && adresa.trim() && oras.trim() && judet.trim() && telefon.trim()) },
          { text: "Curiera activ", facut: isActive && !adresaIncompleta },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Ridicare din", valoare: [initialConfig?.expeditor?.oras, initialConfig?.expeditor?.judet].filter(Boolean).join(", ") || "necompletată" },
            { eticheta: "Lockere la comandă", valoare: initialConfig?.lockere ? "da" : "nu" },
          ]} />
        )}
        <CumFunctioneaza id="curiera" puncte={[
          { Icon: KeyRound, text: "Cheia API o găsești în contul tău Curiera sau o ceri de la ei. E singura credențială." },
          { Icon: MapPin, text: "Adresa de ridicare pleacă la fiecare AWB; fără ea, Curiera pune expedierea în ciornă." },
          { Icon: ListChecks, text: "Serviciile se aleg din lista contului, după „Testează conexiunea”: unul scris greșit face emiterea să fie refuzată." },
        ]} />
      </>}
    >
      {adresaIncompleta && (
        <Callout variant="warning" icon={AlertTriangle} title="Adresa de ridicare e incompletă">
          Fără nume, telefon, adresă, oraș și județ, Curiera pune fiecare expediere în ciornă și nu o ridică. Până le completezi,
          Curiera nu apare la comandă și nu se pot emite AWB-uri.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Cheia API"
        descriere="O găsești în contul tău Curiera sau o ceri de la Curiera. E singura credențială: cine o are poate emite și anula AWB-uri pe contul tău.">
        <Field label="Cheia API" htmlFor="curiera-cheie" required>
          <Input
            id="curiera-cheie"
            type="password"
            value={cheie}
            onChange={(ev) => { setCheie(ev.target.value); setProba(null); }}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "Cheia API din contul Curiera"}
          />
        </Field>

        <div>
          <Button variant="outline" onClick={handleTest} disabled={testing || !areCheie}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifică..." : "Testează conexiunea"}
          </Button>
        </div>

        {proba && (
          <Callout variant="success" icon={CheckCircle} title="Conectat la Curiera">
            {proba.firma && <span className="block text-foreground">{proba.firma}</span>}
            {proba.client && <span className="block">Cont client: {proba.client}</span>}
            <span className="block">{TEXT_ANULARE[proba.anulare]}</span>
          </Callout>
        )}

        {/*
          ⚠ Proba nu salveaza nimic (o cheie gresita nu are voie sa o inlocuiasca pe cea buna),
          deci dupa o proba reusita se spune pe fata ca nu s-a pastrat nimic. Altfel un refresh
          pierde tot, iar butonul de AWB nu apare la comenzi (cerut de el, 29.09.2026).
        */}
        {proba && !isActive && (
          <Callout variant="info" icon={Info}>
            Cheia merge, dar nimic nu e salvat încă. Completează adresa de ridicare de la pasul 2 și apasă „Salvează”, jos. Până
            atunci Curiera nu apare la comenzi și nici la comandă.
          </Callout>
        )}
        {proba && isActive && cheie.trim() !== "" && (
          <Callout variant="info" icon={Info}>Cheia nouă merge, dar nu e salvată: până apeși „Salvează”, rămâne cea veche.</Callout>
        )}

        {/* ⚠ O cheie de angajat raspunde la proba, dar emiterea ar cere si contul clientului. */}
        {proba?.cheieDeClient === false && (
          <Callout variant="warning" icon={AlertTriangle}>
            Cheia nu aparține unui cont de client Curiera, deci emiterea AWB-urilor nu va merge. Folosește cheia contului tău de
            client (o găsești în contul Curiera sau o ceri de la ei).
          </Callout>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de ridicare"
        descriere="De aici ridică Curiera coletele. Se trimite la fiecare AWB; diacriticele se scot la trimitere, fiindcă pe eticheta lor ar ieși semne de întrebare.">
        {/* ⚠ De la Curiera nu vine nicio adresa (vezi `precompletare.ts`), deci sursa e magazinul. */}
        {aPropusCeva(propunere) && (
          <Callout variant="info" icon={Info}>
            Am completat ce știam din datele magazinului (Setări). Verifică-le: aici trebuie adresa de unde ridică Curiera coletele,
            iar ce lipsește completezi tu.
          </Callout>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nume expeditor" required>
            <Input value={nume} onChange={(ev) => setNume(ev.target.value)} placeholder="Magazinul Meu SRL" />
          </Field>
          <Field label="Persoana de contact">
            <Input value={contact} onChange={(ev) => setContact(ev.target.value)} placeholder="Andrei" />
          </Field>
          <Field label="Telefon" required>
            <Input value={telefon} onChange={(ev) => setTelefon(ev.target.value)} placeholder="0722000000" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="depozit@magazin.ro" />
          </Field>
          <Field label="Adresa (stradă, număr, bloc)" required className="sm:col-span-2">
            <Input value={adresa} onChange={(ev) => setAdresa(ev.target.value)} placeholder="Strada Eroilor nr. 12, bl. A2" />
          </Field>
          <Field label="Oraș" required>
            <Input value={oras} onChange={(ev) => setOras(ev.target.value)} placeholder="Cluj-Napoca" />
          </Field>
          <Field label="Județ" htmlFor="curiera-judet" required>
            <select id="curiera-judet" value={judet} onChange={(ev) => setJudet(ev.target.value)} className={selectCls}>
              <option value="">Alege județul</option>
              {judeteDeAles.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </Field>
          <Field label="Cod poștal">
            <Input value={codPostal} onChange={(ev) => setCodPostal(ev.target.value)} placeholder="400129" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Servicii și etichetă">
        {!proba && (
          <Callout variant="info" icon={Info}>
            Apasă „Testează conexiunea” ca să alegi serviciile din lista contului tău. Un serviciu scris greșit face ca emiterea să
            fie refuzată (Curiera nu îl respinge pe loc, deci l-ai afla abia la primul AWB). Alege-l din listă.
          </Callout>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serviciul pentru livrarea la adresă">
            {proba && proba.servicii.length > 0 ? (
              <select aria-label="Serviciul pentru livrarea la adresă" value={serviciuAdresa} onChange={(ev) => setServiciuAdresa(ev.target.value)} className={selectCls}>
                {optiuni(proba.servicii, serviciuAdresa).map((s) => (
                  <option key={s.id} value={s.id}>{s.nume}</option>
                ))}
              </select>
            ) : (
              <Input value={serviciuAdresa} onChange={(ev) => setServiciuAdresa(ev.target.value)} placeholder={SERVICIU_ADRESA_IMPLICIT} />
            )}
          </Field>
          <Field label="Serviciul pentru livrarea la locker">
            {proba && proba.servicii.length > 0 ? (
              <select aria-label="Serviciul pentru livrarea la locker" value={serviciuPunct} onChange={(ev) => setServiciuPunct(ev.target.value)} className={selectCls}>
                {optiuni(proba.servicii, serviciuPunct).map((s) => (
                  <option key={s.id} value={s.id}>{s.nume}</option>
                ))}
              </select>
            ) : (
              <Input value={serviciuPunct} onChange={(ev) => setServiciuPunct(ev.target.value)} placeholder={SERVICIU_PUNCT_IMPLICIT} />
            )}
          </Field>
        </div>
        {proba && !proba.serviciiCitite && (
          <p className="text-xs text-muted-foreground">
            Lista serviciilor nu s-a putut citi acum, deci câmpurile rămân de scris de mână. Mai apasă o dată „Testează conexiunea”.
          </p>
        )}

        <RandComutator
          separat
          titlu="Oferă la comandă livrarea la locker sau punct de ridicare"
          text="Cumpărătorul își alege un locker FANbox, un punct de ridicare sau un oficiu FAN (rețeaua de puncte a Curiera). Prețul e cel fix din Setări, Livrare; rambursul merge și la punct."
          activ={lockere}
          onChange={setLockere}
        />

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Servicii extra puse pe fiecare AWB</p>
          {extraDeAratat.length > 0 ? (
            <div className="space-y-1">
              {extraDeAratat.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-border accent-primary"
                    checked={extra.includes(s.id)}
                    onChange={() => comutaExtra(s.id)}
                  />
                  <span>{s.nume}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {/* ⚠ O lista PICATA nu e o lista goala: „contul nu are" ar fi o afirmatie falsa. */}
              {!proba
                ? "Lista apare după „Testează conexiunea”."
                : proba.extraCitite
                  ? "Contul nu are servicii extra."
                  : "Lista serviciilor extra nu s-a putut citi acum. Mai apasă o dată „Testează conexiunea”."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Se plătesc per colet, deci pornesc nebifate. Cele bifate aici vin bifate pe fiecare AWB, și le poți scoate la un AWB anume.
          </p>
        </div>

        <RandComutator
          separat
          titlu="Declară valoarea comenzii ca asigurare"
          text="Fereastra de AWB precompletează asigurarea cu totalul comenzii. Curiera o facturează separat."
          activ={asigurare}
          onChange={setAsigurare}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Mărimea etichetei"
            htmlFor="curiera-marime"
            hint={marime === "a5"
              ? "Curiera nu face A5: Edinio ia eticheta A6 și o mărește pe A5, cu tot cu codul de bare. Tipărește una și verifică dacă se scanează înainte să trimiți colete."
              : undefined}
          >
            <select id="curiera-marime" value={marime} onChange={(ev) => setMarime(ev.target.value as DimensiuneEticheta)} className={selectCls}>
              {MARIMI.map((m) => <option key={m.valoare} value={m.valoare}>{m.eticheta}</option>)}
            </select>
          </Field>
          <Field label="Conținut implicit" htmlFor="curiera-continut" hint="Apare pe AWB când comanda nu dă unul mai bun.">
            <Input id="curiera-continut" value={continut} onChange={(ev) => setContinut(ev.target.value)} placeholder="Produse" maxLength={255} />
          </Field>
        </div>
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheia și setările Curiera din Edinio. AWB-urile deja emise rămân pe comenzi.">
          <ButonDeconectare
            nume="Curiera"
            cePierzi="Se șterge toată configurarea Curiera din Edinio: cheia API, adresa de ridicare și serviciile alese. Cheia nu se mai poate citi din Edinio, deci ca să te întorci o iei din nou din contul Curiera. AWB-urile deja emise rămân pe comenzi."
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
