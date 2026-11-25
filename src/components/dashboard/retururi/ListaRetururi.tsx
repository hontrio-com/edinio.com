"use client";

/*
  Pagina de Retururi, in asezarea aleasa de proprietar pe 24.11.2026 („Registru"): cererile
  intr-un tabel curat, cu filele starilor deasupra. Un rand spune esentialul (din ce comanda,
  cine, ce se intoarce, cati bani, in ce stare) si poarta butonul pasului urmator; apasat, isi
  arata dedesubt detaliile: produsele, motivul, IBAN-ul, contactul, comanda.

  Pe telefon si pe tableta, unde tabelul n-are loc, cererile devin fise.

  ═══ CE SCRIE IN BAZA ═══

  Trei lucruri, toate prin actiunile din `return.actions.ts`: starea cererii, semnul de citit si
  stergerea. Rezultatul fiecareia se stie dinainte, deci se vede PE LOC (`useOptimistic` peste
  `aplicaActiunea`), cu numerele de pe file miscate odata cu randul; cand raspunde serverul,
  pagina adusa de el ii ia locul.

  ⚠ In `try` sta DOAR apelul. O actiune de server poate si sa ARUNCE (desfasurare in curs, retea
  cazuta), iar neprinsa intr-o tranzitie ea urca la bariera de erori si inlocuieste tot panoul cu
  o pagina „500". Prinsa, spunem cinstit ca nu stim daca s-a scris si cerem starea adevarata.
*/

