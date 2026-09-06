/**
 * Care configurator se aplica unui produs.
 *
 * ═══ ORDINEA, SI DE CE ═══
 *
 *   1. LEGATURA DIRECTA pe produs. Comerciantul a spus explicit, deci bate orice.
 *   2. MOSTENIREA DIN CATEGORIE, daca produsul n-a fost EXCLUS anume de sub ea.
 *   3. Niciunul.
 *
 * ═══ ⚠ CATEGORIA SE LEAGA PRIN NUME, NU PRIN ID ═══
 *
 * `products.category` e TEXT. Legatura produs-categorie se face prin nume peste tot in proiect,
 * si ofertele fac deja exact asa. Se coboara in subarbore cu `extindeCategoriile` — acelasi
 * ajutor, nu o a doua parcurgere care ar fi ajuns sa raspunda altfel decat prima.
 *
 * ═══ ⚠ CONFLICTUL NU SE REZOLVA CU „PRIMUL DIN LISTA" ═══
 *
 * Un nume de categorie poate apartine mai multor randuri din `categories`: unicitatea e pe frati,
 * nu pe magazin. In productie sunt 8 astfel de perechi. Deci acelasi produs poate ajunge sub doua
 * categorii cu configuratoare DIFERITE.
 *
 * „Primul din baza" ar fi insemnat ca produsul isi schimba configuratorul la o simpla reordonare
 * a randurilor, fara ca nimeni sa fi atins nimic — si nimeni n-ar fi aflat pana cand un client
 * ar fi cumparat altceva decat se astepta comerciantul.
 *
 * Deci: conflictul se INTOARCE ca atare, si produsul nu primeste niciun configurator pana cand
 * omul alege. Panoul il arata; vitrina se poarta ca si cum n-ar exista configurator.
 */

import { extindeCategoriile } from "@/lib/offers/offer-pricing";

/** Un rand din `configurator_produse`. */
export interface LegaturaProdus {
  configurator_id: string;
  product_id: string;
  fel: "direct" | "exclus";
}

/** Un rand din `configurator_categorii`. */
export interface LegaturaCategorie {
  configurator_id: string;
  categorie: string;
}

/** Un rand din `categories`, cat ii trebuie coborarii in subarbore. */
export interface RandCategorie {
  id: string;
  name: string;
  parent_id: string | null;
}

export type Rezolvare =
  | { fel: "niciunul" }
  | { fel: "direct"; configuratorId: string }
  | { fel: "categorie"; configuratorId: string; prinCategoria: string }
  /** Doua sau mai multe configuratoare mostenite. Produsul NU primeste niciunul. */
  | { fel: "conflict"; configuratoare: string[] };

/**
 * Pregateste o data ce trebuie pentru multe produse, si intoarce o functie care raspunde ieftin
 * pentru fiecare.
 *
 * ⚠ ASA, NU CU O INTEROGARE PE PRODUS. O lista de catalog are sute de produse; intrebat pe rand,
 * fiecare card ar fi costat cel putin doua cereri. Arborele de categorii si legaturile se citesc
 * o data, de apelant, si se paseaza incoace — acelasi tipar ca `expandarePeOferta`.
 */
export function rezolvitorul(
  legaturiProduse: LegaturaProdus[],
  legaturiCategorii: LegaturaCategorie[],
  arboreCategorii: RandCategorie[],
): (produs: { id: string; category: string | null }) => Rezolvare {
  const directe = new Map<string, string>();
  const excluse = new Map<string, Set<string>>();
  for (const l of legaturiProduse ?? []) {
    if (l.fel === "direct") {
      // ⚠ Indexul unic partial din baza garanteaza ca e cel mult unul. Aici doar nu se
      // suprascrie, ca sa nu depinda de ordinea randurilor daca vreodata garantia ar cadea.
      if (!directe.has(l.product_id)) directe.set(l.product_id, l.configurator_id);
    } else {
      const s = excluse.get(l.product_id) ?? new Set<string>();
      s.add(l.configurator_id);
      excluse.set(l.product_id, s);
    }
  }

  /*
   * Numele acoperite de fiecare configurator, cu tot cu subarbore. Se calculeaza O DATA pe
   * configurator, nu pe produs — la 500 de produse si 3 configuratoare, diferenta e intre 3 si
   * 1500 de coborari in arbore.
   */
  const acoperite = new Map<string, Set<string>>();
  for (const l of legaturiCategorii ?? []) {
    const acum = acoperite.get(l.configurator_id);
    const extinse = extindeCategoriile(arboreCategorii ?? [], [l.categorie]);
    if (acum) for (const n of extinse) acum.add(n);
    else acoperite.set(l.configurator_id, extinse);
  }

  return (produs) => {
    const direct = directe.get(produs.id);
    if (direct) return { fel: "direct", configuratorId: direct };

    const categorie = (produs.category ?? "").trim();
    if (!categorie) return { fel: "niciunul" };

    const scoase = excluse.get(produs.id);
    const potrivite: string[] = [];
    for (const [configuratorId, nume] of acoperite) {
      if (scoase?.has(configuratorId)) continue;
      if (nume.has(categorie)) potrivite.push(configuratorId);
    }

    if (potrivite.length === 0) return { fel: "niciunul" };
    if (potrivite.length > 1) {
      // ⚠ Sortate, ca doua rulari sa raporteze acelasi conflict in aceeasi ordine — altfel
      // mesajul din panou si-ar schimba forma de la o reincarcare la alta.
      return { fel: "conflict", configuratoare: [...potrivite].sort() };
    }
    return { fel: "categorie", configuratorId: potrivite[0], prinCategoria: categorie };
  };
}

/** Configuratorul care chiar se aplica, sau `null` — inclusiv la conflict. */
export function configuratorulAplicat(r: Rezolvare): string | null {
  return r.fel === "direct" || r.fel === "categorie" ? r.configuratorId : null;
}

/**
 * Doar legaturile catre configuratoare care CHIAR SE MAI SERVESC.
 *
 * ⚠ Fara filtrul asta, un configurator oprit ramanea in socoteala pana la capat. Doua legaturi
 * de categorie pe acelasi produs, una oprita si una activa, dadeau CONFLICT — iar produsul nu
 * primea niciunul, desi comerciantul tocmai oprise unul dintre ele ca sa ramana celalalt.
 * Adica exact gestul prin care omul incearca sa REZOLVE conflictul il facea sa persiste.
 *
 * Se filtreaza INAINTE de rezolvare, nu dupa: dupa, conflictul era deja pronuntat.
 */
export function doarActive<T extends { configurator_id: string }>(
  legaturi: T[],
  active: ReadonlySet<string>,
): T[] {
  return (legaturi ?? []).filter((l) => active.has(l.configurator_id));
}
