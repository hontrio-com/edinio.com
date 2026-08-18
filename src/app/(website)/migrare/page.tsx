import type { Metadata } from "next";
import { HeroPagina } from "@/components/website/sections/Hero";
import { ArcMigrare } from "@/components/website/sections/migrare/ArcMigrare";
import { siteMetadata } from "@/lib/website/metadata";

/*
  Descrierea e CHIAR propoziția din hero, dată de client. Nu o rescriu ca să
  sune „de metadate": e deja lista lucrurilor care se transferă, adică exact ce
  caută cineva care scrie „migrare magazin online" în Google.

  Fără diacritice, ca restul metadatelor din depozit. Textul din PAGINĂ le are.
*/
export const metadata: Metadata = siteMetadata({
  title: "Migrare magazin online din orice platforma",
  description:
    "Produse, categorii, clienti, comenzi si alte date importante pot fi transferate in Edinio pentru o trecere cat mai simpla.",
  path: "/migrare",
});

/**
 * Pagina „Migrare magazin".
 *
 * ═══ CE A FOST ÎNAINTE, ȘI DE CE S-A ȘTERS TOT ═══
 *
 * Pagina veche stătea în `app/(landing)/migrare`, adică în afara site-ului: era
 * o pagină de campanie, nu o pagină de site. Se vedea din prima privire —
 *
 * - **bandă verde plină** peste tot ecranul, sus, cu text alb cu majuscule;
 * - **fără bara de sus și fără mega menu**, ca vizitatorul venit din reclamă să
 *   n-aibă unde pleca;
 * - **subsol propriu**, trei linkuri și un an, în locul subsolului site-ului;
 * - texte **fără diacritice**, prețuri scrise a doua oară în pagină și încă un
 *   tabel „Edinio vs platforma ta actuală", pe lângă cel de pe paginile `/vs`.
 *
 * Cerut de client: se reface întreagă, ca celelalte pagini. De aceea a și trecut
 * în `(website)` — acolo layout-ul aduce `SiteHeader`, `Footer` și bara de
 * contact lipicioasă, iar hero-ul se așază cum trebuie sub bară. În `(landing)`
 * n-ar fi avut ce estompa: `-mt-18` din `HeroCadru` urcă secțiunea SUB bara de
 * sus, iar fără bară ar fi tăiat pur și simplu din hero.
 *
 * ⚠ Adresa NU s-a schimbat, și e important: `/migrare` e scrisă în trei locuri
 * din navigație — panoul „De ce noi?" (`COMPARE_FEATURED`), rândul „Migrare
 * magazin" din „Resurse" (`RESOURCES`) și subsolul FIECĂREI pagini
 * (`FOOTER_COLUMNS`). Grupurile de rute nu apar în adresă, deci mutarea dintr-un
 * grup în altul nu atinge niciun link.
 *
 * ⚠ NETERMINATĂ, dinadins. Deocamdată e doar hero-ul; restul secțiunilor vin
 * separat, la cererea clientului. Ce e până acum e final, nu coajă.
 */
export default function MigrarePage() {
  return (
    /*
      Același `HeroPagina` ca pe „Optimizare", „Mentenanță gratuită" și paginile
      `/vs` — adică chiar cadrul hero-ului de pe pagina de start, nu o copie a
      lui. Vezi nota din `sections/Hero.tsx`: e o singură componentă tocmai ca o
      corectură la titlu sau la butoane să se vadă pe toate paginile deodată.

      ⚠ TITLUL ȘI DESCRIEREA SUNT ALE CLIENTULUI, date cuvânt cu cuvânt (inclusiv
      punctul de la capătul titlului, pe care celelalte pagini nu-l au). Nu se
      rescriu.
    */
    <HeroPagina
      /*
        Locul de deasupra titlului, care pe alte pagini ține o pastilă — „Nou" pe
        pagina de start, „Edinio vs Shopify" pe cele de comparație. Aici ține
        arcul de plăci: cerut de client (14.08), după o referință cu plăci pe o
        bandă curbă. Vezi `ArcMigrare` pentru geometrie și pentru ce s-a luat din
        referință și ce nu.

        E chiar afirmația paginii, desenată: titlul promite că păstrezi tot ce ai
        construit, iar plăcile arată CE anume, înainte să fie citit primul cuvânt.
      */
      eticheta={<ArcMigrare />}
      /*
        ⚠ RUPTURĂ ADEVĂRATĂ DE RÂND, nu o lățime potrivită din ochi.

        Titlul e o pereche — schimbi una, păstrezi cealaltă — și ruptura trebuie
        să cadă fix la virgulă, ca fiecare jumătate să stea întreagă pe rândul ei.
        Măsurat la corpul de 66, cu spațierea negativă a titlului:

          „Schimbi platforma,"             570px
          „Schimbi platforma, păstrezi"    831px
          „păstrezi tot ce ai construit."  807px
          tot, pe un rând                 1390px

        Din numerele astea se vede de ce nu merge cu `latimeTitlu`: la 900 (cât e
        din oficiu) încape și „păstrezi" pe primul rând, deci a doua propoziție se
        rupe în mijloc; la 760 nu mai încape nici ea pe un rând, și titlul trece
        pe TREI. Ar rămâne fereastra 807–830, adică 23 de pixeli — prea puțin ca
        să reziste la o schimbare de font sau la fontul de rezervă până se încarcă
        Geist.

        Aceeași soluție ca la titlul paginii „Mentenanță gratuită", și tot de
        acolo vine și spațiul dinaintea rupturii: `<br>` nu pune nicio literă în
        `textContent`, deci fără el textul CITIT ar ieși „platforma,păstrezi".
      */
      title={
        <>
          Schimbi platforma,{" "}
          <br />
          păstrezi tot ce ai construit.
        </>
      }
      lead="Produse, categorii, clienți, comenzi și alte date importante pot fi transferate în Edinio pentru o trecere cât mai simplă."
      /*
        ⚠ BUTOANELE NU SUNT DATE DE CLIENT — sunt aceleași două ca pe
        „Optimizare", și de-aia se refolosesc: pe o pagină comercială, text de
        buton inventat de mine ar fi o promisiune pe care n-a făcut-o nimeni.
        Când vine formularul de migrare, cel principal are toate șansele să
        devină „Cere migrarea", ca în panoul din meniu.
      */
      cta={{ label: "Începe gratuit", href: "/register" }}
      secundara={{ label: "Vezi prețurile", href: "/preturi" }}
    />
  );
}
