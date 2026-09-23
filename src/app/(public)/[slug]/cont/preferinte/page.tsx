import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { preferintele } from "@/lib/cont/preferinte";
import { ComutatorPreferinta } from "@/components/storefront/cont/ComutatorPreferinta";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Preferinte({ params }: Props) {
  const { slug } = await params;
  const p = await incarcaPaginaDeCont(slug);
  if (!p.sesiune) redirect("/cont/intra");

  const pref = await preferintele(p.magazin.id, p.sesiune.contId);

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          <Link href="/cont" className="text-sm text-muted-foreground underline">
            Inapoi la cont
          </Link>

          <h1 className="text-2xl sm:text-3xl font-black text-foreground mt-4 mb-2">Preferinte de comunicare</h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: p.color }} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Alegerea de aici se aplica tuturor contactelor confirmate din contul tau.
          </p>

          <section className="rounded-xl ring-1 ring-foreground/10 px-4 divide-y divide-foreground/10">
            {pref.areEmail ? (
              <ComutatorPreferinta
                canal="email"
                pornit={pref.primesteEmail}
                eticheta="Emailuri de la magazin"
                explicatie="Mesaje despre cosul lasat neterminat si alte vesti de la magazin. Emailurile despre comenzile tale se trimit oricum."
                color={p.color}
              />
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                Nu ai nicio adresa de email confirmata in cont.
              </p>
            )}

            {pref.areTelefon ? (
              <ComutatorPreferinta
                canal="sms"
                pornit={pref.primesteSms}
                eticheta="SMS-uri de la magazin"
                explicatie="Mesaje pe telefon. Cele despre livrarea comenzilor tale se trimit oricum."
                color={p.color}
              />
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                Nu ai niciun numar de telefon confirmat in cont.
              </p>
            )}
          </section>

          {/*
            ⚠ Se spune pe fata ce NU opreste comutatorul. Un om care stinge
            „emailuri de la magazin" si apoi primeste confirmarea unei comenzi ar
            crede ca alegerea lui n-a fost respectata, cand de fapt cele doua sunt
            lucruri deosebite si asa trebuie sa ramana.
          */}
          <p className="text-xs text-muted-foreground leading-relaxed mt-4">
            Mesajele legate de o comanda a ta (confirmare, livrare, retur) nu sunt marketing si se
            trimit indiferent de alegerea de mai sus.
          </p>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
