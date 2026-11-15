import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import { LegaturaDePanou } from "@/components/dashboard/LegaturaDePanou";
import { logoIntegrare } from "@/components/dashboard/IntegrationHeader";
import { buttonVariants } from "@/components/ui/button";
import { ghidulIntegrarii } from "@/lib/dashboard/ghiduri-integrari";
import { cn } from "@/lib/utils/cn";

/**
 * Antetul paginilor de marketplace (eMAG intai, apoi Trendyol, About You, OLX, Pepita).
 *
 * Cerut de proprietar pe 15.11.2026, dupa ce i-a placut pagina tbi refacuta: „La integrarile cu
 * marketplace-urile fa ceva mai special si premium”. Fata de `PaginaIntegrare` (curieri, facturare,
 * plati), aici sunt trei lucruri in plus:
 *
 *   - sigla partenerului MARE, pe o placa alba, nu o pastila langa titlu;
 *   - o banda cu starea contului (cine e legat, cand s-a citit ultima oara, ce merge singur);
 *   - pozele produselor LUI care chiar sunt acolo: imaginea concreta a integrarii, nu un decor.
 *
 * ⚠ FARA „VIBE CODE” (memoria `design-fara-vibe-code`): fara fonduri translucide in culoarea
 * brandului, fara gradiente, fara cercuri colorate. Cadrul cu chenar dublu e cel din „Texture Card”
 * (Cult UI), pe care l-a ales la bannerele tbi, dar facut din tokenii temei, ca sa mearga si pe
 * tema inchisa a panoului. Culoarea vine din sigla.
 *
 * ⚠ E COMPONENTA DE SERVER, fara "use client": pagina o randeaza o data ca schelet (sigla, titlul
 * si descrierea pleaca imediat, cu benzile goale) si o data plina, dupa ce vine starea contului.
 * Partile statice sunt aceleasi in amandoua, deci la inlocuire nu sare nimic.
 *
 * Textele sunt pentru COMERCIANT: cu diacritice.
 */
export function AntetMarketplace({
  id,
  titlu,
  descriere,
  eticheta = "Marketplace",
  panou,
  stari,
  fapte,
  vitrina,
}: {
  /** Id-ul integrarii: din el vin sigla (`IntegrationHeader`) si ghidul din Ajutor. */
  id: string;
  titlu: string;
  descriere: ReactNode;
  /** Randul mic de deasupra titlului. */
  eticheta?: string;
  /** Legatura catre panoul partenerului (se deschide in alta fila). */
  panou?: { href: string; text: string } | null;
  /** Etichetele de stare de sub descriere (`EtichetaStare`). */
  stari?: ReactNode;
  /** Banda cu starea contului: `FapteMarketplace`. */
  fapte?: ReactNode;
  /** Banda cu pozele produselor: `VitrinaMarketplace`. */
  vitrina?: ReactNode;
}) {
  const logo = logoIntegrare(id);
  const ghid = ghidulIntegrarii(id);

  return (
    <div className="mb-6">
      <LegaturaDePanou
        href="/dashboard/features"
        className="relative mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        clasaInAsteptare="-bottom-0.5 top-auto rounded-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Integrări
      </LegaturaDePanou>

      {/* Chenarul dublu („Texture Card”): o rama neutra plina in jurul cartii, nu o umbra colorata. */}
      <section className="rounded-[22px] border border-border bg-muted p-1 shadow-xs">
        <div className="overflow-hidden rounded-[18px] border border-border bg-card">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              {logo && (
                /* ⚠ Placa e ALBA si pe tema inchisa: siglele partenerilor sunt facute pentru fond deschis. */
                <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-2xl bg-white px-7 ring-1 ring-black/10 sm:w-56">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    className="max-h-12 w-auto max-w-full object-contain"
                    style={logo.filter ? { filter: logo.filter } : undefined}
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{eticheta}</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{titlu}</h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{descriere}</p>
                {stari && <div className="mt-3 flex min-h-6 flex-wrap items-center gap-1.5">{stari}</div>}
              </div>
            </div>

            {(panou || ghid) && (
              <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                {panou && (
                  <a href={panou.href} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
                    {panou.text}
                    <ArrowUpRight data-icon="inline-end" />
                  </a>
                )}
                {ghid && (
                  <a href={ghid} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "ghost" }))}>
                    <BookOpen data-icon="inline-start" />
                    Ghidul integrării
                  </a>
                )}
              </div>
            )}
          </div>

          {fapte}
          {vitrina}
        </div>
      </section>
    </div>
  );
}

export type FaptMarketplace = { eticheta: string; valoare: ReactNode; detaliu?: ReactNode };

/**
 * Banda cu starea contului, sub antet: patru casute despartite de linii fine.
 *
 * ⚠ PATRU, nu oricate: grila e `grid-cols-2` pe telefon si `lg:grid-cols-4` pe ecran lat, scrise
 * literal (Tailwind nu vede clase compuse la rulare). Liniile dintre casute vin din `gap-px` peste
 * fondul `bg-border`, deci un numar impar ar lasa o casuta goala, gri.
 */
export function FapteMarketplace({ fapte }: { fapte: FaptMarketplace[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px border-t border-border bg-border lg:grid-cols-4">
      {fapte.map((f) => (
        <div key={f.eticheta} className="min-w-0 bg-card px-5 py-4 sm:px-6">
          <dt className="text-xs text-muted-foreground">{f.eticheta}</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-foreground">{f.valoare}</dd>
          {f.detaliu && <dd className="mt-0.5 truncate text-xs text-muted-foreground">{f.detaliu}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Banda goala de aceeasi inaltime, cat se citeste starea: la inlocuire nu sare nimic. */
export function FapteMarketplaceSchelet() {
  return (
    <div className="grid grid-cols-2 gap-px border-t border-border bg-border lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-card px-5 py-4 sm:px-6">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * Pozele produselor care sunt pe marketplace acum. Imaginea concreta a integrarii: comerciantul isi
 * vede chiar marfa acolo, nu o ilustratie.
 *
 * ⚠ 56 × 56, ca miniaturile din lista de produse (`ProductsClient`). Pozele trec prin taietorul de la
 * marginea Cloudflare, care se plateste pe fiecare LATIME noua (vezi `images` din `next.config.ts`):
 * aceeasi marime ca acolo nu cere nicio transformare in plus.
 */
export function VitrinaMarketplace({ titlu, poze, rest, legatura }: {
  titlu: string;
  poze: { src: string; alt: string }[];
  /** Ce nu incape in banda, scris pentru om („și încă 3.748 de oferte"). */
  rest?: string | null;
  /** Unde duce banda (de obicei fila cu ofertele). */
  legatura?: { href: string; text: string } | null;
}) {
  if (poze.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-5 py-4 sm:px-6">
      <p className="text-xs font-medium text-muted-foreground">{titlu}</p>
      <ul className="flex flex-wrap gap-2">
        {poze.map((p) => (
          <li key={p.src}>
            <Image
              src={p.src}
              alt={p.alt}
              width={56}
              height={56}
              className="h-11 w-11 rounded-lg border border-border bg-white object-cover"
            />
          </li>
        ))}
      </ul>
      {rest && <span className="text-xs text-muted-foreground">{rest}</span>}
      {legatura && (
        <a href={legatura.href} className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline sm:ml-auto">
          {legatura.text}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
