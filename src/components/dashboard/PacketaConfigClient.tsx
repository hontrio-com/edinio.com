"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Info, Loader2, Unplug } from "lucide-react";
import {
  disconnectPacketa, getPacketaCurieriAction, savePacketaConfig, testPacketaConnectionAction,
} from "@/lib/actions/packeta.actions";
import type { FormatEticheta, PacketaConfig } from "@/lib/packeta/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { suprapuneri, textSuprapunere } from "@/lib/packeta/suprapunere";

/**
 * Configurarea Packeta.
 *
 * ═══ ⚠ DOUA CREDENTIALE, SI SUNT LUCRURI DIFERITE ═══
 *
 * `api_password` (32 hex) e primul argument al fiecarei metode din API-ul lor XML —
 * cu ea se creeaza coletele si se iau etichetele. `api_key` (16 caractere) circula
 * in CALEA adresei fluxurilor de puncte — cu ea se afla punctele si curierii.
 *
 * Una fara alta nu ajunge, si nu se pot inlocui intre ele. De aia proba de
 * conexiune le verifica SEPARAT si spune care lipseste: altfel comerciantul le
 * schimba pe amandoua la intamplare.
 *
 * ═══ ⚠ CE NU SE POATE, SI TREBUIE SPUS PE ECRAN ═══
 *
 * API-ul Packeta **nu are metoda de anulare**. Un colet creat gresit ramane creat
 * si se anuleaza doar de mana, din contul lor. Ecranul o spune, fiindca omul
 * trebuie sa stie asta INAINTE sa apese butonul de emitere, nu dupa.
 */

const FORMATE: { valoare: FormatEticheta; eticheta: string }[] = [
  { valoare: "A6 on A6", eticheta: "A6 pe A6 (eticheta singura)" },
  { valoare: "A7 on A7", eticheta: "A7 pe A7 (eticheta mica)" },
  { valoare: "A6 on A4", eticheta: "A6 pe A4 (patru pe pagina)" },
  { valoare: "A7 on A4", eticheta: "A7 pe A4 (opt pe pagina)" },
];

