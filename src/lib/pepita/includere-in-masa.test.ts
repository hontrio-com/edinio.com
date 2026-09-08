import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { readFileSync } from "node:fs";
import { includeToateActive, PAGINA, PE_TRECERE } from "./includere-in-masa";

const BID = "11111111-1111-1111-1111-111111111111";
const ACUM = "2026-09-08T10:00:00.000Z";

/* ══════════════════════════════════════════════════════════════════════════
   O BAZA FALSA CARE CHIAR SE PLIMBA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Schela din `feed.test.ts` nu se putea folosi aici: acolo `limit` e no-op si `.gt` nu
   exista deloc, deci o proba scrisa pe ea ar fi fost verde SI peste codul de azi, SI peste
   cel de maine. Asta implementeaza `order`, `limit`, `gt` SI `range`, ca sa poata deosebi
   plimbarea pe cheie de cea pe offset. Fara `range`, mutantul „inapoi la offset" n-ar putea
   fi pus, iar proba ar apara o regula pe care nimeni n-o poate incalca.
*/
function faceBaza(opt: {
  produse: string[];
  /** Chemata dupa fiecare citire, ca sa se poata simula un import care ruleaza in acelasi timp. */
  laCitire?: (produse: string[], aCata: number) => void;
  scriereaCade?: boolean;
}) {
  /*
   * ⚠ TINUTE NESORTATE DINADINS. Sortate la constructie, ordonarea din cod ar fi fost o
   * presupunere: `.order("id")` sters n-ar fi schimbat nimic in probe, iar in Postgres o
   * plimbare pe cheie fara `order by` primeste pagini in ce ordine vrea planificatorul, deci
   * cursorul poate merge inapoi si bucla nu se mai termina niciodata.
   */
  const produse = [...opt.produse].reverse();
  const scrise: Record<string, unknown>[] = [];
  const cheiScrise = new Set<string>();
  /** Listarile care exista deja in baza falsa, ca la a doua apasare sa se vada ce se sare. */
  const listari = new Map<string, boolean>();
  let citiri = 0;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (tabela: string) => {
    let dupa: string | null = null;
    let cate: number | null = null;
    let interval: [number, number] | null = null;
    let ordonat = false;
    let dela: string | null = null;
    let panala: string | null = null;
    const filtre: [string, unknown][] = [];
    const b: any = {
      select: () => b,
      /* ⚠ Filtreaza CU ADEVARAT: cu `eq` no-op, un `.eq("business_id", …)` sters ar fi scris
         `inclus: true` peste produsele ALTOR magazine si nicio proba n-ar fi clipit. */
      eq: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      order: (k: string) => { if (k === "id") ordonat = true; return b; },
      limit: (n: number) => { cate = n; return b; },
      gt: (_k: string, v: string) => { dupa = v; return b; },
      gte: (_k: string, v: string) => { dela = v; return b; },
      lte: (_k: string, v: string) => { panala = v; return b; },
      range: (a: number, c: number) => { interval = [a, c]; return b; },
      upsert: (randuri: Record<string, unknown>[], optiuni?: { onConflict?: string }) => {
        if (opt.scriereaCade) return Promise.resolve({ error: { message: "scrierea a cazut" } });
        /*
         * ⚠ CELE DOUA UNICURI ALE TABELEI, ca in productie: cheia primara pe `id` si un unic
         * pe (business_id, product_id). Fara `onConflict`, PostgREST rezolva pe cheia primara,
         * randurile capata id-uri noi si lovesc unicul: 23505 pe toata pagina.
         */
        if (optiuni?.onConflict !== "business_id,product_id") {
          for (const r of randuri) {
            const cheie = `${r.business_id}::${r.product_id}`;
            if (cheiScrise.has(cheie)) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate key value violates unique constraint" } });
            }
          }
        }
        for (const r of randuri) {
          cheiScrise.add(`${r.business_id}::${r.product_id}`);
          listari.set(String(r.product_id), r.inclus === true);
        }
        scrise.push(...randuri);
        return Promise.resolve({ error: null });
      },
      then: (bun: (v: unknown) => unknown, rau?: (e: unknown) => unknown) => {
        if (tabela === "pepita_listari") {
          const randuri = [...listari.entries()]
            .filter(([id]) => (dela === null || id >= dela) && (panala === null || id <= panala))
            .map(([product_id, inclus]) => ({ product_id, inclus }));
          return Promise.resolve({ data: randuri, error: null }).then(bun, rau);
        }
        if (tabela !== "products") return Promise.resolve({ data: [], error: null }).then(bun, rau);
        const f = (k: string) => filtre.find((x) => x[0] === k)?.[1];
        /* Filtrele lipsa nu mai aduc nimic: asa se vede daca s-au sters. */
        if (f("business_id") !== BID || f("is_active") !== true) {
          return Promise.resolve({ data: [], error: null }).then(bun, rau);
        }
        let r = ordonat ? [...produse].sort() : produse;
        if (dupa !== null) r = r.filter((id) => id > (dupa as string));
        if (interval) r = r.slice(interval[0], interval[1] + 1);
        if (cate !== null) r = r.slice(0, cate);
        citiri += 1;
        opt.laCitire?.(produse, citiri);
        return Promise.resolve({ data: r.map((id) => ({ id })), error: null }).then(bun, rau);
      },
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = {
    from: (t: string) => builder(t),
    /* Ajutor de proba: scoate un produs din feed, ca la o apasare pe „scoate" din panou. */
    __scoate: (id: string) => listari.set(id, false),
  } as unknown as SupabaseClient<Database>;
  return { db, scrise, citiri: () => citiri };
}

const idProdus = (n: number) => `p${String(n).padStart(6, "0")}`;

test("toate inseamna toate: si peste plafonul unei pagini", async () => {
  const produse = Array.from({ length: 1200 }, (_, i) => idProdus(i));
  const { db, scrise, citiri } = faceBaza({ produse });

  const r = await includeToateActive(db, BID, null, ACUM);

  assert.equal(r.scrise, 1200);
  assert.equal(r.incomplet, false);
  assert.deepEqual(scrise.map((x) => x.product_id).sort(), [...produse].sort());
  /* O pagina neplina opreste plimbarea: nicio citire in plus, despre care se stie ca vine goala. */
  assert.equal(citiri(), Math.ceil(1200 / PAGINA), "s-a mai facut o citire dupa ultima pagina");
});

test("⚠ un produs inserat in timpul plimbarii nu SARE niciun produs vechi", async () => {
  /*
   * ⚠ ASTA E CHIAR MOTIVUL PLIMBARII PE CHEIE. `products.id` e uuid aleator, iar offsetul
   * numara randurile DUPA ordonare: un import care insereaza in acelasi timp un id mai mic
   * decat cel la care am ajuns imping toate randurile cu o pozitie, si unul se pierde.
   * Cu offset, proba asta cade; cu cheie, trece.
   */
  const produse = Array.from({ length: 1200 }, (_, i) => idProdus(i * 2 + 1));
  const { db, scrise } = faceBaza({
    produse,
    laCitire: (p, aCata) => { if (aCata === 1) p.unshift(idProdus(0)); },
  });

  await includeToateActive(db, BID, null, ACUM);

  const puse = new Set(scrise.map((x) => x.product_id as string));
  for (const id of produse) assert.ok(puse.has(id), `produsul ${id} a fost sarit`);
});

test("⚠ plafonul de trecere SPUNE ca s-a oprit, si de unde se reia", async () => {
  const produse = Array.from({ length: PE_TRECERE + 600 }, (_, i) => idProdus(i));
  const { db, scrise } = faceBaza({ produse });

  const unu = await includeToateActive(db, BID, null, ACUM);
  assert.equal(unu.scrise, PE_TRECERE);
  assert.equal(unu.incomplet, true, "plafonul atins si nespus e chiar defectul");
  assert.ok(unu.dupa, "s-a oprit fara sa spuna de unde se reia");

  const doi = await includeToateActive(db, BID, unu.dupa, ACUM);
  assert.equal(doi.scrise, 600);
  assert.equal(doi.incomplet, false);

  const puse = new Set(scrise.map((x) => x.product_id as string));
  assert.equal(puse.size, produse.length, "reluarea a sarit sau a repetat produse");
});

test("⚠ o scriere cazuta ARUNCA, si nu se numara ca reusita", async () => {
  const { db } = faceBaza({ produse: [idProdus(1), idProdus(2)], scriereaCade: true });
  await assert.rejects(() => includeToateActive(db, BID, null, ACUM));
});

test("⚠ sarcina scrisa e exact atat: un camp in plus ar sterge reglajele de mana", async () => {
  const { db, scrise } = faceBaza({ produse: [idProdus(1)] });
  await includeToateActive(db, BID, null, ACUM);
  assert.deepEqual(Object.keys(scrise[0]).sort(), ["actualizat_la", "business_id", "inclus", "product_id"]);
  assert.equal(scrise[0].inclus, true);
  assert.equal(scrise[0].actualizat_la, ACUM);
});

/* ══════════════════════════════════════════════════════════════════════════
   CINE SCRIE O LISTARE ii STAMPILEAZA SI CLIPA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ `<LastMod>` din feedul de produse ia in seama si `pepita_listari.actualizat_la`: e singurul
   semn ca s-a schimbat un reglaj PER PRODUS (pret propriu, stoc de siguranta, includere).
   Cei doi scriitori de azi il pun cu mana, si o fac corect. Dar asta e o intelegere intre
   oameni, nu o regula: ecranul care va scrie `pret_override` per produs inca nu exista, iar
   primul care uita cele doua cuvinte ar INGHETA timpul exact pe randurile pentru care el
   conteaza, iar Pepita ar vedea o data veche pe un produs al carui pret tocmai s-a schimbat.

   ⚠ CE APARA PLASA, SI CE NU. Scaneaza sursa, deci spune ca fiecare scriere numeste campul,
   nu ca valoarea scrisa e cea buna. Regula deplina ar fi un declansator in baza, cu
   `when (old.* is distinct from new.*)`, ca la `aboutyou_marcheaza_listarea`. Nu e livrat aici
   fiindca cere aplicarea migratiei in productie SI regenerarea baseline-ului, altfel poarta de
   CI „Baseline-ul acopera toate migratiile" cade la primul push.
*/

test("⚠ orice scriere in `pepita_listari` pune si `actualizat_la`", () => {
  const fisiere = ["src/lib/pepita/includere-in-masa.ts", "src/lib/actions/pepita.actions.ts"];
  let scrieri = 0;
  for (const f of fisiere) {
    const linii = readFileSync(f, "utf8").split(/\r?\n/);
    linii.forEach((l, i) => {
      if (!l.includes('from("pepita_listari")')) return;
      if (!/\.upsert\(|\.update\(|\.insert\(/.test(linii.slice(i, i + 4).join(" "))) return;
      scrieri += 1;
      const bucata = linii.slice(i, i + 12).join(" ");
      assert.match(bucata, /actualizat_la/, `${f}:${i + 1} scrie o listare fara sa-i stampileze clipa`);
    });
  }
  assert.ok(scrieri >= 2, `gasite doar ${scrieri} scrieri: plasa n-are pe cine cadea`);
});

test("⚠ a doua apasare peste acelasi catalog nu cade: upsertul are TINTA de conflict", () => {
  /*
   * `pepita_listari` are cheia primara pe `id` SI un unic pe (business_id, product_id). Fara
   * `onConflict`, PostgREST rezolva pe cheia primara: randurile capata id-uri noi, lovesc
   * unicul, si toata pagina cade cu 23505 — adica butonul „Include toate produsele active" nu
   * mai merge pe niciun magazin care are fie si un singur produs listat.
   */
  return (async () => {
    const produse = Array.from({ length: 3 }, (_, i) => idProdus(i));
    const { db, scrise } = faceBaza({ produse });
    await includeToateActive(db, BID, null, ACUM);

    /*
     * ⚠ A DOUA APASARE TREBUIE SA CHEME CHIAR UPSERTUL. Fara randul asta, dedublarea sare toate
     * randurile, `upsert` nu se cheama deloc, si proba ar fi ramas verde chiar cu tinta de
     * conflict stearsa: paza ar fi fost tinuta de cu totul alta proba.
     */
    (db as unknown as { __scoate: (id: string) => void }).__scoate(produse[0]);
    await includeToateActive(db, BID, null, ACUM);
    assert.equal(scrise.length, 4, "a doua apasare n-a scris nimic: proba nu exercita paza");
  })();
});

test("⚠ a doua apasare NU rescrie randurile care erau deja in feed", async () => {
  /*
   * `actualizat_la` intra in `<LastMod>`. Rescris pe tot catalogul la fiecare apasare, ar face
   * data sa sara pe produse care n-au miscat — iar comerciantul e chiar indemnat sa apese din
   * nou, de avertismentul care spune ca includerea se reia de unde a ramas.
   */
  const produse = Array.from({ length: 3 }, (_, i) => idProdus(i));
  const { db, scrise } = faceBaza({ produse });

  const unu = await includeToateActive(db, BID, null, ACUM);
  assert.equal(unu.scrise, 3);
  assert.equal(scrise.length, 3);

  const doi = await includeToateActive(db, BID, null, ACUM);
  assert.equal(doi.scrise, 3, "raspunsul catre om ramane „3 produse incluse”, nu „0”");
  assert.equal(scrise.length, 3, "s-au rescris randuri care nu se schimbasera");
});

test("⚠ un produs SCOS din feed se pune la loc la urmatoarea apasare", async () => {
  /* Sarirea se face pe `inclus`, nu pe „exista randul": altfel scoaterea ar fi ireversibila. */
  const produse = [idProdus(1), idProdus(2)];
  const { db, scrise } = faceBaza({ produse });
  await includeToateActive(db, BID, null, ACUM);

  (db as unknown as { __scoate: (id: string) => void }).__scoate(idProdus(1));
  await includeToateActive(db, BID, null, ACUM);

  assert.equal(scrise.length, 3, "produsul scos n-a fost pus la loc");
  assert.equal(scrise[2].product_id, idProdus(1));
});
