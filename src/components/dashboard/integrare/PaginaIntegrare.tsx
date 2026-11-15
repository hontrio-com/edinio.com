"use client";

import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, Loader2, type LucideIcon } from "lucide-react";
import { LegaturaDePanou } from "@/components/dashboard/LegaturaDePanou";
import { logoIntegrare } from "@/components/dashboard/IntegrationHeader";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { EtichetaStare, type TonEticheta } from "@/components/ui/eticheta-stare";
import { ghidulIntegrarii } from "@/lib/dashboard/ghiduri-integrari";
import { cn } from "@/lib/utils";

/**
 * Scheletul comun al paginilor de integrari (refacute 15.11.2026, dupa pagina tbi bank, la cererea
 * proprietarului: „vreau sa le faci si pe celelalte la fel").
 *
 * Asezarea: antet cu sigla, titlul, o propozitie, starea si (optional) comutatorul principal; dedesubt
 * doua coloane pe ecranele late. In stanga pasii numerotati (`Sectiune`), scurti; in dreapta o coloana
 * care sta pe loc la derulare: lista de configurare, cifrele, „cum functioneaza" si ghidul din Ajutor.
 * Explicatiile lungi stau in semne de intrebare (`ExplicatieCard`), nu in paragrafe.
 *
 * Textele sunt pentru COMERCIANT: cu diacritice.
 */

export type StareAntet = { ton: TonEticheta; text: string };

