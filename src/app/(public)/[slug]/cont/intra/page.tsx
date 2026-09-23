import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { FormularIntrare } from "@/components/storefront/cont/FormularIntrare";

/* ⚠ Pagina personala: `noindex`, ca si `/retur`. */
export const metadata: Metadata = { robots: { index: false } };

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
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-md w-full mx-auto px-4 py-10 flex-1">
          <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">Contul meu</h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: p.color }} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Intra in cont ca sa vezi comenzile si facturile tale de la {p.storeName}.
          </p>
          <FormularIntrare color={p.color} />
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
