import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { HeroPagina } from "@/components/website/sections/Hero";
import { EticheraVersus } from "@/components/website/sections/EticheraVersus";
import { TabelVersus } from "@/components/website/sections/TabelVersus";
import { siteMetadata } from "@/lib/website/metadata";
import { COMPETITORS } from "@/lib/website/nav";
import type { VersusKey } from "@/lib/website/versus-culori";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/**
 * Paginile de comparatie, din aceeasi lista care alimenteaza meniul.
 *
 * Textele sunt publicitate comparativa: afirmatiile trebuie sa rimana
 * verificabile si sa compare aceleasi caracteristici. Vezi nota din
 * `src/lib/website/nav.ts`.
 */

interface Props {
  params: Promise<{ competitor: string }>;
}

/** Ultimul segment din `href`, ex. "shopify" din "/vs/shopify". */
function slugOf(href: string) {
  return href.split("/").pop() ?? "";
}

export function generateStaticParams() {
  return COMPETITORS.map((competitor) => ({ competitor: slugOf(competitor.href) }));
}

/* Doar slug-urile din lista: `generateStaticParams` le prerandeaza pe cele sase,
   iar `dynamicParams = false` face ca orice altceva sa dea 404 fara sa atinga
   serverul. (Randul asta trimitea la o nota din `industrii/[industrie]/page.tsx`,
   fisier sters pe 04.09.2026 — deci explicatia a fost mutata aici.) */
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor } = await params;
  const found = COMPETITORS.find((item) => slugOf(item.href) === competitor);
  if (!found) return {};
  /*
    ⚠ ȘABLON COMUN PENTRU METADATE, CONȚINUT INDIVIDUALIZAT. Cele două fraze de
    mai jos sunt aceleași pe toate șase paginile, cu numele schimbat — asta e
    cerut dinadins: intenția de căutare e identică („Edinio sau X?"), deci și
    promisiunea din rezultate trebuie să fie. Ce rămâne DIFERIT pe fiecare
    pagină e tot ce contează: titlul vizibil (`found.titlu`), fraza de sub el
    (`found.lead`), tabelul din `comparatii-vs.ts` cu rândurile lui, sursele și
    data verificării. Nimic din alea nu se uniformizează.

    ⚠ `found.lead` NU MAI E DESCRIEREA. Era fraza lungă de sub titlu, aleasă
    fiindcă e cea mai aproape de ce citește omul pe pagină; acum descrierea e
    cerută cuvânt cu cuvânt. `lead` rămâne folosit — e chiar textul de pe pagină
    și tot el intră în firimiturile structurate.
  */
  return siteMetadata({
    title: `Edinio vs ${found.name}: care platformă eCommerce ți se potrivește?`,
    description:
      `Edinio sau ${found.name}? Compară costurile, integrările, mentenanța și modul de ` +
      "administrare înainte să alegi platforma pentru magazinul tău online.",
    path: found.href,
  });
}

export default async function ComparatiePage({ params }: Props) {
  const { competitor } = await params;
  const found = COMPETITORS.find((item) => slugOf(item.href) === competitor);
  if (!found) notFound();

  /*
    ⚠ SINGURA PAGINA DE PREZENTARE CARE CHIAR STA SUB ALTA, si de aceea singura
    cu `parinte`. Firimiturile obisnuite au doua trepte, fiindca site-ul a fost
    plat; aici ierarhia adevarata e Acasa -> Comparatii -> pagina asta. Fara
    treapta din mijloc am fi declarat ca pagina atarna direct de radacina, adica
    am fi sarit peste chiar pagina din care se ajunge la ea.

    ⚠ CONSTRUIESTE firimiturile: `HeroPagina` nu primeste `sir`, deci nu emite
    niciunul. (Cadrul e cerut de client, vezi nota de mai jos.)

    ⚠ Numele e chiar titlul clientului, nu unul inventat aici.
  */
  const jsonLd = paginaSiteJsonLd({
    cale: `vs/${competitor}`,
    nume: found.titlu,
    descriere: found.lead,
    parinte: { nume: "Comparatii", cale: "vs" },
  });

  return (
    /*
      ⚠ ACELAȘI CADRU CA LA CELELALTE PAGINI (`HeroPagina`), nu `PageShell`.
      Cerut de client (13.08). `PageShell` e capul scurt al paginilor în care
      ajungi căutând ceva anume — ajutor, termeni; astea sunt pagini
      care CONVING, deci primul ecran trebuie să fie afirmația, cu butoanele ei.

      ⚠ ETICHETA spune cu cine se compară, fiindcă titlul nu mai spune. Titlurile
      sunt ale clientului și vorbesc despre ce câștigi („O alternativă românească
      la Shopify"), nu despre cine cu cine — fără eticheta de deasupra, omul n-ar
      ști pe ce pagină a ajuns.

      ⚠ A fost o vreme cu SIGLE (13.08), scoase la cererea clientului o zi mai
      târziu. Acum numele celor două platforme sunt scrise, fiecare în culoarea
      mărcii lui. Cheia e chiar slug-ul din adresă, deci nu se poate desincroniza:
      `/vs/shopify` ia culoarea `shopify`. Un slug fără culoare oprește build-ul,
      în loc să lase un gol în pagină — vezi tipul `VersusKey`.
    */
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
      <HeroPagina
        eticheta={<EticheraVersus cheie={competitor as VersusKey} />}
        title={found.titlu}
        lead={found.lead}
        cta={{ label: "Începe gratuit", href: "/register" }}
        secundara={{ label: "Vezi prețurile", href: "/preturi" }}
      />

      {/* Tabelul, din PDF-ul clientului. Vezi `comparatii-vs.ts`. */}
      <TabelVersus cheie={competitor as VersusKey} />

      {/* Aceeași bandă de final ca pe pagina de start, „Integrări" și
          „Mentenanță gratuită". */}
      <FinalCta />
    </>
  );
}
