import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { comenzileMele } from "@/lib/cont/comenzi";
import { PE_PAGINA, numarulPaginii } from "@/lib/cont/paginare";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { pluralRo } from "@/lib/utils/format";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranComenzi } from "@/components/storefront/cont/ecrane/EcranComenzi";

export const metadata: Metadata = { title: "Comenzile mele", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
}

export default async function ComenzileMele({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const pagina = numarulPaginii(p);

  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, { comenzi, total }] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    comenzileMele(pag.magazin.id, pag.sesiune.contId, PE_PAGINA, (pagina - 1) * PE_PAGINA),
  ]);
  /* O pagina de dupa capatul listei (link vechi, `?p=` scris de mana): inapoi la prima. */
  if (pagina > 1 && comenzi.length === 0) redirect("/cont/comenzi");

  return (
    <PaginaCont
      pag={pag}
      rezumat={rezumat}
      activ="comenzi"
      titlu="Comenzile mele"
      subtitlu={total > 0 ? `${pluralRo(total, "comanda", "comenzi")}, de la cea mai noua.` : undefined}
    >
      <EcranComenzi comenzi={comenzi} pagina={pagina} pagini={Math.max(1, Math.ceil(total / PE_PAGINA))} />
    </PaginaCont>
  );
}
