import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { comandaMea } from "@/lib/cont/comenzi";
import { randurileDeBani } from "@/lib/cont/banii-comenzii";
import { orderStatus } from "@/lib/orders/status";
import { AnuleazaComanda } from "@/components/storefront/cont/AnuleazaComanda";
import { formatPrice, formatDateTime, pluralRo } from "@/lib/utils/format";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

function Rand({ eticheta, valoare }: { eticheta: string; valoare: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{eticheta}</span>
      <span className="text-sm text-foreground text-right">{valoare}</span>
    </div>
  );
}

export default async function ComandaMea({ params }: Props) {
  const { slug, id } = await params;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const c = await comandaMea(pag.magazin.id, pag.sesiune.contId, id);
  /*
    ⚠ `notFound()`, nu „comanda nu e a ta". Functia din baza cere si magazinul, si
    contul: daca n-a gasit nimic, inseamna ori ca nu exista, ori ca e a altcuiva,
    iar cele doua nu au voie sa se deosebeasca pe ecran.
  */
  if (!c) notFound();

  const st = orderStatus(c.stare);
  const redusa = c.vedere === "redusa";

  /* ⚠ Aceleasi randuri ca in emailul de confirmare; vezi `banii-comenzii.ts`. */
  const bani = randurileDeBani(c, pag.setariTva);

  return (
    <StorefrontThemeScope style={pag.resolved.style}>
      <StorePageShell chrome={pag.chrome} design={pag.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          <Link href="/cont/comenzi" className="text-sm text-muted-foreground underline">
            Inapoi la comenzi
          </Link>

          <div className="flex items-start justify-between gap-3 mt-4 mb-1">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">{c.numar}</h1>
            <EtichetaStare ton={st.ton}>{st.label}</EtichetaStare>
          </div>
          <p className="text-xs text-muted-foreground mb-6">{formatDateTime(c.creataLa)}</p>

          <section className="rounded-xl ring-1 ring-foreground/10 p-4 mb-4">
            <h2 className="font-semibold text-foreground mb-3">
              {pluralRo(c.linii.length, "produs", "produse")}
            </h2>
            <ul className="space-y-2">
              {c.linii.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-foreground">
                    {l.nume}
                    {l.cantitate > 1 && <span className="text-muted-foreground"> x {l.cantitate}</span>}
                  </span>
                  <span className="text-sm text-foreground whitespace-nowrap">
                    {formatPrice(l.pret * l.cantitate)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl ring-1 ring-foreground/10 p-4 mb-4">
            {/*
              ⚠⚠ RANDUL „PRODUSE” E SUMA LINIILOR ARATATE, nu `orders.subtotal`,
              si coloana se aduna pana la total: ce nu se explica primeste randul
              lui, in loc sa fie ascuns. Regula si masuratorile stau in
              `banii-comenzii.ts`, unde se pot proba.
            */}
            {bani.map((r) => (
              <Rand key={r.eticheta} eticheta={r.eticheta} valoare={r.valoare} />
            ))}
            <div className="flex items-baseline justify-between gap-4 pt-2 mt-1 border-t border-foreground/10">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-bold text-foreground">{formatPrice(c.total)}</span>
            </div>
            {/*
              ⚠ „Incasat" NU e `payment_status = 'paid'`: la ramburs curierul ia
              banii la usa si nimeni nu intoarce campul. Regula vine din baza,
              din chiar functia pe care o foloseste si panoul.
            */}
            <p className="text-xs text-muted-foreground mt-2">
              {c.incasata ? "Plata a intrat." : "Plata nu a intrat inca."}
            </p>
          </section>

          {redusa ? (
            /*
              ⚠ Vederea REDUSA e starea comenzilor revendicate cu numarul comenzii
              plus un contact. Numerele de comanda sunt secventiale la aproape
              toate magazinele, deci usa aceea e un oracol: pana cand un contact
              DE PE comanda e verificat printr-un cod, adresa, factura si AWB-ul
              nu se arata.
            */
            <p className="text-sm text-muted-foreground leading-relaxed">
              Comanda asta a fost legata de cont doar pe numarul ei, deci arata putin. Adresa de livrare,
              factura si urmarirea coletului se deschid dupa ce confirmi, printr-un cod, un contact de pe ea.
            </p>
          ) : (
            <>
              {c.livrare && (
                <section className="rounded-xl ring-1 ring-foreground/10 p-4 mb-4">
                  <h2 className="font-semibold text-foreground mb-3">Livrare</h2>
                  {c.livrare.punct ? (
                    <Rand eticheta="Ridicare din" valoare={c.livrare.punct} />
                  ) : (
                    <Rand eticheta="Adresa" valoare={[c.livrare.adresa, c.livrare.oras, c.livrare.judet].filter(Boolean).join(", ")} />
                  )}
                  {c.numeCurier && <Rand eticheta="Curier" valoare={c.numeCurier} />}
                  {c.awb && <Rand eticheta="AWB" valoare={c.awb} />}
                  {/*
                    ⚠ Butonul de urmarire apare NUMAI cand avem cu adevarat o
                    adresa. Din 17 curieri, doar sapte o dau; pentru ceilalti se
                    arata numarul AWB si atat, fiindca un buton care duce nicaieri
                    e mai rau decat lipsa lui.
                  */}
                  {c.urmarire && (
                    <a
                      href={c.urmarire}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-block mt-2 text-sm underline"
                      style={{ color: pag.color }}
                    >
                      Urmareste coletul
                    </a>
                  )}
                </section>
              )}

              {c.factura && (
                <section className="rounded-xl ring-1 ring-foreground/10 p-4 mb-4">
                  <h2 className="font-semibold text-foreground mb-3">Factura</h2>
                  <Rand
                    eticheta="Numar"
                    valoare={[c.factura.serie, c.factura.numar].filter(Boolean).join(" ")}
                  />
                  {/*
                    ⚠ Butonul duce la o ruta a NOASTRA, niciodata la adresa casei
                    de facturare. PDF-ul se aduce viu, pe server, cu acreditarile
                    comerciantului, si trece prin trei garzi: octetii chiar incep
                    cu `%PDF-` (o adresa care cere autentificare raspunde 200 cu o
                    pagina de login), documentul nu e de pe o gazda de TEST (un PDF
                    de sandbox e valid si trece de prima garda), si comanda nu e
                    una legata doar pe numarul ei.
                  */}
                  <a
                    href={`/api/cont/factura/${c.orderId}`}
                    className="inline-block mt-2 text-sm underline"
                    style={{ color: pag.color }}
                  >
                    Descarca factura
                  </a>
                </section>
              )}

              {c.firma && (
                <section className="rounded-xl ring-1 ring-foreground/10 p-4 mb-4">
                  <h2 className="font-semibold text-foreground mb-3">Facturat pe firma</h2>
                  <Rand eticheta="Denumire" valoare={c.firma.denumire ?? ""} />
                  {c.firma.cui && <Rand eticheta="CUI" valoare={c.firma.cui} />}
                </section>
              )}
            </>
          )}

          <div className="space-y-4">
            {/* ⚠ Butonul apare numai la `pending`, dar apararea e in baza, nu aici. */}
            {c.stare === "pending" && !redusa && <AnuleazaComanda orderId={c.orderId} />}

            <Link href={`/retur?order=${encodeURIComponent(c.numar)}`} className="block text-sm underline text-muted-foreground">
              Vreau sa returnez produse din aceasta comanda
            </Link>
          </div>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
