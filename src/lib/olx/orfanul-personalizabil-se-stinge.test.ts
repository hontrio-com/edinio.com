import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  hotarareaReconcilierii, processQueueItem, reconciliazaAnunturile,
  type OlxQueueItem, type OlxSyncContext,
} from "./sync";

/* ══════════════════════════════════════════════════════════════════════════
   ORFANUL UNUI PRODUS PERSONALIZABIL SE STINGE (06.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Poarta de personalizare pusa ieri opreste PUBLICAREA (`upsertRemote`) si „Activeaza”
   (`activateRemote`). Dar un anunt VIU la OLX si necunoscut la noi nu trece prin niciuna din ele:
   reconcilierea il ADOPTA, si dupa adoptie el ramane la vanzare pana cand ceva il resincronizeaza
   — adica pana la urmatoarea editare de pret sau de stoc, care poate sa nu vina niciodata.

   ⚠ CE COSTA: un fototapet se vinde la metru patrat si cere latimea, inaltimea si poza clientului.
   Anuntul OLX nu poate purta niciuna dintre ele, iar descrierea nu duce niciun link inapoi la
   pagina de produs — singurul loc unde formularul exista. Cu „Livrare prin OLX” pornita, comanda
   intra singura, la pretul din catalog, si nu mai are cine s-o opreasca.

   ⚠ SI TREI LUCRURI PE CARE RECONCILIEREA NU LE FACE, oricat ar cere produsul personalizare:
   nu atinge anunturile din contul LUI, nu calca peste o stergere pe care a cerut-o el, si nu
   alege singura intr-un conflict de doua anunturi. De-aia intrebarea despre personalizare vine
   ULTIMA in sirul de hotarari, si de-aia probele de mai jos o si masoara acolo.
*/

/* ── O baza falsa care TAIE COLOANELE, ca PostgREST ────────────────────────
 *
 * ⚠ TAIEREA E CHIAR ROSTUL EI. `cerePersonalizarea` citeste `page_sections`; daca reconcilierea
 * nu cere coloana, randul soseste fara ea si raspunsul e „nu” pe TOT catalogul — tacut. O baza
 * falsa care intoarce randul intreg ar fi aparat codul de propriul lui defect, si proba ar fi
 * trecut verde peste o poarta care nu se aprinde niciodata.
 */

interface Cerere { tabela: string; fel: "select" | "upsert" | "update" | ""; coloane?: string; corp?: unknown }
type Raspuns = { data?: unknown; error?: { message: string } | null };

interface Stare {
  /** Randurile din `olx_adverts` ale magazinului. */
  adverts?: Record<string, unknown>[];
  /** Randurile din `products` ale magazinului. */
  produse?: Record<string, unknown>[];
  eProduse?: string;
  eAdverts?: string;
  eUpsert?: string;
}

function taie(rand: Record<string, unknown>, coloane?: string): Record<string, unknown> {
  if (!coloane) return rand;
  const out: Record<string, unknown> = {};
  for (const c of coloane.split(",").map((s) => s.trim())) if (c in rand) out[c] = rand[c];
  return out;
}

function faceDb(stare: Stare) {
  const cereri: Cerere[] = [];
  const raspunde = (c: Cerere, unic: boolean): Raspuns => {
    if (c.fel === "upsert" || c.fel === "update") {
      return { data: null, error: stare.eUpsert ? { message: stare.eUpsert } : null };
    }
    const sursa = c.tabela === "products" ? stare.produse : stare.adverts;
    const eroare = c.tabela === "products" ? stare.eProduse : stare.eAdverts;
    if (eroare) return { data: null, error: { message: eroare } };
    const randuri = (sursa ?? []).map((r) => taie(r, c.coloane));
    return { data: unic ? (randuri[0] ?? null) : randuri, error: null };
  };
  const builder = (c: Cerere) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const b: any = {
      select: (coloane?: string) => { if (!c.fel) { c.fel = "select"; c.coloane = coloane; } return b; },
      upsert: (p: unknown) => { c.fel = "upsert"; c.corp = p; return b; },
      update: (p: unknown) => { c.fel = "update"; c.corp = p; return b; },
      eq: () => b,
      in: () => b,
      maybeSingle: () => Promise.resolve(raspunde(c, true)),
      single: () => Promise.resolve(raspunde(c, true)),
      then: (bun: (v: Raspuns) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(c, false)).then(bun, rau),
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

/* ── Reteaua catre OLX ─────────────────────────────────────────────────────
 *
 * ⚠ Se tine minte si METODA si CORPUL: „a cerut lista” e un `GET`, iar stingerea e un `POST` cu
 * `command: "deactivate"`. Fara ele, o proba n-ar putea deosebi o citire de o schimbare.
 */
interface CerereHttp { metoda: string; cale: string; corp?: unknown }

function stubFetch(raspunde: (c: CerereHttp) => { status: number; corp?: unknown }) {
  const vechi = globalThis.fetch;
  const cereri: CerereHttp[] = [];
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const c: CerereHttp = {
      metoda: init?.method ?? "GET",
      cale: String(url).replace("https://www.olx.ro/api/partner", ""),
      corp: init?.body ? JSON.parse(init.body) : undefined,
    };
    cereri.push(c);
    const r = raspunde(c);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corp ?? {},
      text: async () => JSON.stringify(r.corp ?? {}),
      headers: new Headers(),
    };
  }) as unknown as typeof fetch;
  return {
    inapoi: () => { globalThis.fetch = vechi; },
    cereri,
    urme: () => cereri.map((c) => `${c.metoda} ${c.cale}`),
  };
}

