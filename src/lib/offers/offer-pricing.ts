// Regulile de PRET ale ofertelor, fara baza de date.
//
// Magazinul decide ce oferta arata (`resolveProductOffers` / `resolveCartOffers`
// din `offers.ts`) dupa un sir intreg de reguli: declansatorul, suprafata,
// primele `maxProducts` produse, doar cele care chiar se pot lua dintr-o apasare.
// La plasarea comenzii nu se verifica NIMIC din toate astea: se lua id-ul de
// oferta din browser si se repretuia orice linie al carei produs aparea in
// `config.productIds`. Cine trimitea id-ul unei oferte pe o comanda care nu o
// declansa primea reducerea oricum.
//
// Aici stau aceleasi reguli, scrise o singura data si testabile: `refuzaOferta`
// spune daca oferta se aplica pe comanda asta, `setulOfertei` reconstituie ce ar
// fi aratat magazinul, iar `aplicaOfertaPeLinii` scrie preturile. Nimic din ce e
// aici nu atinge Supabase, ca sa poata fi verificat de teste — apelantul
// (`applyOfferPricing`) doar incarca randurile si le paseaza incoace.

import { aplicaBumpPeOBucata, type BumpItem } from "./bump-pricing";
import { imparteEconomiaCompanionilor, pretulSetului } from "./fbt-pricing";
import { esteUuid } from "@/lib/supabase/ids";
import type { OfferConfig, OfferDisplay, OfferProduct, OfferTrigger, OfferType } from "./offer.types";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Tipurile care chiar schimba un pret la plasarea comenzii. Restul se refuza. */
export const TIPURI_CU_PRET: OfferType[] = ["order_bump", "frequently_bought"];

/**
 * Cate oferte poate purta o comanda: sapte bump-uri plus un singur set „cumpara
 * impreuna". Magazinul nu are voie sa arate mai multe decat atat (vezi
 * `MAX_BUMPURI_AFISATE`), ca plafonul sa nu poata opri niciodata un client
 * adevarat — aici prinde doar un `accepted_offer_ids` construit de mana, care
 * altfel ar umfla `.in()` cat vrea cel care il trimite.
 */
export const MAX_OFERTE_ACCEPTATE = 8;

/** Cate bump-uri are voie sa arate o suprafata, ca sa incapa si setul FBT. */
export const MAX_BUMPURI_AFISATE = MAX_OFERTE_ACCEPTATE - 1;

/** Id-urile revendicate, curatate: doar id-uri adevarate, deduplicate si numarate. */
export function normalizeazaIds(acceptedOfferIds: string[] | undefined): { ids: string[]; preaMulte: boolean } {
  const ids = [...new Set((acceptedOfferIds ?? []).filter(esteUuid))];
  return { ids, preaMulte: ids.length > MAX_OFERTE_ACCEPTATE };
}

/** Plafonul de cantitate pe o linie de comanda, acelasi ca la editare. */
export const MAX_CANTITATE_LINIE = 999;

export type MotivRefuz =
  | "inexistenta"        // id-ul nu e o oferta activa a magazinului
  | "tip"                // tip care nu are voie sa schimbe preturi la comanda
  | "fereastra"          // in afara intervalului starts_at / ends_at
  | "declansator"        // comanda nu contine produsul/categoria care o activeaza
  | "suprafata"          // oferta nu se arata pe suprafata de unde vine comanda
  | "set_gol"            // nu mai ramane niciun produs vandabil de oferit
  | "set_incomplet"      // setul cumparat nu e setul aratat
  | "prea_multe"         // mai multe oferte decat poate arata magazinul
  | "fara_ancora"        // FBT revendicat pe o cale fara produs-ancora (cosul)
  | "lipsa_din_comanda"; // produsul oferit nu e in comanda — nu s-a promis nimic

