import type { ReactNode } from "react";
import Image from "next/image";
import { Check, CircleAlert, Info, Package, type LucideIcon } from "lucide-react";
import type { TonEticheta } from "@/components/ui/eticheta-stare";
import type { Cronologie } from "@/lib/cont/cronologie";
import { formatDate } from "@/lib/utils/format";
import { CARD, TITLU } from "./clase";

/**
 * Piesele zonei de cont. Toate sunt componente de SERVER, fara stare.
 *
 * H6: textele de ecran se scriu fara diacritice.
 */

/* ═══ Cardul de sectiune ═══ */

export function Sectiune({
  titlu,
  descriere,
  icon: Icon,
  actiune,
  children,
  corpLipit = false,
  id,
}: {
  titlu: string;
  descriere?: ReactNode;
  icon?: LucideIcon;
  actiune?: ReactNode;
  children: ReactNode;
  /** Corpul se lipeste de margini (liste cu separatoare proprii). */
  corpLipit?: boolean;
  id?: string;
}) {
  /* ⚠ Fara `overflow-hidden`: ar taia meniurile si confirmarile care ies din card. */
  return (
    <section className={CARD} aria-labelledby={id ? `${id}-titlu` : undefined}>
      <header className="flex items-start justify-between gap-3 border-b border-[var(--st-border)] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)]">
              <Icon className="h-[18px] w-[18px] text-[var(--st-text)]" strokeWidth={1.7} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={id ? `${id}-titlu` : undefined} className="text-base font-semibold leading-snug text-[var(--st-text)]" style={TITLU}>
              {titlu}
            </h2>
            {descriere && <p className="mt-0.5 text-xs leading-relaxed text-[var(--st-muted)]">{descriere}</p>}
          </div>
        </div>
        {actiune && <div className="flex shrink-0 items-center gap-2">{actiune}</div>}
      </header>
      <div className={corpLipit ? "" : "px-5 py-5 sm:px-6"}>{children}</div>
    </section>
  );
}

/* ═══ Lista eticheta: valoare ═══ */

export function ListaDate({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-[var(--st-border)]">{children}</dl>;
}

/** Pe telefon eticheta sta deasupra valorii, ca adresele lungi sa nu se inghesuie. */
export function RandDate({ eticheta, children }: { eticheta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm text-[var(--st-muted)]">{eticheta}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-[var(--st-text)]">{children}</dd>
    </div>
  );
}

/* ═══ Eticheta de stare ═══ */

const PUNCT: Record<TonEticheta, string> = {
  asteptare: "bg-warning",
  info: "bg-info",
  lucru: "bg-purple-500",
  drum: "bg-indigo-500",
  bun: "bg-success",
  rau: "bg-destructive",
  neutru: "bg-[var(--st-muted)]",
};

/**
 * Sora de vitrina a lui `EtichetaStare` din panou, cu ACELEASI tonuri si aceleasi
 * cuvinte (`orderStatus`). Fundalul e `--st-surface`, nu `--st-bg`: pe un magazin
 * cu fundal inchis textul ar fi iesit ilizibil.
 */
export function EtichetaStareCont({ ton, children }: { ton: TonEticheta; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--st-border)] bg-[var(--st-surface)] px-2.5 py-1 text-xs font-medium text-[var(--st-text)]">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNCT[ton]}`} />
      {children}
    </span>
  );
}

/* ═══ Stare goala ═══ */

export function StareGoala({
  icon: Icon,
  titlu,
  children,
  actiune,
}: {
  icon: LucideIcon;
  titlu: string;
  children?: ReactNode;
  actiune?: ReactNode;
}) {
  return (
    <div className="rounded-[min(var(--st-radius-lg),1.25rem)] border border-dashed border-[var(--st-border)] bg-[var(--st-surface)] px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[var(--st-radius)] bg-[var(--st-primary-soft)]">
        <Icon className="h-6 w-6 text-[var(--st-text)]" strokeWidth={1.6} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-[var(--st-text)]" style={TITLU}>{titlu}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--st-muted)]">{children}</div>}
      {actiune && <div className="mt-6 flex flex-wrap justify-center gap-3">{actiune}</div>}
    </div>
  );
}

/* ═══ Mesaj (nu toast: un toast dispare, iar o eroare trebuie sa ramana) ═══ */

export function Mesaj({ fel = "info", children }: { fel?: "info" | "eroare"; children: ReactNode }) {
  const Icon = fel === "eroare" ? CircleAlert : Info;
  return (
    <div
      role={fel === "eroare" ? "alert" : undefined}
      className="flex items-start gap-2.5 rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--st-text)]"
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${fel === "eroare" ? "text-destructive" : "text-[var(--st-muted)]"}`}
        aria-hidden="true"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ═══ Miniatura de produs ═══ */

const MARIMI = { sm: "h-11 w-11", md: "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]" } as const;

/**
 * Imaginea din catalogul de AZI, sau un inlocuitor cand produsul nu mai exista
 * (15% din linii pe productie) ori n-are poza. `sizes` mic, ca in cos: fiecare
 * latime distincta e o transformare platita la Cloudflare.
 */
export function Miniatura({ imagine, nume, marime = "md" }: { imagine: string | null; nume: string; marime?: keyof typeof MARIMI }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-primary-soft)] ${MARIMI[marime]}`}>
      {imagine ? (
        <Image src={imagine} alt={nume} fill sizes={marime === "sm" ? "44px" : "72px"} className="object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center">
          <Package className="h-5 w-5 text-[var(--st-muted)]" strokeWidth={1.6} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/* ═══ Pastila cu numar (meniu, file) ═══ */

export function Pastila({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--st-primary-soft)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--st-text)]">
      {children}
    </span>
  );
}

/* ═══ Pasii comenzii ═══ */

/**
 * ⚠ Datele apar NUMAI unde le avem (plasarea si AWB-ul): nu exista istoric al
 * starilor, deci o ora pe fiecare pas ar fi inventata. Vezi `cronologie.ts`.
 */
export function PasiComanda({ c }: { c: Cronologie }) {
  if (c.capat) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] px-4 py-3.5">
        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--st-muted)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--st-text)]">{c.capat.eticheta}</p>
          <p className="mt-0.5 text-sm text-[var(--st-muted)]">{c.fraza}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ol className="grid grid-cols-5">
        {c.pasi.map((p, i) => {
          const facut = p.stare === "facut";
          const curent = p.stare === "curent";
          return (
            <li key={p.cheie} className="relative flex flex-col items-center text-center" aria-current={curent ? "step" : undefined}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2"
                  style={{ backgroundColor: facut || curent ? "var(--st-primary)" : "var(--st-border)" }}
                />
              )}
              <span
                className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                  facut || curent ? "" : "border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-muted)]"
                }`}
                style={facut || curent ? { backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" } : undefined}
              >
                {facut ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`mt-2 px-0.5 text-[11px] leading-tight sm:text-xs ${curent || facut ? "font-semibold text-[var(--st-text)]" : "text-[var(--st-muted)]"}`}>
                {p.eticheta}
              </span>
              {p.la && <span className="mt-0.5 hidden text-[11px] text-[var(--st-muted)] sm:block">{formatDate(p.la)}</span>}
              <span className="sr-only">{facut ? "(facut)" : curent ? "(acum)" : "(urmeaza)"}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm text-[var(--st-muted)]">{c.fraza}</p>
    </div>
  );
}
