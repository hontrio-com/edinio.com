/**
 * Cum judeca santinela descrierea paginii de catalog si a paginilor de categorie.
 *
 * ═══ DE CE UN FISIER SEPARAT ═══
 *
 * Un `route.ts` nu are voie sa exporte altceva decat metodele HTTP si reglajele rutei
 * (Next opreste build-ul), deci regulile de aici n-ar fi putut fi probate pe bucati din
 * `route.ts`. Acolo se cer paginile; aici se citeste doar ce au adus, fara retea.
 *
 * ═══ CE SE CERE ═══
 *
 * Reclamatia caian-textile.ro (10.09.2026): catalogul si fiecare categorie purtau in
 * Google descrierea PAGINII PRINCIPALE (Setari > SEO), aceeasi in `<head>`, og, twitter
 * si `CollectionPage`. Raspundeau 200, cu date structurate valide, deci nimic nu le
 * deosebea de pagini corecte. Pe o pagina de catalog sau de categorie se cere:
 *
 *   - `description` = og = twitter = `CollectionPage.description`, un sir nevid (prin
 *     constructie, `descrierePaginii`);
 *   - diferita de descrierea paginii principale;
 *   - cand spune „N produse", N e chiar numarul din contorul paginii;
 *   - daca e anuntata in sitemap, fara `noindex` (decizia 6: pagina si sitemapul aplica
 *     aceeasi regula; despartite, se contrazic, si Search Console numara contradictia).
 */

const ENTITATI: Record<string, string> = {
  "&amp;": "&",
  "&quot;": "\"",
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/**
 * Valoarea unui atribut HTML, cu entitatile scrise de React intoarse la caractere.
 *
 * ⚠ Intr-o SINGURA trecere. Doua `replace` la rand ar fi decodat de doua ori: un nume
 * care contine chiar textul „&lt;" ajunge in pagina „&amp;lt;", iar a doua trecere l-ar
 * fi facut „<", adica alt text decat cel din JSON-LD, si o alarma falsa.
 */
export function decodeazaAtribut(s: string): string {
  return s.replace(/&(?:amp|quot|#x27|#39|lt|gt);/g, (e) => ENTITATI[e] ?? e);
}

const deRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Continutul unei etichete `<meta>`, in forma pe care o scrie Next (verificata pe
 * productie, 10.09.2026): `<meta name="description" content="…"/>`,
 * `<meta property="og:description" content="…"/>`. `null` cand lipseste.
 */
export function continutMeta(html: string, cheie: "name" | "property", valoare: string): string | null {
  const m = html.match(new RegExp(`<meta ${cheie}="${deRegex(valoare)}" content="([^"]*)"`));
  return m ? decodeazaAtribut(m[1]) : null;
}

/** Nodul `CollectionPage` din datele structurate ale paginii, cu descrierea lui. */
export function descriereColectie(noduri: Record<string, unknown>[]): { gasit: boolean; descriere: string | null } {
  const nod = noduri.find((n) => n["@type"] === "CollectionPage");
  if (!nod) return { gasit: false, descriere: null };
  return { gasit: true, descriere: typeof nod.description === "string" ? nod.description : null };
}

/** Numarul fara separatorul de mii: descrierea scrie „1.353", contorul „1353". */
const cifre = (s: string) => s.replace(/\./g, "");

/**
 * Cate produse spune descrierea, cand e cea GENERATA (`descriere-generata.ts`):
 * „… la CAIAN TEXTILE: 18 produse, …" sau „Catalogul CAIAN TEXTILE: 41 de produse …".
 *
 * ⚠ Numai in forma generatorului, lipita de numele scurt al magazinului. Un text scris
 * de comerciant (subtitlul catalogului, decizia 5) poate spune „peste 500 de produse",
 * iar cifra lui nu e treaba santinelei: judecata pe ea, proba ar fi sunat din doua in
 * doua ore pentru o fraza de reclama. Si nu din lista de produse: „Printre produse: Set
 * 5 produse" e un nume, nu un numar.
 */
export function numarDinDescriere(descriere: string, numeScurt: string): string | null {
  const nume = deRegex(numeScurt);
  // `produse?`: catalogul spune numarul la orice marime, deci si „1 produs".
  const m = descriere.match(new RegExp(`^(?:Reduceri: )?Catalogul ${nume}: (\\d[\\d.]*) (?:de )?produse?\\b`))
    ?? descriere.match(new RegExp(` la ${nume}: (\\d[\\d.]*) (?:de )?produse?\\b`));
  return m ? cifre(m[1]) : null;
}

/**
 * Cate produse arata contorul paginii (`NumarRezultate`, `ShopPieces.tsx`): „18 din 41
 * produse" pe o categorie, „41 produse" (sau „1 produs") cand pagina arata tot
 * catalogul. Primul numar e chiar grila paginii. `null` cand comerciantul a ascuns
 * contorul.
 *
 * ⚠ Numai forma dintr-un singur nod de text. Subsolul paginarii scrie aceleasi cuvinte,
 * dar din bucati (`20<!-- --> din <!-- -->41<!-- --> produse`), iar primul lui numar e
 * cat s-a incarcat pana acum, nu cat are pagina.
 */
export function numarDinContor(html: string): string | null {
  const m = html.match(/>(\d[\d.]*) din [\d.]+ produse</) ?? html.match(/>(\d[\d.]*) produse?</);
  return m ? cifre(m[1]) : null;
}

export interface PaginaDeJudecat {
  /** HTML-ul paginii, intreg. */
  html: string;
  /** Nodurile de date structurate ale paginii, cu `@graph` desfacut (`noduriJsonLd`). */
  noduri: Record<string, unknown>[];
  /** Descrierea din `<head>`-ul paginii principale. `null` = n-a putut fi citita. */
  descriereAcasa: string | null;
  /** `numeScurtMagazin(displayName)`: ancora cifrei din descriere. */
  numeScurt: string;
  /** Adresa e anuntata in sitemapul magazinului. */
  dinSitemap: boolean;
}

/** Ce nu e in regula cu descrierea unei pagini de catalog sau de categorie; `[]` = nimic. */
export function problemeDescriere(p: PaginaDeJudecat): string[] {
  const out: string[] = [];
  if (p.dinSitemap && /noindex/i.test(continutMeta(p.html, "name", "robots") ?? "")) {
    out.push("e anuntata in sitemap, dar poarta noindex (pagina si sitemapul nu mai aplica aceeasi regula)");
  }
  const d = continutMeta(p.html, "name", "description");
  if (!d) {
    out.push("n-are meta description");
    return out;
  }
  if (p.descriereAcasa !== null && d === p.descriereAcasa) {
    out.push("poarta descrierea paginii principale");
  }
  const og = continutMeta(p.html, "property", "og:description");
  if (og !== d) out.push(`og:description difera (${og === null ? "lipseste" : `„${og}”`})`);
  const tw = continutMeta(p.html, "name", "twitter:description");
  if (tw !== d) out.push(`twitter:description difera (${tw === null ? "lipseste" : `„${tw}”`})`);
  const ld = descriereColectie(p.noduri);
  if (!ld.gasit) out.push("n-are nod CollectionPage");
  else if (ld.descriere !== d) {
    out.push(`CollectionPage.description difera (${ld.descriere === null ? "lipseste" : `„${ld.descriere}”`})`);
  }
  const spune = numarDinDescriere(d, p.numeScurt);
  const arata = numarDinContor(p.html);
  if (spune !== null && arata !== null && spune !== arata) {
    out.push(`descrierea spune ${spune} produse, iar pagina arata ${arata}`);
  }
  return out;
}
