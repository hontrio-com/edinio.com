import type { Metadata } from "next";
import { BandaAjutor } from "@/components/website/ajutor/BandaAjutor";
import { CarduriCategorii } from "@/components/website/ajutor/CarduriCategorii";
import { CautareGhiduri } from "@/components/website/ajutor/CautareGhiduri";
import { AJUTOR_CATEGORII_TITLU, AJUTOR_TITLU, CATEGORII_AJUTOR } from "@/lib/website/ajutor";
import { hubAjutorJsonLd } from "@/lib/website/ajutor-jsonld";
import { jsonLdSafe } from "@/lib/json-ld";
import { siteMetadata } from "@/lib/website/metadata";
import { cn } from "@/lib/utils/cn";
import { H1_MIC } from "@/lib/website/tipografie";

export const metadata: Metadata = siteMetadata({
  title: "Centru de ajutor Edinio",
  description:
    "Ghiduri pas cu pas pentru magazinul tau online: produse, comenzi, livrare, plati, facturare si design. Cauta raspunsul sau scrie-ne.",
  path: "/ajutor",
});

/**
 * Pagina de start a centrului de ajutor.
 *
 * ═══ AȘEZAREA E CEA DIN SCHIȚA CLIENTULUI (19.08) ═══
 *
 * Titlul centrat, bara de căutare lată sub el, apoi rândul „Găsește răspunsuri
 * rapide în funcție de categorie” aliniat la STÂNGA, cardurile de categorie, iar
 * jos, despărțită printr-o linie, banda de contact cu trei butoane.
 *
 * Schița a fost urmată cap-coadă. Singurele două abateri, amândouă notate acolo
 * unde apar: șase categorii în loc de trei (`lib/website/ajutor.ts`), și lipsa
 * unui rând sub titlu, pe care schița nu-l avea și pe care nu l-am adăugat.
 *
 * ⚠ TITLUL PAGINII NU E `PageShell` ȘI NICI `PageHero`. Amândouă aduc butoanele
 * „Începe gratuit” și „Vezi prețurile” sau un cap cu firimituri și margini care
 * nu se potrivesc cu o bară de căutare lipită sub titlu. Aici omul are DEJA cont
 * și o problemă; un îndemn la înscriere în capul paginii de ajutor e reclamă
 * pusă peste un om care caută ceva.
 *
 * ⚠ NU ARE `FinalCta`, spre deosebire de celelalte pagini de site. Banda de
 * contact e chiar sfârșitul potrivit: cine ajunge în josul unui centru de ajutor
 * fără să fi găsit răspunsul are nevoie de un om, nu de un buton de înscriere.
 *
 * ═══ MUTAREA PE `ajutor.edinio.com` ═══
 *
 * Clientul a spus (19.08) că paginile astea ajung pe subdomeniu. Nu s-a pregătit
 * nimic acum, dinadins; lista lucrurilor de atins atunci e în capul lui
 * `lib/website/ajutor.ts`, iar adresele se construiesc toate dintr-un singur
 * prefix (`RADACINA`), tocmai ca mutarea să nu însemne o căutare prin componente.
 */
export default function AjutorPage() {
  return (
    <>
      {/* Nodul PAGINII. Identitatea (`Organization`, `WebSite`) vine din layout,
          firimituri n-are: e treapta de sus. Vezi `ajutor-jsonld.ts`. */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(hubAjutorJsonLd(CATEGORII_AJUTOR)) }} />
      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-5 pt-14 pb-16 sm:px-6 lg:px-8 lg:pt-20 lg:pb-20">
          {/*
            ⚠ COLOANA ÎNGUSTĂ E DOAR A TITLULUI ȘI A CĂUTĂRII, nu a paginii.

            760px e cât ține bara de căutare fără să se lățească peste tot
            ecranul: un câmp de 1200px arată a filtru de tabel, nu a întrebare
            pusă cuiva. Dar grila de categorii are nevoie de toată lățimea — trei
            carduri în 760 ies de 240px fiecare, adică titlul pe trei rânduri.

            De aceea îngustarea stă pe `<h1>` și pe formular, fiecare cu a lui, nu
            pe un înveliș care le-ar fi cuprins și pe carduri.
          */}
          <div>
            <h1 className={cn("mx-auto max-w-[760px] text-center", H1_MIC)}>
              {AJUTOR_TITLU}
            </h1>

            {/*
              ⚠ CĂUTAREA CUPRINDE CATEGORIILE, nu stă doar deasupra lor.

              Cât timp câmpul e gol se văd categoriile; cum se scrie ceva, ele se
              retrag și rămân rezultatele. De aceea grila se dă ca `children`:
              așa rămâne randată pe SERVER, deși cine hotărăște dacă se vede e o
              componentă de client. Aceeași croială ca la ilustrațiile de pe
              „Migrare” — înveliș subțire de client, conținut de server.
            */}
            <CautareGhiduri
              categorii={
                <div className="mt-14 lg:mt-16">
                  <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink sm:text-[22px]">
                    {AJUTOR_CATEGORII_TITLU}
                  </h2>
                  <CarduriCategorii />
                </div>
              }
            />
          </div>
        </div>
      </section>

      <BandaAjutor />
    </>
  );
}
