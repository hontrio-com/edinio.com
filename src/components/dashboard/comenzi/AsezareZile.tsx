"use client";

/*
  Asezarea „Pe zile”: comenzile sunt randuri late, grupate pe zile, cu pozele produselor in
  fata si cu pasii comenzii desenati pe fiecare rand. Nu mai e un tabel de citit pe coloane:
  fiecare rand spune singur ce s-a facut si ce urmeaza, iar butonul de langa e chiar pasul
  urmator (sigla curierului pentru AWB, sigla casei pentru factura).

  Grupa, cautarea, sursa si perioada stau in adresa: lista vine de pe server, gata filtrata,
  pagina cu pagina, deci numarul de pe o grupa e si numarul comenzilor din ea.

  Are tot ce au celelalte asezari: chemarea curierului, exportul, filtrele si actiunile pe mai
  multe comenzi. Aici bifa din capul unei zile alege ZIUA intreaga, ca „emite facturile de
  ieri" sa fie doua clicuri.
*/

import { memo, useCallback, useMemo } from "react";
import { Check, FileCheck2 } from "lucide-react";
import { ORDERS_PAGE_SIZE } from "@/lib/orders/pagination";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { ATINGERE } from "@/components/dashboard/atomi-panou";
import { LOC_FILTRU, Paginare, RandFiltre, SegmenteGrupe, StareGoala } from "@/components/dashboard/liste/navigare";
import { cheiaZilei, ora, suma, TeancPoze, ziuaLunga } from "@/components/dashboard/liste/piese";
import { useLot } from "./actiuni";
import {
  ActiuniAntet, BaraSelectie, ButonConfirma, FiltruSursa, MeniuComanda, NumarComanda, RezultatLot, SubtitluComenzi, useLista,
  ZonaExpediere, ZonaFactura, type NavigareComenzi,
} from "./comune";
import type { ComandaLista } from "./date";
import { areFiltre, cateInGrupa, filtreGoale, GRUPE } from "./filtre";
import type { DateAsezare } from "./ListaComenzi";
import { Sursa, Total } from "./piese";
import { expediere, rezumatLivrare, rezumatPlata, rezumatProduse } from "./rezumate";

const INCHISE = new Set(["cancelled", "refunded"]);

