import type { Metadata } from "next";
import { LinkGrid, PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";
import { COMPETITORS } from "@/lib/website/nav";

export const metadata: Metadata = siteMetadata({
  title: "Compara Edinio cu alte platforme de eCommerce",
  description:
    "Edinio fata de Shopify, Cartum, Wix, WooCommerce, OpenCart si Magento: costuri, integrari romanesti, editor si intretinere.",
  path: "/vs",
});

export default function ComparatiiPage() {
  return (
    <PageShell
      eyebrow="De ce noi"
      title="Compară Edinio cu alte platforme"
      lead="Fără exagerări: fiecare platformă are cazuri în care e alegerea bună. Mai jos scrie clar unde diferă de Edinio și pentru cine e fiecare."
    >
      <LinkGrid
        heading="Comparații"
        links={COMPETITORS.map((competitor) => ({
          label: `Edinio vs ${competitor.name}`,
          href: competitor.href,
          description: competitor.description,
        }))}
      />
    </PageShell>
  );
}
