"use client";

import type { CSSProperties, ReactNode } from "react";
import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { MarcajBloc } from "@/components/storefront/MarcajBloc";
import { FooterCredit, FooterLegal } from "@/components/storefront/sections/_shared/FooterLegal";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { stilSigla } from "@/lib/storefront/logo-box";
import { coloaneVazute, culoriSubsol, etichetaColoanei, inapoiSusPornit, textCopyright } from "@/lib/storefront/design/subsol";
import type { BlockInstance, SectionInstance } from "@/lib/storefront/design/types";
import { FormularNewsletterSubsol, ImagineSubsol, MesajGol, sir, useLinkuriColoanei } from "./subsol-coloane";

/**
 * Footer centrat, varianta „centered".
 *
 * Opusul celui pe coloane: nu organizeaza, ci incheie. Logo mare la mijloc, o
 * singura linie de legaturi, contactul si retelele — atat. Potrivit magazinelor
 * cu putine pagini, unde patru coloane ar fi patru liste de cate doua randuri.
 * Din etapa 11 (`docs/editor-magazin/PLAN.md`) „coloanele” sunt randuri, unul
 * sub altul, in ordinea aleasa de om; fara nimic salvat, cele de dinainte, cu
 * acelasi marcaj: logo-ul, paginile, contactul, retelele.
 *
 * Blocul legal ramane la fel de complet, doar ca sub o linie de separare, ca sa
 * nu incarce partea de sus.
 *
 * `FooterLegal` si `FooterCredit` sunt compuse obligatoriu — vezi comentariul de
 * acolo pentru ce contin si de ce nu pot lipsi din nicio varianta.
 */
export function FooterCentered({ sectiune }: { sectiune: SectionInstance }) {
  const { business, hasStickyBottomBar } = useStoreChrome();
  const nume = business.store_name ?? business.business_name;
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-8" : "pb-8";
  const coloane = coloaneVazute(sectiune);

  return (
    <footer className="bg-[var(--st-surface)] text-[var(--st-text)] border-t border-[var(--st-border)]" style={culoriSubsol(sectiune) as CSSProperties | undefined}>
      <div className={`max-w-6xl mx-auto px-5 pt-12 sm:pt-14 ${spatiuJos}`}>
        <div className="flex flex-col items-center text-center gap-5">
          {coloane.map((c) => (
            <MarcajBloc key={c.id} idSectiune={sectiune.id} idBlocului={c.id} eticheta={etichetaColoanei(c)}>
              <RandCentrat coloana={c} idSubsol={sectiune.id} />
            </MarcajBloc>
          ))}

          {/* Subsolul unei pagini lungi e cel mai departe de meniu; scurtatura
              inapoi sus costa un rand si scuteste o derulare intreaga.
              Buton, nu ancora: nu e o destinatie, iar un `href="#"` ar lasa un
              al doilea URL pentru aceeasi pagina si ar sari brusc sus. */}
          {inapoiSusPornit(sectiune) && (
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors">
              <ArrowUp className="h-3.5 w-3.5" />
              Inapoi sus
            </button>
          )}
        </div>

        <div className="mt-10 border-t border-[var(--st-border)]">
          {/* Paginile apar, cand le vrea, intr-un rand „Linkuri”. */}
          <FooterLegal ton="deschis" cuPagini={false} />
          <div className="border-t border-[var(--st-border)]">
            <FooterCredit ton="deschis" text={textCopyright(sectiune, nume)} />
          </div>
        </div>
      </div>
    </footer>
  );
}

const TITLU = "text-[11px] font-semibold uppercase tracking-widest text-[var(--st-muted)]";
const MARUNT = "text-[var(--st-muted)]";

/** Titlul unui rand, cand are; randul ramane altfel exact ca inainte (fara invelis). */
function CuTitlu({ titlu, children }: { titlu: string; children: ReactNode }) {
  if (!titlu) return <>{children}</>;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className={TITLU}>{titlu}</p>
      {children}
    </div>
  );
}

