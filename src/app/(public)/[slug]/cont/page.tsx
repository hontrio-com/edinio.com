import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AcasaInCont({ params }: Props) {
  const { slug } = await params;
  const p = await incarcaPaginaDeCont(slug);

  if (!p.sesiune) redirect("/cont/intra");

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">
            {p.sesiune.nume ? `Salut, ${p.sesiune.nume}` : "Contul meu"}
          </h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: p.color }} />

          {/*
            ⚠ Etapa A se opreste aici, si o spune pe fata in loc sa arate ecrane
            goale. Comenzile, facturile si retururile vin in Etapa B si D, dupa
            migratia 5. Un „Nu ai nicio comanda" pus acum ar fi fost o minciuna:
            comenzile omului exista, doar nu sunt inca legate de cont.
          */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Contul tau e deschis. Istoricul comenzilor si al facturilor se adauga aici in curand.
          </p>

          <form method="post" action="/api/cont/iesire">
            <button type="submit" className="text-sm text-muted-foreground underline">
              Iesi din cont
            </button>
          </form>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
