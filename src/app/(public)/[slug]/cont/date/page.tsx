import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { areParola, contacteleMele } from "@/lib/cont/date";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { adresaPozei, profilulContului } from "@/lib/cont/profil";
import { avatarUtilizator } from "@/lib/avatar-blob";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranDate } from "@/components/storefront/cont/ecrane/EcranDate";

export const metadata: Metadata = { title: "Datele mele", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ eroare?: string | string[] }>;
}

/* Numai textele noastre: `?eroare=` vine din adresa, deci nu se afiseaza niciodata ca atare. */
const ERORI: Record<string, string> = {
  iesire: "Nu am putut inchide celelalte sesiuni. Esti in continuare conectat pe toate dispozitivele. Incearca din nou peste cateva minute.",
  export: "Nu am putut pregati fisierul cu datele tale. Incearca din nou peste cateva minute.",
};

export default async function DateleMele({ params, searchParams }: Props) {
  const { slug } = await params;
  const { eroare } = await searchParams;
  const mesajEroare = typeof eroare === "string" ? ERORI[eroare] ?? null : null;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, contacte, cuParola, profil] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    contacteleMele(pag.magazin.id, pag.sesiune.contId),
    areParola(pag.magazin.id, pag.sesiune.contId),
    profilulContului(pag.magazin.id, pag.sesiune.contId),
  ]);

  return (
    <PaginaCont pag={pag} rezumat={rezumat} activ="date" titlu="Datele mele" subtitlu="Profilul, adresele de email, parola, dispozitivele conectate si datele tale.">
      <EcranDate profil={profil} pozaSrc={adresaPozei(profil.pozaLa)} avatarSvg={avatarUtilizator(pag.sesiune.contId, 80)} contacte={contacte} comenzi={rezumat.comenzi} areParola={cuParola} eroare={mesajEroare} />
    </PaginaCont>
  );
}
