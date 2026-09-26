import { slugify } from "@/lib/utils/slugify";

/**
 * Route segments that already exist under /(public)/[slug] (or platform-level)
 * plus a few we keep free for the future. A custom page slug may not collide with
 * these, otherwise the static route would shadow the page (or vice-versa).
 *
 * In the App Router static segments win over the dynamic [pageSlug], so a page
 * named "product" would simply never render — we block it up-front with a clear
 * error instead.
 */
/**
 * Segmentul rutei paginii de catalog.
 *
 * Sta AICI, nu langa gate-ul din `design/commerce.ts`, fiindca il citesc si
 * ecrane de dashboard: importat de acolo, ar fi tras in bundle-ul lor de client
 * intreg catalogul de sectiuni pentru opt caractere. `commerce.ts` il reexporta
 * pentru consumatorii de storefront.
 */
export const SEGMENT_MAGAZIN = "magazin";

/**
 * Segmentul rutei de rezultate ale cautarii.
 *
 * ⚠ Rezervarea intra IN ACELASI COMMIT cu ruta, ca la catalog: ea nu repara
 * retroactiv o pagina proprie care poarta deja numele, blocheaza doar crearile noi.
 * Verificat inainte de livrare — niciunul dintre cele 29 de pagini proprii din
 * productie nu se numea asa.
 */
export const SEGMENT_CAUTARE = "cautare";

/**
 * Segmentul zonei de cont a cumparatorului.
 *
 * ⚠ Rezervarea intra IN ACELASI COMMIT cu ruta, ca la catalog si la cautare: in
 * App Router segmentul static bate `[pageSlug]`, deci o pagina proprie numita
 * „cont” ar fi devenit brusc invizibila, fara 404 si fara nicio eroare. Iar
 * rezervarea NU repara retroactiv, blocheaza doar crearile noi.
 *
 * ⚠ Verificat pe PRODUCTIE inainte, nu presupus: niciuna dintre cele 33 de
 * pagini proprii ale celor 13 magazine care au asa ceva nu poarta vreunul din
 * numele rezervate mai jos. Exista „contact”, dar acela e alt segment.
 */
export const SEGMENT_CONT = "cont";

/**
 * Segmentul paginilor de brand (`/brand/<segment>`).
 *
 * ⚠ Rezervat IN ACELASI COMMIT cu ruta, ca la catalog si la cautare. Verificat pe
 * PRODUCTIE pe 24.09.2026: niciuna dintre cele 34 de pagini proprii nu se numeste
 * „brand”, „branduri” sau „brands”.
 */
export const SEGMENT_BRAND = "brand";

export const RESERVED_PAGE_SLUGS = new Set<string>([
  // existing public store sub-routes
  "product", "politici", "confirm", "retur",
  // cos si finalizarea comenzii: rute proprii pentru magazinele care le aleg ca
  // pagini. Sinonimele stau langa ele ca sa nu apara o pagina custom „comanda"
  // pe care comerciantul o crede legata de checkout.
  "cos", "cart", "checkout", "finalizare", "comanda",
  // pagina de catalog: ruta exista pentru magazinele care o aleg. Rezervarea nu
  // repara retroactiv o pagina care poarta deja numele — blocheaza doar creari
  // noi — deci a intrat in acelasi commit cu ruta, nu dupa.
  //
  // Doar segmentul REAL si perechea lui in engleza. „produse" si „catalog" au
  // fost scoase: sunt nume plauzibile de pagina proprie in romana, nicio ruta nu
  // le foloseste, si rezervate ar fi luat comerciantilor un nume bun fara sa
  // apere nimic.
  SEGMENT_MAGAZIN, "shop",
  // pagina de rezultate: exista pentru ORICE magazin, si de aceea perechea in
  // engleza intra si ea — „search" ar fi un nume plauzibil de pagina proprie, iar
  // o pagina cu numele asta ar fi fost umbrita fara sa inteleaga nimeni de ce.
  SEGMENT_CAUTARE, "search",
  // zona de cont a cumparatorului: ruta exista pentru magazinele care aprind
  // functia, dar slugul se rezerva pentru TOATE, fiindca un comerciant care o
  // aprinde maine nu trebuie sa afle atunci ca pagina lui „cont” a disparut.
  //
  // Numele apropiate intra si ele, dupa aceeasi judecata ca la „cos”: ca sa nu
  // apara o pagina proprie pe care comerciantul o crede legata de cont si care
  // nu e. „contact” NU e in lista si nu are de ce sa fie: e alt segment.
  SEGMENT_CONT, "account", "contul-meu", "comenzile-mele", "profil",
  // paginile de brand si numele lor apropiate (o pagina proprie „branduri” ar fi
  // fost crezuta lista brandurilor, si nu e).
  SEGMENT_BRAND, "branduri", "brands",
  // ⚠ NUMELE paginilor de sistem, nu doar rutele lor (25.09.2026, cerut de el).
  // Rutele erau toate rezervate, dar o pagina proprie „Acasa” primea `acasa`,
  // una „Finalizare comanda” primea `finalizare-comanda`: adrese libere, cu un
  // nume care in meniu arata ca pagina de sistem si nu era. Verificat pe
  // PRODUCTIE inainte: niciuna dintre cele 34 de pagini nu poarta vreunul.
  "acasa", "home", "homepage", "index", "pagina-principala", "prima-pagina",
  "finalizare-comanda", "finalizeaza-comanda", "plasare-comanda",
  "cos-de-cumparaturi", "cosul-meu", "cosul-tau", "toate-produsele",
  "404", "eroare",
  // platform / framework
  "api", "_next", "sitemap.xml", "robots.txt", "favicon.ico", "facebook-catalog.xml",
  // app sections that live at the root path
  "dashboard", "admin", "login", "register", "forgot-password",
  "reset-password", "onboarding", "auth",
  // keep these handy as alternative prefixes
  "p", "pagina", "pages",
]);

/** Normalize free text into a URL slug (Romanian-aware, lowercase, dash-separated). */
export function normalizePageSlug(input: string): string {
  return slugify(input);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.has(slug.toLowerCase());
}

/** Validate + normalize a page slug. Returns the clean slug or a Romanian error. */
export function validatePageSlug(
  input: string,
): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = normalizePageSlug(input);
  if (!slug) return { ok: false, error: "Linkul paginii nu poate fi gol." };
  if (slug.length > 60) return { ok: false, error: "Linkul paginii e prea lung (maxim 60 de caractere)." };
  if (isReservedSlug(slug)) return { ok: false, error: `Linkul "${slug}" este rezervat. Alege alt link.` };
  return { ok: true, slug };
}

/**
 * Titlul unei pagini noi nu poate fi numele unei pagini de sistem („Acasa”,
 * „Cos”, „Finalizare comanda”, „Contul meu”...), chiar daca omul ii alege alt
 * link: in meniu apare titlul, si arata ca pagina de sistem. Se compara forma
 * fara diacritice si fara spatii (`slugify`), deci „Coș”, „COS” si „cos” sunt
 * acelasi nume. Intoarce mesajul de refuz sau null.
 */
export function problemaTitlului(titlu: string): string | null {
  const s = normalizePageSlug(titlu);
  if (!s) return null;
  return isReservedSlug(s)
    ? `„${titlu.trim()}” e numele unei pagini de sistem a magazinului. Alege alt titlu.`
    : null;
}
