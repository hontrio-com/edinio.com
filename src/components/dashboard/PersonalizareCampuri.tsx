"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import {
  MAX_CAMPURI, MAX_ETICHETA, MAX_OPTIUNI, TIPURI, UNITATI, laturaSchimbata,
  type CampPersonalizare, type Impact,
} from "@/lib/customization/definitie";
import { cn } from "@/lib/utils";

/**
 * Editorul campurilor de personalizare, din formularul de produs.
 *
 * ═══ ⚠ DE CE E UN FISIER SEPARAT ═══
 *
 * Blocul statea in `ProductForm.tsx` — un fisier de 2142 de randuri — ca 190 de randuri de JSX in
 * care fiecare reglaj isi repeta acelasi ritual de trei randuri: copiaza tabloul, inlocuieste
 * elementul, scrie starea. Cu inca patru tipuri de camp si cu preturi, ar fi trecut de 500.
 *
 * ⚠ SI NU E UN BUILDER. Nu exista arbore, nu exista reguli IF/THEN, nu exista formule scrise de
 * comerciant. E o lista de campuri cu reglaje — atat cat trebuie ca un fototapet sa se configureze
 * in cateva minute, si nici un pas mai mult.
 *
 * ═══ ⚠ REGLAJELE APAR DOAR UNDE SE APLICA ═══
 *
 * Un camp de text n-are margini de latime; un comutator n-are optiuni. Aratate toate deodata,
 * ecranul ar fi avut douazeci de reglaje din care noua fara inteles — iar comerciantul ar fi
 * completat ceva ce nu face nimic si ar fi asteptat sa faca.
 */

export type CampAdmin = CampPersonalizare;

/** Cum se socoteste pretul personalizarii. Aceeasi forma ca in modulul pur. */
export type ModPretAdmin =
  | { fel: "adaugat" }
  | {
      fel: "suprafata";
      campDimensiuni: string;
      tarif: number;
      campTarif?: string;
      includePretulProdusului: boolean;
      minimM2?: number;
      rotunjire?: 0 | 0.01 | 0.1 | 0.5 | 1;
    };

export interface StareCustomizare {
  enabled: boolean;
  fields: CampAdmin[];
  pret?: ModPretAdmin;
}

/** Etichetele tipurilor, in ordinea din meniu. */
const NUME_TIP: Record<string, string> = {
  text: "Text scurt",
  textarea: "Text lung",
  image: "Imagine (upload)",
  fisier: "Fisier (PDF sau imagine)",
  select: "Selectie (lista)",
  color: "Culoare",
  numar: "Numar",
  dimensiuni: "Dimensiuni (latime x inaltime)",
  butoane: "Butoane (o alegere)",
  comutator: "Da / Nu",
};

const INPUT =
  "w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:border-primary";
const ETICHETA = "block text-xs font-medium text-muted-foreground mb-1";

interface Props {
  stare: StareCustomizare;
  seteaza: (s: StareCustomizare) => void;
}

