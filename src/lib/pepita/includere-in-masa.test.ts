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
          /*
           * ⚠ SI AICI SE PLIMBA CU ADEVARAT. Intervalul de chei acopera si listarile produselor
           * INACTIVE dintre primul si ultimul id al paginii, deci poate depasi plafonul de 1000
           * de randuri; cu `limit` si `gt` no-op, bucla de paginare n-ar fi fost probata deloc.
           */
          let randuri = [...listari.entries()]
            .map(([product_id, inclus]) => ({ product_id, inclus }))
            .filter((r) => (dela === null || r.product_id >= dela) && (panala === null || r.product_id <= panala))
            .filter((r) => dupa === null || r.product_id > dupa)
            .sort((a, c) => (a.product_id < c.product_id ? -1 : 1));
          if (cate !== null) randuri = randuri.slice(0, cate);
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
    /* Ajutor de proba: pune o listare care exista deja in baza, fara sa treaca prin cod. */
    __pune: (id: string) => listari.set(id, true),
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

   ⚠ ACUM SUNT DOUA PLASE, SI SPUN LUCRURI DIFERITE.

   Prima scaneaza SURSA: spune ca fiecare scriere din cod numeste campul. Nu spune ca valoarea
   scrisa e cea buna, si nu stie nimic despre o scriere venita din consola SQL sau dintr-o unealta
   de maine.

   A doua cere DECLANSATORUL din baza (`pepita_listari_stampileaza_clipa`, livrat pe 08.09.2026 in
   `2026-12-31-pepita-listarea-isi-stampileaza-clipa.sql`). El e regula deplina: stampileaza orice
   scriere, oricine ar fi scriitorul, si numai cand randul chiar s-a schimbat.

   ⚠ SI PRIMA NU SE ARUNCA, desi a doua o cuprinde. Scrierea din cod care numeste campul e ce
   citeste omul cand se intreaba de ce sare `<LastMod>`; iar daca declansatorul ar fi vreodata
   scos dintr-o consola, plasa de sursa e singura care mai vorbeste despre intentie.
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

test("⚠ si baza o cere, nu doar codul: declansatorul de pe `pepita_listari`", () => {
  /*
   * ⚠ SE CITESTE DIN BASELINE, adica din schema pe care o are Git. Ca productia e la fel o spune
   * jobul „schema din Git = productie"; aici se apara doar ca declansatorul nu dispare din schema
   * fara ca cineva sa observe.
   */
  /* ⚠ `String.fromCharCode(10)`, nu un sir cu backslash: escaparea se pierde pe drumul
     dintre unealta si fisier, si atunci sirul ar contine un RAND ADEVARAT.
     S-a intamplat chiar la scrierea probei asteia. */
  const RAND_NOU = String.fromCharCode(10);
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const linie = baseline.split(RAND_NOU).find((l) => l.includes("pepita_listari_stampileaza_clipa"));
  assert.ok(linie, "declansatorul nu mai e in schema: `actualizat_la` se bizuie iar pe memoria scriitorilor");
  assert.match(linie, /BEFORE UPDATE ON public\.pepita_listari/);
  /* ⚠ Fara clauza asta, un upsert care rescrie aceleasi valori ar impinge `<LastMod>` degeaba,
     si Pepita ar reciti tot catalogul la fiecare apasare. */
  assert.match(linie, /WHEN \(\(old\.\* IS DISTINCT FROM new\.\*\)\)/);
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

test("⚠ citirea listarilor deja incluse se PLIMBA: peste 1000 de randuri, PostgREST taie tacut", async () => {
  /*
   * Intervalul de chei al unei pagini acopera si listarile produselor INACTIVE dintre primul si
   * ultimul id, deci poate depasi plafonul de 1000. Trunchiata, citirea ar fi lipsit randuri deja
   * incluse, si le-am fi rescris degeaba: exact re-stampilarea pe care blocul o repara, si care
   * face `<LastMod>` sa sara pe produse care n-au miscat.
   */
  const active = Array.from({ length: 3 }, (_, i) => idProdus(i * 1000));
  const { db, scrise } = faceBaza({ produse: active });

  /* Prima apasare pune cele trei randuri. */
  await includeToateActive(db, BID, null, ACUM);
  assert.equal(scrise.length, 3);

  /* Iar intre ele traiesc 1500 de listari ale unor produse INACTIVE, care nu apar in pagina. */
  const inactive = Array.from({ length: 1500 }, (_, i) => idProdus(i + 1));
  for (const id of inactive) (db as unknown as { __pune: (id: string) => void }).__pune(id);

  await includeToateActive(db, BID, null, ACUM);
  assert.equal(scrise.length, 3, "s-au rescris randuri deja incluse: citirea s-a taiat la plafon");
});
