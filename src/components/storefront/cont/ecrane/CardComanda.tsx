import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";
import type { ComandaDinCont } from "@/lib/cont/comenzi";
import { stareaComenzii } from "@/lib/cont/stare-comanda";
import { formatDate, formatPrice, pluralRo } from "@/lib/utils/format";
import { EtichetaStareCont, Miniatura } from "../ui/piese";
import { CARD, FOCUS } from "../ui/clase";

/**
 * O comanda in lista: miniaturile produselor, numarul, data, cate bucati, totalul
 * si starea. Aceeasi forma pe telefon si pe desktop, fara ramura separata.
 *
 * ⚠ „N produse" numara BUCATILE de marfa, fara extraoptiuni: inainte numara
 * liniile, cu tot cu ambalajul cadou.
 */
export function CardComanda({ c }: { c: ComandaDinCont }) {
  const st = stareaComenzii(c.stare);
  const alte = Math.max(0, c.produse - c.miniaturi.length);
  const alteMobil = Math.max(0, c.produse - Math.min(3, c.miniaturi.length));
  const primul = c.miniaturi[0]?.nume ?? "";
  return (
    <Link
      href={`/cont/comenzi/${c.orderId}`}
      className={`${CARD} group block p-4 transition-colors hover:border-[var(--st-muted)] sm:p-5 ${FOCUS}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tabular-nums text-[var(--st-text)]">Comanda {c.numar}</p>
          <p className="mt-0.5 text-sm text-[var(--st-muted)]">
            {formatDate(c.creataLa)}
            {c.bucati > 0 && <> · {pluralRo(c.bucati, "produs", "produse")}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-semibold tabular-nums text-[var(--st-text)]">{formatPrice(c.total)}</span>
          <EtichetaStareCont ton={st.ton}>{st.label}</EtichetaStareCont>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {/* ⚠ Pe telefon incap TREI miniaturi (patru plus „+N” ieseau din card la 320-375px). */}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {c.miniaturi.map((m, i) => (
            <span key={i} className={i >= 3 ? "hidden shrink-0 sm:block" : "shrink-0"}>
              <Miniatura imagine={m.imagine} nume={m.nume} marime="sm" />
            </span>
          ))}
          {alteMobil > 0 && (
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[min(var(--st-radius-sm),0.5rem)] border border-[var(--st-border)] text-xs font-semibold text-[var(--st-muted)] sm:hidden`}>
              +{alteMobil}
            </span>
          )}
          {alte > 0 && (
            <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-[min(var(--st-radius-sm),0.5rem)] border border-[var(--st-border)] text-xs font-semibold text-[var(--st-muted)] sm:grid">
              +{alte}
            </span>
          )}
          {c.miniaturi.length === 1 && alte === 0 && (
            <span className="min-w-0 truncate text-sm text-[var(--st-muted)]">{primul}</span>
          )}
        </div>
        {c.areFactura && (
          <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-[var(--st-muted)] sm:inline-flex">
            <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
            Factura
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--st-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}
