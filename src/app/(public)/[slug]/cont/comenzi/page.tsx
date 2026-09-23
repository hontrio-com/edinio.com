import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { comenzileMele } from "@/lib/cont/comenzi";
import { orderStatus } from "@/lib/orders/status";
import { formatPrice, formatDate, pluralRo } from "@/lib/utils/format";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}

const PE_PAGINA = 20;

export default async function ComenzileMele({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(p ?? "1", 10) || 1);

  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const { comenzi, total } = await comenzileMele(
    pag.magazin.id,
    pag.sesiune.contId,
    PE_PAGINA,
    (pagina - 1) * PE_PAGINA,
  );
  const paginiTotal = Math.max(1, Math.ceil(total / PE_PAGINA));

  return (
    <StorefrontThemeScope style={pag.resolved.style}>
      <StorePageShell chrome={pag.chrome} design={pag.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">Comenzile mele</h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: pag.color }} />

          {comenzi.length === 0 ? (
            /*
              ⚠ Textul spune adevarul, nu „Nu ai nicio comanda". Comenzile omului
              pot exista si sa nu fie inca legate de cont: le leaga contactul
              verificat, iar o comanda pusa cu alt email nu se potriveste.
            */
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nu am gasit nicio comanda legata de contul tau. Comenzile se leaga singure de adresa cu
              care ai intrat aici. Daca ai comandat cu alta adresa, intra in cont cu ea si le vei vedea.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {pluralRo(total, "comanda", "comenzi")}
              </p>
              <ul className="space-y-3">
                {comenzi.map((c) => {
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
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(c.creataLa)} · {pluralRo(c.bucati, "produs", "produse")}
                            </p>
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

              {paginiTotal > 1 && (
                <div className="flex items-center justify-between mt-6 text-sm">
                  {pagina > 1 ? (
                    <Link href={`/cont/comenzi?p=${pagina - 1}`} className="underline text-muted-foreground">
                      Inapoi
                    </Link>
                  ) : <span />}
                  <span className="text-muted-foreground">Pagina {pagina} din {paginiTotal}</span>
                  {pagina < paginiTotal ? (
                    <Link href={`/cont/comenzi?p=${pagina + 1}`} className="underline text-muted-foreground">
                      Inainte
                    </Link>
                  ) : <span />}
                </div>
              )}
            </>
          )}
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
