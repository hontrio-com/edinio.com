"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, ChevronRight, Info, KeyRound, Loader2, RefreshCw, Search, Wallet } from "lucide-react";
import {
  cautaLocalitatiEpacketAction,
  codPostalRidicareEpacketAction,
  disconnectEpacket,
  saveEpacketConfig,
  testEpacketConnectionAction,
} from "@/lib/actions/epacket.actions";
import {
  CURIERI_CU_PUNCTE,
  CURIERI_DE_TEST,
  CURIERI_EPACKET,
  DIMENSIUNI_IMPLICITE,
  NUME_CURIER_EPACKET,
  eCheieDeTest,
  epacketGata,
  numeBun,
  type CurierCuPuncte,
  type CurierEpacket,
  type EpacketConfig,
  type LocalitateEpacket,
  type RezultatProbaEpacket,
} from "@/lib/epacket/client";
import { KG_MAXIM_PUNCT } from "@/lib/epacket/expediere";
import { despartaAdresa } from "@/lib/epacket/adresa";
import { EXPLICATIE_CLASIFICARE, STARI } from "@/lib/epacket/statusuri";
import { JUDETE, codAutoAlJudetului } from "@/lib/ro/judete";
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
 * Configurarea e-packet.
 *
 * ⚠ Localitatea de ridicare se ALEGE din nomenclatorul lor (`locality_id`), nu se scrie: un nume
 * scris de mana nu se poate trimite. Codul postal se propune din punctele localitatii.
 *
 * ⚠ „Testeaza conexiunea" e o citire AUTENTIFICATA (fara cheie buna: 401) si nu salveaza nimic.
 *
 * ⚠ Bannerul „activ" (singurul loc cu Deconectarea) cere doar `enabled` si cheia salvata; adresa
 * incompleta are avertismentul ei (lectia eColet: legata de banner, ar fi ascuns deconectarea).
 */

/** Judetele formularului, cu codul lor (B, CJ...), in ordinea listei casei. */
const JUDETE_CU_COD = JUDETE.map((j) => ({ nume: j, cod: codAutoAlJudetului(j) ?? "" })).filter((j) => j.cod);

