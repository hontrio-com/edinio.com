import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { contacteleMele } from "@/lib/cont/date";
import { comenzileMele } from "@/lib/cont/comenzi";
import { GestioneazaContacte } from "@/components/storefront/cont/GestioneazaContacte";
import { StergeContul } from "@/components/storefront/cont/StergeContul";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function DateleMele({ params }: Props) {
  const { slug } = await params;
  const p = await incarcaPaginaDeCont(slug);
  if (!p.sesiune) redirect("/cont/intra");

  const [contacte, { total }] = await Promise.all([
    contacteleMele(p.magazin.id, p.sesiune.contId),
    comenzileMele(p.magazin.id, p.sesiune.contId, 1, 0),
  ]);

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          <Link href="/cont" className="text-sm text-muted-foreground underline">
            Inapoi la cont
          </Link>

          <h1 className="text-2xl sm:text-3xl font-black text-foreground mt-4 mb-2">Datele mele</h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: p.color }} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Contactele confirmate sunt si cheia cu care intri in cont, si felul in care comenzile tale
            se leaga de el.
          </p>

          <GestioneazaContacte contacte={contacte} color={p.color} />

          <section className="mt-10 space-y-4">
            <h2 className="font-semibold text-foreground">Datele tale</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Poti descarca tot ce pastram despre tine la acest magazin: contul, contactele,
              comenzile, retururile, preferintele si jurnalul intrarilor.
            </p>
            {/* ⚠ Formular, nu legatura: descarcarea trece prin POST, deci are si
                poarta de origine, si merge fara JavaScript. */}
            <form method="post" action="/api/cont/export">
              <button type="submit" className="text-sm underline" style={{ color: p.color }}>
                Descarca datele mele
              </button>
            </form>
            <div className="pt-4">
              <StergeContul comenzi={total} />
            </div>
          </section>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
