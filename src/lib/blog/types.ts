/**
 * Blogul: formele si regulile care nu tin de o pagina anume.
 *
 * Coloanele din baza sunt in engleza, ca restul schemei (`announcements`,
 * `media_library`). Comentariile si numele derivate raman in romana, ca restul
 * codului. Amestecul e voit: schema are o conventie mai veche decat blogul si
 * n-are rost sa o spargem doar aici.
 */

/**
 * Starile unui articol.
 *
 * ⚠ NU EXISTA „PROGRAMAT". Un articol programat e `published` cu `published_at`
 * in viitor. Regula de citire din baza il tine ascuns pana ajunge ceasul acolo.
 *
 * Motivul e ca o stare in plus ar fi cerut pe cineva care sa o schimbe — un
 * cron. Iar un cron care nu porneste lasa articolul blocat in „programat"
 * pentru totdeauna, fara ca cineva sa afle. Ceasul, in schimb, merge si cand nu
 * ruleaza nimic.
 */
export type StareArticol = "draft" | "review" | "published" | "archived";

export const STARI: Record<StareArticol, string> = {
  draft: "Ciornă",
  review: "La verificare",
  published: "Publicat",
  archived: "Arhivat",
};

export interface AutorBlog {
  id: string;
  user_id: string | null;
  slug: string;
  name: string;
  role_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  /**
   * Adresele publice ale autorului: LinkedIn, X, pagina personala.
   *
   * ⚠ NU E ORNAMENT. Pleaca in `Person.sameAs` din datele structurate, si
   * acolo e singurul lucru care leaga numele de o persoana reala. Fara el,
   * pentru un motor care raspunde cu text autorul e un sir de caractere, iar
   * un sir de caractere nu are autoritate pe niciun subiect.
   */
  sameas: string[];
  created_at: string;
  updated_at: string;
}

export interface CategorieBlog {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EticheteBlog {
  id: string;
  slug: string;
  name: string;
}

/** O pereche intrebare-raspuns din articol. Ajunge si in pagina, si in FAQPage. */
export interface IntrebareBlog {
  q: string;
  a: string;
}

export interface ArticolBlog {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;

  /**
   * Raspunsul scurt, de la inceputul articolului.
   *
   * ⚠ TREBUIE SA SE TINA PE PICIOARELE LUI. Motoarele care raspund cu text
   * citeaza pasaje scoase din pagina; un paragraf care spune „dupa cum am
   * aratat mai sus" nu poate fi citat singur, deci nu e citat deloc. Regula
   * practica: daca il citesti fara restul articolului si nu intelegi, nu e bun.
   */
  answer_summary: string | null;

  content_html: string;

  cover_url: string | null;
  cover_alt: string | null;
  og_image_url: string | null;

  author_id: string | null;
  category_id: string | null;

  status: StareArticol;
  published_at: string | null;

  is_featured: boolean;
  /** Îndemnul din interiorul articolului. Vezi `blog/indemn.ts`. */
  cta: unknown;
  /**
   * Ține articolul sus în listă, oricât de vechi ar fi.
   *
   * ⚠ NU E ACELAȘI LUCRU CU `is_featured`. Cel scos în față e unul singur și stă
   * lat în capul listei, ca o vitrină. Fixate pot fi mai multe, și doar urcă în
   * ordine. Un ghid de pornire scris acum un an trebuie să rămână primul, dar
   * n-are de ce să ocupe vitrina.
   */
  is_pinned: boolean;
  /*
    ⚠ CITIRILE NU MAI SUNT AICI. Stăteau ca o coloană pe rândul articolului, iar
    fiecare vizită făcea un `update` pe el — ceea ce pornea triggerul de
    `updated_at` și marca articolul drept modificat editorial. Un articol doar
    CITIT începea să spună „Actualizat azi", și la fel spunea și `dateModified`
    din datele structurate.

    Acum stau în `blog_post_stats`, legate prin `post_id`. Rândul editorial se
    schimbă doar când îl schimbă un om.
  */
  faq: IntrebareBlog[];

  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  noindex: boolean;

