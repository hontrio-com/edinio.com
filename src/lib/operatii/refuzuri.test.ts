import { strict as assert } from "node:assert";
import { test } from "node:test";
import { refuzuriPeComanda } from "./registru";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  REFUZURILE SE VAD PE COMANDA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE A COSTAT LIPSA LOR. Un rand `esuat` din `operatii_externe` nu ajungea
  nicaieri in fata comerciantului: `operatiiAtarnate` filtreaza
  `in ("in_curs","necunoscut")`, santinela la fel, iar pe calea automata nu exista
  nici macar un toast. Masurat pe VetDepo: patru facturi refuzate intre 11.08 si
  01.09.2026, zero emise, si omul a aflat abia cand a scris el ca „nu merge Oblio".

  ⚠ PROBELE ASTEA CHEAMA FUNCTIA, nu-i citesc sursa. Plasa de dinainte pentru
  gestiunea Oblio cauta text si a lasat sa treaca sase mutatii din noua — vezi
  nota din `src/lib/oblio-stare.test.ts`. Aici clientul de baza e inlocuit cu unul
  de mana, iar ce se verifica sunt RANDURILE intoarse.
*/

type Rand = {
  id: string;
  fel: string;
  furnizor: string;
  stare: string;
  ultima_eroare: string | null;
  incercari: number;
  creat_la: string;
};

/**
 * Un client care intoarce randurile date, in ordinea ceruta de functie
 * (`creat_la` descrescator).
 *
 * ⚠ TINE MINTE FILTRELE, ca sa se poata verifica. O proba care doar intoarce
 * randuri ar trece verde si daca functia ar uita `.eq("business_id", …)` — adica
 * daca ar arata unui magazin refuzurile altuia.
 */
function clientFals(randuri: Rand[], filtre: Record<string, unknown> = {}) {
  const constructor = {
    select: () => constructor,
    eq: (col: string, val: unknown) => { filtre[`eq:${col}`] = val; return constructor; },
    in: (col: string, val: unknown) => { filtre[`in:${col}`] = val; return constructor; },
    order: (col: string, opt: { ascending: boolean }) => {
      filtre["order"] = `${col}:${opt.ascending ? "asc" : "desc"}`;
      const sortate = [...randuri].sort((a, b) =>
        opt.ascending ? a.creat_la.localeCompare(b.creat_la) : b.creat_la.localeCompare(a.creat_la));
      return Promise.resolve({ data: sortate, error: null });
    },
  };
  return { from: () => constructor } as unknown as SupabaseClient<Database>;
}

const R = (o: Partial<Rand> & { id: string; stare: string }): Rand => ({
  fel: "factura", furnizor: "oblio", ultima_eroare: "nu are Gestiune",
  incercari: 1, creat_la: "2026-09-01T06:00:00Z", ...o,
});

test("un refuz ajunge in fata omului, cu mesajul furnizorului intreg", async () => {
  const r = await refuzuriPeComanda(
    clientFals([R({ id: "1", stare: "esuat", ultima_eroare: "Produsul X nu are Gestiune (parametrul `management`)" })]),
    "biz", "cmd",
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].mesaj, "Produsul X nu are Gestiune (parametrul `management`)",
    "mesajul furnizorului a fost taiat sau rescris — el e singurul care spune ce e de reparat");
  assert.equal(r[0].fel, "factura");
  assert.equal(r[0].furnizor, "oblio");
});

test("⚠ O REUSITA STINGE REFUZUL de acelasi fel", async () => {
  /*
    Fara regula asta, o factura refuzata o data si emisa la a doua incercare ar
    tine o alarma rosie pe comanda la nesfarsit. O alarma care ramane aprinsa dupa
    ce s-a reparat problema invata omul s-o ignore — adica strica exact lucrul
    pentru care a fost pusa.
  */
  const r = await refuzuriPeComanda(clientFals([
    R({ id: "1", stare: "esuat", creat_la: "2026-09-01T06:00:00Z" }),
    R({ id: "2", stare: "reusit", ultima_eroare: null, creat_la: "2026-09-01T07:00:00Z" }),
  ]), "biz", "cmd");
  assert.deepEqual(r, [], "alarma ramane aprinsa dupa ce factura chiar s-a emis");
});

