import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  CASETA_MICA,
  CasetaSigla,
} from "../sections/integrations/CasetaSigla";
import type { NavCompare, NavFeatured, NavItem, NavLink } from "@/lib/website/nav";

/**
 * Cărămizile mega menu-ului.
 *
 * Verdele apare doar în două locuri: eticheta mică de tip „Inclus" și iconița la
 * hover. Titlurile rămân negru integral (`text-ink`).
 *
 * Supratitlurile panourilor de promovare au avut un punct verde în față. E scos:
 * era un ornament fără rost, pus din reflex, nu pentru că spunea ceva.
 */

/** Numărul de la care răspunde cineva. Și în footer, și în butonul plutitor. */
export const SUPPORT_PHONE = "0750 456 809";
export const SUPPORT_PHONE_HREF = "tel:+40750456809";

/** Eticheta verde mică de lângă un titlu, ex. "Gratuit". */
export function MenuBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
      {children}
    </span>
  );
}

/** Titlul unei coloane: mic, cu spațiere, gri deschis. */
export function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
      {children}
    </p>
  );
}

/** Rând cu iconiță în cutie, titlu și descriere. Se colorează la hover. */
export function MegaItem({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="group flex gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-tint-2"
    >
      <span className="mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-colors duration-150 group-hover:border-primary/30">
        <Icon
          className="h-[17px] w-[17px] text-ink-2 transition-colors duration-150 group-hover:text-primary"
          strokeWidth={1.75}
        />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-semibold leading-5 text-ink">{item.label}</span>
          {item.badge ? <MenuBadge>{item.badge}</MenuBadge> : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-[1.55] text-ink-2">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

/** Rând de comparație: "Edinio vs Shopify" plus motivul, fără siglă. */
export function CompareItem({
  item,
  onNavigate,
}: {
  item: NavCompare;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="group rounded-xl p-3 transition-colors duration-150 hover:bg-tint-2"
    >
      <span className="flex items-center gap-1.5 text-[14px] font-semibold leading-5 text-ink">
        <span className="text-ink-3 transition-colors duration-150 group-hover:text-ink-2">
          Edinio vs
        </span>
        {item.name}
        <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-ink-3 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
      </span>
      <span className="mt-0.5 block text-[12.5px] leading-[1.55] text-ink-2">
        {item.description}
      </span>
    </Link>
  );
}

/** Link compact, fără descriere. Folosit pentru coloana de industrii. */
export function CompactLink({
  link,
  onNavigate,
}: {
  link: NavLink;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className="rounded-lg px-3 py-[7px] text-[13px] leading-5 text-ink-2 transition-colors duration-150 hover:bg-tint-2 hover:text-ink"
    >
      {link.label}
    </Link>
  );
}

/**
 * Banda de jos a oricărui panou: întrebarea și numărul de telefon.
 *
 * Stă în `PanelCard`, deci apare la fel în toate trei panourile. Numărul e
 * `tel:`, ca pe telefon să sune dintr-o apăsare.
 *
 * Fără program aici, intenționat: footerul spune „suport 7 zile din 7", iar
 * pagina de contact spune „Luni - Vineri, 09:00 - 18:00". Până nu se lămurește
 * care e adevărul, bara nu repetă niciuna.
 */
export function HelpStrip({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-2 border-t border-hairline bg-tint px-5 py-3">
      <Phone className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
      <span className="text-[13px] leading-5 text-ink-2">Ai nevoie de ajutor?</span>
      <a
        href={SUPPORT_PHONE_HREF}
        className="text-[13px] font-semibold leading-5 text-ink underline-offset-4 hover:underline"
      >
        {SUPPORT_PHONE}
      </a>
      <Link
        href="/contact"
        onClick={onNavigate}
        className="group ml-auto flex items-center gap-1.5 text-[13px] font-medium leading-5 text-ink-2 transition-colors duration-150 hover:text-ink"
      >
        Scrie-ne
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/** Panoul de promovare din dreapta: fundal calm, siglele stinse, un link. */
export function FeaturedPanel({
  featured,
  onNavigate,
  className,
}: {
  featured: NavFeatured;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={featured.href}
      onClick={onNavigate}
      className={cn(
        "group flex flex-col rounded-2xl border border-hairline bg-tint p-5 transition-colors duration-200 hover:border-ink-3/40",
        className,
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {featured.eyebrow}
      </span>

      <span className="mt-3 block text-[15px] font-semibold leading-[1.35] text-ink">
        {featured.title}
      </span>
      <span className="mt-1.5 block text-[12.5px] leading-[1.55] text-ink-2">
        {featured.description}
      </span>

      {/*
        ═══ PLĂCI, NU SIGLE ÎNTR-O CUTIE ═══

        Erau șase sigle puse pe un carton alb comun, la aceeași ÎNĂLȚIME. Două
        lucruri nu mergeau, și clientul le-a văzut pe amândouă (13.08):

        1. La înălțime egală siglele NU par egale. Stripe e un cuvânt lung
           (raport 2,39), Sameday e pătrată (0,99): la aceeași înălțime, prima
           acoperă de vreo două ori mai multă suprafață și trage tot ochiul.
        2. Cartonul comun le lipea într-un bloc, în loc să le arate ca pe niște
           lucruri de sine stătătoare.

        Acum e chiar piesa de pe pagina „Integrări" — `CasetaSigla` — doar mai
        mică. Ea egalizează SUPRAFAȚA, nu înălțimea, deci siglele arată la fel de
        mari oricât de diferite le-ar fi formele. Nu e o copie a desenului de
        acolo: e aceeași componentă, ca prima corectură făcută într-un loc să nu
        le despartă.

        ⚠ Fără `bg-white` aici: albul și umbra vin din clasa `caseta-sigla`.

        ⚠ Și mărimea e FIXĂ (56×56), nu întinsă pe coloană. Lăsată să se
        întindă, caseta ieșea de 56px lată la 1024 și de 73 la 1280 — un
        dreptunghi care se schimbă cu fereastra, în timp ce sigla dinăuntru,
        socotită pentru o suprafață dată, rămânea la fel. `justify-items-center`
        împarte prisosul între ele.
      */}
      {featured.logos ? (
        <span className="mt-4 grid grid-cols-3 justify-items-center gap-y-2.5">
          {featured.logos.map((cheie) => (
            <CasetaSigla
              key={cheie}
              cheie={cheie}
              suprafata={CASETA_MICA.suprafata}
              latimeUtila={CASETA_MICA.latimeUtila}
              className="h-14 w-14 rounded-[14px]"
            />
          ))}
        </span>
      ) : null}

      <span className="mt-auto flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-ink">
        {featured.cta}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
