"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Info, Loader2, Search } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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

const campClasa = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

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
    if (!areCheie) return toast.error("Completeaza cheia API primita de la e-packet");
    setTesting(true);
    let res: Awaited<ReturnType<typeof testEpacketConnectionAction>>;
    try {
      res = await testEpacketConnectionAction(businessId, cheie.trim());
    } catch (err) {
      setProba(null);
      toast.error("e-packet nu a raspuns: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
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
    if (cautare.trim().length < 2) return toast.error("Scrie cel putin doua litere din numele localitatii");
    if (!judet) return toast.error("Alege judetul");
    if (!areCheie) return toast.error("Completeaza intai cheia API");
    setCaut(true);
    let res: Awaited<ReturnType<typeof cautaLocalitatiEpacketAction>>;
    try {
      res = await cautaLocalitatiEpacketAction(businessId, cautare.trim(), judet, cheie.trim());
    } catch (err) {
      toast.error("Cautarea nu a mers: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
      return;
    } finally {
      setCaut(false);
    }
    if (!res.ok) return toast.error(res.error);
    setRezultate(res.localitati);
    if (res.localitati.length === 0) toast.error("e-packet nu are nicio localitate cu numele asta in judet");
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
    if (!areCheie) return toast.error("Completeaza cheia API");
    /* ⚠ Aceleasi campuri ca `epacketGata`: fara oricare, fiecare AWB ar fi refuzat (422). */
    if (!numeBun(prenume) || !numeBun(nume)) return toast.error("Prenumele si numele de la ridicare au cate 3-25 de litere");
    if (!telefon.trim() || !email.trim()) return toast.error("Telefonul si emailul de la ridicare sunt obligatorii");
    if (!localitate) return toast.error("Alege localitatea de ridicare din lista e-packet");
    if (!/^\d{6}$/.test(codPostal.trim())) return toast.error("Codul postal de ridicare are exact 6 cifre");
    if (!strada.trim() || !numar.trim()) return toast.error("Strada si numarul de la ridicare sunt obligatorii (scrie FN daca nu are numar)");
    if ([lungime, latime, inaltime].some((v) => !(nr(v) >= 1 && nr(v) <= 300))) {
      return toast.error("Dimensiunile implicite ale coletului sunt intre 1 si 300 cm");
    }

    setSaving(true);
    let res: Awaited<ReturnType<typeof saveEpacketConfig>>;
    try {
      res = await saveEpacketConfig(businessId, construieste());
    } catch (err) {
      toast.error("Configurarea nu s-a putut salva: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
      return;
    } finally {
      setSaving(false);
    }
    if ("error" in res) return toast.error(res.error);
    toast.success("Configurarea e-packet a fost salvata");
    setCheie("");
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    let res: Awaited<ReturnType<typeof disconnectEpacket>>;
    try {
      res = await disconnectEpacket(businessId);
    } catch (err) {
      toast.error("Deconectarea nu s-a putut face: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
      return;
    } finally {
      setDisconnecting(false);
    }
    if ("error" in res) return toast.error(res.error);
    toast.success("e-packet a fost deconectat");
    setProba(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="e-packet e activ"
          action={
            <ButonDeconectare
              nume="e-packet"
              cePierzi="Se sterge toata configurarea e-packet din Edinio: cheia API, adresa de ridicare, contul de ramburs si curierii alesi. AWB-urile deja emise raman pe comenzi si in aplicatia e-packet, dar urmarirea lor se opreste, iar etichetele le descarci de acum din aplicatia lor. Metoda e-packet se opreste si in Setari -> Livrare."
              pending={disconnecting}
              onConfirma={handleDisconnect}
            />
          }
        >
          Ridicare din {initialConfig?.expeditor?.localitate_nume || "localitatea necompletata"}. AWB-uri la adresa prin{" "}
          {NUME_CURIER_EPACKET[initialConfig?.curier_adresa ?? "DPD"]}
          {initialConfig?.lockere ? `, la locker prin ${NUME_CURIER_EPACKET[initialConfig?.curier_puncte ?? "SDY"]}` : ""}.
        </Callout>
      )}

      {adresaIncompleta && (
        <Callout variant="warning" icon={AlertTriangle} title="Adresa de ridicare e incompleta">
          Fara prenume, nume, telefon, email, localitate, cod postal, strada si numar, e-packet refuza fiecare AWB.
          Pana le completezi, e-packet nu apare in checkout si nu se pot emite AWB-uri.
        </Callout>
      )}

      <Panel step={1} title="Cheia API">
        <p className="text-xs text-muted-foreground">
          Cheile se emit la cerere de e-packet (contact@e-packet.ro). Cheia e singura credentiala: cine o are emite
          AWB-uri platite din creditul tau. Cu o cheie de test (<code>epk_test_</code>) merg doar DPD si Sameday, in
          mediul lor de test: AWB-urile nu pleaca la curier si nu se taxeaza.
        </p>
        <Field label="Cheia API" required>
          <Input
            type="password"
            value={cheie}
            onChange={(ev) => { setCheie(ev.target.value); setProba(null); }}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "epk_live_… sau epk_test_…"}
          />
        </Field>
        <Button onClick={handleTest} disabled={testing || !areCheie}>
          {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {testing ? "Se verifica..." : "Testeaza conexiunea"}
        </Button>
        {proba && (
          <div className="space-y-1 rounded-lg border border-success/20 bg-success/5 p-3 text-xs">
            <p className="font-semibold text-success">Conectat la e-packet</p>
            <p className="text-muted-foreground">
              {proba.test
                ? "Cheie de TEST: AWB-urile se fac in mediul de test DPD si Sameday, nu pleaca la nimeni si nu se taxeaza."
                : "Cheie LIVE: fiecare AWB e real si se taxeaza din credit (minim 20 lei in cont)."}
            </p>
          </div>
        )}
        {proba && !isActive && (
          <Callout variant="info" icon={Info}>
            {"Cheia merge, dar nimic nu e salvat inca. Completeaza adresa de ridicare si apasa „Salveaza”, jos. Pana atunci e-packet nu apare la comenzi si nici in checkout."}
          </Callout>
        )}
        {proba && isActive && cheie.trim() !== "" && (
          <Callout variant="info" icon={Info}>
            {"Cheia noua merge, dar nu e salvata: pana apesi „Salveaza”, ramane cea veche."}
          </Callout>
        )}
      </Panel>

      <Panel step={2} title="Adresa de ridicare">
        <p className="text-xs text-muted-foreground">
          De aici ridica curierul coletele. La DPD, FAN Courier si Dragon Star ridicarea se comanda automat dupa fiecare
          AWB; la Sameday, Cargus si TCE se face dupa contractul tau cu e-packet. Diacriticele se scot la trimitere
          (pe etichetele lor, in adresa, literele cu diacritice se pierd).
        </p>
        {aPropusCeva(propunere) && (
          <Callout variant="info" icon={Info}>
            {"Am completat ce stiam din datele magazinului (Setari). Verifica-le, alege localitatea din lista e-packet si completeaza prenumele si numele persoanei de contact."}
          </Callout>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Prenume" required hint="3-25 litere">
            <Input value={prenume} onChange={(ev) => setPrenume(ev.target.value)} placeholder="Andrei" maxLength={25} />
          </Field>
          <Field label="Nume" required hint="3-25 litere">
            <Input value={nume} onChange={(ev) => setNume(ev.target.value)} placeholder="Popescu" maxLength={25} />
          </Field>
          <Field label="Firma" hint="Daca o completezi, pe eticheta DPD apare firma in locul numelui." className="sm:col-span-2">
            <Input value={firma} onChange={(ev) => setFirma(ev.target.value)} placeholder="Magazinul Meu SRL" />
          </Field>
          <Field label="Telefon" required>
            <Input value={telefon} onChange={(ev) => setTelefon(ev.target.value)} placeholder="0722000000" />
          </Field>
          <Field label="Email" required>
            <Input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="depozit@magazin.ro" />
          </Field>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">Localitatea de ridicare *</p>
          {localitate ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-foreground">{localitate.nume}</p>
              <Button variant="outline" size="sm" onClick={() => setLocalitate(null)}>Schimba</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select value={judet} onChange={(ev) => setJudet(ev.target.value)} className={campClasa} aria-label="Judetul">
                  <option value="">Alege judetul</option>
                  {JUDETE_CU_COD.map((j) => <option key={j.cod} value={j.cod}>{j.nume}</option>)}
                </select>
                <Input value={cautare} onChange={(ev) => setCautare(ev.target.value)} placeholder="Numele localitatii"
                  onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void handleCauta(); } }} />
                <Button variant="outline" onClick={handleCauta} disabled={caut}>
                  {caut ? <Loader2 className="animate-spin" /> : <Search className="h-4 w-4" />}
                  Cauta
                </Button>
              </div>
              {rezultate && rezultate.length > 0 && (
                <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
                  {rezultate.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => void alege(l)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {l.afisare}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                In Bucuresti alegi sectorul (e-packet are capitala pe sectoare: cauta „Sectorul”).
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cod postal" required hint="Exact 6 cifre. Se propune din punctele localitatii; DPD refuza un cod care nu e al localitatii.">
            <Input value={codPostal} onChange={(ev) => setCodPostal(ev.target.value)} placeholder="400129" maxLength={6} inputMode="numeric" />
          </Field>
          <Field label="Strada" required hint="Cel mult 50 de caractere">
            <Input value={strada} onChange={(ev) => setStrada(ev.target.value)} placeholder="Strada Eroilor" maxLength={50} />
          </Field>
          <Field label="Numar" required hint="Scrie FN daca nu are numar">
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
      </Panel>

      <Panel step={3} title="Contul pentru ramburs">
        <p className="text-xs text-muted-foreground">
          Unde vin banii incasati la livrare. e-packet cere toate trei campurile la fiecare AWB cu ramburs; fara ele,
          comenzile cu plata la livrare nu pot primi AWB. Titularul se trimite fara diacritice.
        </p>
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
      </Panel>

      <Panel step={4} title="Curierii">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Curierul pentru livrarea la adresa" hint="Il poti schimba la fiecare AWB, vazand tarifele tuturor.">
            <select value={curierAdresa} onChange={(ev) => setCurierAdresa(ev.target.value as CurierEpacket)} className={campClasa}>
              {CURIERI_EPACKET.map((c) => <option key={c} value={c}>{NUME_CURIER_EPACKET[c]}</option>)}
            </select>
          </Field>
        </div>
        {deTest === true && !CURIERI_DE_TEST.includes(curierAdresa) && (
          <Callout variant="warning" icon={AlertTriangle}>
            Cu o cheie de test merg doar DPD si Sameday: AWB-urile prin {NUME_CURIER_EPACKET[curierAdresa]} vor fi refuzate pana pui cheia live.
          </Callout>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Ofera in checkout livrarea la locker</p>
            <p className="text-xs text-muted-foreground">
              Cumparatorul isi alege punctul din reteaua de mai jos. Pretul e cel fix din „Setari -&gt; Livrare”.
              Optiunea apare doar pentru cosurile sub limita lockerelor retelei.
            </p>
          </div>
          <Switch checked={lockere} onCheckedChange={setLockere} />
        </div>
        {lockere && (
          <Field
            label="Reteaua de lockere"
            hint={`Pana la ${KG_MAXIM_PUNCT[curierPuncte]} kg pe colet${curierPuncte === "FCR" ? " (doar FANbox; PayPoint-urile nu se ofera)" : ""}. Un singur colet la locker.`}
          >
            <select value={curierPuncte} onChange={(ev) => setCurierPuncte(ev.target.value as CurierCuPuncte)} className={campClasa}>
              {CURIERI_CU_PUNCTE.map((c) => <option key={c} value={c}>{NUME_CURIER_EPACKET[c]}</option>)}
            </select>
          </Field>
        )}
      </Panel>

      <Panel step={5} title="Coletul si eticheta">
        <p className="text-xs text-muted-foreground">
          La colet, e-packet cere obligatoriu dimensiunile. Cele de aici se pun cand comanda nu le are; le poti schimba la
          fiecare AWB.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Lungime (cm)">
            <Input inputMode="decimal" value={lungime} onChange={(ev) => setLungime(ev.target.value)} />
          </Field>
          <Field label="Latime (cm)">
            <Input inputMode="decimal" value={latime} onChange={(ev) => setLatime(ev.target.value)} />
          </Field>
          <Field label="Inaltime (cm)">
            <Input inputMode="decimal" value={inaltime} onChange={(ev) => setInaltime(ev.target.value)} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Declara valoarea comenzii ca asigurare</p>
            <p className="text-xs text-muted-foreground">Fereastra de AWB precompleteaza asigurarea cu totalul comenzii; se plateste. Nu merge pe colete peste 32 kg.</p>
          </div>
          <Switch checked={asigurare} onCheckedChange={setAsigurare} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Deschiderea coletului la livrare</p>
            <p className="text-xs text-muted-foreground">
              Vine bifata pe AWB-urile la adresa. La DPD merge doar cu ramburs; FAN Courier, lockerele si plicurile nu o au.
            </p>
          </div>
          <Switch checked={deschidere} onCheckedChange={setDeschidere} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marimea etichetei" hint="A6 exista la DPD, Sameday si Cargus; FAN Courier tipareste A4, Dragon Star si TCE eticheta lor.">
            <select value={marime} onChange={(ev) => setMarime(ev.target.value as "A4" | "A6")} className={campClasa}>
              <option value="A6">A6 (eticheta compacta)</option>
              <option value="A4">A4 (foaie intreaga)</option>
            </select>
          </Field>
          <Field label="Continut implicit" hint="Pe AWB cand comanda nu da unul mai bun (max. 50).">
            <Input value={continut} onChange={(ev) => setContinut(ev.target.value)} placeholder="Produse" maxLength={50} />
          </Field>
        </div>
      </Panel>

      <Panel step={6} title="Ce trebuie sa stii">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Fiecare AWB e taxat din creditul e-packet la pretul din clipa emiterii (tariful aratat e o estimare). Sub 20 lei credit, emiterea e refuzata.</li>
          <li>AWB-urile NU se pot anula din Edinio (API-ul lor n-are anulare): anularea se cere la e-packet, la contact@e-packet.ro sau 0371 236 562.</li>
          <li>Daca raspunsul la emitere se pierde, Edinio nu emite din nou singur: verifici in aplicatia e-packet si legi AWB-ul de comanda din fereastra.</li>
          <li>Starea coletului se citeste la doua ore si muta comanda singura:</li>
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
      </Panel>

      <Button onClick={handleSave} disabled={saving || !areCheie} className="w-full sm:w-auto">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza"}
      </Button>
    </div>
  );
}
