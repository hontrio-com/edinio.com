/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNDE SE VEDE SETUL „CUMPĂRATE ÎMPREUNĂ”                       (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Până azi, setul se vedea într-un singur loc: o bandă lată sub zona de
 * cumpărare, împreună cu recomandările. Cerut de el: să se poată pune și
 * **lângă preț, sub butoane**, în coloana de cumpărare — acolo unde stă la
 * Amazon și unde intenția e cea mai mare.
 *
 * ⚠⚠ IMPLICITA RĂMÂNE CEA DE AZI. Un rând vechi de `display`, fără cheia asta,
 * înseamnă „sub produs”. Deci singura ofertă `frequently_bought` de pe
 * producție nu se mișcă de unde e, și pagina iese la fel.
 *
 * ⚠ REGULA STĂ AICI, ÎNTR-UN SINGUR LOC, fiindcă o întreabă DOUĂ lucruri care
 * trebuie să răspundă la fel:
 *   1. cine DESENEAZĂ (care set merge sus, care jos);
 *   2. cine NUMĂRĂ afișările (baliza de sus vs cea de jos).
 * Despărțite, o ofertă ar fi fost numărată de două ori, sau deloc — exact
 * defectul pe care l-am reparat azi la contorul de afișări.
 *
 * ⚠⚠ NU IMPORTĂ NIMIC DIN `offer.types.ts`, nici măcar tipuri, ci lucrează pe
 * forme minimale. `offer.types` aduce de aici VALOAREA `parseAmplasare`, iar un
 * import în sens invers ar fi închis un ciclu la rulare. Puterea tipului („cine
 * are voie lângă preț”) se dă ca argument, nu se citește din tabel.
 */

export const AMPLASARI = ["sub_produs", "langa_pret"] as const;
export type AmplasareSet = (typeof AMPLASARI)[number];

/** Ce se vede pe ecran despre fiecare așezare, în formular. */
export const DESPRE_AMPLASARE: Record<AmplasareSet, { eticheta: string; explicatie: string }> = {
  sub_produs: {
    eticheta: "Sub produs, pe toată lățimea",
    explicatie: "Bandă lată, sub zona de cumpărare, lângă recomandări. Așa se vede azi.",
  },
  langa_pret: {
    eticheta: "Lângă preț, sub butoane",
    explicatie:
      "În coloana de cumpărare, imediat sub „Adaugă în coș”. Se vede fără să derulezi, deci ajunge la mai mulți — dar are mai puțin loc, așa că setul se desenează mai strâns.",
  },
};

/**
 * Așezarea cerută de un rând de `display`, curățată.
 *
 * ⚠⚠ NU ARUNCĂ NICIODATĂ, și asta contează: funcția e chemată din
 * `parseOfferDisplay`, adică pe drumul FIECĂREI încărcări de pagină de produs a
 * fiecărui magazin. O scriere de forma `TABEL[type].ceva` ar fi aruncat pe un
 * tip nerecunoscut și ar fi albit vitrina. De-aia puterea vine ca `boolean`, nu
 * ca o căutare în tabel.
 *
 * ⚠ Un tip care n-are voie lângă preț cade pe „sub produs” CHIAR DACĂ jsonb-ul
 * cere altceva: un rând scris de mână, sau un payload meșteșugit trimis lui
 * `updateOffer`, ar fi băgat o grilă de patru carduri de recomandări în caseta
 * de cumpărare.
 */
export function parseAmplasare(raw: unknown, poateLangaPret: boolean): AmplasareSet {
  if (!poateLangaPret) return "sub_produs";
  return (AMPLASARI as readonly string[]).includes(String(raw)) ? (raw as AmplasareSet) : "sub_produs";
}

/**
 * Cât de puțin trebuie să știe funcțiile de mai jos despre o ofertă rezolvată.
 *
 * ⚠ Formă minimală, nu `ResolvedOffer`: fișierul ăsta n-are voie să atârne de
 * tipul acela (vezi capul fișierului).
 */
export interface OfertaDeAsezat {
  type: string;
  amplasare: AmplasareSet;
  products: readonly unknown[];
  pricing?: unknown;
}

/**
 * Chiar se desenează setul ăsta?
 *
 * ⚠⚠ ACELAȘI PREDICAT pentru cine desenează și pentru cine numără. Erau două
 * filtre scrise de mână, unul în `ProductOffers` și unul în pagină; cu setul
 * mutat sus, al doilea ar fi numărat o afișare pentru o ofertă pe care primul
 * o arunca — o afișare fantomă, exact ce am închis azi în contor.
 */
export function esteFbtDesenabil(o: OfertaDeAsezat): boolean {
  return o.type === "frequently_bought" && o.products.length > 0 && !!o.pricing;
}

/** Recomandările desenabile. Fără preț: sunt recomandări, nu seturi. */
export function esteCrossSellDesenabil(o: OfertaDeAsezat): boolean {
  return o.type === "cross_sell" && o.products.length > 0;
}

/**
 * Ofertele paginii, împărțite în cele două bucăți de ecran.
 *
 * ⚠⚠ CE INTRĂ AICI E EXACT CE SE DESENEAZĂ, nu tot ce a venit de la server. De
 * asta atârnă baliza: un înveliș cu `ref` care nu desenează nimic e un `<div>`
 * gol de zero pixeli, pe care observatorul îl poate socoti „intrat în ecran” —
 * și atunci contorul ar crește pentru o ofertă pe care n-a văzut-o nimeni.
 *
 * ⚠ Recomandările rămân MEREU jos. Așezarea e doar pentru set, fiindcă o grilă
 * de patru carduri n-are ce căuta în coloana de cumpărare, iar `cross_sell` se
 * vede pe două suprafețe (pagina de produs ȘI coșul), deci „lângă preț” nici
 * n-ar avea un înțeles limpede acolo.
 */
export function imparteOferteleDupaAmplasare<T extends OfertaDeAsezat>(
  oferte: readonly T[],
): { langaPret: T[]; subProdus: T[] } {
  const langaPret: T[] = [];
  const subProdus: T[] = [];
  for (const o of oferte) {
    if (esteFbtDesenabil(o)) {
      (o.amplasare === "langa_pret" ? langaPret : subProdus).push(o);
      continue;
    }
    if (esteCrossSellDesenabil(o)) subProdus.push(o);
    /* ⚠ Ce nu e desenabil nu intră NICĂIERI: nici jos, nici sus. Altfel ar fi
       ținut aprinsă o baliză pentru o ofertă care nu ajunge pe ecran. */
  }
  return { langaPret, subProdus };
}
