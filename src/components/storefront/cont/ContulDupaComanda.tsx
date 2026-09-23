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
      /* Cine a comandat ca vizitator n-are de obicei cont: ajunge direct pe „Cont nou”. Cel logat e trimis de /cont/intra mai departe, in cont. */
      href={obligatoriu ? "/cont" : "/cont/intra?mod=inregistrare"}
      className={`mt-6 flex items-center gap-4 ${CARD} p-4 text-left text-[var(--st-text)] transition-colors hover:bg-[var(--st-primary-soft)] ${FOCUS}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--st-primary-soft)]">
        <CircleUserRound className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Urmareste comanda in contul tau</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--st-muted)]">
          {obligatoriu
            ? "Comenzile plasate din cont apar acolo, cu livrarea, plata si factura, cand e emisa."
            : "Fa-ti un cont (sau intra) cu adresa de email din comanda: vezi livrarea, plata si factura, cand e emisa."}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--st-muted)]" aria-hidden="true" />
    </Link>
  );
}
