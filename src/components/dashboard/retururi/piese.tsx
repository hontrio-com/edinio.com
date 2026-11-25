"use client";

/*
  Piesele paginii de Retururi: starea si semnul de necitit, butoanele pasului urmator, meniul
  unei cereri, detaliile ei, fisa de pe telefon, capul paginii si lista goala.

  Limbajul e cel al Comenzilor: stari fara pastile (punct si cuvant), poze de produs, inel de
  focalizare si tinte de atins la fel.

  ⚠ Piesele NU scriu in baza. Ce e de facut cu o cerere (aproba, respinge, am rambursat, citit,
  sterge) cer listei, prin `ActiuniRetur`: ea tine tranzitia, starea aratata pe loc si mesajele.

  ⚠ Aici NU exista buton de stornare. Stornarea caselor de facturare intoarce factura
  INTREAGA, iar o cerere de retur poate fi pentru o parte din comanda: un buton apasat din
  lista ar fi stornat si produsele pastrate de client. Fisa spune ce document are comanda si
  duce la ea, unde stornarea se face cu toate datele in fata.
*/

import { createContext, memo, useContext } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight, Check, ChevronDown, Copy, FileCheck2, FileX2, Mail, MailOpen, MoreHorizontal, Phone, Trash2,
} from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { ATINGERE, INEL, PunctStare } from "@/components/dashboard/atomi-panou";
import { MeniuLaCerere, StareGoala } from "@/components/dashboard/liste/navigare";
import { dataScurta, PozaProdus, suma, TeancPoze } from "@/components/dashboard/liste/piese";
import { STARI_AFISATE, type CerereRetur } from "./date";
import { areFiltre, STARI_RETUR, type FiltreRetur, type StareRetur } from "./filtre";

export const NUME_CERERI = ["cerere", "cereri"] as const;

/* ── Ce se poate face cu o cerere ─────────────────────────────────────────── */

/** Ce stie lista sa faca cu o cerere. Piesele doar cer; lista scrie, arata pe loc si spune ce a iesit. */
export interface ActiuniRetur {
  /** Muta cererea in alta stare: „Aprobă", „Respinge", „Am rambursat", sau din meniu. */
  schimbaStarea: (retur: CerereRetur, stare: StareRetur) => void;
  /** Citita devine necitita si invers. */
  comutaCitit: (retur: CerereRetur) => void;
  /** Cere confirmarea, apoi sterge cererea. */
  sterge: (retur: CerereRetur) => void;
  /** Adevarat cat se scrie in baza: butoanele se sting, ca aceeasi apasare sa nu plece de doua ori. */
  ocupat: boolean;
}

const ContextActiuni = createContext<ActiuniRetur | null>(null);

/** Il pune `ListaRetururi` in jurul listei. */
export const FurnizorActiuniRetur = ContextActiuni.Provider;

function useActiuni(): ActiuniRetur {
  const actiuni = useContext(ContextActiuni);
  if (!actiuni) throw new Error("Piesele unei cereri de retur se deseneaza inauntrul listei (FurnizorActiuniRetur).");
  return actiuni;
}

/* ── Starea si semnul de necitit ──────────────────────────────────────────── */

/** Punct colorat si cuvant: starea se citeste, nu sta intr-o pastila. */
export function StareCerere({ retur, className }: { retur: CerereRetur; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-foreground", className)}>
      <PunctStare ton={retur.status.ton} />
      {retur.status.eticheta}
    </span>
  );
}

/**
 * Numarul comenzii din care vine cererea. O cerere necitita il are ingrosat, cu un punct negru
 * in fata, ca un mesaj necitit.
 *
 * ⚠ `relative`: textul ascuns vizual e pozitionat absolut. Fara un stramos pozitionat aproape,
 * intr-o lista care deruleaza el ramane la locul lui din continutul NEDERULAT si lungeste pagina.
 */
