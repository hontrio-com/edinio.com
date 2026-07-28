"use client";

import { useState, useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { menuItemHref, isExternalLink, type MenuItem } from "@/lib/pages/menu";
import { useStoreChromeOptional, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { radaciniCategorii, subcategorii } from "@/lib/storefront/categories-chrome";
import { cdnImage } from "@/lib/cdn-image";

/** Desktop inline navigation links (hidden on mobile). */
export function StoreNavLinks({ items, basePath, color, currentSlug, className }: {
  items: MenuItem[]; basePath: string; color: string; currentSlug?: string | null; className?: string;
}) {
  // Radacina catalogului vine din chrome, nu ca prop: meniul se randeaza in
  // toate cele opt headere si in doua footere, iar un prop in plus ar fi trebuit
  // adaugat in zece locuri si tinut in sincron la fiecare varianta noua. Optional
  // fiindca `useStoreChrome` arunca fara provider, iar aici o lipsa nu merita o
  // pagina alba — se cade pe `basePath`, adica pe comportamentul de dinainte.
  const chrome = useStoreChromeOptional();
  const categoriiRoot = chrome?.categoriiRoot ?? chrome?.catalogRoot ?? basePath;
  if (items.length === 0) return null;
  // `overflow-x-auto` duce dimensiunea minima automata la zero — cu `visible`, un
  // meniu de opt intrari `whitespace-nowrap` nu se poate stramta sub suma lor si
  // latfeste header-ul, adica pagina intreaga capata derulare orizontala fix la
  // pragul unde meniul tocmai a devenit vizibil.
  //
  // Centrarea se face cu margini automate pe grupul de linkuri, nu cu
  // `justify-center` pe containerul care deruleaza: un flex centrat cu depasire
  // isi taie continutul la marginea de START, iar acolo nu se poate derula —
  // primele intrari din meniu ar deveni de neatins.
  return (
    <nav className={`hidden md:flex items-center min-w-0 overflow-x-auto ${className ?? ""}`}>
      <span className="flex items-center gap-0.5 mx-auto">
      {items.map((it) => {
        const href = menuItemHref(it, basePath, categoriiRoot);
        const ext = isExternalLink(it);
        const active = !!currentSlug && it.type === "page" && it.target === currentSlug;
        return (
          <a key={it.id} href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            style={active ? { color, fontWeight: 600 } : undefined}>
            {it.label}
          </a>
        );
      })}
      </span>
    </nav>
  );
}

/** Mobile hamburger button + slide-in panel (hidden on desktop). */
/**
 * Pana la ce latime se arata hamburgerul. Variantele de header care isi tin
 * meniul pe desktop (`lg`) trebuie sa il ceara explicit, altfel intre 768 si
 * 1024 pixeli meniul de sus e deja ascuns iar hamburgerul inca nu a aparut, si
 * tableta ramane fara nicio navigare.
 */
const PANA_LA = {
  md: { buton: "md:hidden", panou: "md:hidden" },
  lg: { buton: "lg:hidden", panou: "lg:hidden" },
} as const;

/**
 * Cum arata butonul. „simplu" e pentru header-ele pe fundal inchis, unde un
 * patrat cu chenar deschis ar fi o pata luminoasa in mijlocul barii.
 *
 * La „simplu", marimea vizibila ramane cea de 32px, dar suprafata de atins urca
 * la 44px prin padding anulat de marginea negativa: butonul n-are fundal, deci
 * cresterea nu se vede, iar pe telefon el e singura navigare a paginii.
 */
const STIL_BUTON = {
  incadrat: "w-9 h-9 rounded-xl border border-border bg-surface flex items-center justify-center hover:bg-muted transition-colors shrink-0",
  simplu: "w-11 h-11 -m-1.5 flex items-center justify-center text-current hover:opacity-70 transition-opacity shrink-0",
} as const;

export function StoreNavHamburger({ items, basePath, color, currentSlug, logoUrl, storeName, panaLa = "md", stil = "incadrat" }: {
  items: MenuItem[]; basePath: string; color: string; currentSlug?: string | null;
  logoUrl?: string | null; storeName: string; panaLa?: keyof typeof PANA_LA;
  stil?: keyof typeof STIL_BUTON;
}) {
  const bp = PANA_LA[panaLa];
  // Aceeasi sursa ca la meniul de desktop, din acelasi motiv: vezi StoreNavLinks.
  const chromeMeniu = useStoreChromeOptional();
  const catalogRoot = chromeMeniu?.catalogRoot ?? basePath;
  // Categoriile duc la pagina de catalog cand exista; `catalogRoot` ramane
  // pentru intrarea „Magazin" din meniu.
  const categoriiRoot = chromeMeniu?.categoriiRoot ?? catalogRoot;
  const categoriiPePagina = chromeMeniu?.categoriiPePagina === true;
  const [open, setOpen] = useState(false);
  const idPanou = useId();
  const declansator = useRef<HTMLButtonElement>(null);
  const panou = useRef<HTMLDivElement>(null);
  const inchidere = useRef<HTMLButtonElement>(null);
  // Portal the panel out of the sticky header's stacking context (otherwise the
  // announcement bar / cart bar / cart drawer paint over it). Tinta e radacina
  // temei magazinului, nu <body>: variantele noi trimit `color` ca
  // `var(--st-primary)`, iar in afara temei variabila n-are ce rezolva si
  // patratul cu initiala magazinului ramane fara fundal.
  const [tinta, setTinta] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setTinta(document.querySelector<HTMLElement>("[data-store-theme]") ?? document.body));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Panoul e singura navigare de pe telefon, pentru toate variantele de header:
  // se inchide cu Escape, tine focusul inauntru cat e deschis si il da inapoi
  // hamburgerului la inchidere. Fara asta, utilizatorul de tastatura tabuleaza
  // prin pagina de dedesubt, pe care overlay-ul o ascunde.
  useEffect(() => {
    if (!open) return;
    const buton = declansator.current;
    inchidere.current?.focus();
    const laTasta = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panou.current) return;
      const focusabile = panou.current.querySelectorAll<HTMLElement>("a[href], button");
      if (focusabile.length === 0) return;
      const primul = focusabile[0];
      const ultimul = focusabile[focusabile.length - 1];
      if (e.shiftKey && document.activeElement === primul) {
        e.preventDefault();
        ultimul.focus();
      } else if (!e.shiftKey && document.activeElement === ultimul) {
        e.preventDefault();
        primul.focus();
      }
    };
    document.addEventListener("keydown", laTasta);
    return () => {
      document.removeEventListener("keydown", laTasta);
      buton?.focus();
    };
  }, [open]);

  if (items.length === 0) return null;

  // `${color}10` (alfa pe hex) e valid doar pentru culoarea reala trimisa de
  // header-ul classic; variantele noi trimit `var(--st-primary)`, unde
  // concatenarea ar da o valoare pe care browserul o ignora.
  const fundalActiv = color.startsWith("#") ? `${color}10` : `color-mix(in srgb, ${color} 6%, transparent)`;

  return (
    <>
      <button ref={declansator} type="button" aria-label="Deschide meniul" aria-expanded={open}
        aria-controls={idPanou} onClick={() => setOpen(true)}
        className={`${bp.buton} ${STIL_BUTON[stil]}`}>
        <Menu className={stil === "simplu" ? "h-6 w-6" : "h-4.5 w-4.5 text-foreground"} size={stil === "simplu" ? 24 : 18} />
      </button>

      {tinta && open && createPortal(
        <>
          <div aria-hidden="true" className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] ${bp.panou}`} onClick={() => setOpen(false)} />
          <div ref={panou} id={idPanou} role="dialog" aria-modal="true" aria-label="Meniu"
            className={`fixed inset-y-0 left-0 w-72 max-w-[82vw] bg-background z-[70] ${bp.panou} flex flex-col shadow-2xl`}>
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cdnImage(logoUrl, 256)} alt={storeName} className="h-8 w-auto max-w-[120px] object-contain" />
                ) : (
                  // Fara logo, panoul arata NUMELE, ca header-ul de deasupra lui.
                  // Patratul cu initiala era a doua cadere de rezerva pentru
                  // acelasi lucru, si comerciantul o citea drept „logo gresit".
                  <span className="font-bold text-foreground truncate">{storeName}</span>
                )}
              </div>
              <button ref={inchidere} type="button" aria-label="Inchide meniul" onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {items.map((it) => {
                const href = menuItemHref(it, basePath, categoriiRoot);
                const ext = isExternalLink(it);
                const active = !!currentSlug && it.type === "page" && it.target === currentSlug;
                return (
                  <a key={it.id} href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-3 rounded-xl text-base font-medium text-foreground hover:bg-muted transition-colors"
                    style={active ? { color, backgroundColor: fundalActiv } : undefined}>
                    {it.label}
                  </a>
                );
              })}

              {/*
                Categoriile, cu subcategoriile lor, direct in meniu.
                Pe telefon bara de categorii din hero e ascunsa si panourile din
                header nu incap, deci asta e SINGURUL loc din care vizitatorul
                ajunge la cele douazeci si doua de subcategorii ale magazinului.
                Fara ele, meniul arata patru linkuri de pagini si atat.
              */}
              <CategoriiInMeniu categoriiRoot={categoriiRoot} pePagina={categoriiPePagina} color={color} onNaviga={() => setOpen(false)} />
            </nav>
          </div>
        </>,
        tinta,
      )}
    </>
  );
}

/**
 * Categoriile magazinului in meniul de pe telefon, cu subcategoriile pliate.
 *
 * Arborele vine din catalog cand pagina il are, si din chrome in rest — acolo il
 * aduce `loadSearchCategories`, gated pe varianta de header. Cand nu exista
 * niciuna dintre surse, sectiunea lipseste cu totul in loc sa apara un titlu
 * gol: un magazin fara categorii n-are ce arata aici.
 */
function CategoriiInMeniu({
  categoriiRoot,
  pePagina,
  color,
  onNaviga,
}: {
  categoriiRoot: string;
  pePagina: boolean;
  color: string;
  onNaviga: () => void;
}) {
  const chrome = useStoreChromeOptional();
  const catalog = useStorefrontOptional();
  const [deschisa, setDeschisa] = useState<string | null>(null);

  const arbore = catalog?.categories ?? chrome?.searchCategories;
  const radacini = useMemo(() => radaciniCategorii(arbore), [arbore]);
  const copii = useMemo(() => subcategorii(arbore, deschisa), [arbore, deschisa]);
  if (radacini.length === 0) return null;

  return (
    <div className="pt-2 mt-2 border-t border-border">
      <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Categorii
      </p>
      {radacini.map((c) => {
        const desfasurata = deschisa === c.id;
        return (
          <div key={c.key}>
            <div className="flex items-stretch">
              <a href={hrefCategorie(categoriiRoot, c.name, pePagina)} onClick={onNaviga}
                className="flex-1 min-w-0 px-3 py-3 rounded-xl text-base font-medium text-foreground hover:bg-muted transition-colors truncate">
                {c.name}
              </a>
              {/*
                Sageata e un buton SEPARAT de link: pe telefon, un singur element
                care si navigheaza si desfasoara inseamna ca vizitatorul care vrea
                subcategoriile ajunge in catalog, si invers.
              */}
              {c.hasChildren && (
                <button type="button" aria-expanded={desfasurata}
                  aria-label={desfasurata ? `Ascunde subcategoriile din ${c.name}` : `Arata subcategoriile din ${c.name}`}
                  onClick={() => setDeschisa(desfasurata ? null : c.id)}
                  className="w-11 shrink-0 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors">
                  <ChevronDown className={`h-4 w-4 transition-transform ${desfasurata ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {desfasurata && copii.length > 0 && (
              <div className="pl-3 pb-1">
                {copii.map((sub) => (
                  <a key={sub.key} href={hrefCategorie(categoriiRoot, sub.name, pePagina)} onClick={onNaviga}
                    className="block px-3 py-2.5 rounded-xl text-[15px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors truncate">
                    {sub.name}
                  </a>
                ))}
                <a href={hrefCategorie(categoriiRoot, c.name, pePagina)} onClick={onNaviga}
                  className="block px-3 py-2 text-[13px] font-semibold" style={{ color }}>
                  Vezi tot din {c.name}
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
