"use client";

/*
  Asezarea „Două panouri”: lista in stanga, comanda deschisa in dreapta, ca intr-un program de
  e-mail. Comerciantul nu mai pleaca din lista ca sa vada o comanda si nu se mai intoarce: o
  alege, o rezolva (AWB, factura, stare) si trece la urmatoarea cu sageata in jos.

  Aici butonul cu sigla curierului are loc sa fie MARE, fiindca sta in fisa comenzii, nu
  inghesuit intr-o celula de tabel.

  Are tot ce au celelalte asezari: chemarea curierului, exportul, cautarea, sursa, perioada si
  actiunile pe mai multe comenzi. Un rand are doua gesturi, ca intr-o casuta de mesaje: clicul
  pe rand DESCHIDE comanda in panou, bifa o ALEGE pentru o actiune pe mai multe.

  Pe telefon si pe tableta doua panouri n-au loc: ramane lista, iar comanda atinsa se deschide
  in pagina ei.
*/

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Check, ChevronDown, FileCheck2, FileX2, Loader2, Mail, MapPin, Phone, Printer, Store, Truck,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CurierPropriu } from "@/lib/orders/awb-propriu";
import type { Sigla } from "@/lib/integrari/sigle";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { ATINGERE, ButonSigla, INEL, PunctStare } from "@/components/dashboard/atomi-panou";
import { LOC_FILTRU, Paginare, RandFiltre, SegmenteGrupe } from "@/components/dashboard/liste/navigare";
import { dataLunga, dataScurta, PozaProdus, SiglaMica, suma } from "@/components/dashboard/liste/piese";
import { useActiuni, useLot } from "./actiuni";
import {
  ActiuniAntet, BaraSelectie, ButonConfirma, ButonCurier, ContClient, FiltruSursa, RezultatLot, SubtitluComenzi, useEmitereFactura,
  useLista, useSchimbareDeStare, type NavigareComenzi,
} from "./comune";
import { STARI_COMANDA, type ComandaLista } from "./date";
import { areFiltre, cateInGrupa, filtreGoale, GRUPE } from "./filtre";
import type { DateAsezare } from "./ListaComenzi";
import { Sursa, Total } from "./piese";
import { expediere, rezumatLivrare, rezumatPlata, stareaAwb } from "./rezumate";