function nr(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function EpacketConfigClient({
  businessId,
  initialConfig,
  propunere = null,
}: {
  businessId: string;
  initialConfig: EpacketConfig | null;
  propunere?: ExpeditorPropus | null;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [proba, setProba] = useState<RezultatProbaEpacket | null>(null);

  const [cheie, setCheie] = useState("");
  const e = initialConfig?.expeditor ?? {};
  const p = propunere;
  /* Strada propusa din magazin, despartita in campurile lor. */
  const adresaPropusa = despartaAdresa(p?.adresa ?? "");
  const [prenume, setPrenume] = useState(e.prenume ?? "");
  const [nume, setNume] = useState(e.nume ?? "");
  const [firma, setFirma] = useState((e.firma ?? "") || (p?.nume ?? ""));
  const [telefon, setTelefon] = useState((e.telefon ?? "") || (p?.telefon ?? ""));
  const [email, setEmail] = useState((e.email ?? "") || (p?.email ?? ""));
  const [localitate, setLocalitate] = useState<{ id: number; nume: string } | null>(
    e.localitate_id ? { id: e.localitate_id, nume: e.localitate_nume ?? `Localitatea ${e.localitate_id}` } : null,
  );
  const [cautare, setCautare] = useState(p?.oras ?? "");
  const [judet, setJudet] = useState(codAutoAlJudetului(p?.judet) ?? "");
  const [rezultate, setRezultate] = useState<LocalitateEpacket[] | null>(null);
  const [caut, setCaut] = useState(false);
  const [codPostal, setCodPostal] = useState((e.cod_postal ?? "") || adresaPropusa.codPostal);
  const [strada, setStrada] = useState((e.strada ?? "") || adresaPropusa.strada);
  const [numar, setNumar] = useState((e.numar ?? "") || adresaPropusa.numar);
  const [bloc, setBloc] = useState((e.bloc ?? "") || adresaPropusa.bloc);
  const [scara, setScara] = useState((e.scara ?? "") || adresaPropusa.scara);
  const [etaj, setEtaj] = useState((e.etaj ?? "") || adresaPropusa.etaj);
  const [apartament, setApartament] = useState((e.apartament ?? "") || adresaPropusa.apartament);

  const r = initialConfig?.ramburs ?? {};
  const [titular, setTitular] = useState(r.titular ?? "");
  const [iban, setIban] = useState(r.iban ?? "");
  const [banca, setBanca] = useState(r.banca ?? "");

  const [curierAdresa, setCurierAdresa] = useState<CurierEpacket>(initialConfig?.curier_adresa ?? "DPD");
  const [lockere, setLockere] = useState(initialConfig?.lockere === true);
  const [curierPuncte, setCurierPuncte] = useState<CurierCuPuncte>(initialConfig?.curier_puncte ?? "SDY");
  const d = initialConfig?.dimensiuni_implicite ?? DIMENSIUNI_IMPLICITE;
  const [lungime, setLungime] = useState(String(d.lungime));
  const [latime, setLatime] = useState(String(d.latime));
  const [inaltime, setInaltime] = useState(String(d.inaltime));
  const [asigurare, setAsigurare] = useState(initialConfig?.asigurare === true);
  const [deschidere, setDeschidere] = useState(initialConfig?.deschidere_colet === true);
  const [marime, setMarime] = useState<"A4" | "A6">(initialConfig?.dimensiune_eticheta === "A4" ? "A4" : "A6");
  const [continut, setContinut] = useState(initialConfig?.continut_implicit ?? "");

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    cheie, prenume, nume, firma, telefon, email, localitate, codPostal, strada, numar, bloc, scara, etaj, apartament,
    titular, iban, banca, curierAdresa, lockere, curierPuncte, lungime, latime, inaltime, asigurare, deschidere, marime, continut,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setCheie(reper.cheie); setPrenume(reper.prenume); setNume(reper.nume); setFirma(reper.firma); setTelefon(reper.telefon);
    setEmail(reper.email); setLocalitate(reper.localitate); setCodPostal(reper.codPostal); setStrada(reper.strada);
    setNumar(reper.numar); setBloc(reper.bloc); setScara(reper.scara); setEtaj(reper.etaj); setApartament(reper.apartament);
    setTitular(reper.titular); setIban(reper.iban); setBanca(reper.banca); setCurierAdresa(reper.curierAdresa);
    setLockere(reper.lockere); setCurierPuncte(reper.curierPuncte); setLungime(reper.lungime); setLatime(reper.latime);
    setInaltime(reper.inaltime); setAsigurare(reper.asigurare); setDeschidere(reper.deschidere); setMarime(reper.marime);
    setContinut(reper.continut);
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const areCheie = cheie.trim() !== "" || cheieSalvata;
  const isActive = !!(initialConfig?.enabled && cheieSalvata);
  /* ⚠ `epacketGata` insasi: bulina din hub, Setari si checkout spun acelasi lucru ca pagina. */
  const adresaIncompleta = isActive && !epacketGata({ ...initialConfig!, api_key: "salvata" });
  /* Cheia de TEST: din proba, sau din ce s-a scris acum. Cea salvata e mascata, deci nu se stie. */
  const deTest = proba?.test ?? (cheie.trim() ? eCheieDeTest(cheie) : null);

  function construieste(): EpacketConfig {
    return {
      enabled: true,
      /* Gol = „n-am schimbat"; serverul pastreaza cheia salvata. */
      api_key: cheie.trim(),
      expeditor: {
        prenume: prenume.trim(), nume: nume.trim(), firma: firma.trim(),
        telefon: telefon.trim(), email: email.trim(),
        localitate_id: localitate?.id ?? null, localitate_nume: localitate?.nume ?? "",
        cod_postal: codPostal.trim(), strada: strada.trim(), numar: numar.trim(),
        bloc: bloc.trim(), scara: scara.trim(), etaj: etaj.trim(), apartament: apartament.trim(),
      },
      ramburs: { titular: titular.trim(), iban: iban.trim(), banca: banca.trim() },
      curier_adresa: curierAdresa,
      lockere,
      curier_puncte: curierPuncte,
      dimensiuni_implicite: { lungime: nr(lungime), latime: nr(latime), inaltime: nr(inaltime) },
      asigurare,
      deschidere_colet: deschidere,
      dimensiune_eticheta: marime,
      continut_implicit: continut.trim(),
    };
  }

  async function handleTest() {
    if (!areCheie) return toast.error("Completează cheia API primită de la e-packet.");
    setTesting(true);
    let res: Awaited<ReturnType<typeof testEpacketConnectionAction>>;
    try {
      res = await testEpacketConnectionAction(businessId, cheie.trim());
    } catch (err) {
      setProba(null);
      toast.error("e-packet nu a răspuns: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setTesting(false);
    }
    if (!res.ok) {
      setProba(null);
      toast.error(res.error, { duration: 10000 });
      return;
    }
    setProba(res.proba);
    toast.success(res.proba.test ? "Conectat la e-packet (cheie de TEST)" : "Conectat la e-packet");
  }

  async function handleCauta() {
    if (cautare.trim().length < 2) return toast.error("Scrie cel puțin două litere din numele localității.");
    if (!judet) return toast.error("Alege județul.");
    if (!areCheie) return toast.error("Completează întâi cheia API.");
    setCaut(true);
    let res: Awaited<ReturnType<typeof cautaLocalitatiEpacketAction>>;
    try {
      res = await cautaLocalitatiEpacketAction(businessId, cautare.trim(), judet, cheie.trim());
    } catch (err) {
      toast.error("Căutarea nu a mers: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setCaut(false);
    }
    if (!res.ok) return toast.error(res.error);
    setRezultate(res.localitati);
    if (res.localitati.length === 0) toast.error("e-packet nu are nicio localitate cu numele acesta în județ.");
  }

  async function alege(l: LocalitateEpacket) {
    setLocalitate({ id: l.id, nume: l.afisare });
    setRezultate(null);
    /* Codul postal se propune numai cand e gol: unul scris de om e al lui. */
    if (codPostal.trim()) return;
    try {
      const res = await codPostalRidicareEpacketAction(businessId, l.id, cheie.trim());
      if (res.ok && res.cod) setCodPostal(res.cod);
    } catch {
      /* Propunerea e o politete: fara ea, omul scrie codul. */
    }
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completează cheia API.");
    /* ⚠ Aceleasi campuri ca `epacketGata`: fara oricare, fiecare AWB ar fi refuzat (422). */
    if (!numeBun(prenume) || !numeBun(nume)) return toast.error("Prenumele și numele de la ridicare au câte 3-25 de litere.");
    if (!telefon.trim() || !email.trim()) return toast.error("Telefonul și emailul de la ridicare sunt obligatorii.");
    if (!localitate) return toast.error("Alege localitatea de ridicare din lista e-packet.");
    if (!/^\d{6}$/.test(codPostal.trim())) return toast.error("Codul poștal de ridicare are exact 6 cifre.");
    if (!strada.trim() || !numar.trim()) return toast.error("Strada și numărul de la ridicare sunt obligatorii (scrie FN dacă nu are număr).");
    if ([lungime, latime, inaltime].some((v) => !(nr(v) >= 1 && nr(v) <= 300))) {
      return toast.error("Dimensiunile implicite ale coletului sunt între 1 și 300 cm.");
    }

    setSaving(true);
    let res: Awaited<ReturnType<typeof saveEpacketConfig>>;
    try {
      res = await saveEpacketConfig(businessId, construieste());
    } catch (err) {
      toast.error("Configurarea nu s-a putut salva: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setSaving(false);
    }
    if ("error" in res) return toast.error(res.error);
    toast.success("Configurarea e-packet a fost salvată.");
    setCheie("");
    setReper({ ...valori, cheie: "" });
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    let res: Awaited<ReturnType<typeof disconnectEpacket>>;
    try {
      res = await disconnectEpacket(businessId);
    } catch (err) {
      toast.error("Deconectarea nu s-a putut face: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capăt"));
      return;
    } finally {
      setDisconnecting(false);
    }
    if ("error" in res) return toast.error(res.error);
    toast.success("e-packet a fost deconectat.");
    setProba(null);
    router.refresh();
  }

  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      adresaIncompleta ? { ton: "rau", text: "Adresă incompletă" } : { ton: "bun", text: "Activ" },
      ...(deTest === true ? [{ ton: "asteptare" as const, text: "Cheie de test" }] : []),
    ];

  return (
    <PaginaIntegrare
      id="epacket"
      titlu="Livrare"
      descriere="Un singur cont și un singur credit pentru DPD, Sameday, Cargus, FAN Courier, Dragon Star și TCE: AWB-uri din comenzi, la adresă sau la locker, cu ramburs și tarife pe loc."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia API", facut: areCheie },
          { text: "Localitatea de ridicare", facut: !!localitate },
          { text: "Adresa de ridicare completă", facut: !!(numeBun(prenume) && numeBun(nume) && telefon.trim() && email.trim() && localitate && /^\d{6}$/.test(codPostal.trim()) && strada.trim() && numar.trim()) },
          { text: "e-packet activ", facut: isActive && !adresaIncompleta },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Ridicare din", valoare: initialConfig?.expeditor?.localitate_nume || "necompletată" },
            { eticheta: "La adresă prin", valoare: NUME_CURIER_EPACKET[initialConfig?.curier_adresa ?? "DPD"] },
            { eticheta: "La locker prin", valoare: initialConfig?.lockere ? NUME_CURIER_EPACKET[initialConfig?.curier_puncte ?? "SDY"] : "fără lockere" },
          ]} />
        )}
        <CumFunctioneaza id="epacket" puncte={[
          { Icon: KeyRound, text: "Cheile le emite e-packet la cerere (contact@e-packet.ro). Cu o cheie de test merg doar DPD și Sameday, fără taxare." },
          { Icon: Wallet, text: "Fiecare AWB se taxează din creditul e-packet; sub 20 de lei credit, emiterea e refuzată." },
          { Icon: Ban, text: "AWB-urile nu se pot anula din Edinio: anularea se cere la e-packet." },
          { Icon: RefreshCw, text: "Starea coletului se citește la două ore și mută comanda singură." },
        ]} />
      </>}
    >
      {adresaIncompleta && (
        <Callout variant="warning" icon={AlertTriangle} title="Adresa de ridicare e incompletă">
          Fără prenume, nume, telefon, email, localitate, cod poștal, stradă și număr, e-packet refuză fiecare AWB. Până le
          completezi, e-packet nu apare la comandă și nu se pot emite AWB-uri.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Cheia API"
        descriere="Cheile se emit la cerere de e-packet (contact@e-packet.ro). E singura credențială: cine o are emite AWB-uri plătite din creditul tău.">
        <Field label="Cheia API" htmlFor="epacket-cheie" required
          hint="Cu o cheie de test (epk_test_) merg doar DPD și Sameday, în mediul lor de test: AWB-urile nu pleacă la curier și nu se taxează.">
          <Input
            id="epacket-cheie"
            type="password"
            value={cheie}
            onChange={(ev) => { setCheie(ev.target.value); setProba(null); }}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "epk_live_… sau epk_test_…"}
          />
        </Field>
        <div>
          <Button variant="outline" onClick={handleTest} disabled={testing || !areCheie}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifică..." : "Testează conexiunea"}
          </Button>
        </div>
        {proba && (
          <Callout variant="success" icon={CheckCircle} title="Conectat la e-packet">
            {proba.test
              ? "Cheie de TEST: AWB-urile se fac în mediul de test DPD și Sameday, nu pleacă la nimeni și nu se taxează."
              : "Cheie LIVE: fiecare AWB e real și se taxează din credit (minim 20 de lei în cont)."}
          </Callout>
        )}
        {proba && !isActive && (
          <Callout variant="info" icon={Info}>
            Cheia merge, dar nimic nu e salvat încă. Completează adresa de ridicare și apasă „Salvează”, jos. Până atunci e-packet
            nu apare la comenzi și nici la comandă.
          </Callout>
        )}
        {proba && isActive && cheie.trim() !== "" && (
          <Callout variant="info" icon={Info}>Cheia nouă merge, dar nu e salvată: până apeși „Salvează”, rămâne cea veche.</Callout>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="Adresa de ridicare"
        descriere="De aici ridică curierul coletele. La DPD, FAN Courier și Dragon Star ridicarea se comandă automat după fiecare AWB; la Sameday, Cargus și TCE se face după contractul tău cu e-packet. Diacriticele se scot la trimitere.">
        {aPropusCeva(propunere) && (
          <Callout variant="info" icon={Info}>
            Am completat ce știam din datele magazinului (Setări). Verifică-le, alege localitatea din lista e-packet și completează
            prenumele și numele persoanei de contact.
          </Callout>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Prenume" required hint="3-25 litere">
            <Input value={prenume} onChange={(ev) => setPrenume(ev.target.value)} placeholder="Andrei" maxLength={25} />
          </Field>
          <Field label="Nume" required hint="3-25 litere">
            <Input value={nume} onChange={(ev) => setNume(ev.target.value)} placeholder="Popescu" maxLength={25} />
          </Field>
          <Field label="Firmă" hint="Dacă o completezi, pe eticheta DPD apare firma în locul numelui." className="sm:col-span-2">
            <Input value={firma} onChange={(ev) => setFirma(ev.target.value)} placeholder="Magazinul Meu SRL" />
          </Field>
          <Field label="Telefon" required>
            <Input value={telefon} onChange={(ev) => setTelefon(ev.target.value)} placeholder="0722000000" />
          </Field>
          <Field label="Email" required>
            <Input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="depozit@magazin.ro" />
          </Field>
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium text-foreground">Localitatea de ridicare <span className="text-destructive">*</span></p>
          {localitate ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-foreground">{localitate.nume}</p>
              <Button variant="outline" size="sm" onClick={() => setLocalitate(null)}>Schimbă</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select value={judet} onChange={(ev) => setJudet(ev.target.value)} className={selectCls} aria-label="Județul">
                  <option value="">Alege județul</option>
                  {JUDETE_CU_COD.map((j) => <option key={j.cod} value={j.cod}>{j.nume}</option>)}
                </select>
                <Input value={cautare} onChange={(ev) => setCautare(ev.target.value)} placeholder="Numele localității" aria-label="Numele localității"
                  onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void handleCauta(); } }} />
                <Button variant="outline" onClick={handleCauta} disabled={caut}>
                  {caut ? <Loader2 className="animate-spin" /> : <Search />}
                  Caută
                </Button>
              </div>
              {rezultate && rezultate.length > 0 && (
                <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
                  {rezultate.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => void alege(l)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {l.afisare}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">În București alegi sectorul (e-packet are capitala pe sectoare: caută „Sectorul”).</p>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cod poștal" required hint="Exact 6 cifre. Se propune din punctele localității; DPD refuză un cod care nu e al localității.">
            <Input value={codPostal} onChange={(ev) => setCodPostal(ev.target.value)} placeholder="400129" maxLength={6} inputMode="numeric" />
          </Field>
          <Field label="Strada" required hint="Cel mult 50 de caractere">
            <Input value={strada} onChange={(ev) => setStrada(ev.target.value)} placeholder="Strada Eroilor" maxLength={50} />
          </Field>
          <Field label="Număr" required hint="Scrie FN dacă nu are număr">
            <Input value={numar} onChange={(ev) => setNumar(ev.target.value)} placeholder="12" maxLength={10} />
          </Field>
          <Field label="Bloc">
            <Input value={bloc} onChange={(ev) => setBloc(ev.target.value)} maxLength={30} />
          </Field>
          <Field label="Scara">
            <Input value={scara} onChange={(ev) => setScara(ev.target.value)} maxLength={10} />
          </Field>
          <Field label="Etaj">
            <Input value={etaj} onChange={(ev) => setEtaj(ev.target.value)} maxLength={10} />
          </Field>
          <Field label="Apartament">
            <Input value={apartament} onChange={(ev) => setApartament(ev.target.value)} maxLength={10} />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Contul pentru ramburs"
        descriere="Unde vin banii încasați la livrare. e-packet cere toate trei câmpurile la fiecare AWB cu ramburs; fără ele, comenzile cu plata la livrare nu pot primi AWB. Titularul se trimite fără diacritice.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Titularul contului">
            <Input value={titular} onChange={(ev) => setTitular(ev.target.value)} placeholder="Magazinul Meu SRL" />
          </Field>
          <Field label="Banca">
            <Input value={banca} onChange={(ev) => setBanca(ev.target.value)} placeholder="Banca Transilvania" />
          </Field>
          <Field label="IBAN" className="sm:col-span-2">
            <Input value={iban} onChange={(ev) => setIban(ev.target.value)} placeholder="RO49AAAA1B31007593840000" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune pas={4} titlu="Curierii">
        <Field label="Curierul pentru livrarea la adresă" htmlFor="epacket-curier" hint="Îl poți schimba la fiecare AWB, văzând tarifele tuturor." className="sm:max-w-sm">
          <select id="epacket-curier" value={curierAdresa} onChange={(ev) => setCurierAdresa(ev.target.value as CurierEpacket)} className={selectCls}>
            {CURIERI_EPACKET.map((c) => <option key={c} value={c}>{NUME_CURIER_EPACKET[c]}</option>)}
          </select>
        </Field>
        {deTest === true && !CURIERI_DE_TEST.includes(curierAdresa) && (
          <Callout variant="warning" icon={AlertTriangle}>
            Cu o cheie de test merg doar DPD și Sameday: AWB-urile prin {NUME_CURIER_EPACKET[curierAdresa]} vor fi refuzate până pui cheia live.
          </Callout>
        )}

        <RandComutator
          separat
          titlu="Oferă la comandă livrarea la locker"
          text="Cumpărătorul își alege punctul din rețeaua de mai jos. Prețul e cel fix din Setări, Livrare. Opțiunea apare doar pentru coșurile sub limita lockerelor rețelei."
          activ={lockere}
          onChange={setLockere}
        />
        {lockere && (
          <Field
            label="Rețeaua de lockere"
            htmlFor="epacket-retea"
            className="sm:max-w-sm"
            hint={`Până la ${KG_MAXIM_PUNCT[curierPuncte]} kg pe colet${curierPuncte === "FCR" ? " (doar FANbox; PayPoint-urile nu se oferă)" : ""}. Un singur colet la locker.`}
          >
            <select id="epacket-retea" value={curierPuncte} onChange={(ev) => setCurierPuncte(ev.target.value as CurierCuPuncte)} className={selectCls}>
              {CURIERI_CU_PUNCTE.map((c) => <option key={c} value={c}>{NUME_CURIER_EPACKET[c]}</option>)}
            </select>
          </Field>
        )}
      </Sectiune>

      <Sectiune pas={5} titlu="Coletul și eticheta"
        descriere="La colet, e-packet cere obligatoriu dimensiunile. Cele de aici se pun când comanda nu le are; le poți schimba la fiecare AWB.">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Lungime (cm)">
            <Input inputMode="decimal" value={lungime} onChange={(ev) => setLungime(ev.target.value)} />
          </Field>
          <Field label="Lățime (cm)">
            <Input inputMode="decimal" value={latime} onChange={(ev) => setLatime(ev.target.value)} />
          </Field>
          <Field label="Înălțime (cm)">
            <Input inputMode="decimal" value={inaltime} onChange={(ev) => setInaltime(ev.target.value)} />
          </Field>
        </div>

        <RandComutator
          separat
          titlu="Declară valoarea comenzii ca asigurare"
          text="Fereastra de AWB precompletează asigurarea cu totalul comenzii; se plătește. Nu merge pe colete peste 32 kg."
          activ={asigurare}
          onChange={setAsigurare}
        />
        <RandComutator
          separat
          titlu="Deschiderea coletului la livrare"
          text="Vine bifată pe AWB-urile la adresă. La DPD merge doar cu ramburs; FAN Courier, lockerele și plicurile nu o au."
          activ={deschidere}
          onChange={setDeschidere}
        />

        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="Mărimea etichetei" htmlFor="epacket-marime" hint="A6 există la DPD, Sameday și Cargus; FAN Courier tipărește A4, Dragon Star și TCE eticheta lor.">
            <select id="epacket-marime" value={marime} onChange={(ev) => setMarime(ev.target.value as "A4" | "A6")} className={selectCls}>
              <option value="A6">A6 (etichetă compactă)</option>
              <option value="A4">A4 (foaie întreagă)</option>
            </select>
          </Field>
          <Field label="Conținut implicit" htmlFor="epacket-continut" hint="Pe AWB când comanda nu dă unul mai bun (max. 50).">
            <Input id="epacket-continut" value={continut} onChange={(ev) => setContinut(ev.target.value)} placeholder="Produse" maxLength={50} />
          </Field>
        </div>
      </Sectiune>

      <Sectiune titlu="Ce trebuie să știi">
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>Fiecare AWB e taxat din creditul e-packet la prețul din clipa emiterii (tariful arătat e o estimare). Sub 20 de lei credit, emiterea e refuzată.</li>
          <li>AWB-urile NU se pot anula din Edinio (API-ul lor n-are anulare): anularea se cere la e-packet, la contact@e-packet.ro sau 0371 236 562.</li>
          <li>Dacă răspunsul la emitere se pierde, Edinio nu emite din nou singur: verifici în aplicația e-packet și legi AWB-ul de comandă din fereastră.</li>
          <li>Starea coletului se citește la două ore și mută comanda singură:</li>
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {Object.values(STARI).map((s) => (
                <tr key={s.denumire} className="border-b border-border last:border-0">
                  <td className="py-1 pr-3 text-foreground">{s.denumire}</td>
                  <td className="py-1 text-muted-foreground">{EXPLICATIE_CLASIFICARE[s.clasa]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge configurarea e-packet din Edinio. AWB-urile deja emise rămân pe comenzi.">
          <ButonDeconectare
            nume="e-packet"
            cePierzi="Se șterge toată configurarea e-packet din Edinio: cheia API, adresa de ridicare, contul de ramburs și curierii aleși. AWB-urile deja emise rămân pe comenzi și în aplicația e-packet, dar urmărirea lor se oprește, iar etichetele le descarci de acum din aplicația lor. Metoda e-packet se oprește și în Setări, Livrare."
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
