import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { preferintele } from "@/lib/cont/preferinte";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranPreferinte } from "@/components/storefront/cont/ecrane/EcranPreferinte";

export const metadata: Metadata = { title: "Preferinte", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Preferinte({ params }: Props) {
  const { slug } = await params;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, pref] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    preferintele(pag.magazin.id, pag.sesiune.contId),
  ]);

  return (
    <PaginaCont pag={pag} rezumat={rezumat} activ="preferinte" titlu="Preferinte" subtitlu="Ce mesaje primesti de la magazin.">
      <EcranPreferinte pref={pref} />
    </PaginaCont>
  );
}
