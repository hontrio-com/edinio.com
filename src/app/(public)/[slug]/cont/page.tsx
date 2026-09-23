import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { comenzileMele } from "@/lib/cont/comenzi";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranAcasa } from "@/components/storefront/cont/ecrane/EcranAcasa";

export const metadata: Metadata = { title: "Contul meu", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

const IN_CURS = new Set(["pending", "confirmed", "processing", "shipped"]);

export default async function AcasaInCont({ params }: Props) {
  const { slug } = await params;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, { comenzi }] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    comenzileMele(pag.magazin.id, pag.sesiune.contId, 4, 0),
  ]);
  const inCurs = comenzi.find((c) => IN_CURS.has(c.stare)) ?? null;
  const prenume = (pag.sesiune.nume ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <PaginaCont
      pag={pag}
      rezumat={rezumat}
      activ="acasa"
      titlu={prenume ? `Salut, ${prenume}` : "Contul meu"}
      subtitlu={`Comenzile, facturile si retururile tale de la ${pag.storeName}.`}
    >
      <EcranAcasa rezumat={rezumat} recente={comenzi.slice(0, 3)} inCurs={inCurs} />
    </PaginaCont>
  );
}
