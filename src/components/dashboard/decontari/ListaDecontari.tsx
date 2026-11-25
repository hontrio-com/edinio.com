"use client";

/*
  Pagina de Decontări, in asezarea aleasa de proprietar pe 25.11.2026 („Registru"): un rand pe
  colet decontat, cele mai noi virari sus. Fiecare rand spune cand au venit banii, de la ce
  curier si pe ce AWB, cine a primit coletul, cand a platit, din ce comanda vine si cat a
  insemnat. Deasupra: filele curierilor, cautarea si perioada; in capul listei, totalul filtrului.

  Pe telefon si pe tableta coloanele n-au loc: fiecare colet devine trei randuri scurte, in
  aceeasi lista.

  Pagina doar CITESTE: filtrele stau in adresa, iar lista vine de pe server gata filtrata.
*/

import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { FileSubliniate, Paginare, RandFiltre, StareGoala, useNavigare } from "@/components/dashboard/liste/navigare";
import type { Colet, CurierDecont, Rezumat } from "./date";
import { adresaFiltrelor, areFiltre, FILTRE_GOALE, PE_PAGINA, type FiltreDecont } from "./filtre";
import { CapColete, NUME_COLETE, RandColet, TotalFiltru, ziIntreaga } from "./piese";

/** Ce primeste lista de la server. */
export interface DateDecontari {
  filtre: FiltreDecont;
  /** Coletele paginii curente. */
  colete: Colet[];
  /** Totalul filtrului curent, pe toate paginile. */
  rezumat: Rezumat;
  /** Curierii care au decontari, cu cautarea si perioada aplicate, fara filtrul de curier. */
  curieri: CurierDecont[];
  /** Tot magazinul, fara niciun filtru: pentru faptul din capul paginii. */
  magazin: { colete: number; ultimaVirare: string | null };
  /** O parte din lista nu s-a putut citi: totalul de pe ecran poate fi mai mic decat cel adevarat. */
  citireCazuta: boolean;
}

export function ListaDecontari({ filtre, colete, rezumat, curieri, magazin, citireCazuta }: DateDecontari) {
  const nav = useNavigare(filtre, adresaFiltrelor);
  const { inAsteptare, mergiLa } = nav;
  const toate = curieri.reduce((s, c) => s + c.numar, 0);

  return (
    <div className="p-6 text-[13px]">
      {/* Capul paginii: un fapt despre magazin, nu o lamurire despre ecran. */}
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Decontări</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {magazin.colete === 0 ? "Niciun colet decontat încă" : pluralRo(magazin.colete, "colet decontat", "colete decontate")}
        {magazin.ultimaVirare && <>, ultima virare pe <span className="font-medium text-foreground">{ziIntreaga(magazin.ultimaVirare)}</span></>}
      </p>

      {/* Filele au rost de la doi curieri in sus; cu unul singur ar spune de doua ori acelasi numar. */}
      {(curieri.length > 1 || filtre.curier !== "all") && (
        <FileSubliniate
          className="mt-5"
          eticheta="Curierul"
          activa={filtre.curier}
          laAlegere={(cheie) => mergiLa({ curier: cheie, page: 1 })}
          file={[
            { cheie: "all", eticheta: "Toți curierii", numar: toate },
            ...curieri.map((c) => ({ cheie: c.cheie, eticheta: c.nume, numar: c.numar })),
          ]}
        />
      )}

      <RandFiltre
        className="mt-4"
        nav={nav}
        locCautare="Caută AWB, destinatar, localitate"
        cuFiltre={areFiltre(filtre)}
        laGolire={() => mergiLa(FILTRE_GOALE)}
      />

      {/* ⚠ Un total fara numitor e o cifra in care omul are incredere fara sa stie ce cuprinde: cand nu e intreg, se spune. */}
      {citireCazuta && (
        <p role="alert" className="mt-3 rounded-lg border border-dashed border-destructive/40 px-3 py-2 text-xs text-foreground">
          O parte din decontări nu s-a putut citi acum, deci totalul de mai jos poate fi mai mic decât cel adevărat. Reîncarcă pagina.
        </p>
      )}
      {rezumat.inBaza > rezumat.colete && (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Se socotesc cele mai recente {rezumat.limita.toLocaleString("ro-RO")} de colete din {rezumat.inBaza.toLocaleString("ro-RO")}. Totalul le cuprinde doar pe acestea; alege o perioadă mai scurtă pentru o sumă întreagă.
        </p>
      )}

      <div className={cn("mt-3 transition-opacity", inAsteptare && "opacity-60")} aria-busy={inAsteptare}>
        {colete.length === 0 ? (
          magazin.colete === 0 ? (
            <StareGoala
              titlu="Nicio decontare încă"
              lamurire="Aici apar virările curierului, pe măsură ce încasează rambursul la livrare și îți trimite banii."
            />
          ) : (
            <StareGoala
              titlu={filtre.q ? `Nimic nu se potrivește cu „${filtre.q}”` : "Nicio decontare în filtrul ales"}
              laStergere={areFiltre(filtre) ? () => mergiLa(FILTRE_GOALE) : undefined}
            />
          )
        ) : (
          <>
            <div className="@container overflow-hidden rounded-xl bg-white ring-1 ring-black/10">
              <TotalFiltru rezumat={rezumat} />
              <CapColete />
              <ul className="divide-y divide-border/70">
                {colete.map((c) => <RandColet key={c.id} colet={c} />)}
              </ul>
            </div>
            {/* Pagina noua incepe de sus: ramas la capatul listei, omul ar vedea sfarsitul paginii urmatoare. */}
            <Paginare
              className="mt-4 px-1"
              ce={NUME_COLETE}
              pePagina={PE_PAGINA}
              pagina={filtre.page}
              total={rezumat.colete}
              laPagina={(p) => { mergiLa({ page: p }); window.scrollTo({ top: 0 }); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