/**
 * Preturile ancorei la un set „cumparate frecvent impreuna". Sunt DOUA, si
 * trebuie sa ramana doua: cardul din pagina primeste economia setului calculata
 * pe pretul de BAZA al produsului (asa o randeaza serverul, `resolveProductOffers`),
 * dar o imparte pe companioni folosind pretul VARIANTEI alese. Cu un singur pret,
 * ecranul si incasarea se despart pe produsele cu variante — cu cel de baza se
 * rupea impartirea, cu cel al variantei se rupea economia.
 */
export interface PretAncora {
  /** Pretul de catalog al produsului, cel cu care s-a calculat economia setului. */
  basePrice: number;
  /** Pretul unitar chiar platit (varianta aleasa), cel dupa care se imparte. */
  unitPrice: number;
}

/** O oferta incarcata din baza, cu toate cele patru straturi parsate. */
export interface OfertaCuReguli {
  id: string;
  type: OfferType;
  trigger: OfferTrigger;
  config: OfferConfig;
  display: OfferDisplay;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
}

/** Comanda pe care se re-evalueaza ofertele. */
export interface ContextComanda {
  /** Produsul din formularul de comanda directa. `null` pe calea cosului. */
  ancora: { id: string; category: string | null } | null;
  /** Toate produsele comenzii (ancora inclusa), cu categoriile lor. */
  produse: { id: string; category: string | null }[];
  /**
   * Produsele pentru care clientul a ales o VARIANTA. Ele vin sigur din cos:
   * ofertele adauga produsul dintr-o apasare, deci fara varianta. E singurul
   * semn dupa care se poate deosebi o linie purtata din cos de una adusa de
   * oferta, si de el atarna verificarea setului „cumparate frecvent impreuna".
   */
  cuVariantaAleasa?: Set<string>;
  /** Categoriile alese de oferte, cu tot subarborele — vezi `extindeCategorii`. */
  categoriiExtinse?: Set<string>;
}

/* ─── Reguli comune magazinului si comenzii ───────────────────────────────── */

export function withinWindow(startsAt: string | null, endsAt: string | null, nowMs: number): boolean {
  if (startsAt && new Date(startsAt).getTime() > nowMs) return false;
  if (endsAt && new Date(endsAt).getTime() < nowMs) return false;
  return true;
}

/**
 * Numele categoriilor alese de o oferta, IMPREUNA cu tot subarborele lor.
 *
 * Comerciantul isi alege declansatorul dintr-un arbore, deci alege firesc o
 * categorie-parinte („Imbracaminte Femei"), in timp ce produsele stau in frunze.
 * Se coboara asadar in arbore, ca si catalogul magazinului la filtrare.
 *
 * Se cheama PER OFERTA. Cat timp exista o singura multime, comuna tuturor
 * ofertelor magazinului, o oferta pe „Rochii" se aprindea si pe un produs din
 * „Pantofi", numai fiindca alta oferta alesese „Pantofi".
 */
export function extindeCategoriile(
  randuri: { id: string; name: string; parent_id: string | null }[],
  alese: string[],
): Set<string> {
  const out = new Set(alese);
  if (alese.length === 0) return out;
  const copiiiLui = new Map<string, typeof randuri>();
  for (const c of randuri) {
    if (!c.parent_id) continue;
    const arr = copiiiLui.get(c.parent_id);
    if (arr) arr.push(c); else copiiiLui.set(c.parent_id, [c]);
  }
  // Parcurgere iterativa, cu multime de vizitate: un ciclu de parinti gresit
  // introdus in date n-are voie sa blocheze randarea magazinului.
  const stiva = randuri.filter((c) => out.has(c.name));
  const vazute = new Set<string>();
  while (stiva.length) {
    const nod = stiva.pop()!;
    if (vazute.has(nod.id)) continue;
    vazute.add(nod.id);
    out.add(nod.name);
    for (const copil of copiiiLui.get(nod.id) ?? []) stiva.push(copil);
  }
  return out;
}

