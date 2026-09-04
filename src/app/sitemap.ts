import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN, parseStoreSeo } from "@/lib/seo";
import { isPlatformHost, bareHost } from "@/lib/platform-hosts";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { SEGMENT_MAGAZIN, shopOnPage } from "@/lib/storefront/design/commerce";
import { politiciIndexabile } from "@/lib/storefront/policy-index";
import { slugCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { categoriiVizibile } from "@/lib/categories/vizibilitate";
import { eticheteFolosite, toateArticolelePublicate } from "@/lib/blog/citire";
import { CATEGORII_AJUTOR, TOATE_GHIDURILE } from "@/lib/website/ajutor";
import { adresaCategorie, adresaGhid } from "@/lib/website/ajutor-cautare";
import {
  COMPETITORS,
  RESOURCES,
  SOLUTION_COLUMNS,
  TOP_NAV,
} from "@/lib/website/nav";

/*
 * ═══ INVARIANTA SEO (03.09.2026) ═══
 *
 * Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
 * sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
 *
 * Fisierul asta serveste `/sitemap.xml` DUPA GAZDA (`headers()` il face dinamic,
 * per cerere), si cele doua ramuri nu se ating:
 *
 *   - pe www.edinio.com: NUMAI adresele platformei — pagina de start, preturi,
 *     contact, paginile juridice, paginile de prezentare, /vs,
 *     integrarile, centrul de ajutor cu ghidurile lui, blogul cu articole,
 *     rubrici, autori si etichete. NICIUN magazin, nicio pagina de magazin.
 *     `intrariPlatforma` e o functie SINCRONA, deci nu poate intreba baza de
 *     magazine nici daca ar vrea cineva — proba din `sitemap.test.ts` o tine asa.
 *
 *   - pe domeniul unui comerciant (magazin-client.ro): NUMAI paginile ACELUI
 *     magazin, pe domeniul lui: pagina de start, catalogul, categoriile,
 *     produsele, politicile indexabile, paginile proprii. `intrariMagazin` e la
 *     fel de pura; citirile stau in `sitemapPeDomeniulPropriu`.
 *
 * Pana pe 03.09.2026 ramura platformei anunta si vitrinele magazinelor fara
 * domeniu propriu (pagina lor de start, pagina de catalog si paginile proprii),
 * iar `/sitemap-magazine.xml` indexa sitemapurile lor de produse. Toate au
 * plecat: vitrinele de pe platforma poarta `X-Robots-Tag: noindex` (pus de
 * `src/proxy.ts`), iar un sitemap care anunta adrese `noindex` e o contradictie
 * pe care Google o numara la sanatatea site-ului.
 */

// Un fisier de sitemap accepta maxim 50.000 de URL-uri (limita Google) —
// peste, fisierul intreg e respins. Pe domeniul unui magazin ordinea de
// prioritate e start → catalog → categorii → produse → politici → pagini, si
// se taie la limita.
const SITEMAP_URL_LIMIT = 50000;

/**
 * Designul PUBLICAT al magazinului, din randul deja adus.
 *
 * Contextul e minimal: singura intrebare de aici e daca exista pagina de
 * catalog, iar aceea nu depinde de culori, de bannere sau de flagurile paginii
 * principale.
 */
function designPublicat(storeSettings: unknown) {
  const ss = storeSettings as { storefront_design?: unknown } | { storefront_design?: unknown }[] | null;
  const brut = ss ? (Array.isArray(ss) ? ss[0] : ss)?.storefront_design : null;
  return parseStoreDesign(brut, { primaryColor: "#1AB554", pageContent: {}, features: {} });
}

function pcDinRand(row: { store_settings?: unknown }): unknown {
  const ss = row.store_settings as { page_content?: unknown } | { page_content?: unknown }[] | null | undefined;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
}

function politiciDinRand(row: { store_settings?: unknown }): unknown {
  const ss = row.store_settings as { store_policies?: unknown } | { store_policies?: unknown }[] | null | undefined;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.store_policies ?? null;
}

/** Whether a store's homepage opted out of indexing (Settings > SEO > noindex). */
function homepageNoindex(row: { store_settings?: unknown }): boolean {
  return parseStoreSeo(pcDinRand(row)).noindex === true;
}

/**
 * Adresele paginilor de prezentare, scoase din datele meniului.
 *
 * ⚠ SE IAU DIN `nav.ts`, NU SE SCRIU AICI. Meniul e singurul loc unde cineva
 * chiar adauga o pagina noua; daca lista de aici ar fi scrisa de mana, s-ar
 * despartii de el la prima pagina adaugata — si chiar asta se intamplase.
 *
 * Cele patru adaugate cu mana la sfarsit sunt paginile-index si cele care nu
 * stau in meniu, dar sunt vii si indexabile. `/` si `/ajutor` ies, fiindca sunt
 * puse separat mai sus (pana pe 04.09.2026 aveau si prioritati proprii; azi
 * doar ordinea difera, si nici ea nu conteaza pentru Google).
 */
export const PUSE_SEPARAT = ["/", "/ajutor", "/preturi", "/contact"];

export function paginiDeSite(): string[] {
  const adrese = new Set<string>();
  for (const col of SOLUTION_COLUMNS) for (const it of col.items) adrese.add(it.href);
  for (const it of RESOURCES) adrese.add(it.href);
  for (const t of TOP_NAV) if ("href" in t) adrese.add(t.href);

  adrese.add("/vs");
  /*
    ⚠ `/industrii` A PLECAT DE AICI pe 04.09.2026, odată cu cele nouă pagini.

    ⚠ ȘI E ALTFEL DECÂT CELELALTE DE MAI JOS. `/magazin-online`, `/despre` și
    `/start` au redirectare 308 către `/`; industriile răspund **410**, fiindcă
    o pagină „Creare magazin online de piese auto" n-are echivalent la pagina de
    start, iar o redirectare către ceva nepotrivit e tratată de Google tot ca un
    404, doar mai încet. Motivul întreg e în `src/app/industrii/route.ts`.

    ⚠ DACĂ REVIN: se pun la loc rândurile de aici ȘI se șterge `src/app/industrii/`,
    altfel paginile noi ar răspunde 410 fără ca nimic să dea de bănuit.
  */
  /*
    ⚠ `/magazin-online` SI `/despre` AU PLECAT DE AICI pe 01.09.2026, odata cu
    paginile. Clientul le-a cerut sterse „momentan, poate pe viitor o sa le
    adaugam". Amandoua au redirectare permanenta catre `/` in `next.config.ts` —
    erau in sitemap si raspundeau 200, deci Google le stie.

    ⚠ DACA REVIN: se pun la loc rândurile de aici SI se scot redirectarile din
    `next.config.ts`, altfel pagina noua ar fi trimisa cu 308 catre acasa fara
    niciun 404 care sa dea de banuit — exact ce era sa pateasca /migrare la
    unirea ramurilor.
  */
  /*
    ⚠ `/start` A PLECAT DE AICI pe 31.08.2026, odată cu pagina. Era pagina de
    aterizare a site-ului vechi. Adresa are acum o redirectare permanentă către
    `/`, pusă în `next.config.ts` — o adresă indexată nu se lasă să devină 404.
  */

  for (const c of COMPETITORS) adrese.add(c.href);

  // Puse separat mai sus. Aici ar fi iesit de doua ori.
  for (const deja of PUSE_SEPARAT) adrese.delete(deja);

  return [...adrese].sort();
}

/**
 * `lastModified`, dar numai dacă avem o dată ADEVĂRATĂ.
 *
 * ⚠ ACEEAȘI REGULĂ CA LA PAGINILE SCRISE ÎN COD, dusă până la capăt. Acolo am
 * scos `lastModified: new Date()`. Aici era forma mai mică a aceleiași minciuni:
 * `x ? new Date(x) : new Date()` — adică „dacă nu știu data, spun că e azi".
 *
 * Se întorc chei de împrăștiat, ca `lastModified` să LIPSEASCĂ, nu să fie
 * `undefined`: Next scrie oricum XML-ul, dar un câmp absent e mai cinstit decât
 * unul gol, iar cine citește codul vede regula dintr-o privire.
 */
function dataDacaOStim(x: string | Date | null | undefined): { lastModified?: Date } {
  if (!x) return {};
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? {} : { lastModified: d };
}

/**
 * Când s-a schimbat ultima oară CONȚINUTUL articolului.
 *
 * ⚠ VINE DIN `content_updated_at`, NU DIN `updated_at`. Al doilea se mută la
 * orice atingere administrativă — pui alt articol în vitrină și triggerul îl
 * coboară pe ăsta, îl fixezi, îl arhivezi. Un sitemap construit pe el spunea lui
 * Google că articolul s-a schimbat, când de fapt cineva apăsase o bifă.
 *
 * Se ia cea mai MARE dintre cele două date: un articol programat în viitor și
 * încă neatins poate avea data conținutului mai veche decât cea de publicare.
 */
function candSaSchimbat(actualizat?: string | null, publicat?: string | null): Date | null {
  const d = [actualizat, publicat]
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime())
    .filter((t) => Number.isFinite(t));
  return d.length ? new Date(Math.max(...d)) : null;
}

