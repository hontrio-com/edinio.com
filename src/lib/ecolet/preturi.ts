import type { RaspunsCotare, ServiciuEcolet } from "./client";

/**
 * Ofertele eColet, scoase din raspunsul cotarii.
 *
 * ═══ DE CE E UN FISIER PROPRIU, PUR ═══
 *
 * Raspunsul lui `reload-form` e cea mai inselatoare bucata din toata integrarea:
 * nu e o lista de oferte, ci SASE OBIECTE PARALELE indexate pe slug, care trebuie
 * citite impreuna ca sa iasa un pret. Tot ce se poate gresi aici se greseste
 * TACUT — o oferta lipsa, un pret cu 28 de bani mai mic, un serviciu aratat
 * cumparatorului desi eColet a spus ca nu poate merge.
 *
 * Fiind pur, se poate proba fara token si fara retea, adica inainte de prima
 * expediere reala.
 */

/**
 * ⚠ PRETURILE VIN CA SIRURI, CU VIRGULA ZECIMALA.
 *
 * `"16,28"` — nu 16.28, nu un numar. Cele doua greseli firesti costa amandoua,
 * si niciuna nu da vreo eroare:
 *
 *   Number("16,28")     -> NaN   (oferta dispare, sau pleaca un pret NaN care
 *                                 se scrie in comanda ca „null" ori „0")
 *   parseFloat("16,28") -> 16    (0,28 lei pierduti pe FIECARE comanda, tacut,
 *                                 si diferenta o suporta comerciantul)
 *
 * ⚠ Si mai e o capcana peste: la sume de peste o mie, formatul romanesc pune
 * PUNCT la mii — `"1.016,28"`. Inlocuind doar virgula, ar iesi `1.016.28`, adica
 * `parseFloat` da 1,016 lei in loc de 1016,28.
 *
 * ⚠ Dar punctul se sterge NUMAI cand exista si o virgula. Prima forma il stergea
 * mereu, si atunci un pret zecimal obisnuit — `"19.37"`, fara virgula — iesea
 * 1937: de o suta de ori mai mult, tacut. Proba l-a prins.
 *
 * Intoarce `null` cand nu se poate citi, si NICIODATA zero: un pret zero e o
 * livrare gratuita pe care n-a hotarat-o nimeni. Apelantul arunca oferta.
 */
