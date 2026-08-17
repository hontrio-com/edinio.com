"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/*
 * Selector cu cautare, pentru nomenclatoarele lungi ale marketplace-urilor.
 *
 * Nu sunt liste de zece valori: la About You, marimile categoriei „Handbag" au
 * 696 de intrari, materialele 375, grupele de material 215, culorile 185; la
 * Trendyol, un atribut de categorie poate avea pana la 1000 de valori. Puse
 * intr-un `<select>` obisnuit, comerciantul deruleaza minute intregi ca sa
 * gaseasca „One Size" — iar noi ii ceream sa faca asta la fiecare varianta.
 *
 * Filtrarea normalizeaza diacriticele si ignora majusculele, ca „piele" sa
 * gaseasca si „Piele", iar „35 x" sa gaseasca „35.5 x 26 x 7 cm".
 */
export interface OptiuneSelect {
  id: number;
  frontend_name: string;
}

function normalizeaza(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
}

export function SelectCautare({
  optiuni, valoare, onSchimba, placeholder = "Alege", multiplu = false, valori = [],
  onSchimbaMultiplu, dimensiune = "normal",
}: {
  optiuni: OptiuneSelect[];
  /** Selectie unica. */
  valoare?: number | null;
  onSchimba?: (id: number | null) => void;
  /** Selectie multipla. */
  multiplu?: boolean;
  valori?: number[];
  onSchimbaMultiplu?: (ids: number[]) => void;
  placeholder?: string;
  dimensiune?: "normal" | "mic";
}) {
  const [deschis, setDeschis] = useState(false);
  const [cautare, setCautare] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inchidere la clic in afara: un panou care ramane deschis peste restul
  // formularului acopera exact campurile pe care omul vrea sa le completeze.
  useEffect(() => {
    if (!deschis) return;
    const laClic = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setDeschis(false);
    };
    document.addEventListener("mousedown", laClic);
    return () => document.removeEventListener("mousedown", laClic);
  }, [deschis]);

  useEffect(() => { if (deschis) inputRef.current?.focus(); }, [deschis]);

  const dupaId = useMemo(() => new Map(optiuni.map((o) => [o.id, o])), [optiuni]);

  const filtrate = useMemo(() => {
    const q = normalizeaza(cautare.trim());
    if (!q) return optiuni.slice(0, 200);
    const bucati = q.split(/\s+/).filter(Boolean);
    return optiuni
      .filter((o) => {
        const n = normalizeaza(o.frontend_name);
        return bucati.every((b) => n.includes(b));
      })
      .slice(0, 200);
  }, [optiuni, cautare]);

  const eticheta = multiplu
    ? (valori.length === 0 ? placeholder
      : valori.length === 1 ? (dupaId.get(valori[0])?.frontend_name ?? `#${valori[0]}`)
      : `${valori.length} alese`)
    : (valoare != null ? (dupaId.get(valoare)?.frontend_name ?? `#${valoare}`) : placeholder);

  const gol = multiplu ? valori.length === 0 : valoare == null;
  const clsButon = dimensiune === "mic"
    ? "w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
    : "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  const alege = (id: number) => {
    if (multiplu) {
      const next = valori.includes(id) ? valori.filter((x) => x !== id) : [...valori, id];
      onSchimbaMultiplu?.(next);
    } else {
      onSchimba?.(id);
      setDeschis(false);
      setCautare("");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setDeschis((v) => !v)}
        className={`${clsButon} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${gol ? "text-muted-foreground" : "text-foreground"}`}>{eticheta}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {!gol && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Golește"
              onClick={(e) => {
                e.stopPropagation();
                if (multiplu) onSchimbaMultiplu?.([]); else onSchimba?.(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </button>

      {deschis && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-background shadow-lg">
          <div className="relative border-b border-border">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={cautare}
              onChange={(e) => setCautare(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setDeschis(false); return; }
                // Enter alege prima potrivire: la 696 de valori, cel mai des
                // omul stie ce scrie si vrea doar sa confirme.
                if (e.key === "Enter" && filtrate.length > 0) { e.preventDefault(); alege(filtrate[0].id); }
              }}
              placeholder="Caută..."
              className="w-full bg-transparent pl-7 pr-2 py-2 text-xs outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtrate.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nicio potrivire pentru „{cautare}”.</p>
            ) : (
              filtrate.map((o) => {
                const ales = multiplu ? valori.includes(o.id) : valoare === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => alege(o.id)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted ${ales ? "font-semibold text-primary" : "text-foreground"}`}
                  >
                    <Check className={`h-3 w-3 flex-shrink-0 ${ales ? "opacity-100" : "opacity-0"}`} />
                    <span className="truncate">{o.frontend_name}</span>
                  </button>
                );
              })
            )}
            {/* Lista se taie la 200 ca sa nu randam sute de randuri degeaba —
                dar taierea se ANUNTA, altfel arata ca „atat exista". */}
            {filtrate.length >= 200 && (
              <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border">
                Se arată primele 200. Scrie ca să restrângi.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
