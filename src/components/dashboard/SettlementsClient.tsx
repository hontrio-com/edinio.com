"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, Undo2 } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";

export interface SettlementRow {
  id: string;
  courier: string;
  awbNumber: string;
  awbDate: string | null;
  transferDate: string;
  transactionDate: string | null;
  amount: number;
  content: string | null;
  returnAwbNumber: string | null;
  recipientName: string | null;
  recipientLocality: string | null;
  orderId: string | null;
}

/** Tabelul e generic pe `courier`; azi il foloseste doar FAN, dar numele se arata ca atare. */
const NUME_CURIER: Record<string, string> = {
  fancourier: "FAN Courier",
};

const PERIOADE = [
  { zile: 30, eticheta: "30 de zile" },
  { zile: 90, eticheta: "90 de zile" },
  { zile: 0, eticheta: "Tot" },
] as const;

/**
 * ⚠ O ZI CALENDARISTICA NU E UN MOMENT.
 *
 * `new Date("2026-09-13")` inseamna miezul noptii UTC, deci intr-un fus negativ se afiseaza
 * ziua precedenta. Pentru o zi de virare, asta ar muta banii cu o zi fata de extrasul de banca,
 * exact acolo unde omul compara cifra cu cifra. Cu ora adaugata, sirul se citeste LOCAL si
 * ramane ziua scrisa.
 */
function ziRo(zi: string | null): string {
  if (!zi) return "-";
  const d = new Date(`${zi}T00:00:00`);
  return Number.isNaN(d.getTime()) ? zi : d.toLocaleDateString("ro-RO");
}

function inUltimeleZile(zi: string, zile: number): boolean {
  if (zile <= 0) return true;
  const d = new Date(`${zi}T00:00:00`).getTime();
  if (Number.isNaN(d)) return true;
  return d >= Date.now() - zile * 86400000;
}

export function SettlementsClient({
  settlements, totalRanduri, limita,
}: {
  settlements: SettlementRow[];
  totalRanduri: number;
  limita: number;
}) {
  const [zile, setZile] = useState<number>(90);

  const randuri = settlements.filter((s) => inUltimeleZile(s.transferDate, zile));
  const total = randuri.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  /* ⚠ Lista a fost taiata la server? Atunci totalul de mai jos NU e tot, si se spune. */
  const taiata = totalRanduri > limita;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Decontari</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Banii incasati de curier la livrare si virati in contul tau.
          </p>
        </div>
      </div>

      {settlements.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Banknote className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nicio decontare inca</p>
          <p className="text-xs text-muted-foreground">
            Aici apar virarile curierului, pe masura ce el incaseaza rambursul si iti trimite banii.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              {PERIOADE.map((p) => (
                <button
                  key={p.zile}
                  type="button"
                  onClick={() => setZile(p.zile)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    zile === p.zile
                      ? "border-primary bg-primary/[0.06] text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.eticheta}
                </button>
              ))}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-foreground">{formatPrice(total)}</p>
              {/* ⚠ Se spune PESTE CE s-a socotit. Un total fara numitor e o cifra in care omul
                  are incredere fara sa stie ce cuprinde. */}
              <p className="text-[11px] text-muted-foreground">
                {randuri.length} {randuri.length === 1 ? "virare" : "virari"}
                {zile > 0 ? ` in ultimele ${zile} de zile` : " in total"}
              </p>
            </div>
          </div>

          {taiata && (
            <p className="text-[11px] text-muted-foreground mb-3 px-3 py-2 rounded-lg border border-dashed border-border">
              Se arata cele mai recente {limita} virari din {totalRanduri}. Totalul de mai sus le
              cuprinde doar pe acestea.
            </p>
          )}

          <div className="space-y-3">
            {randuri.map((r) => (
              <div key={r.id} className="p-4 ring-1 ring-foreground/10 rounded-xl bg-card">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      AWB {r.awbNumber}
                      {r.returnAwbNumber && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Undo2 className="h-3 w-3" />retur {r.returnAwbNumber}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {NUME_CURIER[r.courier] ?? r.courier} · virat {ziRo(r.transferDate)}
                      {r.transactionDate ? ` · incasat ${ziRo(r.transactionDate)}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-foreground shrink-0">{formatPrice(r.amount)}</p>
                </div>

                {(r.recipientName || r.recipientLocality) && (
                  <p className="text-xs text-muted-foreground">
                    {[r.recipientName, r.recipientLocality].filter(Boolean).join(", ")}
                  </p>
                )}

                {/* ⚠ Legatura cu comanda lipseste cand AWB-ul a fost emis din afara platformei.
                    Se spune, in loc sa para o scapare. */}
                {r.orderId ? (
                  <Link href={`/dashboard/orders?q=${encodeURIComponent(r.awbNumber)}`}
                    className="text-xs text-primary hover:underline mt-2 inline-block">
                    Vezi comanda
                  </Link>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Fara comanda in Edinio: AWB emis din afara platformei.
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
