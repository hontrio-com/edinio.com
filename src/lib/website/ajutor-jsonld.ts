import { PLATFORM_ORIGIN } from "@/lib/seo";
import { graf, LIMBA, listaJsonLd, paginaWebJsonLd } from "@/lib/storefront/date-structurate";
import { ID_ORGANIZATIE, ID_SITE } from "@/lib/website-jsonld";
import { adresaCategorie, adresaGhid, RADACINA } from "./ajutor-cautare";
import { ghidurileCategoriei } from "./ajutor-tipuri";
import type { CategorieAjutor } from "./ajutor-tipuri";
import type { GhidCuCategorie } from "./ajutor";

/**
 * Datele structurate ale centrului de ajutor.
 *
 * ═══ CE LIPSEA (04.09.2026) ═══
 *
 * Layoutul `(ajutor)` emite de azi `Organization` și `WebSite`, iar categoria și
 * ghidul primesc `BreadcrumbList` din `PageHero`. Dar niciuna din cele 416
 * adrese nu avea un nod despre PAGINA ÎNSĂȘI: un crawler afla cine publică și
 * unde e în ierarhie, nu și CE e pagina pe care stă.
 *
 * ═══ CE SE EMITE, ȘI DE CE TOCMAI ASTA ═══
 *
 *   - `/ajutor` și cele 9 categorii → `CollectionPage`, fiindcă exact asta sunt:
 *     pagini care adună alte pagini. Fiecare poartă și lista celor cuprinse, ca
 *     `ItemList`, deci ierarhia se citește dintr-o singură cerere.
 *   - cele 406 ghiduri → `Article`.
 *
 * ⚠ `Article`, NU `TechArticle`, deși al doilea descrie mai bine un ghid pas cu
 * pas. Două motive, al doilea măsurat:
 *
 *   1. Documentația Google enumeră pentru „Article markup" exact trei tipuri
 *      acceptate: `Article`, `NewsArticle`, `BlogPosting`. `TechArticle` e
 *      schema.org valid, dar în afara listei.
 *   2. Forma `"@type": ["Article", "TechArticle"]` ar fi fost validă și ar fi
 *      spus amândouă — dar `areTip` (`api/cron/santinela/route.ts:237`) citește
 *      `typeof n["@type"] === "string"`, deci un array îi trece pe lângă ochi
 *      fără să cadă: ar raporta „n-are niciun nod de tipul cerut" pentru un
 *      document care îl are. Un tip secundar nu merită o unealtă oarbă.
 *
 *      ⚠ ȘI E O GRIJĂ PENTRU MÂINE, NU O PAGUBĂ DE AZI — o revizie a măsurat și
 *      m-a corectat. Santinela NU cere azi nicio adresă `/ajutor`: sondele ei de
 *      date structurate merg pe vitrine (catalog, categorie, politică, pagină
 *      proprie), vezi `deVerificat` de pe la 1584. Ghidurile n-ar fi devenit
 *      „oarbe", fiindcă nimeni nu se uită încă la ele. Rândul dinainte spunea
 *      altceva. Motivul rămâne totuși bun: dacă cineva adaugă mâine ghidurile la
 *      sondă — și e lucrul firesc de făcut — un array ar face-o oarbă din prima
 *      zi, iar `ajutor-jsonld.test.ts` cere de aceea explicit `@type` ȘIR.
 *
 * ═══ ⚠ CE NU SE EMITE, ȘI NU DIN LENE ═══
 *
 * `datePublished` și `dateModified` LIPSESC de pe ghiduri. Nu le avem: toate
 * cele 406 stau în același fișier, deci o dată luată din git ar fi data
 * ultimei atingeri a FIȘIERULUI, aceeași pentru sute de ghiduri care n-au fost
 * schimbate. Google le cere „recomandat", nu obligatoriu; o dată inventată e mai
 * rea decât una lipsă, fiindcă nu se poate deosebi de una adevărată.
 *
 * `image` lipsește la fel: ghidurile n-au capturi în date (verificat, câmpul nu
 * există în `Ghid`).
 *
 * ═══ ⚠ NICIUN `BreadcrumbList` DE AICI ═══
 *
 * `PageHero` îl emite deja pe categorie și pe ghid, din chiar șirul desenat.
 * Un al doilea, construit în altă parte, ar fi două afirmații despre aceeași
 * ierarhie în același document — exact defectul care trăia pe `/preturi` și
 * `/contact`, unde `paginaSiteJsonLd` și `PageHero` îl emiteau amândouă.
 *
 * Hub-ul `/ajutor` n-are firimituri nici desenate, nici structurate: e treapta
 * de sus, iar un „Acasă >" singur nu spune nimic ce nu spune sigla din bară.
 */

