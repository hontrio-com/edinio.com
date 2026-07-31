import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Plati cu cardul in magazinul online",
  description: "Incaseaza cu cardul prin Stripe, Netopia, BT iPay, Klarna si Revolut, plus plata ramburs si ridicare din magazin. Se activeaza cu cheile contului tau.",
  path: "/plati-cu-cardul",
});

export default function PlatiCuCardulPage() {
  return (
    <PageShell
      eyebrow="Plăți"
      title="Încasează cu cardul din prima zi"
      lead="Stripe, Netopia, BT iPay, Klarna și Revolut, plus plata ramburs și ridicarea din magazin. Le pornești dintr-un comutator, cu datele contului tău."
    />
  );
}
