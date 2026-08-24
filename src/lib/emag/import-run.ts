/**
 * Importul din eMAG: partea care FACE. Citeste de la ei, scrie la noi.
 *
 * Hotararile sunt in `import.ts` si `import-produse.ts`, si sunt pure. Aici e doar
 * ordinea lucrurilor si grija de a nu strica nimic pe drum.
 *
 * ═══ ORDINEA, SI DE CE E CHIAR ASTA ═══
 *
 *   1. Se citeste TOT catalogul lor. Nu o pagina, nu primele cinci.
 *   2. Se citesc produsele noastre si ofertele deja stiute.
 *   3. Se potriveste — o singura data, peste tot deodata.
 *   4. Se scriu randurile `emag_offers` pentru tot ce s-a putut lega.
 *   5. Ce n-are corespondent se strange in familii si trece prin conducta de import
 *      a casei, care CREEAZA produsele.
 *   6. Produsele nou create se leaga de ofertele lor.
 *
 * ⚠ PASUL 1 NU SE POATE IMPARTI, si nu din lene. „Oferta asta a disparut de la ei"
 * se poate citi numai dintr-o citire intreaga; dintr-o pagina, toate celelalte
 * pagini ar fi parut disparute — si le-am fi dezlegat pe toate.
 *
 * ⚠ PASUL 6 E RE-DERIVABIL, SI DINADINS. Conducta de import poate fi dusa la capat
 * si de cronul de rezerva, daca omului i se inchide fila. Atunci pasul 6 nu mai are
 * cine sa-l cheme din rularea asta. De aceea el nu tine minte nimic: afla produsul
 * din `products.external_id`, care se compune din `family_id`/`emag_id` — adica din
 * ce sta oricum scris in `emag_offers`. Rulat de doua ori, da acelasi lucru.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import { parseVariants } from "@/lib/storefront/variants";
import { processImport, stageProducts } from "@/lib/import/committer";
import { citesteCategorii, citesteOferte, isEmagError } from "./client";
import { loadEmagContext } from "./sync";
import { patchEmagConfig } from "./config";
import {
  construiesteIndex, ofertaVenita, potriveste, raportImport,
  type OfertaCunoscuta, type Potrivire, type RandLocal, type RaportImport,
} from "./import";
import {
  contextDinCategorii, grupeazaFamilii, idExternDin, produseDeCreat, type Familie,
} from "./import-produse";
import type { EmagCategorie, EmagOfertaCitita, StareOferta } from "./types";
import type { Json } from "@/types/database.types";
/* ⚠ Codurile trecute prin Excel („5.94903E+12") NU se salveaza stergand cifrele:
   ar iesi un numar scurt care arata valabil si care poate lipi oferta de fisa
   ALTUI vanzator din catalogul lor comun. Vezi `codDeBareCurat`. */
import { codDeBareCurat } from "./ean";
import { campuriNecitibile, intregDeLaEi, zecimalDeLaEi } from "./numere";

type Admin = ReturnType<typeof createAdminClient>;

/** ⚠ Maximul lor. Cerut mai mare, eMAG intoarce tot 100 fara sa spuna nimic. */
const PE_PAGINA = 100;

/**
 * Cate pagini se citesc, cel mult.
 *
 * ⚠ NU E O LIMITA DE CATALOG, E O PLASA IMPOTRIVA UNEI BUCLE FARA SFARSIT. Oprirea
 * adevarata e „a venit o pagina mai scurta decat `itemsPerPage`". Daca eMAG ar
 * intoarce vreodata mereu pagini pline — o schimbare la ei, un filtru ignorat —
 * bucla ar fi mers pana la caderea functiei, cu 3 cereri pe secunda, la nesfarsit.
 *
 * 400 de pagini = 40.000 de oferte. Cine are mai mult afla din raport ca s-a taiat;
 * ⚠ NU se taie pe tacute, fiindca o taiere tacuta arata exact ca „atat ai".
 */
const PAGINI_MAXIM = 400;

/** Sursa joburilor de import venite din eMAG. ⚠ Trecuta si in cele doua liste albe. */
export const SURSA_EMAG = "emag_api";

