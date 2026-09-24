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
  searchParams: Promise<{ mod?: string; sters?: string; cerere?: string; parola?: string }>;
}

export default async function IntraInCont({ params, searchParams }: Props) {
  const { slug } = await params;
  /* Numai forma ecranului; nimic din adresa nu ajunge la server ca identitate. */
  const { mod, sters, cerere, parola } = await searchParams;
  const p = await incarcaPaginaDeCont(slug);

  /* Deja logat: n-are ce cauta aici. */
  if (p.sesiune) redirect("/cont");

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="flex min-h-screen flex-col">
        <EcranIntrare
          numeMagazin={p.storeName}
          greutateTitlu={p.greutateTitlu}
          titlu={p.intrare.titlu}
          text={p.intrare.text}
          avantaje={p.intrare.avantaje}
          modInitial={mod === "inregistrare" ? "inregistrare" : "intrare"}
          dupaStergere={sters === "1" ? { cerere: cerere === "1" ? true : cerere === "0" ? false : null } : null}
          dupaParolaNoua={parola === "1"}
          contact={p.contact}
        />
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
