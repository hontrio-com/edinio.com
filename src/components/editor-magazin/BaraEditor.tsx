"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, History, Loader2, Monitor, MoreHorizontal, Paintbrush2, Redo2, RotateCw, Smartphone, Tablet, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Dispozitiv } from "@/components/store-editor/RamaPreview";
import { PAGINI_EDITOR, type CheiePagina, type PaginaProprieEditor } from "@/lib/editor-magazin/pagini";
import { cheiaPaginiiProprii } from "@/lib/storefront/design/preview-protocol";
import { cn } from "@/lib/utils/cn";
import type { CiornaDesign } from "./useCiornaDesign";

/**
 * Bara de sus a editorului unic.
 *
 * Aici stau lucrurile care privesc tot ecranul, nu un nod: ce pagina editezi, cum
 * o vezi, Anuleaza / Refa, Publica, si daca magazinul e deschis pentru clienti
 * (comutatorul „Publicare” din editorul vechi).
 *
 * Din 25.10.2026 editorul ocupa tot ecranul, fara bara laterala si bara de sus a
 * panoului (`CadruPanou`), deci tot de aici se iese: „Ieși” duce la panou, sau inapoi in „Pagini”
 * cand editorul s-a deschis de acolo (`iesireaEditorului`).
 */

const DISPOZITIVE = [
  ["mobil", Smartphone, "Telefon"],
  ["tableta", Tablet, "Tabletă"],
  ["desktop", Monitor, "Calculator"],
] as const;

