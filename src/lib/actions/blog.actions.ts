"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { requireAdminApi, requireBlogEditorApi } from "@/lib/admin-guard";
import { indemnDeAratat } from "@/lib/blog/indemn";
import { adresaDeImagine } from "@/lib/blog/imagini";
import {
  adreseBune,
  canonicaBuna,
  minuteDeCitit,
  slugDin,
  pregatesteCautarea,
  SLUGURI_REZERVATE_BLOG,
  type ArticolBlog,
  type AutorBlog,
  type CategorieBlog,
  type IntrebareBlog,
  type StareArticol,
} from "@/lib/blog/types";

/**
 * Blogul, partea de administrare: autori si categorii.
 *
 * ⚠ CLIENTUL E TIPAT, din 31.08.2026. Tabelele si functiile de blog au intrat in
 * `database.types.ts`, deci `tsc` verifica numele coloanelor, numele functiilor
 * SI numele argumentelor lor. Ultimul lucru conteaza cel mai mult: PostgREST
 * alege functia dupa numele argumentelor, deci pana acum un `p_slug_vechi` scris
 * `p_vechi_slug` trecea de typecheck si de build, si cadea la prima apasare.
 *
 * ⚠ CLIENTUL DE SERVICIU SARE PESTE DREPTURILE PE RAND. De aceea fiecare functie
 * de aici incepe cu o paza, fara exceptie.
 *
 * ⚠ SI E SINGURUL DRUM DE SCRIERE, din 31.08.2026. Baza nu mai are nicio politica
 * prin care `authenticated` sa scrie direct in tabelele de blog: calea aceea
 * ocolea tot ce e aici — MFA, plafoanele de lungime, poarta pe gazdele de
 * imagini, regulile de rol. Doua sisteme de autorizare inseamna ca cel mai slab
 * hotaraste. Acum e unul singur, si se citeste dintr-o privire.
 *
 * Ce se intampla prin panou trece
 * pe aici.
 *
 * ⚠ DOUA PAZE, ALESE DUPA CE FACE FUNCTIA:
 *
 *   `requireBlogEditorApi()` — CONTINUT. Articolele, si citirea autorilor si a
 *     categoriilor (redactorul trebuie sa le poata alege din editor). Intoarce
 *     si rolul, fiindca marginea redactorului se pune in cod: vezi
 *     `poateLasaInStarea`.
 *
 *   `requireAdminApi()` — STRUCTURA. Autorii, categoriile si stergerea
 *     etichetelor. Un redactor scrie articole, nu hotaraste cine sunt autorii
 *     platformei sau cum se imparte blogul pe categorii.
 */
function blogDb() {
  return createAdminClient();
}

/**
 * O citire de administrare care ARUNCĂ dacă baza a răspuns cu eroare.
 *
 * ⚠ FRATELE LUI `cere()` DIN `src/lib/blog/citire.ts`, ȘI E AICI DIN ACELAȘI
 * MOTIV. Acolo, în runda a patra, toate cele 23 de citiri publice luau doar
 * `data`: o bază căzută nu dădea o eroare, ci o listă goală — adică „articolul
 * nu există", adică 404, adică Google scoate pagina din index.
 *
 * Aici păgubitul e altul, dar paguba e de aceeași formă: 13 citiri de
 * administrare făceau `data ?? []`, `?? null` sau `?? 0`. Adminul se uita la un
 * ecran care spunea „nu ai niciun autor" în timp ce baza avea doisprezece — și
 * n-avea de unde să bănuiască, fiindcă un ecran gol arată exact ca un ecran
 * gol pe drept.
 *
 * ⚠ SE ARUNCĂ, NU SE ÎNTOARCE O EROARE. Astea sunt citiri din componente de
 * server: Next prinde aruncarea și arată marginea de eroare. „Nu am putut
 * încărca acum" e un adevăr; „nu există nimic" e o minciună.
 */
function cereAdmin<T>(rezultat: { data: T; error: { message?: string } | null }, unde: string): T {
  if (rezultat.error) {
    throw new Error(
      `[blog-admin] citirea „${unde}” a eșuat: ${rezultat.error.message ?? "eroare necunoscută"}. ` +
        "Se aruncă dinadins: o listă goală ar fi arătat ca „nu există nimic”.",
    );
  }
  return rezultat.data;
}

/**
 * Câte articole atârnă de un autor sau de o rubrică — sau faptul că NU ȘTIM.
 *
 * ⚠ ZERO ȘI „NU ȘTIU" NU AU VOIE SĂ ARATE LA FEL, și ăsta e singurul loc din
 * blog unde confuzia costa date.
 *
 * Ecranele de admin cheamă numărătoarea ÎNAINTE de ștergere, ca să întrebe
 * „rămân 30 de articole fără autor, continui?". Când numărătoarea întorcea
 * `count ?? 0`, o cădere de o clipă a bazei devenea `0`, ramura de avertisment
 * se sărea, iar omul vedea întrebarea blândă „Ștergi autorul X?" — și confirma.
 * Ștergerea de după putea foarte bine să reușească.
 */
export type Numaratoare = { ok: true; cate: number } | { ok: false; motiv: string };

/**
 * Randul din baza, citit ca `ArticolBlog`.
 *
 * ⚠ CELE DOUA FORME CHIAR DIFERA, si e bine ca `tsc` o spune.
 *
 * In baza, `faq` si `cta` sunt `jsonb` — adica `Json`, care poate fi orice. In
 * cod, `faq` e `IntrebareBlog[]` si `cta` are forma din `blog/indemn.ts`.
 * Trecerea dintre ele nu e o conversie, e o PRESUPUNERE: „ce e in coloana are
 * forma pe care o astept".
 *
 * Presupunerea e tinuta la SCRIERE, unde `intrebariBune` si `indemnDeSalvat`
 * curata ce intra. Deci un rand scris de aplicatie o respecta. Unul scris cu SQL
 * de mana, nu — de aceea afisarea trece oricum prin `indemnDeAratat`, care
 * arunca ce nu are forma buna.
 *
 * Functia asta exista ca sa fie UN SINGUR loc unde presupunerea se face, cu
 * motivul scris langa ea, in loc de cinci turnari raspandite prin fisier.
 */
function caArticol(rand: unknown): ArticolBlog {
  return rand as ArticolBlog;
}

/**
 * Randul de scris, dat functiilor din baza ca `jsonb`.
 *
 * Aceeasi punte, in celalalt sens: `randDinIntrare` intoarce o forma de domeniu
 * (cu `faq: IntrebareBlog[]`), iar functia din baza primeste `Json`.
 */
function caJson(rand: object): Json {
  return rand as unknown as Json;
}

function reimprospateaza() {
  revalidatePath("/admin/blog");
  revalidatePath("/admin/blog/autori");
  revalidatePath("/admin/blog/categorii");
  /*
    ⚠ ȘI PAGINILE PUBLICE.

    ⚠ MOTIVUL SCRIS AICI ERA FALS, ȘI L-AM MĂSURAT PE 31.08.2026. Spunea
    „paginile sunt prerandate, iar prerandarea nu află singură că s-a schimbat
    baza". Dintre toate rutele de blog, SINGURA prerandată e `/blog/feed`:
    `/blog`, `/blog/cautare` și paginile de rubrică, autor și etichetă citesc
    `searchParams` (deci se randează la cerere), iar `/blog/[slug]` n-are nici
    `generateStaticParams`, nici `dynamic = "force-static"`.

    Rândurile rămân, și tot sunt necesare — dar pentru celălalt motiv: fluxul RSS
    are `revalidate = 3600`, deci FĂRĂ ele un articol publicat acum ar apărea în
    flux abia peste o oră. Iar dacă vreuna din rute devine cândva statică,
    `revalidatePath` e deja la locul lui.

    ⚠ DACĂ SCHIMBI CEVA AICI, măsoară, nu deduce: `npm run build` spune negru pe
    alb ce e static (○), ce e prerandat (●) și ce se randează la cerere (ƒ).
  */
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
  /*
    ⚠ ȘI PAGINILE DE RUBRICĂ, AUTOR ȘI ETICHETĂ.

    O salvare poate muta articolul dintr-o rubrică în alta, îi poate schimba
    autorul sau etichetele — iar `revalidatePath` invalidează DOAR calea numită.
    Celelalte pagini care se hrănesc din aceleași date rămân vechi, fără ca
    nimic să spună că sunt vechi.

    Se dă ruta cu paranteze drepte și `"page"`, ca să prindă toate valorile
    segmentului dinamic, nu o singură pagină.
  */
  revalidatePath("/blog/categorie/[slug]", "page");
  revalidatePath("/blog/autor/[slug]", "page");
  revalidatePath("/blog/eticheta/[slug]", "page");
  revalidatePath("/blog/feed");
}

/**
 * Ce întoarce o acțiune.
 *
 * ⚠ DOUĂ TIPURI, NU UNUL CONDIȚIONAT. Prima formă era un singur tip generic cu
 * `T extends undefined ? ... : ...`, iar la apelant `res.date` ieșea `unknown`:
 * TypeScript nu poate desface un tip condiționat după o îngustare cu `in`. Două
 * nume simple se îngustează corect și se citesc mai ușor.
 */
