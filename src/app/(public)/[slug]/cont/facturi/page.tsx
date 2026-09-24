import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { facturileMele } from "@/lib/cont/facturi";
import { PE_PAGINA, numarulPaginii } from "@/lib/cont/paginare";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranFacturi } from "@/components/storefront/cont/ecrane/EcranFacturi";

export const metadata: Metadata = { title: "Facturi", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
}

export default async function FacturileMele({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const pagina = numarulPaginii(p);

  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, { facturi, total }] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    facturileMele(pag.magazin.id, pag.sesiune.contId, PE_PAGINA, (pagina - 1) * PE_PAGINA),
  ]);
  /* O pagina de dupa capatul listei (link vechi, `?p=` scris de mana): inapoi la prima. */
  if (pagina > 1 && facturi.length === 0) redirect("/cont/facturi");

  return (
    <PaginaCont
      pag={pag}
      rezumat={rezumat}
      activ="facturi"
      titlu="Facturi"
      subtitlu={`Documentele emise de ${pag.storeName} pentru comenzile tale.`}
    >
      <EcranFacturi
        facturi={facturi}
        pagina={pagina}
        pagini={Math.max(1, Math.ceil(total / PE_PAGINA))}
        emailMagazin={pag.contact.email}
      />
    </PaginaCont>
  );
}