/** `@id`-ul paginii unei categorii, ca ghidurile ei să se poată lega de el. */
function idCategorie(slug: string): string {
  return `${PLATFORM_ORIGIN}${adresaCategorie(slug)}#pagina`;
}

/**
 * Hub-ul: `CollectionPage` cu cele nouă categorii ca `ItemList`.
 *
 * Lista e sumară (poziție, adresă, nume) — aceeași alegere ca la catalogul
 * magazinelor: fiecare categorie își spune restul pe pagina ei, iar un nod
 * bogat aici ar afirma mai puțin decât ea, pe o adresă care nu e canonicalul ei.
 */
export function hubAjutorJsonLd(categorii: readonly CategorieAjutor[]): unknown {
  const url = `${PLATFORM_ORIGIN}${RADACINA}`;
  return graf(
    paginaWebJsonLd({
      tip: "CollectionPage",
      nume: "Centru de ajutor Edinio",
      url,
      descriere: "Ghiduri pas cu pas despre folosirea platformei Edinio, împărțite pe categorii.",
      parteDin: { "@id": ID_SITE },
      lista: listaJsonLd(
        categorii.map((c) => ({
          url: `${PLATFORM_ORIGIN}${adresaCategorie(c.slug)}`,
          nume: c.titlu,
        })),
        "Categoriile centrului de ajutor",
      ),
    }),
  );
}

/** O categorie: `CollectionPage` cu ghidurile ei, legată de hub. */
export function categorieAjutorJsonLd(c: CategorieAjutor): unknown {
  const url = `${PLATFORM_ORIGIN}${adresaCategorie(c.slug)}`;
  return graf(
    paginaWebJsonLd({
      tip: "CollectionPage",
      nume: c.titlu,
      url,
      descriere: c.descriere,
      /* Legat de HUB, nu de `WebSite`: ierarhia adevărată e
         site → centru de ajutor → categorie, iar sărind treapta din mijloc am
         spune că o categorie stă direct sub site. */
      parteDin: { "@id": `${PLATFORM_ORIGIN}${RADACINA}#pagina` },
      lista: listaJsonLd(
        ghidurileCategoriei(c).map((g) => ({
          url: `${PLATFORM_ORIGIN}${adresaGhid(c.slug, g.slug)}`,
          nume: g.titlu,
        })),
        `Ghiduri: ${c.titlu}`,
      ),
    }),
  );
}

/**
 * Un ghid: `Article`.
 *
 * ⚠ NU trece prin `paginaWebJsonLd`: acela construiește subtipuri de `WebPage`,
 * iar `Article` nu e unul. Un ghid NU e o pagină care adună alte pagini — e
 * textul însuși, deci nodul lui e altul, nu o variantă a celuilalt.
 */
export function ghidJsonLd(g: GhidCuCategorie): unknown {
  const url = `${PLATFORM_ORIGIN}${adresaGhid(g.categorie.slug, g.slug)}`;
  return graf({
    "@type": "Article",
    "@id": `${url}#articol`,
    headline: g.titlu,
    description: g.rezumat,
    url,
    inLanguage: LIMBA,
    /* Rubrica din care face parte, scrisă cu numele ei de om — același text pe
       care îl vede cititorul în firimituri. */
    articleSection: g.categorie.titlu,
    /* Amândouă către ACELAȘI nod, prin `@id`: ghidurile sunt scrise de Edinio,
       nu de o persoană numită. Un `author` inventat („Echipa Edinio") ar fi o
       entitate nouă, fără nimic în spate. */
    author: { "@id": ID_ORGANIZATIE },
    publisher: { "@id": ID_ORGANIZATIE },
    isPartOf: { "@id": idCategorie(g.categorie.slug) },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  });
}
