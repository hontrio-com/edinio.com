import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Optimizare: viteza, SEO si conversie",
  description: "Imagini redimensionate la marginea retelei, structura pregatita pentru SEO, sitemap per magazin si formulare de comanda facute pentru conversie.",
  path: "/optimizare",
});

export default function OptimizarePage() {
  return (
    <PageShell
      eyebrow="Performanță"
      title="Rapid, găsibil în Google și făcut pentru conversie"
      lead="Imagini redimensionate la marginea rețelei, structură pregătită pentru SEO, sitemap propriu și formulare de comandă testate pe piața din România."
    />
  );
}
