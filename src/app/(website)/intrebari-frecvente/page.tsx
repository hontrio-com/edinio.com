import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Intrebari frecvente despre Edinio",
  description: "Cat costa, cat durează, ce se intampla cu magazinul actual si ce include mentenanta gratuita. Raspunsuri scurte si clare.",
  path: "/intrebari-frecvente",
});

export default function IntrebariFrecventePage() {
  return (
    <PageShell
      eyebrow="Întrebări frecvente"
      title="Răspunsuri scurte la ce ne întrebați cel mai des"
      lead="Cât costă, cât durează, ce se întâmplă cu magazinul actual și ce include mentenanța. Dacă nu găsești răspunsul, scrie-ne."
    />
  );
}
