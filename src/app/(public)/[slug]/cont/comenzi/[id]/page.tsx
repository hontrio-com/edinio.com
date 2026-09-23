import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { incarcaPaginaDeCont } from "@/lib/cont/pagina";
import { comandaMea } from "@/lib/cont/comenzi";
import { rezumatulContului } from "@/lib/cont/rezumat";
import { randurileDeBani } from "@/lib/cont/banii-comenzii";
import { detaliileDeLaCheckout } from "@/lib/cont/detalii-checkout";
import { orderStatus } from "@/lib/orders/status";
import { formatDateTime } from "@/lib/utils/format";
import { PaginaCont } from "@/components/storefront/cont/ui/PaginaCont";
import { EcranComanda } from "@/components/storefront/cont/ecrane/EcranComanda";
import { EtichetaStareCont } from "@/components/storefront/cont/ui/piese";
import { BUTON_PRIMAR, STIL_PRIMAR } from "@/components/storefront/cont/ui/clase";

export const metadata: Metadata = { title: "Comanda", robots: { index: false } };

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

export default async function ComandaMea({ params }: Props) {
  const { slug, id } = await params;
  const pag = await incarcaPaginaDeCont(slug);
  if (!pag.sesiune) redirect("/cont/intra");

  const [rezumat, c] = await Promise.all([
    rezumatulContului(pag.magazin.id, pag.sesiune.contId),
    comandaMea(pag.magazin.id, pag.sesiune.contId, id),
  ]);
  /*
    ⚠ `notFound()`, nu „comanda nu e a ta". Functia din baza cere si magazinul, si
    contul: daca n-a gasit nimic, inseamna ori ca nu exista, ori ca e a altcuiva,
    iar cele doua nu au voie sa se deosebeasca pe ecran.
  */
  if (!c) notFound();

  const st = orderStatus(c.stare);
  /*
    ⚠⚠ RANDUL „PRODUSE” E SUMA LINIILOR ARATATE, nu `orders.subtotal`, si coloana
    se aduna pana la total: ce nu se explica primeste randul lui, in loc sa fie
    ascuns. Aceleasi randuri ca in emailul de confirmare; regula si masuratorile
    stau in `banii-comenzii.ts`, unde se pot proba.
  */
  const bani = randurileDeBani(c, pag.setariTva);
  const detalii = detaliileDeLaCheckout(c.detalii, pag.campuriCheckout);

  return (
    <PaginaCont
      pag={pag}
      rezumat={rezumat}
      activ="comenzi"
      inapoi={{ href: "/cont/comenzi", eticheta: "Toate comenzile" }}
      titlu={`Comanda ${c.numar}`}
      subtitlu={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="opacity-75">Plasata pe {formatDateTime(c.creataLa)}</span>
          <EtichetaStareCont ton={st.ton}>{st.label}</EtichetaStareCont>
        </span>
      }
      actiuni={
        c.urmarire?.fel === "direct" ? (
          <a href={c.urmarire.href} target="_blank" rel="noopener noreferrer" className={BUTON_PRIMAR} style={STIL_PRIMAR}>
            Urmareste coletul
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : undefined
      }
    >
      <EcranComanda
        c={c}
        bani={bani}
        detalii={detalii}
        contact={pag.contact}
        numeMagazin={pag.storeName}
        adresaMagazin={pag.adresaMagazin}
      />
    </PaginaCont>
  );
}