type Raspuns = { error: string } | { success: true };
type RaspunsCu<T> = { error: string } | { success: true; date: T };

/**
 * Face un slug bun sau spune de ce nu poate.
 *
 * ⚠ BAZA RESPINGE SLUG-URILE STRAMBE PRINTR-UN `check`, iar un `check` picat
 * nu strica un camp, ci opreste INTREGUL rand sa existe. Daca as lasa un slug
 * gol sa ajunga acolo, omul ar primi „eroare la salvare" fara sa afle vreodata
 * ca de vina era numele scris doar din semne de punctuatie. Deci il prind aici,
 * unde pot sa-i spun ce s-a intamplat.
 */
function slugSauMotiv(dorit: string | null | undefined, dinNume: string): { slug: string } | { error: string } {
  const brut = (dorit ?? "").trim() || dinNume;
  const slug = slugDin(brut);
  if (!slug) {
    return { error: "Din numele acesta nu iese o adresa web. Scrie si cateva litere sau cifre." };
  }
  return { slug };
}

/** Mesaj omenesc pentru cele doua erori de baza pe care le poate produce omul. */
function traduEroare(error: { code?: string; message?: string } | null, ceEra: string): string {
  if (error?.code === "23505") return `Exista deja ${ceEra} cu aceasta adresa web. Alege alta.`;
  return "Nu s-a putut salva. Incearca din nou.";
}

// ── Autori ───────────────────────────────────────────────────────────────────

/**
 * Cât de lung are voie să fie fiecare câmp de autor sau de rubrică.
 *
 * ⚠ ARTICOLELE AVEAU PLAFOANE, ASTEA NU. Ecranele lor sunt doar pentru
 * administratori, ceea ce micșorează mult riscul — dar acțiunea de server rămâne
 * o adresă POST, iar „numai adminii ajung aici" e o presupunere despre cine
 * apasă, nu despre ce se poate trimite.
 *
 * ⚠ NUMERELE SUNT LARGI. Nu sunt reguli de redacție: o biografie bună n-are de ce
 * să fie oprită de aici. Sunt marginea de dincolo de care valoarea nu mai poate
 * fi ceva scris de un om.
 */
const LIMITE_TAXONOMIE = {
  name: 120,
  slug: 100,
  role_title: 160,
  bio: 5000,
  avatar_url: 2048,
  description: 2000,
  seo_title: 200,
  seo_description: 500,
  sameas: 8,
  sameas_url: 2048,
} as const;

/** Numele omenesc al câmpului, ca mesajul să spună unde să se uite omul. */
const NUME_TAXONOMIE: Record<string, string> = {
  name: "Numele",
  slug: "Adresa",
  role_title: "Rolul",
  bio: "Descrierea",
  avatar_url: "Adresa pozei",
  description: "Descrierea",
  seo_title: "Titlul SEO",
  seo_description: "Descrierea SEO",
};

function preaLungTaxonomie(
  campuri: [keyof typeof LIMITE_TAXONOMIE, string | null | undefined][],
): string | null {
  for (const [camp, valoare] of campuri) {
    const n = (valoare ?? "").length;
    if (n > LIMITE_TAXONOMIE[camp]) {
      return `${NUME_TAXONOMIE[camp] ?? camp} are ${n} de caractere, iar maximul e ${LIMITE_TAXONOMIE[camp]}.`;
    }
  }
  return null;
}

/** Adresele publice ale unui autor: câte, și cât de lungi. */
function preaMulteAdrese(adrese: string[] | undefined): string | null {
  const a = adrese ?? [];
  if (a.length > LIMITE_TAXONOMIE.sameas) {
    return `Sunt prea multe adrese publice. Maximul e ${LIMITE_TAXONOMIE.sameas}.`;
  }
  if (a.some((x) => (x ?? "").length > LIMITE_TAXONOMIE.sameas_url)) {
    return `O adresă publică e mai lungă de ${LIMITE_TAXONOMIE.sameas_url} de caractere.`;
  }
  return null;
}

export async function listeazaAutori(): Promise<AutorBlog[]> {
  if (!(await requireBlogEditorApi())) return [];
  const { data, error } = await blogDb().from("blog_authors").select("*").order("name");
  return (cereAdmin({ data, error }, "listeazaAutori") ?? []) as AutorBlog[];
}

export type AutorInput = {
  name: string;
  slug?: string | null;
  role_title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  sameas?: string[];
  /**
   * Contul de pe platformă al persoanei, dacă are unul.
   *
   * ⚠ COLOANA EXISTA DE LA ÎNCEPUT ȘI NU O SCRIA NIMIC. Un câmp pe care nimeni
   * nu-l pune și nimeni nu-l citește nu e „pregătit pentru viitor", e o promisiune
   * pe care schema o face și codul n-o ține: următorul care o vede presupune că
   * e completată și construiește pe ea.
   *
   * Acum face ceva: un articol nou pornește cu autorul legat de contul celui
   * care scrie, în loc să-l pună pe om să-l aleagă din listă de fiecare dată — și
   * să poată alege, din neatenție, numele altcuiva.
   */
  user_id?: string | null;
};

export async function creeazaAutor(intrare: AutorInput): Promise<RaspunsCu<{ id: string }>> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const capat = preaLungTaxonomie([
    ["name", intrare.name],
    ["slug", intrare.slug],
    ["role_title", intrare.role_title],
    ["bio", intrare.bio],
    ["avatar_url", intrare.avatar_url],
  ]) ?? preaMulteAdrese(intrare.sameas);
  if (capat) return { error: capat };


  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  /*
    ⚠ ACEEAȘI POARTĂ CA LA COPERTĂ ȘI LA IMAGINEA DE PARTAJARE.

    Avatarul se scria neverificat, doar cu `trim()`. Iar el ajunge într-un
    `<Image>` pe pagina publică a autorului și sub fiecare articol al lui — deci
    o adresă străină pusă printr-o cerere scrisă de mână ar face ca BROWSERUL
    fiecărui cititor să ceară poza de la serverul acela. Care vede atunci IP-ul,
    agentul, ora și traficul nostru.

    E chiar motivul pentru care imaginile din corpul articolului sunt îngrădite.
    Nu se rescrie regula: se cheamă aceeași funcție.
  */
  const avatar = adresaDeImagine(intrare.avatar_url, "Avatarul autorului");
  if (!avatar.ok) return { error: avatar.motiv };

  const { data, error } = await blogDb()
    .from("blog_authors")
    .insert({
      name: nume,
      slug: s.slug,
      role_title: intrare.role_title?.trim() || null,
      bio: intrare.bio?.trim() || null,
      avatar_url: avatar.adresa,
      sameas: adreseBune(intrare.sameas),
      user_id: intrare.user_id || null,
    })
    .select("id")
    .single();

  if (error) return { error: traduEroare(error, "un autor") };
  reimprospateaza();
  return { success: true, date: { id: (data as { id: string }).id } };
}

export async function actualizeazaAutor(id: string, intrare: AutorInput): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const capat = preaLungTaxonomie([
    ["name", intrare.name],
    ["slug", intrare.slug],
    ["role_title", intrare.role_title],
    ["bio", intrare.bio],
    ["avatar_url", intrare.avatar_url],
  ]) ?? preaMulteAdrese(intrare.sameas);
  if (capat) return { error: capat };


  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  /*
    ⚠ SLUGUL ȘI REDIRECTAREA, ÎN ACEEAȘI TRANZACȚIE.

    Erau două cereri: întâi `update`, apoi redirectarea. Dacă a doua pica, adresa
    nouă era deja pe site iar cea veche dădea 404 pe loc — și acțiunea întorcea
    `success`, fiindcă prima izbutise. Un comentariu scris chiar aici spunea că
    asta e purtarea bună: „o redenumire salvată cu redirectarea ratată e mai bună
    decât una nesalvată".

    Nu e, pentru o pagină indexată. Acolo redirectarea nu e un lucru în plus, e
    jumătatea care păstrează ce a strâns pagina în ani. Ori amândouă, ori niciuna.
  */
  /*
    ⚠ ACEEAȘI POARTĂ CA LA COPERTĂ ȘI LA IMAGINEA DE PARTAJARE.

    Avatarul se scria neverificat, doar cu `trim()`. Iar el ajunge într-un
    `<Image>` pe pagina publică a autorului și sub fiecare articol al lui — deci
    o adresă străină pusă printr-o cerere scrisă de mână ar face ca BROWSERUL
    fiecărui cititor să ceară poza de la serverul acela. Care vede atunci IP-ul,
    agentul, ora și traficul nostru.

    E chiar motivul pentru care imaginile din corpul articolului sunt îngrădite.
    Nu se rescrie regula: se cheamă aceeași funcție.
  */
  const avatar = adresaDeImagine(intrare.avatar_url, "Avatarul autorului");
  if (!avatar.ok) return { error: avatar.motiv };

  const { error } = await blogDb().rpc("blog_actualizeaza_taxonomia", {
    p_fel: "autor",
    p_id: id,
    p_rand: {
      name: nume,
      slug: s.slug,
      role_title: intrare.role_title?.trim() || null,
      bio: intrare.bio?.trim() || null,
      avatar_url: avatar.adresa,
      sameas: adreseBune(intrare.sameas),
      user_id: intrare.user_id || null,
    },
  });

  if (error) return { error: traduEroare(error, "un autor") };
  reimprospateaza();
  return { success: true };
}
/**
 * Sterge un autor.
 *
 * Articolele lui NU se sterg: cheia straina e `on delete set null`, deci raman
 * publicate, fara autor. Asta e purtarea buna — un articol care se vede in
 * Google n-are de ce sa dispara fiindca a plecat cine l-a scris — dar omul
 * trebuie sa stie cate articole raman asa, de aceea le numar inainte.
 */
