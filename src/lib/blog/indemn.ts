import { adresaAbsoluta, eCaleInterna } from "./adresa-scrisa";

/**
 * Îndemnul din articol.
 *
 * ⚠ DE CE NU E DE AJUNS BANDA DE FINAL A SITE-ULUI. Toate articolele se
 * terminau cu aceeași bandă. Potrivit pentru o pagină de prezentare, slab pentru
 * un articol: cine tocmai a citit despre curierat are alt pas următor decât cine
 * a citit despre facturare. Un îndemn potrivit cu textul de deasupra lui e
 * jumătate din motivul comercial pentru care se ține un blog.
 *
 * ⚠ PRESETĂRILE SUNT ÎN COD, NU ÎN BAZĂ. Adresele și textele lor se schimbă
 * odată cu paginile către care duc, iar în bază s-ar fi învechit tăcut.
 *
 * ⚠ NOTA DE AICI A MINȚIT, ȘI S-A VĂZUT PE 31.08.2026. Scria că „ștergerea
 * paginii sparge compilarea, sau măcar se vede la o căutare". Nu sparge nimic:
 * `adresa` e un `string` obișnuit, iar `tsc` și build-ul trec liniștite peste o
 * adresă care nu mai duce nicăieri.
 *
 * S-a dovedit chiar aici. Când s-a șters `/start`, presetarea de mai jos a rămas
 * cu `adresa: "/start"` — și e presetarea implicită a DOUĂ din patru șabloane de
 * articol (`sabloane.ts`, „Ghid pas cu pas" și „Ce e nou"). Căutarea de care
 * vorbea nota chiar s-a făcut, și a găsit zero: se căutase `href="/start"`, iar
 * aici scrie `adresa: "/start"`.
 *
 * Acum există plasa adevărată: `adrese-declarate.test.ts` ia fiecare adresă
 * scrisă în presetările astea, în `nav.ts` și în `footer.ts`, și cere ca ea să
 * ducă la o pagină reală de pe disc sau la o redirectare din `next.config.ts`.
 */

export type TipIndemn = "preturi" | "start" | "migrare" | "contact" | "propriu";

export interface IndemnArticol {
  tip: TipIndemn;
  /** Peste presetare, când articolul cere altceva. */
  titlu?: string;
  text?: string;
  eticheta?: string;
  /** Doar pentru `propriu`. */
  adresa?: string;
}

interface Presetare {
  titlu: string;
  text: string;
  eticheta: string;
  adresa: string;
}

/*
  ⚠ EXPORTAT ANUME PENTRU `adrese-declarate.test.ts`, care confrunta fiecare
  `adresa` de aici cu discul. Nu se citeste din alta parte a aplicatiei —
  `indemnDeAratat()` de mai jos e singura usa buna catre presetari.
*/
export const PRESETARI_INDEMN: Record<Exclude<TipIndemn, "propriu">, Presetare> = {
  preturi: {
    titlu: "Vezi cât costă",
    text: "Toate integrările sunt incluse în orice plan: curieri, plăți cu cardul și facturare.",
    eticheta: "Vezi prețurile",
    adresa: "/preturi",
  },
  start: {
    titlu: "Deschide-ți magazinul azi",
    text: "15 zile gratuit, fără card de credit. Anulezi oricând.",
    eticheta: "Începe gratuit",
    /*
      ⚠ ERA `/start`, pagina de aterizare a site-ului vechi, ștearsă pe
      31.08.2026. Redirectarea din `next.config.ts` ar fi prins butonul, deci
      n-ar fi dat 404 — dar l-ar fi dus pe cititor la pagina de start în loc de
      înscriere, adică îndemnul „Începe gratuit" ar fi cerut încă un clic.

      `/register` e ținta adevărată a butonului ăstuia: același text duce acolo
      și din heroul paginii principale (`sections/Hero.tsx:183`).

      Cheia presetării a rămas `start` dinadins — ea e scrisă în `sabloane.ts` și
      poate fi deja aleasă în articole; redenumirea ar rupe ce e ales.
    */
    adresa: "/register",
  },
  migrare: {
    titlu: "Ai deja un magazin în altă parte?",
    text: "Îl mutăm noi, cu produse, clienți și comenzi. Nu pierzi nimic din ce ai strâns.",
    eticheta: "Vezi cum se mută",
    adresa: "/migrare",
  },
  contact: {
    titlu: "Vrei să întrebi ceva?",
    text: "Îți răspunde un om, nu un robot.",
    eticheta: "Scrie-ne",
    adresa: "/contact",
  },
};

