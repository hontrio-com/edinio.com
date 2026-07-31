import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Mentenanta gratuita pe viata, la orice abonament",
  description: "Actualizari, securitate, copii de siguranta si disponibilitate, incluse in orice abonament Edinio. Suport 7 zile din 7, fara costuri separate.",
  path: "/mentenanta-gratuita",
});

export default function MentenantaPage() {
  return (
    <PageShell
      eyebrow="Inclus în orice abonament"
      title="Mentenanță gratuită pe viață"
      lead="Actualizări, securitate, copii de siguranță și disponibilitate. Nu plătești separat pentru ele și nu trebuie să ții minte nimic. Suport 7 zile din 7."
    />
  );
}
