import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { NumaraCitirea } from "@/components/website/blog/NumaraCitirea";
import { articolDupaSlug, undeS_aMutat } from "@/lib/blog/citire";
import { CorpArticol } from "@/components/website/blog/CorpArticol";
import { articolJsonLd } from "@/lib/blog/jsonld";
import { jsonLdSafe } from "@/lib/json-ld";
import { siteMetadata } from "@/lib/website/metadata";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await articolDupaSlug(slug);
  if (!a) return { title: "Articol negăsit" };

  /*
    ⚠ COPERTA MERGE SI PE `twitter`, NU DOAR PE `openGraph` (04.09.2026).
    Pana acum se scria doar `openGraph.images`, iar `twitter.images` ramanea
    bannerul generic mostenit din radacina: masurat in productie, un articol
    partajat pe X arata poza platformei, nu coperta lui. X citeste intai
    `twitter:*` si cade pe `og:image` doar cand acesta LIPSESTE — prezent si
    gresit, castiga el. Helperul le pune acum pe amandoua din acelasi camp.

    Tot de aici vin si `og:type=article`, `article:published_time`,
    `article:modified_time` si `article:section`, care lipseau cu totul.
  */
  const meta = siteMetadata({
    title: a.seo_title?.trim() || a.title,
    description: a.seo_description?.trim() || a.excerpt || "",
    path: `/blog/${a.slug}`,
    imagine: a.og_image_url || a.cover_url,
    articol: {
      publicatLa: a.published_at,
      /* Aceeasi data ca in JSON-LD: continutul, nu atingerile administrative. */
      modificatLa: a.content_updated_at || a.published_at,
      rubrica: a.categorie?.name,
    },
  });

  /* Adresa canonică scrisă de mână bate calea. Se folosește doar când același
     text e publicat și altundeva, ca să nu se împartă semnalul între copii. */
  if (a.canonical_url) meta.alternates = { canonical: a.canonical_url };

  /* ⚠ `noindex` NU e o părere, e o instrucțiune. Pus, scoate pagina din Google
     complet; de aceea stă într-o bifă separată în editor, nu lângă restul. */
  if (a.noindex) meta.robots = { index: false, follow: true };

  return meta;
}

export default async function ArticolBlogPage({ params }: Props) {
  const { slug } = await params;
  const a = await articolDupaSlug(slug);

  if (!a) {
    /*
      ⚠ REDIRECTAREA SE CAUTĂ ABIA AICI, pe drumul spre 404.

      Un articol viu nu trece niciodată prin bucata asta, deci tabela de
      redirectări nu costă nimic la citirile obișnuite. Iar un articol mutat nu
      dă 404: adresa veche trăiește în Google, în legături și în istoricul
      cuiva, și un 308 duce tot ce a strâns la adresa nouă.
    */
    const nou = await undeS_aMutat(slug);
    if (nou) permanentRedirect(`/blog/${nou}`);
    notFound();
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(articolJsonLd(a)) }} />
      <NumaraCitirea slug={a.slug} />
      <CorpArticol a={a} />
    </>
  );
}
