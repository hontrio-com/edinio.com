import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { retururileMele } from "@/lib/cont/date";
import { formatDate, pluralRo } from "@/lib/utils/format";

export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

/** Starile cererilor de retur, scrise pentru cumparator. */
const STARE: Record<string, string> = {
  nou: "Trimisa",
  aprobat: "Aprobata",
  respins: "Respinsa",
  rambursat: "Banii intorsi",
};

export default async function RetururileMele({ params }: Props) {
  const { slug } = await params;
  const p = await incarcaPaginaDeCont(slug);
  if (!p.sesiune) redirect("/cont/intra");

  const retururi = await retururileMele(p.magazin.id, p.sesiune.contId);

  return (
    <StorefrontThemeScope style={p.resolved.style}>
      <StorePageShell chrome={p.chrome} design={p.resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-10 flex-1">
          <Link href="/cont" className="text-sm text-muted-foreground underline">
            Inapoi la cont
          </Link>

          <h1 className="text-2xl sm:text-3xl font-black text-foreground mt-4 mb-2">Retururile mele</h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: p.color }} />

          {retururi.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nu ai nicio cerere de retur. Poti cere retragerea din contract in 14 zile de la primirea
              produsului, din pagina comenzii.
            </p>
          ) : (
            <ul className="space-y-3">
              {retururi.map((r) => (
                <li key={r.returId} className="rounded-xl ring-1 ring-foreground/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">Comanda {r.numarComanda}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(r.creatLa)} · {pluralRo(r.bucati, "produs", "produse")}
                      </p>
                    </div>
                    <span className="text-sm text-foreground shrink-0">{STARE[r.stare] ?? r.stare}</span>
                  </div>
                  {r.motiv && (
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{r.motiv}</p>
                  )}
                  {/*
                    ⚠ IBAN-ul vine DEJA mascat din baza, la ultimele patru cifre. O
                    mascare facuta aici s-ar fi putut ocoli de a doua randare, de
                    export sau de urmatorul ecran care citeste aceeasi functie.
                  */}
                  {r.ibanMascat && (
                    <p className="text-xs text-muted-foreground mt-2">Restituire in contul {r.ibanMascat}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