export function AsezareZile({ comenzi, totalFiltru, numarari, total, surse, nav }: DateAsezare) {
  const { filtre, inAsteptare, mergiLa } = nav;
  const { selectie } = useLot();
  const { alese, comuta, pune, goleste } = selectie;

  /* Selectia e a paginii de pe ecran: la orice schimbare de grupa, de filtru sau de pagina se goleste. */
  const mergi = useCallback<NavigareComenzi["mergiLa"]>((urmator, optiuni) => {
    goleste();
    mergiLa(urmator, optiuni);
  }, [mergiLa, goleste]);
  const navCuSelectie = useMemo<NavigareComenzi>(() => ({ filtre, inAsteptare, mergiLa: mergi }), [filtre, inAsteptare, mergi]);

  const cateAlese = comenzi.filter((c) => alese.has(c.id)).length;

  const zile = useMemo(() => {
    const dupaZi = new Map<string, ComandaLista[]>();
    for (const c of comenzi) {
      const cheie = cheiaZilei(c.creataLa);
      const aleZilei = dupaZi.get(cheie);
      if (aleZilei) aleZilei.push(c); else dupaZi.set(cheie, [c]);
    }
    return [...dupaZi.entries()];
  }, [comenzi]);
  /*
    O zi poate fi taiata de marginea paginii: prima zi a unei pagini isi are inceputul pe
    pagina dinainte, ultima isi are restul pe urmatoarea. Acolo numarul si suma din capul zilei
    ar fi ale unei PARTI din zi, deci se spune ca sunt „pe pagina asta”.
  */
  const maiSuntPagini = filtre.page * ORDERS_PAGE_SIZE < totalFiltru;
  const eTaiata = (i: number) => (i === 0 && filtre.page > 1) || (i === zile.length - 1 && maiSuntPagini);

  return (
    <div className={cn("mx-auto max-w-5xl text-[13px]", cateAlese > 0 && "pb-10 lg:pb-20")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Comenzi</h1>
          <SubtitluComenzi total={total} inAsteptare={numarari.pending ?? 0} />
        </div>
        <ActiuniAntet asezare={filtre.asezare} areComenzi={totalFiltru > 0} />
      </div>

      {/* Comutator in segmente, cu numarul fiecarei grupe. Pe telefon e lat cat ecranul, cu numarul sub nume. */}
      <SegmenteGrupe
        className="mt-5 w-full sm:w-auto"
        grupe={GRUPE.map((g) => ({ cheie: g.cheie, eticheta: g.eticheta, numar: cateInGrupa(g.cheie, numarari, total) }))}
        grupa={filtre.grupa}
        laAlegere={(g) => mergi({ grupa: g, page: 1 })}
      />

      <RandFiltre className="mt-3" nav={navCuSelectie} cuFiltre={areFiltre(filtre)} laGolire={() => mergi(filtreGoale(filtre.asezare))}>
        <FiltruSursa nav={navCuSelectie} surse={surse} className={LOC_FILTRU} />
      </RandFiltre>

      <RezultatLot className="mt-3" />

      <div className={cn("mt-1 transition-opacity", inAsteptare && "opacity-60")} aria-busy={inAsteptare}>
        {zile.map(([zi, aleZilei], i) => {
          const iduri = aleZilei.map((c) => c.id);
          const bifate = iduri.filter((id) => alese.has(id)).length;
          const toateBifate = bifate === iduri.length;
          const numeleZilei = ziuaLunga(aleZilei[0].creataLa);
          /* In bani intregi, si doar comenzile in lei: o suma care amesteca monede n-ar insemna nimic. */
          const sumaZilei = aleZilei.reduce((s, c) => s + (c.moneda === "lei" ? Math.round(c.total * 100) : 0), 0) / 100;
          return (
            <section key={zi} aria-label={numeleZilei}>
              {/* Capul zilei ramane lipit sus cat derulezi prin comenzile ei. Fond PLIN, nu translucid: randurile nu se vad prin el. */}
              <header className="sticky top-14 z-10 -mx-2 flex items-center justify-between gap-3 bg-background px-2 pb-2 pt-5">
                <label className={cn("flex min-w-0 cursor-pointer items-center gap-2.5 pl-4", ATINGERE)} title={`Selectează toate comenzile din ${numeleZilei}`}>
                  <input
                    type="checkbox"
                    checked={toateBifate}
                    ref={(el) => { if (el) el.indeterminate = bifate > 0 && !toateBifate; }}
                    onChange={() => pune(iduri, !toateBifate)}
                    aria-label={`Selectează toate comenzile din ${numeleZilei}`}
                    className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-border accent-foreground"
                  />
                  <h2 className="truncate text-sm font-semibold text-foreground first-letter:uppercase">{numeleZilei}</h2>
                </label>
                <p className="flex-shrink-0 text-right text-xs text-muted-foreground">
                  {pluralRo(aleZilei.length, "comandă", "comenzi")}{eTaiata(i) && " pe pagina asta"}
                  , {suma(sumaZilei)}
                </p>
              </header>
              {/*
                ⚠ `py-px`: conturul unei fise e desenat cu un pixel in AFARA ei. Lipita de capul
                zilei, prima fisa isi pierdea linia de sus sub fondul plin al capului, iar ultima
                isi pierdea linia de jos sub capul zilei urmatoare (proprietarul, 24.11.2026: „nu
                se vad marginile complete"). Pixelul asta de sus si de jos e locul conturului.
              */}
              <div className="space-y-2 py-px">
                {aleZilei.map((c) => <Rand key={c.id} comanda={c} aleasa={alese.has(c.id)} comuta={comuta} />)}
              </div>
            </section>
          );
        })}
        {zile.length === 0 && (
          <StareGoala
            className="mt-5"
            titlu={filtre.q ? `Nimic nu se potrivește cu „${filtre.q}”` : total === 0 ? "Nicio comandă încă" : "Nicio comandă în filtrul ales"}
            lamurire={total === 0 ? "Comenzile apar aici imediat ce le plasează clienții." : undefined}
            laStergere={areFiltre(filtre) ? () => mergi(filtreGoale(filtre.asezare)) : undefined}
          />
        )}
        {/* Pagina noua incepe de sus: ramas la capatul listei, omul ar vedea sfarsitul paginii urmatoare. */}
        <Paginare className="mt-5 px-1" pagina={filtre.page} total={totalFiltru} laPagina={(p) => { mergi({ page: p }); window.scrollTo({ top: 0 }); }} />
      </div>

      <BaraSelectie comenzi={comenzi} />
    </div>
  );
}

/**
 * Un rand. ⚠ Memorat: primeste comanda, daca e bifata si o functie care nu se schimba, deci la
 * o bifa se redeseneaza randul ei, nu toate cele 50.
 */
const Rand = memo(function Rand({ comanda: c, aleasa, comuta }: { comanda: ComandaLista; aleasa: boolean; comuta: (id: string) => void }) {
  const { deschide } = useLista();
  const e = expediere(c);
  const d = c.factura.document;
  const plata = rezumatPlata(c);
  /*
    O comanda anulata sau rambursata NU se estompeaza cu `opacity`: la 70% textul gri cobora la
    un contrast de 2,7 la 1 (minimul de citit e 4,5). Ca e incheiata o spune randul de jos, care
    ii scrie starea in locul pasilor si nu mai are butoane.
  */
  const inchisa = INCHISE.has(c.status.cheie);

  return (
    <article
      onClick={(ev) => deschide(ev, c.id)}
      onAuxClick={(ev) => deschide(ev, c.id)}
      className={cn(
        "cursor-pointer rounded-xl bg-white ring-1 transition hover:ring-black/20",
        aleasa ? "ring-foreground/60" : "ring-black/[0.07]",
      )}
    >
      {/*
        Randul de sus: ce e comanda. Bifa, pozele, cine, ce, de unde, cat.
        Pe ecran lat: bifa si pozele in stanga, textul la mijloc, banii in dreapta. Pe telefon
        aceeasi asezare lasa textului cam 90 px intre poze si bani („Proba Of…", „2 × Bec …"),
        deci acolo cine si cat stau pe primul rand, iar produsele si livrarea iau latimea intreaga.
      */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4">
        {/* Eticheta lata cat degetul: bifa nimerita pe alaturi nu deschide comanda. */}
        <label className={cn("-m-1.5 cursor-pointer self-start p-1.5 sm:row-span-3", ATINGERE)}>
          <input
            type="checkbox"
            checked={aleasa}
            onChange={() => comuta(c.id)}
            aria-label={`Selectează comanda ${c.numar}`}
            className="block h-4 w-4 cursor-pointer rounded border-border accent-foreground"
          />
        </label>
        <span className="row-span-3 hidden sm:block"><TeancPoze produse={c.produse} marime={52} cate={2} /></span>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <NumarComanda comanda={c} />
          <span className="truncate text-foreground">{c.client.firma ?? c.client.nume}</span>
          <span className="text-xs text-muted-foreground">{ora(c.creataLa)}</span>
        </p>
        <div className="text-right sm:row-span-3">
          <Total comanda={c} className="block text-[15px] font-semibold" />
          <p className={cn("text-xs", plata.atentie ? "font-medium text-destructive" : "text-muted-foreground")}>{plata.text}</p>
        </div>
        <div className="col-span-3 mt-2 flex min-w-0 items-center gap-2.5 sm:col-span-1 sm:mt-0.5">
          <span className="flex-shrink-0 sm:hidden"><TeancPoze produse={c.produse} marime={36} cate={2} /></span>
          <p className="min-w-0 truncate text-muted-foreground" title={rezumatProduse(c)}>{rezumatProduse(c)}</p>
        </div>
        <p className="col-span-3 mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-1 sm:mt-1.5">
          <Sursa sursa={c.sursa} />
          <span className="min-w-0 truncate">{rezumatLivrare(c)}</span>
        </p>
      </div>

      {/* Randul de jos: unde a ajuns si ce urmeaza. Pasii in stanga, butoanele pasului urmator in dreapta. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/70 px-4 py-3">
        <div className="min-w-[15rem] max-w-md flex-1">
          {inchisa
            ? <p className="text-xs font-medium text-muted-foreground">{c.status.eticheta}</p>
            : <Pasi comanda={c} />}
        </div>

        {/* Pe telefon butoanele sunt cele mici, ca trei sa incapa pe un rand; la o latime si mai mica trec pe al doilea. */}
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5">
          {!inchisa && <ButonConfirma comanda={c} className={cn("h-8 rounded-lg px-3 text-xs sm:h-9", ATINGERE)} />}
          {!inchisa && !d && <ZonaFactura comanda={c} marime="adaptiv" />}
          {/* Livrarea fara AWB (ridicare din magazin, livrare proprie, dusa de marketplace) e spusa o data, sus, langa sursa. */}
          {(e.fel === "awb" || (!inchisa && (e.fel === "buton" || e.fel === "alege" || e.fel === "marketplace"))) && (
            <span className="min-w-0 max-w-[15rem]"><ZonaExpediere comanda={c} marime="adaptiv" /></span>
          )}
          <MeniuComanda comanda={c} className="hidden sm:grid" />
        </div>
      </div>
    </article>
  );
});

/** Patru pasi, legati printr-o linie. Fara pastile: un cerc bifat, unul conturat, restul stinse. */
function Pasi({ comanda: c }: { comanda: ComandaLista }) {
  const e = expediere(c);
  const d = c.factura.document;
  const pasi = [
    { nume: "Confirmată", gata: c.status.cheie !== "pending" },
    { nume: d ? `Factură ${d.numar}`.trim() : "Factură", gata: !!d && d.fel !== "storno" },
    { nume: "AWB", gata: e.fel === "awb" || ["shipped", "delivered"].includes(c.status.cheie) },
    { nume: "Livrată", gata: c.status.cheie === "delivered" },
  ];
  const urmatorul = pasi.findIndex((p) => !p.gata);

  return (
    <ol className="flex items-start">
      {pasi.map((p, i) => (
        <li key={i} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
          {i > 0 && (
            <span aria-hidden="true" className={cn("absolute right-1/2 top-[9px] h-px w-full", pasi[i - 1].gata && p.gata ? "bg-foreground" : "bg-border")} />
          )}
          <span className={cn(
            "relative z-[1] grid h-[19px] w-[19px] place-items-center rounded-full",
            p.gata ? "bg-foreground text-background"
              : i === urmatorul ? "bg-white ring-2 ring-foreground"
                : "bg-white ring-1 ring-border",
          )}>
            {p.gata && (i === 1 ? <FileCheck2 className="h-3 w-3" /> : <Check className="h-3 w-3" strokeWidth={3} />)}
          </span>
          <span className={cn(
            "mt-1.5 max-w-full truncate px-1 text-[11px]",
            p.gata ? "text-foreground" : i === urmatorul ? "font-medium text-foreground" : "text-muted-foreground",
          )}>
            {p.nume}
          </span>
        </li>
      ))}
    </ol>
  );
}
