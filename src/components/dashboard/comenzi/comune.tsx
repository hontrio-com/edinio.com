"use client";

/*
  Piesele mari, comune tuturor asezarilor listei de Comenzi: deschiderea comenzii la clic pe
  rand, filtrul de sursa, antetul cu ridicarile de curier, exportul si alegerea asezarii, bara
  de actiuni pe mai multe comenzi, cardul de comanda si cele doua zone ale lui: expedierea si
  factura.

  ⚠ Nimic de aici nu scrie in baza. Fiecare buton cere, prin `useActiuni`, lui `OrdersClient`,
  care tine ferestrele curierilor, manerele de factura si lotul. Doua lucruri se intreaba intai
  (`useConfirmare`): emiterea unei facturi dintr-un buton doar cu sigla (e un document fiscal,
  iar butonul nu are text pe el) si schimbarea starii dintr-un meniu (clientul e anuntat, iar
  „Anulată" si „Rambursată" misca stocul, cuponul si pot emite un document).
*/

import { createContext, memo, useCallback, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronDown, Download, FileCheck2, FileText, FileX2, LayoutList, ListChecks, Loader2, MoreHorizontal, Printer, Store,
  Truck, Upload, X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adresaDetaliuluiComenzii } from "@/lib/orders/pagination";
import type { CurierPropriu } from "@/lib/orders/awb-propriu";
import { siglaCurierului, type CasaFacturare } from "@/lib/integrari/parteneri";
import type { Sigla } from "@/lib/integrari/sigle";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import {
  ATINGERE, BUTON_CONTUR, BUTON_PERICOL_PLIN, BUTON_PLIN, ButonSigla, INEL, PunctStare, type MarimeSigla,
} from "@/components/dashboard/atomi-panou";
import { BUTON_FILTRU, MeniuLaCerere, type Navigare } from "@/components/dashboard/liste/navigare";
import { dataScurta, SiglaMica, TeancPoze } from "@/components/dashboard/liste/piese";
import { useActiuni, useLot } from "./actiuni";
import { STARI_COMANDA, type ComandaLista, type SursaFiltru } from "./date";
import { ASEZARI, coadaFiltrelor, type FiltreComenzi } from "./filtre";
import { Sursa, StareText, Total } from "./piese";
import { expediere, rezumatLivrare, rezumatPlata, rezumatProduse, stareaAwb } from "./rezumate";

export type NavigareComenzi = Navigare<FiltreComenzi>;

/* ── Deschiderea comenzii la clic pe rand sau pe card ─────────────────────── */

interface Lista {
  /** Adresa paginii comenzii, care tine minte filtrele listei pentru butonul „Inapoi". */
  adresa: (id: string) => string;
  /** De pus pe `onClick` si pe `onAuxClick` ale randului sau cardului. */
  deschide: (e: React.MouseEvent, id: string) => void;
  /** Merge in pagina comenzii. */
  mergiLaComanda: (id: string) => void;
}

const ContextLista = createContext<Lista | null>(null);

/** Tot ce are deja rostul lui la clic: nu deschide comanda. */
const CU_ROSTUL_LUI = "a, button, input, select, textarea, label, [role='menu'], [role='menuitem'], [role='dialog'], [role='listbox']";

/**
 * Comanda se deschide la clic oriunde pe randul ei, si in spatiul alb (cerut de proprietar,
 * 24.11.2026). Nu si cand clicul a cazut pe un buton, pe o bifa sau intr-un meniu, nici cand
 * omul tocmai a selectat un text cu mausul ca sa-l copieze. Cu Ctrl, cu Cmd sau cu rotita,
 * comanda se deschide in fila noua, ca orice legatura.
 */
export function ListaProvider({ filtre, children }: { filtre: FiltreComenzi; children: React.ReactNode }) {
  const router = useRouter();
  const qs = useMemo(() => coadaFiltrelor(filtre), [filtre]);
  const lista = useMemo<Lista>(() => {
    const adresa = (id: string) => adresaDetaliuluiComenzii(id, qs);
    return {
      adresa,
      mergiLaComanda: (id) => router.push(adresa(id)),
      deschide(e, id) {
        if (e.defaultPrevented) return;
        if (e.type === "auxclick" && e.button !== 1) return;
        if ((e.target as HTMLElement).closest(CU_ROSTUL_LUI)) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey || e.button === 1) window.open(adresa(id), "_blank", "noopener");
        else router.push(adresa(id));
      },
    };
  }, [qs, router]);
  return <ContextLista.Provider value={lista}>{children}</ContextLista.Provider>;
}

export function useLista(): Lista {
  const lista = useContext(ContextLista);
  if (!lista) throw new Error("useLista se foloseste sub <ListaProvider>.");
  return lista;
}

/** Numarul comenzii, ca legatura adevarata: drumul de la tastatura catre pagina ei. */
export function NumarComanda({ comanda, className }: { comanda: ComandaLista; className?: string }) {
  const { adresa } = useLista();
  return (
    <Link href={adresa(comanda.id)} prefetch={false} className={cn("rounded-sm font-semibold tabular-nums text-foreground hover:underline", INEL, className)}>
      {comanda.numar}
    </Link>
  );
}

/**
 * Contul din care s-a plasat comanda, ca legatura catre fisa lui. Un client cu cont poate
 * comanda pentru mai multe persoane: numele de pe comanda e al destinatarului, iar contul e
 * singurul lucru care le leaga (cerut de un magazin, 23.11.2026).
 */
