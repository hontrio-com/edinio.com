/**
 * Workerul care face saltul in plus sa dispara.
 *
 * ═══ ⚠ CE PROBLEMA REZOLVA ═══
 *
 * Imaginile se servesc din variante gata facute, `_optim/w<W>q<Q>/<cheie>.webp`, scrise o
 * singura data de `/api/img`. Cat timp browserul cere `/api/img?p=…&w=…`, fiecare poza costa un
 * salt in plus: masurat din Romania, pe conexiune calda, 62 ms pana la marginea Vercel plus 14 ms
 * pana la Cloudflare, fata de 24 ms cat lua drumul de dinainte.
 *
 * Saltul dispare daca browserul cere DIRECT obiectul de pe domeniul CDN. Dar atunci o varianta
 * care nu s-a facut inca da 404 — adica o poza rupta, nu una mai putin clara.
 *
 * Workerul asta inchide gaura: la 404 sub `_optim/`, cere originii sa faca varianta, apoi o
 * serveste. Deci calea directa devine sigura, si abia atunci are voie sa se aprinda steagul
 * `NEXT_PUBLIC_IMAGINI_DIRECT` din aplicatie.
 *
 * ⚠ SE CHEAMA DOAR LA RATARE. Dupa primele saptamani, aproape niciodata: variantele exista si
 * Cloudflare le serveste din cache-ul lui, fara sa mai treaca pe aici.
 *
 * ═══ ⚠ CUM SE PUNE (partea din Cloudflare, pe care o face proprietarul) ═══
 *
 *   1. Workers & Pages -> Create -> Worker. Lipeste fisierul asta.
 *   2. Settings -> Variables: `ORIGINE` = `https://www.edinio.com` (fara bara la final).
 *   3. Triggers -> Routes: `edinio-cdn.com/_optim/*`.
 *      ⚠ NUMAI pe `_optim/*`. Pus pe toata zona, ar sta in calea fiecarei imagini si a fiecarui
 *      fisier din depozit, degeaba — si ar consuma cota de cereri pentru nimic.
 *   4. Abia dupa ce ruta e vie si proba de mai jos trece, se aprinde
 *      `NEXT_PUBLIC_IMAGINI_DIRECT=1` in Vercel si se redesfasoara.
 *
 * PROBA CA MERGE, inainte de a aprinde ceva (cere o latime care sigur nu exista):
 *
 *   curl -sI "https://edinio-cdn.com/_optim/w1024q75/<o-cheie-adevarata>.webp"
 *
 *   Fara Worker: 404. Cu Worker: 200 si `content-type: image/webp`, cam intr-o secunda prima
 *   data, apoi instant.
 *
 * ⚠ DACA SE SCOATE RUTA, se stinge INTAI steagul din Vercel si se redesfasoara, si abia apoi se
 * scoate Workerul. In ordinea cealalta, orice varianta lipsa devine o poza rupta pe vitrine.
 */

/** Doar cheile pe care le scrie `/api/img`. Vezi `cheieVarianta` din `src/lib/latimi-imagini.ts`. */
export const CALE = /^\/_optim\/w(\d{1,5})q(\d{1,3})\/(.+)\.webp$/;

/**
 * ⚠ ANTETUL CARE OPRESTE BUCLA.
 *
 * Cererea pe care o face Workerul mai departe poate, dupa cum e asezata ruta, sa treaca inca o
 * data pe la el. Fara semnul asta, o varianta care nu se poate face niciodata ar fi pus Workerul
 * sa se chieme pe sine pana la limita de subcereri — pe fiecare cerere a fiecarui robot.
 */
const SEMN = "x-variante-reincercare";

export default {
  async fetch(request, env) {
    /* Ce nu e o citire simpla nu ne priveste: se duce la depozit asa cum e. */
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);

    const raspuns = await fetch(request);
    if (raspuns.status !== 404) return raspuns;

    /* A doua trecere: varianta tot nu e acolo. Se da 404-ul, nu se mai incearca. */
    if (request.headers.get(SEMN)) return raspuns;

    const url = new URL(request.url);
    const m = CALE.exec(decodeURIComponent(url.pathname));
    if (!m) return raspuns;

    const [, latime, calitate, cheie] = m;

    const origine = (env.ORIGINE || "").replace(/\/+$/, "");
    if (!origine) return raspuns;

    /*
     * ⚠ SE CERE ORIGINII S-O FACA, SI NIMIC MAI MULT. Workerul nu redimensioneaza el: toate
     * portile stau in `/api/img` — cheia trebuie sa fie sub prefixele noastre, fisierele
     * cumparatorilor se refuza, latimea si calitatea se rotunjesc la trepte, si exista un plafon
     * durabil pe drumul unde se cheltuie. Mutate aici, ar fi trebuit tinute in doua locuri.
     *
     * ⚠ `redirect: "manual"`: raspunsul e un 302 catre chiar adresa pe care o cerem noi acum.
     * Urmat, ne-ar fi trimis inapoi de unde am plecat.
     */
    let facut;
    try {
      facut = await fetch(
        `${origine}/api/img?p=${encodeURIComponent(cheie)}&w=${latime}&q=${calitate}`,
        { redirect: "manual", cf: { cacheTtl: 0 } },
      );
    } catch {
      return raspuns;
    }

    /* Originea n-a putut sau n-a vrut: se da 404-ul de la inceput, nu o eroare noua. */
    if (facut.status !== 302) return raspuns;

    /*
     * ⚠ ANTETELE SE COPIAZA EXPLICIT. Cererea facuta dintr-alta poate avea antetele inghetate,
     * si atunci `set` ar fi aruncat — sau, mai rau, ar fi tacut, si semnul care opreste bucla
     * n-ar mai fi ajuns nicaieri.
     */
    const dinNou = new Request(request, { headers: new Headers(request.headers) });
    dinNou.headers.set(SEMN, "1");
    return fetch(dinNou);
  },
};