export function AsezarePanouri({ comenzi: lista, totalFiltru, numarari, total, surse, nav }: DateAsezare) {
  /* Grupa, cautarea, sursa si perioada stau in adresa: lista vine de pe server, gata filtrata, pagina cu pagina. */
  const { filtre, inAsteptare, mergiLa } = nav;
  const { selectie } = useLot();
  const { alese, comuta, pune, goleste } = selectie;
  const { mergiLaComanda } = useLista();
  /** Comanda deschisa in panoul din dreapta. */
  const [deschisa, setDeschisa] = useState<string | null>(null);

  /* La orice schimbare de grupa, de filtru sau de pagina, bifele si comanda deschisa sunt ale altei liste: se golesc. */
  const mergi = useCallback<NavigareComenzi["mergiLa"]>((urmator, optiuni) => {
    goleste();
    setDeschisa(null);
    mergiLa(urmator, optiuni);
  }, [mergiLa, goleste, setDeschisa]);
  const navCuSelectie = useMemo<NavigareComenzi>(() => ({ filtre, inAsteptare, mergiLa: mergi }), [filtre, inAsteptare, mergi]);

  const comanda = lista.find((c) => c.id === deschisa) ?? lista[0] ?? null;
  const iduri = useMemo(() => lista.map((c) => c.id), [lista]);
  const cateAlese = iduri.filter((id) => alese.has(id)).length;
  const toateAlese = iduri.length > 0 && cateAlese === iduri.length;

  /*
    Doua panouri au loc doar pe ecran lat. Pe telefon si pe tableta ramane lista, iar comanda
    atinsa se deschide in pagina ei: un panou de detalii inghesuit sub lista ar fi iesit din
    ecran chiar cand il alegi.
  */
  const deschide = useCallback((id: string) => {
    if (window.matchMedia("(min-width: 1024px)").matches) setDeschisa(id);
    else mergiLaComanda(id);
  }, [mergiLaComanda, setDeschisa]);

  /* Sageata sus si jos trec la comanda vecina, ca intr-o lista de mesaje. */
  function laTasta(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const i = lista.findIndex((c) => c.id === comanda?.id);
    const tinta = lista[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (!tinta) return;
    e.preventDefault();
    setDeschisa(tinta.id);
    document.getElementById(`rand-${tinta.id}`)?.focus();
  }

  return (
    /* Pe telefon bara de selectie e mai inalta decat bara de navigare pe care o inlocuieste: lista primeste loc sub ea. */
    <div className={cn("text-[13px]", cateAlese > 0 && "pb-10 lg:pb-0")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Comenzi</h1>
          <SubtitluComenzi total={total} inAsteptare={numarari.pending ?? 0} />
        </div>
        <ActiuniAntet asezare={filtre.asezare} areComenzi={totalFiltru > 0} />
      </div>

      <RandFiltre className="mt-5" nav={navCuSelectie} cuFiltre={areFiltre(filtre)} laGolire={() => mergi(filtreGoale(filtre.asezare))}>
        <FiltruSursa nav={navCuSelectie} surse={surse} className={LOC_FILTRU} />
      </RandFiltre>

      <RezultatLot className="mt-3" />

      {/*
        Panourile iau inaltimea ramasa sub antet si filtre. Cat e ceva bifat se scurteaza cu
        inaltimea barei plutitoare, ca ea sa nu acopere nici paginarea listei, nici totalul comenzii.
      */}
      <div
        className={cn(
          "mt-4 grid grid-cols-1 overflow-hidden rounded-xl bg-white ring-1 ring-black/10 lg:min-h-[30rem] lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]",
          cateAlese > 0 ? "lg:h-[calc(100vh-20rem)]" : "lg:h-[calc(100vh-15.5rem)]",
        )}
      >
        {/* ── Stanga: lista ── */}
        <div className="flex min-h-0 flex-col lg:border-r lg:border-border">
          <div className="border-b border-border p-3">
            <SegmenteGrupe
              mereuStivuit
              grupe={GRUPE.map((g) => ({ cheie: g.cheie, eticheta: g.eticheta, numar: cateInGrupa(g.cheie, numarari, total) }))}
              grupa={filtre.grupa}
              laAlegere={(g) => mergi({ grupa: g, page: 1 })}
            />
          </div>

          {/* Bifa care le alege pe toate cele de pe pagina. */}
          {lista.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2.5 border-b border-border/70 px-3 py-2 text-xs text-muted-foreground max-lg:py-3">
              <input
                type="checkbox"
                checked={toateAlese}
                ref={(el) => { if (el) el.indeterminate = cateAlese > 0 && !toateAlese; }}
                onChange={() => pune(iduri, !toateAlese)}
                className="h-4 w-4 cursor-pointer rounded border-border accent-foreground"
              />
              {cateAlese > 0 ? pluralRo(cateAlese, "comandă aleasă", "comenzi alese") : "Alege toate comenzile de pe pagină"}
            </label>
          )}

          <div
            /* Cheia pe pagina si pe grupa: la o pagina noua lista porneste de sus, nu de unde ramasese derulata. */
            key={`${filtre.grupa}-${filtre.page}`}
            role="listbox"
            aria-label="Comenzi"
            aria-busy={inAsteptare}
            onKeyDown={laTasta}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto transition-opacity [scrollbar-color:rgb(0_0_0/0.18)_transparent] [scrollbar-width:thin]",
              inAsteptare && "opacity-60",
            )}
          >
            {lista.map((c) => (
              <RandLista key={c.id} comanda={c} deschisa={c.id === comanda?.id} bifata={alese.has(c.id)} deschide={deschide} comuta={comuta} />
            ))}
            {lista.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {filtre.q ? `Nimic nu se potrivește cu „${filtre.q}”.` : "Nicio comandă aici."}
              </p>
            )}
          </div>
          {/* Cate sunt in grupa si pe ce pagina esti: sub lista, cu sagetile de o parte si de alta. */}
          <Paginare
            ingusta
            className="border-t border-border px-3 py-2"
            pagina={filtre.page}
            total={totalFiltru}
            laPagina={(p) => mergi({ page: p })}
          />
        </div>

        {/* ── Dreapta: comanda (doar pe ecran lat) ── */}
        <div className="hidden min-h-0 lg:block">
          {comanda ? <Fisa comanda={comanda} /> : (
            <div className="grid h-full place-items-center p-10 text-sm text-muted-foreground">Alege o comandă din listă.</div>
          )}
        </div>
      </div>

      <BaraSelectie comenzi={lista} />
    </div>
  );
}

