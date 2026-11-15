"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, ChevronRight, ClipboardCheck, KeyRound, Loader2 } from "lucide-react";
import {
  disconnectPallex,
  savePallexConfig,
  testPallexConnectionAction,
  type StatusAratat,
} from "@/lib/actions/pallex.actions";
import { NUME_TIP_PARTIDA, TIPURI_PARTIDA, type PallExConfig, type TipPartida } from "@/lib/pallex/client";
import { JUDETE } from "@/lib/ro/judete";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

/**
 * Configurarea Pall-Ex (ClientPlus).
 *
 * ⚠ „Testeaza conexiunea" face o CITIRE (`/consignment_status_types`), nu o
 * creare. Un buton care ar face o partida ar produce un transport real la fiecare
 * apasare — iar butonul asta se apasa de zece ori pana ies datele bune.
 *
 * ⚠ Si aduce ceva ce nu se poate afla altfel: LISTA REALA DE STATUSURI a
 * instalarii. Pall-Ex nu publica nicio nomenclatura, iar noi interpretam
 * statusurile dupa nume — adica pe o presupunere. Aratata langa ce facem noi cu
 * fiecare, presupunerea devine verificabila fara sa se expedieze nimic.
 */
export function PallexConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: PallExConfig | null;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusuri, setStatusuri] = useState<StatusAratat[] | null>(null);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [codPostal, setCodPostal] = useState(initialConfig?.expeditor_cod_postal ?? "");
  const [judet, setJudet] = useState(initialConfig?.expeditor_judet ?? "");
  const [contact, setContact] = useState(initialConfig?.expeditor_contact ?? "");
  const [tip, setTip] = useState<TipPartida>(initialConfig?.tip_partida ?? 3);
  const [oraDeschidere, setOraDeschidere] = useState(initialConfig?.ora_deschidere ?? "08:00");
  const [oraInchidere, setOraInchidere] = useState(initialConfig?.ora_inchidere ?? "17:00");
  const [oraDeschidereLivrare, setOraDeschidereLivrare] = useState(initialConfig?.ora_deschidere_livrare ?? "08:00");
  const [oraInchidereLivrare, setOraInchidereLivrare] = useState(initialConfig?.ora_inchidere_livrare ?? "17:00");
  const [zileRidicare, setZileRidicare] = useState(String(initialConfig?.zile_pana_la_ridicare ?? 1));
  const [zileLivrare, setZileLivrare] = useState(String(initialConfig?.zile_pana_la_livrare ?? 2));
  const [valideazaAutomat, setValideazaAutomat] = useState(initialConfig?.valideaza_automat ?? false);
  const [liftRidicare, setLiftRidicare] = useState(initialConfig?.servicii?.liftLaRidicare ?? false);
  const [accesRidicare, setAccesRidicare] = useState(initialConfig?.servicii?.accesRestrictionatLaRidicare ?? false);

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    username, password, codPostal, judet, contact, tip, oraDeschidere, oraInchidere, oraDeschidereLivrare,
    oraInchidereLivrare, zileRidicare, zileLivrare, valideazaAutomat, liftRidicare, accesRidicare,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setCodPostal(reper.codPostal); setJudet(reper.judet);
    setContact(reper.contact); setTip(reper.tip); setOraDeschidere(reper.oraDeschidere); setOraInchidere(reper.oraInchidere);
    setOraDeschidereLivrare(reper.oraDeschidereLivrare); setOraInchidereLivrare(reper.oraInchidereLivrare);
    setZileRidicare(reper.zileRidicare); setZileLivrare(reper.zileLivrare); setValideazaAutomat(reper.valideazaAutomat);
    setLiftRidicare(reper.liftRidicare); setAccesRidicare(reper.accesRidicare);
  }

  const areParola = password.trim() !== "" || secretulEsteSalvat(initialConfig, "password");
  const isActive = !!(initialConfig?.enabled && initialConfig?.username);
  const completat = username.trim() !== "" && areParola;

  function construieste(): PallExConfig {
    return {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      expeditor_cod_postal: codPostal.trim(),
      expeditor_judet: judet,
      expeditor_contact: contact.trim(),
      tip_partida: tip,
      ora_deschidere: oraDeschidere,
      ora_inchidere: oraInchidere,
      ora_deschidere_livrare: oraDeschidereLivrare,
      ora_inchidere_livrare: oraInchidereLivrare,
      zile_pana_la_ridicare: Number(zileRidicare) || 0,
      zile_pana_la_livrare: Number(zileLivrare) || 0,
      valideaza_automat: valideazaAutomat,
      servicii: {
        liftLaRidicare: liftRidicare,
        accesRestrictionatLaRidicare: accesRidicare,
      },
    };
  }

  async function handleTest() {
    if (!completat) return toast.error("Completează utilizatorul și parola ClientPlus.");

    setTesting(true);
    const r = await testPallexConnectionAction(businessId, construieste());
    setTesting(false);

    if ("error" in r) {
      setStatusuri(null);
      toast.error(`Pall-Ex: ${r.error}`);
      return;
    }
    setStatusuri(r.statusuri);
    toast.success("Conexiune Pall-Ex reușită.");
  }

  async function handleSave() {
    if (!completat) return toast.error("Completează datele de acces.");
    if (!codPostal.trim() || !judet) {
      return toast.error("Pall-Ex cere codul poștal și județul de ridicare la fiecare partidă.");
    }

    setSaving(true);
    const r = await savePallexConfig(businessId, construieste());
    setSaving(false);

    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Configurația Pall-Ex a fost salvată.");
      setReper(valori);
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectPallex(businessId);
    setDisconnecting(false);
    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Pall-Ex a fost deconectat.");
      setStatusuri(null);
      router.refresh();
    }
  }

  const stari: StareAntet[] = isActive ? [{ ton: "bun", text: "Activ" }] : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="pallex"
      titlu="Transport paletizat"
      descriere="Creezi partide Pall-Ex pentru marfa paletizată, direct din comenzile magazinului."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Datele ClientPlus", facut: completat },
          { text: "Codul poștal și județul de ridicare", facut: !!codPostal.trim() && !!judet },
          { text: "Pall-Ex activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Utilizator", valoare: initialConfig?.username || "-" },
            { eticheta: "Ridicare din", valoare: initialConfig?.expeditor_judet || "-" },
            { eticheta: "Validare borderou", valoare: initialConfig?.valideaza_automat ? "automată" : "manuală" },
          ]} />
        )}
        <CumFunctioneaza id="pallex" puncte={[
          { Icon: KeyRound, text: "Folosești datele ClientPlus; Pall-Ex recomandă un utilizator separat pentru integrări, cerut la it@pallex.ro." },
          { Icon: Ban, text: "Pall-Ex nu încasează ramburs și nu are mediu de test: fiecare partidă e un transport real." },
          { Icon: ClipboardCheck, text: "Marfa pleacă abia după validarea borderoului: automat sau din comandă, când ești gata." },
        ]} />
      </>}
    >
      {/*
        ⚠ Doua lucruri pe care comerciantul TREBUIE sa le stie inainte de prima
        partida, si pe care nu le poate ghici din nicio alta integrare de curier:
        Pall-Ex nu incaseaza nimic la livrare, si nu are mediu de test.
      */}
      <Callout variant="warning" icon={AlertTriangle} title="Pall-Ex NU încasează ramburs">
        Rețeaua Pall-Ex transportă marfă paletizată și nu are, în niciun fel, încasare la livrare. Pe o comandă cu bani
        neîncasați, marfa pleacă și nu mai există nicio cale de a-i lua; emiterea îți va cere să confirmi asta explicit.
        Nu există nici mediu de test: fiecare partidă creată e un transport real, care intră pe factură.
      </Callout>

      <Sectiune pas={1} titlu="Date de acces ClientPlus"
        descriere="Datele cu care intri în ClientPlus. Pall-Ex recomandă un utilizator separat pentru integrări, diferit de cel din interfața web: cere-l la it@pallex.ro.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator" htmlFor="pallex-user" required>
            <Input
              id="pallex-user"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setStatusuri(null); }}
              placeholder="api@firma.ro"
            />
          </Field>
          <Field label="Parola" htmlFor="pallex-parola" required>
            <Input
              id="pallex-parola"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setStatusuri(null); }}
              placeholder={secretulEsteSalvat(initialConfig, "password") ? PLACEHOLDER_SECRET_SALVAT : "Parola contului ClientPlus"}
            />
          </Field>
        </div>

        <div>
          <Button variant="outline" onClick={handleTest} disabled={testing || !completat}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifică..." : "Testează conexiunea"}
          </Button>
        </div>

        {statusuri !== null && (
          <div className="space-y-2 rounded-xl border border-success/25 bg-success/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle className="h-3.5 w-3.5" /> Datele de acces sunt valide.</p>
            {statusuri.length > 0 ? (
              <>
                {/*
                  ⚠ Nu e o lista decorativa. Pall-Ex nu publica nicaieri ce
                  statusuri foloseste, iar noi le interpretam dupa NUME. Aici se
                  vad numele reale ale contractului tau si ce facem noi cu
                  fiecare: singurul mod de a verifica asta fara sa expediezi.
                */}
                <p className="text-xs text-muted-foreground">
                  Așa înțelegem statusurile contractului tău. Dacă vreunul e tradus greșit, spune-ne: comenzile se mișcă după lista asta.
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background">
                  <table className="w-full text-xs">
                    <tbody>
                      {statusuri.map((s) => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 font-medium text-foreground">{s.nume}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {s.urmare}
                            {s.semnalat ? " · te anunțăm" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Contul nu a întors nicio listă de statusuri. Urmărirea comenzilor va merge doar după ce Pall-Ex o publică pe contractul tău.
              </p>
            )}
          </div>
        )}
      </Sectiune>

      <Sectiune pas={2} titlu="De unde se ridică marfa"
        descriere="Adresa și orașul vin din setările magazinului. Codul poștal și județul se completează aici: Pall-Ex le cere la fiecare partidă, iar în datele magazinului nu există cod poștal.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cod poștal ridicare" htmlFor="pallex-cod" required>
            <Input
              id="pallex-cod"
              type="text"
              inputMode="numeric"
              value={codPostal}
              onChange={(e) => setCodPostal(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="ex. 550321"
            />
          </Field>
          <Field label="Județ ridicare" htmlFor="pallex-judet" required>
            <select id="pallex-judet" value={judet} onChange={(e) => setJudet(e.target.value)} className={selectCls}>
              <option value="">Alege județul</option>
              {JUDETE.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </Field>
          <Field label="Persoana de contact la ridicare" htmlFor="pallex-contact">
            <Input id="pallex-contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="ex. Depozit / Andrei" />
          </Field>
          <Field label="Tipul partidei" htmlFor="pallex-tip">
            <select id="pallex-tip" value={String(tip)} onChange={(e) => setTip(Number(e.target.value) as TipPartida)} className={selectCls}>
              {TIPURI_PARTIDA.map((t) => (
                <option key={t} value={String(t)}>{NUME_TIP_PARTIDA[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Depozitul se deschide la" htmlFor="pallex-deschide">
            <Input id="pallex-deschide" type="time" value={oraDeschidere} onChange={(e) => setOraDeschidere(e.target.value)} />
          </Field>
          <Field label="Depozitul se închide la" htmlFor="pallex-inchide">
            <Input id="pallex-inchide" type="time" value={oraInchidere} onChange={(e) => setOraInchidere(e.target.value)} />
          </Field>
        </div>

        <RandComutator
          separat
          titlu="Mașină cu lift la ridicare"
          text="Pornește-l dacă depozitul tău nu are rampă și șoferul are nevoie de lift."
          activ={liftRidicare}
          onChange={setLiftRidicare}
        />
        <RandComutator
          separat
          titlu="Acces restricționat la ridicare"
          text="Stradă îngustă, centru cu program de aprovizionare, curte fără acces pentru TIR."
          activ={accesRidicare}
          onChange={setAccesRidicare}
        />
      </Sectiune>

      <Sectiune pas={3} titlu="Termene și validare"
        descriere="Valorile implicite din formularul de partidă; le poți schimba la fiecare comandă. Regimul (Premium 24h sau Economy 48h) îl stabilește Pall-Ex. Sărbătorile legale nu se iau în calcul, doar sâmbetele și duminicile.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ridicarea, peste câte zile lucrătoare" htmlFor="pallex-zile-ridicare">
            <Input id="pallex-zile-ridicare" type="number" min={0} max={30} value={zileRidicare} onChange={(e) => setZileRidicare(e.target.value)} />
          </Field>
          <Field label="Livrarea, peste câte zile de la ridicare" htmlFor="pallex-zile-livrare">
            <Input id="pallex-zile-livrare" type="number" min={0} max={30} value={zileLivrare} onChange={(e) => setZileLivrare(e.target.value)} />
          </Field>
          <Field label="Destinatarul primește de la" htmlFor="pallex-primeste-de">
            <Input id="pallex-primeste-de" type="time" value={oraDeschidereLivrare} onChange={(e) => setOraDeschidereLivrare(e.target.value)} />
          </Field>
          <Field label="Destinatarul primește până la" htmlFor="pallex-primeste-pana">
            <Input id="pallex-primeste-pana" type="time" value={oraInchidereLivrare} onChange={(e) => setOraInchidereLivrare(e.target.value)} />
          </Field>
        </div>

        {/*
          ⚠ Implicit OPRIT, si nu din prudenta decorativa. Un borderou strange
          partidele mai multor comenzi; validat, pleaca TOT ce e in el si nimic
          din el nu se mai poate anula.
        */}
        <RandComutator
          separat
          titlu="Validează borderoul automat"
          text={<>Marfa nu pleacă până nu e validat borderoul. Pornit, validarea se face imediat după emitere, dar un borderou conține și partidele altor comenzi din aceeași zi, iar după validare <span className="font-medium text-foreground">niciuna nu se mai poate anula</span>. Oprit, validezi tu, din comandă, când ești gata.</>}
          activ={valideazaAutomat}
          onChange={setValideazaAutomat}
          ariaLabel="Validează borderoul automat"
        />
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge cheile ClientPlus din Edinio. Partidele deja trimise rămân la Pall-Ex.">
          <ButonDeconectare
            nume="Pall-Ex"
            cePierzi="Cheile ClientPlus se șterg din Edinio, împreună cu județul de ridicare și tipul de partidă ales. Ca să te întorci, ceri din nou utilizatorul și parola de la Pall-Ex. Partidele deja trimise rămân la ei."
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
