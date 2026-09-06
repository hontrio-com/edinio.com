import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { processQueueItem, type OlxQueueItem, type OlxSyncContext } from "./sync";

/* ══════════════════════════════════════════════════════════════════════════
   PERSONALIZAREA NU PLEACA PE OLX (06.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `upsertRemote` avea cinci porti inainte de trimitere — produs disparut, anunt sters de om,
   conflict, produs nevandabil, categorie nemapata — si niciuna despre personalizare. Tot
   directorul `src/lib/olx/` nu stia ca ea exista: nicio potrivire in douazeci si cinci de fisiere.

   ⚠ CE COSTA: o cana cu gravura are 89 de lei in catalog si 109 cu suplimentul. `toOlxAdvertBody`
   pretuieste din `products.price`, deci anuntul cerea 89 pentru o marfa de 109 — si nu purta
   nicaieri intrebarea „ce sa gravam?", fiindca formularul traieste numai pe pagina de produs, iar
   cumparatorul de pe OLX nu trece pe acolo. Cu „Livrare prin OLX" pornita, comanda intra singura.

   Aceeasi hotarare exista deja la eMAG (`emag/pregatire.ts`) si la Trendyol (`trendyol/sync.ts`).

   ⚠ DOUA FELURI DE PROBA, dinadins. Cele care CHEAMA codul spun ce se intampla cu un anunt viu;
   cea care CITESTE sursa spune unde sta poarta — fiindca locul ei (inainte de `toOlxAdvertBody`)
   e chiar tot rostul, si o poarta mutata mai jos ar trece de probele de purtare cu anuntul deja
   construit. Si tot citirea sursei apara coloana din care poarta se hraneste: fara `page_sections`
   in `PRODUCT_FIELDS`, `cerePersonalizarea` ar raspunde „nu" pe TOATE produsele, tacut.
*/

/* ── O baza falsa, cat sa raspunda la lantul lui supabase-js ──────────────── */

interface Cerere { tabela: string; fel: "select" | "update" | "upsert" | ""; corp?: unknown }
type Raspuns = { data?: unknown; error?: { message: string } | null };

function faceDb(raspunde: (c: Cerere) => Raspuns) {
  const cereri: Cerere[] = [];
  const builder = (c: Cerere) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const b: any = {
      select: () => { if (!c.fel) c.fel = "select"; return b; },
      update: (p: unknown) => { c.fel = "update"; c.corp = p; return b; },
      upsert: (p: unknown) => { c.fel = "upsert"; c.corp = p; return b; },
      eq: () => b,
      in: () => b,
      not: () => b,
      is: () => b,
      or: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(raspunde(c)),
      single: () => Promise.resolve(raspunde(c)),
      then: (bun: (v: Raspuns) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(c)).then(bun, rau),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return b;
  };
  const db = {
    from: (tabela: string) => {
      const c: Cerere = { tabela, fel: "" };
      cereri.push(c);
      return builder(c);
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, cereri };
}

/** ⚠ Se tine minte si METODA, nu doar adresa: „a plecat corpul anuntului?" e un `PUT`, iar
    stingerea e un `POST` pe aceeasi radacina. Fara metoda, cele doua nu se pot deosebi. */
function stubFetch(raspunsuri: { status: number; corp: unknown }[]) {
  const vechi = globalThis.fetch;
  const cereri: string[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init?: { method?: string }) => {
    cereri.push(`${init?.method ?? "GET"} ${String(url)}`);
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)] ?? { status: 200, corp: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corp,
      text: async () => JSON.stringify(r.corp),
      headers: new Headers(),
    };
  }) as unknown as typeof fetch;
  return { inapoi: () => { globalThis.fetch = vechi; }, cereri };
}

const PID = "11111111-2222-3333-4444-555555555555";
const BID = "99999999-8888-7777-6666-555555555555";

