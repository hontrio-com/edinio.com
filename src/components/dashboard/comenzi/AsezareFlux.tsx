"use client";

/*
  Asezarea „Flux”: comenzile stau pe coloane, dupa ce mai e de facut cu ele, de la comanda
  noua pana la cea livrata. E felul tablourilor de lucru (kanban) si al ecranelor de expediere:
  comerciantul nu citeste un tabel, ci vede cate are in fiecare etapa si ia urmatoarea.

  Etapele nu sunt cele sapte stari din baza, ci ce inseamna ele pentru munca de zi cu zi:
  o comanda „in procesare” cu AWB e gata de predat, una fara AWB mai trebuie pregatita.

  Fiecare culoar isi aduce comenzile LUI de pe server (primele 20, cele mai noi, apoi cate 20
  in plus la cerere) si spune cate are etapa in total: numarul din capul culoarului e cel
  adevarat, nu cate au incaput in pagina.

  Are tot ce are „Registrul": chemarea curierului, exportul, cautarea, sursa, perioada si
  actiunile pe mai multe comenzi. Aici bifa din capul culoarului alege o ETAPA intreaga, ca
  „genereaza AWB-uri pentru tot ce e de pregatit" sa fie doua clicuri.

  Pe telefon cinci coloane una langa alta nu au loc: etapele devin file, iar sub ele sta un
  singur culoar, lat cat ecranul.

  ⚠ Comenzile NU se trag dintr-o coloana in alta. Mutarea unei comenzi ii schimba starea, iar
  schimbarea starii trimite e-mail si SMS clientului: o fisa scapata din mana pe coloana
  gresita ar anunta un client ca i-a plecat coletul. Starea se schimba cu un buton, la vedere.
*/

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import type { TonEticheta } from "@/components/ui/eticheta-stare";
import { ATINGERE, INEL, PunctStare } from "@/components/dashboard/atomi-panou";
import { FileSubliniate, LOC_FILTRU, RandFiltre } from "@/components/dashboard/liste/navigare";
import { suma } from "@/components/dashboard/liste/piese";
import { useActiuni, useLot } from "./actiuni";
import { ActiuniAntet, BaraSelectie, CardComanda, FiltruSursa, RezultatLot, SubtitluComenzi, type NavigareComenzi } from "./comune";
import { areFiltre, filtreGoale, PE_CULOAR, PE_CULOAR_MAX } from "./filtre";
import type { DateAsezare } from "./ListaComenzi";

/** Cum se numeste fiecare etapa, si in ce fila a „Registrului" se vad toate comenzile ei, cand e una singura stare. */
const ETAPE_AFISATE: Record<string, { titlu: string; lamurire: string; ton: TonEticheta; inRegistru: string | null }> = {
  noi: { titlu: "De confirmat", lamurire: "Comenzi noi", ton: "asteptare", inRegistru: "pending" },
  pregatit: { titlu: "De pregătit", lamurire: "Confirmate, fără AWB", ton: "lucru", inRegistru: null },
  predat: { titlu: "De predat curierului", lamurire: "Au AWB, așteaptă ridicarea", ton: "info", inRegistru: null },
  drum: { titlu: "Pe drum", lamurire: "Predate curierului", ton: "drum", inRegistru: "shipped" },
  livrate: { titlu: "Livrate", lamurire: "Ajunse la client", ton: "bun", inRegistru: "delivered" },
};

