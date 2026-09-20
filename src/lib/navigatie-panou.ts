import {
  BarChart2, FileText, LayoutDashboard, MessageSquare, Package, Pencil,
  ShoppingBag, ShoppingCart, Sparkles, Ticket, Users, Zap,
  type LucideIcon,
} from "lucide-react";

/*
  ═══════════════════════════════════════════════════════════════════════════
  MENIUL PANOULUI, INTR-UN SINGUR LOC
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ ERAU DOUA COPII, SI DIVERGISERA.

  `Sidebar.tsx` (ecran lat) si `DashboardTopbar.tsx` (sertarul de pe telefon)
  isi tineau fiecare propria lista. Al doilea spunea despre sine ca il
  oglindeste pe primul, dar ii lipseau intrari intregi: „Oferte" si „SMS
  Marketing" nu existau deloc pe telefon, iar „Design sectiuni" lipsea si el.
  Adica functii intregi invizibile pentru cine lucreaza de pe telefon, fara ca
  nimeni sa afle, fiindca panoul „merge".

  Exista o proba care apara grupurile Produse si Comenzi
  (`navigatia-nu-divergeaza.test.ts`), scrisa cand s-a vazut ca retururile
  lipseau de pe telefon. Proba nu era de ajuns, fiindca apara doar doua grupuri
  din unsprezece; acum nu mai are ce sa apere, fiindca lista e una singura.

  ⚠ ORDINEA E CEA CERUTA DE PROPRIETAR (20.09.2026), in ordinea in care isi
  foloseste el panoul: intai ce se intampla azi (comenzi, clienti), apoi ce
  vinde (produse, discounturi, oferte), apoi cum merge (statistici, cosuri
  abandonate, SMS), apoi legaturile cu altii. „Editeaza magazinul" si „Pagini"
  nu erau in lista lui si stau la urma, langa Integrari: tin de construirea
  magazinului, nu de lucrul zilnic.
*/

export type IntrarePanou = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Adevarat doar pentru intrarile care apar cand comerciantul are functia pornita. */
  cheieOptionala?: "smso";
  children?: { href: string; label: string; beta?: boolean }[];
};

export const MENIU_PANOU: IntrarePanou[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panou principal" },
  {
    href: "/dashboard/orders", icon: ShoppingCart, label: "Comenzi",
    children: [
      { href: "/dashboard/orders", label: "Toate comenzile" },
      { href: "/dashboard/returns", label: "Retururi" },
      { href: "/dashboard/settlements", label: "Decontari" },
    ],
  },
  { href: "/dashboard/customers", icon: Users, label: "Clienti" },
  {
    href: "/dashboard/products", icon: Package, label: "Produse",
    children: [
      { href: "/dashboard/products", label: "Toate produsele" },
      { href: "/dashboard/products/categories", label: "Categorii" },
      { href: "/dashboard/products/bundles", label: "Pachete" },
    ],
  },
  { href: "/dashboard/discounts", icon: Ticket, label: "Discounturi" },
  { href: "/dashboard/offers", icon: Sparkles, label: "Oferte" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Statistici" },
  { href: "/dashboard/abandoned", icon: ShoppingBag, label: "Cosuri abandonate" },
  { href: "/dashboard/sms", icon: MessageSquare, label: "SMS Marketing", cheieOptionala: "smso" },
  { href: "/dashboard/features", icon: Zap, label: "Integrari" },
  {
    href: "/dashboard/editor", icon: Pencil, label: "Editeaza magazinul",
    children: [
      { href: "/dashboard/editor", label: "Design magazin" },
      { href: "/dashboard/editor/sectiuni", label: "Design sectiuni", beta: true },
      { href: "/dashboard/editor/media", label: "Biblioteca Media" },
    ],
  },
  {
    href: "/dashboard/pages", icon: FileText, label: "Pagini",
    children: [
      { href: "/dashboard/pages", label: "Toate paginile" },
      { href: "/dashboard/pages/forms", label: "Formulare" },
      { href: "/dashboard/pages/messages", label: "Mesaje" },
    ],
  },
];

/** Intrarile de aratat, dupa ce se stie ce are pornit comerciantul. */
export function meniuPentru({ smsoEnabled }: { smsoEnabled: boolean }): IntrarePanou[] {
  return MENIU_PANOU.filter((i) => i.cheieOptionala !== "smso" || smsoEnabled);
}

/**
 * E intrarea asta cea deschisa acum?
 *
 * ⚠ Se uita SI la copii: „Retururi" sta la `/dashboard/returns`, in afara lui
 * `/dashboard/orders`, deci fara verificarea asta grupul Comenzi s-ar fi stins
 * exact cand omul e inauntrul lui.
 */
export function intrareActiva(intrare: IntrarePanou, caleaCurenta: string): boolean {
  if (intrare.href === "/dashboard") return caleaCurenta === "/dashboard";
  if (caleaCurenta.startsWith(intrare.href)) return true;
  return (intrare.children ?? []).some((c) => caleaCurenta.startsWith(c.href));
}