export async function stergeAutor(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  /*
    ⚠ ȘI REDIRECTĂRILE PLEACĂ ODATĂ CU AUTORUL.

    Fără asta rămâneau adrese care duc către o pagină care nu mai există:
    `veche → nouă`, iar `nouă` tocmai a fost ștearsă. Un 404 după o săritură e
    mai rău decât unul direct — al doilea măcar e cinstit de la prima cerere.

    Funcția filtrează pe `fel`, deci un articol cu același slug istoric rămâne
    neatins.
  */
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_taxonomia", {
    p_fel: "autor", p_id: id,
  });
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  if (aSters !== true) return { error: "Nu mai există." };

  reimprospateaza();
  return { success: true };
}

/** Cate articole ar ramane fara autor. Se cere INAINTE de stergere, pentru avertisment. */
export async function articoleAleAutorului(id: string): Promise<Numaratoare> {
  if (!(await requireAdminApi())) return { ok: false, motiv: "Neautorizat" };
  const { count, error } = await blogDb()
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", id);
  if (error) return { ok: false, motiv: "Nu am putut număra articolele autorului." };
  return { ok: true, cate: count ?? 0 };
}

// ── Categorii ────────────────────────────────────────────────────────────────

export async function listeazaCategorii(): Promise<CategorieBlog[]> {
  if (!(await requireBlogEditorApi())) return [];
  const { data, error } = await blogDb()
    .from("blog_categories")
    .select("*")
    .order("sort_order")
    .order("name");
  return (cereAdmin({ data, error }, "listeazaCategorii") ?? []) as CategorieBlog[];
}

export type CategorieInput = {
  name: string;
  slug?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  sort_order?: number;
};

export async function creeazaCategorie(intrare: CategorieInput): Promise<RaspunsCu<{ id: string }>> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const capat = preaLungTaxonomie([
    ["name", intrare.name],
    ["slug", intrare.slug],
    ["description", intrare.description],
    ["seo_title", intrare.seo_title],
    ["seo_description", intrare.seo_description],
  ]);
  if (capat) return { error: capat };


  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  const { data, error } = await blogDb()
    .from("blog_categories")
    .insert({
      name: nume,
      slug: s.slug,
      description: intrare.description?.trim() || null,
      seo_title: intrare.seo_title?.trim() || null,
      seo_description: intrare.seo_description?.trim() || null,
      sort_order: intrare.sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) return { error: traduEroare(error, "o categorie") };
  reimprospateaza();
  return { success: true, date: { id: (data as { id: string }).id } };
}

export async function actualizeazaCategorie(id: string, intrare: CategorieInput): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const capat = preaLungTaxonomie([
    ["name", intrare.name],
    ["slug", intrare.slug],
    ["description", intrare.description],
    ["seo_title", intrare.seo_title],
    ["seo_description", intrare.seo_description],
  ]);
  if (capat) return { error: capat };


  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  /*
    ⚠ SLUGUL ȘI REDIRECTAREA, ÎN ACEEAȘI TRANZACȚIE.

    Erau două cereri: întâi `update`, apoi redirectarea. Dacă a doua pica, adresa
    nouă era deja pe site iar cea veche dădea 404 pe loc — și acțiunea întorcea
    `success`, fiindcă prima izbutise. Un comentariu scris chiar aici spunea că
    asta e purtarea bună: „o redenumire salvată cu redirectarea ratată e mai bună
    decât una nesalvată".

    Nu e, pentru o pagină indexată. Acolo redirectarea nu e un lucru în plus, e
    jumătatea care păstrează ce a strâns pagina în ani. Ori amândouă, ori niciuna.
  */
  const { error } = await blogDb().rpc("blog_actualizeaza_taxonomia", {
    p_fel: "categorie",
    p_id: id,
    p_rand: {
      name: nume,
      slug: s.slug,
      description: intrare.description?.trim() || null,
      seo_title: intrare.seo_title?.trim() || null,
      seo_description: intrare.seo_description?.trim() || null,
      sort_order: intrare.sort_order ?? 0,
    },
  });

  if (error) return { error: traduEroare(error, "o categorie") };
  reimprospateaza();
  return { success: true };
}
export async function stergeCategorie(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  /*
    ⚠ ȘI REDIRECTĂRILE PLEACĂ ODATĂ CU RUBRICA.

    Fără asta rămâneau adrese care duc către o pagină care nu mai există:
    `veche → nouă`, iar `nouă` tocmai a fost ștearsă. Un 404 după o săritură e
    mai rău decât unul direct — al doilea măcar e cinstit de la prima cerere.

    Funcția filtrează pe `fel`, deci un articol cu același slug istoric rămâne
    neatins.
  */
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_taxonomia", {
    p_fel: "categorie", p_id: id,
  });
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  if (aSters !== true) return { error: "Nu mai există." };

  reimprospateaza();
  return { success: true };
}

/** Cate articole ar ramane fara categorie. */
export async function articoleAleCategoriei(id: string): Promise<Numaratoare> {
  if (!(await requireAdminApi())) return { ok: false, motiv: "Neautorizat" };
  const { count, error } = await blogDb()
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (error) return { ok: false, motiv: "Nu am putut număra articolele rubricii." };
  return { ok: true, cate: count ?? 0 };
}



/** Etichetele unui articol, pentru cand se deschide in editor. */
export async function eticheteleArticolului(idArticol: string): Promise<string[]> {
  if (!(await requireBlogEditorApi())) return [];
  const { data, error } = await blogDb()
    .from("blog_post_tags").select("blog_tags(name)").eq("post_id", idArticol);
  return ((cereAdmin({ data, error }, "eticheteleArticolului") ?? []) as Record<string, unknown>[])
    .map((r) => {
      const t = Array.isArray(r.blog_tags) ? r.blog_tags[0] : r.blog_tags;
      return (t as { name?: string } | null)?.name ?? "";
    })
    .filter(Boolean)
    .sort();
}

/** Toate etichetele, cu numarul de articole pe fiecare. Pentru ecranul de admin. */
const ETICHETE_PE_PAGINA = 100;

export type EticheteInAdmin = { id: string; slug: string; name: string; cate: number };
export type PaginaEtichete = {
  etichete: EticheteInAdmin[];
  total: number;
  pagina: number;
  pagini: number;
};

export async function listeazaEtichete(
  pagina = 1,
  cauta?: string,
): Promise<PaginaEtichete> {
  if (!(await requireAdminApi())) return { etichete: [], total: 0, pagina: 1, pagini: 1 };

  /*
    ⚠ SE NUMĂRĂ ÎN BAZĂ, NU AICI.

    Erau două cereri — toate etichetele și toate legăturile — și o numărătoare în
    JavaScript. Ambele sunt tăiate tăcut de PostgREST la 1000 de rânduri: de la a
    1001-a legătură numerele de lângă etichete devin pur și simplu greșite, iar de
    la a 1001-a etichetă unele nici nu mai apar. Nimic nu dă eroare.

    ⚠ ALTĂ FUNCȚIE DECÂT CEA PUBLICĂ. `blog_etichete_folosite` numără doar
    articolele publicate și sare peste `noindex`. Adminul trebuie să vadă și
    etichetele legate doar de ciorne — altfel ar șterge una crezând că nu e
    folosită nicăieri.
  */
  const p = Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : 1;
  const termen = (cauta ?? "").trim();

  const { data, error } = await blogDb().rpc("blog_etichete_admin", {
    p_de_la: (p - 1) * ETICHETE_PE_PAGINA,
    p_cate: ETICHETE_PE_PAGINA,
    p_cauta: termen ? pregatesteCautarea(termen) : null,
  });

  const raspuns = (cereAdmin({ data, error }, "listeazaEtichete") ?? { randuri: [], total: 0 }) as {
    randuri: { id: string; slug: string; name: string; cate: number }[];
    total: number;
  };
  const total = Number(raspuns.total ?? 0);

  return {
    etichete: (raspuns.randuri ?? []).map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      cate: Number(e.cate ?? 0),
    })),
    total,
    pagina: p,
    pagini: Math.max(1, Math.ceil(total / ETICHETE_PE_PAGINA)),
  };
}