export function PersonalizareCampuri({ stare, seteaza }: Props) {
  const campuri = stare.fields;

  const schimba = (idx: number, patch: Partial<CampAdmin>) => {
    const fields = campuri.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    seteaza({ ...stare, fields });
  };

  const mutare = (idx: number, cu: number) => {
    const j = idx + cu;
    if (j < 0 || j >= campuri.length) return;
    const fields = [...campuri];
    [fields[idx], fields[j]] = [fields[j], fields[idx]];
    seteaza({ ...stare, fields });
  };

  const sterge = (idx: number) => {
    const fields = campuri.filter((_, i) => i !== idx);
    /*
     * ⚠ Cand dispare campul pe care se sprijina pretul pe suprafata, modul de pretuire se intoarce
     * la „adaugat". Lasat asa, comerciantul ar fi avut un produs care se pretuieste dupa un camp
     * care nu mai exista — iar cititorul l-ar fi tratat oricum ca „adaugat", deci ecranul ar fi
     * mintit despre ce se incaseaza.
     */
    const p = stare.pret;
    const pret =
      p?.fel === "suprafata" && !fields.some((c) => c.id === p.campDimensiuni)
        ? { fel: "adaugat" as const }
        : p;
    seteaza({ ...stare, fields, ...(pret ? { pret } : {}) });
  };

  /*
   * ⚠ PLAFOANELE CITITORULUI, ADUSE IN PANOU.
   *
   * `normalizeazaDefinitia` taie la `MAX_CAMPURI` campuri si `MAX_OPTIUNI` optiuni — dinadins,
   * fiindca purtarea aia apara CITIREA. Dar panoul nu le stia: comerciantul adauga campul 31,
   * primea „Salvat", si vitrina servea 30. Nimic pe ecran nu spunea care lipseste.
   *
   * ⚠ Se importa, nu se rescriu. Doua cifre in doua fisiere ar fi divergit la prima schimbare,
   * si atunci panoul ar fi promis exact ce cititorul arunca.
   */
  const laPlafonulDeCampuri = campuri.length >= MAX_CAMPURI;

  const adauga = () => {
    if (laPlafonulDeCampuri) return;
    seteaza({
      ...stare,
      fields: [
        ...campuri,
        { id: crypto.randomUUID(), type: "text", label: "", placeholder: "", required: false },
      ],
    });
  };

  const dimensiuni = campuri.filter((c) => c.type === "dimensiuni");
  const butoane = campuri.filter((c) => c.type === "butoane");

  return (
    <div className="space-y-4">
      <ModPret stare={stare} seteaza={seteaza} dimensiuni={dimensiuni} butoane={butoane} />

      {campuri.map((camp, idx) => (
        <div key={camp.id} className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {idx + 1}. {NUME_TIP[camp.type] ?? camp.type}
              {camp.required && <span className="ml-2 text-[10px] text-primary">Obligatoriu</span>}
              {areImpact(camp) && (
                <span className="ml-2 text-[10px] text-amber-600">Schimba pretul</span>
              )}
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" onClick={() => mutare(idx, -1)} disabled={idx === 0}
                aria-label="Muta mai sus"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => mutare(idx, 1)} disabled={idx === campuri.length - 1}
                aria-label="Muta mai jos"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => sterge(idx)} aria-label="Sterge campul"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETICHETA}>Tip camp</label>
              <select value={camp.type} onChange={(e) => schimba(idx, { type: e.target.value as CampAdmin["type"] })}
                className={INPUT}>
                {TIPURI.map((t) => <option key={t} value={t}>{NUME_TIP[t]}</option>)}
              </select>
            </div>
            <div>
              <label className={ETICHETA}>Obligatoriu</label>
              <button type="button" onClick={() => schimba(idx, { required: !camp.required })}
                className={cn("w-full py-2 text-xs font-semibold rounded-lg border transition-colors",
                  camp.required
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30")}>
                {camp.required ? "Da, obligatoriu" : "Nu, optional"}
              </button>
            </div>
          </div>

          <div>
            <label className={ETICHETA}>Eticheta</label>
            {/* ⚠ Acelasi plafon ca la citire: mai lung, textul s-ar fi taiat abia in vitrina. */}
            <input type="text" maxLength={MAX_ETICHETA}
              value={camp.label} onChange={(e) => schimba(idx, { label: e.target.value })}
              placeholder="ex: Dimensiunile peretelui" className={INPUT} />
          </div>

          <Reglaje camp={camp} idx={idx} schimba={schimba} />

          <div>
            <label className={ETICHETA}>Text ajutator (optional)</label>
            <input type="text" value={camp.helper_text ?? ""}
              onChange={(e) => schimba(idx, { helper_text: e.target.value || undefined })}
              placeholder="ex: Adauga 6-10 cm pentru o potrivire mai buna" className={INPUT} />
          </div>
        </div>
      ))}

      <button type="button" onClick={adauga} disabled={laPlafonulDeCampuri}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        <Plus className="h-4 w-4" /> Adauga camp de personalizare
      </button>
      {laPlafonulDeCampuri && (
        <p className="text-xs text-amber-600">
          Ai atins plafonul de {MAX_CAMPURI} campuri. Peste el, campurile in plus n-ar fi servite in
          magazin — asa ca butonul e oprit aici, nu la salvare.
        </p>
      )}

      {campuri.length === 0 && (
        <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
          Adauga campuri pe care clientii le vor completa la comanda
        </p>
      )}
    </div>
  );
}

function areImpact(c: CampAdmin): boolean {
  if (c.impact && c.impact.fel !== "fara") return true;
  return (c.optiuni ?? []).some((o) => o.impact && o.impact.fel !== "fara");
}

/* ═══════════════════════════════════════════════════════════════════════════
   Reglajele care apar doar unde se aplica
   ═══════════════════════════════════════════════════════════════════════════ */

interface RegProps {
  camp: CampAdmin;
  idx: number;
  schimba: (idx: number, patch: Partial<CampAdmin>) => void;
}

