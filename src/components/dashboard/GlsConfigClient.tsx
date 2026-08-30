"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Loader2, Unplug } from "lucide-react";
import { saveGlsConfig, disconnectGls, testGlsConnectionAction } from "@/lib/actions/gls.actions";
import {
  TARI_MYGLS,
  TIPURI_IMPRIMANTA,
  type GlsConfig,
  type TaraMyGls,
  type TipImprimanta,
} from "@/lib/gls/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

const NUME_TARA: Record<TaraMyGls, string> = {
  RO: "Romania",
  HU: "Ungaria",
  CZ: "Cehia",
  SK: "Slovacia",
  SI: "Slovenia",
  HR: "Croatia",
  RS: "Serbia",
};

/**
 * Configurarea GLS (MyGLS).
 *
 * ⚠ „Testeaza conexiunea" face o CITIRE la GLS, nu o emitere. Un buton care ar
 * emite AWB ar factura un colet real la fiecare apasare — iar butonul asta se
 * apasa de zece ori pana ies datele bune.
 *
 * ⚠ NU exista aici comutatoare pentru serviciile optionale (SMS, livrare
 * flexibila, asigurare), si comentariul de dinainte spunea gresit ca „sunt
 * oprite din oficiu, comerciantul le porneste". Nu exista de unde. `OptiuniServicii`
 * din expediere.ts stie sa le construiasca, dar singurul camp trimis vreodata de
 * vreun apelant e `parcelShopId` (punctul ales de client in checkout).
 *
 * Se scrie asa cum e, ca sa nu mai caute nimeni un ecran care nu exista. Cand se
 * vor adauga, fiecare e un cost per colet la GLS — deci implicitul trebuie sa
 * ramana OPRIT, iar comerciantul sa vada ce plateste.
 */