/**
 * Șterge o etichetă.
 *
 * ⚠ NOTA DE AICI SPUNEA „ARTICOLELE RĂMÂN NEATINSE", ȘI ERA GREȘITĂ.
 *
 * Legăturile chiar cad singure — cheia străină e `on delete cascade` — dar exact
 * asta ÎNSEAMNĂ că articolul s-a schimbat: eticheta dispare de sub el și de pe
 * pagina ei. Ce rămânea neatins era `edit_version`, adică tocmai numărul care
 * ar fi trebuit să spună că s-a schimbat ceva.
 *
 * Ce se întâmpla: un editor ține articolul deschis, cu eticheta încă în
 * formular. Adminul o șterge. Versiunea nu se mișcă, deci salvarea editorului
 * trece de blocajul optimist, iar `blog_salveaza_articol` o RECREEAZĂ prin
 * `on conflict (slug) do nothing`. Ștergerea se anulează singură.
 *
 * Și nici măcar nu era nevoie de o apăsare: editorul salvează singur la 30 de
 * secunde când are ceva nesalvat.
 *
 * Acum totul stă într-o singură tranzacție în baza de date: lista articolelor
 * atinse se ia ÎNAINTE de ștergere (după ea, cascada le-ar fi șters urma),
 * rândurile se blochează în ordine, iar la final primesc `edit_version + 1` și
 * `content_updated_at = now()`. Fila veche primește atunci P0409, cum se cuvine.
 */
export async function stergeEticheta(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_eticheta", { p_id: id });
  if (error) return { error: "Nu s-a putut șterge. Încearcă din nou." };
  if (aSters !== true) return { error: "Eticheta nu mai există." };
  reimprospateaza();
  return { success: true };
}

/**
 * Are voie rolul asta sa lase articolul in starea asta?
 *
 * ⚠ AICI E MARGINEA ADEVARATA A REDACTORULUI, nu in regulile din baza.
 * Actiunile folosesc cheia de serviciu, care sare peste drepturile pe rand;
 * regulile de acolo sunt a doua plasa, pentru cine ar ajunge la tabele pe alt
 * drum. Ce se intampla prin panou trece pe aici.
 *
 * Un redactor poate scrie si trimite la verificare. Publicarea si arhivarea
 * raman ale adminului: sunt hotarari despre ce vede lumea, nu despre text.
 */
function poateLasaInStarea(rol: "admin" | "editor", stare: StareArticol): boolean {
  if (rol === "admin") return true;
  return stare === "draft" || stare === "review";
}

const NU_AI_VOIE_SA_PUBLICI =
  "Nu poți publica singur. Trimite articolul la verificare, iar un administrator îl publică.";

// ── Articole ─────────────────────────────────────────────────────────────────

/** Rândul din lista de admin: articolul plus numele autorului și al categoriei. */
export type ArticolInLista = Pick<
  ArticolBlog,
  "id" | "slug" | "title" | "status" | "published_at" | "is_featured" | "is_pinned" | "reading_minutes" | "updated_at"
> & {
  autor: string | null;
  categorie: string | null;
  /** Din `blog_post_stats`, nu de pe rândul articolului. Vezi nota din `types.ts`. */
  views: number;
};

/*
  ⚠ NU `export`, INTR-UN FISIER `"use server"`.

  Acolo au voie sa fie exportate DOAR functii asincrone: fiecare export devine o
  adresa POST. O constanta exportata rupe build-ul cu „Only async functions are
  allowed to be exported in a use server file" — iar `tsc` si lint-ul NU vad asta,
  fiindca e o regula a lui Next, nu a lui TypeScript. S-a vazut abia la `npm run
  build`, dupa ce celelalte doua porti spusesera „curat".
*/
const ARTICOLE_PE_PAGINA = 25;

export type PaginaArticole = {
  articole: ArticolInLista[];
  total: number;
  pagina: number;
  pagini: number;
};

/**
 * Articolele din admin, pe pagini, cu căutarea și filtrul făcute în bază.
 *
 * ⚠ CITEA PRACTIC LISTA ÎNTREAGĂ, iar ecranul filtra în browser.
 *
 * Comod cât timp sunt puține. Dar PostgREST taie tăcut la 1000 de rânduri: de la
 * al 1001-lea articol, cele mai vechi pur și simplu nu mai apar în admin — și nu
 * apare nici vreun semn că lipsesc. Un articol pe care nu-l mai găsești în admin
 * e, practic, un articol pierdut: rămâne pe site, dar nimeni nu-l mai poate
 * edita sau retrage.
 *
 * ⚠ CĂUTAREA E TRECUTĂ PRIN `pregatesteCautarea`, ca cea publică — deci pliază
 * diacriticele ȘI scapă `%` și `_`, care au înțeles în `like`. Fără asta, o
 * căutare după `%` ar întoarce toate articolele.
 */
export async function listeazaArticole(
  pagina = 1,
  cauta?: string,
  stare?: StareArticol,
): Promise<PaginaArticole> {
  const gol: PaginaArticole = { articole: [], total: 0, pagina: 1, pagini: 1 };
  if (!(await requireBlogEditorApi())) return gol;

  const p = Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : 1;
  const termen = (cauta ?? "").trim();

  const { data, error } = await blogDb().rpc("blog_articole_admin", {
    p_de_la: (p - 1) * ARTICOLE_PE_PAGINA,
    p_cate: ARTICOLE_PE_PAGINA,
    p_cauta: termen ? pregatesteCautarea(termen) : null,
    p_stare: stare ?? null,
  });
  cereAdmin({ data, error }, "listeazaArticole");

  /*
    ⚠ TOTALUL VINE ALĂTURI DE RÂNDURI, NU PE ELE.

    Înainte călătorea pe fiecare rând, prin `count(*) over ()`. La
    `/admin/blog?p=999` cu 300 de articole în bază, interogarea întoarce ZERO
    rânduri — deci nu mai exista niciun rând din care să-l citești, iar ecranul
    spunea „Niciun articol" peste o bază plină.
  */
  const raspuns = (data ?? { randuri: [], total: 0 }) as {
    randuri: ArticolInLista[];
    total: number;
  };
  const randuri = raspuns.randuri ?? [];
  const total = Number(raspuns.total ?? 0);

  return {
    articole: randuri.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      published_at: r.published_at,
      is_featured: r.is_featured,
      is_pinned: r.is_pinned,
      reading_minutes: r.reading_minutes,
      updated_at: r.updated_at,
      autor: r.autor,
      categorie: r.categorie,
      views: Number(r.views ?? 0),
    })),
    total,
    pagina: p,
    pagini: Math.max(1, Math.ceil(total / ARTICOLE_PE_PAGINA)),
  };
}
export async function iaArticol(id: string): Promise<ArticolBlog | null> {
  if (!(await requireBlogEditorApi())) return null;
  const { data, error } = await blogDb().from("blog_posts").select("*").eq("id", id).maybeSingle();
  /* ⚠ `maybeSingle()`, nu `single()`: acesta din urma pune EROARE cand nu gaseste
     randul, deci „articolul nu exista" si „baza a cazut" ar fi sosit pe acelasi
     drum — exact confuzia pe care `cereAdmin` o desface. */
  return cereAdmin({ data, error }, "iaArticol") ? caArticol(data) : null;
}

/**
 * Articolul pentru PREVIZUALIZARE, cu autorul si rubrica lui.
 *
 * ⚠ TRECE PESTE FILTRELE DE VIZIBILITATE, SI DE ACEEA ARE PAZA IN PRIMA LINIE.
 *
 * Toate celelalte citiri de articole din site refuza ce nu e `published` cu data
 * trecuta — asta e tocmai ce le face sigure. Aceasta nu refuza nimic, fiindca
 * rostul ei e sa arate o CIORNA. Deci singurul lucru care sta intre o ciorna si
 * lumea intreaga e `requireBlogEditorApi()` de mai jos. Nu se scoate, nu se muta
 * mai jos, si nu se cheama functia asta din nicio pagina publica.
 */
export async function articolDePrevizualizat(id: string): Promise<ArticolPrevizualizat | null> {
  if (!(await requireBlogEditorApi())) return null;
  const { data, error } = await blogDb()
    .from("blog_posts")
    .select("*, blog_authors(*), blog_categories(*)")
    .eq("id", id)
    .maybeSingle();
  if (!cereAdmin({ data, error }, "articolDePrevizualizat")) return null;
  const r = data as Record<string, unknown>;
  const unul = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null);
  return {
    ...(r as unknown as ArticolBlog),
    autor: unul<AutorBlog>(r.blog_authors),
    categorie: unul<CategorieBlog>(r.blog_categories),
  };
}

export type ArticolPrevizualizat = ArticolBlog & {
  autor: AutorBlog | null;
  categorie: CategorieBlog | null;
};

