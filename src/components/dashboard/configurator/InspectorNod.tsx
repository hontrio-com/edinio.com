"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { Nod, Optiune } from "@/lib/configurators/definitie";
import { adaugaOptiune, mutaOptiune, stergeOptiune } from "@/lib/configurators/editare";
import { esteUnitateLungime, inLungime, inMilimetri, type UnitateLungime } from "@/lib/configurators/unitati";

/**
 * Setarile optiunii alese.
 *
 * ⚠ SE ARATA DOAR CE ARE SENS PENTRU FELUL NODULUI. Un panou care le arata pe toate si le
 * dezactiveaza pe cele nepotrivite il pune pe comerciant sa citeasca de fiecare data o lista din
 * care jumatate nu-l priveste.
 *
 * ⚠ UNITATILE SE CONVERTESC LA GRANITA. Inauntru totul e in milimetri (vezi `unitati.ts`), dar
 * comerciantul scrie in unitatea pe care si-a ales-o. Conversia se face AICI, la citire si la
 * scriere, si niciodata in mijlocul unui calcul.
 */

export function InspectorNod({ nod, onSchimba }: { nod: Nod; onSchimba: (n: Nod) => void }) {
  const pune = (campuri: Partial<Nod>) => onSchimba({ ...nod, ...campuri } as Nod);

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Setarile optiunii</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{felOmenesc(nod)}</p>
      </div>

      <Camp eticheta="Nume">
        <input
          value={nod.eticheta}
          onChange={(e) => pune({ eticheta: e.target.value })}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </Camp>

      <Camp eticheta="Text de ajutor" ajutor="Se vede mic, sub camp.">
        <input
          value={nod.ajutor ?? ""}
          onChange={(e) => pune({ ajutor: e.target.value || undefined })}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </Camp>

      {nod.fel !== "afisaj" && nod.fel !== "calcul" && (
        <>
          <Bifa
            eticheta="Se completeaza obligatoriu"
            ajutor="Un camp ascuns de o regula nu blocheaza comanda, oricat ar fi de obligatoriu."
            pornit={nod.obligatoriu === true}
            onSchimba={(v) => pune({ obligatoriu: v || undefined })}
          />
          <Bifa
            eticheta="Se arata in rezumatul scurt"
            ajutor="In cos si la finalizare incap doar cateva randuri."
            pornit={nod.inRezumat === true}
            onSchimba={(v) => pune({ inRezumat: v || undefined })}
          />
        </>
      )}

      {nod.fel === "numar" && <SetariNumar nod={nod} onSchimba={onSchimba} />}
      {nod.fel === "text" && <SetariText nod={nod} onSchimba={onSchimba} />}
      {nod.fel === "comutator" && (
        <Camp eticheta="Cat adauga la pret cand e pornit" ajutor="In lei. Lasa gol daca nu schimba pretul.">
          <input
            type="number" step="0.01" inputMode="decimal"
            value={nod.pret ?? ""}
            onChange={(e) => onSchimba({ ...nod, pret: numarSauNimic(e.target.value) })}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </Camp>
      )}
      {(nod.fel === "alegere" || nod.fel === "alegeri") && (
        <ListaOptiuni nod={nod} onSchimba={onSchimba} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PE FELURI
   ═══════════════════════════════════════════════════════════════════════════ */

function SetariNumar({ nod, onSchimba }: { nod: Nod & { fel: "numar" }; onSchimba: (n: Nod) => void }) {
  const u: UnitateLungime = esteUnitateLungime(nod.unitate) ? nod.unitate : "mm";
  const eLungime = esteUnitateLungime(nod.unitate);

  /** Milimetri -> unitatea aleasa, pentru afisare. */
  const afisat = (v: number | undefined) =>
    v === undefined ? "" : String(eLungime ? inLungime(v, u) : v);
  /** Unitatea aleasa -> milimetri, la scriere. */
  const scris = (s: string): number | undefined => {
    const n = numarSauNimic(s);
    if (n === undefined) return undefined;
    return eLungime ? inMilimetri(n, u) : n;
  };

  return (
    <>
      <Camp eticheta="Unitate">
        <select
          value={nod.unitate ?? ""}
          onChange={(e) => onSchimba({ ...nod, unitate: (e.target.value || undefined) as never })}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        >
          <option value="">Fara unitate</option>
          <option value="mm">Milimetri</option>
          <option value="cm">Centimetri</option>
          <option value="m">Metri</option>
          <option value="buc">Bucati</option>
        </select>
      </Camp>

      <div className="grid grid-cols-3 gap-2">
        <Camp eticheta="Minim">
          <input
            type="number" inputMode="decimal" value={afisat(nod.min)}
            onChange={(e) => onSchimba({ ...nod, min: scris(e.target.value) })}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
        <Camp eticheta="Maxim">
          <input
            type="number" inputMode="decimal" value={afisat(nod.max)}
            onChange={(e) => onSchimba({ ...nod, max: scris(e.target.value) })}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
        <Camp eticheta="Pas">
          <input
            type="number" inputMode="decimal" value={afisat(nod.pas)}
            onChange={(e) => onSchimba({ ...nod, pas: scris(e.target.value) })}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
      </div>

      <Camp eticheta="Valoare de pornire">
        <input
          type="number" inputMode="decimal" value={afisat(nod.implicit)}
          onChange={(e) => onSchimba({ ...nod, implicit: scris(e.target.value) })}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </Camp>
    </>
  );
}

function SetariText({ nod, onSchimba }: { nod: Nod & { fel: "text" }; onSchimba: (n: Nod) => void }) {
  const pret = nod.pret ?? {};
  const punePret = (campuri: Partial<NonNullable<typeof nod.pret>>) => {
    const urmator = { ...pret, ...campuri };
    const gol = Object.values(urmator).every((v) => v === undefined);
    onSchimba({ ...nod, pret: gol ? undefined : urmator });
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Camp eticheta="Minim caractere">
          <input
            type="number" inputMode="numeric" value={nod.minCaractere ?? ""}
            onChange={(e) => onSchimba({ ...nod, minCaractere: numarSauNimic(e.target.value) })}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
        <Camp eticheta="Maxim caractere">
          <input
            type="number" inputMode="numeric" value={nod.maxCaractere ?? ""}
            onChange={(e) => onSchimba({ ...nod, maxCaractere: numarSauNimic(e.target.value) })}
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
        </Camp>
      </div>

      <fieldset className="space-y-2 rounded-lg border border-border/70 p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Pretul textului</legend>
        <div className="grid grid-cols-3 gap-2">
          <Camp eticheta="Fix">
            <input
              type="number" step="0.01" inputMode="decimal" value={pret.fix ?? ""}
              onChange={(e) => punePret({ fix: numarSauNimic(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
          <Camp eticheta="Pe caracter">
            <input
              type="number" step="0.01" inputMode="decimal" value={pret.peCaracter ?? ""}
              onChange={(e) => punePret({ peCaracter: numarSauNimic(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
          <Camp eticheta="Incluse">
            <input
              type="number" inputMode="numeric" value={pret.caractereIncluse ?? ""}
              onChange={(e) => punePret({ caractereIncluse: numarSauNimic(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </Camp>
        </div>
      </fieldset>
    </>
  );
}

function ListaOptiuni({ nod, onSchimba }: { nod: Nod & { fel: "alegere" | "alegeri" }; onSchimba: (n: Nod) => void }) {
  const optiuni = nod.optiuni ?? [];
  const schimbaOptiunea = (id: string, campuri: Partial<Optiune>) =>
    onSchimba({ ...nod, optiuni: optiuni.map((o) => (o.id === id ? { ...o, ...campuri } : o)) });

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">Optiuni de ales</legend>
      <ul className="space-y-2">
        {optiuni.map((o, i) => (
          <li key={o.id} className="rounded-lg border border-border/70 p-2">
            <div className="flex items-center gap-1.5">
              <input
                value={o.eticheta}
                onChange={(e) => schimbaOptiunea(o.id, { eticheta: e.target.value })}
                aria-label={`Numele optiunii ${i + 1}`}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
              />
              <input
                type="number" step="0.01" inputMode="decimal"
                value={o.pret ?? ""}
                onChange={(e) => schimbaOptiunea(o.id, { pret: numarSauNimic(e.target.value) })}
                placeholder="lei"
                aria-label={`Cat adauga la pret optiunea ${o.eticheta}`}
                className="h-9 w-20 shrink-0 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
              />
              <span className="inline-flex shrink-0">
                <button
                  type="button" disabled={i === 0}
                  onClick={() => onSchimba(mutaOptiune(nod, o.id, -1))}
                  aria-label={`Muta optiunea ${o.eticheta} mai sus`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button" disabled={i === optiuni.length - 1}
                  onClick={() => onSchimba(mutaOptiune(nod, o.id, 1))}
                  aria-label={`Muta optiunea ${o.eticheta} mai jos`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onSchimba(stergeOptiune(nod, o.id))}
                  aria-label={`Sterge optiunea ${o.eticheta}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </div>
            {/*
              ⚠ Optiunea stinsa se PASTREAZA, nu se sterge: comenzile vechi trimit la id-ul ei, si
              o regula n-o poate reaprinde. Vezi `optiuniDeAles`.
            */}
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox" checked={o.activa === false}
                onChange={(e) => schimbaOptiunea(o.id, { activa: e.target.checked ? false : undefined })}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Scoasa din vanzare
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button" onClick={() => onSchimba(adaugaOptiune(nod))}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Adauga optiune
      </button>
    </fieldset>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUCATI MICI
   ═══════════════════════════════════════════════════════════════════════════ */

function Camp({ eticheta, ajutor, children }: { eticheta: string; ajutor?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{eticheta}</span>
      {children}
      {ajutor && <span className="mt-1 block text-[11px] text-muted-foreground">{ajutor}</span>}
    </label>
  );
}

function Bifa({ eticheta, ajutor, pornit, onSchimba }: {
  eticheta: string; ajutor?: string; pornit: boolean; onSchimba: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox" checked={pornit} onChange={(e) => onSchimba(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
      />
      <span>
        <span className="block text-sm text-foreground">{eticheta}</span>
        {ajutor && <span className="block text-[11px] text-muted-foreground">{ajutor}</span>}
      </span>
    </label>
  );
}

/**
 * Ce a scris omul, ca numar — sau nimic.
 *
 * ⚠ Sirul GOL da `undefined`, nu zero. `Number("")` e 0, iar un camp golit ar fi devenit tacut
 * „minim 0" in loc de „fara minim" — adica alta regula decat cea pe care a sters-o.
 */
function numarSauNimic(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function felOmenesc(nod: Nod): string {
  switch (nod.fel) {
    case "text": return nod.control === "lung" ? "Text lung" : "Text scurt";
    case "numar": return nod.control === "glisor" ? "Glisor" : "Numar";
    case "alegere": return "O singura alegere";
    case "alegeri": return "Alegeri multiple";
    case "comutator": return "Da / Nu";
    case "fisiere": return nod.control === "document" ? "Incarcare fisier" : "Incarcare imagine";
    case "calcul": return "Calcul";
    case "afisaj": return "Afisaj";
    default: return "Optiune";
  }
}
