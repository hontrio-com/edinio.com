import type { Metadata } from "next";
import { LinkGrid, PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";
import { COMPETITORS } from "@/lib/website/nav";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

export const metadata: Metadata = siteMetadata({
  title: "Compara Edinio cu alte platforme de eCommerce",
  description:
    "Edinio fata de Shopify, Cartum, Wix, WooCommerce, OpenCart si Magento: costuri, integrari romanesti, editor si intretinere.",
  path: "/vs",
});

/*
  ⚠ CONSTRUIESTE firimiturile, desi randeaza `PageShell`. Si e o deosebire
  masurata, nu o scapare: `PageShell` le emite DOAR cand primeste `sir`
  (`PageShell.tsx:66`), iar aici nu primeste — in productie, pe 04.09.2026,
  documentul lui /vs chiar n-avea niciun `BreadcrumbList`. Pus pe
  `faraFirimituri: true` „fiindca randeaza PageShell", pagina ar fi ramas fara
  nicio ierarhie declarata, tacut si cu proba verde.

  `CollectionPage`, fiindca exact asta e: aduna cele sase comparatii.
*/
const jsonLd = paginaSiteJsonLd({
  cale: "vs",
  nume: "Comparatii",
  tip: "CollectionPage",
  descriere: metadata.description as string,
});

export default function ComparatiiPage() {
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
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
    </>
  );
}