/**
 * Expandarea de categorii a fiecarei oferte, calculata la cerere si tinuta minte.
 * Arborele se citeste O SINGURA DATA de apelant si se paseaza incoace.
 */
export function expandarePeOferta(
  arbore: { id: string; name: string; parent_id: string | null }[],
): (o: { id: string; trigger: OfferTrigger }) => Set<string> | undefined {
  const cache = new Map<string, Set<string>>();
  return (o) => {
    if (o.trigger.scope !== "categories") return undefined;
    let s = cache.get(o.id);
    if (!s) { s = extindeCategoriile(arbore, o.trigger.categories); cache.set(o.id, s); }
    return s;
  };
}

/** Are oferta nevoie de arborele de categorii ca sa se poata evalua? */
export function cereArboreleDeCategorii(o: { trigger: OfferTrigger }): boolean {
  return o.trigger.scope === "categories" && o.trigger.categories.length > 0;
}

/** Se aprinde declansatorul ofertei pentru un singur produs (ancora)? */
export function triggerMatchesProduct(
  trigger: OfferTrigger,
  product: { id: string; category: string | null },
  categoriiExtinse?: Set<string>,
): boolean {
  if (trigger.scope === "all") return true;
  if (trigger.scope === "products") return trigger.productIds.includes(product.id);
  if (trigger.scope === "categories") {
    if (product.category == null) return false;
    return (categoriiExtinse ?? new Set(trigger.categories)).has(product.category);
  }
  return false;
}

/** Se aprinde declansatorul pentru MACAR un produs din set (cos/comanda)? */
export function triggerMatchesCart(
  trigger: OfferTrigger,
  products: { id: string; category: string | null }[],
  categoriiExtinse?: Set<string>,
): boolean {
  if (trigger.scope === "all") return true;
  return products.some((p) => triggerMatchesProduct(trigger, p, categoriiExtinse));
}

/**
 * Se aplica oferta asta pe comanda asta? `null` inseamna da.
 *
 * Aceleasi trei porti ca la afisare, in aceeasi ordine: tipul, fereastra,
 * suprafata si declansatorul. Suprafata se ia din `display` PARSAT, fiindca un
 * `display` gol primeste implicitele tipului (`parseOfferDisplay`) — pe jsonb-ul
 * brut, o oferta perfect legitima ar fi picat aici.
 */
export function refuzaOferta(o: OfertaCuReguli, ctx: ContextComanda, nowMs: number): MotivRefuz | null {
  if (!TIPURI_CU_PRET.includes(o.type)) return "tip";
  if (!withinWindow(o.startsAt, o.endsAt, nowMs)) return "fereastra";
  if (o.type === "order_bump") {
    // Bump-ul se cere cu suprafata „checkout" pe AMBELE cai: si formularul de pe
    // pagina de produs, si pagina de finalizare trec prin `getCheckoutBumps`.
    if (!o.display.surfaces.includes("checkout")) return "suprafata";
    if (!triggerMatchesCart(o.trigger, ctx.produse, ctx.categoriiExtinse)) return "declansator";
    return null;
  }
  // „Cumparate frecvent impreuna" se vinde numai din pagina produsului-ancora.
  if (!ctx.ancora) return "fara_ancora";
  if (!o.display.surfaces.includes("product_page")) return "suprafata";
  if (!triggerMatchesProduct(o.trigger, ctx.ancora, ctx.categoriiExtinse)) return "declansator";
  return null;
}

/** Produsul poate fi luat dintr-o apasare: are stoc si n-are variante de ales. */
function vandabil(p: OfferProduct): boolean {
  return !p.outOfStock && !p.hasVariants;
}