/**
 * Un rand al listei. ⚠ Memorat: la o bifa sau la deschiderea altei comenzi se redeseneaza doar
 * randurile care chiar se schimba. Functiile primite sunt aceleasi la fiecare desenare.
 */
const RandLista = memo(function RandLista({ comanda: c, deschisa, bifata, deschide, comuta }: {
  comanda: ComandaLista;
  /** E comanda aratata in panoul din dreapta. */
  deschisa: boolean;
  bifata: boolean;
  deschide: (id: string) => void;
  comuta: (id: string) => void;
}) {
  const e = expediere(c);
  return (
    <div
      id={`rand-${c.id}`}
      role="option"
      aria-selected={deschisa}
      tabIndex={deschisa ? 0 : -1}
      /* Bifa are rostul ei: clicul pe ea alege comanda, nu o deschide. */
      onClick={(ev) => { if (!(ev.target as HTMLElement).closest("label")) deschide(c.id); }}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); deschide(c.id); }
      }}
      className={cn(
        "relative flex w-full cursor-pointer items-start gap-1 border-b border-border/70 py-3 pl-1.5 pr-4 text-left transition-colors",
        /* Inelul e pe dinauntru: lista care deruleaza l-ar taia pe cel de afara. */
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        /* Randul „deschis" are rost doar cu panoul de alaturi: sub `lg` nu se marcheaza niciunul. */
        deschisa ? "hover:bg-muted/40 lg:bg-muted/70 lg:hover:bg-muted/70" : "hover:bg-muted/40",
        bifata && !deschisa && "bg-muted/40",
      )}
    >
      {deschisa && <span aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-0.5 bg-foreground lg:block" />}
      <label className={cn("flex-shrink-0 cursor-pointer p-1.5", ATINGERE)}>
        <input
          type="checkbox"
          checked={bifata}
          onChange={() => comuta(c.id)}
          aria-label={`Selectează comanda ${c.numar}`}
          className="block h-4 w-4 cursor-pointer rounded border-border accent-foreground"
        />
      </label>
      <span className="min-w-0 flex-1 pt-px">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold tabular-nums text-foreground">{c.numar}</span>
          <Total comanda={c} className="font-medium" />
        </span>
        <span className="block truncate text-foreground">{c.client.firma ?? c.client.nume}</span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <PunctStare ton={c.status.ton} />
            <span className="truncate">{c.status.eticheta}, {dataScurta(c.creataLa)}</span>
          </span>
          {e.fel === "awb" && <SiglaMica sigla={e.awb.curier} />}
          {(e.fel === "buton" || e.fel === "marketplace") && <SiglaMica sigla={e.sigla} className="opacity-60 grayscale" />}
        </span>
      </span>
    </div>
  );
});

/**
 * Ceilalti curieri conectati. Primii cativa la vedere, restul la cerere: un magazin are de
 * obicei unul pana la trei curieri, dar unul cu toti conectati ar ridica un perete de sigle sub
 * butonul principal, luandu-i locul.
 */
function AltiCurieri({ comanda, altii, refuz, titlu }: { comanda: ComandaLista; altii: Sigla[]; refuz: string | null; titlu: string }) {
  const [toti, setToti] = useState(false);
  const LA_VEDERE = 5;
  const aratati = toti ? altii : altii.slice(0, LA_VEDERE);
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground">{titlu}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {aratati.map((s) => <ButonCurier key={s.cheie} comanda={comanda} sigla={s} marime="mic" refuz={refuz} />)}
        {altii.length > LA_VEDERE && (
          <button
            type="button"
            onClick={() => setToti((v) => !v)}
            className={cn("h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-black/10 transition hover:text-foreground hover:ring-black/25", INEL)}
          >
            {toti ? "Mai puțini" : `Încă ${altii.length - LA_VEDERE}`}
          </button>
        )}
      </div>
    </div>
  );
}

const BUTON_FISA = `inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 ${INEL}`;

