"use client";

import type { CSSProperties } from "react";
import { ChevronUp } from "lucide-react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { MarcajBloc } from "@/components/storefront/MarcajBloc";
import { FooterCredit, FooterLegal } from "@/components/storefront/sections/_shared/FooterLegal";
import { coloaneVazute, culoriSubsol, etichetaColoanei, inapoiSusPornit, sablonColoane, textCopyright } from "@/lib/storefront/design/subsol";
import type { SectionInstance } from "@/lib/storefront/design/types";
import { ColoanaSubsol, type StilColoane } from "./FooterColumns";
import { FormularNewsletterSubsol, sir } from "./subsol-coloane";

/** Coloanele, cu titlurile mari si linkurile gri, ca pe modelul temei. */
const STIL: StilColoane = {
  separator: "border-[var(--st-border)]",
  marunt: "text-[var(--st-muted)]",
  inchis: false,
  titlu: "text-[15px] font-semibold text-[var(--st-text)]",
  legatura: "flex items-start gap-2 text-[13px] text-[var(--st-muted)] hover:text-[var(--st-primary)] transition-colors",
};

/** Banda gri a coloanelor: un gri scos din culorile magazinului, deci ramane potrivit si pe alt fond. */
const GRI = "color-mix(in srgb, var(--st-text) 4%, var(--st-bg))";

/**
 * Subsolul temei Jupiter, varianta „hipermarket” (etapa 16.2 din `docs/editor-magazin/PLAN.md`), dupa dedeman.ro:
 * bara „Înapoi sus” in culoarea principala, banda cu newsletterul (titlu mare, camp si buton lipite), coloanele pe gri,
 * apoi partea legala si randul de copyright.
 *
 * Coloanele sunt aceleasi blocuri ca la celelalte subsoluri (etapa 11): newsletterul, daca exista, urca in banda lui,
 * restul stau pe gri. `FooterLegal` si `FooterCredit` sunt obligatorii, ca in orice varianta.
 */
export function FooterHipermarket({ sectiune }: { sectiune: SectionInstance }) {
  const { business, hasStickyBottomBar } = useStoreChrome();
  const nume = business.store_name ?? business.business_name;
  const coloane = coloaneVazute(sectiune);
  const newsletter = coloane.find((c) => c.type === "newsletter") ?? null;
  const restul = coloane.filter((c) => c !== newsletter);
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-6" : "pb-6";

  return (
    <footer className="bg-[var(--st-surface)] text-[var(--st-text)]" style={culoriSubsol(sectiune) as CSSProperties | undefined}>
      {inapoiSusPornit(sectiune) && (
        // Buton, nu ancora: nu e o destinatie (vezi `FooterCentered`).
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="w-full h-[38px] flex items-center justify-center gap-1.5 text-[15px] font-semibold hover:opacity-95 transition-opacity"
          style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
          Înapoi sus
          <ChevronUp className="h-4 w-4" strokeWidth={2.4} />
        </button>
      )}

      {newsletter && (
        <div className="mx-auto px-4 py-8" style={{ maxWidth: "var(--st-container)" }}>
          <MarcajBloc idSectiune={sectiune.id} idBlocului={newsletter.id} eticheta={etichetaColoanei(newsletter)}>
            <div className="max-w-2xl">
              <p className="text-[20px] leading-snug text-[var(--st-text)]" style={{ fontFamily: "var(--st-font-heading)" }}>
                {sir(newsletter.settings.titlu) || "Abonează-te la newsletter și bucură-te de promoții."}
              </p>
              {sir(newsletter.settings.text) && <p className="mt-2 text-[14px] text-[var(--st-muted)]">{sir(newsletter.settings.text)}</p>}
              <div className="mt-2">
                <FormularNewsletterSubsol coloana={newsletter} idSubsol={sectiune.id} marunt="text-[var(--st-muted)]" inchis={false} lipit />
              </div>
            </div>
          </MarcajBloc>
        </div>
      )}

      {restul.length > 0 && (
        <div style={{ backgroundColor: GRI }}>
          <div className="mx-auto px-4 py-10 grid gap-8 md:grid-cols-2 lg:grid-cols-[var(--coloane-subsol)]"
            style={{ maxWidth: "var(--st-container)", "--coloane-subsol": sablonColoane(restul) } as CSSProperties}>
            {restul.map((c) => (
              <MarcajBloc key={c.id} idSectiune={sectiune.id} idBlocului={c.id} eticheta={etichetaColoanei(c)}>
                <ColoanaSubsol coloana={c} idSubsol={sectiune.id} stil={STIL} />
              </MarcajBloc>
            ))}
          </div>
        </div>
      )}

      <div className={`mx-auto px-4 ${spatiuJos}`} style={{ maxWidth: "var(--st-container)" }}>
        <FooterLegal ton="deschis" cuPagini={false} />
        <div className="border-t border-[var(--st-border)]">
          <FooterCredit ton="deschis" text={textCopyright(sectiune, nume)} />
        </div>
      </div>
    </footer>
  );
}