export interface RezultatImportEmag {
  ok: boolean;
  mesaj: string;
  raport: RaportImport & {
    /** Cate produse s-au trimis spre creare. */
    deCreat: number;
    /** Randuri `emag_offers` a caror oferta nu mai vine de la eMAG. */
    disparute: number;
    probleme: string[];
  };
  /** Jobul de import, cand s-a facut unul. Din el se ia bara de progres. */
  importId: string | null;
}

const RAPORT_GOL = {
  citite: 0, cunoscute: 0, legate: 0, noi: 0, nehotarate: 0, ocupate: 0,
  deCreat: 0, disparute: 0, probleme: [] as string[],
};

/* ═══════════════════════════════════════════════════════════════════════════
   CITIREA DE LA EI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Tot catalogul, pagina cu pagina.
 *
 * ═══ ⚠ OPRIREA SE CITESTE DIN LUNGIMEA PAGINII, NU DINTR-UN NUMAR ═══
 *
 * `product_offer/count` exista, dar forma raspunsului lui nu e documentata nicaieri
 * — `numaraOferte` intoarce dinadins `number | null`, unde `null` inseamna „nu
 * stiu". Paginarea condusa de un numar care poate fi `null` s-ar fi oprit la prima
 * pagina si i-ar fi spus „n-ai nicio oferta pe eMAG" unui om care are patru sute.
 *
 * O pagina mai scurta decat `itemsPerPage` e singurul semnal pe care il dau cu
 * adevarat, si se citeste din chiar datele primite.
 *
 * ⚠ Ritmul e tinut de client (3 cereri pe secunda cumulat), nu de aici. Pus si
 * aici, s-ar fi inmultit cu el si importul ar fi durat de doua ori mai mult fara
 * niciun castig.
 */