export type ArticolInput = {
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  answer_summary?: string | null;
  content_html?: string;
  cover_url?: string | null;
  cover_alt?: string | null;
  og_image_url?: string | null;
  author_id?: string | null;
  category_id?: string | null;
  status?: StareArticol;
  published_at?: string | null;
  is_featured?: boolean;
  is_pinned?: boolean;
  cta?: unknown;
  faq?: IntrebareBlog[];
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  noindex?: boolean;
  /** Numele etichetelor, asa cum le-a scris omul. Se fac singure daca nu exista. */
  etichete?: string[];
  /**
   * Versiunea de la care a plecat cel care editeaza.
   *
   * ⚠ FARA EA, ULTIMA SCRIERE CASTIGA IN TACERE. Doua file deschise pe acelasi
   * articol, sau doi redactori: A salveaza, B salveaza peste, si nimeni nu afla
   * nimic. Trimisa, baza refuza scrierea lui B cu `P0409` daca articolul s-a
   * schimbat intre timp.
   *
   * ⚠ NOTA DE AICI SPUNEA „`undefined` sare peste verificare — dinadins, pentru
   * unelte si reparatii". NU MAI E ADEVARAT, si nici nu era o idee buna: exact
   * portita aceea a fost astupata pe 31.08.2026, fiindca actiunea trimitea
   * `edit_version ?? null` si orice cerere careia ii lipsea campul stingea
   * blocajul optimist. Acum `versiuneaCeruta` respinge `undefined`, iar baza
   * ridica `P0400`.
   *
   * ⚠ CAMPUL RAMANE OPTIONAL DIN ALT MOTIV: `ArticolInput` e folosit si de
   * `creeazaArticol`, care nu se uita deloc la el — un articol nou n-are de la ce
   * versiune sa plece. La ACTUALIZARE e obligatoriu, si se cere la rulare.
   */
  edit_version?: number | null;
  /**
   * Salvare automata: nu scrie versiune in istoric.
   *
   * Bate la 30 de secunde. Cu o revizie de fiecare data, cele 50 de sloturi se
   * umplu in 25 de minute de scris, iar istoricul ajunge sa contina numai
   * variante aproape identice din ultima jumatate de ora.
   */
  tacut?: boolean;
};

/**
 * Curăță lista de întrebări.
 *
 * ⚠ O pereche pe jumătate scrisă NU pleacă în datele structurate. `FAQPage` cu
 * un răspuns gol e o declarație falsă către Google: promite un răspuns care nu
 * există. Mai bine o întrebare în minus decât o structură care minte.
 */
/**
 * Curăță îndemnul înainte de scriere.
 *
 * ⚠ ACEEAȘI REGULĂ CA LA AFIȘARE, aplicată mai devreme. `indemnDeAratat` aruncă
 * un „propriu" fără adresă sau fără etichetă; aici se aruncă înainte să intre în
 * bază, ca să nu rămână acolo un rând care arată a îndemn și nu e. Altfel omul
 * ar salva, ar reveni, ar vedea câmpurile pe jumătate completate și ar crede că
 * îndemnul e pus — când în pagină nu apare nimic.
 */
function indemnDeSalvat(brut: unknown): unknown {
  return indemnDeAratat(brut) ? brut : null;
}

function intrebariBune(intrari: IntrebareBlog[] | undefined): IntrebareBlog[] {
  return (intrari ?? [])
    .map((i) => ({ q: (i.q ?? "").trim(), a: (i.a ?? "").trim() }))
    .filter((i) => i.q.length > 0 && i.a.length > 0);
}

/**
 * Cât de lung are voie să fie fiecare câmp.
 *
 * ⚠ VERIFICAREA DIN EDITOR NU E O VERIFICARE.
 *
 * Ecranul are `maxLength` pe casete, dar `maxLength` e o purtare a browserului,
 * nu o regulă: acțiunea de server e o adresă POST pe care oricine o poate chema
 * direct, cu ce vrea în ea (vezi ghidul Next, „Treat every action as an
 * untrusted entry point"). Fără rândurile de mai jos, un `content_html` de
 * cincizeci de megaocteți intra în baza de date, iar de acolo în fiecare
 * randare a paginii și în fiecare versiune din istoric.
 *
 * ⚠ NUMERELE SUNT LARGI DINADINS. Nu sunt reguli de redacție — un articol lung
 * și bun nu trebuie oprit de aici. Sunt marginea de dincolo de care valoarea nu
 * mai poate fi ceva scris de un om.
 */
const LIMITE = {
  title: 200,
  slug: 80,
  excerpt: 500,
  answer_summary: 1200,
  content_html: 400_000,
  cover_url: 2048,
  cover_alt: 300,
  og_image_url: 2048,
  seo_title: 200,
  seo_description: 500,
  canonical_url: 2048,
  intrebare: 300,
  raspuns: 2000,
  eticheta: 40,
} as const;

const NUME_OMENESC: Record<string, string> = {
  title: "Titlul",
  slug: "Adresa",
  excerpt: "Rezumatul",
  answer_summary: "Răspunsul scurt",
  content_html: "Textul articolului",
  cover_url: "Adresa copertei",
  cover_alt: "Textul copertei",
  og_image_url: "Imaginea de partajare",
  seo_title: "Titlul SEO",
  seo_description: "Descrierea SEO",
  canonical_url: "Adresa canonică",
};

/**
 * Trece intrarea de plafoane?
 *
 * ⚠ SPUNE CARE CÂMP ȘI CU CÂT. Un „datele nu sunt valide" l-ar lăsa pe om să
 * caute singur, într-un formular cu douăzeci de casete, care dintre ele e prea
 * lungă — și n-ar afla niciodată, fiindcă nimic nu i-ar arăta numărul.
 */
function preaLung(intrare: ArticolInput): string | null {
  const perechi: [keyof typeof LIMITE, string | null | undefined][] = [
    ["title", intrare.title],
    ["slug", intrare.slug],
    ["excerpt", intrare.excerpt],
    ["answer_summary", intrare.answer_summary],
    ["content_html", intrare.content_html],
    ["cover_url", intrare.cover_url],
    ["cover_alt", intrare.cover_alt],
    ["og_image_url", intrare.og_image_url],
    ["seo_title", intrare.seo_title],
    ["seo_description", intrare.seo_description],
    ["canonical_url", intrare.canonical_url],
  ];
  for (const [camp, valoare] of perechi) {
    const n = (valoare ?? "").length;
    if (n > LIMITE[camp]) {
      return `${NUME_OMENESC[camp] ?? camp} are ${n} de caractere, iar maximul e ${LIMITE[camp]}.`;
    }
  }

  /* Întrebările frecvente: și câte, și cât de lungi. Zece e cu mult peste ce se
     citește vreodată dintr-un articol, și peste ce arată Google. */
  const faq = intrare.faq ?? [];
  if (faq.length > 10) return "Sunt prea multe întrebări frecvente. Maximul e 10.";
  for (const i of faq) {
    if ((i.q ?? "").length > LIMITE.intrebare) return `O întrebare e mai lungă de ${LIMITE.intrebare} de caractere.`;
    if ((i.a ?? "").length > LIMITE.raspuns) return `Un răspuns e mai lung de ${LIMITE.raspuns} de caractere.`;
  }

  /* Etichetele se tăiau tăcut la 12 bucăți și 40 de caractere, fără să spună.
     Tăcerea aia era o problemă în sine: omul scria cincisprezece etichete,
     apăsa salvează, și trei dispăreau fără ca nimic să spună de ce. Tăierea a
     rămas (în `etichetePentruBaza`), dar acum se dă și un motiv. */
  const etichete = intrare.etichete ?? [];
  if (etichete.length > 12) return "Sunt prea multe etichete. Maximul e 12.";
  if (etichete.some((e) => (e ?? "").trim().length > LIMITE.eticheta)) {
    return `O etichetă e mai lungă de ${LIMITE.eticheta} de caractere.`;
  }

  /*
    Gazdele copertei și ale imaginii de partajare. Vezi `blog/imagini.ts`, unde
    stă și motivul pentru care regula e mai strictă decât cea din `r2-url.ts`.
  */
  for (const [camp, valoare] of [
    ["Adresa copertei", intrare.cover_url],
    ["Imaginea de partajare", intrare.og_image_url],
  ] as const) {
    const r = adresaDeImagine(valoare, camp);
    if (!r.ok) return r.motiv;
  }

  return null;
}

/**
 * Etichetele, pregătite pentru baza de date.
 *
 * ⚠ SLUGUL SE FACE AICI, NU ÎN SQL. `slugDin` e singura regulă de slugit din tot
 * blogul. Rescrisă și în funcția din bază, cele două s-ar fi despărțit tăcut la
 * prima diacritică tratată altfel: aceeași etichetă ar fi ajuns două rânduri, și
 * nimic n-ar fi dat eroare.
 *
 * `undefined` înseamnă „editorul n-a trimis etichete" și iese `null`, pe care
 * baza îl citește ca „nu atinge nimic". Un tablou gol înseamnă „le-a scos pe
 * toate", și e altceva.
 */
