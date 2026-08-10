"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Loader2, Unplug } from "lucide-react";
import {
  disconnectPallex,
  savePallexConfig,
  testPallexConnectionAction,
  type StatusAratat,
} from "@/lib/actions/pallex.actions";
import { NUME_TIP_PARTIDA, TIPURI_PARTIDA, type PallExConfig, type TipPartida } from "@/lib/pallex/client";
import { JUDETE } from "@/lib/ro/judete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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
    if (!completat) return toast.error("Completeaza utilizatorul si parola ClientPlus");

    setTesting(true);
    const r = await testPallexConnectionAction(businessId, construieste());
    setTesting(false);

    if ("error" in r) {
      setStatusuri(null);
      toast.error(`Pall-Ex: ${r.error}`);
      return;
    }
    setStatusuri(r.statusuri);
    toast.success("Conexiune Pall-Ex reusita");
  }

  async function handleSave() {
    if (!completat) return toast.error("Completeaza datele de acces");
    if (!codPostal.trim() || !judet) {
      return toast.error("Pall-Ex cere codul postal si judetul de ridicare la fiecare partida");
    }

    setSaving(true);
    const r = await savePallexConfig(businessId, construieste());
    setSaving(false);

    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Configuratie Pall-Ex salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectPallex(businessId);
    setDisconnecting(false);
    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Pall-Ex deconectat");
      setStatusuri(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="Pall-Ex activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          {initialConfig?.username}
          {initialConfig?.expeditor_judet ? ` · ridicare din ${initialConfig.expeditor_judet}` : ""}
        </Callout>
      )}

      {/*
        ⚠ Doua lucruri pe care comerciantul TREBUIE sa le stie inainte de prima
        partida, si pe care nu le poate ghici din nicio alta integrare de curier:
        Pall-Ex nu incaseaza nimic la livrare, si nu are mediu de test.
      */}
      <Callout variant="warning" icon={AlertTriangle} title="Pall-Ex NU incaseaza ramburs">
        Reteaua Pall-Ex transporta marfa paletizata si nu are, in niciun fel, incasare
        la livrare. Pe o comanda cu bani neincasati, marfa pleaca si nu mai exista
        nicio cale de a-i lua. Emiterea iti va cere sa confirmi asta explicit.
        <br />
        Nu exista nici mediu de test: fiecare partida creata e un transport real,
        care intra pe factura.
      </Callout>

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            1
          </span>
          <h3 className="text-sm font-semibold text-foreground">Date de acces ClientPlus</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Sunt datele cu care intri in ClientPlus. Pall-Ex recomanda un utilizator
          separat pentru integrari, diferit de cel folosit in interfata web —
          cere-l la <span className="font-medium">it@pallex.ro</span>.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator" required>
            <Input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setStatusuri(null); }}
              placeholder="api@firma.ro"
            />
          </Field>
          <Field label="Parola" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setStatusuri(null); }}
              placeholder={
                secretulEsteSalvat(initialConfig, "password")
                  ? PLACEHOLDER_SECRET_SALVAT
                  : "Parola contului ClientPlus"
              }
            />
          </Field>
        </div>

        <Button onClick={handleTest} disabled={testing || !completat}>
          {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {testing ? "Se verifica..." : "Testeaza conexiunea"}
        </Button>

        {statusuri !== null && (
          <div className="space-y-2 rounded-lg border border-success/20 bg-success/5 p-3">
            <p className="text-xs font-semibold text-success">Datele de acces sunt valide.</p>
            {statusuri.length > 0 ? (
              <>
                {/*
                  ⚠ Nu e o lista decorativa. Pall-Ex nu publica nicaieri ce
                  statusuri foloseste, iar noi le interpretam dupa NUME. Aici se
                  vad numele reale ale contractului tau si ce facem noi cu
                  fiecare — singurul mod de a verifica asta fara sa expediezi.
                */}
                <p className="text-xs text-muted-foreground">
                  Asa intelegem statusurile contractului tau. Daca vreunul e tradus
                  gresit, spune-ne: comenzile se misca dupa lista asta.
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {statusuri.map((s) => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 font-medium text-foreground">{s.nume}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {s.urmare}
                            {s.semnalat ? " · te anuntam" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Contul nu a intors nicio lista de statusuri. Urmarirea comenzilor va
                merge doar dupa ce Pall-Ex o publica pe contractul tau.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            2
          </span>
          <h3 className="text-sm font-semibold text-foreground">De unde se ridica marfa</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Adresa si orasul se iau din setarile magazinului. Codul postal si judetul
          se completeaza aici: Pall-Ex le cere obligatoriu la fiecare partida, iar in
          datele magazinului nu exista camp de cod postal.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cod postal ridicare" required>
            <Input
              type="text"
              inputMode="numeric"
              value={codPostal}
              onChange={(e) => setCodPostal(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="ex. 550321"
            />
          </Field>
          <Field label="Judet ridicare" required>
            <select
              value={judet}
              onChange={(e) => setJudet(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Alege judetul</option>
              {JUDETE.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </Field>
          <Field label="Persoana de contact la ridicare">
            <Input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="ex. Depozit / Andrei"
            />
          </Field>
          <Field label="Tipul partidei">
            <select
              value={String(tip)}
              onChange={(e) => setTip(Number(e.target.value) as TipPartida)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TIPURI_PARTIDA.map((t) => (
                <option key={t} value={String(t)}>{NUME_TIP_PARTIDA[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Depozitul se deschide la">
            <Input type="time" value={oraDeschidere} onChange={(e) => setOraDeschidere(e.target.value)} />
          </Field>
          <Field label="Depozitul se inchide la">
            <Input type="time" value={oraInchidere} onChange={(e) => setOraInchidere(e.target.value)} />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Masina cu lift la ridicare</p>
            <p className="text-xs text-muted-foreground">
              Bifeaza daca depozitul tau nu are rampa si soferul are nevoie de lift.
            </p>
          </div>
          <Switch checked={liftRidicare} onCheckedChange={setLiftRidicare} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Acces restrictionat la ridicare</p>
            <p className="text-xs text-muted-foreground">
              Strada ingusta, centru cu program de aprovizionare, curte fara acces pentru TIR.
            </p>
          </div>
          <Switch checked={accesRidicare} onCheckedChange={setAccesRidicare} />
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            3
          </span>
          <h3 className="text-sm font-semibold text-foreground">Termene si validare</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ridicarea, peste cate zile lucratoare">
            <Input
              type="number"
              min={0}
              max={30}
              value={zileRidicare}
              onChange={(e) => setZileRidicare(e.target.value)}
            />
          </Field>
          <Field label="Livrarea, peste cate zile de la ridicare">
            <Input
              type="number"
              min={0}
              max={30}
              value={zileLivrare}
              onChange={(e) => setZileLivrare(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Sunt doar valorile implicite din formularul de partida — le poti schimba la
          fiecare comanda. Pall-Ex are Premium 24h si Economy 48h; regimul il
          stabilesc ei din datele trimise. Sarbatorile legale nu sunt luate in calcul,
          doar sambetele si duminicile.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Destinatarul primeste de la">
            <Input type="time" value={oraDeschidereLivrare} onChange={(e) => setOraDeschidereLivrare(e.target.value)} />
          </Field>
          <Field label="Destinatarul primeste pana la">
            <Input type="time" value={oraInchidereLivrare} onChange={(e) => setOraInchidereLivrare(e.target.value)} />
          </Field>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Valideaza borderoul automat</p>
            {/*
              ⚠ Implicit OPRIT, si nu din prudenta decorativa. Un borderou strange
              partidele mai multor comenzi; validat, pleaca TOT ce e in el si nimic
              din el nu se mai poate anula.
            */}
            <p className="text-xs text-muted-foreground">
              Marfa nu pleaca pana cand borderoul nu e validat. Cu comutatorul pornit,
              validarea se face imediat dupa emitere — dar un borderou contine si
              partidele altor comenzi facute in aceeasi zi, iar dupa validare
              <span className="font-medium"> niciuna dintre ele nu se mai poate anula</span>.
              Lasat oprit, validezi tu, din comanda, cand esti gata.
            </p>
          </div>
          <Switch checked={valideazaAutomat} onCheckedChange={setValideazaAutomat} />
        </div>
      </Panel>

      <Button onClick={handleSave} disabled={saving || !completat} className="w-full sm:w-auto">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza configuratia"}
      </Button>
    </div>
  );
}