const PID = "aaaaaaaa-1111-2222-3333-444444444444";
const BID = "bbbbbbbb-5555-6666-7777-888888888888";
const LISTA = "GET /adverts?offset=0&limit=50";
const STINGEREA = "POST /adverts/4242/commands";

const CTX = {
  token: "acces-de-proba",
  config: { connected: true, category_map: { Tapet: { category_id: 9 } } },
  business: { slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL" },
  gpsr: null,
} as unknown as OlxSyncContext;

/** Fototapetul: pret pe metru patrat, si doua raspunsuri care n-au unde sa incapa intr-un anunt. */
const FOTOTAPET_PS = {
  customization: {
    enabled: true,
    fields: [
      { id: "marime", type: "dimensiuni", label: "Cat de mare", unitate: "cm", required: true },
      { id: "poza", type: "image", label: "Poza ta", required: true },
    ],
  },
};

/** Anuntul gasit in contul lor: viu, si fara rand la noi. */
const ANUNT_ORFAN = {
  id: 4242, status: "active", url: "https://www.olx.ro/d/4242", external_id: PID, valid_to: null,
};

/** Raspunsurile obisnuite: lista are un singur anunt, orice comanda reuseste. */
function reteaCuUnAnunt(anunt: Record<string, unknown> = ANUNT_ORFAN, statusComanda = 200) {
  return stubFetch((c) => (c.cale.startsWith("/adverts?")
    ? { status: 200, corp: { data: [anunt] } }
    : { status: statusComanda, corp: {} }));
}

test("⚠ un anunt orfan pe un produs personalizabil se STINGE, nu se adopta si atat", async () => {
  /*
   * ⚠ ASTA E TOATA DEOSEBIREA. Adoptat si atat, anuntul ramane ACTIV la ei: fototapetul se vinde
   * mai departe la pretul din catalog, fara dimensiuni si fara poza, si nimic nu-l mai coboara
   * pana la urmatoarea editare — care poate sa nu vina niciodata.
   */
  const stub = reteaCuUnAnunt();
  try {
    const { db, cereri } = faceDb({ adverts: [], produse: [{ id: PID, page_sections: FOTOTAPET_PS }] });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true, `reconcilierea a picat: ${JSON.stringify(r)}`);

    /* ⚠ S-a stins LA EI, nu doar s-a insemnat la noi. */
    assert.deepEqual(stub.urme(), [LISTA, STINGEREA],
      "anuntul a ramas la vanzare, sau s-a vorbit degeaba cu OLX");
    /* ⚠ Si e o STINGERE, nu o vanzare: `is_success: true` le-ar spune ca marfa s-a vandut. */
    assert.deepEqual(stub.cereri[1].corp, { command: "deactivate", is_success: false });

    /* ⚠ ...si abia dupa aceea s-a legat, ca sa existe o urma si un motiv in ecran. */
    const scris = cereri.find((c) => c.tabela === "olx_adverts" && c.fel === "upsert");
    assert.ok(scris, "anuntul stins a ramas nelegat: nimeni nu-l mai vede nicaieri");
    const corp = scris!.corp as { olx_advert_id?: number; status?: string; error?: string };
    assert.equal(corp.olx_advert_id, 4242, "legatura nu s-a scris, deci sondarea nu-l va urmari");
    assert.equal(corp.status, "error");
    assert.match(String(corp.error), /personalizare/i, "ecranul arata un anunt stins care nu spune de ce");

    /*
     * ⚠ SI O SINGURA INTEROGARE PE PRODUSE. `page_sections` se ia din citirea care exista deja;
     * o a doua cerere ar fi fost una pe FIECARE anunt din pagina, la fiecare trecere de cron.
     */
    assert.equal(cereri.filter((c) => c.tabela === "products").length, 1,
      "s-a mai facut o interogare pe produs, pe langa cea care exista");
  } finally { stub.inapoi(); }
});