/** Un rand al subsolului centrat, dupa tipul coloanei: copiii lui stau direct in coloana cu `gap-5`. */
function RandCentrat({ coloana, idSubsol }: { coloana: BlockInstance; idSubsol: string }) {
  const { business, basePath, pageContent, social, esteEditorDesign } = useStoreChrome();
  const linkuri = useLinkuriColoanei(coloana);
  const s = coloana.settings;
  const titlu = sir(s.titlu);
  const nume = business.store_name ?? business.business_name;
  const retele = areSocialLinks(social) ? (
    <div className="flex items-center justify-center gap-2">
      <SocialLinks social={social}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-75"
        iconClass="h-[18px] w-[18px]" />
    </div>
  ) : null;
  const contact = "inline-flex items-center gap-2 text-sm text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors";
  const gol = (text: string) => (esteEditorDesign ? <MesajGol cls={`text-sm ${MARUNT}`}>{text}</MesajGol> : null);

  switch (coloana.type) {
    case "identitate": {
      const logoSize = (pageContent.footer_logo_size ?? 36) * 1.4;
      const text = sir(s.text);
      return (
        <>
          {s.arataLogo !== false && (
            <a href={radacinaMagazin(basePath)} className="hover:opacity-80 transition-opacity" aria-label={nume}>
              {business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 480)} alt={nume}
                  style={stilSigla(logoSize)}
                  className="w-auto object-contain" />
              ) : (
                <span className="text-2xl font-black tracking-tight">{nume}</span>
              )}
            </a>
          )}
          {/* Sloganul apare doar daca il cere comerciantul. Vezi `FooterColumns`. */}
          {s.arataSloganul === true && business.tagline && (
            <p className="text-sm leading-relaxed text-[var(--st-muted)] max-w-md">{business.tagline}</p>
          )}
          {text && <p className="text-sm leading-relaxed text-[var(--st-muted)] max-w-md whitespace-pre-line">{text}</p>}
          {s.arataRetelele === true && retele}
        </>
      );
    }

    case "linkuri":
      if (linkuri.length === 0) return gol("Coloana nu are linkuri.");
      return (
        <CuTitlu titlu={titlu}>
          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            {linkuri.map((l) => (
              <a key={l.cheie} href={l.href} {...(l.extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-sm font-medium hover:opacity-60 transition-opacity">
                {l.eticheta}
              </a>
            ))}
          </nav>
        </CuTitlu>
      );

    case "contact": {
      const oras = s.oras === true ? business.store_city || business.city : null;
      const tel = s.telefon !== false ? business.phone : null;
      const wa = s.whatsapp !== false ? business.whatsapp : null;
      const email = s.email !== false ? business.email : null;
      if (!tel && !wa && !email && !oras) return null;
      return (
        <CuTitlu titlu={titlu}>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {tel && (
              <a href={`tel:${tel}`} className={contact}>
                <Phone className="h-4 w-4" strokeWidth={1.6} />
                {tel}
              </a>
            )}
            {wa && (
              <a href={whatsappLink(wa)} target="_blank" rel="noopener noreferrer" className={contact}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                WhatsApp
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className={contact}>
                <Mail className="h-4 w-4" strokeWidth={1.6} />
                {email}
              </a>
            )}
            {oras && (
              <span className="inline-flex items-center gap-2 text-sm text-[var(--st-muted)]">
                <MapPin className="h-4 w-4" strokeWidth={1.6} />
                {oras}
              </span>
            )}
          </div>
        </CuTitlu>
      );
    }

    case "retele":
      if (!retele) return gol("Magazinul nu are rețele sociale completate.");
      return <CuTitlu titlu={titlu}>{retele}</CuTitlu>;

    case "text": {
      const text = sir(s.text);
      if (!text) return gol("Coloana nu are text.");
      return (
        <CuTitlu titlu={titlu}>
          <p className="text-sm leading-relaxed text-[var(--st-muted)] max-w-md whitespace-pre-line">{text}</p>
        </CuTitlu>
      );
    }

    case "newsletter":
      return (
        <div className="w-full flex flex-col items-center">
          {titlu && <p className={TITLU}>{titlu}</p>}
          {sir(s.text) && <p className={`${titlu ? "mt-2 " : ""}text-sm leading-relaxed ${MARUNT} max-w-md`}>{sir(s.text)}</p>}
          <FormularNewsletterSubsol coloana={coloana} idSubsol={idSubsol} marunt={MARUNT} inchis={false} centrat />
        </div>
      );

    case "imagine":
      return <ImagineSubsol coloana={coloana} gol={esteEditorDesign ? `text-sm ${MARUNT}` : null} />;

    default:
      return null;
  }
}