  reading_minutes: number | null;

  created_at: string;
  updated_at: string;
}

/**
 * Se vede articolul de catre un vizitator oarecare?
 *
 * ⚠ ACEEASI REGULA E SCRISA SI IN BAZA, ca politica de citire. Nu e o
 * repetitie din neatentie: baza e paza care nu poate fi ocolita de o
 * interogare scrisa gresit, iar asta de aici e ca ecranele de admin sa poata
 * arata adevarul („se vede" / „nu se vede") fara sa mai intrebe baza.
 *
 * Daca una se schimba, se schimba amandoua. Proba din `types.test.ts` cade
 * daca nu se intampla.
 */
export function seVede(a: Pick<ArticolBlog, "status" | "published_at">, acum: Date = new Date()): boolean {
  if (a.status !== "published") return false;
  if (!a.published_at) return false;
  return new Date(a.published_at).getTime() <= acum.getTime();
}

/** Publicat, dar cu data in viitor: asteapta ceasul. */
export function asteaptaCeasul(a: Pick<ArticolBlog, "status" | "published_at">, acum: Date = new Date()): boolean {
  return a.status === "published" && !!a.published_at && new Date(a.published_at).getTime() > acum.getTime();
}

/**
 * Cate minute de citit.
 *
 * 200 de cuvinte pe minut e media pentru text obisnuit in romana. Se socoteste
 * la salvare, nu la afisare: lista de articole n-are de ce sa despice HTML-ul
 * a douazeci de articole ca sa scrie un numar langa fiecare.
 */
export function minuteDeCitit(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return 1;
  return Math.max(1, Math.round(text.split(" ").length / 200));
}

/**
 * Adresele pe care un ARTICOL nu le poate lua, fiindcă sunt deja rute.
 *
 * ⚠ UN ARTICOL CU SLUG-UL „cautare" AR FI DE NEATINS. Baza îl acceptă (forma e
 * validă), se salvează, se publică, apare în listă și în sitemap — dar
 * `/blog/cautare` e ruta de căutare, iar Next alege întotdeauna segmentul
 * static. Articolul ar exista peste tot, mai puțin la propria lui adresă, și
 * nimic nu ar da vreo eroare.
 *
 * ⚠ SE ȚINE ÎN ACORD CU `src/app/(website)/blog/`. Fiecare nume de aici e un
 * dosar de acolo. Dacă apare o rută nouă sub /blog, numele ei se adaugă și aici;
 * proba din `types.test.ts` compară cele două liste și cade dacă se despart.
 */
export const SLUGURI_REZERVATE_BLOG = new Set([
  "cautare",
  "confirma",
  "dezabonare",
  "feed",
  "previzualizare",
  "autor",
  "categorie",
  "eticheta",
]);

/** Din „Cum îți alegi curierul" iese „cum-iti-alegi-curierul". */
export function slugDin(text: string): string {
  return text
    .normalize("NFD")
    // ⚠ Scris cu \u...: intervalul semnelor combinate. Scrise ca atare, sunt
    // caractere invizibile in fisier, pe care primul copy-paste le pierde.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ăâ]/gi, "a")
    .replace(/[îí]/gi, "i")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Păstrează doar rândurile care chiar sunt adrese web.
 *
 * ⚠ SE CHEAMĂ ȘI LA SCRIERE, ȘI LA AFIȘARE. La scriere, ca omul să nu salveze
 * un rând greșit. La afișare, fiindcă validarea de la scriere NU apără împotriva
 * datelor venite pe altă cale — un import, o reparație făcută cu SQL, un rând
 * mai vechi decât regula.
 *
 * Găsit exact așa, pe 30.08.2026: un rând scris direct în bază a ajuns întreg
 * în `Person.sameAs`. `sameAs` e o declarație verificabilă despre cine e omul;
 * una care nu duce nicăieri e mai rea decât lipsa ei, fiindcă trece drept
 * afirmație și cade la prima verificare.
 */
export function adreseBune(intrari: string[] | null | undefined): string[] {
  return (intrari ?? [])
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .filter((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    });
}

/**
 * Pliază diacriticele și scrie cu litere mici, pentru căutare.
 *
 * ⚠ TREBUIE SĂ DEA EXACT CE DĂ `public.fara_diacritice` DIN BAZĂ.
 *
 * Coloana `blog_posts.cauta` e derivată cu funcția aceea. Dacă cele două se
 * despart, căutarea nu crapă: pur și simplu nu mai găsește. Cineva scrie
 * „livrare” cu diacritice, nu primește nimic, și crede că nu există articolul.
 * Cel mai tăcut fel de defect.
 *
 * ⚠ NU SE POT COMPARA „LISTELE DE PERECHI", cum spunea nota asta până acum:
 * migrarea nu enumeră nicio pereche, ci cheamă `unaccent`. Deci singura
 * comparație cinstită e IEȘIRE cu IEȘIRE, pe cazuri anume — și exact așa s-a
 * găsit singura despărțire care era (`ß`).
 *
 * Perechile din `types.test.ts` sunt luate din baza adevărată, rulând
 * `select public.fara_diacritice(t)` pe fiecare. Când se adaugă un caz, se ia
 * tot de acolo, nu din cap.
 */
export function pliaza(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ăâ]/gi, (c) => (c === c.toLowerCase() ? "a" : "A"))
    .replace(/[îí]/gi, (c) => (c === c.toLowerCase() ? "i" : "I"))
    .replace(/[șş]/gi, (c) => (c === c.toLowerCase() ? "s" : "S"))
    .replace(/[țţ]/gi, (c) => (c === c.toLowerCase() ? "t" : "T"))
    /*
      ⚠ ß NU E O DIACRITICĂ ROMÂNEASCĂ, ȘI TOCMAI DE ACEEA A SCĂPAT.

      `normalize("NFD")` nu-l desface: nu e o literă cu semn deasupra, e o literă
      în sine. Deci trecea neatins prin tot ce e mai sus, iar coloana din bază —
      care merge pe `unaccent` — îl scrie „ss". Cine caută „Straße" nu găsea
      articolul care chiar vorbea despre el.

      Găsit confruntând ieșire cu ieșire, nu citind cele două funcții: 27 de
      cazuri din 28 se potriveau, iar al 28-lea nu se vedea din cod.
    */
    .replace(/ß/g, "ss")
    .toLowerCase();
}

