import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Roadmap Edinio: ce lansam si ce urmeaza",
  description: "Lista publica a ce e in lucru, ce am livrat recent si ce ne-au cerut cel mai des comercianții. Actualizata lunar.",
  path: "/roadmap",
});

export default function RoadmapPage() {
  return (
    <PageShell
      eyebrow="Roadmap"
      title="Ce lansăm acum și ce urmează"
      lead="Ținem lista publică și o actualizăm lunar. Vezi ce e în lucru, ce am livrat recent și ce ni s-a cerut cel mai des."
    />
  );
}