test("⚠ CONTRAPROBA: orfanul unui produs obisnuit se adopta ca pana acum", async () => {
  /*
   * Fara ea, proba de sus ar trece si cu o reconciliere care stinge TOT ce gaseste — adica exact
   * paguba pe care fisierul asta o apara: anunturi vii, oprite pe o presupunere.
   */
  const stub = reteaCuUnAnunt();
  try {
    const { db, cereri } = faceDb({ adverts: [], produse: [{ id: PID, page_sections: null }] });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.adoptate, 1, "anuntul obisnuit n-a mai fost adoptat");
    assert.deepEqual(stub.urme(), [LISTA], "s-a stins un anunt care n-avea nicio personalizare");
    const corp = cereri.find((c) => c.fel === "upsert")!.corp as { status?: string; error?: unknown };
    assert.equal(corp.status, "active", "randul adoptat nu mai poarta starea lor");
    assert.equal(corp.error, null, "s-a scris un motiv pe un produs care n-are nicio vina");
  } finally { stub.inapoi(); }
});

test("⚠ CONTRAPROBA: steagul de personalizare fara niciun camp nu stinge nimic", async () => {
  /*
   * ⚠ ACEEASI INTREBARE PE AMANDOUA DRUMURILE, si ea nu e steagul.
   *
   * In productie 78 de produse poarta `customization.enabled = true`, dar numai 29 au si campuri
   * — iar `upsertRemote` le publica linistit pe celelalte 49, fiindca `cerePersonalizarea`
   * raspunde NU pe un formular gol. O intrebare pusa aici de mana, pe steag, ar fi stins tocmai
   * anunturile acelor 49: oprite de reconciliere la o trecere, publicate inapoi de prima editare
   * de pret, si asa mai departe — doua porti care se contrazic peste acelasi produs.
   */
  const stub = reteaCuUnAnunt();
  try {
    const { db, cereri } = faceDb({
      adverts: [],
      produse: [{ id: PID, page_sections: { customization: { enabled: true, fields: [] } } }],
    });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.adoptate, 1, "anuntul n-a mai fost adoptat");
    assert.deepEqual(stub.urme(), [LISTA],
      "s-a stins un anunt pe care poarta de publicare l-ar fi trimis mai departe");
    const corp = cereri.find((c) => c.fel === "upsert")!.corp as { status?: string; error?: unknown };
    assert.equal(corp.status, "active", "randul adoptat nu mai poarta starea lor");
    assert.equal(corp.error, null, "s-a scris un motiv pentru un formular care nu exista");
  } finally { stub.inapoi(); }
});

test("⚠ CADE INCHIS: daca produsele nu se pot citi, nu se stinge si nu se leaga nimic", async () => {
  /*
   * ⚠ „N-am putut citi" n-are voie sa insemne nici „n-are personalizare" (si atunci fototapetul
   * ramane la vanzare), nici „stinge-l pe banuiala" (si atunci un hop al bazei scoate din vanzare
   * anunturi bune). Pagina se lasa pentru trecerea urmatoare, iar cronul nu muta cursorul.
   */
  const stub = reteaCuUnAnunt();
  try {
    const { db, cereri } = faceDb({ adverts: [], eProduse: "conexiunea a cazut" });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, false, "s-a hotarat ceva fara sa stim ce produs e");
    assert.deepEqual(stub.urme(), [LISTA], "s-a stins un anunt despre care nu stim nimic");
    assert.ok(!cereri.some((c) => c.fel === "upsert" || c.fel === "update"),
      "s-a scris un rand pe o citire care n-a reusit");
  } finally { stub.inapoi(); }
});

test("⚠ o stingere picata lasa anuntul ORFAN, nu adoptat", async () => {
  /*
   * ⚠ AICI E ORDINEA, si ea se vede numai asa. Legat mai intai, anuntul devine „cunoscut" — iar la
   * trecerea urmatoare hotararea e „stim" si nimeni nu se mai uita la el. Adica o singura cerere
   * picata l-ar fi lasat viu la ei si linistit la noi, pe veci.
   *
   * Ramas orfan, il ia de la capat chiar reconcilierea, la roata urmatoare.
   */
  const stub = reteaCuUnAnunt(ANUNT_ORFAN, 500);
  try {
    const { db, cereri } = faceDb({ adverts: [], produse: [{ id: PID, page_sections: FOTOTAPET_PS }] });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true, "o cerere picata pe un anunt n-are voie sa opreasca pagina");
    assert.equal(r.ok === true && r.adoptate, 0);
    assert.deepEqual(stub.urme(), [LISTA, STINGEREA]);
    assert.ok(!cereri.some((c) => c.tabela === "olx_adverts" && c.fel === "upsert"),
      "anuntul s-a legat desi nu s-a stins: la trecerea urmatoare iese „stim” si nu-l mai vede nimeni");
  } finally { stub.inapoi(); }
});