export function AsezareFlux({ culoare: toateCuloarele, numarari, total, surse, nav }: DateAsezare) {
  const { filtre, inAsteptare, mergiLa } = nav;
  const { alegeAsezarea } = useActiuni();
  const { selectie } = useLot();
  const { alese, comuta, pune, goleste } = selectie;
  const culoare = toateCuloarele.filter((c) => Object.hasOwn(ETAPE_AFISATE, c.cheie));

  /* Selectia e a comenzilor de pe ecran: la orice cautare, filtru sau „arată mai multe" se goleste. */
  const mergi = useCallback<NavigareComenzi["mergiLa"]>((urmator, optiuni) => {
    goleste();
    mergiLa(urmator, optiuni);
  }, [mergiLa, goleste]);
  const navCuSelectie = useMemo<NavigareComenzi>(() => ({ filtre, inAsteptare, mergiLa: mergi }), [filtre, inAsteptare, mergi]);

  /* Pe telefon se vede un singur culoar, cel ales din file. Se deschide pe prima etapa care are comenzi. */
  const [etapaAleasa, setEtapaAleasa] = useState<string | null>(null);
  const activa = etapaAleasa ?? culoare.find((c) => c.total > 0)?.cheie ?? culoare[0]?.cheie ?? "noi";

  const toate = useMemo(() => culoare.flatMap((c) => c.comenzi), [culoare]);
  const cateAlese = toate.filter((c) => alese.has(c.id)).length;

  /* Comenzile unei singure stari se vad toate in „Registru", pe fila ei: se trece in asezarea aceea, cu fila aleasa. */
  const laRegistru = (stare: string) => { goleste(); alegeAsezarea("registru", { status: stare }); };

  const anulate = numarari.cancelled ?? 0;
  const rambursate = numarari.refunded ?? 0;

  return (
    <div className={cn("text-[13px]", cateAlese > 0 && "pb-10 lg:pb-20")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Comenzi</h1>
          <SubtitluComenzi total={total} inAsteptare={numarari.pending ?? 0} />
        </div>
        <ActiuniAntet asezare={filtre.asezare} areComenzi={total > 0} />
      </div>

      <RandFiltre className="mt-5" nav={navCuSelectie} cuFiltre={areFiltre(filtre)} laGolire={() => mergi(filtreGoale(filtre.asezare))}>
        <FiltruSursa nav={navCuSelectie} surse={surse} className={LOC_FILTRU} />
      </RandFiltre>

      <RezultatLot className="mt-3" />

      {/* Telefon si tableta: etapele ca file, cu punctul lor colorat si cu numarul adevarat al etapei. */}
      <FileSubliniate
        className="mt-4 lg:hidden"
        eticheta="Etapele comenzilor"
        activa={activa}
        laAlegere={setEtapaAleasa}
        file={culoare.map((c) => ({ cheie: c.cheie, eticheta: ETAPE_AFISATE[c.cheie].titlu, numar: c.total, ton: ETAPE_AFISATE[c.cheie].ton }))}
      />

      <div
        className={cn(
          "mt-3 transition-opacity lg:mt-4 lg:grid lg:grid-flow-col lg:auto-cols-[minmax(240px,1fr)] lg:gap-3 lg:overflow-x-auto lg:pb-3",
          "[scrollbar-color:rgb(0_0_0/0.18)_transparent] [scrollbar-width:thin]",
          inAsteptare && "opacity-60",
        )}
        aria-busy={inAsteptare}
      >
        {culoare.map((culoar) => {
          const etapa = ETAPE_AFISATE[culoar.cheie];
          const iduri = culoar.comenzi.map((c) => c.id);
          const bifate = iduri.filter((id) => alese.has(id)).length;
          const toateBifate = iduri.length > 0 && bifate === iduri.length;
          const ramase = culoar.total - culoar.comenzi.length;
          /* Valoarea se scrie doar cand culoarul isi arata TOATE comenzile: altfel ar fi suma unei parti. */
          const valoare = ramase > 0 ? 0 : culoar.comenzi.reduce((s, c) => s + (c.moneda === "lei" ? Math.round(c.total * 100) : 0), 0) / 100;
          return (
            <section
              key={culoar.cheie}
              aria-label={etapa.titlu}
              /*
                ⚠ `relative`: culoarul tine in el tot ce e pozitionat absolut inauntru (textul
                „Toate", ascuns vizual pe ecran lat). Fara el, un asemenea element dintr-un culoar
                derulat in afara ecranului nu e taiat de cutia care deruleaza si lateste PAGINA
                (masurat: 206 px in plus la 1280).
              */
              className={cn("relative min-w-0 flex-col rounded-xl bg-muted/60 p-2", culoar.cheie === activa ? "flex" : "hidden lg:flex")}
            >
              <header className="flex items-start gap-2 px-2 pb-2.5 pt-1.5">
                <div className="min-w-0 flex-1">
                  {/* Numele si numarul etapei: pe telefon le spune deja fila de deasupra. */}
                  <div className="hidden items-center gap-2 lg:flex">
                    <PunctStare ton={etapa.ton} />
                    <h2 className="truncate text-sm font-semibold text-foreground">{etapa.titlu}</h2>
                    <span className="ml-auto text-sm tabular-nums text-muted-foreground">{culoar.total.toLocaleString("ro-RO")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground lg:mt-0.5 lg:pl-4">
                    {etapa.lamurire}{valoare > 0 && <>, {suma(valoare)}</>}
                  </p>
                </div>
                {iduri.length > 0 && (
                  <label className={cn("-my-1 -mr-1 flex flex-shrink-0 cursor-pointer items-center gap-1.5 p-1 text-xs text-muted-foreground", ATINGERE)} title={`Selectează toate comenzile din „${etapa.titlu}”`}>
                    <span className="lg:sr-only">Toate</span>
                    <input
                      type="checkbox"
                      checked={toateBifate}
                      ref={(el) => { if (el) el.indeterminate = bifate > 0 && !toateBifate; }}
                      onChange={() => pune(iduri, !toateBifate)}
                      aria-label={`Selectează toate comenzile din „${etapa.titlu}”`}
                      className="h-4 w-4 cursor-pointer rounded border-border accent-foreground"
                    />
                  </label>
                )}
              </header>

              {/*
                Ecran lat: culoarul are inaltimea lui si se deruleaza singur. Telefon si tableta:
                fisele curg in pagina (o coloana, doua pe tableta), fara derulare in derulare.

                ⚠ `lg:-m-0.5 lg:p-0.5`: conturul unei fise e desenat cu un pixel in AFARA ei, iar o
                cutie care deruleaza taie tot ce iese din ea. Fara cei doi pixeli de loc de jur
                imprejur, fisele isi pierdeau linia din stanga, iar prima si linia de sus.
              */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:-m-0.5 lg:flex lg:max-h-[calc(100vh-17rem)] lg:min-h-[12rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:p-0.5 [scrollbar-color:rgb(0_0_0/0.18)_transparent] [scrollbar-width:thin]">
                {culoar.comenzi.map((c) => (
                  <CardComanda
                    key={c.id}
                    comanda={c}
                    jos={culoar.cheie === "noi" ? "confirma" : undefined}
                    aleasa={alese.has(c.id)}
                    laComutare={comuta}
                    className="lg:flex-shrink-0"
                  />
                ))}
                {culoar.comenzi.length === 0 && (
                  <p className="col-span-full grid place-items-center rounded-lg border border-dashed border-foreground/15 px-3 py-8 text-center text-xs text-muted-foreground lg:flex-1">
                    {filtre.q ? `Nimic nu se potrivește cu „${filtre.q}”.` : "Nimic în etapa asta."}
                  </p>
                )}
                {ramase > 0 && (
                  <div className="col-span-full flex flex-col items-center gap-1.5 px-2 py-2 text-center text-xs text-muted-foreground lg:flex-shrink-0">
                    <p>Încă {pluralRo(ramase, "comandă mai veche", "comenzi mai vechi")}.</p>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                      {filtre.peCuloar < PE_CULOAR_MAX && (
                        <button
                          type="button"
                          onClick={() => mergi({ peCuloar: filtre.peCuloar + PE_CULOAR })}
                          className={cn("rounded-sm py-1 font-medium text-foreground underline-offset-2 hover:underline", INEL)}
                        >
                          Arată încă {Math.min(PE_CULOAR, ramase)}
                        </button>
                      )}
                      {etapa.inRegistru && (
                        <button
                          type="button"
                          onClick={() => laRegistru(etapa.inRegistru as string)}
                          className={cn("rounded-sm py-1 font-medium text-foreground underline-offset-2 hover:underline", INEL)}
                        >
                          Vezi-le în Registru
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Ce nu mai are de mers nicaieri: anulatele si rambursatele se vad in Registru, pe fila lor. */}
      {anulate + rambursate > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          În afara fluxului:{" "}
          {anulate > 0 && (
            <button type="button" onClick={() => laRegistru("cancelled")} className={cn("rounded-sm font-medium text-foreground underline-offset-2 hover:underline", INEL)}>
              {pluralRo(anulate, "anulată", "anulate")}
            </button>
          )}
          {anulate > 0 && rambursate > 0 && ", "}
          {rambursate > 0 && (
            <button type="button" onClick={() => laRegistru("refunded")} className={cn("rounded-sm font-medium text-foreground underline-offset-2 hover:underline", INEL)}>
              {pluralRo(rambursate, "rambursată", "rambursate")}
            </button>
          )}
        </p>
      )}

      {/* „Toate" din bara nu se arata aici: fiecare culoar are bifa lui, care alege o etapa intreaga. */}
      <BaraSelectie comenzi={toate} cuToate={false} />
    </div>
  );
}