/** Cel mai proaspăt articol dintr-un teanc, pentru paginile de rubrică și autor. */
function ceaMaiProaspata(
  articole: { content_updated_at?: string | null; published_at?: string | null }[],
): Date | null {
  const t = articole
    .map((a) => candSaSchimbat(a.content_updated_at, a.published_at))
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  return t.length ? new Date(Math.max(...t)) : null;
}

/**
 * Data unei pagini de rubrică sau de autor.
 *
 * ⚠ NU DOAR ARTICOLELE. Până pe 31.08.2026 se lua numai cel mai proaspăt articol
 * al taxonomiei. Dar pagina rubricii își arată descrierea, iar pagina autorului
 * își arată biografia, rolul și poza — schimbi biografia și pagina chiar s-a
 * schimbat, în timp ce sitemapul rămânea la data ultimului articol.
 *
 * ⚠ ȘI NU `updated_at`. Acela se mută la orice atingere administrativă, deci
 * i-ar spune Google că pagina s-a schimbat când cineva doar a reașezat o listă.
 * Taxonomiile au primit `content_updated_at`, care se mișcă numai la un câmp pe
 * care cititorul chiar îl vede — exact ce s-a făcut pentru articole în runda a
 * doua, din același motiv.
 */
export function dataTaxonomiei(
  alTaxonomiei: string | null | undefined,
  articole: { content_updated_at?: string | null; published_at?: string | null }[],
): Date | null {
  const dinArticole = ceaMaiProaspata(articole);
  if (!alTaxonomiei) return dinArticole;
  const alEi = new Date(alTaxonomiei);
  if (Number.isNaN(alEi.getTime())) return dinArticole;
  if (!dinArticole) return alEi;
  return alEi < dinArticole ? dinArticole : alEi;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PLATFORMA (www.edinio.com): numai adresele platformei
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Ce are nevoie sitemapul platformei dintr-un articol de blog publicat. */
export type ArticolPentruSitemap = {
  slug: string;
  noindex?: boolean | null;
  /** Scris de mana cand textul e republicat de pe alt site. Vezi `anuntabil`. */
  canonical_url?: string | null;
  content_updated_at?: string | null;
  published_at?: string | null;
  categorie?: { slug: string; content_updated_at?: string | null } | null;
  autor?: { slug: string; content_updated_at?: string | null } | null;
};

/**
 * Articolul poate fi ANUNTAT ca adresa a noastra?
 *
 * Doua feluri de „nu", si amandoua inseamna acelasi lucru pentru un sitemap:
 *   - `noindex` — pagina cere sa nu fie indexata; un sitemap care o anunta
 *     trimite doua instructiuni care se bat cap in cap;
 *   - `canonical_url` — pagina spune ca originalul e in ALTA PARTE. Anuntata
 *     aici, i-am cere lui Google sa indexeze o adresa care il trimite imediat
 *     altundeva.
 *
 * ⚠ Aceeasi regula o citeste si `llms.txt`, ca sa nu se desparta.
 */
export function anuntabil(a: { noindex?: boolean | null; canonical_url?: string | null }): boolean {
  return !a.noindex && !a.canonical_url?.trim();
}

/** O eticheta de blog folosita de macar un articol publicat, cu data ultimului. */
export type EtichetaPentruSitemap = { slug: string; ultima?: string | Date | null };

/**
 * Intrarile sitemapului platformei, din date deja citite.
 *
 * ⚠ SINCRONA, DINADINS. O functie fara `await` nu poate intreba baza, deci nu
 * poate — nici printr-o „mica adaugare" de maine — sa puna aici un magazin, o
 * pagina de magazin sau un produs. Tot ce intra e fie scris in cod (paginile
 * site-ului, ajutorul), fie vine din blogul platformei. Proba din
 * `sitemap.test.ts` verifica amandoua: ca e sincrona, si ca fiecare adresa
 * incepe cu un segment rezervat platformei (`NON_STORE_SEGMENTS`).
 */
export function intrariPlatforma(
  toateArticolele: ArticolPentruSitemap[],
  eticheteBlog: EtichetaPentruSitemap[],
): MetadataRoute.Sitemap {
  /*
    ⚠ ARTICOLELE CU `noindex` NU INTRĂ ÎN SITEMAP.

    Un sitemap e o rugăminte: „indexează asta". Pagina cu `noindex` spune exact
    pe dos. Trimise amândouă, Google primește două instrucțiuni care se bat cap
    în cap, cheltuie o vizită ca să afle că n-avea ce căuta acolo, și numără
    contradicția la sănătatea site-ului.

    Găsit chiar la proba de punere în funcțiune (30.08.2026): articolul de test
    era `noindex` și apărea totuși în sitemap.
  */
  const articoleBlog = toateArticolele.filter(anuntabil);
  const categoriiCuArticole = [
    ...new Set(articoleBlog.map((a) => a.categorie?.slug).filter((s): s is string => !!s)),
  ];
  /* Din aceleași rânduri, fără încă o interogare: autorul vine deja legat de
     fiecare articol. */
  const autoriDeAratat = [
    ...new Set(articoleBlog.map((a) => a.autor?.slug).filter((s): s is string => !!s)),
  ];

  return [
  /*
    ⚠ PAGINILE SCRISE IN COD NU AU `lastModified`, SI E O ALEGERE.

    Aveau `new Date()`, adica spuneau la FIECARE generare ca s-au schimbat azi —
    pagina de start, preturile, termenii, centrul de ajutor, toate.

    ⚠ PAGUBA NU E LOCALA. Un `lastmod` care se misca zilnic fara motiv il invata
    pe Google sa nu mai creada campul DELOC pe domeniul asta — deci ieftineste
    exact datele pe care le-am facut corecte cu greu: `content_updated_at` pe
    articole, si cel pus pe rubrici si autori in runda a sasea.

    Google spune limpede ca daca nu poti afla data reala, e mai bine sa NU
    trimiti `lastmod` decat sa trimiti unul inventat. Paginile astea traiesc in
    cod si se schimba la desfasurare; n-avem de unde sti cand, fara sa cladim un
    sistem doar pentru asta.

    ⚠ SI NICI `changeFrequency`, NICI `priority` — SCOASE PE 04.09.2026.

    Randul de deasupra spunea „`changeFrequency` ramane: e o sugestie despre
    viitor". Sugestia n-are cui sa-i foloseasca: Google a spus limpede ca
    ignora amandoua campurile, iar Bing ignora `priority` si trateaza
    `changefreq` cel mult ca indiciu. Erau pe toate cele 454 de adrese ale
    platformei si pe toate cele cateva mii ale fiecarui magazin, adica vreo 40%
    din fisier, si erau scrise din ochi: nimeni n-a masurat vreodata ca /preturi
    se schimba „lunar" sau ca merita 0.9 fata de 0.7.

    Ce ARE data adevarata — articole, rubrici, autori, etichete — isi pastreaza
    `lastModified`, mai jos. Aia e singura informatie pe care Google chiar o
    citeste dintr-un sitemap.
  */
    { url: PLATFORM_ORIGIN },
    { url: `${PLATFORM_ORIGIN}/preturi` },
    { url: `${PLATFORM_ORIGIN}/contact` },
    { url: `${PLATFORM_ORIGIN}/termeni` },
    { url: `${PLATFORM_ORIGIN}/confidentialitate` },
    { url: `${PLATFORM_ORIGIN}/cookies` },
    { url: `${PLATFORM_ORIGIN}/gdpr` },

    /*
      Paginile de prezentare, luate din CHIAR datele meniului.

      ⚠ NU SE SCRIU DE MANA. Pana pe 30.08.2026, lista de deasupra se oprise la
      paginile vechi, iar ZECE pagini vii lipseau cu totul din sitemap: /blog,
      /integrari, /magazin-online, /optimizare, /mentenanta-gratuita, /vs,
      /industrii, /intrebari-frecvente, /migrare si /start. Toate raspundeau 200.

      ⚠ TREI DIN CELE ZECE NU MAI SUNT, si numarul de mai sus ramane zece fiindca
      povesteste ce era ATUNCI: /magazin-online si /start au fost sterse (308 catre
      `/`), iar /industrii a fost stearsa pe 04.09.2026 si raspunde 410. Renumarate,
      ar fi sapte — dar atunci frazei i-ar lipsi tocmai defectul pe care il descrie.

      Nu le-a observat nimeni fiindca o pagina lipsa dintr-un sitemap nu strica
      nimic si nu da nicio eroare — doar nu e gasita. E cel mai tacut fel de
      defect: paginile de comparatie sunt tocmai cele care aduc cautari cu intentie
      de cumparare, si tocmai ele nu erau anuntate.

      Luate din `nav.ts`, o pagina adaugata in meniu intra singura aici, si una
      scoasa iese. Aceeasi disciplina ca la centrul de ajutor, mai jos. Slug-urile
      de competitori vin din lista din care isi face pagina `generateStaticParams`,
      deci nu pot ramane in urma.

      ⚠ FARA `lastModified`, SI ASTA E O ALEGERE, NU O SCAPARE — vezi nota de
      deasupra: o data inventata pe 23 de adrese ieftineste adevarul de pe
      celelalte.
    */
    ...paginiDeSite().map((cale) => ({
      url: `${PLATFORM_ORIGIN}${cale}`,
    })),
    /*
      Centrul de ajutor: pagina lui de start, categoriile si fiecare ghid.
      Se construiesc din datele centrului, nu se scriu de mana: un ghid adaugat
      acolo intra singur in sitemap, iar unul sters iese.

      Un centru de ajutor traieste din cautare. Cele mai multe intrebari ajung la
      el prin Google, nu prin meniul site-ului, deci ghidurile negasite de Google
      sunt ghiduri pe care nu le citeste nimeni.

      ⚠ SE SCOT DE AICI cand centrul trece pe `ajutor.edinio.com`: un sitemap nu
      poate cuprinde adrese de pe alt domeniu. E punctul 3 din lista de mutare,
      scrisa in capul lui `lib/website/ajutor.ts`.
    */
    { url: `${PLATFORM_ORIGIN}/ajutor` },
    ...CATEGORII_AJUTOR.map((c) => ({
      url: `${PLATFORM_ORIGIN}${adresaCategorie(c.slug)}`,
    })),
    ...TOATE_GHIDURILE.map((g) => ({
      url: `${PLATFORM_ORIGIN}${adresaGhid(g.categorie.slug, g.slug)}`,
    })),

    /*
      Blogul: fiecare articol publicat, și categoriile care au articole.

      ⚠ SE CITESC PRIN `toateArticolelePublicate`, care merge pe clientul
      obișnuit, NU pe cel de serviciu. Regula din baza de date lasă să treacă
      doar `published` cu data trecută, deci o ciornă sau un articol programat
      nu POT ajunge aici. Cu cheia de serviciu ar fi ajuns la un filtru scris de
      mână, iar un filtru uitat ar fi trimis Google către pagini care dau 404 —
      genul de greșeală care se plătește în încredere.

      ⚠ `lastModified` E DATA ADEVĂRATĂ, din `content_updated_at`, nu din
      `updated_at`: acela se mută la orice atingere administrativă, iar cu
      `published_at` singur un articol corectat peste șase luni părea neatins
      din ziua publicării, deci Google n-avea niciun motiv să se întoarcă la el.
    */
    ...articoleBlog.map((a) => ({
      url: `${PLATFORM_ORIGIN}/blog/${a.slug}`,
      ...dataDacaOStim(candSaSchimbat(a.content_updated_at, a.published_at)),
    })),
    /* Pagina unei rubrici se schimbă când apare un articol în ea — SAU când i se
       schimbă descrierea. Deci data ei e cea mai nouă dintre cele două, nu ziua
       de azi. Vezi `dataTaxonomiei`. */
    ...categoriiCuArticole.map((slug) => ({
      url: `${PLATFORM_ORIGIN}/blog/categorie/${slug}`,
      ...dataDacaOStim(dataTaxonomiei(
        articoleBlog.find((a) => a.categorie?.slug === slug)?.categorie?.content_updated_at,
        articoleBlog.filter((a) => a.categorie?.slug === slug),
      )),
    })),
    /* Doar autorii cu articole. Ceilalți dau 404 dinadins — o pagină cu un nume
       și nimic altceva e o pagină subțire, iar un sitemap care o anunță trimite
       crawlerul degeaba. */
    ...autoriDeAratat.map((slug) => ({
      url: `${PLATFORM_ORIGIN}/blog/autor/${slug}`,
      ...dataDacaOStim(dataTaxonomiei(
        articoleBlog.find((a) => a.autor?.slug === slug)?.autor?.content_updated_at,
        articoleBlog.filter((a) => a.autor?.slug === slug),
      )),
    })),
    /* Etichetele folosite de măcar un articol publicat. Cele legate doar de
       ciorne dau 404 dinadins, deci n-au ce căuta aici.

       ⚠ Bucata asta a lipsit o vreme, deși `eticheteFolosite()` era deja
       chemată: o înlocuire automată nu potrivise, iar variabila rămăsese
       nefolosită. Am prins-o citind sitemapul adevărat, nu codul — pagina de
       etichetă răspundea 200 și tot nu era anunțată nicăieri. */
    /* Data vine din `blog_etichete_folosite`: legăturile eticheta-articol nu se
       pot număra aici fără să le cerem pe toate, iar acolo e plafonul tăcut de
       1000 de rânduri al PostgREST. */
    ...eticheteBlog.map((e) => ({
      url: `${PLATFORM_ORIGIN}/blog/eticheta/${e.slug}`,
      ...dataDacaOStim(e.ultima),
    })),
  ];
}

async function sitemapPlatforma(): Promise<MetadataRoute.Sitemap> {
  /* ⚠ SE IAU IN FELII, nu cu un `.limit()` mare: PostgREST taie TACUT la
     propriul lui plafon de randuri, deci `.limit(2000)` ar fi adus o mie si
     ne-ar fi lasat sa credem ca le are pe toate. Vezi nota din
     `toateArticolelePublicate`. */
  const [toateArticolele, eticheteBlog] = await Promise.all([
    toateArticolelePublicate(),
    eticheteFolosite(),
  ]);
  return intrariPlatforma(toateArticolele, eticheteBlog).slice(0, SITEMAP_URL_LIMIT);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DOMENIUL PROPRIU (magazin-client.ro): numai paginile acelui magazin
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Randul magazinului de care are nevoie sitemapul lui. */
export type MagazinPentruSitemap = {
  updated_at: string | null;
  store_settings?: unknown;
};

/** Ce se citeste din baza pentru sitemapul unui magazin. */
export type DateMagazinPentruSitemap = {
  categorii: Parameters<typeof categoriiVizibile>[0];
  produse: { slug: string | null; updated_at: string | null }[];
  pagini: { slug: string | null; updated_at: string | null; seo: unknown }[];
};

/**
 * Intrarile sitemapului unui magazin, pe domeniul lui, din date deja citite.
 *
 * `base` e `https://magazin-client.ro` — si NUMAI el: fiecare adresa de aici
 * incepe cu el, deci sitemapul unui domeniu nu poate contine nici adrese de pe
 * platforma, nici de pe domeniul altui magazin. Proba din `sitemap.test.ts` o
 * verifica pe fiecare adresa.
 */
export function intrariMagazin(
  base: string,
  biz: MagazinPentruSitemap,
  date: DateMagazinPentruSitemap,
): MetadataRoute.Sitemap {
  // Skip the homepage entry when the merchant set it to noindex (Settings > SEO);
  // its products/pages can still be indexable, so they stay below.
  const entries: MetadataRoute.Sitemap = homepageNoindex(biz)
    ? []
    : [{ url: base, ...dataDacaOStim(biz.updated_at) }];

  // Pagina de catalog, cand magazinul si-a ales-o. Prima ruta-sectiune
  // indexabila: cosul si finalizarea sunt deliberat noindex, dar asta e chiar
  // catalogul magazinului.
  //
  // ⚠ NU si cand comerciantul a ascuns magazinul din Google (04.09.2026):
  // `pagina-magazin.tsx` pune atunci `noindex` pe catalog si pe fiecare
  // categorie, iar un sitemap care le anunta ar fi contradictia pe care Search
  // Console o raporteaza ca eroare. Produsele raman: pagina lor nu asculta de
  // `noindex`-ul de magazin.
  if (!homepageNoindex(biz) && shopOnPage(designPublicat(biz.store_settings))) {
    entries.push({
      url: `${base}/${SEGMENT_MAGAZIN}`,
      ...dataDacaOStim(biz.updated_at),
    });
    // Si paginile de categorie: de cand exista, ele sunt adresele care
    // raspund cautarilor de tip „bocanci de protectie". Cele stinse din panou
    // ies — pagina lor raspunde 404. Doua categorii pot da acelasi segment
    // (diferenta e doar la diacritice): intra o singura data, e o singura pagina.
    const vazute = new Set<string>();
    for (const c of categoriiVizibile(date.categorii)) {
      const seg = slugCategorie(c.name ?? "");
      if (!seg || vazute.has(seg)) continue;
      vazute.add(seg);
      entries.push({
        url: `${base}/${SEGMENT_MAGAZIN}/${seg}`,
        ...dataDacaOStim(biz.updated_at),
      });
    }
  }

  // One Product Store: the homepage already represents the single product, so
  // skip the individual /product/* URLs (the main one 301s to the homepage; the
  // rest are noindex). Custom pages below still get listed.
  if (parseStoreModeFromSettings(biz.store_settings).mode !== "one_product") {
    for (const p of date.produse) {
      if (!p.slug) continue;
      entries.push({
        url: `${base}/product/${p.slug}`,
        ...dataDacaOStim(p.updated_at),
      });
    }
  }

  // Paginile de politici indexabile. Vezi `politiciIndexabile`: aceeasi functie
  // decide si eticheta `robots` a paginii, ca sitemapul si pagina sa nu spuna
  // lucruri diferite.
  for (const tip of politiciIndexabile(pcDinRand(biz), politiciDinRand(biz))) {
    entries.push({
      url: `${base}/politici/${tip}`,
      ...dataDacaOStim(biz.updated_at),
    });
  }

  for (const pg of date.pagini) {
    if (!pg.slug || (pg.seo as { noindex?: boolean } | null)?.noindex) continue;
    entries.push({
      url: `${base}/${pg.slug}`,
      ...dataDacaOStim(pg.updated_at),
    });
  }
  return entries.slice(0, SITEMAP_URL_LIMIT);
}

/**
 * Sitemapul unui magazin pe domeniul lui propriu.
 *
 * `host` vine din antetul cererii, deja normalizat la apex: `proxy.ts` trimite
 * `www.magazin.ro/sitemap.xml` cu 308 catre apex INAINTE sa ajunga aici, fiindca
 * in baza domeniul e stocat canonic si pe `www.` interogarea nu gasea nimic —
 * si iesea un sitemap GOL, cu 200, adica exact forma pe care motoarele o accepta
 * tacut si o tin minte.
 */
async function sitemapPeDomeniulPropriu(host: string): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data: biz } = await createAdminClient()
    .from("businesses")
    .select("id, updated_at, store_settings(page_content, storefront_design, store_policies)")
    .eq("custom_domain", host)
    .eq("is_published", true)
    .single();
  if (!biz) return [];

  /*
   * Se citeste doar ce poate intra: categoriile numai daca exista pagina de
   * catalog (si nu e ascunsa de `noindex`), produsele numai daca magazinul nu e
   * cu un singur produs. `intrariMagazin` ia oricum hotararea finala; aici doar
   * nu se cara zeci de mii de randuri de produse pentru un sitemap care nu le
   * va anunta.
   */
  const areCatalog = !homepageNoindex(biz) && shopOnPage(designPublicat(biz.store_settings));
  const unSingurProdus = parseStoreModeFromSettings(biz.store_settings).mode === "one_product";
  const [categorii, produse, pagini] = await Promise.all([
    areCatalog
      ? fetchAllRowsStrict("sitemap.store.categories", (from, to) =>
        supabase.from("categories").select("id, name, parent_id, is_active").eq("business_id", biz.id).order("id").range(from, to),
      )
      : Promise.resolve([]),
    unSingurProdus
      ? Promise.resolve([])
      : fetchAllRowsStrict("sitemap.store.products", (from, to) =>
        supabase
          .from("products")
          .select("slug, updated_at")
          .eq("business_id", biz.id)
          .eq("is_active", true)
          .not("slug", "is", null)
          .order("id")
          .range(from, to),
      ),
    fetchAllRowsStrict("sitemap.store.pages", (from, to) =>
      supabase
        .from("custom_pages")
        .select("slug, updated_at, seo")
        .eq("business_id", biz.id)
        .eq("is_published", true)
        .order("id")
        .range(from, to),
    ),
  ]);

  return intrariMagazin(`https://${host}`, biz, { categorii, produse, pagini });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = bareHost((await headers()).get("host") ?? "");
  // `isPlatformHost` e sursa unica de adevar pentru „a cui e gazda"
  // (src/lib/platform-hosts.ts); o gazda goala e a platformei.
  return isPlatformHost(host) ? sitemapPlatforma() : sitemapPeDomeniulPropriu(host);
}