test("⚠ un anunt deja stins la ei nu mai cere o comanda in plus, dar tot capata motivul", async () => {
  /*
   * ⚠ Starea de aici e a LOR, citita chiar acum din lista lor — nu una scrisa de noi. De-aia are
   * voie sa fie crezuta pe cuvant, si sa scuteasca o comanda. Poarta din `upsertRemote` n-are
   * luxul asta: acolo starea e `olx_adverts.status`, pe care il scriem chiar noi.
   */
  const stub = reteaCuUnAnunt({ ...ANUNT_ORFAN, status: "removed_by_user" });
  try {
    const { db, cereri } = faceDb({ adverts: [], produse: [{ id: PID, page_sections: FOTOTAPET_PS }] });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true);
    assert.deepEqual(stub.urme(), [LISTA], "s-a cerut o stingere pentru un anunt deja stins");
    const corp = cereri.find((c) => c.fel === "upsert")!.corp as { status?: string; error?: string };
    assert.equal(corp.status, "error");
    assert.match(String(corp.error), /personalizare/i, "randul tace despre motivul pentru care sta stins");
  } finally { stub.inapoi(); }
});

test("⚠ un anunt caruia nu-i stim starea se STINGE, nu se crede mort pe tacere", async () => {
  /*
   * ⚠ SE SARE PESTE STINGERE NUMAI CAND STIM CA E STINS, nu cand nu stim ca e viu. E aceeasi
   * regula ca la poarta din `upsertRemote`, scrisa acolo dupa un defect adevarat, si aici se
   * masoara pe cazul in care starea LIPSESTE cu totul din lista lor — sau, maine, e una pe care
   * ei o adauga si noi n-o cunoastem inca.
   *
   * ⚠ CE COSTA CITITA PE DOS: „nu e in lista celor vii, deci e stins" ar fi lasat anuntul la
   * vanzare cu un motiv scris pe randul local — si nimeni nu s-ar mai fi uitat la el, fiindca
   * legat o data devine „cunoscut", iar a doua trecere iese „stim". `stingeLaEi` costa o cerere pe
   * o stare nelamurita, si confirma din starea LOR.
   */
  const faraStare: Record<string, unknown> = { ...ANUNT_ORFAN };
  delete faraStare.status;
  const stub = reteaCuUnAnunt(faraStare);
  try {
    const { db, cereri } = faceDb({ adverts: [], produse: [{ id: PID, page_sections: FOTOTAPET_PS }] });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true);
    assert.deepEqual(stub.urme(), [LISTA, STINGEREA],
      "o stare pe care n-o cunoastem a fost citita ca „e deja stins”");
    const corp = cereri.find((c) => c.fel === "upsert")!.corp as { status?: string; error?: string };
    assert.equal(corp.status, "error");
    assert.match(String(corp.error), /personalizare/i);
  } finally { stub.inapoi(); }
});

test("⚠ ce a sters omul NU se stinge, oricat ar cere produsul personalizare", async () => {
  /*
   * ⚠ Ca anuntul sa fie viu la ei desi omul l-a sters de la noi inseamna doar ca stergerea n-a mers
   * pana la capat — nu ca s-a razgandit. Personalizarea nu e o portita prin care sa ne apucam noi
   * de anunturi peste hotararea lui: aici nu se atinge nimic, se scrie in jurnal si atat.
   */
  const stub = reteaCuUnAnunt();
  try {
    const { db, cereri } = faceDb({
      adverts: [{ id: "r1", offer_id: PID, olx_advert_id: null, sters_de_om_la: "2026-09-01T10:00:00Z" }],
      produse: [{ id: PID, page_sections: FOTOTAPET_PS }],
    });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true);
    assert.deepEqual(stub.urme(), [LISTA], "s-a stins un anunt peste o hotarare de stergere a omului");
    assert.ok(!cereri.some((c) => c.fel === "upsert" || c.fel === "update"),
      "s-a rescris un rand pe care reconcilierea il lasa neatins");
  } finally { stub.inapoi(); }
});

