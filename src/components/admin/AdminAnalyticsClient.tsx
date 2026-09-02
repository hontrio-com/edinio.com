"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ExternalLink } from "lucide-react";
import type { DateAnalytics, Linie } from "@/lib/admin-analytics/rapoarte";
import { PERIOADE, type NumePerioada } from "@/lib/admin-analytics/perioade";
import { ButonDeconectareGa4 } from "./ButonConectareGa4";

/*
  Rapoartele de trafic ale EDINIO. Ce vand comerciantii se vede in
  `/admin/statistici`, din baza noastra; aici e cine ne viziteaza pe noi.
*/

function nr(x: number): string {
  return new Intl.NumberFormat("ro-RO").format(Math.round(x));
}

function durata(secunde: number): string {
  const m = Math.floor(secunde / 60);
  const s = Math.round(secunde % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Cresterea fata de perioada dinainte.
 *
 * ⚠ `null` NU E ZERO. Cand inainte era 0, cresterea nu se poate imparti — se
 * arata o liniuta, nu „0%", care ar parea o masuratoare.
 */
function Variatie({ procent }: { procent: number | null }) {
  if (procent === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Perioada dinainte a fost zero: variatia nu se poate calcula">
        <Minus className="h-3 w-3" /> fara termen de comparatie
      </span>
    );
  }
  const urca = procent >= 0;
  const Icon = urca ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${urca ? "text-primary" : "text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {urca ? "+" : ""}{procent.toFixed(1)}% fata de perioada dinainte
    </span>
  );
}

function Card({ titlu, valoare, subsol }: { titlu: string; valoare: string; subsol?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{titlu}</p>
      <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">{valoare}</p>
      {subsol && <div className="mt-1.5">{subsol}</div>}
    </div>
  );
}

function Tabel({
  titlu, linii, coloana, gol, formatCheie,
}: {
  titlu: string;
  linii: Linie[];
  coloana: string;
  gol: string;
  formatCheie?: (c: string) => string;
}) {
  const total = linii.reduce((s, l) => s + l.a, 0);
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{titlu}</h3>
      </div>
      {linii.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{gol}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium px-5 py-2">Nume</th>
                <th className="text-right font-medium px-5 py-2 whitespace-nowrap">{coloana}</th>
                <th className="text-right font-medium px-5 py-2 w-16">%</th>
              </tr>
            </thead>
            <tbody>
              {linii.map((l) => (
                <tr key={l.cheie} className="border-t border-border/60">
                  <td className="px-5 py-2 text-foreground truncate max-w-[22rem]" title={l.cheie}>
                    {formatCheie ? formatCheie(l.cheie) : l.cheie}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-foreground">{nr(l.a)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">
                    {total > 0 ? `${((l.a / total) * 100).toFixed(0)}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminAnalyticsClient({
  date, perioada, proprietate, timpReal,
}: {
  date: DateAnalytics;
  perioada: NumePerioada;
  proprietate: { nume?: string; masurare?: string; email?: string };
  timpReal: number | null;
}) {
  const { rezumat } = date;

  return (
    <div className="space-y-6">
      {/* ── Antet: perioada si proprietatea ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Trafic Edinio</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {proprietate.nume ?? "Proprietate GA4"}
            {proprietate.masurare ? ` (${proprietate.masurare})` : ""}
            {timpReal !== null && (
              <>
                {" - "}
                <span className="text-primary font-medium">{nr(timpReal)} acum pe site</span>
              </>
            )}
          </p>
          <div className="mt-1"><ButonDeconectareGa4 email={proprietate.email} /></div>
        </div>

        <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
          {(Object.keys(PERIOADE) as NumePerioada[]).map((p) => (
            <Link
              key={p}
              href={`/admin/analytics?p=${p}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                p === perioada ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOADE[p].eticheta}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Ce n-a mers ──────────────────────────────────────────────────── */}
      {date.probleme.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-4">
          <div className="flex gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-sm text-amber-900 dark:text-amber-200">
              {date.probleme.map((p) => <p key={p}>{p}</p>)}
            </div>
          </div>
        </div>
      )}

      {/* ── Cifrele de sus ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card titlu="Utilizatori" valoare={nr(rezumat.utilizatori)} subsol={<Variatie procent={rezumat.crestereUtilizatori} />} />
        <Card titlu="Sesiuni" valoare={nr(rezumat.sesiuni)} subsol={<Variatie procent={rezumat.crestereSesiuni} />} />
        <Card
          titlu="Utilizatori noi"
          valoare={nr(rezumat.utilizatoriNoi)}
          subsol={
            <span className="text-xs text-muted-foreground">
              {rezumat.utilizatori > 0 ? `${((rezumat.utilizatoriNoi / rezumat.utilizatori) * 100).toFixed(0)}% din total` : "-"}
            </span>
          }
        />
        <Card
          titlu="Angajament"
          valoare={`${rezumat.rataAngajare.toFixed(0)}%`}
          subsol={<span className="text-xs text-muted-foreground">sesiune medie {durata(rezumat.durataMedie)}</span>}
        />
      </div>

      {/* ── Conversiile ──────────────────────────────────────────────────── */}
      <Tabel
        titlu="Conversii"
        linii={date.conversii}
        coloana="Numar"
        gol="Nicio conversie in perioada asta. Daca site-ul are trafic, verifica in GA4 ca evenimentele ajung (Admin -> DebugView)."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Tabel titlu="De unde vin" linii={date.achizitie} coloana="Sesiuni" gol="Nimic inca." />
        <Tabel titlu="Surse" linii={date.surse} coloana="Sesiuni" gol="Nimic inca." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Tabel titlu="Cele mai vazute pagini" linii={date.pagini} coloana="Vizualizari" gol="Nimic inca." />
        {date.grupuriPagini
          ? <Tabel titlu="Pe grupuri de pagini" linii={date.grupuriPagini} coloana="Vizualizari" gol="Nimic inca." />
          : (
            <div className="bg-surface border border-border border-dashed rounded-2xl p-5 flex flex-col justify-center">
              <h3 className="text-sm font-semibold text-foreground">Pe grupuri de pagini</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Cere dimensiunea personalizata <code className="text-xs">page_group</code> in GA4.
                Se face o singura data si nu strica nimic din ce e mai sus.
              </p>
              <a
                href="https://analytics.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Deschide GA4 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Tabel titlu="Butoane apasate" linii={date.cta} coloana="Apasari" gol="Niciun cta_id inca." />
        <Tabel titlu="Formulare" linii={date.formulare} coloana="Numar" gol="Nimic inca." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Tabel titlu="Blog" linii={date.blog} coloana="Numar" gol="Nimic inca." />
        <div className="grid grid-cols-1 gap-6">
          <Tabel titlu="Dispozitive" linii={date.dispozitive} coloana="Sesiuni" gol="Nimic inca." />
          <Tabel titlu="Tari" linii={date.tari} coloana="Sesiuni" gol="Nimic inca." />
        </div>
      </div>
    </div>
  );
}
