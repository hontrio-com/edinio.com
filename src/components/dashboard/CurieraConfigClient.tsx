"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ChevronRight, Info, Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
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
  { valoare: "a6", eticheta: "A6 (eticheta compacta, imprimante de etichete)" },
  { valoare: "a4", eticheta: "A4 (foaie intreaga)" },
];

const TEXT_ANULARE: Record<DreptAnulare, string> = {
  oricand: "Cheia poate anula un AWB oricand, si dupa ridicare.",
  pana_la_ridicare: "Cheia poate anula un AWB doar pana cand curierul ridica coletul.",
  niciodata: "Cheia nu are dreptul sa anuleze AWB-uri: anularea se cere din contul Curiera.",
  necunoscut: "Nu am putut afla ce drept de anulare are cheia.",
};

/**
 * Optiunile unui select de servicii: lista contului, plus valoarea deja aleasa daca nu e
 * in ea. Fara a doua parte, `<select>` ar arata alt serviciu decat cel salvat, iar prima
 * salvare l-ar schimba tacut (lectia formatului GLS).
 */
function optiuni(lista: ServiciuCuriera[], ales: string): ServiciuCuriera[] {
  if (!ales || lista.some((s) => s.id === ales)) return lista;
  return [...lista, { id: ales, nume: `${ales} (nu apare in lista contului)` }];
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
    if (!areCheie) return toast.error("Completeaza cheia API din contul Curiera");
    /* ⚠ Doar cheia pleaca la proba, si NIMIC nu se salveaza: o cheie gresita tastata aici
       nu are voie sa o inlocuiasca pe cea buna. Gol = cheia salvata, rezolvata pe server. */
    setTesting(true);
    let r: Awaited<ReturnType<typeof testCurieraConnectionAction>>;
    try {
      r = await testCurieraConnectionAction(businessId, cheie.trim());
    } catch (err) {
      setProba(null);
      toast.error("Curiera nu a raspuns: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
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
    toast.success(`Conectat la Curiera${r.proba.firma ? ` · ${r.proba.firma}` : ""}`);
  }

  async function handleSave() {
    if (!areCheie) return toast.error("Completeaza cheia API");
    /* ⚠ Aceleasi campuri ca `curieraGata`: fara oricare, Curiera pune expedierea in
       ciorna („Lipseste orasul expeditorului"), deci configurarea n-ar emite nimic. */
    if (!nume.trim() || !adresa.trim() || !oras.trim() || !judet.trim()) {
      return toast.error("Completeaza adresa de ridicare: nume, adresa, oras si judet");
    }
    if (!telefon.trim()) return toast.error("Telefonul de la ridicare e obligatoriu");

    setSaving(true);
    let r: Awaited<ReturnType<typeof saveCurieraConfig>>;
    try {
      r = await saveCurieraConfig(businessId, construieste());
    } catch (err) {
      toast.error("Configurarea nu s-a putut salva: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
      return;
    } finally {
      setSaving(false);
    }

    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea Curiera a fost salvata");
    setCheie("");
    router.refresh();
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    let r: Awaited<ReturnType<typeof disconnectCuriera>>;
    try {
      r = await disconnectCuriera(businessId);
    } catch (err) {
      toast.error("Deconectarea nu s-a putut face: " + (err instanceof Error ? err.message : "cererea nu a ajuns la capat"));
      return;
    } finally {
      setDisconnecting(false);
    }

    if ("error" in r) return toast.error(r.error);
    toast.success("Curiera a fost deconectat");
    setProba(null);
    router.refresh();
  }

  function comutaExtra(id: string) {
    setExtra((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout
          variant="success"
          icon={CheckCircle}
          title="Curiera e activ"
          action={
            <ButonDeconectare
              nume="Curiera"
              cePierzi="Se sterge toata configurarea Curiera din Edinio: cheia API, adresa de ridicare si serviciile alese. Cheia nu se mai poate citi din Edinio, deci ca sa te intorci o iei din nou din contul Curiera. AWB-urile deja emise raman pe comenzi si in contul Curiera, dar urmarirea lor se opreste, iar etichetele le descarci de acum din contul Curiera. Metoda Curiera se opreste si in Setari -> Livrare."
              pending={disconnecting}
              onConfirma={handleDisconnect}
            />
          }
        >
          Ridicare din {initialConfig?.expeditor?.oras || "adresa necompletata"}
          {initialConfig?.expeditor?.judet ? `, ${initialConfig.expeditor.judet}` : ""}
        </Callout>
      )}

      {adresaIncompleta && (
        <Callout variant="warning" icon={AlertTriangle} title="Adresa de ridicare e incompleta">
          Fara nume, telefon, adresa, oras si judet, Curiera pune fiecare expediere in ciorna si
          nu o ridica. Pana le completezi, Curiera nu apare in checkout si nu se pot emite AWB-uri.
        </Callout>
      )}

      <Panel step={1} title="Cheia API">
        <p className="text-xs text-muted-foreground">
          Cheia API o gasesti in contul tau Curiera sau o ceri de la Curiera. E singura credentiala: cine o are poate
          emite si anula AWB-uri pe contul tau.
        </p>

        <Field label="Cheia API" required>
          <Input
            type="password"
            value={cheie}
            onChange={(ev) => { setCheie(ev.target.value); setProba(null); }}
            placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "Cheia API din contul Curiera"}
          />
        </Field>

        <Button onClick={handleTest} disabled={testing || !areCheie}>
          {testing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          {testing ? "Se verifica..." : "Testeaza conexiunea"}
        </Button>

        {proba && (
          <div className="space-y-1 rounded-lg border border-success/20 bg-success/5 p-3 text-xs">
            <p className="font-semibold text-success">Conectat la Curiera</p>
            {proba.firma && <p className="text-foreground">{proba.firma}</p>}
            {proba.client && <p className="text-muted-foreground">Cont client: {proba.client}</p>}
            <p className="text-muted-foreground">{TEXT_ANULARE[proba.anulare]}</p>
          </div>
        )}

        {/*
          ⚠ Proba nu salveaza nimic (o cheie gresita nu are voie sa o inlocuiasca pe cea buna),
          deci dupa o proba reusita se spune pe fata ca nu s-a pastrat nimic. Altfel un refresh
          pierde tot, iar butonul de AWB nu apare la comenzi (cerut de el, 29.09.2026).
        */}
        {proba && !isActive && (
          <Callout variant="info" icon={Info}>
            {"Cheia merge, dar nimic nu e salvat inca. Completeaza adresa de ridicare de la pasul 2 si apasa „Salveaza”, jos. Pana atunci Curiera nu apare la comenzi si nici in checkout."}
          </Callout>
        )}
        {proba && isActive && cheie.trim() !== "" && (
          <Callout variant="info" icon={Info}>
            {"Cheia noua merge, dar nu e salvata: pana apesi „Salveaza”, ramane cea veche."}
          </Callout>
        )}

        {/* ⚠ O cheie de angajat raspunde la proba, dar emiterea ar cere si contul clientului. */}
        {proba?.cheieDeClient === false && (
          <Callout variant="warning" icon={AlertTriangle}>
            Cheia nu apartine unui cont de client Curiera, deci emiterea AWB-urilor nu va merge.
            Foloseste cheia contului tau de client (o gasesti in contul Curiera sau o ceri de la ei).
          </Callout>
        )}
      </Panel>

      <Panel step={2} title="Adresa de ridicare">
        <p className="text-xs text-muted-foreground">
          De aici ridica Curiera coletele. Se trimite la fiecare AWB; diacriticele se scot la
          trimitere, fiindca pe eticheta lor ar iesi semne de intrebare.
        </p>

        {/* ⚠ De la Curiera nu vine nicio adresa (vezi `precompletare.ts`), deci sursa e magazinul. */}
        {aPropusCeva(propunere) && (
          <Callout variant="info" icon={Info}>
            {"Am completat ce stiam din datele magazinului (Setari). Verifica-le: aici trebuie adresa de unde ridica Curiera coletele, iar ce lipseste completezi tu."}
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
          <Field label="Adresa (strada, numar, bloc)" required className="sm:col-span-2">
            <Input value={adresa} onChange={(ev) => setAdresa(ev.target.value)} placeholder="Strada Eroilor nr. 12, bl. A2" />
          </Field>
          <Field label="Oras" required>
            <Input value={oras} onChange={(ev) => setOras(ev.target.value)} placeholder="Cluj-Napoca" />
          </Field>
          <Field label="Judet" required>
            <select
              value={judet}
              onChange={(ev) => setJudet(ev.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Alege judetul</option>
              {judeteDeAles.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </Field>
          <Field label="Cod postal">
            <Input value={codPostal} onChange={(ev) => setCodPostal(ev.target.value)} placeholder="400129" />
          </Field>
        </div>
      </Panel>

      <Panel step={3} title="Servicii si eticheta">
        {!proba && (
          <Callout variant="info" icon={Info}>
            {"Apasa „Testeaza conexiunea” ca sa alegi serviciile din lista contului tau."}
            {" Un serviciu scris gresit face ca emiterea sa fie refuzata (Curiera nu il respinge pe loc, deci l-ai afla abia la primul AWB). Alege-l din lista."}
          </Callout>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Serviciul pentru livrarea la adresa">
            {proba && proba.servicii.length > 0 ? (
              <select
                value={serviciuAdresa}
                onChange={(ev) => setServiciuAdresa(ev.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {optiuni(proba.servicii, serviciuAdresa).map((s) => (
                  <option key={s.id} value={s.id}>{s.nume}</option>
                ))}
              </select>
            ) : (
              <Input
                value={serviciuAdresa}
                onChange={(ev) => setServiciuAdresa(ev.target.value)}
                placeholder={SERVICIU_ADRESA_IMPLICIT}
              />
            )}
          </Field>
          <Field label="Serviciul pentru livrarea la locker">
            {proba && proba.servicii.length > 0 ? (
              <select
                value={serviciuPunct}
                onChange={(ev) => setServiciuPunct(ev.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {optiuni(proba.servicii, serviciuPunct).map((s) => (
                  <option key={s.id} value={s.id}>{s.nume}</option>
                ))}
              </select>
            ) : (
              <Input
                value={serviciuPunct}
                onChange={(ev) => setServiciuPunct(ev.target.value)}
                placeholder={SERVICIU_PUNCT_IMPLICIT}
              />
            )}
          </Field>
        </div>
        {proba && !proba.serviciiCitite && (
          <p className="text-xs text-muted-foreground">
            {"Lista serviciilor nu s-a putut citi acum, deci campurile raman de scris de mana. Mai apasa o data „Testeaza conexiunea”."}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Ofera in checkout livrarea la locker sau punct de ridicare</p>
            <p className="text-xs text-muted-foreground">
              Cumparatorul isi alege un locker FANbox, un punct de ridicare sau un oficiu FAN (reteaua de puncte a Curiera).
              {" Pretul e cel fix din „Setari -> Livrare”; rambursul merge si la punct."}
            </p>
          </div>
          <Switch checked={lockere} onCheckedChange={setLockere} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Servicii extra puse pe fiecare AWB</p>
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
                ? "Lista apare dupa „Testeaza conexiunea”."
                : proba.extraCitite
                  ? "Contul nu are servicii extra."
                  : "Lista serviciilor extra nu s-a putut citi acum. Mai apasa o data „Testeaza conexiunea”."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Se platesc per colet, deci pornesc nebifate. Cele bifate aici vin bifate pe fiecare AWB, si le poti scoate la un AWB anume.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Declara valoarea comenzii ca asigurare</p>
            <p className="text-xs text-muted-foreground">
              Fereastra de AWB precompleteaza asigurarea cu totalul comenzii. Curiera o factureaza separat.
            </p>
          </div>
          <Switch checked={asigurare} onCheckedChange={setAsigurare} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marimea etichetei">
            <select
              value={marime}
              onChange={(ev) => setMarime(ev.target.value as DimensiuneEticheta)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {MARIMI.map((m) => <option key={m.valoare} value={m.valoare}>{m.eticheta}</option>)}
            </select>
          </Field>
          <Field label="Continut implicit" hint="Apare pe AWB cand comanda nu da unul mai bun.">
            <Input value={continut} onChange={(ev) => setContinut(ev.target.value)} placeholder="Produse" maxLength={255} />
          </Field>
        </div>
      </Panel>

      <Button onClick={handleSave} disabled={saving || !areCheie} className="w-full sm:w-auto">
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Se salveaza..." : "Salveaza"}
      </Button>
    </div>
  );
}
