/**
 * ═══ `/vs` RETRAS PE 11.09.2026, LA CEREREA CLIENTULUI ═══
 *
 * Aici era pagina-index a comparațiilor: o grilă cu cele șase legături
 * „Edinio vs …". Clientul a cerut-o ștearsă („nu o folosim") și scoasă din
 * sitemap.
 *
 * ⚠ PAGINILE `/vs/{concurent}` RĂMÂN. Se retrage doar indexul; comparațiile au
 * pagina lor în `[competitor]/page.tsx`, sunt în meniu și rămân în sitemap, din
 * `COMPETITORS`.
 *
 * ═══ DE CE 410 ═══
 *
 * Aceeași alegere ca la `/industrii` (vezi `src/app/industrii/route.ts`), din
 * același motiv. Adresa era în Google: pe 11.09.2026, `site:edinio.com/vs` o
 * arăta, cu titlul ei. O grilă de legături n-are echivalent, deci o redirectare
 * 308 către `/` ar fi înșelătoare, iar Google o tratează oricum ca pe un 404,
 * doar mai încet. Un 404 spune „poate revine"; 410 spune „a fost, nu mai e", și
 * Google scoate adresa mai repede.
 *
 * ⚠ `route.ts`, NU `page.tsx`: o pagină nu-și poate alege statusul, iar
 * `redirects()` din `next.config.ts` nu poate întoarce 410 și rulează pe ORICE
 * gazdă, deci ar fi furat `/vs` și de pe domeniul propriu al unui comerciant.
 * Ruta rulează DUPĂ rescrierea proxy-ului, deci e legată de gazda platformei
 * prin construcție.
 *
 * ⚠ SEGMENTUL `vs` RĂMÂNE REZERVAT în `segmente-rezervate.ts`. Rezervarea e ce
 * oprește un magazin să ia slugul; ruta de aici n-o poate ține, fiindcă proxy-ul
 * hotărăște înaintea ei.
 *
 * ⚠ DACĂ REVINE PAGINA: se șterge fișierul ăsta împreună cu proba lui (`page.tsx`
 * și `route.ts` nu pot sta în același dosar) și se pune la loc rândul din
 * `paginiDeSite()`, în `src/app/sitemap.ts`.
 */

export const dynamic = "force-dynamic";

/*
  Aceeași formă ca la `/industrii` și la `sitemap-magazine.xml`: text simplu,
  `no-store` ca niciun CDN să nu-l țină, și `X-Robots-Tag: noindex` ca adresa să
  nu rămână în index cât timp mai e cerută.
*/
export async function GET() {
  return new Response("Gone: pagina de comparații a fost retrasă.", {
    status: 410,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