test("reusita stinge DOAR felul ei, nu si celelalte", async () => {
  const r = await refuzuriPeComanda(clientFals([
    R({ id: "1", fel: "factura", stare: "reusit", ultima_eroare: null, creat_la: "2026-09-01T07:00:00Z" }),
    R({ id: "2", fel: "awb", furnizor: "sameday", stare: "esuat", ultima_eroare: "adresa incompleta", creat_la: "2026-09-01T06:00:00Z" }),
  ]), "biz", "cmd");
  assert.equal(r.length, 1, "o factura reusita a stins si refuzul de AWB");
  assert.equal(r[0].fel, "awb");
});

test("din mai multe refuzuri pe acelasi fel se arata ULTIMUL", async () => {
  // ⚠ VetDepo avea patru randuri cu doua mesaje deosebite. Cel vechi („nu are
  // stoc suficient") ar fi trimis omul sa repare altceva decat ce blocheaza acum.
  const r = await refuzuriPeComanda(clientFals([
    R({ id: "vechi", stare: "esuat", ultima_eroare: "nu are stoc suficient", creat_la: "2026-08-25T08:00:00Z" }),
    R({ id: "nou", stare: "esuat", ultima_eroare: "nu are Gestiune", creat_la: "2026-09-01T06:22:00Z" }),
  ]), "biz", "cmd");
  assert.equal(r.length, 1, "acelasi fel apare de mai multe ori");
  assert.equal(r[0].id, "nou", "se arata refuzul vechi in locul celui de acum");
});

test("un refuz fara mesaj nu produce un chenar rosu gol", async () => {
  // Un chenar de alarma care nu spune nimic sperie fara sa lamureasca.
  const r = await refuzuriPeComanda(clientFals([
    R({ id: "1", stare: "esuat", ultima_eroare: null }),
    R({ id: "2", fel: "awb", stare: "esuat", ultima_eroare: "   " }),
  ]), "biz", "cmd");
  assert.deepEqual(r, []);
});

test("comanda sanatoasa nu arata nimic", async () => {
  assert.deepEqual(await refuzuriPeComanda(clientFals([]), "biz", "cmd"), []);
  assert.deepEqual(
    await refuzuriPeComanda(clientFals([R({ id: "1", stare: "reusit", ultima_eroare: null })]), "biz", "cmd"),
    [],
  );
});

test("⚠ intrebarea e ingradita la magazinul SI comanda cerute", async () => {
  /*
    Fara filtrele astea, un magazin ar vedea refuzurile altuia. Proba le verifica
    pe client, nu in sursa: o functie care le uita trece de orice `assert.match`.
  */
  const filtre: Record<string, unknown> = {};
  await refuzuriPeComanda(clientFals([], filtre), "biz-42", "cmd-7");
  assert.equal(filtre["eq:business_id"], "biz-42", "nu se mai filtreaza pe magazin");
  assert.equal(filtre["eq:order_id"], "cmd-7", "nu se mai filtreaza pe comanda");
  assert.deepEqual(filtre["in:stare"], ["esuat", "reusit"],
    "starile cerute s-au schimbat — `reusit` trebuie citit ca sa poata stinge refuzul");
  assert.equal(filtre["order"], "creat_la:desc",
    "ordinea nu mai e de la nou la vechi, deci „ultimul refuz\" nu mai e ultimul");
});

test("o eroare de citire nu arunca, doar nu arata nimic", async () => {
  // Panoul de deblocare de alaturi trebuie sa apara chiar daca asta pica.
  const client = { from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ in: () => ({
      order: () => Promise.resolve({ data: null, error: { message: "cazut" } }),
    }) }) }) }),
  }) } as unknown as SupabaseClient<Database>;
  assert.deepEqual(await refuzuriPeComanda(client, "biz", "cmd"), []);
});