import { memo, useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { deleteReturnRequest, toggleReturnRead, updateReturnStatus } from "@/lib/actions/return.actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUTON_CONTUR, BUTON_PERICOL_PLIN, INEL } from "@/components/dashboard/atomi-panou";
import { FileSubliniate, Paginare, RandFiltre, useNavigare, type Navigare } from "@/components/dashboard/liste/navigare";
import { dataScurta, PozaProdus, suma } from "@/components/dashboard/liste/piese";
import { aplicaActiunea, type ActiuneRetur, type CerereRetur, type StareLista } from "./date";
import { adresaFiltrelor, areFiltre, FILE_RETUR, FILTRE_GOALE, PE_PAGINA, type FiltreRetur, type StareRetur } from "./filtre";
import {
  AntetRetururi, CardCerere, DetaliiRetur, FurnizorActiuniRetur, ListaGoala, MeniuCerere, NumarCerere, NUME_CERERI,
  PasulUrmator, StareCerere, type ActiuniRetur,
} from "./piese";

/** Ce primeste lista de la server. */
export interface DateRetururi {
  filtre: FiltreRetur;
  /** Ghicit pe server dupa agentul de utilizator: un telefon primeste doar forma de fise. */
  telefon: boolean;
  /** Pagina curenta de cereri, gata filtrata. */
  cereri: CerereRetur[];
  /** Cate cereri are filtrul curent, pe toate paginile. */
  totalFiltru: number;
  /** Cate cereri are magazinul in fiecare stare. */
  numarari: Record<string, number>;
  /** Toate cererile magazinului. */
  total: number;
  /** Adresa formularului public de retur al magazinului; `null` cat magazinul nu e publicat. */
  formular: string | null;
}

/** De la ce latime a locului incape tabelul. ⚠ Acelasi prag ca `@[61rem]` din clasele de mai jos. */
const PRAG_TABEL = 976;

/** Ce spunem dupa ce starea s-a schimbat. */
const MESAJ_STARE: Record<StareRetur, string> = {
  aprobat: "Cererea a fost aprobată.",
  respins: "Cererea a fost respinsă.",
  rambursat: "Cererea a fost trecută la „Rambursată”.",
  nou: "Cererea a fost trecută înapoi la „Nouă”.",
};

/** Cand actiunea a aruncat: nu stim daca serverul a apucat sa scrie, deci nu pretindem nici ca da, nici ca nu. */
const faraRaspuns = (ce: string) =>
  `Nu am primit răspuns de la server, deci nu știm dacă ${ce}. Pagina se reîncarcă și arată starea adevărată.`;

export function ListaRetururi({ filtre, telefon, cereri, totalFiltru, numarari, total, formular }: DateRetururi) {
  const router = useRouter();
  const { inAsteptare, mergiLa } = useNavigare(filtre, adresaFiltrelor);
  /** Cererea ale carei detalii se vad. Una singura deodata. */
  const [deschisa, setDeschisa] = useState<string | null>(null);
  /** Cererea pentru care se cere confirmarea stergerii. */
  const [deSters, setDeSters] = useState<CerereRetur | null>(null);

  /*
    ⚠ A DOUA TRANZITIE, nu cea a navigarii. `ocupat` stinge butoanele cat se scrie in baza;
    rasfoirea n-are nicio treaba cu el, iar impartita, o stergere in curs ar fi stins si lista.

    ⚠ Numele incepe cu `start`: asa o gaseste `callbackul-de-tranzitie-prinde-caderea.test.ts`,
    care cere ca fiecare asteptare dintr-o tranzitie sa stea intr-un `try`.
  */
  const [ocupat, startScriere] = useTransition();
  const deLaServer = useMemo<StareLista>(() => ({ cereri, numarari, total, totalFiltru }), [cereri, numarari, total, totalFiltru]);
  const [lista, aplicaPeLoc] = useOptimistic(deLaServer, (stare: StareLista, a: ActiuneRetur) => aplicaActiunea(stare, a, filtre.status));

  const schimbaStarea = useCallback((r: CerereRetur, stare: StareRetur) => {
    if (stare === r.status.cheie) return;
    startScriere(async () => {
      aplicaPeLoc({ tip: "stare", id: r.id, stare });
      let res: Awaited<ReturnType<typeof updateReturnStatus>>;
      try {
        res = await updateReturnStatus(r.id, stare);
      } catch {
        toast.error(faraRaspuns("starea cererii s-a schimbat"), { duration: 12000 });
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(MESAJ_STARE[stare]);
      router.refresh();
    });
  }, [aplicaPeLoc, startScriere, router]);

  const comutaCitit = useCallback((r: CerereRetur) => {
    startScriere(async () => {
      aplicaPeLoc({ tip: "citit", id: r.id, citit: !r.citit });
      let res: Awaited<ReturnType<typeof toggleReturnRead>>;
      try {
        res = await toggleReturnRead(r.id, !r.citit);
      } catch {
        toast.error(faraRaspuns("semnul de citit s-a schimbat"), { duration: 12000 });
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }, [aplicaPeLoc, startScriere, router]);

  /** Stergerea, dupa ce omul a confirmat-o in fereastra. */
  const stergeConfirmat = useCallback((r: CerereRetur) => {
    setDeSters(null);
    setDeschisa((v) => (v === r.id ? null : v));
    startScriere(async () => {
      aplicaPeLoc({ tip: "sterge", id: r.id });
      let res: Awaited<ReturnType<typeof deleteReturnRequest>>;
      try {
        res = await deleteReturnRequest(r.id);
      } catch {
        toast.error(faraRaspuns("cererea de retur s-a șters"), { duration: 12000 });
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cererea a fost ștearsă.");
      router.refresh();
    });
  }, [aplicaPeLoc, startScriere, router]);

  const actiuni = useMemo<ActiuniRetur>(
    () => ({ schimbaStarea, comutaCitit, sterge: setDeSters, ocupat }),
    [schimbaStarea, comutaCitit, ocupat],
  );

  /* La orice schimbare de fila, de filtru sau de pagina, cererea deschisa e a altei liste: se inchide. */
  const mergi = useCallback<Navigare<FiltreRetur>["mergiLa"]>((urmator, optiuni) => {
    setDeschisa(null);
    mergiLa(urmator, optiuni);
  }, [mergiLa, setDeschisa]);
  const nav = useMemo<Navigare<FiltreRetur>>(() => ({ filtre, inAsteptare, mergiLa: mergi }), [filtre, inAsteptare, mergi]);
  /* ⚠ Aceeasi functie la fiecare desenare: randurile sunt memorate, deci la deschiderea unuia se redeseneaza doar el si cel care se inchide. */
  const comuta = useCallback((id: string) => setDeschisa((v) => (v === id ? null : id)), [setDeschisa]);

  /*
    Tabel sau fise? Hotaraste latimea LOCULUI. Pana la prima masuratoare stau amandoua in pagina
    si CSS-ul o arata pe cea buna; dupa ea ramane doar forma care se vede. Unui telefon (ghicit
    pe server) i se trimit din capul locului doar fisele.
  */
  const loc = useRef<HTMLDivElement>(null);
  const [forma, setForma] = useState<"tabel" | "fise" | null>(telefon ? "fise" : null);
  useEffect(() => {
    const el = loc.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setForma(el.clientWidth >= PRAG_TABEL ? "tabel" : "fise"));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <FurnizorActiuniRetur value={actiuni}>
      <div className="p-6 text-[13px]">
        <AntetRetururi total={lista.total} numarari={lista.numarari} formular={formular} />

        <FileSubliniate
          className="mt-5"
          eticheta="Starea cererilor"
          activa={filtre.status}
          laAlegere={(cheie) => mergi({ status: cheie as FiltreRetur["status"], page: 1 })}
          file={FILE_RETUR.map((f) => ({ cheie: f.cheie, eticheta: f.eticheta, numar: f.cheie === "all" ? lista.total : lista.numarari[f.cheie] ?? 0 }))}
        />

        <RandFiltre className="mt-4" nav={nav} cuFiltre={areFiltre(filtre)} laGolire={() => mergi(FILTRE_GOALE)} />

        <div ref={loc} className={cn("@container mt-3 transition-opacity", inAsteptare && "opacity-60")} aria-busy={inAsteptare || ocupat}>
          {lista.cereri.length === 0 ? (
            <ListaGoala filtre={filtre} total={lista.total} laGolire={() => mergi(FILTRE_GOALE)} />
          ) : (
            <>
              {/* Coloane cu latimi hotarate (`table-fixed`): lasate dupa continut, textele taiate cu „…" nu lasa tabelul sa se stranga. */}
              {forma !== "fise" && (
                <div className={cn("overflow-hidden rounded-xl bg-white ring-1 ring-black/10", forma === null && "hidden @[61rem]:block")}>
                  <table className="w-full table-fixed border-collapse">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th scope="col" className="w-[clamp(124px,11cqw,170px)] py-2.5 pl-4 pr-3 font-medium">Cerere</th>
                        <th scope="col" className="w-[clamp(132px,15cqw,240px)] py-2.5 pr-4 font-medium">Client</th>
                        <th scope="col" className="py-2.5 pr-4 font-medium">Produse returnate</th>
                        <th scope="col" className="w-[clamp(120px,12cqw,180px)] py-2.5 pr-4 text-right font-medium">De rambursat</th>
                        <th scope="col" className="w-[108px] py-2.5 pl-2 pr-3 font-medium">Stare</th>
                        <th scope="col" className="w-[196px] py-2.5 pr-3 font-medium">Pasul următor</th>
                        <th scope="col" className="w-[80px] py-2.5 pr-3"><span className="sr-only">Acțiuni și detalii</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.cereri.map((r) => <RandCerere key={r.id} retur={r} deschisa={deschisa === r.id} comuta={comuta} />)}
                    </tbody>
                  </table>
                </div>
              )}

              {forma !== "tabel" && (
                <div className={cn("grid grid-cols-1 items-start gap-2 @[40rem]:grid-cols-2", forma === null && "@[61rem]:hidden")}>
                  {lista.cereri.map((r) => <CardCerere key={r.id} retur={r} deschisa={deschisa === r.id} laComutare={comuta} />)}
                </div>
              )}

              {/* Pagina noua incepe de sus: ramas la capatul listei, omul ar vedea sfarsitul paginii urmatoare. */}
              <Paginare
                className="mt-4 px-1"
                ce={NUME_CERERI}
                pePagina={PE_PAGINA}
                pagina={filtre.page}
                total={lista.totalFiltru}
                laPagina={(p) => { mergi({ page: p }); window.scrollTo({ top: 0 }); }}
              />
            </>
          )}
        </div>
      </div>

      {/*
        Stergerea cere o confirmare in fereastra panoului, nu in casuta cenusie a browserului:
        aceea se apasa din reflex, iar cererea stearsa nu se mai poate aduce inapoi.
      */}
      <Dialog open={deSters !== null} onOpenChange={(deschis) => { if (!deschis) setDeSters(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            {/* `leading-snug`: titlul dialogului are randurile lipite (`leading-none`), iar cu numarul comenzii el trece pe doua. */}
            <DialogTitle className="leading-snug">Ștergi cererea de retur{deSters ? ` a comenzii ${deSters.numarComanda}` : ""}?</DialogTitle>
            <DialogDescription>
              Cererea dispare din listă definitiv și nu poate fi adusă înapoi. Comanda și factura ei rămân neatinse.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setDeSters(null)} className={BUTON_CONTUR}>Renunță</button>
            {/* Roșu, și scrie CE face: pe un buton roșu, „Da” cere să-ți amintești întrebarea. */}
            <button type="button" disabled={ocupat} onClick={() => { if (deSters) stergeConfirmat(deSters); }} className={BUTON_PERICOL_PLIN}>
              {ocupat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Șterge cererea
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FurnizorActiuniRetur>
  );
}

/** Un rand al tabelului si, cand e deschis, randul de dedesubt cu detaliile. ⚠ Memorat. */
const RandCerere = memo(function RandCerere({ retur: r, deschisa, comuta }: {
  retur: CerereRetur;
  deschisa: boolean;
  comuta: (id: string) => void;
}) {
  return (
    <>
      <tr
        /* Randul se deschide la clic oriunde pe el, si in spatiul alb; butoanele si meniul isi fac treaba lor. */
        onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button, [role='menu']")) comuta(r.id); }}
        className={cn(
          "cursor-pointer align-top transition-colors hover:bg-muted/40",
          deschisa ? "bg-muted/40" : "border-b border-border/70",
        )}
      >
        <td className="py-3 pl-4 pr-3">
          <NumarCerere retur={r} />
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{dataScurta(r.creatLa)}</div>
        </td>
        <td className="py-3 pr-4">
          <div className="truncate font-medium text-foreground" title={r.client.nume ?? undefined}>{r.client.nume ?? "Fără nume"}</div>
          <div className="truncate text-xs text-muted-foreground">{r.client.telefon ?? r.client.email ?? ""}</div>
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-start gap-2.5">
            <PozaProdus poza={r.produse[0]?.poza ?? null} nume={r.produse[0]?.nume ?? ""} marime={34} />
            <div className="min-w-0">
              <div className="truncate text-foreground" title={r.produse.map((p) => p.nume).join(", ")}>{r.produse[0]?.nume ?? "Fără produse"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {pluralRo(r.bucati, "bucată", "bucăți")}
                {r.produse.length > 1 && `, ${pluralRo(r.produse.length, "produs", "produse")}`}
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 pr-4 text-right">
          <div className="whitespace-nowrap font-semibold tabular-nums text-foreground">{suma(r.valoare)}</div>
          <div className="truncate text-xs text-muted-foreground" title={r.rambursare.eticheta}>{r.rambursare.scurt}</div>
        </td>
        <td className="py-3 pl-2 pr-3"><StareCerere retur={r} /></td>
        <td className="py-2.5 pr-3"><PasulUrmator retur={r} /></td>
        <td className="py-2.5 pr-3">
          <span className="flex items-center justify-end">
            <MeniuCerere retur={r} />
            <button
              type="button"
              onClick={() => comuta(r.id)}
              aria-expanded={deschisa}
              aria-label={deschisa ? "Ascunde detaliile cererii" : "Arată detaliile cererii"}
              className={cn("grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL)}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", deschisa && "rotate-180")} />
            </button>
          </span>
        </td>
      </tr>
      {deschisa && (
        <tr className="border-b border-border/70 bg-muted/40">
          <td colSpan={7} className="px-4 pb-5 pt-1">
            <div className="rounded-lg bg-white p-5 ring-1 ring-black/[0.07]">
              <DetaliiRetur retur={r} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
});