/**
 * Ce ar fi aratat magazinul, reconstituit din randurile deja incarcate.
 *
 * `candidati` sunt produsele din `config.productIds`, IN ORDINEA din config, deja
 * curatate de cele lipsa, inactive sau pachet (exact ce face `fetchOfferProducts`).
 *
 * La „cumparate frecvent impreuna" reconstituirea e exacta: se scoate ancora, se
 * taie la `maxProducts` si raman cele vandabile — chiar setul de pe card.
 *
 * La order bump nu se poate fi exact, si merita spus de ce: magazinul arata
 * primul produs vandabil care NU era deja in cos, iar la comanda cosul de atunci
 * nu se mai poate reconstitui — produsul oferit e acum el insusi o linie. Se
 * accepta atunci orice candidat vandabil pentru care fiecare vandabil dinaintea
 * lui are linie in comanda, adica exact situatia in care ar fi fost sarit ca
 * fiind deja in cos. In cazul obisnuit ramane „primul vandabil". Fara regula
 * asta, un bump cu `fixedPrice: 10` si patru produse in config lasa clientul sa
 * revendice produsul de 500 de lei la 10.
 */
export function setulOfertei(
  o: { type: OfferType; config: OfferConfig },
  candidati: OfferProduct[],
  ancoraId: string | null,
  produseInComanda: Set<string>,
  cuVariantaAleasa: Set<string> = new Set(),
): { set: OfferProduct[] } | { motiv: MotivRefuz } {
  if (o.type === "frequently_bought") {
    const aratate = candidati.filter((p) => p.id !== ancoraId).slice(0, o.config.maxProducts);
    const set = aratate.filter(vandabil);
    if (set.length === 0) return { motiv: "set_gol" };
    /*
     * Un companion care nu se mai poate vinde, dar e totusi pe comanda, inseamna
     * ca setul s-a schimbat intre card si trimitere: pretuit pe setul cel nou, el
     * s-ar incasa INTREG, in tacere, desi pe buton scria pretul setului vechi.
     *
     * Verificarea cere insa un semn dupa care linia lui sa se poata deosebi de o
     * linie purtata din cos, fiindca ele ajung amestecate in aceeasi lista. Semnul
     * e varianta aleasa: ofertele adauga produsul dintr-o apasare, deci
     * intotdeauna fara varianta. Fara distinctia asta, un produs cu variante pe
     * care clientul il avea de mult in cos (unde e perfect vandabil) bloca fiecare
     * comanda „cumpara impreuna" a magazinului — si cosul supravietuieste
     * reincarcarii, deci n-avea cum sa iasa din blocaj.
     */
    const schimbat = aratate.some(
      (p) => !vandabil(p) && produseInComanda.has(p.id) && !cuVariantaAleasa.has(p.id),
    );
    if (schimbat) return { motiv: "set_incomplet" };
    return { set };
  }

  const acceptabile: OfferProduct[] = [];
  // Cati candidati fara linie in comanda au ocupat locuri in fereastra afisata:
  // taierea la `maxProducts` se face DUPA excluderea celor din cos, deci
  // fereastra aluneca la dreapta cu fiecare produs pe care cosul l-a ascuns.
  let ocupate = 0;
  for (const p of candidati) {
    if (ocupate >= o.config.maxProducts) break;
    const areLinie = produseInComanda.has(p.id);
    if (vandabil(p)) {
      acceptabile.push(p);
      // Primul vandabil pe care cosul nu-l putea ascunde: dincolo de el,
      // magazinul n-avea ce arata.
      if (!areLinie) break;
    }
    if (!areLinie) ocupate++;
  }
  if (acceptabile.length === 0) return { motiv: "set_gol" };
  return { set: acceptabile };
}

/**
 * Scrie preturile ofertei pe liniile comenzii. Modifica `linii` pe loc si
 * intoarce economia, ca `aplicaBumpPeOBucata`.
 *
 * Preturile de pornire sunt cele de CATALOG, din `set`, nu cele de pe linie:
 * asa o a doua oferta nu mai poate recalcula peste un pret deja redus. Iar o
 * linie atinsa o data nu mai poate fi atinsa de alta oferta (`atinse`, dupa
 * IDENTITATEA obiectului — `aplicaBumpPeOBucata` creeaza linii noi).
 */