export function parseazaPretRo(brut: unknown): number | null {
  if (typeof brut === "number") return Number.isFinite(brut) && brut >= 0 ? brut : null;
  if (typeof brut !== "string") return null;

  const curat = brut.trim().replace(/\s/g, "");
  if (!curat) return null;

  /*
   * ⚠ Punctul se sterge DOAR cand exista si o virgula.
   *
   * In formatul romanesc punctul e separator de mii SI numai atunci: „1.016,28".
   * Fara virgula insa, „19.37" e un pret zecimal obisnuit — sters punctul, ar fi
   * iesit 1937, adica de o suta de ori mai mult. Proba a prins-o.
   */
  const areVirgula = curat.includes(",");
  const normalizat = areVirgula ? curat.replace(/\./g, "").replace(",", ".") : curat;

  /* Lista alba pe FORMA, nu doar `Number(...)`: „16,28 lei" ar fi trecut prin
     `parseFloat` ca 16, iar noi vrem sa aflam ca nu intelegem. */
  if (!/^\d+(\.\d+)?$/.test(normalizat)) return null;

  const n = Number(normalizat);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** O oferta gata de aratat cumparatorului. */
export type OfertaEcolet = {
  /** Slug-ul serviciului: cheia de API la emitere. */
  slug: string;
  /** Numele curierului REAL („DPD"), nu „eColet" — asta vede cumparatorul. */
  numeCurier: string;
  /** Numele serviciului („DPD Standard"). */
  numeServiciu: string;
  /** Pretul cu TVA, in lei. */
  pret: number;
  /** Poate serviciul asta sa incaseze la livrare? Vine per-slug din raspuns. */
  acceptaRamburs: boolean;
};

/**
 * Ofertele care se pot chiar vinde, din raspunsul cotarii.
 *
 * ═══ ⚠ PATRU FILTRE, SI FIECARE A EXISTAT DINTR-UN MOTIV ═══
 *
 * 1. **`form.errors` nevid opreste TOT.** Sunt erorile pe comanda (indexate pe
 *    CAMP, nu pe slug): „Order without pickup is not available on this courier".
 *    Documentatia spune limpede — cu ele, expedierea NU se poate face. Aratate ca
 *    oferte, cumparatorul ar plati un transport care va fi refuzat la emitere.
 * 2. **`statuses[slug] !== true`** — eColet spune explicit pentru care servicii
 *    merge comanda ASTA. Un pret existent nu inseamna serviciu disponibil: cele
 *    doua obiecte sunt paralele si pot sa nu se acopere.
 * 3. **Pret necitibil sau zero** — vezi `parseazaPretRo`. Mai bine o oferta mai
 *    putin decat un transport pe gratis.
 * 4. **Serviciul trebuie sa fie in catalogul contului si pornit** (`status`), si
 *    in lista comerciantului daca el si-a ales cateva. Fara asta, cumparatorul ar
 *    putea alege un serviciu pe care comerciantul l-a oprit dinadins.
 *
 * Rezultatul e sortat crescator dupa pret: la fel ca la ceilalti doi brokeri, iar
 * `CourierSelector` alege prima optiune cand clientul nu apasa nimic.
 */
export function ofertePosibile(
  raspuns: RaspunsCotare,
  catalog: ServiciuEcolet[],
  serviciiPermise?: string[],
): OfertaEcolet[] {
  const form = raspuns?.form;
  if (!form) return [];

  /* Filtrul 1: o eroare pe comanda invalideaza toate serviciile deodata. */
  if (form.errors && Object.keys(form.errors).length > 0) return [];

  const permise = new Set((serviciiPermise ?? []).map((s) => s.trim()).filter(Boolean));
  const dupaSlug = new Map(catalog.map((s) => [s.slug, s]));

  const iesire: OfertaEcolet[] = [];
  for (const [slug, disponibil] of Object.entries(form.statuses ?? {})) {
    if (disponibil !== true) continue;                       // filtrul 2

    const pret = parseazaPretRo(form.prices_gross?.[slug]);   // filtrul 3
    if (pret === null || pret <= 0) continue;

    const serviciu = dupaSlug.get(slug);                      // filtrul 4
    if (!serviciu || serviciu.status === false) continue;
    if (permise.size > 0 && !permise.has(slug)) continue;

    iesire.push({
      slug,
      pret,
      numeCurier: serviciu.courier?.name?.trim() || "eColet",
      numeServiciu: serviciu.full_name?.trim() || serviciu.name?.trim() || slug,
      /*
       * ⚠ Rambursul se citeste per SLUG din raspuns, nu din catalog.
       * `conditions.has_cod` din `/services` spune ce poate serviciul in general;
       * `additional_services[slug].cod` spune ce poate pentru comanda ASTA (o
       * suma prea mare, o destinatie anume). A doua e cea adevarata.
       */
      acceptaRamburs: form.additional_services?.[slug]?.cod === true,
    });
  }

  return iesire.sort((a, b) => a.pret - b.pret);
}

/**
 * Eticheta unei oferte, asa cum o vede cumparatorul in checkout.
 *
 * ⚠ Se arata CURIERUL REAL, nu „eColet": omul vrea sa stie cine ii aduce coletul,
 * si numele brokerului nu-i spune nimic. Aceeasi hotarare ca la Woot si Colete.
 */
export function etichetaOferta(o: OfertaEcolet): string {
  return numeServiciuEcolet(o.numeCurier, o.numeServiciu);
}

/**
 * Aceeasi regula, pentru oriunde se compune numele din curier si serviciu.
 *
 * ⚠ Exista fiindca regula se aplica in TREI locuri (oferta din checkout, caseta
 * „clientul a ales" din formular, si numele scris pe comanda la finalizare), iar
 * scrisa de mana in fiecare, unele ieseau „DPD DPD Standard" — inclusiv in baza.
 * `full_name` din catalogul lor contine deja curierul; `name` nu.
 */
export function numeServiciuEcolet(
  curier: string | null | undefined,
  serviciu: string | null | undefined,
): string {
  const s = (serviciu ?? "").trim();
  const c = (curier ?? "").trim();
  if (!s) return c;
  if (!c) return s;
  return s.toLowerCase().startsWith(c.toLowerCase()) ? s : `${c} ${s}`;
}
