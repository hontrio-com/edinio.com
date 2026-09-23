import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { EcranIntrare } from "@/components/storefront/cont/ecrane/EcranIntrare";

/* ⚠ Pagina personala: `noindex`, ca si `/retur`. */
export const metadata: Metadata = { title: "Intra in cont", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function IntraInCont({ params }: Props) {
  const { slug } = await params;
  const p = await incarcaPaginaDeCont(slug);

  /* Deja logat: n-are ce cauta aici. */
  if (p.sesiune) redirect("/cont");

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="flex min-h-screen flex-col">
        <EcranIntrare numeMagazin={p.storeName} greutateTitlu={p.greutateTitlu} />
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
