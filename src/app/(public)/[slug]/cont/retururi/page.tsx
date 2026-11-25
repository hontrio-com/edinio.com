import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Undo2 } from "lucide-react";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { retururileMele } from "@/lib/cont/date";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranRetururi } from "@/components/storefront/cont/ecrane/EcranRetururi";
import { BUTON_SECUNDAR } from "@/components/storefront/cont/ui/clase";

export const metadata: Metadata = { title: "Retururi", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RetururileMele({ params }: Props) {
  const { slug } = await params;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, retururi] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    retururileMele(pag.magazin.id, pag.sesiune.contId),
  ]);

  return (
    <PaginaCont
      pag={pag}
      rezumat={rezumat}
      activ="retururi"
      titlu="Retururi"
      subtitlu="Cererile tale de retur si stadiul lor."
      actiuni={
        /* ⚠ Formularea ceruta de OUG 18/2026: o eticheta neechivoca, vizibila si in cont. */
        /*
          ⚠ `<a>`, NU `<Link>` (25.11.2026): pagina de retur e in afara zonei de cont. Cu navigare de client,
          pixelii magazinului se montau in documentul incarcat in zona de cont si ramaneau vii aici la „Inapoi”.
        */
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- dinadins, vezi mai sus
        <a href="/retur" className={BUTON_SECUNDAR}>
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Retrage-te din contract
        </a>
      }
    >
      <EcranRetururi retururi={retururi} />
    </PaginaCont>
  );
}