async function citesteTotCatalogul(
  auth: Parameters<typeof citesteOferte>[0],
): Promise<{ oferte: EmagOfertaCitita[]; taiat: boolean; eroare: string | null }> {
  const oferte: EmagOfertaCitita[] = [];

  for (let pagina = 1; pagina <= PAGINI_MAXIM; pagina++) {
    const r = await citesteOferte(auth, { currentPage: pagina, itemsPerPage: PE_PAGINA });
    if (isEmagError(r)) {
      /*
       * ⚠ O pagina cazuta la mijloc NU se trece cu vederea. Ce s-a citit pana aici
       * e un catalog PARTIAL, iar tratat ca intreg ar fi insemnat ca toate ofertele
       * de pe paginile necitite „au disparut de la eMAG". Deci se opreste tot.
       */
      return { oferte: [], taiat: false, eroare: r.error };
    }
    const bucata = Array.isArray(r.data) ? (r.data as EmagOfertaCitita[]) : [];
    oferte.push(...bucata.filter((o) => o && Number.isFinite(o.id)));
    if (bucata.length < PE_PAGINA) return { oferte, taiat: false, eroare: null };
  }

  return { oferte, taiat: true, eroare: null };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITIREA DE LA NOI
   ═══════════════════════════════════════════════════════════════════════════ */

interface RandProdus {
  id: string;
  sku: string | null;
  page_sections: unknown;
}

/**
 * Produsele magazinului, desfacute in lucruri vandabile.
 *
 * ⚠ `fetchAllRowsStrict`, NU o citire simpla. PostgREST taie la 1000 de randuri
 * FARA sa spuna nimic. Un magazin cu 1200 de produse ar fi avut ultimele 200
 * invizibile la potrivire — si fiecare dintre ele si-ar fi facut duplicat la import.
 * „Strict" fiindca o citire incompleta aici nu e o neplacere, e un import gresit.
 */
async function citesteLucrurileNoastre(admin: Admin, businessId: string): Promise<RandLocal[]> {
  const produse = await fetchAllRowsStrict<RandProdus>("emag.import.produse", (from, to) =>
    admin.from("products").select("id, sku, page_sections")
      .eq("business_id", businessId).order("created_at", { ascending: true }).range(from, to),
  );

  const randuri: RandLocal[] = [];
  for (const p of produse) {
    const ps = (p.page_sections ?? {}) as { google?: { gtin?: string } };
    const variante = parseVariants(p.page_sections);

    if (!variante) {
      randuri.push({ product_id: p.id, variant_title: null, sku: p.sku, ean: codDeBareCurat(ps.google?.gtin) });
      continue;
    }

    /*
     * ⚠ SE IAU SI COMBINATIILE OPRITE. `combinatiiActiveUnice` sare peste cele cu
     * `enabled: false`, si aici ar fi fost gresit: o marime oprita in magazin poate
     * fi foarte bine activa la eMAG, iar sarita, oferta ei ar fi iesit „noua" si
     * s-ar fi facut un produs duplicat pentru o marime pe care omul o are deja.
     * Potrivirea intreaba „exista la noi?", nu „se vinde acum?".
     */
    const vazute = new Set<string>();
    for (const c of variante.combinations) {
      const titlu = (c?.title ?? "").trim();
      if (!titlu || vazute.has(titlu)) continue;
      vazute.add(titlu);
      randuri.push({
        product_id: p.id,
        variant_title: titlu,
        sku: (c.sku ?? "").trim() || p.sku,
        ean: codDeBareCurat(c.gtin),
      });
    }
    /* Produsul intreg ramane si el potrivibil: `part_number`-ul lui poate fi la ei
       pe o oferta fara familie. */
    randuri.push({ product_id: p.id, variant_title: null, sku: p.sku, ean: codDeBareCurat(ps.google?.gtin) });
  }

  return randuri;
}

async function citesteOferteleStiute(admin: Admin, businessId: string): Promise<OfertaCunoscuta[]> {
  return fetchAllRowsStrict<OfertaCunoscuta>("emag.import.oferte", (from, to) =>
    admin.from("emag_offers").select("emag_id, product_id, variant_title, part_number_key")
      .eq("business_id", businessId).order("emag_id", { ascending: true }).range(from, to),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCRIEREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ eMAG ingaduie 50 la scriere spre EI; asta e o scriere la NOI, deci alta limita. */
const LOT_SCRIERE = 200;

/**
 * Un rand `emag_offers` asa cum il scriem noi.
 *
 * ⚠ SCRIS CA TIP, NU CA `Record<string, unknown>`. Cu un dictionar liber,
 * `tsc` nu mai poate compara nimic cu schema bazei — o greseala de tastare intr-un
 * nume de coloana ar fi trecut de compilare si ar fi cazut abia in productie, la
 * primul import al primului comerciant, cu un mesaj PostgREST despre o coloana care
 * nu exista.
 */
interface RandOferta {
  business_id: string;
  emag_id: number;
  part_number: string | null;
  part_number_key: string | null;
  ean: string | null;
  category_id: number | null;
  brand: string | null;
  family_id: number | null;
  family_type_id: number | null;
  status: StareOferta;
  last_status_at: string;
  validation_status: number | null;
  offer_validation_status: number | null;
  translation_validation_status: number | null;
  /* ⚠ `Json`, nu `unknown`: coloana e `jsonb`, iar tipurile generate din baza cer
     chiar tipul lor. Cu `unknown`, `tsc` refuza scrierea — pe drept. */
  doc_errors: Json;
  ownership: number | null;
  number_of_offers: number | null;
  buy_button_rank: number | null;
  best_offer_sale_price: number | null;
  product_id?: string | null;
  variant_title?: string | null;
  auto_sync?: boolean;
  creat_de_edinio?: boolean;
}

/** Partea comuna a randului: tot ce se stie din oferta, fara legatura la produs. */
type BazaRand = Omit<RandOferta, "product_id" | "variant_title" | "auto_sync" | "creat_de_edinio">;

type Statusuri = Pick<
  RandOferta,
  "validation_status" | "offer_validation_status" | "translation_validation_status"
  | "doc_errors" | "ownership" | "number_of_offers" | "buy_button_rank" | "best_offer_sale_price"
>;

/**
 * Campurile pe care le scriem in coloane `integer` si care NU sunt in schema lor.
 *
 * ⚠ Lista e chiar suprafata de risc. Oricare dintre ele poate veni boolean, sir, sau
 * lipsa — si oricare, netrecut prin `intregDeLaEi`, pica scrierea intregului lot.
 */
const CAMPURI_INTREGI_NEDOCUMENTATE = [
  "ownership", "number_of_offers", "buy_button_rank", "best_offer_sale_price",
] as const;

/**
 * ⚠ TOATE prin `intregDeLaEi`, nu doar statusurile de validare.
 *
 * Pana pe 24.08.2026, ultimele patru treceau nefiltrate: `o.ownership ?? null`. Unul
 * dintre ele vine boolean, iar scrierea lotului a picat cu „invalid input syntax for
 * type integer: «true»" — catalog citit intreg, zero oferte legate, si o rotita care
 * s-a oprit fara sa spuna nimic.
 *
 * Statusurile aveau deja coercitie fiindca la ELE ne asteptasem la forme ciudate. Cele
 * patru nedocumentate n-o aveau tocmai fiindca nu stiam nimic despre ele — adica exact
 * pe dos fata de cat de mult aveau nevoie.
 */
function statusuriDin(o: EmagOfertaCitita): Statusuri {
  return {
    validation_status: intregDeLaEi(o.validation_status),
    offer_validation_status: intregDeLaEi(o.offer_validation_status),
    translation_validation_status: intregDeLaEi(o.translation_validation_status),
    doc_errors: (o.doc_errors ?? []) as Json,
    ownership: intregDeLaEi(o.ownership),
    number_of_offers: intregDeLaEi(o.number_of_offers),
    buy_button_rank: intregDeLaEi(o.buy_button_rank),
    best_offer_sale_price: zecimalDeLaEi(o.best_offer_sale_price),
  };
}

/**
 * Randurile `emag_offers`, scrise sau actualizate.
 *
 * ⚠ `auto_sync: false` SI `creat_de_edinio: false` LA TOT CE VINE DE AICI. Ofertele
 * astea existau la eMAG inainte sa stim noi de ele: pretul si stocul lor sunt puse
 * de comerciant in panoul lor. Trecute pe sincronizare automata, primul ciclu le-ar
 * fi rescris cu valorile din Edinio — adica exact munca pentru care omul a facut
 * importul, stearsa de import.
 *
 * ⚠ La randurile DEJA STIUTE nu se atinge `auto_sync`: comerciantul poate sa-l fi
 * pornit de mana intre timp, iar un import care il stinge la loc ar fi anulat o
 * hotarare a lui de fiecare data.
 */
async function scrieOferte(
  admin: Admin,
  businessId: string,
  oferte: EmagOfertaCitita[],
  potriviri: Map<number, Potrivire>,
  titluri: Map<number, string | null>,
): Promise<void> {
  const noi: RandOferta[] = [];
  const dePotrivit: RandOferta[] = [];

  for (const o of oferte) {
    const p = potriviri.get(o.id);
    if (!p) continue;

    const comun: BazaRand = {
      business_id: businessId,
      emag_id: o.id,
      part_number: o.part_number ?? null,
      part_number_key: o.part_number_key ?? null,
      ean: (o.ean ?? [])[0] ?? null,
      /* ⚠ Si astea sunt coloane `integer`. `category_id` si `family_type_id` SUNT in
         schema lor, dar trec prin aceeasi poarta: costa nimic, iar ziua in care se
         schimba ceva la ei nu mai pica importul intreg. */
      category_id: intregDeLaEi(o.category_id),
      brand: o.brand ?? null,
      family_id: intregDeLaEi(o.family?.id) || null,
      family_type_id: intregDeLaEi(o.family?.family_type_id),
      status: "imported",
      last_status_at: new Date().toISOString(),
      ...statusuriDin(o),
    };

    if (p.fel === "cunoscuta") {
      /* Numai statusurile se improspateaza. Legatura si `auto_sync` raman ale lor. */
      dePotrivit.push(comun);
      continue;
    }

    const legatura = p.fel === "legat"
      ? { product_id: p.product_id, variant_title: p.variant_title }
      : { product_id: null, variant_title: p.fel === "nou" ? (titluri.get(o.id) ?? null) : null };

    noi.push({ ...comun, ...legatura, auto_sync: false, creat_de_edinio: false });
  }

  for (const lot of bucati(noi, LOT_SCRIERE)) {
    const { error } = await admin.from("emag_offers").upsert(lot, { onConflict: "business_id,emag_id" });
    if (error) throw new Error(error.message);
  }
  for (const lot of bucati(dePotrivit, LOT_SCRIERE)) {
    const { error } = await admin.from("emag_offers").upsert(lot, { onConflict: "business_id,emag_id" });
    if (error) throw new Error(error.message);
  }
}

function bucati<T>(v: T[], cat: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < v.length; i += cat) out.push(v.slice(i, i + cat));
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEGAREA PRODUSELOR NOU CREATE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ofertele fara produs, legate de produsele pe care le-a creat importul.
 *
 * ⚠ SE POATE CHEMA ORICAND SI DE ORICATE ORI. Nu tine minte nimic din rularea care
 * a creat produsele: afla produsul din `products.external_id`, iar `external_id` se
 * compune din `family_id`/`emag_id` — care stau oricum scrise in `emag_offers`.
 *
 * De ce conteaza: conducta de import poate fi dusa la capat de cronul de rezerva,
 * cand omului i se inchide fila. Atunci pasul asta n-are cine sa-l cheme din
 * rularea lui. Fiind re-derivabil, il duce urmatoarea rulare, sau apasarea
 * urmatoare — si intre timp ofertele stau scrise, doar nelegate.
 */
export async function leagaOferteleNoi(admin: Admin, businessId: string): Promise<number> {
  const nelegate = await fetchAllRowsStrict<{ emag_id: number; family_id: number | null }>(
    "emag.import.nelegate", (from, to) =>
      admin.from("emag_offers").select("emag_id, family_id")
        .eq("business_id", businessId).is("product_id", null)
        .order("emag_id", { ascending: true }).range(from, to),
  );
  if (nelegate.length === 0) return 0;

  const externe = [...new Set(nelegate.map((o) => idExternDin(o.family_id, o.emag_id)))];

  const gasite = new Map<string, string>();
  for (const lot of bucati(externe, LOT_SCRIERE)) {
    const { data, error } = await admin.from("products").select("id, external_id")
      .eq("business_id", businessId).eq("source", SURSA_EMAG).in("external_id", lot);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as { id: string; external_id: string | null }[]) {
      if (p.external_id) gasite.set(p.external_id, p.id);
    }
  }
  if (gasite.size === 0) return 0;

  let legate = 0;
  for (const o of nelegate) {
    const extern = idExternDin(o.family_id, o.emag_id);
    const produs = gasite.get(extern);
    if (!produs) continue;
    const { error } = await admin.from("emag_offers")
      .update({ product_id: produs }).eq("business_id", businessId).eq("emag_id", o.emag_id);
    /*
     * ⚠ O legatura cazuta NU opreste restul. Poate cadea pe drept: intre citire si
     * scriere, comerciantul a putut lega produsul de mana, si atunci unicul
     * `(business_id, product_id, variant_title)` respinge randul — corect. Oprit
     * tot, o singura astfel de intamplare ar fi lasat nelegate si ofertele de dupa.
     */
    if (error) {
      void logError({
        action: "emag.import.leaga",
        message: error.message,
        details: { businessId, emag_id: o.emag_id, extern },
        severity: "warning",
      });
      continue;
    }
    legate++;
  }
  return legate;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RULAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Importul intreg, de la citirea catalogului pana la produsele create.
 *
 * `userId` e cerut fiindca `product_imports.user_id` e obligatoriu si duce la
 * `auth.users`: jobul trebuie sa aiba un om in spate, ca sa se vada in istoricul lui.
 */
export interface OptiuniImportEmag {
  /**
   * Sa devina produse in magazin ofertele lor care n-au corespondent la noi?
   *
   * ═══ ⚠ IMPLICIT NU, SI ASTA E O SCHIMBARE VOITA (24.08.2026) ═══
   *
   * Sunt doua lucrari cu totul diferite, si pana acum erau lipite intr-un buton:
   *
   *   CITIT SI LEGAT   ne uitam ce are in contul eMAG si legam de produsele lui de
   *                    la noi. Nu se atinge nimic din magazin. E lucrarea de care
   *                    are nevoie publicarea (`catalog_citit_la`), fiindca raspunde
   *                    exact la „exista deja produsul asta la ei?”.
   *   CREAT            ce n-are corespondent devine PRODUS NOU in magazinul lui.
   *
   * Comerciantul a intrebat direct: „nu vreau sa importe produsele din eMAG in
   * magazin”. Are dreptate sa se fereasca — unele magazine vand pe eMAG lucruri pe
   * care nu le tin in magazinul propriu, iar crearea lor acolo nu e o reparatie, e o
   * hotarare de-a lui.
   *
   * ⚠ Legarea NU are nevoie de creare. `scrieOferte` scrie un rand si pentru
   * ofertele fara pereche — cu `product_id: null` — deci stim ca exista la ei si nu
   * ne mai ciocnim de ele niciodata. Ăsta e chiar tot ce cerea paza.
   */
  creeazaProduse?: boolean;
}

export async function ruleazaImportEmag(
  businessId: string, userId: string, optiuni: OptiuniImportEmag = {},
): Promise<RezultatImportEmag> {
  const creeazaProduse = optiuni.creeazaProduse === true;
  const admin = createAdminClient();

  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) {
    return { ok: false, mesaj: "Contul eMAG nu este conectat.", raport: { ...RAPORT_GOL }, importId: null };
  }

  /* ── 1. Catalogul lor, intreg ─────────────────────────────────────────────── */
  const { oferte, taiat, eroare } = await citesteTotCatalogul(ctx.auth);
  if (eroare) {
    return { ok: false, mesaj: `Nu s-au putut citi ofertele de la eMAG: ${eroare}`, raport: { ...RAPORT_GOL }, importId: null };
  }
  /*
   * ⚠ Ce trimit ei si nu putem citi. Se cauta pe PRIMA oferta, o singura data: o suta
   * de oferte cu acelasi camp ciudat sunt o constatare, nu o suta. Vezi `numere.ts`.
   */
  const ciudate = oferte.length > 0
    ? campuriNecitibile(oferte[0] as unknown as Record<string, unknown>, CAMPURI_INTREGI_NEDOCUMENTATE)
    : [];
  if (ciudate.length > 0) {
    void logError({
      action: "emag.import.camp-ciudat",
      message: `eMAG trimite altceva decât un număr: ${ciudate.map((c) => `${c.camp} = ${c.primit}`).join(", ")}`,
      details: { businessId },
      severity: "warning",
    });
  }

  if (oferte.length === 0) {
    /*
     * ⚠ Zero oferte e un raspuns, nu o nereusita: contul lor chiar e gol. Marcajul se
     * scrie, deci publicarea se deschide — altfel un comerciant nou n-ar fi putut
     * publica niciodata.
     */
    if (!taiat) {
      await patchEmagConfig(admin, businessId, { catalog_citit_la: new Date().toISOString() });
    }
    return { ok: true, mesaj: "Contul tău eMAG nu are nicio ofertă.", raport: { ...RAPORT_GOL }, importId: null };
  }

  /* ── 2. Ce stim noi ───────────────────────────────────────────────────────── */
  const [aleNoastre, stiute] = await Promise.all([
    citesteLucrurileNoastre(admin, businessId),
    citesteOferteleStiute(admin, businessId),
  ]);

  /* ── 3. Potrivirea, o singura data peste tot ──────────────────────────────── */
  const { potriviri, disparute } = potriveste(
    oferte.map(ofertaVenita), construiesteIndex(aleNoastre), stiute,
  );
  const raport = raportImport(potriviri);

  /* ── 4. Familiile celor fara corespondent ───────────────────────────────────
   *
   * ⚠ TOT PASUL SE SARE CAND NU SE CREEAZA NIMIC, si nu doar scrierea de la 6.
   * `aduCategoriiPentru` face cereri catre eMAG — pana la o citire de categorie
   * pentru fiecare familie fara corespondent. Platite pentru un raspuns pe care
   * l-am arunca, ele ard chiar cererile din cele 3 pe secunda prin care pleaca o
   * miscare de stoc dupa o vanzare.
   */
  const fara = creeazaProduse
    ? oferte.filter((o) => potriviri.get(o.id)?.fel === "nou")
    : [];
  const familii = grupeazaFamilii(fara);
  const categorii = familii.length > 0 ? await aduCategoriiPentru(ctx.auth, familii) : [];
  /* ⚠ Cota si felul preturilor vin din CONTEXT, nu dintr-o citire proprie. Doua
     locuri care citesc aceeasi setare se departeaza mai devreme sau mai tarziu, iar
     aici departarea ar fi insemnat produse importate cu pretul gresit cu o cota. */
  const { produse, probleme, compozitie } = produseDeCreat(familii, contextDinCategorii(categorii), {
    vat_rate: ctx.vatRate,
    prices_include_vat: ctx.pricesIncludeVat,
  });

  /* Titlul combinatiei se stie DE ACUM, chiar daca produsul nu exista inca. Scris
     odata cu randul, el nu mai trebuie ghicit la legare. */
  const titluri = new Map<number, string | null>();
  for (const membri of compozitie.values()) {
    for (const m of membri) titluri.set(m.emag_id, m.variant_title);
  }

  /* ── 5. Scrierea randurilor ───────────────────────────────────────────────── */
  await scrieOferte(admin, businessId, oferte, potriviri, titluri);

  /*
   * ═══ ⚠ MARCAJUL SE SCRIE ABIA ACUM, DUPA CE RANDURILE CHIAR S-AU SCRIS ═══
   *
   * Prima forma il punea imediat dupa citire, cu argumentul ca el raspunde doar la
   * „le-am vazut catalogul?”. Argumentul era gresit, si s-a vazut in aceeasi zi:
   * `scrieOferte` a picat, marcajul ramasese scris, iar publicarea s-a DESCHIS cu zero
   * oferte cunoscute — adica exact starea din care s-au nascut cele 208 apasari.
   *
   * Intrebarea la care raspunde marcajul nu e „am citit”, ci „STIM ce e la ei”. Iar a
   * sti inseamna randuri scrise, nu un tablou care a trecut prin memorie.
   *
   * ⚠ Se scrie INAINTE de crearea produselor si de legare, si asta ramane: acelea pot
   * cadea fara sa strice ce stim. Granita e `scrieOferte`, nu sfarsitul functiei.
   *
   * ⚠ `taiat` il opreste in continuare. Trunchierea nu avanseaza marcajul.
   */
  if (!taiat) {
    await patchEmagConfig(admin, businessId, { catalog_citit_la: new Date().toISOString() });
  }

  /* ── 6. Produsele noi, prin conducta casei ────────────────────────────────── */
  let importId: string | null = null;
  if (produse.length > 0) {
    const { data: job, error } = await admin.from("product_imports").insert({
      business_id: businessId,
      user_id: userId,
      source: SURSA_EMAG,
      status: "importing",
      file_name: "eMAG Marketplace",
      options: { import_images: true } as never,
      started_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !job) throw new Error(error?.message ?? "Nu s-a putut deschide importul.");
    importId = (job as { id: string }).id;

    await stageProducts(admin, importId, businessId, produse, true);
    /*
     * ⚠ NU SE ASTEAPTA AICI PANA LA CAPAT. `processImport` lucreaza pe bucati, iar
     * un catalog mare ar depasi timpul functiei. Se face un pas, iar restul il duce
     * bucla din ecran sau cronul de rezerva — de aceea `emag_api` e trecut in
     * amandoua listele albe.
     */
    await processImport(admin, importId);
  }

  /* ── 7. Legarea, si sirul ridicat peste id-urile preluate ─────────────────── */
  await leagaOferteleNoi(admin, businessId);
  await ridicaSirul(admin, oferte);

  const toateProblemele = [...probleme];
  if (taiat) {
    toateProblemele.push(
      `S-au citit primele ${PAGINI_MAXIM * PE_PAGINA} de oferte. Dacă ai mai multe, ` +
      `restul nu au intrat în acest import — spune-ne, ridicăm limita. Până atunci ` +
      `publicarea produselor noi rămâne oprită: nu putem ști dacă cele necitite ` +
      `există deja în contul tău.`,
    );
  }

  return {
    ok: true,
    mesaj: mesajRaport(raport, produse.length, creeazaProduse),
    raport: { ...raport, deCreat: produse.length, disparute: disparute.length, probleme: toateProblemele },
    importId,
  };
}

/**
 * Sirul `emag_id`, ridicat peste cel mai mare id preluat.
 *
 * Id-urile facute de noi incep de la un miliard tocmai ca sa nu se incurce cu
 * numerotarile facute de mana la ei. Dar daca un comerciant chiar are oferte peste
 * prag, sirul trebuie impins deasupra lor — altfel prima oferta pe care o publicam
 * ar primi un `emag_id` deja luat, si scrierea ar cadea.
 *
 * ⚠ Nereusita NU opreste importul. E o masura de prevedere pentru publicarile
 * viitoare, nu o parte din import; aruncata, ar fi daramat un import care s-a
 * incheiat cu bine.
 */
async function ridicaSirul(admin: Admin, oferte: EmagOfertaCitita[]): Promise<void> {
  const maxim = oferte.reduce((m, o) => (o.id > m ? o.id : m), 0);
  /* ⚠ SI FAMILIILE, NU DOAR OFERTELE. Ridicat numai sirul ofertelor, prima publicare
     de dupa un import cu familii mari ar fi cerut un `family_id` deja luat, si ar fi
     cazut pe `duplicate key` fara sa spuna de ce. */
  const maximFamilie = oferte.reduce((m, o) => {
    const f = o.family?.id ?? 0;
    return f > m ? f : m;
  }, 0);
  if (maxim <= 0 && maximFamilie <= 0) return;
  try {
    await admin.rpc("emag_ridica_sirurile", { p_oferta: maxim, p_familie: maximFamilie });
  } catch (e) {
    void logError({
      action: "emag.import.sir",
      message: e instanceof Error ? e.message : "Nu s-a putut ridica șirul emag_id",
      details: { maxim, maximFamilie },
      severity: "warning",
    });
  }
}

/**
 * Categoriile de care e nevoie ca sa se stie ce desparte familiile.
 *
 * ⚠ SE CER NUMAI CELE FOLOSITE. `category/read` are peste zece mii de categorii, si
 * aduse toate ar fi insemnat sute de cereri la 3 pe secunda — adica minute intregi
 * de asteptare inaintea primului produs importat.
 */
async function aduCategoriiPentru(
  auth: Parameters<typeof citesteCategorii>[0], familii: Familie[],
): Promise<EmagCategorie[]> {
  const ids = [...new Set(familii.map((f) => f.membri[0]?.category_id).filter((x): x is number => !!x))];
  const out: EmagCategorie[] = [];
  for (const id of ids) {
    const r = await citesteCategorii(auth, { id });
    if (isEmagError(r)) continue;
    const bucata = Array.isArray(r.data) ? (r.data as EmagCategorie[]) : [];
    out.push(...bucata);
  }
  return out;
}

/**
 * Ce se scrie omului.
 *
 * ⚠ SE SPUN SI CELE NEHOTARATE, NU DOAR REUSITELE. O oferta pe care n-am putut-o
 * lega nu e o nereusita a lui, dar e un lucru pe care numai el il poate limpezi —
 * si daca nu i se spune, nu afla niciodata ca exista.
 */
function mesajRaport(r: RaportImport, deCreat: number, aCreat: boolean): string {
  const parti: string[] = [];
  if (r.legate) parti.push(`${r.legate} legate de produse existente`);
  if (aCreat && deCreat) parti.push(`${deCreat} produse noi`);
  /*
   * ⚠ CAND NU SE CREEAZA, TACEREA AR FI O MINCIUNE.
   *
   * Fara randul asta, un comerciant cu 500 de oferte din care 140 se leaga ar fi
   * citit „500 oferte citite: 140 legate” si ar fi plecat crezand ca s-a rezolvat
   * tot. Celelalte 360 exista in continuare la eMAG si n-au pereche la el — un
   * lucru pe care numai el il poate lamuri.
   *
   * Aceeasi regula ca la feedul de stocuri: verdictul se citeste din CE S-A POTRIVIT,
   * nu din cate randuri au fost citite.
   */
  if (!aCreat && r.noi) parti.push(`${r.noi} fără pereche la tine (nu s-a creat nimic)`);
  if (r.cunoscute) parti.push(`${r.cunoscute} deja cunoscute`);
  if (r.nehotarate) parti.push(`${r.nehotarate} de lămurit`);
  if (r.ocupate) parti.push(`${r.ocupate} deja legate de altă ofertă`);
  if (parti.length === 0) return `S-au citit ${r.citite} oferte de la eMAG.`;
  return `${r.citite} oferte citite: ${parti.join(", ")}.`;
}
