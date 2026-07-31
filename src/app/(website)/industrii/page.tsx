import type { Metadata } from "next";
import { LinkGrid, PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";
import { INDUSTRIES } from "@/lib/website/nav";

export const metadata: Metadata = siteMetadata({
  title: "Creare magazin online pe industrii",
  description:
    "Magazin online potrivit pe domeniul tau: piese auto, haine, bijuterii, cosmetice, mobila, electronice, petshop, suplimente si articole sport.",
  path: "/industrii",
});

export default function IndustriiPage() {
  return (
    <PageShell
      eyebrow="Industrii"
      title="Magazin online pentru domeniul tău"
      lead="Aceleași unelte, potrivite pe cum vinde fiecare domeniu: mărimi și culori la haine, coduri de piesă la auto, gramaje și valabilitate la suplimente."
    >
      <LinkGrid
        heading="Alege-ți domeniul"
        links={INDUSTRIES.map((industry) => ({
          label: industry.label,
          href: `/industrii/${industry.slug}`,
          description: industry.lead,
        }))}
      />
    </PageShell>
  );
}
