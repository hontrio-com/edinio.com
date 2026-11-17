import type { Metadata } from "next";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { HeroPagina } from "@/components/website/sections/Hero";
import { GalerieTeme } from "@/components/website/sections/teme/GalerieTeme";
import { BandaDublaTeme } from "@/components/website/sections/teme/BandaDublaTeme";
import { RANDURI_BANDA } from "@/lib/website/teme-banda";
import { siteMetadata } from "@/lib/website/metadata";
import { temelePeScurt } from "@/lib/teme/teme-pe-scurt";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { pluralRo } from "@/lib/utils/format";

export const metadata: Metadata = siteMetadata({
  title: "Teme pentru magazin online, gata de folosit",
  description:
    "Teme gata de folosit pentru magazinul tău online: modă, electronice, mobilă, piese auto și alte domenii. Vezi magazinul demo al fiecărei teme.",
  path: "/teme",
});

/**
 * Pagina „Teme” (16.11.2026, cerut de el: „pe website-ul de prezentare o secțiune nouă cu «Teme»”, ca pagină nouă).
 *
 * Acelasi cadru ca „Integrări”: `HeroPagina` (aici cu banda dubla de teme dedesubt, pe aceeasi lumina: „un HERO mai
 * modern dar sa ramana tot acelasi stil”, varianta C, aleasa de el dintre cinci), apoi cardurile temelor, cate 4 pe rand
 * (`GalerieTeme`), apoi banda de final, refolosita (textul ei e al clientului si e aprobat).
 *
 * ⚠ NUMARUL TEMELOR SE SOCOTESTE, nu se scrie: o tema noua in `TEME` il schimba singura. La integrari clientul a cerut
 * pagina FARA cifre fiindca una scrisa de mana s-ar fi demodat; aici nu se poate demoda.
 *
 * ⚠ „Vezi demo” duce MEREU pe subdomeniile din productie (`<tema>.edinio.com`), si cand pagina se vede local: pagina e
 * statica (fara `headers()`), iar demo-urile publice sunt chiar ce vrea sa vada un vizitator.
 *
 * ⚠ FARA firimituri, ca la „Integrări”: e o pagina care convinge, nu una in care ajungi cautand ceva anume.
 */
const jsonLd = paginaSiteJsonLd({
  cale: "teme",
  nume: "Teme",
  tip: "CollectionPage",
  descriere: metadata.description as string,
});

export default function TemePage() {
  const teme = temelePeScurt(new URL(PLATFORM_ORIGIN).host);

  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
      <HeroPagina
        title="Teme gata de folosit pentru magazinul tău"
        lead={`${pluralRo(teme.length, "temă", "teme")} făcute pentru domenii diferite, de la modă și electronice la mobilă și piese auto. Fiecare are un magazin demo pe care îl poți vizita.`}
        cta={{ label: "Începe acum", href: "/register" }}
        secundara={{ label: "Vezi temele", href: "#teme" }}
        dedesubt={<BandaDublaTeme randuri={RANDURI_BANDA} />}
      />

      <GalerieTeme teme={teme} />

      <FinalCta />
    </>
  );
}