function etichetePentruBaza(etichete: string[] | undefined) {
  if (etichete === undefined) return null;
  return [
    ...new Map(
      etichete
        .map((n) => (n ?? "").trim())
        .filter((n) => n.length > 0)
        .map((n) => [slugDin(n), { slug: slugDin(n), name: n }] as const)
        .filter(([slug]) => slug.length > 0),
    ).values(),
  ].slice(0, 12);
}

/** Câmpurile comune la creare și la actualizare. */
function randDinIntrare(intrare: ArticolInput, slug: string) {
  const html = intrare.content_html ?? "";
  return {
    title: intrare.title.trim(),
    slug,
    excerpt: intrare.excerpt?.trim() || null,
    answer_summary: intrare.answer_summary?.trim() || null,
    content_html: html,
    cover_url: intrare.cover_url?.trim() || null,
    cover_alt: intrare.cover_alt?.trim() || null,
    /* ⚠ NU SE ATINGE CAND CEL CARE CHEAMA NU-L TRIMITE.
       Din 30.08.2026 editorul are casuta lui, deci pe drumul obisnuit campul
       vine mereu. Ramura asta ramane pentru celelalte drumuri — un import, o
       reparatie facuta cu SQL, un apel viitor care nu stie de camp: scrierea
       neconditionata l-ar pune pe `null` la fiecare salvare, si o valoare pusa
       de altcineva ar fi stearsa fara ca nimeni sa observe. */
    ...(intrare.og_image_url !== undefined
      ? { og_image_url: intrare.og_image_url?.trim() || null }
      : {}),
    author_id: intrare.author_id || null,
    category_id: intrare.category_id || null,
    status: intrare.status ?? "draft",
    published_at: intrare.published_at || null,
    /* ⚠ VITRINA ȘI FIXAREA NU SUNT AICI, DELOC. Le pune `vitrinaSiFixarea`, și
       numai când are ce pune — vezi nota de la ea. */
    /* Îndemnul se curăță la scriere: un „propriu” pe jumătate scris n-are ce
       căuta în baza de date, fiindcă la afișare ar fi oricum aruncat. */
    cta: indemnDeSalvat(intrare.cta),
    faq: intrebariBune(intrare.faq),
    seo_title: intrare.seo_title?.trim() || null,
    seo_description: intrare.seo_description?.trim() || null,
    canonical_url: canonicaBuna(intrare.canonical_url),
    noindex: intrare.noindex ?? false,
    /* Socotit la salvare, nu la afișare: lista de articole n-are de ce să
       despice HTML-ul a douăzeci de articole ca să scrie un număr lângă fiecare. */
    reading_minutes: minuteDeCitit(html),
  };
}

/**
 * ⚠ PUBLICAT CERE O DATĂ, ALTFEL BAZA RESPINGE TOT RÂNDUL.
 *
 * `blog_posts_published_has_date` e un `check`, iar un `check` picat nu strică
 * un câmp, ci oprește ÎNTREAGA scriere. Fără asta, omul ar apăsa „Publică" și
 * ar primi „nu s-a putut salva", fără să afle vreodată că lipsea data.
 */
/**
 * Cine are voie sa atinga vitrina si fixarea.
 *
 * ⚠ UN REDACTOR NU. Nu e o preferinta de asezare: vitrina si fixarea sunt
 * hotarari despre CE VEDE PUBLICUL PRIMA DATA, iar redactorul nu poate nici
 * macar sa publice. A hotari ce sta in capul paginii fara a putea hotari ce
 * ajunge pe pagina e o margine trasa stramb.
 *
 * ⚠ SI SE APLICA PE SERVER, NU DOAR IN ECRAN. Bifele se ascund si in editor, dar
 * ascunderea nu e paza: actiunea e o adresa POST pe care oricine o poate chema cu
 * ce vrea in ea.
 */
/**
 * Versiunea de la care pleacă cel care scrie — cerută, nu opțională.
 *
 * ⚠ ERA `?? null`, IAR BAZA CITEA `null` CA „NU VERIFICA". Adică orice cerere
 * care nu purta câmpul stingea blocajul optimist cu totul: un client vechi rămas
 * deschis, o filă reîncărcată pe jumătate, un apel viitor scris de altcineva.
 * Se ocolea din NEATENȚIE, ceea ce e mai probabil decât reaua-voință.
 *
 * Baza o cere acum ea însăși (P0400). Verificarea de aici e ca omul să
 * primească un mesaj în românește, nu un cod.
 */
function versiuneaCeruta(v: number | null | undefined): { v: number } | { error: string } {
  if (!Number.isSafeInteger(v) || Number(v) < 1) {
    return {
      error:
        "Nu știu de la ce versiune ai plecat, deci n-aș ști dacă scriu peste munca altcuiva. " +
        "Reîncarcă articolul și încearcă din nou.",
    };
  }
  return { v: Number(v) };
}

function poateAtingeVitrina(rol: "admin" | "editor"): boolean {
  return rol === "admin";
}

/**
 * Poate articolul asta sa tina vitrina?
 *
 * ⚠ NUMAI DACA SE VEDE ACUM. Dovedit pe baza inainte de a fi reparat: articolul
 * A, publicat si in vitrina; cineva bifeaza „scoate-l in fata" pe o CIORNA;
 * declansatorul il cobora pe A; ciorna nu apare pe site fiindca pagina publica
 * cere `status = published`. Rezultat masurat: ZERO articole in vitrina publica,
 * si nicio eroare nicaieri.
 *
 * Acelasi lucru cu un articol PROGRAMAT: pana vine ceasul, nu se vede.
 *
 * Baza tine regula si ea (vezi `blog_o_singura_vitrina`), dar acolo bifa se
 * stinge in tacere. Aici omul primeste un motiv.
 */
function poateFiInVitrina(intrare: ArticolInput): boolean {
  if (intrare.status !== "published") return false;
  const cand = dataLaPublicare(intrare);
  return !!cand && new Date(cand).getTime() <= Date.now();
}

/**
 * Vitrina si fixarea, croite dupa cine scrie si dupa ce se vede.
 *
 * Intoarce fie campurile de pus pe rand, fie un motiv de aratat omului.
 */
function vitrinaSiFixarea(
  rol: "admin" | "editor",
  intrare: ArticolInput,
  esteNou: boolean,
): { is_featured?: boolean; is_pinned?: boolean } | { error: string } {
  if (!poateAtingeVitrina(rol)) {
    /*
      ⚠ NU SE ATING, ȘI ASTA NU E ACELAȘI LUCRU CU „SE SCRIU FALSE".
      Nota de aici chiar spunea „pur si simplu nu se scriu" — și era falsă:
      funcția întorcea `{ is_featured: false, is_pinned: false }`, care AJUNGE
      pe rând.

      Ce se întâmpla: un admin pregătește un articol la verificare și îl fixează
      dinainte, ca să stea sus când se publică. Un redactor îl deschide, schimbă
      un paragraf, apasă Salvează — iar fixarea adminului dispare. Redactorul
      n-a văzut niciodată bifa, deci nici nu poate bănui că a stins-o.

      Acum cheile lipsesc din `p_rand`, iar
      `jsonb_populate_record(vechi, p_rand)` din `blog_salveaza_articol` păstrează
      ce era. La un articol NOU nu există „ce era", deci pornesc pe false.
    */
    return esteNou ? { is_featured: false, is_pinned: false } : {};
  }

  if (intrare.is_featured && !poateFiInVitrina(intrare)) {
    return {
      error:
        "Doar un articol publicat și vizibil acum poate sta în vitrină. " +
        "Publică-l întâi (sau așteaptă ora programată), apoi scoate-l în față.",
    };
  }

  return { is_featured: intrare.is_featured ?? false, is_pinned: intrare.is_pinned ?? false };
}

function dataLaPublicare(intrare: ArticolInput): string | null {
  if (intrare.status !== "published") return intrare.published_at || null;
  return intrare.published_at || new Date().toISOString();
}

/**
 * Autorul legat de contul celui care scrie acum, dacă există unul.
 *
 * ⚠ E O PROPUNERE, NU O REGULĂ. Se folosește doar când editorul n-a ales
 * niciunul. Un admin care scrie în numele altcuiva — se întâmplă — tot poate
 * alege pe cine vrea.
 */
async function autorulMeu(idCont: string): Promise<string | null> {
  const { data, error } = await blogDb()
    .from("blog_authors").select("id").eq("user_id", idCont).maybeSingle();
  return (cereAdmin({ data, error }, "autorulMeu") as { id: string } | null)?.id ?? null;
}

