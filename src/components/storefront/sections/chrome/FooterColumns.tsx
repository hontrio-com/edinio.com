"use client";

import { Children, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUp, ChevronDown, Mail, MapPin, Phone } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { whatsappLink } from "@/lib/utils/format";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { MarcajBloc } from "@/components/storefront/MarcajBloc";
import { FooterCredit, FooterLegal, type TonFooter } from "@/components/storefront/sections/_shared/FooterLegal";
import { SocialLinks, areSocialLinks } from "@/components/storefront/sections/_shared/SocialLinks";
import { stilSigla } from "@/lib/storefront/logo-box";
import { esteDeschisa } from "@/lib/storefront/design/css-vars";
import { coloaneVazute, culoriSubsol, etichetaColoanei, inapoiSusPornit, sablonColoane, textCopyright } from "@/lib/storefront/design/subsol";
import type { BlockInstance, SectionInstance } from "@/lib/storefront/design/types";
import { FormularNewsletterSubsol, ImagineSubsol, MesajGol, sir, useLinkuriColoanei } from "./subsol-coloane";

/**
 * Footer pe coloane, variantele „dark” (inchis) si „columns” (deschis).
 *
 * Structura pe care o are orice magazin mare: identitatea magazinului intr-o
 * parte, iar restul impartit pe intrebarile vizitatorului — ce vindeti, unde
 * citesc mai multe, cum va gasesc. Din etapa 11 (`docs/editor-magazin/PLAN.md`)
 * coloanele le alege omul (`blocks`, `subsol.ts`); fara nimic salvat, sunt cele de
 * dinainte: identitatea, „Magazin”, „Informatii”, „Contact”, cu acelasi marcaj.
 *
 * Pe telefon coloanele cu titlu se pliaza. Patru liste una sub alta fac un subsol
 * de doua ecrane, prin care nimeni nu deruleaza; inchise, se vad toate deodata si
 * se deschide doar cea cautata.
 *
 * `FooterLegal` si `FooterCredit` sunt compuse obligatoriu — vezi comentariul de
 * acolo pentru ce contin si de ce nu pot lipsi din nicio varianta.
 */