export function PaginaIntegrare({
  id,
  titlu,
  descriere,
  stari = [],
  actiune,
  aside,
  children,
}: {
  /** Id-ul integrarii: din el vin sigla (`IntegrationHeader`) si ghidul din Ajutor. */
  id: string;
  titlu: string;
  descriere: ReactNode;
  stari?: StareAntet[];
  /** In dreapta antetului: de obicei `ComutatorPrincipal`. */
  actiune?: ReactNode;
  /** Coloana din dreapta. Lipsa = o singura coloana, pe toata latimea. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const logo = logoIntegrare(id);
  return (
    <div className="mx-auto max-w-6xl p-4 pb-16 sm:p-6 sm:pb-16">
      <LegaturaDePanou
        href="/dashboard/features"
        className="relative mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        clasaInAsteptare="-bottom-0.5 top-auto rounded-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Integrări
      </LegaturaDePanou>

      <header className="mb-6 flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo.src}
              alt={logo.alt}
              className="h-9 w-auto max-w-[150px] shrink-0 self-start object-contain sm:h-10 sm:self-auto"
              style={logo.filter ? { filter: logo.filter } : undefined}
            />
          )}
          <div className={cn("min-w-0", logo && "sm:border-l sm:border-border sm:pl-4")}>
            <h1 className="text-base font-semibold text-foreground">{titlu}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{descriere}</p>
            {stari.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stari.map((s) => <EtichetaStare key={s.text} ton={s.ton} marime="mic">{s.text}</EtichetaStare>)}
              </div>
            )}
          </div>
        </div>
        {actiune}
      </header>

      {aside ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-5">{children}</div>
          <aside className="space-y-4 lg:sticky lg:top-20">{aside}</aside>
        </div>
      ) : (
        <div className="space-y-5">{children}</div>
      )}
    </div>
  );
}

/** Comutatorul principal din antet („pornit la comanda" / „oprit"). */
export function ComutatorPrincipal({
  eticheta,
  activ,
  onChange,
  textPornit = "Pornită",
  textOprit = "Oprită",
  ariaLabel,
  disabled,
}: {
  eticheta: string;
  activ: boolean;
  onChange: (v: boolean) => void;
  textPornit?: string;
  textOprit?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 sm:justify-start">
      <span>
        <span className="block text-sm font-medium text-foreground">{eticheta}</span>
        <span className="block text-xs text-muted-foreground">{activ ? textPornit : textOprit}</span>
      </span>
      <Switch checked={activ} onCheckedChange={onChange} aria-label={ariaLabel ?? eticheta} disabled={disabled} />
    </label>
  );
}

/**
 * Un rand cu titlu, o propozitie si comutatorul in dreapta. `separat` pune o linie deasupra, pentru
 * randurile care urmeaza altora in aceeasi sectiune.
 */
export function RandComutator({ titlu, text, activ, onChange, disabled, separat, ariaLabel }: {
  titlu: ReactNode;
  text?: ReactNode;
  activ: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  separat?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", separat && "border-t border-border pt-4")}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{titlu}</p>
        {text && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>}
      </div>
      <Switch
        checked={activ}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel ?? (typeof titlu === "string" ? titlu : undefined)}
      />
    </div>
  );
}

/** O sectiune a formularului: panou numerotat, cu o singura propozitie sub titlu. */
export function Sectiune({ pas, titlu, descriere, children, className }: {
  pas?: number;
  titlu: string;
  descriere?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel step={pas} title={titlu} className={className}>
      {descriere && <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">{descriere}</p>}
      {children}
    </Panel>
  );
}

/** „Configurare N din M", cu bara de progres si bifele. */
export function ListaConfigurare({ pasi, titlu = "Configurare" }: { pasi: { text: ReactNode; facut: boolean }[]; titlu?: string }) {
  const facute = pasi.filter((p) => p.facut).length;
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{titlu}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{facute} din {pasi.length}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pasi.length ? (facute / pasi.length) * 100 : 0}%` }} />
      </div>
      <ul className="mt-3.5 space-y-2.5">
        {pasi.map((p, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm">
            <span className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              p.facut ? "bg-success text-white" : "ring-1 ring-inset ring-foreground/20",
            )}>
              {p.facut && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={p.facut ? "text-foreground" : "text-muted-foreground"}>{p.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** „Cum functioneaza": cateva randuri scurte, cu iconite, si ghidul complet din Ajutor. */
export function CumFunctioneaza({ id, puncte, titlu = "Cum funcționează" }: {
  /** Id-ul integrarii, pentru ghidul din Ajutor (`ghiduri-integrari.ts`). */
  id?: string;
  puncte: { Icon: LucideIcon; text: ReactNode }[];
  titlu?: string;
}) {
  const ghid = id ? ghidulIntegrarii(id) : null;
  return (
    <Panel className="p-4">
      <p className="text-sm font-semibold text-foreground">{titlu}</p>
      <ul className="mt-3 space-y-3">
        {puncte.map(({ Icon, text }, i) => (
          <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {ghid && (
        <a href={ghid} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
          Ghidul complet, pas cu pas <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      )}
    </Panel>
  );
}

/** Cifre in casute (2 pe rand) si, optional, randuri eticheta / valoare dedesubt. */
export function CardCifre({ titlu, cifre = [], randuri = [] }: {
  titlu: string;
  cifre?: { eticheta: string; valoare: ReactNode }[];
  randuri?: { eticheta: ReactNode; valoare: ReactNode }[];
}) {
  return (
    <Panel className="p-4">
      <p className="text-sm font-semibold text-foreground">{titlu}</p>
      {cifre.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {cifre.map((c) => (
            <div key={c.eticheta} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-lg font-semibold tabular-nums text-foreground">{c.valoare}</p>
              <p className="text-[11px] text-muted-foreground">{c.eticheta}</p>
            </div>
          ))}
        </div>
      )}
      {randuri.length > 0 && (
        <dl className={cn("space-y-1.5 text-xs", cifre.length > 0 ? "mt-3 border-t border-border pt-3" : "mt-3")}>
          {randuri.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-0.5 text-muted-foreground">{r.eticheta}</dt>
              <dd className="text-right text-foreground">{r.valoare}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

/** Doua sau mai multe alegeri ca niste carduri (de exemplu Test / Real). */
export function AlegereCarduri<T extends string | boolean>({ eticheta, valoare, optiuni, onChange, coloane = 2 }: {
  eticheta: string;
  valoare: T;
  optiuni: { valoare: T; titlu: string; text: ReactNode; avertizare?: boolean }[];
  onChange: (v: T) => void;
  coloane?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={eticheta} className={cn("grid gap-2.5", coloane === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {optiuni.map((o) => {
        const ales = o.valoare === valoare;
        return (
          <button
            key={String(o.valoare)}
            type="button"
            role="radio"
            aria-checked={ales}
            onClick={() => onChange(o.valoare)}
            className={cn(
              "flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ales ? (o.avertizare ? "border-warning bg-warning/10" : "border-primary bg-primary/5") : "border-border hover:bg-muted/40",
            )}
          >
            <span>
              <span className="block text-sm font-medium text-foreground">{o.titlu}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.text}</span>
            </span>
            <span aria-hidden="true" className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              ales ? (o.avertizare ? "bg-warning text-white" : "bg-primary text-white") : "ring-1 ring-inset ring-foreground/25",
            )}>
              {ales && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Zona de deconectare, separata, la finalul coloanei din stanga. */
export function ZonaDeconectare({ descriere, children }: { descriere: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">Deconectare</p>
        <p className="text-xs text-muted-foreground">{descriere}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Bara de salvare, lipita jos in coloana formularului. Cu `modificat` dat, apare doar cand exista
 * modificari nesalvate (sau o eroare); fara el, sta mereu acolo, cu butoanele.
 */
export function BaraSalvare({
  modificat,
  eroare,
  saving,
  onSalveaza,
  onRenunta,
  textSalveaza = "Salvează",
  extra,
}: {
  modificat?: boolean;
  eroare?: string | null;
  saving: boolean;
  onSalveaza: () => void;
  onRenunta?: () => void;
  textSalveaza?: string;
  /** Butoane in plus, la stanga salvarii (de exemplu „Testează conexiunea"). */
  extra?: ReactNode;
}) {
  const urmarit = modificat !== undefined;
  if (urmarit && !modificat && !eroare && !saving) return null;
  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
      {eroare
        ? <p role="alert" className="mr-auto flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{eroare}</p>
        : urmarit
          ? <p className="mr-auto text-sm text-muted-foreground">Ai modificări nesalvate.</p>
          : <span className="mr-auto" />}
      {extra}
      {onRenunta && <Button type="button" variant="outline" onClick={onRenunta} disabled={saving || (urmarit && !modificat)}>Renunță</Button>}
      <Button type="button" onClick={onSalveaza} disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {textSalveaza}
      </Button>
    </div>
  );
}

/**
 * Starea unui formular de integrare cu un singur obiect de configurare: `modificat` fata de ultima
 * salvare, „Renunta" si mutarea reperului dupa o salvare reusita. Reperul se muta pe CE A TRIMIS
 * formularul (nu pe ce intoarce serverul), ca o valoare rescrisa canonic sa nu lase bara aprinsa.
 */
export function useFormularIntegrare<T>(initial: T) {
  const [cfg, setCfg] = useState<T>(initial);
  const [baza, setBaza] = useState<T>(initial);
  const modificat = JSON.stringify(cfg) !== JSON.stringify(baza);
  /* Stabila (`useCallback`), ca sa poata sta in dependentele unui `useCallback` din pagina. */
  const aliniaza = useCallback((schimba: (v: T) => T) => { setBaza(schimba); setCfg(schimba); }, []);
  return {
    cfg,
    setCfg,
    modificat,
    /** Dupa o salvare reusita: reperul devine ce s-a trimis (cu secretele golite, daca e cazul). */
    marcheazaSalvat: (dupa?: T) => { const v = dupa ?? cfg; setBaza(v); setCfg(v); },
    renunta: () => setCfg(baza),
    /**
     * O felie scrisa de SERVER, nu de om (de exemplu legarea WhatsApp la notice.ro): intra si in
     * formular, si in reper, ca sa nu aprinda bara de salvare si sa nu fie stearsa de „Renunta".
     */
    aliniaza,
  };
}
