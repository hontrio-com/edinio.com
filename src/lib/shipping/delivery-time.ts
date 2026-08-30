/**
 * ═══ TERMENUL DE LIVRARE: O SINGURA SURSA PENTRU PAGINA SI PENTRU GOOGLE ═══
 *
 * Reclamat de un comerciant: Search Console semnala „deliveryTime lipseste din
 * offers.shippingDetails" pe TOATE paginile lui de produs, iar el cautase in
 * Setari → Livrare si in formularul de produs si nu gasise unde sa-l completeze.
 *
 * Avea dreptate ca nu avea unde. Singurul loc unde existau zilele era
 * `page_content.delivery_estimate` — comutatorul „Estimare livrare" din EDITORUL
 * de magazin, adica o setare de AFISARE: aprinde o casuta cu doua date pe pagina
 * produsului. Cine nu voia casuta aia pe pagina nu avea nicio cale sa declare un
 * termen catre Google, iar `buildProductJsonLd` — pe bun dreptate — nu inventa
 * unul. De aici avertismentul, pe tot catalogul.
 *
 * Deci se despart cele doua lucruri care erau amestecate intr-un singur comutator:
 *
 *   `delivery_time`     — CAT dureaza, ca fapt despre magazin: procesare +
 *                         tranzit. Se completeaza in Setari → Livrare, adica
 *                         fix acolo unde omul l-a cautat.
 *   `delivery_estimate` — DACA se arata casuta pe pagina produsului si cu ce
 *                         eticheta. Ramane in editor, unde a fost mereu.
 *
 * ⚠ NUMERELE VIN DINTR-UN SINGUR LOC, dinadins. Cand `delivery_time` e
 * completat, si casuta de pe pagina, si microdatele se socotesc din el. Doua
 * seturi de zile, unul afisat si altul trimis catre Google, ar fi exact
 * contradictia „pagina spune una, microdatele alta" pentru care Merchant Center
 * suspenda conturi — si ar aparea abia dupa ce comerciantul modifica unul din
 * ele si uita de celalalt.
 */

/** Zilele declarate de comerciant, desfacute pe cele doua etape. */
export type TimpDeLivrare = {
  /** Cat sta comanda la magazin pana pleaca la curier. */
  procesareMin: number;
  procesareMax: number;
  /** Cat sta la curier, dupa ce a plecat. */
  tranzitMin: number;
  tranzitMax: number;
};

/** Forma salvata in `store_settings.page_content.delivery_time`. */
export type TimpDeLivrareSalvat = {
  enabled: boolean;
  handling_min: number;
  handling_max: number;
  transit_min: number;
  transit_max: number;
};

/** Peste o luna nu mai e „estimare de livrare", e altceva; sub zero nu exista. */
const ZILE_MAX = 30;

/**
 * Un numar de zile acceptabil, sau `null`.
 *
 * Se accepta si sirul, fiindca valorile vin din `<input type="number">` prin
 * jsonb: un „3" scris de mana e acelasi lucru cu 3, iar respins aici ar goli
 * termenul tocmai comerciantului care l-a completat.
 */
function zile(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const z = Math.trunc(n);
  return z < 0 || z > ZILE_MAX ? null : z;
}

/** Un interval valid: ambele capete numere bune, iar maximul cel putin cat minimul. */
function interval(min: unknown, max: unknown): [number, number] | null {
  const a = zile(min);
  const b = zile(max);
  if (a === null || b === null || b < a) return null;
  return [a, b];
}

/**
 * Termenul de livrare al magazinului, sau `null` cand comerciantul nu l-a scris.
 *
 * `null` NU se inlocuieste cu o valoare implicita, nicaieri: un termen pe care
 * omul nu l-a spus e o promisiune facuta in numele lui. Vezi si nota din
 * `product-jsonld.ts`, unde acelasi rationament tine si taxa de retur afara.
 */
export function parseTimpDeLivrare(pageContent: unknown): TimpDeLivrare | null {
  const pc = (pageContent ?? null) as {
    delivery_time?: unknown;
    delivery_estimate?: unknown;
  } | null;
  if (!pc || typeof pc !== "object") return null;

  /* Sursa noua, din Setari → Livrare: procesarea si tranzitul, separat. */
  const dt = pc.delivery_time as Record<string, unknown> | null | undefined;
  if (dt && typeof dt === "object" && dt.enabled === true) {
    const procesare = interval(dt.handling_min, dt.handling_max);
    const tranzit = interval(dt.transit_min, dt.transit_max);
    /* Amandoua sau niciuna: un `deliveryTime` cu o singura jumatate din care
       lipseste cealalta nu spune cat dureaza livrarea. */
    if (procesare && tranzit) {
      return {
        procesareMin: procesare[0], procesareMax: procesare[1],
        tranzitMin: tranzit[0], tranzitMax: tranzit[1],
      };
    }
  }

  /*
   * Rezerva: estimarea veche din editor, pentru magazinele care o au deja
   * pornita si n-au trecut prin Setari → Livrare.
   *
   * ⚠ `min_days`/`max_days` sunt TOTALUL, nu tranzitul: casuta de pe pagina
   * arata „azi + min_days … azi + max_days", adica din clipa comenzii pana la
   * usa. Deci se citesc ca 0 zile de procesare + tot intervalul pe tranzit.
   * Socotite altfel — procesare 0-1 peste tranzitul min-max, cum se emitea pana
   * acum — Google publica o zi in plus fata de ce scrie pe pagina aceluiasi
   * produs.
   */
  const de = pc.delivery_estimate as Record<string, unknown> | null | undefined;
  if (de && typeof de === "object" && de.enabled === true) {
    const total = interval(de.min_days, de.max_days);
    if (total) {
      return { procesareMin: 0, procesareMax: 0, tranzitMin: total[0], tranzitMax: total[1] };
    }
  }

  return null;
}

/**
 * Fereastra pe care o vede clientul: din clipa comenzii pana la usa.
 *
 * Casuta de pe pagina produsului se deseneaza din ea, iar Google primeste
 * aceleasi zile despartite in procesare + tranzit — deci cele doua nu se pot
 * departa una de alta.
 */
export function fereastraDeLivrare(t: TimpDeLivrare): { min: number; max: number } {
  return { min: t.procesareMin + t.tranzitMin, max: t.procesareMax + t.tranzitMax };
}

/**
 * Ce se scrie in baza, pornind de la ce a completat comerciantul in formular.
 *
 * Se curata AICI, o data, ca sa nu ajunga in jsonb un „min 5, max 2" pe care
 * fiecare cititor sa-l descopere altfel. Un formular invalid nu sterge in tacere
 * ce era salvat: intoarce `null`, iar apelantul decide (actiunea de salvare
 * pastreaza randul anterior).
 */
export function normalizeazaTimpDeLivrare(raw: unknown): TimpDeLivrareSalvat | null {
  const r = (raw ?? null) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  /* Stins: se salveaza stins, cu zilele pastrate, ca sa nu trebuiasca
     recompletate cand comerciantul il reaprinde. */
  const procesare = interval(r.handling_min, r.handling_max);
  const tranzit = interval(r.transit_min, r.transit_max);
  if (!procesare || !tranzit) return null;
  return {
    enabled: r.enabled === true,
    handling_min: procesare[0], handling_max: procesare[1],
    transit_min: tranzit[0], transit_max: tranzit[1],
  };
}