export function FooterColumns({ ton = "deschis", sectiune }: { ton?: TonFooter; sectiune: SectionInstance }) {
  const { business, hasStickyBottomBar, design } = useStoreChrome();
  const nume = business.store_name ?? business.business_name;
  const spatiuJos = hasStickyBottomBar ? "pb-24 lg:pb-8" : "pb-8";
  const coloane = coloaneVazute(sectiune);
  // Culorile alese (etapa 11) cad ca variabile pe radacina; partea legala trece atunci pe tonul care le citeste.
  const culori = culoriSubsol(sectiune);
  const inchis = ton === "inchis";
  /*
   * Varianta „dark” pe un fundal de subsol ales DESCHIS (tema Uranus, #F4F5F7): blocul legal scria alb 50% pe el
   * (1,04:1) si textele marunte negru 50% (3,3:1). Atunci trece pe tonul deschis. Fundalul implicit, inchis, nu se
   * schimba, deci niciun subsol de azi nu arata altfel.
   */
  const fundalDeschis = inchis && esteDeschisa(design?.style?.colors?.footerBg) === true;
  const tonLegal: TonFooter = culori || fundalDeschis ? "deschis" : ton;
  // Pe fundal inchis culorile vin din perechea de footer a magazinului, ca sa
  // ramana reglabila dintr-un singur loc.
  const fundal = inchis
    ? "bg-[var(--st-footer-bg)] text-[var(--st-footer-text)]"
    : "bg-[var(--st-bg)] text-[var(--st-text)] border-t border-[var(--st-border)]";
  const separator = inchis ? "border-[var(--st-footer-text)]/10" : "border-[var(--st-border)]";
  const marunt = inchis ? (fundalDeschis ? "text-[var(--st-footer-text)]/75" : "text-[var(--st-footer-text)]/50") : "text-[var(--st-muted)]";
  const stil: StilColoane = {
    separator, marunt, inchis,
    // Linkurile coloanelor, pe acelasi fond deschis: la 50% ieseau la 3,32:1 (Uranus).
    ...(fundalDeschis ? { legatura: "flex items-start gap-2 text-[13px] text-[var(--st-footer-text)]/75 hover:text-[var(--st-footer-text)] transition-colors" } : {}),
  };
  /*
   * Latimile coloanelor (identitatea si contactul mai late) printr-o variabila: clasa de grila e aceeasi oricate
   * coloane ar fi. Peste patru, pe tableta intai doua pe rand, ca sa nu se stranga.
   */
  const grila = coloane.length > 4 ? "md:grid-cols-2 lg:grid-cols-[var(--coloane-subsol)]" : "md:grid-cols-[var(--coloane-subsol)]";

  return (
    <footer className={fundal} style={culori as CSSProperties | undefined}>
      <div className={`max-w-6xl mx-auto px-5 pt-10 sm:pt-12 ${spatiuJos}`}>
        {coloane.length > 0 && (
          <div className={`grid gap-8 sm:gap-10 ${grila} pb-8`} style={{ "--coloane-subsol": sablonColoane(coloane) } as CSSProperties}>
            {coloane.map((c) => (
              <MarcajBloc key={c.id} idSectiune={sectiune.id} idBlocului={c.id} eticheta={etichetaColoanei(c)}>
                <ColoanaSubsol coloana={c} idSubsol={sectiune.id} stil={stil} />
              </MarcajBloc>
            ))}
          </div>
        )}

        {inapoiSusPornit(sectiune) && (
          <div className="pb-6 flex justify-center">
            {/* Buton, nu ancora: nu e o destinatie (vezi `FooterCentered`). */}
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className={`inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-medium cursor-pointer ${marunt} hover:opacity-80 transition-opacity`}>
              <ArrowUp className="h-3.5 w-3.5" />
              Inapoi sus
            </button>
          </div>
        )}

        <div className={`border-t ${separator}`}>
          {/* Paginile apar, cand le vrea, intr-o coloana „Linkuri”. */}
          <FooterLegal ton={tonLegal} cuPagini={false} />
          <div className={`border-t ${separator}`}>
            <FooterCredit ton={tonLegal} text={textCopyright(sectiune, nume)} />
          </div>
        </div>
      </div>
    </footer>
  );
}

export interface StilColoane {
  separator: string;
  marunt: string;
  inchis: boolean;
  /** Clasa titlurilor de coloana; lipsa = marunte, cu majuscule (tema Jupiter le vrea mari, etapa 16.2). */
  titlu?: string;
  /** Clasa linkurilor; lipsa = cea a tonului. */
  legatura?: string;
  /** Sigla pe o placa alba: pe fundalul inchis al temei Jupiter, o sigla inchisa la culoare nu s-ar citi. */
  placaSigla?: boolean;
}

/**
 * O coloana, dupa tipul ei. Cele de azi au exact marcajul de dinainte de etapa 11. Exportata pentru subsolul temei
 * Jupiter (etapa 16.2), care le aseaza altfel, dar nu le copiaza.
 */