export function PacketaConfigClient({
  businessId,
  initialConfig,
  activiDirect = [],
}: {
  businessId: string;
  initialConfig: PacketaConfig | null;
  /** Curierii pe care magazinul ii are deja pornit pe cont propriu. */
  activiDirect?: string[];
}) {
  const router = useRouter();

  const [api_password, setApiPassword] = useState("");
  const [api_key, setApiKey] = useState("");
  const [eshop, setEshop] = useState(initialConfig?.eshop ?? "");
  const [folosestePuncte, setFolosestePuncte] = useState(initialConfig?.foloseste_puncte !== false);
  const [folosesteAutomate, setFolosesteAutomate] = useState(initialConfig?.foloseste_automate !== false);
  const [etichetaCurier, setEtichetaCurier] = useState(initialConfig?.eticheta_curier === true);
  const [format, setFormat] = useState<FormatEticheta>(initialConfig?.eticheta_format ?? "A6 on A6");
  const [valoareImplicita, setValoareImplicita] = useState(String(initialConfig?.valoare_implicita ?? 100));
  const [curieriPermisi, setCurieriPermisi] = useState<string[]>(initialConfig?.curieri_permisi ?? []);

  const [curieri, setCurieri] = useState<{ id: string; nume: string; arePuncte: boolean; faraRamburs: boolean }[]>([]);
  const [seIncarcaCurieri, setSeIncarcaCurieri] = useState(false);
  const [salveaza, setSalveaza] = useState(false);
  const [proba, setProba] = useState(false);

  /* Parolele nu ajung in browser (sunt mascate), deci prezenta lor se citeste din config. */
  const areParola = api_password.trim() !== "" || secretulEsteSalvat(initialConfig, "api_password");
  const areCheie = api_key.trim() !== "" || secretulEsteSalvat(initialConfig, "api_key");

  /* ⚠ ACEEASI regula ca `packetaGata` de pe server. */
  const isActive = !!(initialConfig?.enabled && (initialConfig?.eshop ?? "").trim() && secretulEsteSalvat(initialConfig, "api_password"));

  function construieste(): PacketaConfig {
    return {
      enabled: true,
      /* Gol = „n-am schimbat"; serverul pastreaza valoarea veche. */
      api_password: api_password.trim() || undefined,
      api_key: api_key.trim() || undefined,
      eshop: eshop.trim(),
      foloseste_puncte: folosestePuncte,
      foloseste_automate: folosesteAutomate,
      eticheta_curier: etichetaCurier,
      eticheta_format: format,
      valoare_implicita: Number(valoareImplicita) || 0,
      curieri_permisi: curieriPermisi,
    };
  }

  async function handleSave() {
    if (!areParola) return toast.error("Completeaza parola API (api_password)");
    if (!eshop.trim()) {
      return toast.error("Completeaza eticheta de expeditor — fara ea nu pleaca niciun colet");
    }
    setSalveaza(true);
    const r = await savePacketaConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea Packeta a fost salvata");
    router.refresh();
  }

  async function handleProba() {
    setProba(true);
    const r = await testPacketaConnectionAction(businessId);
    setProba(false);
    if ("error" in r) return toast.error(r.error);
    if (r.ok) return toast.success(r.mesaj);
    toast.error(r.mesaj || "Credentialele nu au trecut proba");
  }

  async function incarcaCurieri() {
    setSeIncarcaCurieri(true);
    const r = await getPacketaCurieriAction(businessId);
    setSeIncarcaCurieri(false);
    if ("error" in r) return toast.error(r.error);
    setCurieri(r.curieri);
    if (r.curieri.length === 0) toast.info("Contul tau nu are niciun curier de livrare la adresa in Romania.");
  }

  async function handleDisconnect() {
    if (!confirm("Sigur deconectezi Packeta? Coletele deja create raman la ei.")) return;
    const r = await disconnectPacketa(businessId);
    if ("error" in r) return toast.error(r.error);
    toast.success("Packeta a fost deconectata");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout variant="success" icon={CheckCircle}>
          Packeta e conectata. Coletele se emit din pagina comenzii.
        </Callout>
      )}

      {/*
        * ⚠ Se spune DE LA INCEPUT ce nu se poate.
        *
        * Anularea lipseste din API-ul lor, iar asta schimba felul in care omul
        * lucreaza: la ceilalti curieri o greseala se repara cu un buton, aici se
        * repara intrand in contul Packeta.
        */}
      <Callout variant="warning" icon={AlertTriangle}>
        <strong>Packeta nu permite anularea coletelor prin API.</strong> Un colet creat gresit
        ramane la ei si trebuie anulat de mana din contul Packeta. De aceea verificam datele
        inainte de fiecare emitere — dar merita sa te uiti peste adresa inainte sa apesi.
      </Callout>

      <Panel title="Credentiale">
        <Callout variant="info" icon={Info}>
          Packeta are <strong>doua</strong> credentiale, si sunt lucruri diferite. Le gasesti in
          contul tau, la Client section {"->"} API. Parola API creeaza coletele; cheia API aduce
          lista punctelor de ridicare.
        </Callout>

        <Field label="Parola API (api_password)" hint="32 de caractere. Cu ea se creeaza coletele si se iau etichetele.">
          <Input
            type="password"
            value={api_password}
            onChange={(e) => setApiPassword(e.target.value)}
            placeholder={secretulEsteSalvat(initialConfig, "api_password") ? PLACEHOLDER_SECRET_SALVAT : "Parola API"}
          />
        </Field>

        <Field label="Cheia API (api_key)" hint="16 caractere. Fara ea nu putem afisa punctele de ridicare in checkout.">
          <Input
            type="password"
            value={api_key}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "Cheia API"}
          />
        </Field>

        <Field
          label="Eticheta de expeditor (eshop)"
          hint="Numele expeditorului din contul Packeta. ⚠ Scris gresit, ei CREEAZA un expeditor nou si facturarea se incurca — copiaza-l exact."
        >
          <Input value={eshop} onChange={(e) => setEshop(e.target.value)} placeholder="MagazinulMeu" />
        </Field>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={salveaza}>
            {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salveaza"}
          </Button>
          <Button variant="outline" onClick={handleProba} disabled={proba || !areParola}>
            {proba ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifica"}
          </Button>
        </div>
        {!areCheie && (
          <p className="text-xs text-muted-foreground">
            Fara cheia API punctele de ridicare nu apar in checkout, dar livrarea la adresa merge.
          </p>
        )}
      </Panel>

      <Panel title="Ce se ofera in checkout">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Puncte de ridicare Packeta</p>
            <p className="text-xs text-muted-foreground">Magazinele partenere unde clientul isi ridica coletul.</p>
          </div>
          <Switch checked={folosestePuncte} onCheckedChange={setFolosestePuncte} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Automate Z-BOX</p>
            <p className="text-xs text-muted-foreground">Deschise non-stop. Clientul are nevoie de aplicatia Packeta.</p>
          </div>
          <Switch checked={folosesteAutomate} onCheckedChange={setFolosesteAutomate} />
        </div>

        {/*
          * ⚠ Livrarea la adresa NU e un serviciu al Packetei: e revanzarea unui
          * curier local. Fara unul ales aici n-avem ce trimite ca destinatie, deci
          * optiunea nici nu apare in checkout.
          */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Livrare la adresa</p>
              <p className="text-xs text-muted-foreground">
                Packeta livreaza la adresa prin curieri locali. Alege pe care ii oferi — fara
                niciunul, optiunea nu apare in checkout.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={incarcaCurieri} disabled={seIncarcaCurieri || !areCheie}>
              {seIncarcaCurieri ? <Loader2 className="h-4 w-4 animate-spin" /> : "Incarca curierii"}
            </Button>
          </div>

          {curieri.length > 0 && (
            <div className="space-y-1">
              {curieri.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-border accent-primary"
                    checked={curieriPermisi.includes(c.id)}
                    onChange={(e) =>
                      setCurieriPermisi((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))
                    }
                  />
                  <span>{c.nume}</span>
                  {/* Curierii cu retea proprie de puncte cer si codul punctului: nu-i putem
                      oferi ca simpla livrare la adresa. */}
                  {c.arePuncte && (
                    <span className="text-[10px] text-muted-foreground">(are puncte proprii — livrare la adresa indisponibila)</span>
                  )}
                  {c.faraRamburs && <span className="text-[10px] text-amber-600">(fara ramburs)</span>}
                </label>
              ))}
            </div>
          )}
          {/*
            * ⚠ Suprapunerea, a TREIA oara.
            *
            * In Romania Packeta revinde Cargus, FAN, DPD si Sameday — pe care ii
            * avem direct, iar trei dintre ei si prin Innoship. Acelasi curier
            * poate ajunge in checkout pe trei cai, cu trei preturi. Nu e un
            * defect, dar trebuie spus.
            */}
          {(() => {
            const s = suprapuneri(curieri, activiDirect, curieriPermisi);
            const text = textSuprapunere(s);
            return text ? (
              <Callout variant="warning" icon={AlertTriangle}>{text}</Callout>
            ) : null;
          })()}

          {curieriPermisi.length === 0 && curieri.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Niciun curier ales: in checkout apar doar punctele de ridicare.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Etichete si valoare">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Tipareste eticheta curierului</p>
            {/*
              * ⚠ Alegerea COSTA BANI, si de aia e o setare, nu o hotarare de-a
              * noastra: documentatia lor spune ca un colet trimis catre un curier
              * extern cu eticheta Packeta pe el se reeticheteaza la depozitul lor,
              * si reetichetarea se factureaza.
              */}
            <p className="text-xs text-muted-foreground">
              Pentru coletele care pleaca la un curier (Cargus, FAN, DPD…), Packeta cere eticheta
              curierului. Cu eticheta lor pe un astfel de colet, ei o refac la depozit si o
              factureaza separat.
            </p>
          </div>
          <Switch checked={etichetaCurier} onCheckedChange={setEtichetaCurier} />
        </div>

        <Field label="Formatul etichetei Packeta">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as FormatEticheta)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground"
          >
            {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
          </select>
        </Field>

        <Field
          label="Valoare declarata implicita (lei)"
          hint="Packeta cere OBLIGATORIU o valoare, pentru asigurare. Se foloseste cand comanda nu are una."
        >
          <Input
            type="number"
            min={0}
            value={valoareImplicita}
            onChange={(e) => setValoareImplicita(e.target.value)}
          />
        </Field>
      </Panel>

      {isActive && (
        <Button variant="outline" onClick={handleDisconnect} className="text-red-600">
          <Unplug className="h-4 w-4 mr-2" /> Deconecteaza Packeta
        </Button>
      )}
    </div>
  );
}
