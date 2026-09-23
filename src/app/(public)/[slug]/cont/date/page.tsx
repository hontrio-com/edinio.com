import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { areParola, contacteleMele } from "@/lib/cont/date";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranDate } from "@/components/storefront/cont/ecrane/EcranDate";

export const metadata: Metadata = { title: "Datele mele", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function DateleMele({ params }: Props) {
  const { slug } = await params;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, contacte, cuParola] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    contacteleMele(pag.magazin.id, pag.sesiune.contId),
    areParola(pag.magazin.id, pag.sesiune.contId),
  ]);

  return (
    <PaginaCont pag={pag} rezumat={rezumat} activ="date" titlu="Datele mele" subtitlu="Contactele, parola, sesiunile si datele pe care le pastreaza magazinul despre tine.">
      <EcranDate contacte={contacte} comenzi={rezumat.comenzi} areParola={cuParola} />
    </PaginaCont>
  );
}
