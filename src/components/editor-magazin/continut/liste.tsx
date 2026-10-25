"use client";

import { useState } from "react";
import { Loader2, Plus, Upload, X } from "lucide-react";
import { inputCls, inputMicCls } from "./ui";

/**
 * Editoarele de liste din continutul magazinului: garantii, beneficii, pasi,
 * intrebari, recenzii.
 *
 * Mutate din editorul vechi, unde fiecare era scris de doua ori (o data pentru
 * pagina principala, o data pentru pagina de produs), identic in afara cheii.
 * Aici sunt scrise o data si primesc valoarea si schimbarea din afara.
 */

export type Card = { icon: string; title: string; desc: string };

/** Cele patru carduri de garantii: titlu, iconita, descriere. */
export function EditorCarduri({ carduri, onSchimba }: { carduri: Card[]; onSchimba: (c: Card[]) => void }) {
  const schimba = (i: number, patch: Partial<Card>) => onSchimba(carduri.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {carduri.map((card, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Titlu</span>
              <input type="text" value={card.title} className={inputMicCls} onChange={(e) => schimba(i, { title: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Iconiță</span>
              <select value={card.icon} className={inputMicCls} onChange={(e) => schimba(i, { icon: e.target.value })}>
                <option value="truck">Livrare</option>
                <option value="shield">Protecție</option>
                <option value="rotate-ccw">Retur</option>
                <option value="phone">Telefon</option>
              </select>
            </label>
          </div>
          <input type="text" value={card.desc} className={inputMicCls} placeholder="Descriere scurtă..."
            aria-label={`Descrierea cardului ${i + 1}`} onChange={(e) => schimba(i, { desc: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

export type ElementLista = { title: string; desc: string };

/** Titlu de sectiune + elemente cu titlu si descriere (beneficiile, pasii). */
export function EditorElemente({ titlu, elemente, onTitlu, onElemente, eticheta, maxim, numerotate = false }: {
  titlu: string;
  elemente: ElementLista[];
  onTitlu: (t: string) => void;
  onElemente: (e: ElementLista[]) => void;
  /** Ce se adauga, la singular: „beneficiu”, „pas”. */
  eticheta: string;
  maxim?: number;
  numerotate?: boolean;
}) {
  const schimba = (i: number, patch: Partial<ElementLista>) => onElemente(elemente.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      <input type="text" value={titlu} className={inputCls} placeholder="Titlul secțiunii"
        aria-label="Titlul secțiunii" onChange={(e) => onTitlu(e.target.value)} />
      {elemente.map((el, i) => (
        <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
          <div className="flex gap-1">
            {numerotate && <span className="text-[10px] font-bold text-muted-foreground self-center px-1">{String(i + 1).padStart(2, "0")}</span>}
            <input type="text" value={el.title} className={inputMicCls} placeholder="Titlu"
              aria-label={`Titlul elementului ${i + 1}`} onChange={(e) => schimba(i, { title: e.target.value })} />
            <button type="button" aria-label={`Șterge ${eticheta} ${i + 1}`}
              onClick={() => onElemente(elemente.filter((_, j) => j !== i))}
              className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
          <input type="text" value={el.desc} className={inputMicCls} placeholder="Descriere"
            aria-label={`Descrierea elementului ${i + 1}`} onChange={(e) => schimba(i, { desc: e.target.value })} />
        </div>
      ))}
      {(maxim === undefined || elemente.length < maxim) && (
        <button type="button" onClick={() => onElemente([...elemente, { title: "", desc: "" }])}
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus className="h-3 w-3" /> Adaugă {eticheta}
        </button>
      )}
    </div>
  );
}

export type Intrebare = { q: string; a: string };

/** Intrebarile frecvente ale paginii de produs. */
export function EditorIntrebari({ titlu, intrebari, onTitlu, onIntrebari }: {
  titlu: string;
  intrebari: Intrebare[];
  onTitlu: (t: string) => void;
  onIntrebari: (q: Intrebare[]) => void;
}) {
  const schimba = (i: number, patch: Partial<Intrebare>) => onIntrebari(intrebari.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-2">
      <input type="text" value={titlu} className={inputCls} placeholder="Titlul secțiunii"
        aria-label="Titlul secțiunii" onChange={(e) => onTitlu(e.target.value)} />
      {intrebari.map((it, i) => (
        <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
          <div className="flex gap-1">
            <input type="text" value={it.q} className={inputMicCls} placeholder="Întrebare"
              aria-label={`Întrebarea ${i + 1}`} onChange={(e) => schimba(i, { q: e.target.value })} />
            <button type="button" aria-label={`Șterge întrebarea ${i + 1}`}
              onClick={() => onIntrebari(intrebari.filter((_, j) => j !== i))}
              className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
          <textarea value={it.a} rows={2} className={`${inputMicCls} resize-none`} placeholder="Răspuns"
            aria-label={`Răspunsul ${i + 1}`} onChange={(e) => schimba(i, { a: e.target.value })} />
        </div>
      ))}
      <button type="button" onClick={() => onIntrebari([...intrebari, { q: "", a: "" }])}
        className="flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="h-3 w-3" /> Adaugă întrebare
      </button>
    </div>
  );
}

export type Recenzie = { name: string; rating: number; text: string; date: string; image?: string };

const STEA =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

/** Recenziile scrise de comerciant, cu stele, poza optionala si data. */
export function EditorRecenzii({ titlu, recenzii, onTitlu, onRecenzii, urca }: {
  titlu: string;
  recenzii: Recenzie[];
  onTitlu: (t: string) => void;
  onRecenzii: (r: Recenzie[]) => void;
  /** Urca o poza si intoarce adresa ei, sau `null` cand n-a mers. */
  urca: (f: File) => Promise<string | null>;
}) {
  const [urcaPentru, setUrcaPentru] = useState<number | null>(null);
  const schimba = (i: number, patch: Partial<Recenzie>) => onRecenzii(recenzii.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <input type="text" value={titlu} className={inputCls} placeholder="Ce spun clienții noștri"
        aria-label="Titlul secțiunii" onChange={(e) => onTitlu(e.target.value)} />
      {recenzii.map((r, i) => (
        <div key={i} className="border border-border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1" role="radiogroup" aria-label={`Nota recenziei ${i + 1}`}>
              {[1, 2, 3, 4, 5].map((stea) => (
                <button key={stea} type="button" role="radio" aria-checked={r.rating === stea} aria-label={`${stea} stele`}
                  onClick={() => schimba(i, { rating: stea })} className="transition-transform hover:scale-125">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill={stea <= r.rating ? "#FBBF24" : "none"}
                    stroke={stea <= r.rating ? "#FBBF24" : "#D1D5DB"} strokeWidth="1.5"><path d={STEA} /></svg>
                </button>
              ))}
            </div>
            <button type="button" aria-label={`Șterge recenzia ${i + 1}`} onClick={() => onRecenzii(recenzii.filter((_, j) => j !== i))}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {r.image ? (
              <div className="relative flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt="" className="w-9 h-9 rounded-full object-cover border border-border" />
                <button type="button" aria-label="Șterge poza" onClick={() => schimba(i, { image: undefined })}
                  className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 shadow">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <label className="w-9 h-9 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors flex-shrink-0">
                {urcaPentru === i ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" /> : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
                <input type="file" accept="image/*" className="hidden" disabled={urcaPentru !== null} aria-label={`Poza recenziei ${i + 1}`}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setUrcaPentru(i);
                    const url = await urca(f);
                    setUrcaPentru(null);
                    if (url) schimba(i, { image: url });
                  }} />
              </label>
            )}
            <span className="text-[10px] text-muted-foreground">Poză (opțional). Fără poză se afișează inițiala.</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={r.name} placeholder="Numele clientului" className={inputMicCls}
              aria-label={`Numele clientului, recenzia ${i + 1}`} onChange={(e) => schimba(i, { name: e.target.value })} />
            <input type="date" value={r.date} className={inputMicCls} aria-label={`Data recenziei ${i + 1}`}
              onChange={(e) => schimba(i, { date: e.target.value })} />
          </div>
          <textarea value={r.text} rows={2} placeholder="Textul recenziei..." className={`${inputMicCls} resize-none`}
            aria-label={`Textul recenziei ${i + 1}`} onChange={(e) => schimba(i, { text: e.target.value })} />
        </div>
      ))}
      {recenzii.length < 20 && (
        <button type="button"
          onClick={() => onRecenzii([...recenzii, { name: "", rating: 5, text: "", date: new Date().toISOString().split("T")[0] }])}
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus className="h-3 w-3" /> Adaugă recenzie
        </button>
      )}
    </div>
  );
}