export function ContClient({ comanda: c, className }: { comanda: ComandaLista; className?: string }) {
  if (!c.cont) return null;
  return (
    <Link
      href={`/dashboard/customers/conturi/${c.cont.id}`}
      prefetch={false}
      title={c.cont.indiciu}
      className={cn("block max-w-full truncate rounded-sm text-xs text-foreground underline-offset-2 hover:underline", INEL, className)}
    >
      <span className="text-muted-foreground">Cont:</span> {c.cont.nume}
    </Link>
  );
}

/* ── Confirmarea, pentru ce nu se face dintr-o singura apasare ────────────── */

interface Intrebare {
  titlu: string;
  text: string;
  /** Ce scrie pe butonul care face: verbul, nu „Da". */
  buton: string;
  /** Butonul e rosu: actiunea strica ceva greu de pus la loc. */
  pericol?: boolean;
  fa: () => void;
}

const ContextConfirmare = createContext<((i: Intrebare) => void) | null>(null);

/** Tine fereastra de confirmare a listei. O singura fereastra, pentru toate piesele. */
export function FurnizorConfirmare({ children }: { children: React.ReactNode }) {
  const [intrebare, setIntrebare] = useState<Intrebare | null>(null);
  return (
    <ContextConfirmare.Provider value={setIntrebare}>
      {children}
      <Dialog open={intrebare !== null} onOpenChange={(deschis) => { if (!deschis) setIntrebare(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="leading-snug">{intrebare?.titlu}</DialogTitle>
            <DialogDescription>{intrebare?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setIntrebare(null)} className={BUTON_CONTUR}>Renunță</button>
            <button
              type="button"
              onClick={() => { const fa = intrebare?.fa; setIntrebare(null); fa?.(); }}
              className={intrebare?.pericol ? BUTON_PERICOL_PLIN : BUTON_PLIN}
            >
              {intrebare?.buton}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContextConfirmare.Provider>
  );
}

export function useConfirmare(): (i: Intrebare) => void {
  const cere = useContext(ContextConfirmare);
  if (!cere) throw new Error("useConfirmare se foloseste sub <FurnizorConfirmare>.");
  return cere;
}

/** Starile care misca mai mult decat o eticheta: stocul, cuponul si, dupa setari, un document. */
const STARI_CU_EFECTE = new Set(["cancelled", "refunded"]);

/** Intreaba, apoi muta comenzile date in starea aleasa. */
export function useSchimbareDeStare(): (comenzi: readonly { id: string; numar: string }[], stare: string) => void {
  const { schimbaStarea } = useActiuni();
  const cere = useConfirmare();
  return useCallback((comenzi, stare) => {
    const tinta = STARI_COMANDA.find((s) => s.cheie === stare);
    if (!tinta || comenzi.length === 0) return;
    const care = comenzi.length === 1 ? `comanda ${comenzi[0].numar}` : pluralRo(comenzi.length, "comandă", "comenzi");
    cere({
      titlu: `Treci ${care} în starea „${tinta.eticheta}”?`,
      text: STARI_CU_EFECTE.has(stare)
        ? "Stocul și cuponul se eliberează, iar după setările magazinului se poate emite și un document. Clientul este anunțat."
        : "Clientul este anunțat de schimbare, după setările de notificări ale magazinului.",
      buton: comenzi.length === 1 ? "Schimbă starea" : "Schimbă stările",
      pericol: STARI_CU_EFECTE.has(stare),
      fa: () => schimbaStarea(comenzi.map((c) => c.id), stare),
    });
  }, [cere, schimbaStarea]);
}

/* ── Filtrul de sursa ─────────────────────────────────────────────────────── */

export function FiltruSursa({ nav, surse, className }: { nav: NavigareComenzi; surse: SursaFiltru[]; className?: string }) {
  /* Un magazin fara marketplace are o singura sursa: filtrul n-ar avea ce alege. */
  if (surse.length === 0) return null;
  const aleasa = surse.find((s) => s.cheie === nav.filtre.source);
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger className={BUTON_FILTRU}>
          {/* Pe telefon butonul are o jumatate de rand: cu o sursa aleasa, numele ei spune singur ce e. */}
          <span className={cn("text-muted-foreground", aleasa && "hidden sm:inline")}>Sursă</span>
          <span className="truncate font-medium">{aleasa?.eticheta ?? "Toate"}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem onClick={() => nav.mergiLa({ source: "all", page: 1 })}>
            <span className="flex-1">Toate sursele</span>
            {nav.filtre.source === "all" && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {surse.map((s) => (
            <DropdownMenuItem key={s.cheie} onClick={() => nav.mergiLa({ source: s.cheie, page: 1 })}>
              <span className="grid w-12 flex-shrink-0 place-items-start">
                {s.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.logo} alt="" loading="lazy" decoding="async" className="h-3.5 w-auto max-w-[46px] object-contain" />
                  : <Store className="h-4 w-4 text-muted-foreground" />}
              </span>
              <span className="flex-1">{s.eticheta}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{s.numar.toLocaleString("ro-RO")}</span>
              {nav.filtre.source === s.cheie && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ── Antetul: aceleasi in toate asezarile ─────────────────────────────────── */

/**
 * Subtitlul paginii: cate comenzi sunt si cate asteapta. Un fapt despre magazin, nu o
 * lamurire despre cum se foloseste ecranul: un ecran bine facut nu are nevoie sa fie explicat
 * in subtitlu.
 */
export function SubtitluComenzi({ total, inAsteptare }: { total: number; inAsteptare: number }) {
  return (
    <p className="mt-0.5 text-sm text-muted-foreground">
      {pluralRo(total, "comandă", "comenzi")}
      {inAsteptare > 0 && <>, dintre care <span className="font-medium text-foreground">{inAsteptare}</span> așteaptă confirmarea</>}
    </p>
  );
}

const BUTON_ANTET = `inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 disabled:cursor-not-allowed disabled:opacity-50 lg:h-9 ${INEL}`;

/** Din ce asezare se vede lista. Alegerea ramane tinuta minte, si la urmatoarea intrare din meniu. */
export function ComutatorAsezare({ asezare }: { asezare: FiltreComenzi["asezare"] }) {
  const { alegeAsezarea } = useActiuni();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={BUTON_ANTET} aria-label="Alege așezarea listei">
        <LayoutList className="h-4 w-4" />
        Așezare
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Cum se vede lista</p>
        {ASEZARI.map((a) => (
          <div key={a.cheie}>
            {/* Tabelul de dinainte sta despartit: e plasa de siguranta, nu o a cincea asezare noua. */}
            {a.cheie === "clasic" && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => { if (a.cheie !== asezare) alegeAsezarea(a.cheie); }} className="items-start">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{a.nume}</span>
                <span className="block text-xs text-muted-foreground">{a.peScurt}</span>
              </span>
              {a.cheie === asezare && <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Dreapta antetului: ridicarile de curier ca butoane-sigla, alegerea asezarii si exportul.
 * Pe telefon stau una sub alta si umplu latimea: un buton ingust cu jumatate de rand gol
 * langa el arata uitat acolo (proprietarul, 24.11.2026).
 */
export function ActiuniAntet({ asezare, areComenzi }: { asezare: FiltreComenzi["asezare"]; areComenzi: boolean }) {
  const { cuRidicare, cheamaCurierul, exporta, exportInLucru } = useActiuni();
  const sigle = cuRidicare.map((cheie) => ({ cheie, sigla: siglaCurierului(cheie) })).filter((x): x is { cheie: CurierPropriu; sigla: Sigla } => x.sigla !== null);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {sigle.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl bg-muted/60 py-1 pl-3 pr-1">
          <span className="mr-auto whitespace-nowrap text-xs font-medium text-muted-foreground sm:mr-0">Cheamă curierul</span>
          {/* Pe telefon siglele isi impart locul ramas, ca randul sa incapa pe orice latime; de la `sm` isi iau marimea lor. */}
          {sigle.map(({ cheie, sigla }) => (
            <ButonSigla
              key={cheie}
              sigla={sigla}
              eticheta={`Cheamă curierul ${sigla.nume}`}
              marime="mic"
              className="w-auto min-w-0 max-w-[96px] flex-1 sm:w-[68px] sm:max-w-none sm:flex-none"
              onClick={() => cheamaCurierul(cheie)}
            />
          ))}
        </div>
      )}
      {/* Pe telefon cele doua butoane impart un rand, jumatate fiecare: umplu latimea fara sa ia doua randuri din ecran. */}
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <ComutatorAsezare asezare={asezare} />
        {/* Fara nicio comanda in filtru n-are ce exporta: butonul ar raspunde doar cu o eroare. */}
        <button type="button" onClick={exporta} disabled={exportInLucru || !areComenzi} title="Descarcă .xlsx cu comenzile din filtrul de pe ecran" className={BUTON_ANTET}>
          {exportInLucru ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
        </button>
      </div>
    </div>
  );
}

/* ── Actiunile pe mai multe comenzi ───────────────────────────────────────── */

/** Pe bara neagra inelul de focalizare e deschis la culoare, altfel nu s-ar vedea. */
const INEL_PE_NEGRU = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/80";

/** Cum arata o actiune pe bara lata si pe cea de telefon. */
const ACTIUNE_LATA = `whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium text-background/90 transition hover:bg-background/15 hover:text-background disabled:cursor-not-allowed disabled:opacity-50 ${INEL_PE_NEGRU}`;
const ACTIUNE_TELEFON = `flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium leading-none text-background/90 active:bg-background/15 disabled:opacity-50 ${INEL_PE_NEGRU}`;

/** Butonul unei actiuni de lot: text pe bara lata, pictograma si cuvant pe telefon. */
function Actiune({ lat, eticheta, scurt, Icon }: { lat: boolean; eticheta: string; scurt: string; Icon: typeof Truck }) {
  return lat ? <>{eticheta}</> : <><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{scurt}</>;
}

/**
 * Cele cinci actiuni ale lotului. Fiecare care are ceva de ales isi deschide meniul: in ce
 * stare, la ce casa de facturare, cu ce curier, in ce format.
 *
 * ⚠ Facturile si AWB-urile cer confirmarea in `OrdersClient`, cu tot ce costa spus pe fata
 * (documente fiscale reale; expedieri platite, la Packeta si DHL fara anulare).
 */
function ActiunileLotului({ lat, comenzi }: { lat: boolean; comenzi: readonly ComandaLista[] }) {
  const { lot, selectie } = useLot();
  const schimba = useSchimbareDeStare();
  const clasa = lat ? ACTIUNE_LATA : ACTIUNE_TELEFON;
  const alese = comenzi.filter((c) => selectie.alese.has(c.id));
  /* Meniurile se deschid in sus: bara sta lipita de marginea de jos a ecranului. */
  const meniu = { side: "top" as const, align: "center" as const, sideOffset: 8 };
  const cuFacturi = lot.case_.length > 0 || !!lot.saga;
  const cuAwb = lot.curieri.length > 0 || !!lot.woot;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger disabled={lot.ocupat} aria-label="Schimbă starea comenzilor alese" className={clasa}>
          <Actiune lat={lat} eticheta="Schimbă starea" scurt="Stare" Icon={ListChecks} />
        </DropdownMenuTrigger>
        <DropdownMenuContent {...meniu} className="w-52">
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Mută comenzile alese în</p>
          {STARI_COMANDA.map((s) => (
            <DropdownMenuItem key={s.cheie} onClick={() => schimba(alese, s.cheie)}>
              <PunctStare ton={s.ton} /> {s.eticheta}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {cuFacturi && (
        <DropdownMenu>
          <DropdownMenuTrigger disabled={lot.ocupat} aria-label="Emite facturi pentru comenzile alese" className={clasa}>
            <Actiune lat={lat} eticheta="Emite facturi" scurt="Facturi" Icon={FileText} />
          </DropdownMenuTrigger>
          <DropdownMenuContent {...meniu} className="w-64">
            {lot.case_.length > 0 && <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Emite facturile la</p>}
            {/* Cu o singura casa nu e nimic de ales: „automat" e chiar ea. */}
            {lot.case_.length === 1 && <DropdownMenuItem onClick={() => lot.facturi("auto")}>{lot.case_[0].label}</DropdownMenuItem>}
            {lot.case_.length > 1 && (
              <>
                <DropdownMenuItem onClick={() => lot.facturi("auto")}>
                  <span className="min-w-0 flex-1">
                    <span className="block">Automat</span>
                    <span className="block text-xs text-muted-foreground">Casa la care emite magazinul de obicei</span>
                  </span>
                </DropdownMenuItem>
                {lot.case_.map((p) => <DropdownMenuItem key={p.key} onClick={() => lot.facturi(p.key)}>{p.label}</DropdownMenuItem>)}
              </>
            )}
            {lot.saga && (
              <>
                {lot.case_.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={lot.saga}><Upload className="h-4 w-4" /> Trimite documentele în SAGA</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {cuAwb && (
        <DropdownMenu>
          <DropdownMenuTrigger disabled={lot.ocupat} aria-label="Generează AWB-uri pentru comenzile alese" className={clasa}>
            <Actiune lat={lat} eticheta="Generează AWB-uri" scurt="AWB-uri" Icon={Truck} />
          </DropdownMenuTrigger>
          <DropdownMenuContent {...meniu} className="max-h-[60vh] w-64">
            {lot.curieri.length > 0 && <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Emite AWB-urile cu</p>}
            {lot.curieri.length === 1 && <DropdownMenuItem onClick={() => lot.awburi("auto")}>{lot.curieri[0].label}</DropdownMenuItem>}
            {lot.curieri.length > 1 && (
              <>
                <DropdownMenuItem onClick={() => lot.awburi("auto")}>
                  <span className="min-w-0 flex-1">
                    <span className="block">Curierul ales de client</span>
                    <span className="block text-xs text-muted-foreground">Fiecare comandă, cu curierul ei de la checkout</span>
                  </span>
                </DropdownMenuItem>
                {lot.curieri.map((c) => <DropdownMenuItem key={c.key} onClick={() => lot.awburi(c.key)}>{c.label}</DropdownMenuItem>)}
              </>
            )}
            {lot.woot && (
              <>
                {lot.curieri.length > 0 && <DropdownMenuSeparator />}
                {/* Woot cere o cotatie inainte de emitere, deci are fereastra lui, nu intra in lotul obisnuit. */}
                <DropdownMenuItem onClick={lot.woot}>AWB-uri Woot, cu alegerea serviciului</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger disabled={lot.eticheteInLucru} aria-label="Etichetele comenzilor alese" className={clasa}>
          {lot.eticheteInLucru && lat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Actiune lat={lat} eticheta="Printează etichetele" scurt="Etichete" Icon={Printer} />}
        </DropdownMenuTrigger>
        <DropdownMenuContent {...meniu} className="w-60">
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Etichetele AWB-urilor emise</p>
          <DropdownMenuItem onClick={() => lot.etichete("printeaza", "A4")}><Printer className="h-4 w-4" /> Printează, pe A4</DropdownMenuItem>
          <DropdownMenuItem onClick={() => lot.etichete("printeaza", "A6")}><Printer className="h-4 w-4" /> Printează, etichetă mică</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => lot.etichete("descarca", "A4")}><Download className="h-4 w-4" /> Descarcă, pe A4</DropdownMenuItem>
          <DropdownMenuItem onClick={() => lot.etichete("descarca", "A6")}><Download className="h-4 w-4" /> Descarcă, etichetă mică</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" onClick={lot.exporta} aria-label="Exportă comenzile alese" title="Descarcă .xlsx cu comenzile alese" className={clasa}>
        <Actiune lat={lat} eticheta="Export" scurt="Export" Icon={Download} />
      </button>
    </>
  );
}

/**
 * Bara care apare cand e bifata macar o comanda.
 *
 * Pe ecran lat pluteste jos, in mijlocul paginii. Pe telefon aceeasi forma iesea din ecran in
 * amandoua partile, isi rupea textele pe doua randuri si lasa sa se vada o fasie din bara de
 * navigare de dedesubt (proprietarul, 24.11.2026). Acolo ia LOCUL barei de navigare: lata cat
 * ecranul, lipita de marginea de jos, cu cinci actiuni sub forma de pictograma si cuvant,
 * exact cat incap pe un telefon. Cat alegi comenzi nu navighezi, deci nu se pierde nimic.
 *
 * @param comenzi Comenzile de pe ecran: selectia e intotdeauna a lor, niciodata a unor comenzi care nu se vad.
 * @param cuToate Arata „Toate N" pe telefon (asezarile in care bifa fiecarui grup face deja asta nu o cer).
 */
export function BaraSelectie({ comenzi, cuToate = true }: { comenzi: readonly ComandaLista[]; cuToate?: boolean }) {
  const { selectie, lot } = useLot();
  const cate = comenzi.filter((c) => selectie.alese.has(c.id)).length;
  if (cate === 0) return null;
  const alese = pluralRo(cate, "comandă aleasă", "comenzi alese");
  return (
    <>
      {/* Ecran lat: bara plutitoare. */}
      <div role="region" aria-label="Acțiuni pentru comenzile alese" className="fixed bottom-6 left-[calc(50%+var(--sidebar-width,0px)/2)] z-40 hidden -translate-x-1/2 items-center gap-1 rounded-xl bg-foreground py-1.5 pl-4 pr-1.5 text-[13px] text-background shadow-2xl lg:flex">
        <span className="mr-2 flex items-center gap-2 whitespace-nowrap font-medium tabular-nums">
          {lot.ocupat && <Loader2 className="h-4 w-4 animate-spin" aria-label="Se lucrează" />}
          {alese}
        </span>
        <ActiunileLotului lat comenzi={comenzi} />
        <button type="button" onClick={selectie.goleste} aria-label="Renunță la selecție" className={cn("ml-1 grid h-8 w-8 place-items-center rounded-lg text-background/70 transition hover:bg-background/15 hover:text-background", INEL_PE_NEGRU)}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Telefon si tableta: in locul barei de navigare. */}
      <div
        role="region"
        aria-label="Acțiuni pentru comenzile alese"
        className="fixed inset-x-0 bottom-0 z-40 bg-foreground text-background lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-1 pl-4 pr-1.5 pt-1.5">
          <p className="mr-auto flex items-center gap-2 text-[13px] font-semibold tabular-nums">
            {lot.ocupat && <Loader2 className="h-4 w-4 animate-spin" aria-label="Se lucrează" />}
            {alese}
          </p>
          {cuToate && cate < comenzi.length && (
            <button type="button" onClick={() => selectie.pune(comenzi.map((c) => c.id), true)} className={cn("h-8 rounded-lg px-2.5 text-xs font-medium text-background/80 active:bg-background/15", ATINGERE, INEL_PE_NEGRU)}>
              Toate {comenzi.length}
            </button>
          )}
          <button type="button" onClick={selectie.goleste} className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-background/80 active:bg-background/15", ATINGERE, INEL_PE_NEGRU)}>
            Renunță <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Coloane egale, cate actiuni are magazinul: fara casa de facturare sau fara curier raman trei. */}
        <div className="grid auto-cols-fr grid-flow-col px-1 pb-1.5">
          <ActiunileLotului lat={false} comenzi={comenzi} />
        </div>
      </div>
    </>
  );
}

/**
 * Ce a iesit din ultimul lot, la vedere deasupra listei: cate au reusit, de ce au fost sarite
 * sau au esuat celelalte, si ce etichete n-au intrat in document.
 *
 * ⚠ Nu doar intr-un mesaj care trece. Un lot de 50 din care 7 au fost sarite lasa in urma
 * intrebarea „care sapte, si mai am ceva de facut cu ele?", iar raspunsul trebuie sa stea pe ecran.
 */
export function RezultatLot({ className }: { className?: string }) {
  const { lot } = useLot();
  const r = lot.rezultat?.result;
  if (!r && lot.eticheteSarite.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {lot.eticheteSarite.length > 0 && (
        <div role="status" className="rounded-xl bg-white p-3 text-xs ring-1 ring-black/10">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-foreground">Etichete care nu au intrat în document: {lot.eticheteSarite.length + lot.eticheteInPlus}</p>
            <button type="button" onClick={lot.inchideEtichetele} aria-label="Închide lista etichetelor sărite" className={cn("grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground", INEL, ATINGERE)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {lot.eticheteSarite.map((x) => (
              <li key={x.comanda}><span className="font-medium text-foreground">{x.comanda}</span>: {x.motiv}</li>
            ))}
            {/* Se SPUNE ca lista e taiata: altfel numarul de sus si randurile de jos s-ar contrazice. */}
            {lot.eticheteInPlus > 0 && <li>și încă {pluralRo(lot.eticheteInPlus, "comandă", "comenzi")}. Descarcă-le pe rând, din listă.</li>}
          </ul>
        </div>
      )}
      {r && lot.rezultat && (
        <div role="status" className="rounded-xl bg-white p-3 text-xs ring-1 ring-black/10">
          <div className="flex items-start justify-between gap-3">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{lot.rezultat.title}:</span>{" "}
              {pluralRo(r.done, "reușită", "reușite")}
              {r.skipped > 0 && <>, {pluralRo(r.skipped, "sărită", "sărite")}</>}
              {r.failed > 0 && <>, <span className="font-medium text-destructive">{pluralRo(r.failed, "eșuată", "eșuate")}</span></>}
            </p>
            <button type="button" onClick={lot.inchideRezultatul} aria-label="Închide rezultatul lotului" className={cn("grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground", INEL, ATINGERE)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {r.errors.length > 0 && (
            <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-destructive">
              {r.errors.slice(0, 20).map((er, i) => (
                <li key={i}><span className="font-mono font-medium">{er.order}</span>: {er.message}</li>
              ))}
              {/* Taierea se spune: restul pot avea ALT motiv decat cele de mai sus. */}
              {r.errors.length > 20 && (
                <li className="font-medium">și încă {pluralRo(r.errors.length - 20, "motiv nearătat", "motive nearătate")} (pot fi altele decât cele de mai sus)</li>
              )}
            </ul>
          )}
          {/* „Sărite" se desface pe motive: fiecare isi spune numarul, iar cel care CERE o miscare e scris apasat. */}
          {r.motiveSarite && r.skipped > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {r.motiveSarite.dejaAreAwb > 0 && <li>{r.motiveSarite.dejaAreAwb} aveau deja AWB la acest curier. Nimic de făcut.</li>}
              {r.motiveSarite.duseDeMarketplace > 0 && <li>{r.motiveSarite.duseDeMarketplace} au transportul în fluxul marketplace-ului. Eticheta o face el.</li>}
              {r.motiveSarite.faraCurierPotrivit > 0 && (
                <li className="text-foreground">
                  <span className="font-medium">{r.motiveSarite.faraCurierPotrivit}</span> au un curier care nu intră în generarea în masă sau nu e conectat: acelea cer emitere individuală, din rândul comenzii. Numerele lor sunt în lista de mai sus.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Zona de expediere si zona de factura ─────────────────────────────────── */

/** Marimea butoanelor dintr-o zona: mica, medie, sau mica pe telefon si medie de la `sm`. */
export type MarimeZona = Extract<MarimeSigla, "mic" | "mediu" | "adaptiv">;

/** Ce face butonul unui curier, cu vorbele lui: Pall-Ex emite o partida, Packeta un colet. */
export function actiuneaCurierului(s: Sigla): string {
  if (s.cheie === "pallex") return `Creează partida ${s.nume}`;
  if (s.cheie === "packeta") return `Creează coletul ${s.nume}`;
  return `Creează AWB ${s.nume}`;
}

/**
 * Butonul alb cu sigla unui curier: deschide fereastra lui de emitere pentru comanda. Daca
 * poarta de AWB refuza comanda, butonul ramane la vedere, stins, iar apasarea spune de ce
 * (pe telefon nu exista indiciu la trecerea cu mausul).
 */
export function ButonCurier({ comanda, sigla, marime = "mediu", refuz, className }: {
  comanda: ComandaLista;
  sigla: Sigla;
  marime?: MarimeSigla;
  refuz?: string | null;
  className?: string;
}) {
  const { awb } = useActiuni();
  return (
    <ButonSigla
      sigla={sigla}
      eticheta={actiuneaCurierului(sigla)}
      marime={marime}
      refuz={refuz}
      className={className}
      onClick={(e) => { e.stopPropagation(); awb(comanda.id, sigla.cheie as CurierPropriu, true); }}
    />
  );
}

/** Meniul „⋯" al unei comenzi: ce se face cu ea in afara de AWB si factura. */
export function MeniuComanda({ comanda: c, className }: { comanda: ComandaLista; className?: string }) {
  const { eticheta, stareInLucru } = useActiuni();
  const { mergiLaComanda } = useLista();
  const schimba = useSchimbareDeStare();
  return (
    <MeniuLaCerere
      eticheta={`Acțiuni pentru comanda ${c.numar}`}
      clasaButon={cn("h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, className)}
      buton={<MoreHorizontal className="h-4 w-4" />}
      aliniere="end"
      clasaMeniu="w-52"
    >
      <DropdownMenuItem onClick={() => mergiLaComanda(c.id)}>Deschide comanda</DropdownMenuItem>
      <DropdownMenuSeparator />
      {c.sursa.cuFluxPropriu ? (
        /* Starea o tine marketplace-ul: schimbata de aici, ar fi stearsa la urmatoarea citire de la el. */
        <DropdownMenuItem disabled>Starea vine de la {c.sursa.eticheta}</DropdownMenuItem>
      ) : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={stareInLucru}>Schimbă starea</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {STARI_COMANDA.map((s) => (
              <DropdownMenuItem key={s.cheie} disabled={s.cheie === c.status.cheie} onClick={() => schimba([c], s.cheie)}>
                <PunctStare ton={s.ton} />
                <span className="flex-1">{s.eticheta}</span>
                {s.cheie === c.status.cheie && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {c.livrare.awb && !c.livrare.awb.inCurs && (
        <DropdownMenuItem onClick={() => eticheta(c.id)}><Printer className="h-4 w-4" /> Printează eticheta</DropdownMenuItem>
      )}
    </MeniuLaCerere>
  );
}

/** Ceilalti curieri conectati, intr-un meniu de sigle. */
function MeniuCurieri({ comanda, altii, refuz, singur, marime, titlu = "Creează AWB cu" }: {
  comanda: ComandaLista;
  altii: Sigla[];
  refuz: string | null;
  singur: boolean;
  marime: MarimeZona;
  titlu?: string;
}) {
  return (
    <MeniuLaCerere
      eticheta={singur ? "Alege curierul pentru AWB" : "Alege alt curier"}
      clasaButon={cn(
        "inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-white text-muted-foreground ring-1 ring-black/10 transition hover:text-foreground hover:ring-black/25",
        INEL,
        ATINGERE,
        marime === "mic" ? "h-8" : marime === "adaptiv" ? "h-8 sm:h-9" : "h-9",
        singur ? "px-2.5 text-xs font-medium text-foreground" : "w-6 justify-center",
      )}
      buton={<>{singur && <><Truck className="h-3.5 w-3.5" /> Curier</>}<ChevronDown className="h-3.5 w-3.5" /></>}
      clasaMeniu="w-[17rem]"
    >
      <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{titlu}</p>
      <div className="grid grid-cols-3 gap-1.5 p-1.5">
        {altii.map((s) => <ButonCurier key={s.cheie} comanda={comanda} sigla={s} marime="mic" refuz={refuz} className="w-full" />)}
      </div>
    </MeniuLaCerere>
  );
}

/**
 * Expedierea unei comenzi, intr-un singur loc: butonul alb cu sigla curierului ales de client
 * (ceilalti intr-un meniu), sau AWB-ul deja emis, sau felul in care pleaca fara AWB.
 */
export function ZonaExpediere({ comanda: c, marime = "mediu", asezare = "rand", stareImplicita, className }: {
  comanda: ComandaLista;
  marime?: MarimeZona;
  /**
   * Cum se asaza un AWB emis. „rand": sigla in stanga, numarul si starea in dreapta ei.
   * „coloana": numarul sus, pe toata latimea, sigla si starea dedesubt (pentru locuri inguste).
   */
  asezare?: "rand" | "coloana";
  /** Ce scrie langa numarul AWB cand curierul n-a spus inca nimic. */
  stareImplicita?: string;
  className?: string;
}) {
  const { awb } = useActiuni();
  const { mergiLaComanda } = useLista();
  const e = expediere(c);
  if (e.fel === "awb") {
    const stare = stareaAwb(e.awb, stareImplicita);
    /* Fereastra curierului arata AWB-ul emis: eticheta, urmarirea, anularea. */
    const deschide = () => awb(c.id, e.awb.curier.cheie as CurierPropriu, false);
    const numarul = e.awb.inCurs ? "Se emite…" : e.awb.numar;
    const indiciu = [e.awb.curier.nume, e.awb.numar, e.awb.partener, e.awb.stare].filter(Boolean).join(" · ");
    if (asezare === "coloana") {
      return (
        <button type="button" onClick={deschide} title={indiciu} className={cn("block w-full min-w-0 rounded-sm text-left", INEL, className)}>
          <span className={cn("block truncate text-xs text-foreground", !e.awb.inCurs && "font-mono")}>{numarul}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            <SiglaMica sigla={e.awb.curier} />
            {stare && <span className="truncate text-[11px] text-muted-foreground">{stare}</span>}
          </span>
        </button>
      );
    }
    return (
      /* Un <button> se intinde dupa continut: fara `max-w-full`, o stare lunga iesea din card. */
      <button type="button" onClick={deschide} title={indiciu} className={cn("flex min-w-0 max-w-full items-center gap-2 rounded-sm text-left", INEL, className)}>
        <SiglaMica sigla={e.awb.curier} />
        <span className="min-w-0">
          <span className={cn("block truncate text-xs text-foreground", !e.awb.inCurs && "font-mono")}>{numarul}</span>
          {stare && <span className="block truncate text-[11px] text-muted-foreground">{stare}</span>}
        </span>
      </button>
    );
  }
  if (e.fel === "text") {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        {e.cu === "magazin" ? <Store className="h-3.5 w-3.5 flex-shrink-0" /> : <Truck className="h-3.5 w-3.5 flex-shrink-0" />}{e.text}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {e.fel === "buton" && <ButonCurier comanda={c} sigla={e.sigla} refuz={e.refuz} marime={marime} />}
      {e.fel === "marketplace" && (
        /* Expedierea prin marketplace se face din pagina comenzii, unde sta panoul lui. */
        <ButonSigla
          sigla={e.sigla}
          eticheta={`Expediere prin ${e.sigla.nume}: deschide comanda`}
          marime={marime}
          onClick={(ev) => { ev.stopPropagation(); mergiLaComanda(c.id); }}
        />
      )}
      {e.altii.length > 0 && (
        <MeniuCurieri
          comanda={c}
          altii={e.altii}
          refuz={e.refuz}
          singur={e.fel === "alege"}
          marime={marime}
          titlu={e.fel === "marketplace" ? "Sau AWB cu un curier al tău" : "Creează AWB cu"}
        />
      )}
    </span>
  );
}

/** Intreaba, apoi emite factura comenzii la casa data. */
export function useEmitereFactura(): (c: ComandaLista, casa: Sigla) => void {
  const { emiteFactura } = useActiuni();
  const cere = useConfirmare();
  return useCallback((c, casa) => {
    cere({
      titlu: `Emiți factura pentru comanda ${c.numar}?`,
      text: `Se emite în ${casa.nume} un document fiscal real, pentru ${c.client.firma ?? c.client.nume}. O factură emisă nu se șterge, doar se stornează.`,
      buton: "Emite factura",
      fa: () => emiteFactura(c.id, casa.cheie as CasaFacturare),
    });
  }, [cere, emiteFactura]);
}

/** Factura unei comenzi: butonul alb cu sigla casei de facturare, sau documentul emis. */
export function ZonaFactura({ comanda: c, marime = "mediu", cuFel = false, faraCasa = null }: {
  comanda: ComandaLista;
  marime?: MarimeSigla;
  /** Scrie si felul documentului sub numar: „Factură", „Proformă", „Stornată". */
  cuFel?: boolean;
  /** Ce se arata cand magazinul n-are nicio casa de facturare conectata. */
  faraCasa?: React.ReactNode;
}) {
  const { facturaInLucru, deschideDocumentul } = useActiuni();
  const emite = useEmitereFactura();
  const d = c.factura.document;
  if (d) {
    const storno = d.fel === "storno";
    return (
      <button type="button" onClick={() => deschideDocumentul(c.id)} title="Deschide documentul" className={cn("group flex min-w-0 max-w-full flex-shrink-0 items-center gap-1.5 rounded-sm text-left", INEL)}>
        {storno ? <FileX2 className="h-4 w-4 flex-shrink-0 text-destructive" /> : <FileCheck2 className="h-4 w-4 flex-shrink-0 text-success" />}
        <span className="min-w-0">
          <span className="block truncate font-mono text-xs text-foreground group-hover:underline">{d.numar || "emisă"}</span>
          {cuFel && <span className="block text-xs text-muted-foreground">{storno ? "Stornată" : d.fel === "proforma" ? "Proformă" : "Factură"}</span>}
        </span>
      </button>
    );
  }
  if (!c.factura.casa) return <>{faraCasa}</>;
  if (facturaInLucru === c.id) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Se emite…
      </span>
    );
  }
  const casa = c.factura.casa;
  return (
    <span className="inline-flex items-center gap-1">
      <ButonSigla sigla={casa} eticheta={`Emite factura ${casa.nume}`} marime={marime} onClick={(e) => { e.stopPropagation(); emite(c, casa); }} />
      {/* Cu mai multe case conectate, celelalte stau intr-un meniu, ca la curieri. */}
      {c.factura.alteCase.length > 0 && (
        <MeniuLaCerere
          eticheta="Alege altă casă de facturare"
          clasaButon={cn(
            "inline-flex w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white text-muted-foreground ring-1 ring-black/10 transition hover:text-foreground hover:ring-black/25",
            INEL,
            ATINGERE,
            marime === "mic" ? "h-8" : marime === "adaptiv" ? "h-8 sm:h-9" : marime === "mare" ? "h-12" : "h-9",
          )}
          buton={<ChevronDown className="h-3.5 w-3.5" />}
          aliniere="end"
          clasaMeniu="w-[12.5rem]"
        >
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Emite factura la</p>
          <div className="grid grid-cols-2 gap-1.5 p-1.5">
            {c.factura.alteCase.map((s) => (
              <ButonSigla key={s.cheie} sigla={s} eticheta={`Emite factura ${s.nume}`} marime="mic" className="w-full" onClick={(e) => { e.stopPropagation(); emite(c, s); }} />
            ))}
          </div>
        </MeniuLaCerere>
      )}
    </span>
  );
}

/** Butonul „Confirmă" al unei comenzi noi: o trece in „Confirmată". E un pas numit, deci nu mai intreaba. */
export function ButonConfirma({ comanda: c, className }: { comanda: ComandaLista; className?: string }) {
  const { schimbaStarea, stareInLucru } = useActiuni();
  /* O comanda tinuta de marketplace se confirma la el: de aici serverul ar sari-o. */
  if (c.status.cheie !== "pending" || c.sursa.cuFluxPropriu) return null;
  return (
    <button
      type="button"
      disabled={stareInLucru}
      onClick={(e) => { e.stopPropagation(); schimbaStarea([c.id], "confirmed"); }}
      aria-label={`Confirmă comanda ${c.numar}`}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap bg-foreground font-medium text-background transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-50", INEL, className)}
    >
      <Check className="h-3.5 w-3.5" /> Confirmă
    </button>
  );
}

/* ── Cardul unei comenzi ──────────────────────────────────────────────────── */

/**
 * O comanda, ca fisa. O folosesc culoarele „Fluxului" si, pe ecran ingust, „Registrul": un
 * tabel cu noua coloane nu se citeste pe telefon nici derulat in lateral.
 */
export const CardComanda = memo(function CardComanda({ comanda: c, aleasa, laComutare, jos, className }: {
  comanda: ComandaLista;
  /** Bifata sau nu. Lipseste cand fisa nu are bifa. */
  aleasa?: boolean;
  /**
   * Comuta bifa. ⚠ Aceeasi functie la fiecare desenare si primeste id-ul: fisa e memorata, deci
   * la o bifa se redeseneaza doar fisa ei, nu toate cele 50.
   */
  laComutare?: (id: string) => void;
  /** Ce sta in dreapta-jos: starea comenzii sau butonul de confirmare. */
  jos?: "stare" | "confirma";
  className?: string;
}) {
  const { deschide } = useLista();
  const plata = rezumatPlata(c);
  return (
    <article
      onClick={(e) => deschide(e, c.id)}
      onAuxClick={(e) => deschide(e, c.id)}
      className={cn(
        "cursor-pointer rounded-lg bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 transition hover:ring-black/20",
        aleasa ? "ring-foreground/60" : "ring-black/[0.07]",
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        {laComutare && (
          /* Eticheta lata cat degetul (44 px sub `lg`): bifa nimerita pe alaturi nu deschide comanda. */
          <label className={cn("-my-1.5 -ml-1.5 flex-shrink-0 cursor-pointer p-2", ATINGERE)}>
            <input
              type="checkbox"
              checked={!!aleasa}
              onChange={() => laComutare(c.id)}
              aria-label={`Selectează comanda ${c.numar}`}
              className="block h-4 w-4 cursor-pointer rounded border-border accent-foreground"
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-baseline gap-1.5">
              <NumarComanda comanda={c} />
              <span className="truncate text-xs text-muted-foreground">{dataScurta(c.creataLa)}</span>
            </p>
            <Total comanda={c} className="flex-shrink-0 font-semibold" />
          </div>
          <p className="mt-0.5 truncate text-foreground">{c.client.firma ?? c.client.nume}</p>
          <p className="truncate text-xs text-muted-foreground">
            {rezumatLivrare(c)}
            <span className={cn(plata.atentie && "font-medium text-destructive")}>, {plata.text}</span>
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <TeancPoze produse={c.produse} marime={30} />
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={rezumatProduse(c)}>{rezumatProduse(c)}</span>
      </div>

      {/* Stanga expedierea, dreapta factura. */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <div className="min-w-0 flex-1"><ZonaExpediere comanda={c} marime="mic" /></div>
        <ZonaFactura comanda={c} marime="mic" />
      </div>

      <div className="mt-2.5 flex min-h-7 items-center justify-between gap-2">
        <Sursa sursa={c.sursa} className="text-[11px]" />
        {jos === "stare" && <StareText status={c.status} className="text-xs" />}
        {jos === "confirma" && <ButonConfirma comanda={c} className={cn("h-8 rounded-md px-2.5 text-xs", ATINGERE)} />}
      </div>
    </article>
  );
});
