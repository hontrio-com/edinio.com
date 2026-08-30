import { PLATFORM_ORIGIN } from "@/lib/seo";
import { firimituriJsonLd, graf, LIMBA, paginaWebJsonLd, type TipPagina } from "@/lib/storefront/date-structurate";

/**
 * Datele structurate ale site-ului de prezentare edinio.com.
 *
 * ═══ CE LIPSEA ═══
 *
 * JSON-LD exista DOAR pe pagina principala. Celelalte opt adrese publice —
 * /despre, /preturi, /contact si cele patru pagini juridice — raspundeau 200 fara
 * nimic, desi fiecare are titlu propriu, descriere proprie si canonical propriu.
 *
 * ═══ DE CE IDENTITATEA STA IN LAYOUT SI NU IN FIECARE PAGINA ═══
 *
 * Un crawler citeste fiecare adresa separat: o referinta `{"@id": ".../#organization"}`
 * pusa pe /despre arata in gol daca nodul e definit doar pe radacina. Cum
 * layout-ul de grup si pagina se randeaza in ACELASI document HTML, nodul emis o
 * data din layout exista pe toate cele opt adrese, iar paginile se pot referi la
 * el prin `@id` fara sa-l repete cu alte valori.
 *
 * ⚠ Nodul NU are ce cauta in `src/app/layout.tsx`. Radacina inveleste TOATE
 * rutele aplicatiei, inclusiv vitrinele comerciantilor rescrise de proxy pe
 * domeniile lor proprii — adica Edinio ar aparea ca organizatie in datele
 * structurate ale magazinului altcuiva. Layout-ul de grup `(website)` nu atinge
 * niciodata un magazin.
 *
 * ═══ DATELE JURIDICE ═══
 *
 * Sunt cele afisate deja pe /termeni („1. Identificarea prestatorului") si in
 * subsol, ca cerinta a Art. 5 din Legea 365/2002. Deci nu se declara nimic nou —
 * se declara structurat ce e oricum public.
 */

export const ID_ORGANIZATIE = `${PLATFORM_ORIGIN}/#organization`;
export const ID_SITE = `${PLATFORM_ORIGIN}/#website`;

/**
 * `vatID` NU se emite, si asta e o alegere.
 *
 * Prefixul „RO" inseamna inregistrare in scopuri de TVA, iar pe pagina exista
 * doar CUI-ul, fara prefix. Adaugat de noi, ar afirma o inregistrare pe care
 * firma n-a declarat-o nicaieri. `taxID` descrie exact ce stim: codul fiscal.
 */
const IDENTITATE = {
  "@type": "Organization",
  "@id": ID_ORGANIZATIE,
  name: "Edinio",
  legalName: "SC VOID SFT GAMES SRL",
  taxID: "43474393",
  url: PLATFORM_ORIGIN,
  logo: { "@type": "ImageObject", url: `${PLATFORM_ORIGIN}/logo.png` },
  address: {
    "@type": "PostalAddress",
    streetAddress: "Str. Progresului, Nr. 2",
    addressLocality: "Matasari",
    addressRegion: "Gorj",
    addressCountry: "RO",
  },
  email: "contact@edinio.com",
  telephone: "+40750456809",
  contactPoint: {
    "@type": "ContactPoint",
    email: "contact@edinio.com",
    telephone: "+40750456809",
    contactType: "customer service",
    availableLanguage: "Romanian",
  },
};

const SITE = {
  "@type": "WebSite",
  "@id": ID_SITE,
  url: PLATFORM_ORIGIN,
  name: "Edinio",
  publisher: { "@id": ID_ORGANIZATIE },
  inLanguage: LIMBA,
};

/** Nodurile de identitate, emise o singura data din layout-ul de prezentare. */
export const identitateEdinioJsonLd = graf(IDENTITATE, SITE);

/**
 * Nodul unei pagini de prezentare: pagina insasi + firimiturile ei.
 *
 * `cale` e segmentul din adresa, fara slash („despre"). Firimiturile au mereu
 * doua trepte — Acasa si pagina — fiindca site-ul e plat: nu exista nivel
 * intermediar, si nu se inventeaza unul.
 */
export function paginaSiteJsonLd(a: {
  cale: string;
  nume: string;
  descriere?: string;
  tip?: TipPagina;
  /** „Ultima actualizare" de pe paginile juridice, in forma `AAAA-LL-ZZ`. */
  actualizata?: string;
  /** Pagina descrie chiar firma („Despre noi", „Contact"). */
  despreFirma?: boolean;
  /** Noduri in plus, proprii paginii (oferte, intrebari frecvente). */
  inPlus?: Record<string, unknown>[];
}) {
  const url = `${PLATFORM_ORIGIN}/${a.cale}`;
  return graf(
    paginaWebJsonLd({
      tip: a.tip,
      nume: a.nume,
      url,
      descriere: a.descriere,
      dataModificarii: a.actualizata,
      parteDin: { "@id": ID_SITE },
      // Semnalul care consolideaza entitatea de brand: „pagina ASTA descrie
      // organizatia". Se pune doar unde e adevarat, nu pe toate.
      ...(a.despreFirma ? { despre: { "@id": ID_ORGANIZATIE } } : {}),
    }),
    firimituriJsonLd([
      { nume: "Acasa", url: PLATFORM_ORIGIN },
      { nume: a.nume, url },
    ]),
    ...(a.inPlus ?? []),
  );
}