const CTX = {
  token: "acces-de-proba",
  config: { connected: true, category_map: { Cani: { category_id: 9 } } },
  business: { slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL" },
  gpsr: null,
} as unknown as OlxSyncContext;

const LUCRARE: OlxQueueItem = {
  id: "coada-1", business_id: BID, product_id: PID, offer_id: PID,
  op: "upsert", attempts: 0, created_at: new Date().toISOString(),
};

/** Cana obisnuita: 89 de lei, fara nimic de intrebat. */
const CANA_SIMPLA = {
  id: PID, name: "Cana", slug: "cana", description: "", price: 89, compare_at_price: null,
  images: [], category: "Cani", is_active: true, track_inventory: false, stock_quantity: null,
  page_sections: null as unknown,
};

/** Aceeasi cana, dar cu gravura: pretul adevarat e 109, si intrebarea n-are unde sa incapa. */
const CANA_CU_GRAVURA = {
  ...CANA_SIMPLA,
  page_sections: {
    customization: {
      enabled: true,
      fields: [{ id: "gravura", type: "text", label: "Ce sa gravam", required: true }],
    },
  },
};

const RAND_CU_ANUNT_VIU = {
  id: "r1", olx_advert_id: 4242, status: "active", offer_id: PID,
  sters_de_om_la: null, dezactivat_de: null, conflict_la: null, conflict_iduri: null,
};

test("⚠ produsul personalizabil NU pleaca la OLX, si refuzul e definitiv", async () => {
  /*
   * ⚠ `permanent: true` nu e o subtilitate: fara el, coada reincearca de cinci ori si abandoneaza
   * lucrarea cu un mesaj care nu spune nimic — patru cereri degeaba catre ei, si un motiv pierdut.
   */
  const stub = stubFetch([{ status: 200, corp: {} }]);
  try {
    const { db, cereri } = faceDb(() => ({ data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, CANA_CU_GRAVURA);
    assert.equal(r.ok, false, "produsul personalizabil a trecut de poarta");
    assert.equal(r.ok === false && r.permanent, true, "coada il va reincerca de cinci ori degeaba");
    assert.match(r.ok === false ? r.error : "", /personalizare/i, "motivul nu spune comerciantului ce sa faca");
    /* ⚠ SI NIMIC NU S-A DUS LA EI. Un anunt creat si apoi „refuzat" ar fi tot un anunt la vanzare. */
    assert.deepEqual(stub.cereri, [], `s-a vorbit cu OLX: ${stub.cereri.join(", ")}`);
    /* ⚠ Fara rand local nu se scrie niciun rand de eroare: coada se umple cu TOATE produsele
       magazinului, deci un raft de fototapete ar fi umplut ecranul cu erori pentru produse pe care
       nimeni n-a cerut sa fie publicate. */
    assert.ok(!cereri.some((c) => c.fel === "upsert" || c.fel === "update"),
      "s-a scris un rand de eroare pentru un produs pe care nimeni nu l-a publicat");
  } finally { stub.inapoi(); }
});

test("⚠ anuntul DEJA publicat se stinge, nu ramane la vanzare cu pretul gresit", async () => {
  /*
   * ⚠ ASTA E TOATA DEOSEBIREA FATA DE UN SIMPLU REFUZ. Un motiv scris pe randul local nu opreste
   * un anunt viu: cana s-ar fi vandut mai departe la 89 de lei, fara gravura, exact cat tine
   * defectul. Se stinge intai la ei, si abia apoi se scrie motivul.
   */
  const stub = stubFetch([{ status: 200, corp: {} }]);
  try {
    const { db, cereri } = faceDb((c) => (c.tabela === "olx_adverts" && c.fel === "select"
      ? { data: RAND_CU_ANUNT_VIU, error: null }
      : { data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, CANA_CU_GRAVURA);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.permanent, true);
    /* ⚠ S-a stins — si NUMAI atat: corpul anuntului n-a plecat nicaieri. */
    assert.deepEqual(stub.cereri, ["POST https://www.olx.ro/api/partner/adverts/4242/commands"]);
    assert.ok(!stub.cereri.some((u) => u.startsWith("PUT ")), "corpul anuntului a plecat totusi la ei");
    /* ⚠ Si motivul e scris pe rand, altfel ecranul arata un produs care tace. */
    const scris = cereri.find((c) => c.fel === "upsert" && c.tabela === "olx_adverts");
    assert.ok(scris, "motivul nu s-a scris nicaieri");
    const corp = scris!.corp as { status?: string; error?: string };
    assert.equal(corp.status, "error");
    assert.match(String(corp.error), /personalizare/i);
  } finally { stub.inapoi(); }
});

test("⚠ si un rand pe „error” peste un anunt VIU se stinge, nu se crede pe cuvant", async () => {
  /*
   * ⚠ STAREA NOASTRA NU E STAREA LOR. `saveError` scrie `status: "error"` si NU atinge
   * `olx_advert_id` — deci un anunt care e ACTIV la ei poate purta la noi eticheta „error":
   *
   *     anuntul e activ; un `PUT` pica definitiv (atribut refuzat, moderare)
   *     -> randul ramane cu `olx_advert_id`, dar cu `status: "error"`
   *     comerciantul porneste personalizarea
   *     -> daca poarta cere „e viu la noi?", raspunsul e NU, si anuntul ramane la vanzare
   *     -> iar refuzul e `permanent`, deci nimic nu-l mai reia
   *
   * Se intreaba, deci: `stingeLaEi` confirma din starea LOR, si un `400` „deja inactiv" e ieftin.
   */
  const stub = stubFetch([{ status: 200, corp: {} }]);
  try {
    const { db } = faceDb((c) => (c.tabela === "olx_adverts" && c.fel === "select"
      ? { data: { ...RAND_CU_ANUNT_VIU, status: "error" }, error: null }
      : { data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, CANA_CU_GRAVURA);
    assert.equal(r.ok, false);
    assert.deepEqual(stub.cereri, ["POST https://www.olx.ro/api/partner/adverts/4242/commands"],
      "anuntul a ramas la vanzare fiindca randul nostru spunea altceva");
  } finally { stub.inapoi(); }
});

test("⚠ CONTRAPROBA: cana fara gravura pleaca mai departe, ca pana acum", async () => {
  /*
   * Fara ea, probele de sus ar trece si cu o poarta care opreste ORICE produs — adica cu o
   * integrare stinsa cu totul.
   */
  const stub = stubFetch([{ status: 200, corp: { data: { id: 4242, status: "active" } } }]);
  try {
    const { db } = faceDb((c) => (c.tabela === "olx_adverts" && c.fel === "select"
      ? { data: RAND_CU_ANUNT_VIU, error: null }
      : { data: null, error: null }));
    const r = await processQueueItem(db, CTX, LUCRARE, CANA_SIMPLA);
    assert.equal(r.ok, true, `produsul obisnuit a fost oprit: ${JSON.stringify(r)}`);
    assert.deepEqual(stub.cereri, ["PUT https://www.olx.ro/api/partner/adverts/4242"]);
  } finally { stub.inapoi(); }
});

test("⚠ poarta sta INAINTEA corpului de anunt, si se hraneste dintr-o coloana care chiar se citeste", () => {
  /*
   * ⚠ O poarta pusa dupa `toOlxAdvertBody` ar fi trecut de probele de purtare de mai sus — anuntul
   * e construit, dar nu trimis — si ar fi cazut la prima mutare a codului. Locul ei e regula.
   */
  const sursa = readFileSync("src/lib/olx/sync.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(sursa, /import \{ cerePersonalizarea \} from "@\/lib\/customization\/definitie";/,
    "intrebarea despre personalizare trebuie sa aiba UN raspuns, cel din modulul pur");

  const iVandabil = sursa.indexOf("if (!isProductSellable(product)) {");
  const iPoarta = sursa.indexOf("if (cerePersonalizarea(product.page_sections)) {");
  const iCategorie = sursa.indexOf("const entry = product.category ? ctx.config.category_map");
  const iCorp = sursa.indexOf("toOlxAdvertBody(ctx.business, product");
  assert.ok(iPoarta > 0, "poarta de personalizare a disparut din `upsertRemote`");
  assert.ok(iVandabil > 0 && iPoarta > iVandabil, "poarta vine INAINTEA celei de nevandabil");
  assert.ok(iCategorie > iPoarta, "poarta vine DUPA rezolvarea categoriei");
  assert.ok(iCorp > iPoarta, "corpul anuntului se construieste INAINTEA portii");

  /*
   * ⚠ COLOANA. `cerePersonalizarea` citeste `page_sections`; daca ea lipseste din citirea
   * produsului, raspunsul e „nu" pe TOATE produsele si poarta ramane scrisa degeaba — felul de
   * reparatie care arata facuta. Amandoua caile catre `upsertRemote` citesc `PRODUCT_FIELDS`.
   */
  const lista = /export const PRODUCT_FIELDS =\s*\n?\s*"([^"]+)"/.exec(sursa);
  assert.ok(lista, "`PRODUCT_FIELDS` nu se mai citeste ca un sir");
  assert.ok(lista![1].split(",").map((s) => s.trim()).includes("page_sections"),
    "page_sections nu se mai citeste: poarta ar raspunde NU pe toate produsele");

  /* ⚠ Si oprirea chiar OPRESTE: fara `return`, poarta ar fi doar un rand scris pe rand. */
  const corpPortii = sursa.slice(iPoarta, iCategorie);
  assert.match(corpPortii, /return \{ ok: false, permanent: true, error: motiv \};/,
    "poarta scrie motivul, dar lasa publicarea sa mearga mai departe");
  /* ⚠ Si anuntul viu se stinge la ei, nu doar se insemneaza la noi. */
  assert.match(corpPortii, /await stingeLaEi\(ctx, row\.olx_advert_id\)/,
    "anuntul deja publicat ramane la vanzare cu pretul de catalog");
});

/* ══════════════════════════════════════════════════════════════════════════
   A DOUA USA: „ACTIVEAZA" (06.09.2026, la revizuire)
   ══════════════════════════════════════════════════════════════════════════

   Poarta de mai sus opreste PUBLICAREA. Dar drumul catre acelasi capat — un anunt viu la OLX
   pentru un produs care cere date de la cumparator — mai avea o usa, si chiar poarta o deschidea:

       poarta stinge anuntul la ei si scrie `status: "error"`
       sondarea (din doua in doua ore) citeste starea LOR: `removed_by_user`
       ecranul arata butonul „Activeaza” (`canActivate`, in `OlxClient`)
       omul apasa -> `activateOlxProduct` -> `activateProductNow` -> `activateRemote`
       -> anuntul se aprinde iar, la pretul de catalog, si nimic nu-l mai coboara pana la
          urmatoarea editare de pret sau de stoc

   Paza sta acum in `activateRemote`, adica pe amandoua drumurile care aprind un anunt: apasarea
   din ecran si lucrarea `op: "activate"` din coada. Probele de mai jos trec prin coada, fiindca
   `processQueueItem` e capatul prin care se poate chema codul adevarat fara retea.
*/

/** Randul asa cum arata DUPA ce poarta a stins anuntul si sondarea a citit starea lor. */
const RAND_STINS = { ...RAND_CU_ANUNT_VIU, status: "removed_by_user" };

/** Baza care raspunde cu un rand de anunt si cu un produs anume. */
function dbCuProdus(rand: Record<string, unknown>, produs: unknown, ePicat = false) {
  return faceDb((c) => {
    if (c.tabela === "olx_adverts" && c.fel === "select") return { data: rand, error: null };
    if (c.tabela === "products") {
      return ePicat ? { data: null, error: { message: "conexiunea a cazut" } } : { data: produs, error: null };
    }
    return { data: null, error: null };
  });
}

test("⚠ „Activeaza” NU aprinde anuntul unui produs personalizabil", async () => {
  const stub = stubFetch([{ status: 200, corp: {} }]);
  try {
    /* ⚠ Lucrarea vine cu produsul GOL dinadins: poarta de aici nu-l primeste in mana, il citeste
       chiar ea din baza. Daca s-ar sprijini pe ce i se da, apasarea din ecran ar ocoli-o. */
    const { db, cereri } = dbCuProdus(RAND_STINS, { page_sections: CANA_CU_GRAVURA.page_sections });
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "activate" }, null);
    assert.equal(r.ok, false, "anuntul unui produs personalizabil s-a aprins la loc");
    assert.equal(r.ok === false && r.permanent, true, "refuzul se reincearca de cinci ori degeaba");
    assert.match(r.ok === false ? r.error : "", /personalizare/i);
    assert.deepEqual(stub.cereri, [], `s-a vorbit cu OLX: ${stub.cereri.join(", ")}`);
    /* ⚠ Si nu se scrie o stare pe care n-am cerut-o: randul ramane cum era. */
    assert.ok(!cereri.some((c) => c.fel === "update" || c.fel === "upsert"),
      "s-a scris o stare pentru o activare care n-a avut loc");
  } finally { stub.inapoi(); }
});

test("⚠ CONTRAPROBA: „Activeaza” pe o cana obisnuita aprinde anuntul, ca pana acum", async () => {
  /* Fara ea, proba de sus ar trece si cu un `activateRemote` care refuza ORICE — adica cu butonul
     „Activeaza” stricat pentru tot catalogul. */
  const stub = stubFetch([{ status: 200, corp: {} }]);
  try {
    const { db } = dbCuProdus(RAND_STINS, { page_sections: null });
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "activate" }, null);
    assert.equal(r.ok, true, `anuntul obisnuit nu s-a mai aprins: ${JSON.stringify(r)}`);
    assert.deepEqual(stub.cereri, ["POST https://www.olx.ro/api/partner/adverts/4242/commands"]);
  } finally { stub.inapoi(); }
});

test("⚠ daca produsul nu se poate CITI, anuntul nu se aprinde pe o presupunere", async () => {
  /*
   * ⚠ „N-am putut citi" nu inseamna „n-are personalizare". Citit pe dos, un hop al bazei ar fi
   * aprins exact anuntul pe care poarta il stinsese — si tocmai pe drumul pe care omul apasa un
   * buton si primeste „Anunt activat.”.
   *
   * ⚠ Si refuzul e TEMPORAR: lucrarea se reia, nu se arunca din coada.
   */
  const stub = stubFetch([{ status: 200, corp: {} }]);
  try {
    const { db } = dbCuProdus(RAND_STINS, null, true);
    const r = await processQueueItem(db, CTX, { ...LUCRARE, op: "activate" }, null);
    assert.equal(r.ok, false, "s-a aprins fara sa stim ce produs e");
    assert.equal(r.ok === false && r.permanent, false, "un hop al bazei nu e un refuz definitiv");
    assert.deepEqual(stub.cereri, [], `s-a vorbit cu OLX: ${stub.cereri.join(", ")}`);
  } finally { stub.inapoi(); }
});
