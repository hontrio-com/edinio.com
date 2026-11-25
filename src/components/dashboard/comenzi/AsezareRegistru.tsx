"use client";

/*
  Asezarea „Registru”: un tabel curat si dens, in felul registrelor de plati si de comenzi din
  panourile mature. Ideea care o tine: O SINGURA coloana de livrare si una de factura, oricati
  curieri ar fi conectati. Comanda stie ce curier a ales clientul, deci butonul ei e sigla acelui
  curier; ceilalti stau intr-un meniu.

  Hotarata de proprietar ca asezare IMPLICITA (24.11.2026). Mentiunile lui din aceeasi zi:
  filele filtreaza pe server (o fila cu „14" arata cele 14 comenzi), randul se deschide la clic
  si in spatiul alb, iar pe telefon butoanele umplu latimea, bara de selectie ia locul barei
  de navigare si numaratoarea sta sub lista, langa paginare.
*/

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { FileSubliniate, LOC_FILTRU, Paginare, RandFiltre, StareGoala } from "@/components/dashboard/liste/navigare";
import { dataScurta, PozaProdus } from "@/components/dashboard/liste/piese";
import { useLot } from "./actiuni";
import {
  ActiuniAntet, BaraSelectie, CardComanda, ContClient, FiltruSursa, MeniuComanda, NumarComanda, RezultatLot, SubtitluComenzi,
  useLista, ZonaExpediere, ZonaFactura, type NavigareComenzi,
} from "./comune";
import type { ComandaLista } from "./date";
import { areFiltre, filtreGoale, STARI } from "./filtre";
import type { DateAsezare } from "./ListaComenzi";
import { Sursa, StareText, Total } from "./piese";
import { expediere, rezumatLivrare, rezumatPlata, rezumatProduse } from "./rezumate";

/** De la ce latime a locului incape tabelul. ⚠ Acelasi prag ca `@[61rem]` din clasele de mai jos. */
const PRAG_TABEL = 976;