export function GlsConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: GlsConfig | null;
}) {
  const router = useRouter();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testat, setTestat] = useState(false);

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState(initialConfig?.password ?? "");
  const [clientNumber, setClientNumber] = useState(
    initialConfig?.client_number ? String(initialConfig.client_number) : "",
  );
  const [tara, setTara] = useState<TaraMyGls>(initialConfig?.tara ?? "RO");
  const [sandbox, setSandbox] = useState(initialConfig?.sandbox ?? true);
  const [tipImprimanta, setTipImprimanta] = useState<TipImprimanta>(
    initialConfig?.tip_imprimanta ?? "A4_2x2",
  );
  const [pozitie, setPozitie] = useState(String(initialConfig?.pozitie_tiparire ?? 1));
  const [codPostal, setCodPostal] = useState(initialConfig?.expeditor_cod_postal ?? "");

  const isActive = !!(initialConfig?.enabled && initialConfig?.username && initialConfig?.client_number);
  const areParola = password.trim() !== "" || secretulEsteSalvat(initialConfig, "password");
  /*
   * ⚠ Codul postal intra in „completat", deci si in conditia butoanelor.
   *
   * `ZipCode` e camp REQUIRED in clasa `Address` a MyGLS, pentru adresa de
   * ridicare la fel ca pentru cea de livrare. Lasat gol, fiecare colet pleca cu
   * el necompletat si GLS refuza cu „Parcel validation issue" — un mesaj care nu
   * numeste niciun camp, deci comerciantul n-avea de unde sa ghiceasca ce
   * lipseste. Campul exista de la inceput, dar nu era nici obligatoriu, nici
   * verificat nicaieri.
   */
  const completat =
    username.trim() !== "" && areParola && clientNumber.trim() !== "" && codPostal.trim() !== "";

  /*
   * ⚠ Lista oferita e cea acceptata de EMITERE, plus valoarea deja salvata.
   *
   * `ShipItThermoZpl` a fost scos: apare in tabelul lui `GetPrintedLabels`
   * (pagina 19) dar NU si in al lui `PrintLabels` (pagina 23), iar Appendix A are
   * cod propriu pentru o valoare invalida (34). Formatul se alege o data si se
   * trimite la fiecare colet, deci un comerciant care l-ar alege n-ar mai putea
   * emite nimic.
   *
   * Valoarea salvata ramane in lista daca a fost aleasa cat timp era oferita —
   * altfel `<select>` ar aparea GOL si prima salvare i-ar schimba tacut formatul.
   */
  const formateDeAles = TIPURI_IMPRIMANTA.includes(tipImprimanta as never)
    ? [...TIPURI_IMPRIMANTA]
    : [...TIPURI_IMPRIMANTA, tipImprimanta];

  function construieste(): GlsConfig {
    return {
      enabled: true,
      username: username.trim(),
      password: password.trim(),
      client_number: Number(clientNumber.trim()),
      tara,
      sandbox,
      tip_imprimanta: tipImprimanta,
      pozitie_tiparire: Number(pozitie) || 1,
      expeditor_cod_postal: codPostal.trim(),
    };
  }

  async function handleTest() {
    if (!completat) {
      return toast.error("Completeaza utilizatorul, parola, Client Number-ul si codul postal de ridicare");
    }
    if (!Number.isFinite(Number(clientNumber.trim()))) {
      return toast.error("Client Number trebuie sa fie un numar");
    }

    setTesting(true);
    const r = await testGlsConnectionAction(businessId, construieste());
    setTesting(false);

    if ("error" in r) {
      setTestat(false);
      toast.error(`GLS: ${r.error}`);
      return;
    }
    setTestat(true);
    toast.success(`Conexiune GLS reusita (${sandbox ? "mediu de test" : "PRODUCTIE"})`);
  }

  async function handleSave() {
    if (!completat) return toast.error("Completeaza datele de acces");

    setSaving(true);
    const r = await saveGlsConfig(businessId, construieste());
    setSaving(false);

    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Configuratie GLS salvata");
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectGls(businessId);
    setDisconnecting(false);
    if ("error" in r) toast.error(r.error);
    else {
      toast.success("GLS deconectat");
      setTestat(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="GLS activ"
          action={
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
              Deconecteaza
            </Button>
          }
        >
          {initialConfig?.username} · Client {initialConfig?.client_number} ·{" "}
          {NUME_TARA[initialConfig?.tara ?? "RO"]}
          {initialConfig?.sandbox ? " · mediu de test" : ""}
        </Callout>
      )}

      {/*
        ⚠ Avertismentul pentru productie. Spre deosebire de alti curieri, la GLS
        fiecare AWB emis e un colet facturat chiar daca nu-l predai niciodata —
        de aia mediul se vede si aici, nu doar in comutator.
      */}
      {!sandbox && (
        <Callout variant="warning" icon={AlertTriangle} title="Mediu de PRODUCTIE">
          Fiecare AWB emis creeaza un colet real la GLS si intra pe factura, chiar
          daca nu il predai curierului. Foloseste mediul de test cat timp verifici
          configurarea.
        </Callout>
      )}

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            1
          </span>
          <h3 className="text-sm font-semibold text-foreground">Date de acces MyGLS</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Sunt datele cu care intri in MyGLS, primite la semnarea contractului cu GLS.
          Client Number-ul apare in contract si pe facturile GLS.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Utilizator" required>
            <Input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setTestat(false); }}
              placeholder="user@firma.ro"
            />
          </Field>
          <Field label="Parola" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setTestat(false); }}
              placeholder={
                secretulEsteSalvat(initialConfig, "password")
                  ? PLACEHOLDER_SECRET_SALVAT
                  : "Parola contului MyGLS"
              }
            />
          </Field>
          <Field label="Client Number" required>
            <Input
              type="text"
              inputMode="numeric"
              value={clientNumber}
              onChange={(e) => { setClientNumber(e.target.value.replace(/\D/g, "")); setTestat(false); }}
              placeholder="ex. 100123456"
            />
          </Field>
          <Field label="Cod postal ridicare" required>
            <Input
              type="text"
              inputMode="numeric"
              value={codPostal}
              onChange={(e) => setCodPostal(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="ex. 011857"
            />
            {/*
              * ⚠ Nu e un camp decorativ: GLS cere codul postal in adresa de
              * ridicare, iar in `businesses` nu exista niciunul — nici pentru
              * magazin, nici pentru firma. Ceilalti curieri nu-l cer fiindca
              * ridica de la un punct inregistrat la ei; GLS primeste adresa
              * intreaga la fiecare colet.
              */}
            <p className="mt-1 text-xs text-muted-foreground">
              Codul postal al adresei de unde ridica GLS coletele. Restul adresei se ia
              din setarile magazinului.
            </p>
          </Field>
          <Field label="Tara contractului" required>
            <select
              value={tara}
              onChange={(e) => { setTara(e.target.value as TaraMyGls); setTestat(false); }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TARI_MYGLS.map((t) => (
                <option key={t} value={t}>{NUME_TARA[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Mediu de test</p>
            <p className="text-xs text-muted-foreground">
              Trimite catre api.test.mygls.{tara.toLowerCase()} — coletele NU sunt reale si nu se factureaza.
            </p>
          </div>
          <Switch checked={sandbox} onCheckedChange={(v) => { setSandbox(v); setTestat(false); }} />
        </div>

        <Button onClick={handleTest} disabled={testing || !completat}>
          {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {testing ? "Se verifica..." : "Testeaza conexiunea"}
        </Button>

        {testat && (
          <p className="rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs font-semibold text-success">
            Datele de acces sunt valide.
          </p>
        )}
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            2
          </span>
          <h3 className="text-sm font-semibold text-foreground">Tiparirea etichetelor</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Format">
            <select
              value={tipImprimanta}
              onChange={(e) => setTipImprimanta(e.target.value as TipImprimanta)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {formateDeAles.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Pozitia pe coala">
            <select
              value={pozitie}
              onChange={(e) => setPozitie(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={tipImprimanta !== "A4_2x2"}
            >
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={String(p)}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          A4_2x2 pune patru etichete pe o coala A4; pozitia spune de la care sfert
          incepe tiparirea, ca sa poti folosi o coala inceputa. Thermo si Connect
          sunt pentru imprimante de etichete.
        </p>
      </Panel>

      <Button onClick={handleSave} disabled={saving || !completat} className="w-full sm:w-auto">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza configuratia"}
      </Button>
    </div>
  );
}
