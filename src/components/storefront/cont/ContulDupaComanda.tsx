"use client";

import Link from "next/link";
import { ArrowRight, CircleUserRound } from "lucide-react";
import { useContulMagazinului } from "./ContulMagazinului";
import { CARD, FOCUS } from "./ui/clase";

/**
 * Drumul spre cont, pe pagina de confirmare a comenzii.
 *
 * ⚠ Numai cand zona de cont exista pe cererea asta (conturi pornite, domeniul
 * propriu, magazin activ), din aceeasi sursa ca butonul din antet. Pe
 * `www.edinio.com/<slug>` nu apare: acolo `/cont` nu exista.
 *
 * ⚠ Si numai cand comanda chiar poate ajunge in cont: cu emailul pe ea (se leaga
 * la intrare, dupa adresa), sau cand magazinul cere cont la comanda (atunci a
 * plecat din cont si s-a legat pe loc). O comanda fara email, trimisa ca
 * vizitator, n-ar aparea acolo, iar cardul ar fi promis ceva fals.
 */
export function ContulDupaComanda({ areEmail }: { areEmail: boolean }) {
  const { aprins, obligatoriu } = useContulMagazinului();
  if (!aprins || !(areEmail || obligatoriu)) return null;
  return (
    <Link
      href="/cont"
      className={`mt-6 flex items-center gap-4 ${CARD} p-4 text-left text-[var(--st-text)] transition-colors hover:bg-[var(--st-primary-soft)] ${FOCUS}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--st-primary-soft)]">
        <CircleUserRound className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Urmareste comanda in contul tau</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--st-muted)]">
          {obligatoriu
            ? "Livrarea, plata si factura, cand e emisa, sunt toate acolo."
            : "Intra cu adresa de email din comanda: vezi livrarea, plata si factura, cand e emisa."}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--st-muted)]" aria-hidden="true" />
    </Link>
  );
}