export function NumarCerere({ retur: r, className }: { retur: CerereRetur; className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums text-foreground", r.citit ? "font-medium" : "font-semibold", className)}>
      {!r.citit && (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" />
          <span className="sr-only">Necitită:</span>
        </>
      )}
      {r.numarComanda}
    </span>
  );
}

/** „2 × Pernă decorativă și încă 1”. */
export function rezumatProduse(r: CerereRetur): string {
  if (r.produse.length === 0) return "Fără produse";
  const primul = r.produse[0];
  const cap = primul.cantitate > 1 ? `${primul.cantitate} × ${primul.nume}` : primul.nume;
  return r.produse.length > 1 ? `${cap} și încă ${r.produse.length - 1}` : cap;
}

/* ── Pasul urmator ────────────────────────────────────────────────────────── */

const BUTON_PLIN = "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-foreground px-3 font-medium text-background transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-50";
const BUTON_CONTUR = "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-white px-3 font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Ce e de facut cu cererea, ca butoane: una noua se aproba sau se respinge, una aprobata se
 * incheie cand banii au plecat. Una incheiata nu mai are nimic de apasat.
 */
export function PasulUrmator({ retur: r, mic = false, className }: { retur: CerereRetur; mic?: boolean; className?: string }) {
  const { schimbaStarea, ocupat } = useActiuni();
  /* Sub `lg` tinta de atins trece de inaltimea butonului (vezi `ATINGERE`). */
  const marime = cn(mic ? "h-8 text-xs" : "h-9 text-[13px]", ATINGERE);
  if (r.status.cheie === "nou") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <button type="button" disabled={ocupat} onClick={() => schimbaStarea(r, "aprobat")} className={cn(BUTON_PLIN, INEL, marime)}>
          <Check className="h-3.5 w-3.5" /> Aprobă
        </button>
        <button type="button" disabled={ocupat} onClick={() => schimbaStarea(r, "respins")} className={cn(BUTON_CONTUR, INEL, marime)}>
          Respinge
        </button>
      </span>
    );
  }
  if (r.status.cheie === "aprobat") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <button type="button" disabled={ocupat} onClick={() => schimbaStarea(r, "rambursat")} className={cn(BUTON_PLIN, INEL, marime)}>
          <Check className="h-3.5 w-3.5" /> Am rambursat
        </button>
      </span>
    );
  }
  return null;
}

