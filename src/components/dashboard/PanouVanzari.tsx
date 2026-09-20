"use client";

import { useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { GraficVanzari } from "@/components/dashboard/GraficVanzari";
import {
  citesteDateVanzari, crestere, etichetaComparatie, intervalScris, MASURI, numeCanal,
  PERIOADE, valoareTotal,
  type DateVanzari, type FelPerioada, type Masura,
} from "@/lib/vanzari";

/*
  ═══════════════════════════════════════════════════════════════════════════
  GRAFICUL DE VANZARI din panoul principal
  ═══════════════════════════════════════════════════════════════════════════

  Trei masuri, sase perioade, filtru pe canal si comparatie cu perioada
  precedenta. Toate vin dintr-o singura functie din baza, `vanzari_panou`, care
  intoarce amandoua seriile deodata.

  ⚠ DE CE O SINGURA CERERE, si nu una pentru fiecare comutator.
  Antetul („34.864 lei, +33% fata de perioada precedenta") si linia punctata din
  grafic arata ACELASI lucru. Aduse din doua cereri, ar fi putut ajunge din doua
  clipe diferite, iar procentul din antet n-ar mai fi fost cel desenat. Aici,
  orice miscare a comenzilor le schimba pe amandoua odata.

  ⚠ MASURA SI COMPARATIA NU CER NIMIC DE LA SERVER: `vanzari_panou` trimite si
  vanzarile, si numarul de comenzi, pentru amandoua ferestrele. Deci trecerea de
  pe „Vanzari" pe „Comenzi" si aprinderea comparatiei sunt instantanee. Doar
  perioada si canalul schimba cererea.
*/

type Canal = { canal: string; comenzi: number };

export function PanouVanzari({
  businessId, initial, canale,
}: {
  businessId: string;
  /** Prima fereastra, adusa de pe server, ca panoul sa nu porneasca gol. */
  initial: DateVanzari;
  canale: Canal[];
}) {
  const [fel, setFel] = useState<FelPerioada>("7z");
  const [canal, setCanal] = useState("");           // "" = toate canalele
  const [masura, setMasura] = useState<Masura>("vanzari");
  const [comparatie, setComparatie] = useState(false);
  const [deLa, setDeLa] = useState("");
  const [panaLa, setPanaLa] = useState("");
  const [date, setDate] = useState<DateVanzari>(initial);
  const [seIncarca, setSeIncarca] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);

  /*
    ⚠ Numarul cererii, ca un raspuns intarziat sa nu se aseze peste unul mai nou.
    Apasat repede „30 zile" si apoi „7 zile", raspunsul pentru 30 poate ajunge al
    doilea; fara paza asta, graficul ar fi ramas pe 30 cu butonul apasat pe 7.
  */
  const ultimaCerere = useRef(0);

  async function incarca(next: { fel: FelPerioada; canal: string; deLa: string; panaLa: string }) {
    const alMeu = ++ultimaCerere.current;
    setSeIncarca(true);
    setEroare(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("vanzari_panou", {
      p_business: businessId,
      p_fel: next.fel,
      p_de_la: next.fel === "custom" && next.deLa ? next.deLa : null,
      p_pana_la: next.fel === "custom" && next.panaLa ? next.panaLa : null,
      p_canal: next.canal || null,
    });

    if (alMeu !== ultimaCerere.current) return;   // a pornit deja alta cerere

    const citite = error ? null : citesteDateVanzari(data);
    if (citite) setDate(citite);
    else setEroare("Nu am putut incarca datele. Incearca din nou.");
    setSeIncarca(false);
  }

  function schimbaPerioada(f: FelPerioada) {
    setFel(f);
    /* Perioada personalizata nu inseamna nimic pana nu sunt scrise amandoua
       capetele; pana atunci ramane pe ecran ce era. */
    if (f === "custom" && !(deLa && panaLa)) return;
    void incarca({ fel: f, canal, deLa, panaLa });
  }

  function schimbaCanal(c: string) {
    setCanal(c);
    void incarca({ fel, canal: c, deLa, panaLa });
  }

  function schimbaCapat(care: "deLa" | "panaLa", v: string) {
    const d = care === "deLa" ? v : deLa;
    const p = care === "panaLa" ? v : panaLa;
    if (care === "deLa") setDeLa(v); else setPanaLa(v);
    if (d && p) void incarca({ fel: "custom", canal, deLa: d, panaLa: p });
  }

  const infoMasura = MASURI.find((m) => m.masura === masura) ?? MASURI[0];
  const acum = valoareTotal(date.total, masura);
  const inainte = valoareTotal(date.total_anterior, masura);
  const pct = crestere(acum, inainte);

  const scrisAcum = infoMasura.bani
    ? formatPrice(acum)
    : new Intl.NumberFormat("ro-RO").format(acum);
  const scrisInainte = infoMasura.bani
    ? formatPrice(inainte)
    : new Intl.NumberFormat("ro-RO").format(inainte);

  const gol = date.total.comenzi === 0 && date.total_anterior.comenzi === 0;

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:col-span-2">
      {/* ── Antet: titlu, perioada, canal, comparatie ──────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="font-semibold text-foreground">Vanzari</h2>

        <div className="flex flex-wrap items-center gap-2">
          <Alegere
            valoare={fel}
            schimba={(v) => schimbaPerioada(v as FelPerioada)}
            optiuni={PERIOADE.map((p) => ({ valoare: p.fel, eticheta: p.eticheta }))}
            numeAccesibil="Perioada"
          />

          {/* Filtrul de canal apare doar daca magazinul chiar vinde din mai multe
              locuri: o lista cu o singura optiune nu e o alegere. */}
          {canale.length > 1 && (
            <Alegere
              valoare={canal}
              schimba={schimbaCanal}
              optiuni={[
                { valoare: "", eticheta: "Toate canalele" },
                ...canale.map((c) => ({ valoare: c.canal, eticheta: numeCanal(c.canal) })),
              ]}
              numeAccesibil="Canal de vanzare"
            />
          )}

          <button
            type="button"
            onClick={() => setComparatie((v) => !v)}
            aria-pressed={comparatie}
            title={etichetaComparatie(fel, date)}
            className={cn(
              "h-8 rounded-lg px-2.5 text-xs font-medium transition-colors",
              comparatie
                ? "bg-foreground text-background"
                : "text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground",
            )}
          >
            Compara
          </button>
        </div>
      </div>

      {/* ── Capetele perioadei personalizate ───────────────────────────── */}
      {fel === "custom" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-5 py-3 text-xs">
          <label className="text-muted-foreground" htmlFor="vanzari-de-la">De la</label>
          <input
            id="vanzari-de-la"
            type="date"
            value={deLa}
            onChange={(e) => schimbaCapat("deLa", e.target.value)}
            className="h-8 rounded-lg bg-card px-2 text-xs text-foreground ring-1 ring-foreground/10"
          />
          <label className="text-muted-foreground" htmlFor="vanzari-pana-la">pana la</label>
          <input
            id="vanzari-pana-la"
            type="date"
            value={panaLa}
            onChange={(e) => schimbaCapat("panaLa", e.target.value)}
            className="h-8 rounded-lg bg-card px-2 text-xs text-foreground ring-1 ring-foreground/10"
          />
          {!(deLa && panaLa) && (
            <span className="text-muted-foreground">Alege amandoua capetele.</span>
          )}
        </div>
      )}

      {/* ── Cifra mare si cresterea ────────────────────────────────────── */}
      <div className="px-5 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-bold tracking-tight text-foreground">{scrisAcum}</span>

          {pct !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                pct >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              )}
            >
              {pct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(pct).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">fara vanzari in perioada precedenta</span>
          )}

          <span className="text-xs text-muted-foreground">
            {pct !== null && <>fata de perioada precedenta ({scrisInainte}) · </>}
            {intervalScris(date.interval)}
          </span>
        </div>

        {/* ── Masurile ─────────────────────────────────────────────────── */}
        <div className="mt-3 flex gap-0.5 rounded-xl bg-muted p-1">
          {MASURI.map((m) => (
            <button
              key={m.masura}
              type="button"
              onClick={() => setMasura(m.masura)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                masura === m.masura
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.eticheta}
            </button>
          ))}
        </div>
      </div>

      {/* ── Graficul ───────────────────────────────────────────────────── */}
      <div className="relative px-5 pt-4 pb-5">
        {gol ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            Nu exista vanzari in perioada aleasa.
          </div>
        ) : (
          /* Cifrele vechi raman pe ecran cat vin cele noi, doar palite: golit,
             panoul ar fi sarit la fiecare apasare pe alta perioada. */
          <div className={cn("transition-opacity", seIncarca && "opacity-40")}>
            <GraficVanzari date={date} masura={masura} comparatie={comparatie} />
          </div>
        )}

        {seIncarca && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {comparatie && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
              {etichetaComparatie(fel, date)}
            </span>
          )}
          {eroare && <span className="text-destructive">{eroare}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * O lista de ales, scrisa peste `<select>`-ul browserului.
 *
 * Nativ, nu facut din butoane: se deschide la fel pe telefon ca orice alta lista
 * din sistem, merge din tastatura fara nicio linie de cod si nu are nevoie de
 * niciun ascultator care sa-l inchida cand se apasa in alta parte.
 */
function Alegere({
  valoare, schimba, optiuni, numeAccesibil,
}: {
  valoare: string;
  schimba: (v: string) => void;
  optiuni: { valoare: string; eticheta: string }[];
  numeAccesibil: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={numeAccesibil}
        value={valoare}
        onChange={(e) => schimba(e.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-lg bg-card py-0 pr-7 pl-2.5 text-xs font-medium text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {optiuni.map((o) => (
          <option key={o.valoare} value={o.valoare}>{o.eticheta}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