export function BaraEditor({
  pagina, onPagina, ciorna, dispozitiv, onDispozitiv, onReincarca, adresaPublica,
  publicat, publicareInCurs, onComutaPublicarea, continutNesalvat, seIncarca = false, vedereMobil, onVedereMobil, ingust = false,
  paginiProprii = [], anulare, laIesire = "/dashboard", onIstoric,
}: {
  pagina: CheiePagina;
  onPagina: (p: CheiePagina) => void;
  ciorna: CiornaDesign;
  dispozitiv: Dispozitiv;
  onDispozitiv: (d: Dispozitiv) => void;
  onReincarca: () => void;
  adresaPublica: string;
  publicat: boolean;
  publicareInCurs: boolean;
  onComutaPublicarea: () => Promise<void>;
  /** Ceva care NU e inca in ciorna: o imagine care se urca, o pagina proprie nesalvata. */
  continutNesalvat: boolean;
  /**
   * O imagine se urca. „Publică” asteapta: imaginea ar fi ajuns in ciorna DUPA publicare, deci nu in
   * magazin, desi omul o alesese inainte sa apese.
   */
  seIncarca?: boolean;
  vedereMobil: "panou" | "previzualizare";
  onVedereMobil: (v: "panou" | "previzualizare") => void;
  /** Ecran sub 768 px: lista paginilor arata numele scurte. */
  ingust?: boolean;
  /** Paginile proprii ale magazinului (etapa 5), in „Editezi”, sub cele fixe. */
  paginiProprii?: PaginaProprieEditor[];
  /** Anuleaza / Refa altceva decat designul: pagina proprie deschisa, cand ea e cea editata. */
  anulare?: { poateAnula: boolean; poateReface: boolean; anuleaza: () => void; reface: () => void };
  /** Unde duce „Ieși”. */
  laIesire?: string;
  /** Deschide istoricul publicarilor (etapa 7). */
  onIstoric: () => void;
}) {
  const ist = anulare ?? ciorna;
  const [confirma, setConfirma] = useState(false);
  const router = useRouter();
  /** „intreaba” = fereastra de iesire deschisa; „pleaca” = ciorna se trimite, apoi se iese. */
  const [iesire, setIesire] = useState<"intreaba" | "pleaca" | null>(null);

  async function pleaca(cuPublicare = false) {
    setIesire("pleaca");
    /* Ciorna de design se salveaza singura, dar la o secunda dupa ultima modificare: aici pleaca
       pe loc si se asteapta. Altfel ultima modificare dinaintea iesirii nu mai ajungea in baza. */
    const ok = cuPublicare ? await ciorna.publica() : await ciorna.salveazaAcum();
    if (!ok) {
      setIesire(null);
      return;
    }
    router.push(laIesire);
  }

  function iesi() {
    if (continutNesalvat || ciorna.areModificari) setIesire("intreaba");
    else void pleaca();
  }

  const stare = seIncarca
    ? "Se încarcă o imagine..."
    : ciorna.salvez
      ? "Se salvează ciorna..."
      : ciorna.areModificari ? "Modificări nepublicate" : "Totul e publicat";

  return (
    <div className="h-14 shrink-0 border-b border-border bg-surface px-3 flex items-center gap-2">
      <button type="button" onClick={iesi} disabled={iesire === "pleaca"} title="Ieși din editor, înapoi în panou" aria-label="Ieși din editor"
        className="h-9 shrink-0 px-2.5 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-60 transition-colors">
        {iesire === "pleaca" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
        <span className="hidden sm:inline">Ieși</span>
      </button>

      {/*
        Pe telefon lista ia locul ramas: cu latime fixa, trecea peste Anuleaza. De la 640 px are
        latimea ei, dar se strange ea cand bara nu mai are loc: un titlu lung de pagina proprie
        impingea altfel „Publică” afara din ecran.
      */}
      <label className="flex-1 sm:flex-initial flex items-center gap-2 min-w-0">
        <span className="hidden xl:inline text-xs text-muted-foreground">Editezi</span>
        <select value={pagina} onChange={(e) => onPagina(e.target.value as CheiePagina)} aria-label="Pagina pe care o editezi"
          className="h-9 w-full sm:w-auto min-w-0 pl-3 pr-8 rounded-lg border border-border bg-surface text-sm font-medium text-foreground focus:outline-none focus:border-primary">
          {PAGINI_EDITOR.map((p) => <option key={p.cheie} value={p.cheie}>{ingust ? p.scurt : p.eticheta}</option>)}
          {paginiProprii.length > 0 && (
            <optgroup label="Paginile tale">
              {paginiProprii.map((p) => (
                <option key={p.id} value={cheiaPaginiiProprii(p.id)}>{p.publicata ? p.titlu : `${p.titlu} (ciornă)`}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <div className="hidden sm:flex items-center">
        <button type="button" onClick={ist.anuleaza} disabled={!ist.poateAnula} title="Anulează (Ctrl+Z)" aria-label="Anulează"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors">
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={ist.reface} disabled={!ist.poateReface} title="Refă (Ctrl+Y)" aria-label="Refă"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors">
          <Redo2 className="h-4 w-4" />
        </button>
        {/* Langa Anuleaza: tot un drum inapoi, dar peste publicari, nu peste pasii de acum (etapa 7). */}
        <button type="button" onClick={onIstoric} title="Istoricul publicărilor: readu o versiune de dinainte" aria-label="Istoricul publicărilor"
          className="hidden lg:inline-flex h-9 px-2.5 rounded-lg items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <History className="h-4 w-4" />
          <span className="hidden xl:inline">Istoric</span>
        </button>
      </div>

      <div className="hidden md:flex bg-muted rounded-lg p-0.5 gap-0.5">
        {DISPOZITIVE.map(([d, Icon, eticheta]) => (
          <button key={d} type="button" onClick={() => onDispozitiv(d)} aria-label={eticheta} title={eticheta} aria-pressed={dispozitiv === d}
            className={cn("h-8 w-9 rounded-md flex items-center justify-center transition-colors",
              dispozitiv === d ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <button type="button" onClick={onReincarca} title="Reîncarcă previzualizarea" aria-label="Reîncarcă previzualizarea"
        className="hidden lg:flex w-9 h-9 shrink-0 rounded-lg items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <RotateCw className="h-4 w-4" />
      </button>
      <a href={adresaPublica} target="_blank" rel="noopener noreferrer" title="Deschide magazinul într-o filă nouă" aria-label="Deschide magazinul într-o filă nouă"
        className="hidden lg:flex w-9 h-9 shrink-0 rounded-lg items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <ExternalLink className="h-4 w-4" />
      </a>

      {/*
        Butoanele din dreapta nu se strang: cu `min-w-0`, grupul se strangea sub latimea lor, iar
        „Publică” iesea din ecran intre 640 si 990 px (de tot pe 800, verificarea din 28.10).
      */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {/*
          Pe telefon panoul si previzualizarea nu incap una langa alta. Sub 420 px butonul ramane
          doar cu pictograma: cu „Ieși” in bara (4.7), lista paginilor ajunsese sa arate doar „Pa”.
        */}
        <button type="button" onClick={() => onVedereMobil(vedereMobil === "panou" ? "previzualizare" : "panou")}
          aria-label={vedereMobil === "panou" ? "Vezi previzualizarea" : "Înapoi la editare"}
          title={vedereMobil === "panou" ? "Vezi previzualizarea" : "Înapoi la editare"}
          className="lg:hidden h-9 shrink-0 px-2.5 min-[420px]:px-3 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1.5">
          {vedereMobil === "panou" ? <Smartphone className="h-3.5 w-3.5" /> : <Paintbrush2 className="h-3.5 w-3.5" />}
          <span className="hidden min-[420px]:inline">{vedereMobil === "panou" ? "Vezi" : "Editează"}</span>
        </button>

        <div className="hidden lg:block min-w-0 text-right">
          <p className="text-[11px] text-muted-foreground truncate">{stare}</p>
          {continutNesalvat && !seIncarca && <p className="text-[11px] text-amber-600 truncate">Conținut nesalvat</p>}
        </div>

        <button type="button" onClick={() => setConfirma(true)} disabled={publicareInCurs}
          title={publicat ? "Magazinul e vizibil pentru clienți" : "Magazinul e ascuns pentru clienți"}
          className="hidden lg:inline-flex h-9 px-3 rounded-lg border border-border text-xs font-medium items-center gap-1.5 hover:bg-muted transition-colors">
          <span className={cn("w-2 h-2 rounded-full", publicat ? "bg-primary" : "bg-muted-foreground/50")} />
          {publicat ? "Vizibil" : "Ascuns"}
        </button>

        {ciorna.areModificari && (
          <button type="button" onClick={() => void ciorna.renunta()} disabled={ciorna.blocata}
            className="hidden lg:inline-flex h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors items-center">
            Renunță
          </button>
        )}
        {/*
          Pe telefon si pe tableta (sub 1024 px) nu incape tot in bara: Anuleaza / Refa,
          istoricul, Renunta, vizibilitatea magazinului si previzualizarea stau intr-un meniu.
          Fara el, de pe telefon n-ar fi existat niciun drum catre ele (in editorul vechi,
          „Publicare” era un panou), iar cu ele in bara, „Publica” iesea taiat din ecran pe
          390 px si intre 640 si 990 px. Starea („Modificări nepublicate”) apare tot de la 1024 px.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Mai multe" className="lg:hidden w-9 h-9 shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-60 p-1.5">
            <DropdownMenuItem className="rounded-lg p-2.5" disabled={!ist.poateAnula} onClick={ist.anuleaza}>
              <Undo2 className="h-4 w-4" /> Anulează
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg p-2.5" disabled={!ist.poateReface} onClick={ist.reface}>
              <Redo2 className="h-4 w-4" /> Refă
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg p-2.5" onClick={onIstoric}>
              <History className="h-4 w-4" /> Istoricul publicărilor
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg p-2.5" onClick={() => setConfirma(true)}>
              <span className={cn("w-2 h-2 rounded-full", publicat ? "bg-primary" : "bg-muted-foreground/50")} />
              {publicat ? "Magazin vizibil: ascunde-l" : "Magazin ascuns: fă-l vizibil"}
            </DropdownMenuItem>
            {ciorna.areModificari && (
              <DropdownMenuItem className="rounded-lg p-2.5" disabled={ciorna.blocata} onClick={() => void ciorna.renunta()}>Renunță la modificările nepublicate</DropdownMenuItem>
            )}
            <DropdownMenuItem className="rounded-lg p-2.5" onClick={onReincarca}><RotateCw className="h-4 w-4" /> Reîncarcă previzualizarea</DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg p-2.5" render={<a href={adresaPublica} target="_blank" rel="noopener noreferrer" />}>
              <ExternalLink className="h-4 w-4" /> Deschide magazinul
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" onClick={() => void ciorna.publica()} disabled={!ciorna.areModificari || ciorna.blocata || seIncarca}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5">
          {ciorna.publicaInCurs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Publică
        </button>
      </div>

      <Dialog open={confirma} onOpenChange={setConfirma}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{publicat ? "Ascunzi magazinul?" : "Faci magazinul vizibil?"}</DialogTitle>
            <DialogDescription>
              {publicat
                ? "Clienții nu-l vor mai putea deschide și nu vor mai putea comanda până îl faci din nou vizibil. Comenzile primite rămân."
                : "Clienții îl vor putea deschide și vor putea comanda."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirma(false)}>Nu</Button>
            <Button variant={publicat ? "destructive" : "default"} disabled={publicareInCurs}
              onClick={async () => { await onComutaPublicarea(); setConfirma(false); }}>
              {publicat ? "Da, ascunde magazinul" : "Da, fă-l vizibil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Iesirea cu ceva neterminat: ce nu e inca in ciorna se pierde, restul ramane in ciorna. */}
      <Dialog open={iesire === "intreaba"} onOpenChange={(deschis) => { if (!deschis) setIesire(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{continutNesalvat ? "Ieși fără să salvezi conținutul?" : "Ieși fără să publici?"}</DialogTitle>
            <DialogDescription>
              {continutNesalvat
                ? `Ai conținut nesalvat: dacă ieși acum, se pierde.${ciorna.areModificari ? " Celelalte modificări rămân în ciornă." : ""}`
                : "Modificările rămân în ciornă și le regăsești aici data viitoare. Clienții văd magazinul ca până acum."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIesire(null)}>Rămân</Button>
            {continutNesalvat ? (
              <Button variant="destructive" onClick={() => void pleaca()}>Ieși fără să salvez</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void pleaca()}>Ieși</Button>
                <Button disabled={ciorna.blocata} onClick={() => void pleaca(true)}>Publică și ieși</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
