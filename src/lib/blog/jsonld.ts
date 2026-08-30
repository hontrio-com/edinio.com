import { PLATFORM_ORIGIN } from "@/lib/seo";
import { ID_ORGANIZATIE, ID_SITE } from "@/lib/website-jsonld";
import { adreseBune } from "./types";
import type { ArticolIntreg } from "./citire";

/**
 * Datele structurate ale unui articol.
 *
 * ⚠ SE LEAGĂ DE NODURILE CARE EXISTĂ DEJA, nu își face altele. `Organization`
 * și `WebSite` sunt emise o dată, din `(website)/layout.tsx`, pe toate paginile
 * de prezentare. Un al doilea nod de organizație scris aici ar fi însemnat două
 * firme cu același nume pentru orice motor care citește pagina — exact opusul a
 * ce face o entitate: să adune, nu să împartă.
 *
 * De asta `publisher` e o referință prin `@id`, nu un obiect nou.
 */

/** Textul curat dintr-un HTML, pentru câmpurile care nu primesc etichete. */
function faraEtichete(html: string, maxim = 300): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxim);
}

export function articolJsonLd(a: ArticolIntreg): object {
  const adresa = `${PLATFORM_ORIGIN}/blog/${a.slug}`;
  const noduri: object[] = [];

  /*
    ⚠ `dateModified` E ADEVĂRAT, nu cosmetic. Motoarele îl folosesc ca semn de
    prospețime, iar unul umflat („actualizat azi" pe un text neatins de un an)
    e o minciună pe care o pot verifica singure comparând conținutul. Vine din
    `updated_at`, care se schimbă doar la o salvare adevărată.
  */
  const articol: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${adresa}#articol`,
    headline: a.seo_title?.trim() || a.title,
    description: a.seo_description?.trim() || a.excerpt || faraEtichete(a.content_html, 200),
    url: adresa,
    mainEntityOfPage: { "@type": "WebPage", "@id": adresa },
    datePublished: a.published_at,
    dateModified: a.updated_at,
    inLanguage: "ro-RO",
    isPartOf: { "@id": ID_SITE },
    publisher: { "@id": ID_ORGANIZATIE },
  };

  if (a.cover_url) {
    articol.image = { "@type": "ImageObject", url: a.cover_url, ...(a.cover_alt ? { caption: a.cover_alt } : {}) };
  }
  if (a.categorie) articol.articleSection = a.categorie.name;
  if (a.reading_minutes) articol.timeRequired = `PT${a.reading_minutes}M`;

  /*
    ⚠ AUTORUL E O PERSOANĂ DOAR DACĂ ARE CE-L LEAGĂ DE UNA.

    `sameAs` cu profilurile publice e singurul lucru care spune unui motor că
    numele acesta e cineva anume. Fără el rămâne un nume — corect, dar fără
    autoritate, fiindcă nu se poate potrivi cu nimic din ce știe motorul deja.
    Nodul se scrie oricum: un autor fără profiluri e tot mai bine decât niciun
    autor, care lasă articolul să pară scris de nimeni.
  */
  if (a.autor) {
    articol.author = {
      "@type": "Person",
      "@id": `${PLATFORM_ORIGIN}/blog/autor/${a.autor.slug}#persoana`,
      name: a.autor.name,
      ...(a.autor.role_title ? { jobTitle: a.autor.role_title } : {}),
      ...(a.autor.bio ? { description: a.autor.bio } : {}),
      ...(a.autor.avatar_url ? { image: a.autor.avatar_url } : {}),
      ...(adreseBune(a.autor.sameas).length ? { sameAs: adreseBune(a.autor.sameas) } : {}),
      worksFor: { "@id": ID_ORGANIZATIE },
    };
  } else {
    /* Fără autor, editorul e firma. Un articol fără NICIUN autor declarat e
       greu de cântărit pentru un motor care judecă cine spune ce. */
    articol.author = { "@id": ID_ORGANIZATIE };
  }

  noduri.push(articol);

  /*
    ⚠ `FAQPage` NUMAI CÂND ÎNTREBĂRILE SUNT ȘI ÎN PAGINĂ.

    Regula lui Google e limpede: datele structurate descriu ce vede omul. Un
    FAQPage cu întrebări care nu apar în text e conținut ascuns, și se poate
    solda cu o sancțiune manuală pe tot domeniul. Aici nu se poate întâmpla:
    aceeași listă desenează secțiunea și umple nodul, dintr-un singur loc.
  */
  if (a.faq?.length) {
    noduri.push({
      "@type": "FAQPage",
      "@id": `${adresa}#intrebari`,
      mainEntity: a.faq.map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: { "@type": "Answer", text: i.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": noduri };
}

/**
 * Datele structurate ale paginii de listă.
 *
 * Fără `blogPost`: lista articolelor e deja în HTML-ul paginii, cu legături
 * către fiecare. Repetată aici, ar fi aceeași informație de două ori, dar
 * într-un loc unde se învechește mai ușor.
 */
export function listaBlogJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${PLATFORM_ORIGIN}/blog#blog`,
        url: `${PLATFORM_ORIGIN}/blog`,
        name: "Blog Edinio",
        description:
          "Ghiduri practice despre magazine online, curierat, facturare si vanzare in Romania.",
        inLanguage: "ro-RO",
        isPartOf: { "@id": ID_SITE },
        publisher: { "@id": ID_ORGANIZATIE },
      },
    ],
  };
}

/**
 * Datele structurate ale paginii unui autor.
 *
 * ⚠ ACELAȘI `@id` CA ÎN ARTICOLE, dinadins. În `articolJsonLd` autorul are
 * `@id` pe `/blog/autor/<slug>#persoana`; aici nodul întreg stă la aceeași
 * adresă. Așa un motor care citește un articol și apoi pagina asta știe că e
 * vorba de aceeași persoană — nu de două cu același nume.
 *
 * Fără pagina asta, `@id`-ul din articole era doar un identificator care nu
 * ducea nicăieri. Valid, dar nedovedit.
 */
export function autorJsonLd(
  autor: { slug: string; name: string; role_title: string | null; bio: string | null; avatar_url: string | null; sameas: string[] },
  /**
   * Subiectele despre care chiar a scris, adică numele categoriilor articolelor
   * lui.
   *
   * ⚠ NU O LISTĂ SCRISĂ DE MÂNĂ. `knowsAbout` e o declarație despre competența
   * cuiva; una inventată e exact genul de afirmație pe care un motor o poate
   * dezminți citind articolele. Derivată din ce a publicat, nu poate să mintă.
   */
  subiecte: string[],
): object {
  const adresa = `${PLATFORM_ORIGIN}/blog/autor/${autor.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${adresa}#pagina`,
        url: adresa,
        isPartOf: { "@id": ID_SITE },
        mainEntity: { "@id": `${adresa}#persoana` },
      },
      {
        "@type": "Person",
        "@id": `${adresa}#persoana`,
        name: autor.name,
        url: adresa,
        ...(autor.role_title ? { jobTitle: autor.role_title } : {}),
        ...(autor.bio ? { description: autor.bio } : {}),
        ...(autor.avatar_url ? { image: autor.avatar_url } : {}),
        ...(adreseBune(autor.sameas).length ? { sameAs: adreseBune(autor.sameas) } : {}),
        worksFor: { "@id": ID_ORGANIZATIE },
        ...(subiecte.length ? { knowsAbout: subiecte } : {}),
      },
    ],
  };
}
