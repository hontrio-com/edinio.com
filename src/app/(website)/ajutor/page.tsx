import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Centru de ajutor Edinio",
  description: "Ghiduri pas cu pas: cum publici magazinul, cum conectezi un curier, cum emiti prima factura. Scrise pe intelesul oricui.",
  path: "/ajutor",
});

export default function AjutorPage() {
  return (
    <PageShell
      eyebrow="Centru de ajutor"
      title="Ghiduri pas cu pas pentru fiecare funcție"
      lead="Cum îți publici magazinul, cum conectezi un curier, cum emiți prima factură. Scris pe înțelesul oricui, fără termeni tehnici."
    />
  );
}