/**
 * Curăță ce a scris omul în caseta de căutare.
 *
 * ⚠ `%` ȘI `_` AU ÎNȚELES ÎN `ilike`. Netratate, o căutare după `%` ar întoarce
 * toate articolele, iar una după `a_b` ar potrivi „acb". Nu e o gaură de
 * securitate — clientul Supabase parametrizează valoarea — dar e un rezultat
 * greșit pe care nimeni nu-l poate explica.
 */
export function pregatesteCautarea(q: string): string {
  return pliaza(q.trim()).replace(/[%_\\]/g, "\\$&").slice(0, 100);
}

/**
 * Adresa canonică scrisă de mână, dacă e o adresă adevărată.
 *
 * ⚠ O CANONICĂ GREȘITĂ SCOATE ARTICOLUL DIN GOOGLE, în tăcere. Scris
 * „edinio.com/ghid" fără `https://`, câmpul devine o cale relativă către o
 * pagină care nu există, iar eticheta `<link rel="canonical">` trimite tot ce a
 * strâns articolul către un 404. Nicio eroare nicăieri, nici la salvare, nici
 * în pagină; se vede abia peste săptămâni, în trafic.
 *
 * Aceeași lecție ca la `sameAs` (30.08.2026): o valoare care pleacă în afară,
 * către un motor, trebuie verificată la poartă. Ce nu trece se ignoră, fiindcă
 * lipsa canonicei e purtarea implicită bună — pagina se declară pe ea însăși.
 */
export function canonicaBuna(brut: string | null | undefined): string | null {
  const s = (brut ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