export function AsezareRegistru({ comenzi, totalFiltru, numarari, total, surse, nav, telefon }: DateAsezare) {
  const { filtre, inAsteptare, mergiLa } = nav;
  const { selectie } = useLot();
  const { alese, comuta, pune, goleste } = selectie;

  /*
    Selectia e a paginii de pe ecran. La orice schimbare de fila, de filtru sau de pagina se
    goleste, ca o actiune pe mai multe comenzi sa nu cuprinda niciodata comenzi care nu se vad.
  */
  const mergi = useCallback<NavigareComenzi["mergiLa"]>((urmator, optiuni) => {
    goleste();
    mergiLa(urmator, optiuni);
  }, [mergiLa, goleste]);
  const navCuSelectie = useMemo<NavigareComenzi>(() => ({ filtre, inAsteptare, mergiLa: mergi }), [filtre, inAsteptare, mergi]);

  const iduri = useMemo(() => comenzi.map((c) => c.id), [comenzi]);
  const cateAlese = iduri.filter((id) => alese.has(id)).length;
  const toateAlese = iduri.length > 0 && cateAlese === iduri.length;

  /*
    Tabel sau fise? Hotaraste latimea LOCULUI, nu a ecranului (bara laterala ia si ea 240 px).
    Pana la prima masuratoare stau amandoua in pagina si CSS-ul o arata pe cea buna, ca sa nu
    clipeasca nimic la incarcare; dupa ea ramane DOAR forma care se vede, adica jumatate din
    noduri. Unui telefon (ghicit pe server) i se trimit din capul locului doar fisele.
  */
  const loc = useRef<HTMLDivElement>(null);
  const [forma, setForma] = useState<"tabel" | "fise" | null>(telefon ? "fise" : null);
  useEffect(() => {
    const el = loc.current;
    if (!el) return;
    /* `ResizeObserver` anunta o data la pornire si apoi la fiecare schimbare de latime. */
    const ro = new ResizeObserver(() => setForma(el.clientWidth >= PRAG_TABEL ? "tabel" : "fise"));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    /*
      Cat e ceva bifat, lista primeste loc dedesubt: pe telefon bara de selectie e mai inalta
      decat bara de navigare pe care o inlocuieste, iar pe ecran lat bara plutitoare ar acoperi
      paginarea cand ajungi la capatul listei.
    */
    <div className={cn("text-[13px]", cateAlese > 0 && "pb-10 lg:pb-20")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Comenzi</h1>
          <SubtitluComenzi total={total} inAsteptare={numarari.pending ?? 0} />
        </div>
        <ActiuniAntet asezare={filtre.asezare} areComenzi={totalFiltru > 0} />
      </div>

      {/* Starile, ca file subliniate: cuvant si numar, fara pastile. */}
      <FileSubliniate
        className="mt-5"
        eticheta="Starea comenzilor"
        activa={filtre.status}
        laAlegere={(cheie) => mergi({ status: cheie, page: 1 })}
        file={STARI.map((s) => ({ cheie: s.cheie, eticheta: s.eticheta, numar: s.cheie === "all" ? total : numarari[s.cheie] ?? 0 }))}
      />

      <RandFiltre className="mt-4" nav={navCuSelectie} cuFiltre={areFiltre(filtre)} laGolire={() => mergi(filtreGoale(filtre.asezare))}>
        <FiltruSursa nav={navCuSelectie} surse={surse} className={LOC_FILTRU} />
      </RandFiltre>

      <RezultatLot className="mt-3" />

      <div ref={loc} className={cn("@container mt-3 transition-opacity", inAsteptare && "opacity-60")} aria-busy={inAsteptare}>
        {comenzi.length === 0 ? (
          <ListaGoala nav={navCuSelectie} total={total} />
        ) : (
          <>
            {/*
              ⚠ Coloane cu latimi HOTARATE (`table-fixed`), nu lasate dupa continut. Lasate dupa
              continut, textele taiate cu „…" isi cer toata lungimea, coloanele nu se mai strang,
              iar pe un laptop de 1280-1440 px tabelul iesea din cadru cu pana la 300 px si ii
              taia coloana de factura. Asa incape intreg de la 976 px de loc in sus (ecran de
              1280 cu bara laterala); „Produse" ia ce ramane, iar „Comandă", „Client", „Livrare"
              si „Factură" cresc odata cu locul (`cqw` = sutimi din latimea lui).
            */}
            {/*
              ⚠ Clasele care ascund o forma dupa latime (`hidden @[61rem]:block`) se pun DOAR cat
              stau amandoua in pagina. Odata aleasa forma, ea ramane la vedere orice ar fi: daca
              masuratoarea intarzie dupa o redimensionare (fila in fundal), se vede o clipa forma
              veche, nu o lista goala.
            */}
            {forma !== "fise" && (
              <div className={cn("overflow-hidden rounded-xl bg-white ring-1 ring-black/10", forma === null && "hidden @[61rem]:block")}>
                <table className="w-full table-fixed border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                      <th className="relative w-11 p-0">
                        <label className="absolute inset-0 flex cursor-pointer items-center pl-4">
                          <input
                            type="checkbox"
                            checked={toateAlese}
                            ref={(el) => { if (el) el.indeterminate = cateAlese > 0 && !toateAlese; }}
                            onChange={() => pune(iduri, !toateAlese)}
                            aria-label="Selectează toate comenzile de pe pagină"
                            className="h-4 w-4 cursor-pointer rounded border-border accent-foreground"
                          />
                        </label>
                      </th>
                      <th className="w-[clamp(112px,9cqw,150px)] py-2.5 pl-1 pr-3 font-medium">Comandă</th>
                      <th className="w-[clamp(128px,13cqw,230px)] py-2.5 pr-4 font-medium">Client</th>
                      <th className="py-2.5 pr-4 font-medium">Produse</th>
                      <th className="w-[106px] py-2.5 pr-4 text-right font-medium">Total</th>
                      <th className="w-[116px] py-2.5 pl-2 pr-3 font-medium">Stare</th>
                      <th className="w-[clamp(168px,17cqw,236px)] py-2.5 pr-4 font-medium">Livrare</th>
                      <th className="w-[clamp(104px,10cqw,150px)] py-2.5 pr-4 font-medium">Factură</th>
                      <th className="w-11 py-2.5 pr-3"><span className="sr-only">Acțiuni</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comenzi.map((c) => <RandTabel key={c.id} comanda={c} aleasa={alese.has(c.id)} comuta={comuta} />)}
                  </tbody>
                </table>
              </div>
            )}

            {/* `grid-cols-1` scris anume: o coloana lasata pe „auto" se intinde dupa cel mai lung text si scoate fisa din ecran. */}
            {forma !== "tabel" && (
              <div className={cn("grid grid-cols-1 gap-2 @[40rem]:grid-cols-2", forma === null && "@[61rem]:hidden")}>
                {comenzi.map((c) => <CardComanda key={c.id} comanda={c} jos="stare" aleasa={alese.has(c.id)} laComutare={comuta} />)}
              </div>
            )}

            <Paginare
              className="mt-4 px-1"
              pagina={filtre.page}
              total={totalFiltru}
              /* Pagina noua incepe de sus: ramas la capatul listei, omul ar vedea sfarsitul paginii urmatoare. */
              laPagina={(p) => { mergi({ page: p }); window.scrollTo({ top: 0 }); }}
            />
          </>
        )}
      </div>

      <BaraSelectie comenzi={comenzi} />
    </div>
  );
}

/**
 * Un rand al tabelului. ⚠ Memorat: primeste doar comanda, daca e bifata si o functie care nu se
 * schimba, deci la o bifa se redeseneaza randul ei, nu toate cele 50.
 */
const RandTabel = memo(function RandTabel({ comanda: c, aleasa, comuta }: {
  comanda: ComandaLista;
  aleasa: boolean;
  comuta: (id: string) => void;
}) {
  const { deschide } = useLista();
  const plata = rezumatPlata(c);
  return (
    <tr
      onClick={(e) => deschide(e, c.id)}
      onAuxClick={(e) => deschide(e, c.id)}
      className={cn(
        "cursor-pointer border-b border-border/70 align-top transition-colors last:border-0 hover:bg-muted/40",
        aleasa && "bg-muted/60",
      )}
    >
      {/* Eticheta cat toata celula: bifa nimerita pe alaturi nu deschide comanda. */}
      <td className="relative p-0">
        <label className="absolute inset-0 flex cursor-pointer items-start pl-4 pt-3.5">
          <input
            type="checkbox"
            checked={aleasa}
            onChange={() => comuta(c.id)}
            aria-label={`Selectează comanda ${c.numar}`}
            className="h-4 w-4 cursor-pointer rounded border-border accent-foreground"
          />
        </label>
      </td>
      <td className="overflow-hidden py-3 pl-1 pr-3">
        <NumarComanda comanda={c} />
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{dataScurta(c.creataLa)}</div>
        <Sursa sursa={c.sursa} className="mt-1 max-w-full" />
      </td>
      <td className="py-3 pr-4">
        <div className="truncate font-medium text-foreground" title={c.client.nume}>{c.client.nume}</div>
        {c.client.firma && <div className="truncate text-xs text-foreground/80" title={c.client.firma}>{c.client.firma}</div>}
        {/* Telefonul, iar e-mailul in indiciu: lista se cauta si dupa el. */}
        <div className="truncate text-xs text-muted-foreground" title={c.client.email ?? undefined}>{c.client.telefon ?? c.client.email ?? ""}</div>
        <ContClient comanda={c} className="mt-0.5" />
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-start gap-2.5">
          <PozaProdus poza={c.produse[0]?.poza ?? null} nume={c.produse[0]?.nume ?? ""} marime={34} />
          <div className="min-w-0">
            <div className="truncate text-foreground" title={rezumatProduse(c)}>{c.produse[0]?.nume ?? "Fără produse"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {pluralRo(c.bucati, "bucată", "bucăți")}
              {c.produse.length > 1 && `, ${pluralRo(c.produse.length, "produs", "produse")}`}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-right">
        <Total comanda={c} className="block font-semibold" />
        {/* Suma ramane pe un rand; felul platii se poate rupe pe doua („Transfer bancar, neplătită"). */}
        <div className={cn("text-xs", plata.atentie ? "font-medium text-destructive" : "text-muted-foreground")}>{plata.text}</div>
      </td>
      <td className="py-3 pl-2 pr-3"><StareText status={c.status} /></td>
      <td className="py-3 pr-4"><Livrare comanda={c} /></td>
      <td className="py-3 pr-4">
        <ZonaFactura comanda={c} cuFel faraCasa={<span className="text-xs text-muted-foreground">Nicio casă conectată</span>} />
      </td>
      <td className="py-3 pr-3 text-right">
        <MeniuComanda comanda={c} className="ml-auto grid" />
      </td>
    </tr>
  );
});

/** Celula de livrare: zona de expediere si, cat inca nu e AWB, unde pleaca. */
function Livrare({ comanda: c }: { comanda: ComandaLista }) {
  const fel = expediere(c).fel;
  return (
    <div className="min-w-0">
      {/* In coloana ingusta a tabelului numarul AWB sta pe randul lui, intreg: e ce citeste si copiaza omul. */}
      <ZonaExpediere comanda={c} asezare="coloana" stareImplicita="AWB emis" className={cn(fel === "text" && "pt-2")} />
      {(fel === "buton" || fel === "alege" || fel === "marketplace") && (
        <div className="mt-1 truncate text-xs text-muted-foreground" title={rezumatLivrare(c)}>{rezumatLivrare(c)}</div>
      )}
    </div>
  );
}

/** Lista goala spune DE CE e goala: n-ai comenzi deloc, sau filtrul ales n-are niciuna. */
function ListaGoala({ nav, total }: { nav: NavigareComenzi; total: number }) {
  const { filtre } = nav;
  const faraFiltre = () => nav.mergiLa(filtreGoale(filtre.asezare));
  if (!areFiltre(filtre)) {
    return total === 0
      ? <StareGoala titlu="Nicio comandă încă" lamurire="Comenzile apar aici imediat ce le plasează clienții." />
      : <StareGoala titlu="Nicio comandă pe pagina asta" laStergere={faraFiltre} />;
  }
  const stare = STARI.find((s) => s.cheie === filtre.status);
  const altele = !!filtre.q || filtre.source !== "all" || !!filtre.deLa || !!filtre.panaLa;
  return (
    <StareGoala
      titlu={filtre.q ? `Nimic nu se potrivește cu „${filtre.q}”` : "Nicio comandă în filtrul ales"}
      lamurire={
        altele
          ? "Încearcă alt cuvânt, altă sursă sau altă perioadă."
          : `Magazinul nu are acum nicio comandă în starea „${stare?.eticheta ?? ""}”.`
      }
      laStergere={faraFiltre}
    />
  );
}