/** Meniul „⋯" al unei cereri: citit/necitit, mutarea in alta stare, stergerea. */
export function MeniuCerere({ retur: r, className }: { retur: CerereRetur; className?: string }) {
  const { schimbaStarea, comutaCitit, sterge, ocupat } = useActiuni();
  return (
    <MeniuLaCerere
      eticheta={`Acțiuni pentru cererea comenzii ${r.numarComanda}`}
      clasaButon={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, ATINGERE, className)}
      buton={<MoreHorizontal className="h-4 w-4" />}
      aliniere="end"
      clasaMeniu="w-56"
    >
      <DropdownMenuItem disabled={ocupat} onClick={() => comutaCitit(r)}>
        {r.citit ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
        {r.citit ? "Marchează ca necitită" : "Marchează ca citită"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Mută în starea</p>
      {STARI_RETUR.map((s) => (
        <DropdownMenuItem key={s} disabled={ocupat || s === r.status.cheie} onClick={() => schimbaStarea(r, s)}>
          <PunctStare ton={STARI_AFISATE[s].ton} />
          <span className="flex-1">{STARI_AFISATE[s].eticheta}</span>
          {s === r.status.cheie && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={ocupat} onClick={() => sterge(r)}>
        <Trash2 className="h-4 w-4" /> Șterge cererea
      </DropdownMenuItem>
    </MeniuLaCerere>
  );
}

/* ── Bucatile din care se fac detaliile unei cereri ───────────────────────── */

function TitluSectiune({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>;
}

/**
 * Produsele care se intorc: poza, nume, cate si la ce pret. Totalul liniei apare doar unde are
 * loc (hotaraste latimea locului, nu a ecranului); dedesubt, cat e de dat inapoi.
 */
function ProduseRetur({ retur: r, className }: { retur: CerereRetur; className?: string }) {
  return (
    <section className={cn("@container min-w-0", className)}>
      <TitluSectiune>{pluralRo(r.bucati, "bucată returnată", "bucăți returnate")}</TitluSectiune>
      <ul className="mt-1 divide-y divide-border/70">
        {r.produse.map((p, i) => (
          <li key={i} className="flex items-center gap-3 py-2">
            <PozaProdus poza={p.poza} nume={p.nume} marime={40} />
            <span className="min-w-0 flex-1 break-words text-foreground">{p.nume}</span>
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">{p.cantitate} × {suma(p.pret)}</span>
            <span className="hidden w-[5.5rem] whitespace-nowrap text-right font-medium tabular-nums text-foreground @[28rem]:block">{suma(p.pret * p.cantitate)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between gap-3 border-t border-border pt-2 text-sm font-semibold text-foreground">
        <span>De rambursat</span>
        <span className="whitespace-nowrap tabular-nums">{suma(r.valoare)}</span>
      </p>
    </section>
  );
}

function MotivRetur({ retur: r }: { retur: CerereRetur }) {
  return (
    <section className="min-w-0">
      <TitluSectiune>Motiv</TitluSectiune>
      <p className={cn("mt-1.5 whitespace-pre-line break-words", r.motiv ? "text-foreground" : "text-muted-foreground")}>
        {r.motiv ?? "Clientul nu a scris un motiv."}
      </p>
    </section>
  );
}

/** IBAN-ul in grupe de cate patru, cum e scris pe orice extras: asa se compara din ochi. */
const ibanCitet = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");

/** IBAN-ul clientului, cu un buton care il copiaza (fara spatii): e ce duce omul in aplicatia bancii. */
function Iban({ iban }: { iban: string }) {
  function copiaza() {
    if (!navigator.clipboard) {
      toast.error("Browserul nu lasă copierea de aici.");
      return;
    }
    navigator.clipboard.writeText(iban.replace(/\s+/g, "")).then(
      () => toast.success("IBAN copiat."),
      () => toast.error("Nu am putut copia IBAN-ul."),
    );
  }
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <span className="min-w-0 break-words font-mono text-xs text-foreground">{ibanCitet(iban)}</span>
      <button
        type="button"
        onClick={copiaza}
        aria-label="Copiază IBAN-ul"
        title="Copiază IBAN-ul"
        className={cn("grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, ATINGERE)}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** Cum vrea clientul banii inapoi si cum a platit comanda. */
function RambursareRetur({ retur: r }: { retur: CerereRetur }) {
  return (
    <section className="min-w-0">
      <TitluSectiune>Rambursare</TitluSectiune>
      <p className="mt-1.5 text-foreground">{r.rambursare.eticheta}</p>
      {r.rambursare.iban && <Iban iban={r.rambursare.iban} />}
      {r.comanda && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Plata comenzii: {r.comanda.plata}{r.comanda.plataRambursata && ", rambursată"}
        </p>
      )}
    </section>
  );
}

/* Sub `lg` o legatura e inalta cat cere degetul (40 px), nu cat randul ei de text. */
const LEGATURA_CONTACT = "flex w-fit max-w-full items-center gap-1.5 rounded-sm hover:text-foreground max-lg:min-h-10";

function ClientRetur({ retur: r }: { retur: CerereRetur }) {
  return (
    <section className="min-w-0">
      <TitluSectiune>Client</TitluSectiune>
      <p className="mt-1.5 font-medium text-foreground">{r.client.nume ?? "Fără nume"}</p>
      <div className="mt-1 space-y-1 text-muted-foreground max-lg:mt-0 max-lg:space-y-0">
        {r.client.telefon && (
          <a href={`tel:${r.client.telefon}`} className={cn(LEGATURA_CONTACT, INEL)}>
            <Phone className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> {r.client.telefon}
          </a>
        )}
        {r.client.email && (
          <a href={`mailto:${r.client.email}`} className={cn(LEGATURA_CONTACT, INEL)}>
            <Mail className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{r.client.email}</span>
          </a>
        )}
      </div>
    </section>
  );
}

/** Comanda din care vine cererea: legatura catre ea, cat a costat si ce document are. */
function ComandaRetur({ retur: r }: { retur: CerereRetur }) {
  const d = r.comanda?.document;
  return (
    <section className="min-w-0">
      <TitluSectiune>Comanda</TitluSectiune>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 max-lg:mt-0">
        {r.idComanda ? (
          <Link
            href={`/dashboard/orders/${r.idComanda}`}
            prefetch={false}
            className={cn("inline-flex items-center gap-1 rounded-sm font-medium tabular-nums text-foreground underline-offset-2 hover:underline max-lg:min-h-10", INEL)}
          >
            {r.numarComanda} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : <span className="font-medium tabular-nums text-foreground">{r.numarComanda}</span>}
        {r.comanda && <span className="whitespace-nowrap tabular-nums text-muted-foreground">{suma(r.comanda.total, r.comanda.moneda)}</span>}
      </p>
      {r.comanda && (
        <p className="mt-1 flex items-center gap-1.5 text-xs max-lg:mt-0">
          {d ? (
            <>
              {d.fel === "storno"
                ? <FileX2 className="h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
                : <FileCheck2 className="h-4 w-4 flex-shrink-0 text-success" aria-hidden="true" />}
              <span className="min-w-0 truncate font-mono text-foreground">{d.numar || "fără număr"}</span>
              <span className="whitespace-nowrap text-muted-foreground">
                {d.fel === "storno" ? "factură stornată" : d.fel === "proforma" ? "proformă" : "factură nestornată"}
              </span>
            </>
          ) : <span className="text-muted-foreground">Nicio factură emisă.</span>}
        </p>
      )}
    </section>
  );
}

/**
 * Tot ce se stie despre o cerere: ce se intoarce, de ce, cum vrea clientul banii, cine e
 * clientul si din ce comanda vine.
 *
 * Cate coloane are hotaraste latimea LOCULUI (`@container`), nu a ecranului: aceeasi piesa sta
 * sub un rand lat de tabel (trei coloane: produsele, motivul si banii, clientul si comanda),
 * sub unul mai ingust (doua: produsele in stanga, restul in dreapta) sau intr-o fisa (una).
 */
export function DetaliiRetur({ retur: r, className }: { retur: CerereRetur; className?: string }) {
  return (
    <div className={cn("@container", className)}>
      <div className="grid grid-cols-1 gap-x-10 gap-y-5 @[40rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @[62rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ProduseRetur retur={r} className="@[40rem]:row-span-2 @[62rem]:row-span-1" />
        <div className="min-w-0 space-y-5">
          <MotivRetur retur={r} />
          <RambursareRetur retur={r} />
        </div>
        <div className="min-w-0 space-y-5">
          <ClientRetur retur={r} />
          <ComandaRetur retur={r} />
        </div>
      </div>
    </div>
  );
}

/* ── Fisa unei cereri, acolo unde tabelul n-are loc ───────────────────────── */

/**
 * O cerere, ca fisa: forma listei pe telefon si pe tableta. Apasata, isi arata detaliile
 * dedesubt. ⚠ Memorata: la deschiderea unei fise se redeseneaza doar ea si cea care se inchide.
 */
export const CardCerere = memo(function CardCerere({ retur: r, deschisa, laComutare }: {
  retur: CerereRetur;
  deschisa: boolean;
  /** Aceeasi functie la fiecare desenare; primeste id-ul cererii. */
  laComutare: (id: string) => void;
}) {
  return (
    <article
      /* Fisa se deschide la clic oriunde pe ea, si in spatiul alb; butoanele, legaturile si meniul isi fac treaba lor. */
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button, [role='menu']")) laComutare(r.id); }}
      className={cn(
        "min-w-0 cursor-pointer rounded-lg bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 transition hover:ring-black/20",
        deschisa ? "ring-foreground/60 hover:ring-foreground/60" : "ring-black/[0.07]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <NumarCerere retur={r} />
            <span className="truncate text-xs text-muted-foreground">{dataScurta(r.creatLa)}</span>
          </p>
          <p className="mt-0.5 truncate text-foreground">{r.client.nume ?? "Fără nume"}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="whitespace-nowrap font-semibold tabular-nums text-foreground">{suma(r.valoare)}</p>
          <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">{r.rambursare.scurt}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <TeancPoze produse={r.produse} marime={30} />
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={rezumatProduse(r)}>{rezumatProduse(r)}</span>
      </div>
      {r.motiv && !deschisa && <p className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground">„{r.motiv}”</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <StareCerere retur={r} className="text-xs" />
        <span className="ml-auto flex items-center gap-1">
          <PasulUrmator retur={r} mic className="mr-0.5" />
          <MeniuCerere retur={r} />
          <button
            type="button"
            onClick={() => laComutare(r.id)}
            aria-expanded={deschisa}
            aria-label={deschisa ? "Ascunde detaliile cererii" : "Arată detaliile cererii"}
            className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, ATINGERE)}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", deschisa && "rotate-180")} />
          </button>
        </span>
      </div>

      {deschisa && <DetaliiRetur retur={r} className="mt-3 border-t border-border/70 pt-3 text-[13px]" />}
    </article>
  );
});

/* ── Capul paginii si lista goala ─────────────────────────────────────────── */

/** „una” sau numarul, pentru propozitii in care numarul e subiect („una așteaptă", „7 așteaptă"). */
const cate = (n: number) => (n === 1 ? "una" : n.toLocaleString("ro-RO"));

/**
 * Capul paginii: titlul, cate cereri sunt si cate mai au ceva de facut (un fapt despre magazin,
 * nu o lamurire despre ecran), iar in dreapta formularul prin care clientii trimit cererile
 * (cat magazinul e publicat; altfel formularul nu e inca la vedere).
 * Pe telefon legatura ia latimea intreaga.
 */
export function AntetRetururi({ total, numarari, formular }: { total: number; numarari: Record<string, number>; formular: string | null }) {
  const noi = numarari.nou ?? 0;
  const aprobate = numarari.aprobat ?? 0;
  const tare = "font-medium text-foreground";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Retururi</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {pluralRo(total, "cerere", "cereri")}
          {(noi > 0 || aprobate > 0) && ", dintre care "}
          {noi > 0 && <><span className={tare}>{cate(noi)}</span> așteaptă răspuns</>}
          {noi > 0 && aprobate > 0 && " și "}
          {aprobate > 0 && <><span className={tare}>{cate(aprobate)}</span> așteaptă rambursarea</>}
        </p>
      </div>
      {formular && (
        <a
          href={formular}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "relative inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 lg:h-9",
            INEL,
          )}
        >
          Formularul de retur <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(se deschide într-o filă nouă)</span>
        </a>
      )}
    </div>
  );
}

/** Lista goala spune DE CE e goala: n-ai nicio cerere, sau filtrul ales n-are niciuna. */
export function ListaGoala({ filtre, total, laGolire }: { filtre: FiltreRetur; total: number; laGolire: () => void }) {
  if (total === 0) {
    return (
      <StareGoala
        titlu="Nicio cerere de retur încă"
        lamurire="Cererile trimise de clienți prin formularul de retur al magazinului apar aici."
      />
    );
  }
  return (
    <StareGoala
      titlu={filtre.q ? `Nimic nu se potrivește cu „${filtre.q}”` : "Nicio cerere în filtrul ales"}
      laStergere={areFiltre(filtre) ? laGolire : undefined}
    />
  );
}
