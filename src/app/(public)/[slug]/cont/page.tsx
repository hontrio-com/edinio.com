import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { RotesteJetonul } from "@/components/storefront/cont/RotesteJetonul";
import { comenzileMele } from "@/lib/cont/comenzi";
import { orderStatus } from "@/lib/orders/status";
import { formatPrice, formatDate, pluralRo } from "@/lib/utils/format";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AcasaInCont({ params }: Props) {
  const { slug } = await params;
  const p = await incarcaPaginaDeCont(slug);

  if (!p.sesiune) redirect("/cont/intra");

  /* Trei randuri pe prima pagina; lista intreaga are ecranul ei. */
  const { comenzi: ultimele, total } = await comenzileMele(p.magazin.id, p.sesiune.contId, 3, 0);

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          {/* ⚠ Singurul loc de unde se poate roti jetonul: o pagina nu poate scrie
              cookie-uri, deci fara chemarea asta toata plasa de rotire si de
              detectie a refolosirii ar fi ramas cod mort. */}
          <RotesteJetonul trebuie={p.sesiune.trebuieRotit} />
          <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">
            {p.sesiune.nume ? `Salut, ${p.sesiune.nume}` : "Contul meu"}
          </h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: p.color }} />

          {ultimele.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              Nu am gasit inca nicio comanda legata de contul tau. Comenzile se leaga singure de adresa
              cu care ai intrat aici. Daca ai comandat cu alta adresa, intra in cont cu ea.
            </p>
          ) : (
            <section className="mb-8">
              <h2 className="font-semibold text-foreground mb-3">Ultimele comenzi</h2>
              <ul className="space-y-3">
                {ultimele.map((c) => {
                  const st = orderStatus(c.stare);
                  return (
                    <li key={c.orderId}>
                      <Link
                        href={`/cont/comenzi/${c.orderId}`}
                        className="block rounded-xl ring-1 ring-foreground/10 p-4 hover:ring-foreground/20 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{c.numar}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(c.creataLa)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-foreground">{formatPrice(c.total)}</p>
                            <div className="mt-1 flex justify-end">
                              <EtichetaStare ton={st.ton} marime="mic">{st.label}</EtichetaStare>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {total > ultimele.length && (
                <Link href="/cont/comenzi" className="inline-block mt-3 text-sm underline" style={{ color: p.color }}>
                  Vezi toate comenzile ({pluralRo(total, "comanda", "comenzi")})
                </Link>
              )}
            </section>
          )}

          <nav className="flex flex-wrap gap-4 mb-6 text-sm">
            <Link href="/cont/comenzi" className="underline text-muted-foreground">Comenzile mele</Link>
            <Link href="/cont/preferinte" className="underline text-muted-foreground">Preferinte de comunicare</Link>
          </nav>

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
