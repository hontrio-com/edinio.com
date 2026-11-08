"use client";

import type { CSSProperties } from "react";
import { ArrowUp, ShieldCheck } from "lucide-react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { MarcajBloc } from "@/components/storefront/MarcajBloc";
import { FooterCredit, FooterLegal } from "@/components/storefront/sections/_shared/FooterLegal";
import { coloaneVazute, culoriSubsol, etichetaColoanei, inapoiSusPornit, textCopyright } from "@/lib/storefront/design/subsol";
import { insigneDeAratat } from "@/lib/storefront/insigne-implicite";
import type { SectionInstance } from "@/lib/storefront/design/types";
import { ColoanaSubsol, type StilColoane } from "./FooterColumns";
import { TRUST_ICONS } from "./UspStripIcons";
import { amestecHex, raportContrast } from "@/lib/storefront/design/css-vars";

/** Fundalul: o noapte scoasa din culoarea principala, deci ramane potrivit si cand magazinul o schimba din „Stil”. */
const FUNDAL = "color-mix(in srgb, var(--st-primary) 36%, #070B14)";
/** Banda de jos, cu partea legala: acelasi fundal, cu o treapta mai inchis. Pe culorile alese de el, la fel. */
const FUNDAL_JOS = "color-mix(in srgb, var(--st-footer-bg) 78%, #000)";

/** Coloanele: titluri cu o linie scurta in culoarea de accent, linkuri deschise care se aprind sub mouse. */
const STIL: StilColoane = {
  separator: "border-[var(--st-footer-text)]/10",
  marunt: "text-[var(--st-footer-text)]/65",
  inchis: true,
  titlu: "text-[15px] font-semibold tracking-wide text-[var(--st-footer-text)] md:after:block md:after:mt-2.5 md:after:h-0.5 md:after:w-8 md:after:bg-[var(--st-accent)]",
  legatura: "flex items-start gap-2.5 text-[14px] text-[var(--st-footer-text)]/70 hover:text-[var(--st-footer-text)] transition-colors",
  placaSigla: true,
};

/**
 * Subsolul temei Jupiter, varianta „hipermarket” (refacut la etapa 21 din `docs/editor-magazin/PLAN.md`, cererea lui:
 * „Fa tot footer ul mult mai premium si zona aia de newsletter scoate o”): fundal inchis cu linia de accent sus,
 * beneficiile, coloanele cu sigla pe placa alba, apoi partea legala si copyrightul pe o banda mai inchisa.
 *
 * Beneficiile sunt insignele magazinului (`store_trust_badges`, aceleasi ca „Beneficii pe scurt”), nu texte ale temei:
 * sunt promisiuni ale LUI, deci le schimba si le poate stinge. Coloanele sunt aceleasi blocuri ca la celelalte subsoluri
 * (etapa 11); un „Newsletter” pus de om ramane o coloana ca oricare alta. `FooterLegal` si `FooterCredit` sunt
 * obligatorii, ca in orice varianta.
 */
export function FooterHipermarket({ sectiune }: { sectiune: SectionInstance }) {
  const { business, hasStickyBottomBar, pageContent, color, design } = useStoreChrome();
  const nume = business.store_name ?? business.business_name;
  const coloane = coloaneVazute(sectiune);
  const beneficii = sectiune.settings.beneficii !== false ? insigneDeAratat(pageContent.store_trust_badges) : [];
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-6" : "pb-6";
  // Culorile alese (etapa 11) cad peste ale variantei; partea legala trece atunci pe tonul care le citeste.
  const culori = culoriSubsol(sectiune);
  const tonLegal = culori ? "deschis" : "inchis";
  /*
   * Accentul pe fondul de noapte: un accent inchis (tema Achernar, #1F1F1F) facea iconitele beneficiilor si cuvantul
   * „Edinio” nevazute (1,09:1 si 1,00:1, gasit la proba). Sub 3:1 fata de fond, in subsol accentul devine alb.
   */
  const accent = design?.style?.colors?.accent ?? color;
  const fondAprox = amestecHex(color, "#070B14", 0.36);
  const accentSters = !culori && (raportContrast(accent, fondAprox) ?? 3) < 3;
  const radacina = {
    "--st-footer-bg": FUNDAL, "--st-footer-text": "#FFFFFF",
    ...(accentSters ? { "--st-accent": "#FFFFFF", "--st-accent-contrast": "#111827" } : {}),
    ...culori,
  } as CSSProperties;

  return (
    <footer className="bg-[var(--st-footer-bg)] text-[var(--st-footer-text)]" style={radacina}>
      <div aria-hidden className="h-1" style={{ backgroundColor: "var(--st-accent)" }} />

      {inapoiSusPornit(sectiune) && (
        <div className="relative mx-auto px-4" style={{ maxWidth: "var(--st-container)" }}>
          {/* Buton, nu ancora: nu e o destinatie (vezi `FooterCentered`). */}
          <button type="button" aria-label="Inapoi sus" title="Inapoi sus" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="absolute z-10 right-4 -top-[26px] w-12 h-12 rounded-full flex items-center justify-center shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
            <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </div>
      )}

      {beneficii.length > 0 && (
        <div className="border-b border-[var(--st-footer-text)]/10">
          <ul className="mx-auto px-4 py-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" style={{ maxWidth: "var(--st-container)" }}>
            {beneficii.map((b, i) => {
              const Icon = TRUST_ICONS[b.icon] ?? ShieldCheck;
              return (
                <li key={i} className="flex items-center gap-3.5 min-w-0">
                  <span className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "color-mix(in srgb, var(--st-accent) 16%, transparent)", color: "var(--st-accent)" }}>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold leading-snug">{b.title}</span>
                    <span className="block mt-0.5 text-[13px] leading-snug text-[var(--st-footer-text)]/65">{b.desc}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {coloane.length > 0 && (
        // Pistele se fac din ce se deseneaza: cu un sablon scris dupa lista coloanelor, una fara continut („Informatii”
        // la un magazin fara pagini) isi tinea locul, iar dreapta subsolului ramanea goala.
        <div className="mx-auto px-4 pt-12 pb-14 grid gap-9 md:grid-cols-2 lg:grid-cols-none lg:grid-flow-col lg:auto-cols-fr lg:gap-12"
          style={{ maxWidth: "var(--st-container)" }}>
          {coloane.map((c) => (
            <MarcajBloc key={c.id} idSectiune={sectiune.id} idBlocului={c.id} eticheta={etichetaColoanei(c)}>
              <ColoanaSubsol coloana={c} idSubsol={sectiune.id} stil={STIL} />
            </MarcajBloc>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: FUNDAL_JOS }}>
        <div className={`mx-auto px-4 ${spatiuJos}`} style={{ maxWidth: "var(--st-container)" }}>
          <FooterLegal ton={tonLegal} cuPagini={false} />
          <div className="border-t border-[var(--st-footer-text)]/10">
            <FooterCredit ton={tonLegal} text={textCopyright(sectiune, nume)} culoareEdinio="var(--st-accent)" />
          </div>
        </div>
      </div>
    </footer>
  );
}