export function ColoanaSubsol({ coloana, idSubsol, stil }: { coloana: BlockInstance; idSubsol: string; stil: StilColoane }) {
  const { business, pageContent, social, esteEditorDesign } = useStoreChrome();
  const linkuri = useLinkuriColoanei(coloana);
  const { separator, marunt, inchis } = stil;
  const s = coloana.settings;
  const titlu = sir(s.titlu);
  const legatura = stil.legatura ?? (inchis
    ? "flex items-start gap-2 text-[13px] text-[var(--st-footer-text)]/50 hover:text-[var(--st-footer-text)] transition-colors"
    : "flex items-start gap-2 text-[13px] text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors");
  const cerc = inchis
    ? "w-9 h-9 rounded-full border border-[var(--st-footer-text)]/15 flex items-center justify-center hover:bg-[var(--st-footer-text)]/10 transition-colors"
    : "w-9 h-9 rounded-full border border-[var(--st-border)] flex items-center justify-center text-[var(--st-text)] hover:bg-[var(--st-primary-soft)] transition-colors";
  const nume = business.store_name ?? business.business_name;

  switch (coloana.type) {
    case "identitate": {
      const logoSize = pageContent.footer_logo_size ?? 36;
      const text = sir(s.text);
      return (
        <div className="min-w-0">
          {s.arataLogo !== false && (
            <div className={`flex items-center gap-3 min-w-0 ${stil.placaSigla && business.logo_url ? "w-fit max-w-full rounded-md bg-white px-4 py-3" : ""}`}>
              {business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 320)} alt={nume}
                  style={stilSigla(logoSize)}
                  className="w-auto object-contain" />
              ) : (
                <span className="text-lg font-black tracking-tight truncate">{nume}</span>
              )}
            </div>
          )}
          {/*
            Sloganul apare doar daca il cere comerciantul.
            Se lua automat din datele magazinului si ateriza sub logo la orice
            footer, fara ca nimeni sa-l fi pus acolo — un rand de text mic,
            scris pentru alta parte a magazinului, sub singurul element care
            trebuia sa se vada in coloana aia.
          */}
          {s.arataSloganul === true && business.tagline && (
            <p className={`mt-3 text-[13px] leading-relaxed max-w-xs ${marunt}`}>{business.tagline}</p>
          )}
          {text && <p className={`mt-3 text-[13px] leading-relaxed max-w-xs whitespace-pre-line ${marunt}`}>{text}</p>}
          {s.arataRetelele !== false && areSocialLinks(social) && (
            <div className="mt-4 flex items-center gap-2">
              <SocialLinks social={social} className={cerc} iconClass="h-4 w-4" />
            </div>
          )}
        </div>
      );
    }

    case "linkuri":
      return (
        <Coloana titlu={titlu} separator={separator} marunt={marunt} titluCls={stil.titlu}>
          {linkuri.map((l) => (
            <Legatura key={l.cheie} cls={legatura} href={l.href} extern={l.extern}>{l.eticheta}</Legatura>
          ))}
          {/* Doar in editor: goala, coloana dispare din magazin, dar aici trebuie gasita si aleasa. */}
          {esteEditorDesign && linkuri.length === 0 && <MesajGol key="gol" cls={`text-[13px] ${marunt}`}>Coloana nu are linkuri.</MesajGol>}
        </Coloana>
      );

    case "contact": {
      const oras = business.store_city || business.city;
      return (
        <Coloana titlu={titlu} separator={separator} marunt={marunt} titluCls={stil.titlu}>
          {s.telefon !== false && business.phone && (
            <Legatura cls={legatura} href={`tel:${business.phone}`} icon={<Phone className="h-4 w-4" strokeWidth={1.6} />}>
              {business.phone}
            </Legatura>
          )}
          {s.whatsapp !== false && business.whatsapp && (
            <Legatura cls={legatura} href={whatsappLink(business.whatsapp)} extern
              icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>}>
              WhatsApp
            </Legatura>
          )}
          {s.email !== false && business.email && (
            <Legatura cls={legatura} href={`mailto:${business.email}`} icon={<Mail className="h-4 w-4" strokeWidth={1.6} />}>
              {business.email}
            </Legatura>
          )}
          {s.oras !== false && oras && (
            <span className={`flex items-start gap-2 text-[13px] ${marunt}`}>
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.6} />
              {oras}
            </span>
          )}
        </Coloana>
      );
    }

    case "text": {
      const text = sir(s.text);
      return (
        <Coloana titlu={titlu} separator={separator} marunt={marunt} titluCls={stil.titlu}>
          {text && <p className={`text-[13px] leading-relaxed whitespace-pre-line ${marunt}`}>{text}</p>}
          {esteEditorDesign && !text && <MesajGol key="gol" cls={`text-[13px] ${marunt}`}>Coloana nu are text.</MesajGol>}
        </Coloana>
      );
    }

    case "newsletter":
      return (
        <div className="min-w-0">
          {titlu && <p className={`text-[11px] font-semibold uppercase tracking-widest ${marunt}`}>{titlu}</p>}
          {sir(s.text) && <p className={`${titlu ? "mt-3 " : ""}text-[13px] leading-relaxed ${marunt}`}>{sir(s.text)}</p>}
          <FormularNewsletterSubsol coloana={coloana} idSubsol={idSubsol} marunt={marunt} inchis={inchis} />
        </div>
      );

    case "imagine":
      return (
        <div className="min-w-0">
          <ImagineSubsol coloana={coloana} gol={esteEditorDesign ? `text-[13px] ${marunt}` : null} />
        </div>
      );

    case "retele":
      return areSocialLinks(social) ? (
        <div className="min-w-0">
          {titlu && <p className={`text-[11px] font-semibold uppercase tracking-widest ${marunt}`}>{titlu}</p>}
          <div className={`${titlu ? "mt-3 " : ""}flex flex-wrap items-center gap-2`}>
            <SocialLinks social={social} className={cerc} iconClass="h-4 w-4" />
          </div>
        </div>
      ) : esteEditorDesign ? (
        <MesajGol cls={`text-[13px] ${marunt}`}>Magazinul nu are rețele sociale completate.</MesajGol>
      ) : null;

    default:
      return null;
  }
}

