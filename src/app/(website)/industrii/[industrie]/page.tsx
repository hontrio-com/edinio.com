import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";
import { INDUSTRIES } from "@/lib/website/nav";
import { ACASA, type Firimitura } from "@/lib/website/breadcrumbs";

/**
 * O pagina pentru fiecare domeniu, din aceeasi lista care alimenteaza meniul.
 *
 * Rutele se genereaza la build din `INDUSTRIES`, iar un slug care nu e in lista
 * da 404 in loc de o pagina goala cu titlu inventat.
 */

interface Props {
  params: Promise<{ industrie: string }>;
}

export function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({ industrie: industry.slug }));
}

/*
 * Doar slug-urile din lista se randeaza; restul dau 404 fara sa treaca prin
 * pagina.
 *
 * De stiut, ca sa nu se piarda vremea cu el: un slug greșit ajunge oricum la
 * 404-ul MAGAZINELOR, nu la cel al site-ului. `/industrii/ceva-greșit` mai
 * potrivește si `(public)/[slug]/[pageSlug]`, iar Next randeaza 404-ul din acea
 * ramura, care isi cere si layout-ul de magazin. Nu e ceva adus de paginile
 * astea: `/preturi/typo` face exact la fel si o face de mult. Local iese 500
 * pentru ca layout-ul de magazin cere `SUPABASE_SERVICE_ROLE_KEY`, care e goala
 * in `.env.local`; in productie cheia exista si iese 404.
 */
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industrie } = await params;
  const found = INDUSTRIES.find((item) => item.slug === industrie);
  if (!found) return {};
  return siteMetadata({
    title: `Creare magazin online ${found.seoTitle}`,
    description: found.lead,
    path: `/industrii/${found.slug}`,
  });
}

export default async function IndustriePage({ params }: Props) {
  const { industrie } = await params;
  const found = INDUSTRIES.find((item) => item.slug === industrie);
  if (!found) notFound();

  /* Al doilea nivel, deci primeste firimituri: „Acasa > Industrii > Haine".
     Ultima n-are `href` — e chiar pagina pe care esti. */
  const sir: Firimitura[] = [
    ACASA,
    { label: "Industrii", href: "/industrii" },
    { label: found.label },
  ];

  return <PageShell sir={sir} eyebrow={found.label} title={found.h1} lead={found.lead} />;
}
