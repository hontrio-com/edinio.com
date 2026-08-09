import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

/**
 * Blogul, care a luat locul paginii de Roadmap (cerut 2026-08-09: „o să
 * înlocuim definitiv secțiunea Roadmap cu Blog").
 *
 * ⚠ E o COAJĂ, ca și Roadmap-ul dinaintea ei: `PageShell` cu titlu și
 * introducere, fără articole. A fost redenumită în loc să fie ștearsă tocmai ca
 * linkurile din meniu și din subsol să ducă undeva, nu în 404.
 *
 * ⚠ TEXTELE DE MAI JOS SUNT PUSE DE MINE, nu de client. Sunt scrise ca să nu
 * promită articole care nu există încă. Se înlocuiesc când vine conținutul.
 *
 * Vechea adresă `/roadmap` e redirecționată permanent aici, din `next.config.ts`.
 */
export const metadata: Metadata = siteMetadata({
  title: "Blog Edinio: ghiduri si noutati despre vanzarea online",
  description: "Ghiduri practice despre magazine online, curierat, facturare si vanzare in Romania, plus noutatile platformei Edinio.",
  path: "/blog",
});

export default function BlogPage() {
  return (
    <PageShell
      eyebrow="Blog"
      title="Ghiduri și noutăți despre vânzarea online"
      lead="Scriem despre ce ține un magazin online pe picioare în România: curierat, facturare, plăți și tot ce aflăm construind Edinio."
    />
  );
}
