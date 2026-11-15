"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, Info, KeyRound, Loader2, MapPin } from "lucide-react";
import {
  disconnectPacketa, getPacketaCurieriAction, savePacketaConfig, testPacketaConnectionAction,
} from "@/lib/actions/packeta.actions";
import type { FormatEticheta, PacketaConfig } from "@/lib/packeta/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import {
  BaraSalvare, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, RandComutator, Sectiune, ZonaDeconectare,
  type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { selectCls } from "@/lib/ui";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
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
  { valoare: "A6 on A6", eticheta: "A6 pe A6 (eticheta singură)" },
  { valoare: "A7 on A7", eticheta: "A7 pe A7 (eticheta mică)" },
  { valoare: "A6 on A4", eticheta: "A6 pe A4 (patru pe pagină)" },
  { valoare: "A7 on A4", eticheta: "A7 pe A4 (opt pe pagină)" },
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
  /* ⚠ MILIMETRI, nu centimetri: singurul curier din platforma care ii cere asa. */
  const [dimL, setDimL] = useState(String(initialConfig?.dimensiuni_implicite?.lungime ?? ""));
  const [dimW, setDimW] = useState(String(initialConfig?.dimensiuni_implicite?.latime ?? ""));
  const [dimH, setDimH] = useState(String(initialConfig?.dimensiuni_implicite?.inaltime ?? ""));
  const [taxaRo, setTaxaRo] = useState(initialConfig?.taxa_ro_supusa === true);
  const [taraOrigine, setTaraOrigine] = useState(initialConfig?.taxa_ro_tara_origine ?? "");

  const [curieri, setCurieri] = useState<{ id: string; nume: string; arePuncte: boolean; faraRamburs: boolean }[]>([]);
  const [seIncarcaCurieri, setSeIncarcaCurieri] = useState(false);
  const [salveaza, setSalveaza] = useState(false);
  const [proba, setProba] = useState(false);

  /* Bara de salvare: apare doar cand formularul s-a departat de ultima salvare. */
  const valori = {
    api_password, api_key, eshop, folosestePuncte, folosesteAutomate, etichetaCurier, format, valoareImplicita,
    curieriPermisi, dimL, dimW, dimH, taxaRo, taraOrigine,
  };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() {
    setApiPassword(reper.api_password); setApiKey(reper.api_key); setEshop(reper.eshop); setFolosestePuncte(reper.folosestePuncte);
    setFolosesteAutomate(reper.folosesteAutomate); setEtichetaCurier(reper.etichetaCurier); setFormat(reper.format);
    setValoareImplicita(reper.valoareImplicita); setCurieriPermisi(reper.curieriPermisi); setDimL(reper.dimL); setDimW(reper.dimW);
    setDimH(reper.dimH); setTaxaRo(reper.taxaRo); setTaraOrigine(reper.taraOrigine);
  }

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
      /*
       * ⚠ Se scriu abia cand toate trei au valoare: doua laturi din trei nu sunt dimensiuni,
       * iar o valoare partiala ar trece de garda si ar fi refuzata de ei.
       */
      dimensiuni_implicite:
        Number(dimL) > 0 && Number(dimW) > 0 && Number(dimH) > 0
          ? { lungime: Number(dimL), latime: Number(dimW), inaltime: Number(dimH) }
          : null,
      taxa_ro_supusa: taxaRo,
      taxa_ro_tara_origine: taxaRo ? taraOrigine.trim().toUpperCase() : null,
    };
  }

  async function handleSave() {
    if (!areParola) return toast.error("Completează parola API (api_password).");
    if (!eshop.trim()) {
      return toast.error("Completează eticheta de expeditor: fără ea nu pleacă niciun colet.");
    }
    /* ⚠ O declaratie de taxa pe jumatate e mai rea decat niciuna: ei o refuza la emitere. */
    if (taxaRo && !/^[A-Za-z]{2}$/.test(taraOrigine.trim())) {
      return toast.error("Completează țara de origine a mărfii, din două litere (de exemplu CN).");
    }
    setSalveaza(true);
    const r = await savePacketaConfig(businessId, construieste());
    setSalveaza(false);
    if ("error" in r) return toast.error(r.error);
    toast.success("Configurarea Packeta a fost salvată.");
    setReper(valori);
    router.refresh();
  }

  async function handleProba() {
    setProba(true);
    const r = await testPacketaConnectionAction(businessId);
    setProba(false);
    if ("error" in r) return toast.error(r.error);
    if (r.ok) return toast.success(r.mesaj);
    toast.error(r.mesaj || "Credențialele nu au trecut proba.");
  }

  async function incarcaCurieri() {
    setSeIncarcaCurieri(true);
    const r = await getPacketaCurieriAction(businessId);
    setSeIncarcaCurieri(false);
    if ("error" in r) return toast.error(r.error);
    setCurieri(r.curieri);
    if (r.curieri.length === 0) toast.info("Contul tău nu are niciun curier de livrare la adresă în România.");
  }

  async function handleDisconnect() {
    const r = await disconnectPacketa(businessId);
    if ("error" in r) return toast.error(r.error);
    toast.success("Packeta a fost deconectată.");
    router.refresh();
  }

  const stari: StareAntet[] = isActive ? [{ ton: "bun", text: "Conectată" }] : [{ ton: "neutru", text: "Neconfigurată" }];

  return (
    <PaginaIntegrare
      id="packeta"
      titlu="Livrare"
      descriere="Colete prin Packeta: puncte de ridicare și automate Z-BOX, sau livrare la adresă prin curierii locali cu care lucrează."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Parola API", facut: areParola },
          { text: "Cheia API (pentru puncte)", facut: areCheie },
          { text: "Eticheta de expeditor", facut: !!eshop.trim() },
          { text: "Packeta activă", facut: isActive },
        ]} />
        <CumFunctioneaza id="packeta" puncte={[
          { Icon: KeyRound, text: "Credențialele le găsești în contul Packeta, la Client section, API: parola creează coletele, cheia aduce punctele." },
          { Icon: MapPin, text: "La comandă, clientul alege un punct, un automat Z-BOX sau, dacă alegi curieri, livrarea la adresă." },
          { Icon: Ban, text: "API-ul Packeta nu are anulare: un colet creat greșit se anulează doar de mână, din contul lor." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Credențiale">
        <Callout variant="info" icon={Info}>
          Packeta are <strong>două</strong> credențiale, și sunt lucruri diferite. Le găsești în contul tău, la Client section,
          API. Parola API creează coletele; cheia API aduce lista punctelor de ridicare.
        </Callout>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Parola API (api_password)" htmlFor="packeta-parola" hint="32 de caractere. Cu ea se creează coletele și se iau etichetele.">
            <Input
              id="packeta-parola"
              type="password"
              value={api_password}
              onChange={(e) => setApiPassword(e.target.value)}
              placeholder={secretulEsteSalvat(initialConfig, "api_password") ? PLACEHOLDER_SECRET_SALVAT : "Parola API"}
            />
          </Field>
          <Field label="Cheia API (api_key)" htmlFor="packeta-cheie" hint="16 caractere. Fără ea nu putem afișa punctele de ridicare la comandă.">
            <Input
              id="packeta-cheie"
              type="password"
              value={api_key}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : "Cheia API"}
            />
          </Field>
        </div>

        <Field
          label="Eticheta de expeditor (eshop)"
          htmlFor="packeta-eshop"
          hint="Numele expeditorului din contul Packeta. Scris greșit, ei CREEAZĂ un expeditor nou și facturarea se încurcă: copiază-l exact."
        >
          <Input id="packeta-eshop" value={eshop} onChange={(e) => setEshop(e.target.value)} placeholder="MagazinulMeu" />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleProba} disabled={proba || !areParola}>
            {proba && <Loader2 className="animate-spin" />}
            Verifică credențialele
          </Button>
          {!areCheie && (
            <p className="text-xs text-muted-foreground">
              Fără cheia API punctele de ridicare nu apar la comandă, dar livrarea la adresă merge.
            </p>
          )}
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Ce se oferă la comandă">
        <RandComutator
          titlu="Puncte de ridicare Packeta"
          text="Magazinele partenere unde clientul își ridică coletul."
          activ={folosestePuncte}
          onChange={setFolosestePuncte}
        />
        <RandComutator
          separat
          titlu="Automate Z-BOX"
          text="Deschise non-stop. Clientul are nevoie de aplicația Packeta."
          activ={folosesteAutomate}
          onChange={setFolosesteAutomate}
        />

        {/*
          * ⚠ Livrarea la adresa NU e un serviciu al Packetei: e revanzarea unui
          * curier local. Fara unul ales aici n-avem ce trimite ca destinatie, deci
          * optiunea nici nu apare in checkout.
          */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Livrare la adresă</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Packeta livrează la adresă prin curieri locali. Alege pe care îi oferi; fără niciunul, opțiunea nu apare la comandă.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={incarcaCurieri} disabled={seIncarcaCurieri || !areCheie}>
              {seIncarcaCurieri && <Loader2 className="animate-spin" />}
              Încarcă curierii
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
                    <span className="text-[10px] text-muted-foreground">(are puncte proprii, livrare la adresă indisponibilă)</span>
                  )}
                  {c.faraRamburs && <span className="text-[10px] text-warning">(fără ramburs)</span>}
                </label>
              ))}
            </div>
          )}
          {/*
            * ⚠ Suprapunerea, a TREIA oara.
            *
            * In Romania Packeta revinde Cargus, FAN, DPD si Sameday, pe care ii
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
            <p className="text-xs text-muted-foreground">Niciun curier ales: la comandă apar doar punctele de ridicare.</p>
          )}
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Etichete și valoare">
        {/*
          * ⚠ Alegerea COSTA BANI, si de aia e o setare, nu o hotarare de-a
          * noastra: documentatia lor spune ca un colet trimis catre un curier
          * extern cu eticheta Packeta pe el se reeticheteaza la depozitul lor,
          * si reetichetarea se factureaza.
          */}
        <RandComutator
          titlu="Tipărește eticheta curierului"
          text="Pentru coletele care pleacă la un curier (Cargus, FAN, DPD…), Packeta cere eticheta curierului. Cu eticheta lor pe un astfel de colet, ei o refac la depozit și o facturează separat."
          activ={etichetaCurier}
          onChange={setEtichetaCurier}
        />

        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="Formatul etichetei Packeta" htmlFor="packeta-format">
            <select id="packeta-format" value={format} onChange={(e) => setFormat(e.target.value as FormatEticheta)} className={selectCls}>
              {FORMATE.map((f) => <option key={f.valoare} value={f.valoare}>{f.eticheta}</option>)}
            </select>
          </Field>
          <Field
            label="Valoare declarată implicită (lei)"
            htmlFor="packeta-valoare"
            hint="Packeta cere OBLIGATORIU o valoare, pentru asigurare. Se folosește când comanda nu are una."
          >
            <Input id="packeta-valoare" type="number" min={0} value={valoareImplicita} onChange={(e) => setValoareImplicita(e.target.value)} />
          </Field>
        </div>

        <Field
          label="Dimensiuni implicite (milimetri)"
          hint="Unii curieri le CER și refuză coletul fără ele. Se folosesc când comanda n-are dimensiuni. Milimetri, nu centimetri."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              ["Lungime", dimL, setDimL],
              ["Lățime", dimW, setDimW],
              ["Înălțime", dimH, setDimH],
            ] as const).map(([eticheta, valoare, pune]) => (
              <Input
                key={eticheta}
                type="number"
                min={0}
                placeholder={eticheta}
                aria-label={`${eticheta} (mm)`}
                value={valoare}
                onChange={(e) => pune(e.target.value)}
              />
            ))}
          </div>
        </Field>

        <div className="space-y-2 border-t border-border pt-4">
          <RandComutator
            titlu="Marfa mea e supusă taxei logistice din România"
            text="Din 1 ianuarie 2026, coletele cu marfă din AFARA UE, sub 150 EUR, sunt supuse unei taxe fixe. Pornește doar dacă marfa ta intră sub ea: declarația pleacă în numele tău."
            activ={taxaRo}
            onChange={setTaxaRo}
          />
          {taxaRo && (
            <Input
              maxLength={2}
              placeholder="Țara de origine a mărfii (ex. CN)"
              aria-label="Țara de origine a mărfii"
              value={taraOrigine}
              onChange={(e) => setTaraOrigine(e.target.value.toUpperCase())}
            />
          )}
        </div>
      </Sectiune>

      {isActive && (
        <ZonaDeconectare descriere="Șterge credențialele din Edinio. Coletele deja create rămân la Packeta.">
          <ButonDeconectare
            nume="Packeta"
            cePierzi="Cele două credențiale și eticheta de expeditor se șterg din Edinio, deci ca să te întorci le iei din nou din contul Packeta. Coletele deja create rămân la ei și se anulează doar de mână, din contul lor."
            eticheta="Deconectează Packeta"
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}

      <BaraSalvare
        modificat={isActive ? modificat : undefined}
        saving={salveaza}
        onSalveaza={handleSave}
        onRenunta={isActive ? renunta : undefined}
        textSalveaza={isActive ? "Salvează" : "Salvează și activează"}
      />
    </PaginaIntegrare>
  );
}