export const NUMELE_TIPURILOR: Record<TipIndemn, string> = {
  preturi: "Prețuri",
  start: "Începe gratuit",
  migrare: "Migrare",
  contact: "Contact",
  propriu: "Al meu (scriu eu tot)",
};

/**
 * Adresa unui îndemn scris de mână, dacă e o adresă pe care o putem pune pe buton.
 *
 * ⚠ NU LĂSA CADRUL SĂ FIE SINGURA PAZĂ. Câmpul ajungea direct în `href`, fără
 * nicio verificare: `javascript:`, `data:` sau `//gazda-straina` treceau. Primul
 * e cod care rulează la o apăsare, al doilea la fel, iar al treilea e o adresă
 * cu protocol moștenit care duce în altă parte deși începe cu bară — exact
 * capcana care a mai mușcat o dată azi, în curățătorul de HTML.
 *
 * Se acceptă:
 *   - căi interne: `/preturi`, `/blog/x` (dar NU `//ceva`)
 *   - adrese întregi, numai `https:`
 *
 * Orice altceva întoarce `null`, iar îndemnul nu se mai arată deloc — un buton
 * care nu duce nicăieri e mai rău decât lipsa lui.
 */
const LUNGIME_MAXIMA_ADRESA = 2048;

export function adresaDeIndemn(brut: string | null | undefined): string | null {
  const s = (brut ?? "").trim();
  if (!s || s.length > LUNGIME_MAXIMA_ADRESA) return null;

  /*
    ⚠ AICI ERA `if (s.startsWith("//")) return null; if (s.startsWith("/")) return s;`
    până pe 04.09.2026, adică regula care numără barele. `/\gazdă-străină/promo`
    începe cu `/` fără să fie `//`, deci trecea drept cale internă și devenea
    `href`-ul butonului.

    Ce ieșea, urmărit prin `node_modules/next` 16.3.3: `<Link>` nu atinge șirul
    (`formatStringOrUrl` îl întoarce neschimbat, `addBasePath` iese pe basePath
    gol), `is-local-url` îl socotește local fiindcă n-are schemă, iar la apăsare
    `app-router-instance` face `new URL(href, location.href)`, vede altă origine
    și cheamă `location.assign`. Navigare dură pe gazda străină — și cu
    JavaScript, și fără el, fiindcă `<a href>` iese cuvânt cu cuvânt în HTML.

    Regula e acum una singură pentru toate cele trei porți ale blogului; vezi
    `adresa-scrisa.ts`.
  */
  if (eCaleInterna(s)) return s;

  const u = adresaAbsoluta(s);
  return u && u.protocol === "https:" ? u.toString() : null;
}

/**
 * Îndemnul gata de desenat, sau `null` când articolul n-are unul.
 *
 * ⚠ `null` PENTRU UN „PROPRIU" INCOMPLET. Un îndemn cu buton fără adresă e un
 * buton care nu duce nicăieri — mai rău decât lipsa lui, fiindcă cititorul apasă
 * și nu se întâmplă nimic, iar el crede că site-ul e stricat.
 */
export function indemnDeAratat(brut: unknown): Presetare | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const i = brut as IndemnArticol;
  if (!i.tip) return null;

  if (i.tip === "propriu") {
    const adresa = adresaDeIndemn(i.adresa);
    const eticheta = (i.eticheta ?? "").trim();
    const titlu = (i.titlu ?? "").trim();
    if (!adresa || !eticheta || !titlu) return null;
    return { titlu, text: (i.text ?? "").trim(), eticheta, adresa };
  }

  const p = PRESETARI_INDEMN[i.tip];
  if (!p) return null;
  return {
    titlu: (i.titlu ?? "").trim() || p.titlu,
    text: (i.text ?? "").trim() || p.text,
    eticheta: (i.eticheta ?? "").trim() || p.eticheta,
    adresa: p.adresa,
  };
}
