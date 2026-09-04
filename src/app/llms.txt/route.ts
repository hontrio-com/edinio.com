import { PLATFORM_ORIGIN } from "@/lib/seo";
import { articolePublicate, categoriiBlog } from "@/lib/blog/citire";
import { CATEGORII_AJUTOR } from "@/lib/website/ajutor";
import { adresaCategorie } from "@/lib/website/ajutor-cautare";
import { COMPETITORS } from "@/lib/website/nav";
import { anuntabil } from "@/app/sitemap";

/**
 * `/llms.txt` — cartea de vizită a site-ului pentru motoarele care răspund cu text.
 *
 * ⚠ NU E UN AL DOILEA SITEMAP. Sitemapul spune „astea sunt toate adresele" și e
 * pentru crawlere care indexează. Fișierul ăsta spune „astea sunt lucrurile care
 * merită citite, și iată despre ce sunt", pentru un model care are de ales ce
 * citește într-o fereastră mică. De aceea are descrieri, e scurt, și lasă afară
 * paginile de rutină.
 *
 * Convenția e llmstxt.org: markdown simplu, un titlu, o frază care spune ce e
 * site-ul, apoi secțiuni cu legături adnotate.
 *
 * ⚠ NU ÎNLOCUIEȘTE CONȚINUTUL DIN PAGINI. Un model care ajunge direct pe un
 * articol nu trece pe aici niciodată. Fișierul ajută la alegerea drumului, nu
 * la citit — de asta munca adevărată tot în pagini stă: text randat la server,
 * date structurate, și răspunsuri care se înțeleg scoase din context.
 */

function rand(titlu: string, cale: string, descriere?: string): string {
  const adresa = cale.startsWith("http") ? cale : `${PLATFORM_ORIGIN}${cale}`;
  return descriere ? `- [${titlu}](${adresa}): ${descriere}` : `- [${titlu}](${adresa})`;
}

export async function GET() {
  const [toate, categoriiBlogului] = await Promise.all([
    articolePublicate(200),
    categoriiBlog(),
  ]);

  /* Ca la sitemap, si CHIAR cu regula lui (`anuntabil`): un articol pe care
     l-am scos dinadins din Google, sau al carui original e publicat pe alt
     site, n-are ce căuta nici în lista pe care o dăm motoarelor care răspund cu
     text. Ar fi aceeași contradicție, spusă altui public. */
  const articole = toate.filter(anuntabil);

  const bucati: string[] = [
    "# Edinio",
    "",
    "> Platformă românească pentru magazine online: creezi magazinul, iar plățile cu cardul,",
    "> curierii cu AWB automat și facturarea vin gata conectate. Mentenanța și asistența sunt",
    "> incluse, fără cost separat.",
    "",
    "Edinio se adresează comercianților din România. Prețurile sunt în lei, integrările sunt",
    "cele folosite pe piața locală (eMAG, FAN Courier, Sameday, Cargus, Netopia, SmartBill,",
    "Oblio), iar textele și asistența sunt în română.",
    "",
    "## Platformă",
    "",
    rand("Prețuri", "/preturi", "planurile și ce include fiecare"),
    rand("Integrări", "/integrari", "curieri, plăți, facturare, marketplace-uri și marketing"),
    rand("Optimizare pentru Google", "/optimizare", "ce face platforma singură pentru SEO"),
    rand("Mentenanță gratuită", "/mentenanta-gratuita", "ce acoperă și de ce e inclusă"),
    rand("Migrare", "/migrare", "mutarea unui magazin existent pe Edinio"),
    rand("Contact", "/contact", "telefon, email și program"),
    "",
    "## Comparații cu alte platforme",
    "",
    ...COMPETITORS.map((c) =>
      rand(`Edinio vs ${c.name}`, c.href, c.description),
    ),
    "",
    "## Centrul de ajutor",
    "",
    "Peste 400 de ghiduri pas cu pas despre folosirea platformei, împărțite pe nouă categorii.",
    "",
    ...CATEGORII_AJUTOR.map((c) => rand(c.titlu, adresaCategorie(c.slug), c.descriere)),
    "",
  ];

  if (articole.length > 0) {
    bucati.push("## Blog", "");
    if (categoriiBlogului.length > 0) {
      const cuArticole = new Set(articole.map((a) => a.categorie?.slug).filter(Boolean));
      for (const c of categoriiBlogului.filter((c) => cuArticole.has(c.slug))) {
        bucati.push(rand(c.name, `/blog/categorie/${c.slug}`, c.description ?? undefined));
      }
      bucati.push("");
    }
    for (const a of articole) {
      /* Rezumatul de listă, nu răspunsul scurt: acolo e răspunsul întreg, care
         se citește în pagină. Aici e nevoie doar de cât să se aleagă. */
      bucati.push(rand(a.title, `/blog/${a.slug}`, a.excerpt ?? undefined));
    }
    bucati.push("");
  }

  return new Response(bucati.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      /* O oră: fișierul se schimbă doar când apare un articol nou, iar un model
         care îl citește de două ori în aceeași oră n-are ce pierde. */
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