function Reglaje({ camp, idx, schimba }: RegProps) {
  const nr = (v: string) => (v === "" ? undefined : Number(v));

  switch (camp.type) {
    case "text":
    case "textarea":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ETICHETA}>Placeholder</label>
            <input type="text" value={camp.placeholder ?? ""}
              onChange={(e) => schimba(idx, { placeholder: e.target.value })}
              placeholder="ex: Scrie textul aici..." className={INPUT} />
          </div>
          <div>
            <label className={ETICHETA}>Caractere max</label>
            <input type="number" value={camp.max_length ?? ""}
              onChange={(e) => schimba(idx, { max_length: nr(e.target.value) })}
              placeholder="ex: 30" className={INPUT} />
          </div>
          <div className="col-span-2"><PretCamp camp={camp} idx={idx} schimba={schimba} cand="cand e completat" /></div>
        </div>
      );

    case "image":
    case "fisier":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ETICHETA}>Fisiere max</label>
            <input type="number" value={camp.max_files ?? ""}
              onChange={(e) => schimba(idx, { max_files: nr(e.target.value) })}
              placeholder="5" className={INPUT} />
          </div>
          <div>
            <label className={ETICHETA}>MB pe fisier</label>
            {/* ⚠ Implicitul difera: un PDF de tipar la un metru patrat trece lejer de 10 MB. */}
            <input type="number" value={camp.max_file_size_mb ?? ""}
              onChange={(e) => schimba(idx, { max_file_size_mb: nr(e.target.value) })}
              placeholder={camp.type === "fisier" ? "40" : "10"} className={INPUT} />
          </div>
          {camp.type === "fisier" && (
            <p className="col-span-2 text-[11px] text-muted-foreground">
              {/* ⚠ Comerciantul trebuie sa afle DE CE exista doua tipuri, altfel alege gresit. */}
              Clientul poate incarca PDF sau imagini. Alege „Imagine (upload)" cand vrei doar poze —
              acolo se vede miniatura, aici doar numele fisierului.
            </p>
          )}
          <div className="col-span-2"><PretCamp camp={camp} idx={idx} schimba={schimba} cand="cand e incarcat" /></div>
        </div>
      );

    case "select":
      return (
        <div>
          <label className={ETICHETA}>Optiuni (una pe rand)</label>
          <textarea rows={3} value={(camp.options ?? []).join("\n")}
            onChange={(e) => schimba(idx, { options: e.target.value.split("\n").filter((o) => o.trim()) })}
            placeholder={"Clasic\nModern"} className={`${INPUT} resize-none`} />
          <p className="text-[11px] text-muted-foreground mt-1">
            ⚠ Optiunile astea nu pot avea pret. Pentru preturi diferite, foloseste <strong>Butoane</strong>.
          </p>
        </div>
      );

    case "color":
      return (
        <div>
          <label className={ETICHETA}>Culoare implicita</label>
          <input type="color" value={camp.default_color ?? "#000000"}
            onChange={(e) => schimba(idx, { default_color: e.target.value })}
            className="w-12 h-9 rounded-lg border border-border cursor-pointer" />
        </div>
      );

    case "numar":
      return (
        <div className="grid grid-cols-4 gap-2">
          {([["min", "Minim"], ["max", "Maxim"], ["pas", "Pas"], ["implicit", "Implicit"]] as const).map(([k, e]) => (
            <div key={k}>
              <label className={ETICHETA}>{e}</label>
              <input type="number" value={(camp[k] as number | undefined) ?? ""}
                onChange={(ev) => schimba(idx, { [k]: nr(ev.target.value) } as Partial<CampAdmin>)}
                className={INPUT} />
            </div>
          ))}
          <div className="col-span-2">
            <label className={ETICHETA}>Unitate (doar text)</label>
            <input type="text" value={camp.unitate_text ?? ""}
              onChange={(e) => schimba(idx, { unitate_text: e.target.value || undefined })}
              placeholder="ex: buc" className={INPUT} />
          </div>
          <div className="col-span-2"><PretCamp camp={camp} idx={idx} schimba={schimba} cand="cand e completat" /></div>
        </div>
      );

    case "dimensiuni":
      return (
        <div className="space-y-3">
          <div>
            <label className={ETICHETA}>Unitate</label>
            <select value={camp.unitate ?? "cm"}
              onChange={(e) => schimba(idx, { unitate: e.target.value as "mm" | "cm" | "m" })}
              className={INPUT}>
              {UNITATI.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {(["latime", "inaltime"] as const).map((latura) => {
            const v = camp[latura];
            /*
             * ⚠ REGULA E IN MODULUL PUR, nu aici: greseala a fost tocmai in reducerul asta, iar
             * in componenta nu se putea proba. Vezi `laturaSchimbata` pentru ce fabrica forma
             * veche si cat costa.
             */
            const pune = (k: "min" | "max" | "implicit" | "pas", val: number | undefined) =>
              schimba(idx, {
                [latura]: laturaSchimbata(v as Record<string, number> | undefined, k, val),
              } as unknown as Partial<CampAdmin>);
            return (
              <div key={latura} className="grid grid-cols-4 gap-2">
                <div>
                  <label className={ETICHETA}>{latura === "latime" ? "Latime" : "Inaltime"} min</label>
                  <input type="number" value={v?.min ?? ""} onChange={(e) => pune("min", nr(e.target.value))}
                    placeholder={latura === "latime" ? "100" : "70"} className={INPUT} />
                </div>
                <div>
                  <label className={ETICHETA}>max</label>
                  <input type="number" value={v?.max ?? ""} onChange={(e) => pune("max", nr(e.target.value))}
                    placeholder={latura === "latime" ? "500" : "350"} className={INPUT} />
                </div>
                <div>
                  <label className={ETICHETA}>implicit</label>
                  <input type="number" value={v?.implicit ?? ""} onChange={(e) => pune("implicit", nr(e.target.value))}
                    className={INPUT} />
                </div>
                <div>
                  {/* ⚠ Pe FIECARE latura: materialele vin pe role, si de obicei doar una din
                      cele doua masuri e legata de latimea rolei. Un pas pe tot campul l-ar fi
                      impus si acolo unde nu exista. */}
                  <label className={ETICHETA}>pas</label>
                  <input type="number" value={v?.pas ?? ""} onChange={(e) => pune("pas", nr(e.target.value))}
                    placeholder="oricat" className={INPUT} />
                </div>
              </div>
            );
          })}
        </div>
      );

    case "butoane":
      return <Optiuni camp={camp} idx={idx} schimba={schimba} />;

    case "comutator":
      return <PretCamp camp={camp} idx={idx} schimba={schimba} cand="cand e pornit" />;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Pretul unei alegeri
   ═══════════════════════════════════════════════════════════════════════════ */

function PretCamp({ camp, idx, schimba, cand }: RegProps & { cand: string }) {
  const imp = camp.impact ?? { fel: "fara" as const };
  return (
    <ImpactEditor
      impact={imp}
      cand={cand}
      seteaza={(i) => schimba(idx, { impact: i })}
    />
  );
}

function ImpactEditor({ impact, cand, seteaza }: { impact: Impact; cand: string; seteaza: (i: Impact) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[150px]">
        <label className={ETICHETA}>Pret {cand}</label>
        <select
          value={impact.fel}
          onChange={(e) => {
            const fel = e.target.value as Impact["fel"];
            seteaza(fel === "fara" ? { fel: "fara" } : { fel, suma: impact.fel === "fara" ? 0 : impact.suma });
          }}
          className={INPUT}
        >
          <option value="fara">Fara pret</option>
          <option value="fix">Suma fixa (lei)</option>
          <option value="pe_m2">Pe metru patrat (lei/m²)</option>
        </select>
      </div>
      {impact.fel !== "fara" && (
        <div className="w-28">
          <label className={ETICHETA}>{impact.fel === "fix" ? "lei" : "lei/m²"}</label>
          <input
            type="number" min={0} step="0.01" value={impact.suma}
            onChange={(e) => seteaza({ fel: impact.fel, suma: Math.max(0, Number(e.target.value) || 0) })}
            className={INPUT}
          />
        </div>
      )}
    </div>
  );
}

function Optiuni({ camp, idx, schimba }: RegProps) {
  const optiuni = camp.optiuni ?? [];
  const pune = (i: number, patch: Partial<(typeof optiuni)[number]>) =>
    schimba(idx, { optiuni: optiuni.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <div className="space-y-2">
      <label className={ETICHETA}>Optiuni</label>
      {optiuni.map((o, i) => (
        <div key={o.id} className="border border-border rounded-lg p-2.5 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <input type="text" value={o.eticheta} onChange={(e) => pune(i, { eticheta: e.target.value })}
              placeholder="ex: Premium" className={INPUT} />
            <button type="button" aria-label="Sterge optiunea"
              onClick={() => schimba(idx, { optiuni: optiuni.filter((_, j) => j !== i) })}
              className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ImpactEditor
            impact={o.impact ?? { fel: "fara" }}
            cand="cand e aleasa"
            seteaza={(im) => pune(i, { impact: im })}
          />
        </div>
      ))}
      <button type="button"
        onClick={() => schimba(idx, {
          /* ⚠ Acelasi plafon ca la citire: peste el, optiunile in plus se arunca in tacere. */
          optiuni: optiuni.length >= MAX_OPTIUNI
            ? optiuni
            : [...optiuni, { id: crypto.randomUUID(), eticheta: "", impact: { fel: "fara" } }],
        })}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
        <Plus className="h-3.5 w-3.5" /> Adauga optiune
      </button>
      {optiuni.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Fara optiuni, campul nu se poate completa. Adauga cel putin una.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Modul de pretuire
   ═══════════════════════════════════════════════════════════════════════════ */

function ModPret({
  stare, seteaza, dimensiuni, butoane,
}: Props & { dimensiuni: CampAdmin[]; butoane: CampAdmin[] }) {
  const pret = stare.pret ?? { fel: "adaugat" as const };
  const peSuprafata = pret.fel === "suprafata";

  const pune = (patch: Partial<Extract<ModPretAdmin, { fel: "suprafata" }>>) => {
    if (pret.fel !== "suprafata") return;
    seteaza({ ...stare, pret: { ...pret, ...patch } });
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
      <div>
        <label className={ETICHETA}>Cum se socoteste pretul</label>
        <select
          value={pret.fel}
          onChange={(e) => {
            if (e.target.value === "adaugat") { seteaza({ ...stare, pret: { fel: "adaugat" } }); return; }
            seteaza({
              ...stare,
              pret: {
                fel: "suprafata",
                campDimensiuni: dimensiuni[0]?.id ?? "",
                tarif: 0,
                includePretulProdusului: false,
              },
            });
          }}
          className={INPUT}
        >
          <option value="adaugat">Pretul produsului + suplimente</option>
          <option value="suprafata">Calculat din suprafata (lei/m²)</option>
        </select>
      </div>

      {peSuprafata && dimensiuni.length === 0 && (
        <p className="text-xs text-amber-600">
          ⚠ Ai nevoie de un camp de tip <strong>Dimensiuni</strong>. Pana atunci, pretul ramane cel al produsului.
        </p>
      )}

      {peSuprafata && dimensiuni.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETICHETA}>Campul de dimensiuni</label>
              <select value={pret.campDimensiuni} onChange={(e) => pune({ campDimensiuni: e.target.value })}
                className={INPUT}>
                {dimensiuni.map((c) => <option key={c.id} value={c.id}>{c.label || "Camp fara nume"}</option>)}
              </select>
            </div>
            <div>
              <label className={ETICHETA}>Tarif lei/m²</label>
              <input type="number" min={0} step="0.01" value={pret.tarif}
                onChange={(e) => pune({ tarif: Math.max(0, Number(e.target.value) || 0) })}
                placeholder="69" className={INPUT} />
            </div>
          </div>

          <div>
            <label className={ETICHETA}>Tariful vine din (optional)</label>
            <select value={pret.campTarif ?? ""} onChange={(e) => pune({ campTarif: e.target.value || undefined })}
              className={INPUT}>
              <option value="">Tariful de mai sus, pentru toti</option>
              {butoane.map((c) => <option key={c.id} value={c.id}>{c.label || "Camp fara nume"}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Ex: „Material&rdquo; cu Standard 69 lei/m² si Premium 89 lei/m². Optiunea aleasa
              <strong> inlocuieste</strong> tariful, nu se adauga peste el.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETICHETA}>Suprafata minima facturata (m²)</label>
              <input type="number" min={0} step="0.01" value={pret.minimM2 ?? ""}
                onChange={(e) => pune({ minimM2: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                placeholder="ex: 1" className={INPUT} />
            </div>
            <div>
              <label className={ETICHETA}>Rotunjeste suprafata in sus la</label>
              <select value={String(pret.rotunjire ?? 0)}
                onChange={(e) => pune({ rotunjire: Number(e.target.value) as 0 | 0.01 | 0.1 | 0.5 | 1 })}
                className={INPUT}>
                <option value="0">Exact</option>
                <option value="0.01">0,01 m²</option>
                <option value="0.1">0,1 m²</option>
                <option value="0.5">0,5 m²</option>
                <option value="1">1 m²</option>
              </select>
            </div>
          </div>

          <button type="button"
            onClick={() => pune({ includePretulProdusului: !pret.includePretulProdusului })}
            className={cn("w-full py-2 text-xs font-semibold rounded-lg border transition-colors",
              pret.includePretulProdusului
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30")}>
            {pret.includePretulProdusului
              ? "Se adauga SI pretul produsului"
              : "Doar suprafata (pretul produsului nu se incaseaza)"}
          </button>
          <p className="text-[11px] text-muted-foreground">
            ⚠ La un fototapet vandut la metru patrat, lasa-l stins: altfel clientul plateste si un
            pret de baza care nu corespunde niciunei bucati de marfa.
          </p>
        </div>
      )}
    </div>
  );
}