export function aplicaOfertaPeLinii(
  linii: BumpItem[],
  o: { type: OfferType; config: OfferConfig },
  set: OfferProduct[],
  ancora: PretAncora,
  atinse: Set<BumpItem>,
): { savings: number } | { motiv: MotivRefuz } {
  if (o.type === "order_bump") {
    const produse = new Map(set.map((p) => [p.id, p]));
    // De la coada catre inceput: liniile de bump se adauga DUPA cele din cos,
    // deci cand acelasi produs e si in cos si oferit ca bump, cautarea de la
    // inceput nimerea linia din cos si reducerea ateriza pe cantitatea ei.
    let linie: BumpItem | undefined;
    for (let k = linii.length - 1; k >= 0; k--) {
      const l = linii[k];
      // Liniile fara nicio bucata nu consuma bump-ul: o cantitate care se
      // rotunjeste la zero ar fi luat reducerea in locul liniei adevarate.
      if (!atinse.has(l) && l.quantity >= 1 && produse.has(l.product_id)) { linie = l; break; }
    }
    if (!linie) return { motiv: "lipsa_din_comanda" };
    const pret = pretulSetului([produse.get(linie.product_id)!.price], o.config).price;
    if (pret >= linie.price) return { savings: 0 };
    return { savings: aplicaSiMarcheaza(linii, linie, pret, atinse) };
  }

  // FBT: setul se cumpara intreg sau deloc. Cand lipseste un companion, pretul de
  // set nu se mai aplica — economia lui s-ar muta pe ceilalti.
  // Se parcurge TOT setul inainte de a decide: iesirea la prima lipsa facea ca
  // acelasi eveniment sa opreasca comanda sau sa treaca in tacere, dupa ordinea
  // produselor in configuratie.
  const liniiSet: BumpItem[] = [];
  for (const p of set) {
    const l = linii.find((x) => !atinse.has(x) && x.quantity >= 1 && x.product_id === p.id);
    if (l) liniiSet.push(l);
  }
  if (liniiSet.length !== set.length) {
    return { motiv: liniiSet.length === 0 ? "lipsa_din_comanda" : "set_incomplet" };
  }
  const reduse = imparteEconomiaCompanionilor(
    ancora.unitPrice,
    set.map((p) => p.price),
    pretulSetului([ancora.basePrice, ...set.map((p) => p.price)], o.config).savings,
  );
  let savings = 0;
  liniiSet.forEach((l, idx) => {
    if (reduse[idx] < l.price) savings = round2(savings + aplicaSiMarcheaza(linii, l, reduse[idx], atinse));
  });
  return { savings };
}

/**
 * Reducerea se da pe O SINGURA bucata, si linia atinsa (cu tot cu cea desprinsa
 * din ea) se insemneaza, ca o a doua oferta sa n-o mai poata reduce.
 */
function aplicaSiMarcheaza(
  linii: BumpItem[], linie: BumpItem, pretRedus: number, atinse: Set<BumpItem>,
): number {
  const inainte = linii.length;
  const economie = aplicaBumpPeOBucata(linii, linie, pretRedus);
  atinse.add(linie);
  if (linii.length > inainte) atinse.add(linii[linii.length - 1]);
  return economie;
}

/* ─── Bucla intreaga, tot fara baza de date ───────────────────────────────── */

export interface IntrareOferte {
  /** Ofertele revendicate, parsate. Ordinea din payload NU conteaza: se sorteaza aici. */
  oferte: OfertaCuReguli[];
  /** Liniile comenzii. Se modifica pe loc, deci apelantul paseaza o copie. */
  linii: BumpItem[];
  ctx: ContextComanda;
  /** Produsele care se pot OFERI: active, ne-pachet, dupa `id`. */
  oferibile: Map<string, OfferProduct>;
  /** Preturile ancorei, pentru setul FBT. */
  ancora: PretAncora;
  /** Categoriile extinse ale unei oferte anume — vezi `extindeCategoriile`. */
  extinsele?: (o: OfertaCuReguli) => Set<string> | undefined;
  nowMs: number;
}

