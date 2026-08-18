import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SectiuneMigrareText } from "@/lib/website/migrare";
import { SectionEyebrow } from "../SectionEyebrow";

/**
 * Cadrul secțiunilor de pe pagina „Migrare magazin": text pe o parte, panou pe
 * cealaltă, iar părțile se schimbă între ele de la o secțiune la alta.
 *
 * ═══ UN SINGUR CADRU, PATRU SECȚIUNI ═══
 *
 * Vin patru — produse, categorii, comenzi, clienți — și toate au același schelet.
 * Scrise separat, ar fi fost patru copii ale aceluiași lucru, iar prima corectură
 * de spațiere făcută într-una le-ar fi despărțit. Aici se schimbă doar ce e
 * înăuntru: textele vin ca dată, panoul vine ca `children`.
 *
 * ⚠ ALTERNANȚA E O PROPRIETATE, NU O CLASĂ SCRISĂ DE MÂNĂ. `inversat` mută panoul
 * la stânga — și o face din `order`, nu rearanjând marcajul: în cod textul rămâne
 * mereu primul, deci și în ordinea de citire și la tastatură. Cine ajunge pe
 * pagină cu un cititor de ecran aude titlul înaintea ilustrației lui, la toate
 * patru, indiferent cum arată.
 *
 * ⚠ INVERSAREA E DOAR DE LA `lg`. Sub prag totul e pe o coloană, iar acolo textul
 * trebuie să stea SUS la toate secțiunile: pe telefon, o ilustrație pusă înaintea
 * titlului ei e o poză fără explicație, și te pune să derulezi ca să afli ce
 * privești.
 */
export function SectiuneMigrare({
  text,
  children,
  inversat,
  fundal = "alb",
}: {
  text: SectiuneMigrareText;
  /** Panoul din partea cealaltă. */
  children: ReactNode;
  /** De la `lg`: panoul trece în stânga, textul în dreapta. */
  inversat?: boolean;
  /**
   * Fundalul secțiunii.
   *
   * Alternează odată cu părțile, dar NU din simetrie: patru secțiuni albe una
   * după alta se citesc ca o singură bandă lungă, și nu se mai vede unde se
   * termină una. `bg-tint` e destul de aproape de alb cât panourile albe să
   * rămână albe, și destul de deosebit cât să se vadă cusătura.
   */
  fundal?: "alb" | "calm";
}) {
  return (
    <section className={cn(fundal === "calm" ? "bg-tint" : "bg-white")}>
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ── Textul ──────────────────────────────────────────────────── */}
          <div className={cn(inversat && "lg:order-2")}>
            <SectionEyebrow label={text.eticheta} />

            {/*
              `h2`, nu `h3`: secțiunile stau direct sub `h1`-ul din hero, una
              lângă alta, nu una în alta.

              Mărimea e cea de la titlul benzii de final (32 → 44 → 52): sunt
              titluri de secțiune, deci trebuie să arate la fel peste tot pe site.
            */}
            <h2 className="mt-5 text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[38px] lg:text-[44px]">
              {text.titlu}
            </h2>

            <p className="mt-5 max-w-[520px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
              {text.descriere}
            </p>

            {/*
              Butonul are chenar, nu e verde plin: verdele plin e al butonului
              principal, iar pe pagina asta el e deja în hero. Patru butoane verzi
              pline, unul pe secțiune, ar fi făcut din el un element de decor.
            */}
            <Link
              href={text.cta.href}
              className="group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-[8px] border border-hairline px-6 text-[15px] font-semibold text-ink transition-colors duration-200 hover:bg-tint-2"
            >
              {text.cta.label}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* ── Panoul ──────────────────────────────────────────────────── */}
          <div className={cn(inversat && "lg:order-1")}>{children}</div>
        </div>
      </div>
    </section>
  );
}