function Fisa({ comanda: c }: { comanda: ComandaLista }) {
  const { adresa, mergiLaComanda } = useLista();
  const { awb, eticheta, deschideDocumentul, facturaInLucru, stareInLucru } = useActiuni();
  const schimba = useSchimbareDeStare();
  const emite = useEmitereFactura();
  const e = expediere(c);
  const d = c.factura.document;
  const plata = rezumatPlata(c);
  return (
    <div className="h-full min-h-0 overflow-y-auto [scrollbar-color:rgb(0_0_0/0.18)_transparent] [scrollbar-width:thin]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold tabular-nums tracking-tight text-foreground">Comanda {c.numar}</h2>
            {c.sursa.cuFluxPropriu ? (
              /* Starea o tine marketplace-ul: aici doar se citeste. */
              <span className="inline-flex h-7 items-center gap-2 text-[13px] text-foreground" title={`Starea vine de la ${c.sursa.eticheta}`}>
                <PunctStare ton={c.status.ton} />
                {c.status.eticheta}
              </span>
            ) : (
              /* Starea, cu punctul ei, e si locul din care se schimba. */
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={stareInLucru}
                  aria-label={`Starea comenzii: ${c.status.eticheta}. Schimbă starea`}
                  className={cn("-mx-1.5 inline-flex h-7 items-center gap-2 rounded-md px-1.5 text-[13px] text-foreground transition hover:bg-muted disabled:opacity-60", INEL)}
                >
                  <PunctStare ton={c.status.ton} />
                  {c.status.eticheta}
                  {stareInLucru ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Schimbă starea în</p>
                  {STARI_COMANDA.map((st) => (
                    <DropdownMenuItem key={st.cheie} disabled={st.cheie === c.status.cheie} onClick={() => schimba([c], st.cheie)}>
                      <PunctStare ton={st.ton} />
                      <span className="flex-1">{st.eticheta}</span>
                      {st.cheie === c.status.cheie && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {dataLunga(c.creataLa)} <span aria-hidden="true">·</span> <Sursa sursa={c.sursa} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ButonConfirma comanda={c} className="h-9 gap-1.5 rounded-lg px-3 text-[13px]" />
          <Link href={adresa(c.id)} prefetch={false} className={cn(BUTON_FISA, "gap-1")}>
            Toate detaliile <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-px bg-border md:grid-cols-2">
        {/* Expedierea: butonul mare cu sigla curierului. */}
        <section className="bg-white p-6">
          <h3 className="text-xs font-medium text-muted-foreground">Expediere</h3>
          <p className="mt-1.5 flex items-start gap-1.5 text-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> {rezumatLivrare(c)}
          </p>

          <div className="mt-4">
            {e.fel === "awb" && (
              <div className="flex flex-wrap items-center gap-4">
                {/* Sigla e si butonul: deschide fereastra curierului, cu urmarirea si anularea. */}
                <ButonSigla
                  sigla={e.awb.curier}
                  eticheta={`Deschide AWB-ul ${e.awb.curier.nume}`}
                  marime="mare"
                  onClick={() => awb(c.id, e.awb.curier.cheie as CurierPropriu, false)}
                />
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium text-foreground", !e.awb.inCurs && "font-mono")}>{e.awb.inCurs ? "Se emite…" : e.awb.numar}</p>
                  <p className="text-xs text-muted-foreground">{stareaAwb(e.awb, "AWB emis")}</p>
                  {e.awb.partener && e.awb.stare && <p className="text-xs text-muted-foreground">{e.awb.partener}</p>}
                </div>
                {!e.awb.inCurs && (
                  <button type="button" onClick={() => eticheta(c.id)} className={BUTON_FISA}>
                    <Printer className="h-4 w-4" /> Etichetă
                  </button>
                )}
              </div>
            )}
            {e.fel === "buton" && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <ButonCurier comanda={c} sigla={e.sigla} marime="mare" refuz={e.refuz} />
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {e.refuz ?? (c.livrare.alesDeClient ? "Curierul ales de client la comandă." : "Niciun AWB emis.")}
                  </p>
                </div>
                {e.altii.length > 0 && !e.refuz && <AltiCurieri comanda={c} altii={e.altii} refuz={e.refuz} titlu="Sau cu alt curier" />}
              </>
            )}
            {e.fel === "marketplace" && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <ButonSigla
                    sigla={e.sigla}
                    eticheta={`Expediere prin ${e.sigla.nume}: deschide comanda`}
                    marime="mare"
                    onClick={() => mergiLaComanda(c.id)}
                  />
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {e.refuz ?? `Expedierea prin ${e.sigla.nume} se face din pagina comenzii.`}
                  </p>
                </div>
                {e.altii.length > 0 && !e.refuz && <AltiCurieri comanda={c} altii={e.altii} refuz={e.refuz} titlu="Sau AWB cu un curier al tău" />}
              </>
            )}
            {e.fel === "alege" && (
              <div>
                <p className="text-xs text-muted-foreground">{e.refuz ?? "Alege curierul"}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {e.altii.map((s) => <ButonCurier key={s.cheie} comanda={c} sigla={s} marime="mic" refuz={e.refuz} />)}
                </div>
              </div>
            )}
            {e.fel === "text" && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                {e.cu === "magazin" ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}{e.text}
              </p>
            )}
          </div>
        </section>

        {/* Clientul si factura. */}
        <section className="bg-white p-6">
          <h3 className="text-xs font-medium text-muted-foreground">Client</h3>
          <p className="mt-1.5 font-medium text-foreground">{c.client.nume}</p>
          {c.client.firma && <p className="text-foreground/80">{c.client.firma}</p>}
          <div className="mt-1 space-y-0.5 text-muted-foreground">
            {c.client.telefon && (
              <a href={`tel:${c.client.telefon}`} className={cn("flex w-fit items-center gap-1.5 rounded-sm hover:text-foreground", INEL)}>
                <Phone className="h-3.5 w-3.5" /> {c.client.telefon}
              </a>
            )}
            {c.client.email && (
              <a href={`mailto:${c.client.email}`} className={cn("flex w-fit max-w-full items-center gap-1.5 rounded-sm hover:text-foreground", INEL)}>
                <Mail className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{c.client.email}</span>
              </a>
            )}
          </div>
          <ContClient comanda={c} className="mt-1.5 w-fit text-[13px]" />

          <h3 className="mt-5 text-xs font-medium text-muted-foreground">Factură</h3>
          <div className="mt-1.5">
            {d ? (
              <button type="button" onClick={() => deschideDocumentul(c.id)} title="Deschide documentul" className={cn("flex items-center gap-2 rounded-sm text-left", INEL)}>
                {d.fel === "storno" ? <FileX2 className="h-5 w-5 text-destructive" /> : <FileCheck2 className="h-5 w-5 text-success" />}
                <span>
                  <span className="block font-mono text-sm font-medium text-foreground">{d.numar || "emisă"}</span>
                  <span className="block text-xs text-muted-foreground">{d.fel === "storno" ? "Stornată" : d.fel === "proforma" ? "Proformă" : "Factură emisă"}</span>
                </span>
              </button>
            ) : facturaInLucru === c.id ? (
              <p className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Se emite factura…</p>
            ) : c.factura.casa ? (
              <>
                <div className="flex items-center gap-3">
                  <ButonSigla sigla={c.factura.casa} eticheta={`Emite factura ${c.factura.casa.nume}`} marime="mare" onClick={() => { if (c.factura.casa) emite(c, c.factura.casa); }} />
                  <p className="text-xs text-muted-foreground">Nicio factură emisă.</p>
                </div>
                {c.factura.alteCase.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">Sau la altă casă</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.factura.alteCase.map((s) => (
                        <ButonSigla key={s.cheie} sigla={s} eticheta={`Emite factura ${s.nume}`} marime="mic" onClick={() => emite(c, s)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <p className="text-muted-foreground">Nicio casă de facturare conectată.</p>}
          </div>
        </section>
      </div>

      {/* Produsele si banii. */}
      <section className="border-t border-border px-6 py-5">
        <h3 className="text-xs font-medium text-muted-foreground">{pluralRo(c.produse.length, "produs", "produse")}</h3>
        <ul className="mt-2 divide-y divide-border/70">
          {c.produse.map((p, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <PozaProdus poza={p.poza} nume={p.nume} marime={44} />
              <span className="min-w-0 flex-1 truncate text-foreground">{p.nume}</span>
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">{p.cantitate} × {suma(p.pret, c.moneda)}</span>
              <span className="w-24 whitespace-nowrap text-right font-medium tabular-nums text-foreground">{suma(p.pret * p.cantitate, c.moneda)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-3 w-full max-w-xs space-y-1 text-[13px]">
          {c.transport !== null && (
            <div className="flex justify-between text-muted-foreground"><dt>Transport</dt><dd className="tabular-nums">{c.transport > 0 ? suma(c.transport, c.moneda) : "inclus"}</dd></div>
          )}
          <div className="flex justify-between border-t border-border pt-1.5 text-sm font-semibold text-foreground"><dt>Total</dt><dd><Total comanda={c} /></dd></div>
          <div className={cn("flex justify-between", plata.atentie ? "font-medium text-destructive" : "text-muted-foreground")}><dt>Plată</dt><dd>{plata.text}</dd></div>
        </dl>
      </section>
    </div>
  );
}
