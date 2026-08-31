"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/ui/Logo";
import { MENU_PREFIXES, TOP_NAV, type MenuId } from "@/lib/website/nav";
import { ComparePanel, ResourcesPanel, SolutionPanel } from "./MegaPanels";
import { MobileNav } from "./MobileNav";
import { butonVerde } from "@/lib/website/buton";

/**
 * Bara de sus a site-ului de prezentare.
 *
 * Sus e transparentă și se topește în hero; de la prima derulare capătă alb
 * translucid, blur și o linie de un pixel.
 *
 * Panourile stau montate tot timpul și se ascund cu `visibility`, nu prin
 * demontare. Trei motive: animația de ieșire vine gratis, `visibility: hidden`
 * scoate singur linkurile din ordinea de tabulare, și linkurile rămân în HTML,
 * deci Google le vede — un mega menu e o hartă de legături interne, ar fi păcat
 * să o ascundem de el.
 *
 * Deschiderea la trecerea mouse-ului are întârziere mică la intrare și una mai
 * mare la ieșire: fără ele, un drum diagonal spre panou îl închide în drum.
 * Ascultătorii de „pointer" se aplică doar pentru mouse — pe atingere, un
 * `pointerenter` urmat de `click` ar deschide și închide instant.
 */

const OPEN_DELAY = 70;
const CLOSE_DELAY = 140;