export async function creeazaArticol(intrare: ArticolInput): Promise<RaspunsCu<{ id: string }>> {
  const cine = await requireBlogEditorApi();
  if (!cine) return { error: "Neautorizat" };
  if (!poateLasaInStarea(cine.rol, intrare.status ?? "draft")) {
    return { error: NU_AI_VOIE_SA_PUBLICI };
  }
  const titlu = intrare.title?.trim();
  if (!titlu) return { error: "Titlul este obligatoriu." };

  const capat = preaLung(intrare);
  if (capat) return { error: capat };

  const s = slugSauMotiv(intrare.slug, titlu);
  if ("error" in s) return s;
  /* ⚠ Doar articolele au adrese rezervate: ele stau chiar sub `/blog/`, unde
     sunt și rutele. Categoriile și autorii stau sub prefixele lor, deci nu se
     pot ciocni cu nimic. Vezi `SLUGURI_REZERVATE_BLOG`. */
  if (SLUGURI_REZERVATE_BLOG.has(s.slug)) {
    return { error: `Adresa „${s.slug}" e folosită de o pagină a blogului. Alege alta.` };
  }

  /* Dacă n-a ales un autor, se pune cel legat de contul lui. Vezi `autorulMeu`. */
  const vitrina = vitrinaSiFixarea(cine.rol, intrare, true);
  if ("error" in vitrina) return { error: vitrina.error };

  const rand = { ...randDinIntrare(intrare, s.slug), ...vitrina };
  if (!rand.author_id) rand.author_id = await autorulMeu(cine.id);

  /*
    ⚠ TOT ÎNTR-O TRANZACȚIE, ca și salvarea.

    Erau două cereri: `insert blog_posts`, apoi un ajutor separat care scria
    etichetele — și care nici măcar nu se uita la eroarea de la inserarea
    legăturilor (l-am scos odată cu reparația).
    Deci: articol creat, etichete nescrise, ecranul spune „Articol creat" — și
    articolul nu apare în niciuna dintre rubricile pentru care omul le-a scris.
    Nimic nu dădea vreo eroare, fiindcă prima cerere chiar izbutise.
  */
  const { data, error } = await blogDb().rpc("blog_creeaza_articol", {
    p_rand: caJson({ ...rand, published_at: dataLaPublicare(intrare) }),
    p_etichete: etichetePentruBaza(intrare.etichete),
  });

  if (error) return { error: traduEroare(error, "un articol") };
  const primul = Array.isArray(data) ? data[0] : data;
  const idNou = (primul as { id: string } | null)?.id;
  if (!idNou) return { error: "Nu am putut crea articolul. Încearcă din nou." };

  reimprospateaza();
  return { success: true, date: { id: idNou } };
}

export async function actualizeazaArticol(
  id: string,
  intrare: ArticolInput,
): Promise<RaspunsCu<{ edit_version: number }>> {
  const admin = await requireBlogEditorApi();
  if (!admin) return { error: "Neautorizat" };
  if (!poateLasaInStarea(admin.rol, intrare.status ?? "draft")) {
    return { error: NU_AI_VOIE_SA_PUBLICI };
  }
  const titlu = intrare.title?.trim();
  if (!titlu) return { error: "Titlul este obligatoriu." };

  const capat = preaLung(intrare);
  if (capat) return { error: capat };

  const s = slugSauMotiv(intrare.slug, titlu);
  if ("error" in s) return s;
  /* ⚠ Doar articolele au adrese rezervate: ele stau chiar sub `/blog/`, unde
     sunt și rutele. Categoriile și autorii stau sub prefixele lor, deci nu se
     pot ciocni cu nimic. Vezi `SLUGURI_REZERVATE_BLOG`. */
  if (SLUGURI_REZERVATE_BLOG.has(s.slug)) {
    return { error: `Adresa „${s.slug}" e folosită de o pagină a blogului. Alege alta.` };
  }

  const versiune = versiuneaCeruta(intrare.edit_version);
  if ("error" in versiune) return { error: versiune.error };

  const vitrina = vitrinaSiFixarea(admin.rol, intrare, false);
  if ("error" in vitrina) return { error: vitrina.error };

  const vechi = await iaArticol(id);
  if (!vechi) return { error: "Articolul nu mai există." };

  /* ⚠ SI STAREA DE DINAINTE CONTEAZA. Fara randul asta, un redactor putea lua
     un articol PUBLICAT si sa-l salveze ca ciorna — adica sa-l scoata de pe
     site. Marginea nu e doar „ce lasi in urma", e si „de ce te atingi". */
  if (!poateLasaInStarea(admin.rol, vechi.status)) {
    return { error: "Articolul e publicat. Doar un administrator îl mai poate schimba." };
  }

  /*
    ═══ TOATĂ SALVAREA, ÎNTR-O SINGURĂ TRANZACȚIE ═══

    Aici erau cinci cereri pe rând: rândul articolului, ștergerea redirectării
    inverse, scrierea redirectării noi, refacerea etichetelor, scrierea
    versiunii. Fiecare izbutea sau cădea singură, iar o cădere la mijloc lăsa în
    urmă lucruri care nu dădeau nicio eroare vizibilă:

      - slug schimbat, redirectare nescrisă → adresa veche dă 404, și tot ce
        strânsese articolul în Google se pierde;
      - articol salvat, etichete nescrise → dispare din rubricile lui de pe site;
      - articol salvat, versiune nescrisă → istoricul minte despre ce a fost.

    Ecranul spunea „salvat" în toate cazurile, fiindcă PRIMA cerere chiar
    izbutise.

    PostgREST rulează o funcție într-o singură tranzacție. Deci ori toate, ori
    niciuna. Vezi `2026-08-30_blog_salvare_tranzactionala.sql`.

    ⚠ SLUGUL ETICHETEI SE FACE AICI, NU ÎN SQL. `slugDin` e singura regulă de
    slugit din tot blogul. Rescrisă și în funcție, cele două s-ar fi despărțit
    tăcut la prima diacritică tratată altfel — aceeași capcană ca la
    `pliaza` / `fara_diacritice`.
  */
  /*
    ⚠ FUNCȚIA ÎȘI CITEȘTE SINGURĂ STAREA VECHE, SUB LACĂT.

    Îi trimiteam `p_slug_vechi`, `p_titlu_vechi`, `p_html_vechi` și hotărârea
    `p_lasa_redirect` — toate dintr-o citire făcută cu o clipă mai devreme, în
    altă tranzacție. Între acea citire și scriere se putea schimba orice: revizia
    ar fi păstrat un text care nu mai era cel de dinainte.

    ⚠ ȘI VERSIUNEA. Două file deschise pe același articol: A salvează, B salvează
    peste, și nimeni nu află nimic. Acum B primește `P0409` și i se spune ce s-a
    întâmplat.
  */
  const { data: versiuneNoua, error } = await blogDb().rpc("blog_salveaza_articol", {
    p_id: id,
    p_rand: caJson({
      ...randDinIntrare(intrare, s.slug),
      ...vitrina,
      published_at: dataLaPublicare(intrare),
    }),
    p_etichete: etichetePentruBaza(intrare.etichete),
    p_salvat_de: admin.id,
    p_versiuni: VERSIUNI_PASTRATE,
    p_versiune_asteptata: versiune.v,
    /*
      ⚠ Salvarea automată NU scrie versiune în istoric.

      Bate la 30 de secunde; cu o revizie de fiecare dată, cele 50 de sloturi se
      umplu în 25 de minute de scris, iar istoricul ajunge să conțină numai
      variante aproape identice din ultima jumătate de oră — adică exact ce nu
      caută nimeni când îl deschide.
    */
    p_creeaza_versiune: intrare.tacut !== true,
  });

  /*
    ⚠ Codul `P0409` e ridicat anume de funcție când versiunile nu se potrivesc.
    Mesajul trebuie să spună ce s-a întâmplat ȘI ce are omul de făcut, altfel
    „conflict" îl lasă să apese Salvează la nesfârșit.
  */
  if (error && (error as { code?: string }).code === "P0409") {
    return {
      error:
        "Articolul a fost modificat între timp — în altă filă sau de alt redactor. " +
        "Deschide-l din nou ca să vezi ce e acum acolo; ce ai scris aici nu s-a pierdut, " +
        "e păstrat în ciorna locală din browser.",
    };
  }
  if (error) return { error: traduEroare(error, "un articol") };

  reimprospateaza();
  return { success: true, date: { edit_version: Number(versiuneNoua ?? 0) } };
}

export async function stergeArticol(id: string): Promise<Raspuns> {
  const cine = await requireBlogEditorApi();
  if (!cine) return { error: "Neautorizat" };

  /* Redirectarile CATRE articolul sters raman fara tinta: ar fi trimis un
     vizitator de la o adresa veche catre un 404, ceea ce e mai rau decat 404-ul
     de la bun inceput — al doilea macar e cinstit de la prima cerere. */
  const articol = await iaArticol(id);

  /* Un redactor sterge doar ciorne. Una „la verificare" e deja in fata cuiva
     si ar disparea de sub ochii lui; una publicata e pe site. */
  if (articol && cine.rol === "editor" && articol.status !== "draft") {
    return { error: "Poți șterge doar ciorne. Cere unui administrator." };
  }

  /*
    ⚠ ȘI ȘTERGEREA E O SINGURĂ TRANZACȚIE.

    Erau două cereri, iar prima nici nu era verificată:
      * redirectări șterse, articol neșters → articolul rămâne, dar istoricul lui
        de adrese a fost distrus;
      * redirectări neșterse, articol șters → adresele vechi trimit către un slug
        care acum dă 404, adică o redirectare care duce într-un zid. Un 404 după o
        săritură e mai rău decât unul direct: al doilea măcar e cinstit de la
        prima cerere.

    Funcția filtrează și pe `fel`, deci o rubrică cu același slug istoric rămâne
    neatinsă.
  */
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_articol", { p_id: id });
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  if (aSters !== true) return { error: "Articolul nu mai există." };

  reimprospateaza();
  return { success: true };
}

