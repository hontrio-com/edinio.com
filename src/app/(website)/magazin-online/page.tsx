import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Magazin online la cheie, fara cunostinte tehnice",
  description: "Magazin online complet: pagini de produs cu variante, categorii, cos si checkout. Alegi un design si schimbi orice, fara o linie de cod.",
  path: "/magazin-online",
});

export default function MagazinOnlinePage() {
  return (
    <PageShell
      eyebrow="Magazin online"
      title="Un magazin online care arată ca al unui brand mare"
      lead="Pagini de produs cu variante, categorii, coș și checkout. Alegi dintre modelele de design și schimbi orice, fără o linie de cod."
    />
  );
}
