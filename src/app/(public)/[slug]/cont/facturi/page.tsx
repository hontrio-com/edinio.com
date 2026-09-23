import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { facturileMele } from "@/lib/cont/facturi";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranFacturi } from "@/components/storefront/cont/ecrane/EcranFacturi";

export const metadata: Metadata = { title: "Facturi", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}

const PE_PAGINA = 20;

export default async function FacturileMele({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(p ?? "1", 10) || 1);

  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, { facturi, total }] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    facturileMele(pag.magazin.id, pag.sesiune.contId, PE_PAGINA, (pagina - 1) * PE_PAGINA),
  ]);

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