// ── Istoricul versiunilor ────────────────────────────────────────────────────

/**
 * Câte versiuni se păstrează pentru un articol.
 *
 * ⚠ FĂRĂ PLAFON, ISTORICUL CREȘTE LA NESFÂRȘIT. Fiecare salvare scrie o copie a
 * întregului HTML. Un articol lung, rescris de cincizeci de ori, ar ajunge să
 * ocupe de cincizeci de ori cât el însuși, iar nimeni nu se uită vreodată la a
 * treizecea versiune de acum trei luni.
 *
 * Cincizeci acoperă cu mult o zi de scris intens, care e singurul moment în
 * care omul chiar vrea să se întoarcă.
 */
/* ⚠ Taierea se face IN BAZA, in `blog_salveaza_articol`, nu aici. A fost o
   vreme o functie separata chemata doar din `revinoLaVersiune` — adica exact
   din locul in care nu se aduna nimic. */
const VERSIUNI_PASTRATE = 50;

export type VersiuneInLista = {
  id: string;
  title: string | null;
  created_at: string;
  /** Câte caractere avea textul atunci. Ca să se vadă dintr-o privire ce s-a schimbat. */
  marime: number;
};

/*
  ═══ CINE VEDE ISTORICUL SI CINE POATE REVENI ═══

  Regula, scrisa o data si tinuta in trei locuri:

    REDACTOR  vede istoricul oricarui articol, si poate reveni la o versiune
              DOAR pe un articol in ciorna sau la verificare.
    ADMIN     vede si revine oriunde.

  ⚠ CELE TREI LOCURI TREBUIE SA SPUNA ACELASI LUCRU. Pana pe 30.08.2026 nu
  spuneau: RLS-ul ii ingaduia redactorului sa CITEASCA reviziile, actiunile de
  aici cereau admin, iar butonul „Istoric" din editor se arata tuturor. Deci
  redactorul apasa, se deschidea panoul, si lista iesea GOALA — nu „n-ai voie",
  ci „nu exista nimic". Doua minciuni intr-una: ii spunea ca articolul lui n-are
  istoric, si ii ascundea ca de fapt usa e incuiata.
*/
export async function listeazaVersiuni(idArticol: string): Promise<VersiuneInLista[]> {
  if (!(await requireBlogEditorApi())) return [];
  const { data, error } = await blogDb()
    .from("blog_post_revisions")
    .select("id, title, content_html, created_at")
    .eq("post_id", idArticol)
    .order("created_at", { ascending: false })
    .limit(VERSIUNI_PASTRATE);

  return ((cereAdmin({ data, error }, "listeazaVersiuni") ?? []) as { id: string; title: string | null; content_html: string | null; created_at: string }[])
    .map((v) => ({
      id: v.id,
      title: v.title,
      created_at: v.created_at,
      marime: (v.content_html ?? "").replace(/<[^>]+>/g, "").length,
    }));
}

/** Textul unei versiuni, pentru previzualizare. */
export async function iaVersiune(id: string): Promise<{ title: string | null; content_html: string | null } | null> {
  if (!(await requireBlogEditorApi())) return null;
  const { data, error } = await blogDb()
    .from("blog_post_revisions").select("title, content_html").eq("id", id).maybeSingle();
  return (cereAdmin({ data, error }, "iaVersiune") as { title: string | null; content_html: string | null }) ?? null;
}

/**
 * Aduce înapoi o versiune veche.
 *
 * ⚠ NU SE PIERDE NIMIC. Revenirea trece prin aceeași cale ca o salvare
 * obișnuită, deci starea de ACUM se scrie ea însăși ca versiune înainte să fie
 * înlocuită. Cine revine din greșeală poate reveni înapoi.
 *
 * ⚠ SE ADUC DOAR TITLUL ȘI TEXTUL. Adresa web, starea, data publicării,
 * etichetele și câmpurile de SEO rămân cele de acum. Motivul: o versiune veche
 * a unui articol PUBLICAT i-ar fi adus înapoi și adresa veche, iar aceea e deja
 * în Google. Revenirea la un text nu trebuie să mute pagina.
 */
export type VersiuneRestaurata = {
  title: string;
  content_html: string;
  reading_minutes: number | null;
  edit_version: number;
};

/**
 * Aduce înapoi o versiune veche.
 *
 * ⚠ CEA MAI DISTRUCTIVĂ OPERAȚIE DIN EDITOR: înlocuiește TOT textul. De aceea are
 * acum toate pazele pe care le are salvarea, și una în plus.
 *
 * 1. **Verifică versiunea.** Trimitea `null` dinadins, cu nota „omul tocmai a
 *    citit lista și a ales din ea". Nota era o scuză proastă: între deschiderea
 *    istoricului și apăsare, altcineva putea salva — iar revenirea ștergea munca
 *    aceea fără să spună nimic. Blocajul optimist apăra salvarea obișnuită și
 *    lăsa descoperită tocmai operația care rescrie articolul întreg.
 *
 * 2. **Cere ca revizia să fie A ARTICOLULUI.** Se citea doar după `id`. Prin
 *    ecran nu se poate greși, dar acțiunea e o adresă POST: chemată de mână cu o
 *    revizie a articolului A și id-ul articolului B, textul lui A ajungea peste B.
 *    Se verifică în două locuri — aici, ca să dea un mesaj limpede, și încă o dată
 *    în bază, sub lacăt, fiindcă acolo e singurul loc care nu poate fi ocolit.
 *
 * 3. **Întoarce ce a scris.** Editorul își pune starea din răspuns.
 *    `router.refresh()` singur nu ajungea: aduce datele noi de la server, dar NU
 *    atinge `useState` din client — deci formularul rămânea cu textul de dinainte,
 *    iar `versiuneaMea` cu numărul vechi. Următoarea salvare pica atunci cu P0409,
 *    pe bună dreptate, dar fără ca omul să înțeleagă de ce.
 */
export async function revinoLaVersiune(
  idArticol: string,
  idVersiune: string,
  versiuneAsteptata: number | null,
): Promise<RaspunsCu<VersiuneRestaurata>> {
  const cine = await requireBlogEditorApi();
  if (!cine) return { error: "Neautorizat" };

  const versiune = versiuneaCeruta(versiuneAsteptata);
  if ("error" in versiune) return { error: versiune.error };

  const acum = await iaArticol(idArticol);
  if (!acum) return { error: "Articolul nu mai există." };

  /* Aceeași margine ca la salvare: un redactor nu atinge un articol publicat. */
  if (!poateLasaInStarea(cine.rol, acum.status)) {
    return { error: "Articolul e publicat. Doar un administrator poate reveni la o versiune." };
  }

  /* ⚠ Și `post_id`, nu doar `id`. Vezi punctul 2 de mai sus. */
  const { data: veche, error: eVeche } = await blogDb()
    .from("blog_post_revisions")
    .select("content_html")
    .eq("id", idVersiune)
    .eq("post_id", idArticol)
    .maybeSingle();

  /* ⚠ Eroarea de citire NU e „versiunea nu exista". Prima e a noastra si trece;
     a doua e a omului si nu trece. Doua mesaje, fiindca sunt doua lucruri. */
  if (eVeche) return { error: "Nu am putut citi versiunea acum. Încearcă din nou." };
  if (!veche) return { error: "Versiunea nu mai există sau nu e a acestui articol." };

  const html = (veche as { content_html: string | null }).content_html ?? "";

  const { data, error } = await blogDb().rpc("blog_restaureaza_versiune", {
    p_articol: idArticol,
    p_versiune: idVersiune,
    p_versiune_asteptata: versiune.v,
    p_salvat_de: cine.id,
    /* Socotit aici, nu în SQL: `minuteDeCitit` e singura regulă, și rescrisă în
       bază s-ar fi despărțit de ea. */
    p_minute: minuteDeCitit(html),
    p_versiuni: VERSIUNI_PASTRATE,
  });

  if (error && (error as { code?: string }).code === "P0409") {
    return {
      error:
        "Articolul a fost modificat între timp — în altă filă sau de alt redactor. " +
        "Închide istoricul, reîncarcă articolul, și alege din nou versiunea.",
    };
  }
  if (error && (error as { code?: string }).code === "P0400") {
    return { error: "Reîncarcă articolul înainte de a reveni la o versiune." };
  }
  if (error) return { error: "Nu s-a putut reveni. Încearcă din nou." };

  const r = (Array.isArray(data) ? data[0] : data) as VersiuneRestaurata | null;
  if (!r) return { error: "Nu s-a putut reveni. Încearcă din nou." };

  reimprospateaza();
  return { success: true, date: { ...r, edit_version: Number(r.edit_version) } };
}