const MENU_IDS: MenuId[] = ["solutie", "de-ce-noi", "resurse"];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * Panoul deschis, plus dacă schimbarea s-a făcut dintr-un panou în altul.
   *
   * Cele două stau împreună într-o singură stare, ca să se schimbe în aceeași
   * clipă: `instant` se calculează din starea precedentă, în interiorul
   * actualizării. Prima variantă ținea panoul precedent într-un `useRef` citit
   * la randare, dar un ref citit la randare nu e de încredere când React
   * randează de două ori, iar regula `react-hooks/refs` o taie pe bună dreptate.
   */
  const [menu, setMenu] = useState<{ open: MenuId | null; instant: boolean }>({
    open: null,
    instant: false,
  });
  const openMenu = menu.open;
  const switching = menu.instant;

  const setOpenMenu = useCallback((next: MenuId | null) => {
    setMenu((previous) => ({
      open: next,
      instant: previous.open !== null && next !== null && previous.open !== next,
    }));
  }, []);

  const headerRef = useRef<HTMLElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const scheduleOpen = useCallback(
    (id: MenuId) => {
      clearTimers();
      openTimer.current = setTimeout(() => setOpenMenu(id), OPEN_DELAY);
    },
    [clearTimers, setOpenMenu],
  );

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpenMenu(null);
    }, CLOSE_DELAY);
  }, [clearTimers, setOpenMenu]);

  /**
   * Programează închiderea doar dacă nu e deja una pornită.
   *
   * Folosită de ascultătorul de pe bară, care se declanșează la fiecare element
   * peste care treci. Cu `scheduleClose` obișnuit, plimbatul mouse-ului prin bară
   * ar reporni cronometrul la fiecare pixel și meniul n-ar mai apuca să se
   * închidă cât timp miști.
   */
  const scheduleCloseIfIdle = useCallback(() => {
    if (closeTimer.current) return;
    scheduleClose();
  }, [scheduleClose]);

  const closeNow = useCallback(() => {
    clearTimers();
    setOpenMenu(null);
  }, [clearTimers, setOpenMenu]);

  useEffect(() => clearTimers, [clearTimers]);

  /* Starea de sticlă mată. */
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /*
   * Schimbarea paginii închide tot.
   *
   * Ajustare în timpul randării, nu într-un efect: așa cere React când o stare
   * trebuie readusă la zero pentru că s-a schimbat o valoare din afară. Într-un
   * efect ar fi însemnat o randare cu meniul încă deschis peste pagina nouă, apoi
   * încă una ca să-l închidă.
   */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu({ open: null, instant: false });
    setMobileOpen(false);
  }

  /* Escape închide; clic în afara barei închide panoul deschis prin clic. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      setMobileOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const header = headerRef.current;
      if (!header) return;
      if (event.target instanceof Node && header.contains(event.target)) return;
      setOpenMenu(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [setOpenMenu]);

  const solid = scrolled || openMenu !== null || mobileOpen;

  const isMenuActive = (id: MenuId) =>
    MENU_PREFIXES[id].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  /** Derulare lină pentru legăturile cu ancoră, când suntem deja pe pagina lor. */
  function handleAnchor(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const [path, hash] = href.split("#");
    if (!hash) return;
    const onSamePage = pathname === (path === "" ? "/" : path.replace(/\/$/, "") || "/");
    if (!onSamePage) return;
    const target = document.getElementById(hash);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth" });
    closeNow();
  }

  return (
    <>
    <header
      ref={headerRef}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && closeTimer.current) clearTimers();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") scheduleClose();
      }}
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        solid
          ? "border-hairline bg-white/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent",
      )}
    >
      {/*
        Trecerea peste orice altceva din bară (siglă, Contact, butoane) închide
        panoul deschis. `pointerover` se declanșează pentru fiecare element peste
        care intri, spre deosebire de `pointerenter`, care nu s-ar mai declanșa
        la mutarea de pe un declanșator pe un loc gol din aceeași bară.
      */}
      <div
        onPointerOver={(event) => {
          if (event.pointerType !== "mouse") return;
          if ((event.target as HTMLElement).closest("[data-menu-trigger]")) return;
          scheduleCloseIfIdle();
        }}
        className="mx-auto flex h-18 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-6 lg:px-8"
      >
        <Logo size="lg" textClassName="text-ink" eager />

        {/* ── Bara de mijloc, doar pe ecrane largi ── */}
        <nav aria-label="Meniu principal" className="hidden items-center gap-0.5 lg:flex">
          {TOP_NAV.map((entry) => {
            if ("menu" in entry) {
              const isOpen = openMenu === entry.menu;
              return (
                <button
                  key={entry.menu}
                  type="button"
                  data-menu-trigger
                  aria-expanded={isOpen}
                  aria-controls={`mega-${entry.menu}`}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") scheduleOpen(entry.menu);
                  }}
                  onFocus={() => {
                    clearTimers();
                    setOpenMenu(entry.menu);
                  }}
                  onClick={() => {
                    clearTimers();
                    setOpenMenu(isOpen ? null : entry.menu);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-150",
                    isOpen || isMenuActive(entry.menu)
                      ? "text-ink"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {entry.label}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-ink-3 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              );
            }

            const isActive = !entry.href.includes("#") && pathname === entry.href;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={(event) => handleAnchor(event, entry.href)}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") scheduleClose();
                }}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-150",
                  isActive ? "text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        </nav>

        {/* ── Acțiuni ── */}
        <div className="hidden items-center gap-1 lg:flex">
          <Link
            href="/login"
            className="rounded-full px-3.5 py-2 text-[14px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink"
          >
            Conectează-te
          </Link>
          <Link
            href="/register"
            className={cn("ml-1", butonVerde("bara"))}
          >
            Începe gratuit
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Închide meniul" : "Deschide meniul"}
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-tint-2 lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/*
        ── Panourile ──

        Trecerea de la un panou la altul se face instant, nu prin stingere.
        Panourile stau suprapuse in acelasi loc; daca cel care pleaca s-ar stinge
        in 200ms peste cel care apare, cat timp amandoua sunt pe jumatate
        transparente s-ar vedea unul prin altul, amestecate si cu titlul paginii.
        Asa ca animam doar deschiderea din nimic si inchiderea de tot, iar la
        schimbarea intre doua meniuri durata e zero.
      */}
      <div className="absolute inset-x-0 top-full hidden lg:block">
        {MENU_IDS.map((id) => {
          const isOpen = openMenu === id;
          return (
            <div
              key={id}
              id={`mega-${id}`}
              aria-hidden={!isOpen}
              /*
               * `pointer-events-none` aici, `pointer-events-auto` pe carton.
               *
               * Invelisul se intinde pe toata latimea ferestrei, dar cartonul are
               * doar 1140px. Fara asta, cele cateva sute de pixeli goi din
               * stanga si din dreapta cartonului raman parte din `<header>` si
               * inghit mouse-ul: `pointerleave` de pe bara nu se mai declanseaza,
               * iar meniul rimane deschis desi cursorul e vizibil in afara lui.
               */
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 px-5 pt-2.5 transition-[opacity,transform,visibility] ease-out sm:px-6 lg:px-8",
                switching ? "duration-0" : "duration-200",
                isOpen
                  ? "visible z-10 translate-y-0 opacity-100"
                  : "invisible -translate-y-1 opacity-0",
              )}
            >
              {id === "solutie" ? <SolutionPanel onNavigate={closeNow} /> : null}
              {id === "de-ce-noi" ? <ComparePanel onNavigate={closeNow} /> : null}
              {id === "resurse" ? <ResourcesPanel onNavigate={closeNow} /> : null}
            </div>
          );
        })}
      </div>
    </header>

    {/*
      Panoul de telefon stă în AFARA barei, intenționat. `backdrop-filter` de pe
      bară creează un bloc de referință pentru descendenții `fixed`, așa că un
      panou montat înăuntru s-ar poziționa față de cei 72px ai barei, nu față de
      ecran, și s-ar turti la câțiva pixeli. Ca frate, rămâne față de ecran.
    */}
    <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
