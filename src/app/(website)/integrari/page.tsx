import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Integrari: curieri, plati, facturare si marketing",
  description: "Peste 25 de integrari pregatite: curierat, plati online, facturare SmartBill si Oblio, e-mail marketing, Google si marketplace-uri.",
  path: "/integrari",
});

export default function IntegrariPage() {
  return (
    <PageShell
      eyebrow="Integrări"
      title="Peste 25 de integrări, pregătite din prima zi"
      lead="Facturare, curierat, plăți, e-mail marketing, Google și marketplace-uri. Fiecare se activează cu propriile tale chei, în câteva minute."
    />
  );
}