test("⚠ intr-un conflict de doua anunturi nu alege personalizarea, ci tot omul", async () => {
  /*
   * Produsul are deja alt anunt legat. Care dintre ele se pastreaza nu poate hotari un cron — unul
   * are istoric, mesaje, poate si o vanzare in curs — si o stingere „fiindca oricum nu se putea
   * publica" ar fi chiar alegerea pe care n-avem voie s-o facem.
   */
  const stub = reteaCuUnAnunt();
  try {
    const { db, cereri } = faceDb({
      adverts: [{ id: "r1", offer_id: PID, olx_advert_id: 5555, sters_de_om_la: null }],
      produse: [{ id: PID, page_sections: FOTOTAPET_PS }],
    });
    const r = await reconciliazaAnunturile(db, CTX, BID, 0);
    assert.equal(r.ok, true);
    assert.deepEqual(stub.urme(), [LISTA], "cronul a ales singur intr-un conflict de doua anunturi");
    assert.ok(!cereri.some((c) => c.fel === "upsert" || c.fel === "update"));
  } finally { stub.inapoi(); }
});

test("⚠ ordinea hotararilor: personalizarea vine ULTIMA, dupa toate cele patru porti", () => {
  /*
   * ⚠ Fiecare pas de mai devreme e o poarta inchisa pentru cel de dupa. Mutata mai sus, aceeasi
   * intrebare ar fi stins un anunt din contul LUI, ar fi calcat peste o stergere ceruta de el, sau
   * ar fi ales singura intr-un conflict. Probele de purtare de mai sus masoara acelasi lucru prin
   * retea; asta il masoara direct, si spune care e regula.
   */
  const CERE = { advertId: 77, eAlNostru: true, cunoscut: false, cerePersonalizare: true };
  assert.deepEqual(hotarareaReconcilierii({ ...CERE, cunoscut: true }), { fel: "stim" });
  assert.deepEqual(hotarareaReconcilierii({ ...CERE, eAlNostru: false }), { fel: "nu-e-al-nostru" });
  assert.deepEqual(
    hotarareaReconcilierii({ ...CERE, randul: { olx_advert_id: null, sters_de_om_la: "2026-09-01T10:00:00Z" } }),
    { fel: "sters-de-om" },
  );
  assert.deepEqual(
    hotarareaReconcilierii({ ...CERE, randul: { olx_advert_id: 55, sters_de_om_la: null } }),
    { fel: "duplicat", legat: 55 },
  );
  /* Si abia cand toate patru au trecut: se stinge. */
  assert.deepEqual(hotarareaReconcilierii(CERE), { fel: "stinge" });
  /* ⚠ Iar fara personalizare ramane exact ce era: se leaga. */
  assert.deepEqual(hotarareaReconcilierii({ ...CERE, cerePersonalizare: false }), { fel: "leaga" });
});

test("⚠ motivul scris de reconciliere e ACELASI text ca la publicare", async () => {
  /*
   * ⚠ DOUA EXPLICATII PENTRU ACELASI REFUZ, pe acelasi produs, ar fi facut comerciantul sa creada
   * ca sunt doua defecte. Textul e o singura constanta in `sync.ts`; proba asta il cere prin cele
   * doua drumuri deosebite si le pune fata in fata, ca sa nu se poata desparti pe tacute.
   */
  const stub = reteaCuUnAnunt();
  let scrisDeReconciliere = "";
  try {
    const { db, cereri } = faceDb({ adverts: [], produse: [{ id: PID, page_sections: FOTOTAPET_PS }] });
    await reconciliazaAnunturile(db, CTX, BID, 0);
    scrisDeReconciliere = String((cereri.find((c) => c.fel === "upsert")!.corp as { error?: string }).error);
  } finally { stub.inapoi(); }
  assert.match(scrisDeReconciliere, /personalizare/i);

  const stub2 = stubFetch(() => ({ status: 200, corp: {} }));
  try {
    const { db } = faceDb({ adverts: [], produse: [] });
    const lucrare: OlxQueueItem = {
      id: "coada-1", business_id: BID, product_id: PID, offer_id: PID,
      op: "upsert", attempts: 0, created_at: new Date().toISOString(),
    };
    const r = await processQueueItem(db, CTX, lucrare, {
      id: PID, name: "Fototapet", slug: "fototapet", description: "", price: 120,
      compare_at_price: null, images: [], category: "Tapet", is_active: true,
      track_inventory: false, stock_quantity: null, page_sections: FOTOTAPET_PS,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.error, scrisDeReconciliere,
      "poarta de publicare si reconcilierea spun doua lucruri deosebite despre acelasi produs");
  } finally { stub2.inapoi(); }
});
