"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, FileSignature, Loader2, MapPin, Printer } from "lucide-react";
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
import { Callout } from "@/components/ui/callout";
import {
  AlegereCarduri, BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";

const NUME_TARA: Record<TaraMyGls, string> = {
  RO: "România",
  HU: "Ungaria",
  CZ: "Cehia",
  SK: "Slovacia",
  SI: "Slovenia",
  HR: "Croația",
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

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = { username, password, clientNumber, tara, sandbox, tipImprimanta, pozitie, codPostal };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setUsername(reper.username); setPassword(reper.password); setClientNumber(reper.clientNumber); setTara(reper.tara);
    setSandbox(reper.sandbox); setTipImprimanta(reper.tipImprimanta); setPozitie(reper.pozitie); setCodPostal(reper.codPostal);
    setTestat(false);
  }

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
      return toast.error("Completează utilizatorul, parola, Client Number-ul și codul poștal de ridicare.");
    }
    if (!Number.isFinite(Number(clientNumber.trim()))) {
      return toast.error("Client Number trebuie să fie un număr.");
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
    toast.success(`Conexiune GLS reușită (${sandbox ? "mediu de test" : "PRODUCȚIE"}).`);
  }

  async function handleSave() {
    if (!completat) return toast.error("Completează datele de acces.");

    setSaving(true);
    const r = await saveGlsConfig(businessId, construieste());
    setSaving(false);

    if ("error" in r) toast.error(r.error);
    else {
      toast.success("Configurația GLS a fost salvată.");
      setReper(valori);
      router.refresh();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const r = await disconnectGls(businessId);
    setDisconnecting(false);
    if ("error" in r) toast.error(r.error);
    else {
      toast.success("GLS a fost deconectat.");
      setTestat(false);
      router.refresh();
    }
  }

  const stari: StareAntet[] = isActive
    ? [{ ton: "bun", text: "Activ" }, initialConfig?.sandbox ? { ton: "asteptare", text: "Mediu de test" } : { ton: "info", text: "Producție" }]
    : [{ ton: "neutru", text: "Neconfigurat" }];

  return (
    <PaginaIntegrare
      id="gls"
      titlu="Livrare"
      descriere="Generezi AWB-uri GLS din comenzi, prin contul tău MyGLS."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Datele de acces MyGLS", facut: username.trim() !== "" && areParola && clientNumber.trim() !== "" },
          { text: "Codul poștal de ridicare", facut: codPostal.trim() !== "" },
          { text: "Conexiunea testată", facut: testat },
          { text: "GLS activ", facut: isActive },
        ]} />
        {isActive && (
          <CardCifre titlu="Configurarea salvată" randuri={[
            { eticheta: "Utilizator", valoare: initialConfig?.username || "-" },
            { eticheta: "Client Number", valoare: <span className="font-mono">{initialConfig?.client_number}</span> },
            { eticheta: "Țara", valoare: NUME_TARA[initialConfig?.tara ?? "RO"] },
            { eticheta: "Mediu", valoare: initialConfig?.sandbox ? "test" : "producție" },
          ]} />
        )}
        <CumFunctioneaza id="gls" puncte={[
          { Icon: FileSignature, text: "Datele MyGLS le primești la semnarea contractului; Client Number-ul apare în contract și pe facturile GLS." },
          { Icon: MapPin, text: "GLS primește adresa întreagă la fiecare colet: restul adresei vine din setările magazinului." },
          { Icon: Printer, text: "Alegi formatul etichetelor: A4 cu patru pe coală sau imprimantă de etichete." },
          { Icon: AlertTriangle, text: "În producție, fiecare AWB emis e un colet facturat, chiar dacă nu-l predai curierului." },
        ]} />
      </>}
    >
      {/*
        ⚠ Avertismentul pentru productie. Spre deosebire de alti curieri, la GLS
        fiecare AWB emis e un colet facturat chiar daca nu-l predai niciodata,
        de aia mediul se vede si aici, nu doar in comutator.
      */}
      {!sandbox && (
        <Callout variant="warning" icon={AlertTriangle} title="Mediu de PRODUCȚIE">
          Fiecare AWB emis creează un colet real la GLS și intră pe factură, chiar dacă nu îl predai curierului.
          Folosește mediul de test cât timp verifici configurarea.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Date de acces MyGLS"
        descriere="Datele cu care intri în MyGLS, primite la semnarea contractului. Client Number-ul apare în contract și pe facturile GLS.">
        {/*
          ⚠ ORDINEA CAMPURILOR E ALEASA, NU INTAMPLATOARE. Cinci campuri intr-o
          grila de doua coloane lasa mereu o celula goala. Cu „Cod postal
          ridicare" pe randul din mijloc, explicatia lui de doua randuri inalta
          randul si sapa o gaura sub „Client Number", chiar in mijlocul cartonasului.
          Aratat de el pe captura, 22.09.2026.

          Mutat la urma, golul cade in coltul de jos, langa singurul camp cu
          explicatie, si randul nu mai e scobit pe dinauntru. `items-start` opreste
          si intinderea celulelor scunde pe inaltimea celei inalte.
        */}
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <Field label="Utilizator" htmlFor="gls-user" required>
            <Input
              id="gls-user"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setTestat(false); }}
              placeholder="user@firma.ro"
            />
          </Field>
          <Field label="Parola" htmlFor="gls-parola" required>
            <Input
              id="gls-parola"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setTestat(false); }}
              placeholder={secretulEsteSalvat(initialConfig, "password") ? PLACEHOLDER_SECRET_SALVAT : "Parola contului MyGLS"}
            />
          </Field>
          <Field label="Client Number" htmlFor="gls-client" required>
            <Input
              id="gls-client"
              type="text"
              inputMode="numeric"
              value={clientNumber}
              onChange={(e) => { setClientNumber(e.target.value.replace(/\D/g, "")); setTestat(false); }}
              placeholder="ex. 100123456"
            />
          </Field>
          <Field label="Țara contractului" htmlFor="gls-tara" required>
            <select
              id="gls-tara"
              value={tara}
              onChange={(e) => { setTara(e.target.value as TaraMyGls); setTestat(false); }}
              className={selectCls}
            >
              {TARI_MYGLS.map((t) => (
                <option key={t} value={t}>{NUME_TARA[t]}</option>
              ))}
            </select>
          </Field>
          {/*
            * ⚠ Nu e un camp decorativ: GLS cere codul postal in adresa de
            * ridicare, iar in `businesses` nu exista niciunul, nici pentru
            * magazin, nici pentru firma. Ceilalti curieri nu-l cer fiindca
            * ridica de la un punct inregistrat la ei; GLS primeste adresa
            * intreaga la fiecare colet.
            */}
          <Field
            label="Cod poștal ridicare"
            htmlFor="gls-cod"
            required
            hint="Codul poștal al adresei de unde ridică GLS coletele. Restul adresei se ia din setările magazinului."
          >
            <Input
              id="gls-cod"
              type="text"
              inputMode="numeric"
              value={codPostal}
              onChange={(e) => setCodPostal(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="ex. 011857"
            />
          </Field>
        </div>

        <AlegereCarduri
          eticheta="Mediul de lucru"
          valoare={sandbox}
          onChange={(v) => { setSandbox(v); setTestat(false); }}
          optiuni={[
            { valoare: true, titlu: "Mediu de test", text: <>Trimite către api.test.mygls.{tara.toLowerCase()}; coletele NU sunt reale și nu se facturează.</> },
            { valoare: false, titlu: "Producție", text: "Fiecare AWB e un colet real, facturat de GLS.", avertizare: true },
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleTest} disabled={testing || !completat}>
            {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
            {testing ? "Se verifică..." : "Testează conexiunea"}
          </Button>
          {testat && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle className="h-3.5 w-3.5" /> Datele de acces sunt valide.
            </span>
          )}
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Tipărirea etichetelor"
        descriere="A4_2x2 pune patru etichete pe o coală A4; poziția spune de la care sfert începe tipărirea, ca să poți folosi o coală începută. Thermo și Connect sunt pentru imprimante de etichete.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Format" htmlFor="gls-format">
            <select id="gls-format" value={tipImprimanta} onChange={(e) => setTipImprimanta(e.target.value as TipImprimanta)} className={selectCls}>
              {formateDeAles.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Poziția pe coală" htmlFor="gls-pozitie">
            <select id="gls-pozitie" value={pozitie} onChange={(e) => setPozitie(e.target.value)} className={selectCls} disabled={tipImprimanta !== "A4_2x2"}>
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={String(p)}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge datele de acces MyGLS din Edinio. Coletele deja create rămân la GLS.">
          <ButonDeconectare
            nume="GLS"
            cePierzi="Datele de acces MyGLS se șterg din Edinio, cu tot cu Client Number, codul poștal de ridicare și setările de tipărire. Coletele deja create rămân la GLS și rămân pe factura lor."
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
