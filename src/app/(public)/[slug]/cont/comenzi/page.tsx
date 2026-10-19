import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { comenzileMele } from "@/lib/cont/comenzi";
import { adresaComenzilor, areFiltre, citesteFiltrele } from "@/lib/cont/cautare-comenzi";
import { PE_PAGINA, numarulPaginii } from "@/lib/cont/paginare";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { pluralRo } from "@/lib/utils/format";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranComenzi } from "@/components/storefront/cont/ecrane/EcranComenzi";

export const metadata: Metadata = { title: "Comenzile mele", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string | string[]; q?: string | string[]; stare?: string | string[]; perioada?: string | string[] }>;
}

export default async function ComenzileMele({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const { p } = sp;
  const pagina = numarulPaginii(p);
  /* Cautarea din bara de deasupra listei: o face baza, nu pagina (vezi `cautare-comenzi.ts`). */
  const filtre = citesteFiltrele(sp);
  const cauta = areFiltre(filtre);

  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, { comenzi, total }] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    comenzileMele(pag.magazin.id, pag.sesiune.contId, PE_PAGINA, (pagina - 1) * PE_PAGINA, filtre),
  ]);
  /*
   * O pagina de dupa capatul listei (link vechi, `?p=` scris de mana): inapoi la prima.
   * ⚠ Cu tot cu filtre: altfel o cautare cu doua pagini, ingustata pe a doua, ar fi
   * aruncat omul in lista intreaga, cu campurile golite.
   */
  if (pagina > 1 && comenzi.length === 0) redirect(adresaComenzilor(filtre));

  /* Cu filtre, numarul e al celor GASITE; fara niciuna gasita, spune starea goala de dedesubt. */
  const subtitlu = total === 0
    ? undefined
    : `${cauta ? pluralRo(total, "comanda gasita", "comenzi gasite") : pluralRo(total, "comanda", "comenzi")}, de la cea mai noua.`;

  return (
    <PaginaCont
      pag={pag}
      rezumat={rezumat}
      activ="comenzi"
      titlu="Comenzile mele"
      subtitlu={subtitlu}
    >
      <EcranComenzi
        comenzi={comenzi}
        pagina={pagina}
        pagini={Math.max(1, Math.ceil(total / PE_PAGINA))}
        filtre={filtre}
        comenziInCont={rezumat.comenzi}
      />
    </PaginaCont>
  );
}
