/**
 * Workerul care serveste DIRECT variantele de imagine, fara redirectarea prin Vercel.
 *
 * ═══ ⚠ CE PROBLEMA REZOLVA (09.10.2026) ═══
 *
 * Pozele vitrinelor se cereau prin `/api/img`, care raspundea cu 302 catre varianta gata facuta din
 * depozit (`_optim/w<W>q<Q>/<cheie>.webp`). Fiecare poza afisata era deci o cerere CDN la Vercel,
 * iar Pro include doar 1M pe luna: la sute de magazine, redirectarile ar fi fost cel mai mare cost
 * al pozelor, plus ~50 ms pe fiecare.
 *
 * Cu Workerul asta, pagina cere direct `https://<gazda-worker>/_optim/…`. Workerul citeste varianta
 * din galeata (binding `IMAGINI`) si o da. Vercel nu mai vede cererea deloc.
 *
 * ═══ ⚠ DE CE ARE HOSTNAME-UL LUI, SI NU STA PE `edinio-cdn.com` ═══
 *
 * S-a incercat pe 07.09.2026: o ruta de Worker pe `edinio-cdn.com/_optim/*` n-a fost chemata
 * NICIODATA, fiindca `edinio-cdn.com` e un domeniu personalizat R2, servit de stratul R2 inaintea
 * Workerilor. Un Custom Domain AL WORKERULUI, cu binding la galeata, nu are problema asta.
 *
 * ═══ ⚠ O VARIANTA LIPSA NU E O POZA RUPTA ═══
 *
 * Daca varianta nu e in galeata, Workerul trimite browserul (302, `no-store`) la `/api/img` pe
 * ORIGINE. Ruta o face cu `sharp`, o pastreaza, si trimite browserul la ea pe `edinio-cdn.com`.
 * Toate portile raman in ruta (chei permise, fisierele cumparatorilor refuzate, plafonul durabil pe
 * IP-ul browserului) — Workerul nu redimensioneaza si nu scrie nimic.
 *
 * ⚠ Workerul NU cere el originii (cum facea incercarea din septembrie): toate cererile ar fi venit
 * atunci de pe cateva IP-uri Cloudflare, iar plafonul pe IP din ruta le-ar fi taiat pe toate
 * deodata. Trimis browserul, plafonul vede cumparatorul, ca pana acum.
 *
 * ═══ ⚠ CE REFUZA ═══
 *
 * Orice nu e EXACT o varianta WebP la o treapta pe care ruta o scrie: 404, fara sa atinga galeata.
 * Deci prin hostname-ul asta nu se poate citi niciun original, niciun fisier de cumparator si nicio
 * alta cheie din depozit. Regulile sunt copia celor din `src/lib/latimi-imagini.ts` si
 * `src/lib/customization/adresa.ts`; o proba (`imagini-directe-worker.test.ts`) le tine la fel.
 */

/** Treptele din `TREPTE_LATIME` / `TREPTE_CALITATE` (`src/lib/latimi-imagini.ts`). */
export const TREPTE_LATIME = [16, 32, 48, 64, 96, 128, 192, 256, 384, 512, 640, 768, 896, 1024, 1280, 1536, 1920, 2048];
export const TREPTE_CALITATE = [50, 65, 75, 85, 95];

/** `KEY_RE` din `src/lib/latimi-imagini.ts`. */
export const KEY_RE = /^(products|gallery|logos|covers|avatars)\/[\w./-]+\.(webp|jpe?g|png|gif|avif)$/i;

/** `PREFIX_INCARCARI` din `src/lib/customization/adresa.ts`, pe segmente. */
const SEGMENTE_INCARCARI = ["products", "customizations"];

/** `esteIncarcareDeCumparator`: segmentele `products/customizations` ORIUNDE in cale. */
export function esteIncarcareDeCumparator(cheie) {
  const segmente = cheie.toLowerCase().split("/").filter((s) => s !== "" && s !== ".");
  return segmente.some((_, i) => SEGMENTE_INCARCARI.every((s, j) => segmente[i + j] === s));
}

/** `cheieOptimizabila`. */
export function cheieOptimizabila(cheie) {
  return !!cheie && !cheie.includes("..") && KEY_RE.test(cheie) && !esteIncarcareDeCumparator(cheie);
}

/**
 * ⚠ Fara `decodeURIComponent`: cheile permise au doar `[\w./-]`, deci o cale cu `%` nu poate fi o
 * cheie buna. Decodata, o cale ca `%2e%2e` ar fi trecut de verificarea pe text si ar fi ajuns la
 * galeata altfel decat a fost verificata.
 */
const CALE = /^\/_optim\/w(\d{1,4})q(\d{1,3})\/(.+)\.webp$/;

/**
 * Ce varianta cere calea, sau `null` daca nu e una pe care ruta ar fi scris-o.
 * @returns {{ latime: number, calitate: number, cheie: string, obiect: string } | null}
 */
export function variantaCeruta(pathname) {
  const m = CALE.exec(pathname);
  if (!m) return null;
  const latime = Number(m[1]);
  const calitate = Number(m[2]);
  const cheie = m[3];
  if (!TREPTE_LATIME.includes(latime) || !TREPTE_CALITATE.includes(calitate)) return null;
  if (!cheieOptimizabila(cheie)) return null;
  return { latime, calitate, cheie, obiect: `_optim/w${latime}q${calitate}/${cheie}.webp` };
}

const ANTETE_IMAGINE = {
  "Content-Type": "image/webp",
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  /* Imagini publice: un `fetch` dintr-un editor sau un canvas trebuie sa le poata citi. */
  "Access-Control-Allow-Origin": "*",
};

function negasit() {
  return new Response("Not found", {
    status: 404,
    /* ⚠ NICIODATA in cache: un 404 tinut minte ar fi ascuns varianta si dupa ce ruta a facut-o. */
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export default {
  /**
   * @param {Request} request
   * @param {{ IMAGINI: R2Bucket, ORIGINE?: string }} env
   * @param {{ waitUntil(p: Promise<unknown>): void }} ctx
   */
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    }

    const url = new URL(request.url);
    const v = variantaCeruta(url.pathname);
    if (!v) return negasit();

    /*
     * ⚠ CHEIA DE CACHE E DOAR CALEA, fara interogare: `?x=1`, `?x=2`… ar fi fost tot atatea
     * intrari, si tot atatea citiri din galeata, pentru acelasi fisier.
     */
    const cheieCache = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
    const cache = caches.default;

    const dinCache = await cache.match(cheieCache);
    if (dinCache) return request.method === "HEAD" ? new Response(null, { headers: dinCache.headers }) : dinCache;

    const obiect = request.method === "HEAD" ? await env.IMAGINI.head(v.obiect) : await env.IMAGINI.get(v.obiect);

    if (!obiect) {
      const origine = (env.ORIGINE || "").replace(/\/+$/, "");
      if (!origine) return negasit();
      /*
       * ⚠ `no-store`: varianta va exista peste o secunda. Un 302 tinut minte ar fi trimis
       * browserul, pentru totdeauna, pe drumul lung.
       */
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${origine}/api/img?p=${encodeURIComponent(v.cheie)}&w=${v.latime}&q=${v.calitate}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const antete = new Headers(ANTETE_IMAGINE);
    antete.set("ETag", obiect.httpEtag);
    antete.set("Content-Length", String(obiect.size));

    if (request.method === "HEAD") return new Response(null, { headers: antete });

    const raspuns = new Response(obiect.body, { headers: antete });
    ctx.waitUntil(cache.put(cheieCache, raspuns.clone()));
    return raspuns;
  },
};