export interface IesireOferte {
  savings: number;
  applied: string[];
  rejected: { id: string; motiv: MotivRefuz }[];
}

/**
 * „Lipsa din comanda" e singurul refuz care NU opreste comanda: clientul a bifat
 * bump-ul si apoi a scos produsul, deci nu i s-a promis niciun pret pe care sa
 * nu-l primeasca. Restul opresc, ca la cuponul respins — un bump nu promite doar
 * un pret, ci ADAUGA UN PRODUS, iar a-l lasa in comanda la pretul intreg
 * inseamna ca ecranul scria una si curierul incaseaza alta.
 */
export function opresteComanda(rejected: { motiv: MotivRefuz }[]): boolean {
  return rejected.some((r) => r.motiv !== "lipsa_din_comanda");
}

/**
 * Toate ofertele revendicate, evaluate si aplicate pe liniile comenzii.
 *
 * Sta aici, si nu in `applyOfferPricing`, tocmai ca sa poata fi testata: invelisul
 * de acolo n-are voie sa faca decat interogari. Ordinea de aplicare e a
 * SERVERULUI (prioritatea comerciantului, apoi id-ul), fiindca altfel doua oferte
 * care ating aceeasi linie ar da preturi diferite dupa ordinea din payload.
 */
export function pretuiesteOfertele(intrare: IntrareOferte): IesireOferte {
  const { linii, ctx, oferibile, ancora, nowMs } = intrare;
  const cuVariantaAleasa = ctx.cuVariantaAleasa ?? new Set<string>();
  const rejected: { id: string; motiv: MotivRefuz }[] = [];
  const applied: string[] = [];
  const atinse = new Set<BumpItem>();
  // Ancora intra si ea: la afisare, `OrderModal` cere bump-urile cu
  // `[product.id, ...cosul]`, deci produsul din formular ascunde bump-ul lui exact
  // ca o linie din cos. Fara ea, reconstituirea se oprea prea devreme si clientul
  // ramanea fara reducerea pe care o vazuse pe ecran.
  const produseInComanda = new Set(linii.map((i) => i.product_id));
  if (ctx.ancora) produseInComanda.add(ctx.ancora.id);
  let savings = 0;
  let areFbt = false;

  const oferte = [...intrare.oferte].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const o of oferte) {
    // Interfata poarta un singur set „cumparate frecvent impreuna"; al doilea id
    // de FBT nu poate veni decat dintr-un payload construit de mana.
    if (o.type === "frequently_bought" && areFbt) { rejected.push({ id: o.id, motiv: "prea_multe" }); continue; }

    const categoriiExtinse = intrare.extinsele?.(o);
    const motiv = refuzaOferta(o, { ...ctx, categoriiExtinse }, nowMs);
    if (motiv) { rejected.push({ id: o.id, motiv }); continue; }
    if (o.type === "frequently_bought") areFbt = true;

    // Deduplicat, ca `fetchOfferProducts` la afisare: un produs trecut de doua
    // ori in configuratie ar fi primit reducerea de doua ori pe aceeasi linie.
    const candidati = [...new Set(o.config.productIds)]
      .map((pid) => oferibile.get(pid))
      .filter((p): p is OfferProduct => !!p);
    const set = setulOfertei(o, candidati, ctx.ancora?.id ?? null, produseInComanda, cuVariantaAleasa);
    if ("motiv" in set) { rejected.push({ id: o.id, motiv: set.motiv }); continue; }

    const rez = aplicaOfertaPeLinii(linii, o, set.set, ancora, atinse);
    if ("motiv" in rez) { rejected.push({ id: o.id, motiv: rez.motiv }); continue; }
    savings = round2(savings + rez.savings);
    applied.push(o.id);
  }
  return { savings, applied, rejected };
}
