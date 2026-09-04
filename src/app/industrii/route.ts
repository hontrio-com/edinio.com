/**
 * ═══ `/industrii` RETRAS PE 04.09.2026. NU SE REINTRODUCE FĂRĂ HOTĂRÂREA OMULUI. ═══
 *
 * Aici erau nouă pagini: hub-ul `/industrii` și șapte pagini de industrie
 * (`piese-auto`, `haine`, `cosmetice`, `mobila`, `electronice`, `petshop`,
 * `suplimente`), plus a opta adresă, `/industrii/bijuterii`, moartă din 13.08.
 *
 * ⚠ ISTORIA HOTĂRÂRII, fiindcă s-a schimbat de două ori și cine citește peste
 * un an trebuie s-o vadă întreagă:
 *
 *   - **30.08.2026** — clientul a cerut scoaterea industriilor din meniu, dar
 *     PĂSTRAREA paginilor și a legăturilor din subsol. S-a făcut exact așa.
 *   - **04.09.2026** — un audit SEO le-a cerut șterse cu totul, iar clientul a
 *     confirmat explicit, alegând 410, nu 404 și nu redirectare.
 *
 * Deci nu e o curățenie tehnică, e o schimbare de conținut cerută de om. Cine
 * vrea paginile înapoi are nevoie de aceeași hotărâre, nu de un commit.
 *
 * ═══ DE CE 410, ȘI NU CE S-A FĂCUT LA CELELALTE CINCI ═══
 *
 * `/roadmap`, `/start`, `/despre`, `/magazin-online` și `/index` au primit toate
 * redirectare 308 către `/` (`next.config.ts`). Aici NU, și diferența e reală:
 * acelea aveau o destinație semantic apropiată, sau nu erau pagini de conținut.
 * O pagină „Creare magazin online de piese auto" nu are echivalent la `/` —
 * trimisă acolo, ar fi o redirectare înșelătoare, pe care Google o tratează ca
 * pe un 404 oricum, doar mai încet.
 *
 *   - NU 404: „poate revine". 410 spune „a fost, nu mai e", iar Google scoate
 *     adresa din index mai repede și nu se mai întoarce s-o încerce.
 *   - NU 200 cu o pagină de explicație: ar rămâne indexabilă.
 *
 * ═══ DE CE `route.ts` ȘI NU ALTCEVA ═══
 *
 * Nici `page.tsx` nu poate alege statusul răspunsului, nici `redirects()` din
 * `next.config.ts` nu poate întoarce 410. Și mai e un motiv, care contează:
 * `redirects()` rulează ÎNAINTEA proxy-ului și pe ORICE gazdă, deci ar fi furat
 * `/industrii` și de pe domeniul propriu al unui comerciant care și-ar face o
 * pagină cu acel link. Un `route.ts` rulează DUPĂ rescrierea proxy-ului, deci e
 * legat de gazda platformei prin construcție, fără `has`.
 *
 * ⚠ SEGMENTUL RĂMÂNE REZERVAT în `segmente-rezervate.ts`. Fișierul ăsta NU ține
 * locul rezervării: `rute-pe-disc.ts` caută `page.tsx`/`page.ts`, nu `route.ts`,
 * deci pentru el adresa nu mai există. Rezervarea e ce oprește un magazin să ia
 * slugul `industrii`.
 *
 * ⚠ NIMIC nu mai trimite aici: sitemapul, `llms.txt`, subsolul, meniul și
 * firimiturile au fost curățate în același commit. Verificat și în bază —
 * niciun articol de blog nu pomenește adresa.
 */

export const dynamic = "force-dynamic";

/**
 * Corpul și antetele, într-un singur loc, ca ruta hub-ului, ruta de sub el și
 * proba lor să citească același răspuns.
 *
 * Aceeași formă ca `sitemap-magazine.xml/route.ts`, retras pe 03.09: text simplu,
 * `no-store` ca niciun CDN să nu-l țină, și `X-Robots-Tag: noindex` ca adresa
 * însăși să nu rămână în index cât timp mai e cerută.
 */
export function raspunsRetras(): Response {
  return new Response("Gone: paginile de industrii au fost retrase.", {
    status: 410,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export async function GET() {
  return raspunsRetras();
}
