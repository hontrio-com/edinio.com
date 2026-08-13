import { REZULTATE_SHOPPING, SITEMAP_GAZDA, type RezultatShopping } from "./seo";

/**
 * Secțiunea „GEO" de pe pagina „Optimizare".
 *
 * GEO = optimizare pentru motoarele generative, adică pentru asistenții care
 * răspund în loc să dea o listă de legături. Textele secțiunii sunt ale
 * clientului, date cuvânt cu cuvânt (2026-08-13). Nu se rescriu.
 */

export const GEO = {
  eyebrow: "GEO",
  titlu: "Pregătit și pentru căutările bazate pe AI",
  descriere:
    "Edinio organizează informațiile despre produse și magazin într-o structură clară, astfel încât să poată fi înțelese mai ușor de motoarele de căutare și sistemele bazate pe AI.",
} as const;

/** Întrebarea pusă în fereastra de discuție, cerută de client. */
export const INTREBARE = "Care este cea mai bună cameră de supraveghere pentru exterior?";

/**
 * Răspunsul asistentului, în trei bucăți: sfatul, rândul care duce spre magazin
 * și încheierea de sub produse.
 *
 * ⚠ SFATUL E ÎNTÂI, MAGAZINUL PE URMĂ, și asta nu e ordine de gust. Un asistent
 * care începe cu „cumpără de la X" e o reclamă; unul care spune întâi ce contează
 * la o cameră de exterior și abia apoi arată unde se găsește e chiar felul în
 * care răspund. Dacă desenul ar arăta altfel, n-ar mai semăna cu niciun răspuns
 * pe care l-a văzut cineva.
 *
 * ⚠ Și e scris ca un răspuns, nu ca un slogan: „dacă n-ai priză în apropiere" e
 * genul de amănunt pe care îl adaugă un asistent și pe care nu-l scrie nimeni
 * într-o reclamă.
 */
export const RASPUNS = {
  sfat:
    "Pentru exterior, caută o cameră cu protecție IP66, vedere nocturnă și conexiune Wi-Fi stabilă. Dacă nu ai priză în apropiere, o variantă solară îți scutește cablarea.",
  spreMagazin: "Două modele potrivite, de la Magazinul tău:",
  incheiere:
    "Prima e suficientă pentru o curte cu priză la îndemână. A doua se montează oriunde, fiindcă nu cere cablu.",
} as const;

export interface Recomandare {
  /** Cheia produsului: chiar poza lui din `REZULTATE_SHOPPING`. */
  imagine: string;
  /** Cele trei însușiri arătate sub nume, ca într-un răspuns de asistent. */
  insusiri: readonly string[];
}

/**
 * Produsele arătate în răspuns.
 *
 * ⚠ NU-ȘI ȚIN SINGURE NUMELE ȘI PREȚUL. Sunt aceleași produse ca la cardul 1 din
 * secțiunea SEO — clientul a cerut anume asta — iar numele și prețul se iau de
 * acolo, prin `recomandate()`. Scrise a doua oară aici, s-ar fi depărtat tăcut la
 * prima schimbare de preț, iar pe aceeași pagină ar fi scris două prețuri
 * diferite pentru aceeași cameră.
 *
 * Alese pe măsura întrebării: una cu priză, una solară — adică chiar cele două
 * cazuri din sfat.
 */
export const RECOMANDATE: Recomandare[] = [
  {
    imagine: "/optimizare/camera3.webp",
    insusiri: ["IP66", "vedere nocturnă", "Wi-Fi"],
  },
  {
    imagine: "/optimizare/camera1.webp",
    insusiri: ["IP66", "fără cablare", "panou solar"],
  },
];

/** Recomandările, cu numele și prețul luate din singura lor sursă. */
export function recomandate(): { produs: RezultatShopping; insusiri: readonly string[] }[] {
  return RECOMANDATE.map((r) => {
    const produs = REZULTATE_SHOPPING.find((p) => p.imagine === r.imagine);
    if (!produs) {
      throw new Error(`recomandare fără produs: ${r.imagine}`);
    }
    return { produs, insusiri: r.insusiri };
  });
}

/** Sursa citată sub răspuns, ca pastila de citare a asistenților. */
export const SURSA = SITEMAP_GAZDA.replace("https://", "");

export interface Asistent {
  nume: string;
  src: string;
  /** Lățime împărțită la înălțime, din `viewBox`-ul fișierului. */
  raport: number;
}

/**
 * Asistenții ale căror sigle se arată sub fereastră.
 *
 * ⚠ CE SPUNE RÂNDUL ĂSTA, ȘI CE NU SPUNE.
 *
 * Nu spune că magazinele sunt indexate de toți — asta n-o poate promite nimeni,
 * fiindcă e alegerea lor ce iau și ce nu. Spune că paginile POT FI CITITE de ei,
 * iar asta e adevărat și se poate verifica: `src/app/robots.ts` deschide `/`
 * pentru `*`, fără să oprească niciun robot de AI (GPTBot, ClaudeBot,
 * PerplexityBot, Google-Extended). Multe platforme îi blochează.
 *
 * ⚠ Raporturile sunt din `viewBox`-ul fiecărui fișier, nu ghicite. Sunt aproape
 * pătrate toate, în afară de Perplexity, care e mai înalt decât lat.
 */
export const ASISTENTI: Asistent[] = [
  { nume: "ChatGPT", src: "/optimizare/chatgpt.svg", raport: 41.142 / 40.034 },
  { nume: "Claude", src: "/optimizare/claude.svg", raport: 39.5 / 39.53 },
  { nume: "Gemini", src: "/optimizare/gemini.svg", raport: 28.01 / 28 },
];

/*
  ⚠ TREI, nu patru — cerute anume de client (13.08): ChatGPT, Claude, Gemini,
  încălecate una peste alta în locul unde stă de obicei semnul asistentului.
  `public/optimizare/perplexity.svg` a rămas pe disc; dacă se cere a patra, se
  adaugă aici cu raportul din `viewBox`-ul ei, 21/24.

  Ordinea contează la desen: prima e deasupra, ultima dedesubt. Sigla ChatGPT e
  și cea mai cunoscută, deci stă în față.
*/

export const ASISTENTI_TEXT = "Paginile magazinului pot fi citite de asistenții AI";

/**
 * Bara laterală, ca în captura trimisă de client.
 *
 * ⚠ NU SCRIE „ChatGPT" NICĂIERI, și e o alegere, nu o scăpare. Clientul a cerut
 * două lucruri care se bat cap în cap dacă le iei literal: desenul paginii lor,
 * dar și trei sigle în locul semnului asistentului, adică „toți asistenții".
 * Al doilea îl lămurește pe primul: se împrumută AȘEZAREA, nu numele. O fereastră
 * care poartă numele lor, cu un răspuns pe care nu l-au dat, pe pagina noastră de
 * vânzare, ar fi altceva decât o ilustrație.
 */
export const BARA = {
  titlu: "Asistent AI",
  intrebareNoua: "Discuție nouă",
  meniu: ["Bibliotecă", "Proiecte", "Programate"],
  recenteTitlu: "Recente",
  recente: [
    "Cameră de supraveghere exterior",
    "Idei de cadouri pentru părinți",
    "Ce gătesc cu ce am în frigider",
    "Plan de antrenament pentru începători",
  ],
  cont: "Contul tău",
} as const;

/** Ce scrie în câmpul de întrebare cât e gol. */
export const SUBTEXT_CAMP = "Întreabă asistentul AI";

/** Butonul de pe fiecare produs, cerut de client. */
export const BUTON_PRODUS = "Vezi produsul";