/** Coloana de linkuri: deschisa pe desktop, pliata pe telefon. Fara titlu, doar lista, mereu deschisa. */
function Coloana({ titlu, children, separator, marunt, titluCls }: {
  titlu: string;
  children: ReactNode;
  separator: string;
  marunt: string;
  titluCls?: string;
}) {
  const [deschisa, setDeschisa] = useState(false);
  const clasaTitlu = titluCls ?? `text-[11px] font-semibold uppercase tracking-widest ${marunt}`;
  const idLista = useId();

  /*
   * O coloana fara niciun rand nu se randeaza deloc.
   *
   * „Informatii" isi ia randurile din meniu, iar „Contact" din datele
   * magazinului: la un magazin fara pagini proprii, ori fara telefon si email,
   * ramanea in subsol un titlu cu nimic sub el, plus separatorul lui pe telefon.
   * `Children.toArray` arunca `null`, `undefined` si `false`, adica exact ce
   * lasa in urma conditiile de tipul `{business.phone && (...)}` — o simpla
   * verificare de lungime pe `children` le-ar fi numarat drept randuri.
   */
  if (Children.toArray(children).length === 0) return null;

  if (!titlu) {
    return (
      <div className="min-w-0">
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 border-t md:border-0 pt-3 md:pt-0 ${separator}`}>
      {/* Pe desktop lista e mereu deschisa (`md:flex` mai jos), deci butonul
          dispare cu totul in loc sa fie doar inert: altfel ar ramane in ordinea
          de tabulare si ar anunta „restrans" peste o lista vizibila. */}
      <button type="button" onClick={() => setDeschisa((v) => !v)} aria-expanded={deschisa} aria-controls={idLista}
        // Etapa 25.16: 44 px pe telefon (era cat titlul, 18 px): sunt butoane de deget, pe toata latimea.
        className="w-full min-h-11 flex items-center justify-between gap-2 md:hidden">
        <span className={clasaTitlu}>{titlu}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${marunt} ${deschisa ? "rotate-180" : ""}`} />
      </button>
      <p className={`hidden md:block ${clasaTitlu}`}>{titlu}</p>
      <div id={idLista} className={`flex-col gap-2 pt-3 ${deschisa ? "flex" : "hidden"} md:flex`}>
        {children}
      </div>
    </div>
  );
}

function Legatura({
  cls,
  href,
  children,
  icon,
  extern = false,
}: {
  cls: string;
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  extern?: boolean;
}) {
  return (
    <a href={href} {...(extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cls}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}
