import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Firimitura } from "@/lib/website/breadcrumbs";

/**
 * Șirul de firimituri: unde ești în site, ca rând mic deasupra titlului.
 *
 * Regula (ce e link, ce nu, ce merge către Google) stă în
 * `lib/website/breadcrumbs.ts` și e probată acolo. Aici e doar desenul.
 *
 * ═══ DE CE `<ol>`, NU UN RÂND DE `<span>`-URI ═══
 *
 * E o listă ORDONATĂ: „Acasă" vine înaintea lui „Întrebări frecvente", și asta
 * e chiar informația. Un cititor de ecran anunță „listă cu 2 elemente" și le
 * numără; un rând de span-uri despărțite prin săgeți se citește ca o propoziție
 * ciudată, cu tot cu săgeți.
 *
 * `role="list"` explicit: preflight-ul Tailwind pune `list-style: none`, iar
 * Safari scoate atunci rolul implicit. Aceeași capcană ca la benzile de sigle
 * din `IntegrationsBenzi.tsx`.
 *
 * ═══ SĂGEATA E `aria-hidden`, ȘI NU E O LITERĂ ═══
 *
 * Despărțitorul e desen, nu conținut. Scris ca „/" sau „›" într-un `<li>`, ar
 * fi citit cu voce tare între fiecare două pagini.
 */
export function Breadcrumbs({ sir }: { sir: Firimitura[] }) {
  return (
    <nav aria-label="Unde te afli">
      {/*
        `gap-y-1.5` (6px), nu `gap-y-1`: pe telefon șirul chiar se rupe pe două
        rânduri, iar 4px între ele le lipeau unul de altul.
      */}
      <ol role="list" className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        {sir.map((f, i) => {
          const ultima = i === sir.length - 1;
          return (
            <li
              key={`${f.label}-${i}`}
              /*
                `min-w-0` doar pe ULTIMA: fără el, un titlu lung nu se poate
                strânge sub lățimea lui naturală, iar `truncate` de pe span n-ar
                avea de unde tăia. Celelalte firimituri sunt scurte și rămân
                întregi.
              */
              className={cn("flex items-center gap-x-1.5", ultima && "min-w-0 max-w-full")}
            >
              {i > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  strokeWidth={2}
                  className="h-3.5 w-3.5 shrink-0 text-ink-3/70"
                />
              ) : null}

              {ultima || !f.href ? (
                /*
                  Pagina curentă: text, nu link. `aria-current="page"` e ce
                  spune „aici ești" cititoarelor de ecran — fără el, ultima
                  firimitură e doar încă un cuvânt.
                */
                /*
                  ⚠ TĂIATĂ LA UN RÂND PE TELEFON. Titlul articolului e ultima
                  firimitură, iar pe un ecran de 390px el se rupea pe DOUĂ rânduri
                  — deci șirul lua trei rânduri cu totul, cu săgeata rămasă
                  singură la început de rând. Exact înghesuiala din captura de la
                  01.09.2026.

                  Se taie doar sub `sm`: de acolo în sus e loc, iar un titlu
                  întreg e mai folositor decât unul cu trei puncte.

                  ⚠ NU SE PIERDE NIMIC PENTRU MOTOARE: șirul plecă separat, ca
                  JSON-LD, din `PageHero` — tăierea e doar desen. Iar `title` dă
                  textul întreg la ținerea degetului pe el.
                */
                <span
                  aria-current="page"
                  title={f.label}
                  className="truncate text-[13px] font-medium text-ink sm:overflow-visible sm:whitespace-normal"
                >
                  {f.label}
                </span>
              ) : (
                <Link
                  href={f.href}
                  className="rounded-[4px] text-[13px] text-ink-3 transition-colors duration-200 hover:text-ink-2"
                >
                  {f.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
