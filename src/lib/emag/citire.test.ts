import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { EroareCitireBaza, randCitit, randuriCitite } from "./citire";
import { ofertaEsteLaEi, retragePeEmagId, trimiteElement } from "./trimite";

/* ══════════════════════════════════════════════════════════════════════════
   O CITIRE PICATA NU E UN RASPUNS (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ PostgREST nu arunca la refuz: intoarce `{ data: null, error }`. Deci

     const { data } = await admin.from("products")…maybeSingle();
     if (!data) return { verdict: "sarit", … };

   inseamna DOUA lucruri sub aceeasi forma: „produsul chiar nu mai e” si „baza n-a
   raspuns”. Iar `sarit` e TERMINAL — cronul sterge elementul din coada.

   ⚠ Deci o pana de o clipa a bazei, nimerita peste trecerea cronului, stergea lucrarea
   unui produs care exista foarte bine. Pretul nou nu mai pleca la eMAG niciodata, si in
   coada nu mai era nimic de vazut.

   Probele de mai jos NU citesc sursa: cheama functiile adevarate cu un client fals si se
   uita la ce raspund. O proba pe text ar fi trecut si peste un `if (error)` scris gresit.
*/

const NL = String.fromCharCode(10);

/* ── Un client fals, cat trebuie pentru drumurile probate ────────────────── */

type Raspuns = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Lantul PostgREST, oprit oriunde.
 *
 * ⚠ E un `Proxy` dinadins: `trimite.ts` inlantuie `select().eq().eq().maybeSingle()` in
 * cateva feluri, iar un fals scris pe fiecare lant s-ar fi rupt la prima schimbare de
 * ordine a metodelor — si atunci proba ar fi cazut fara ca defectul sa fie real.
 */
function lant(raspuns: Raspuns): unknown {
  const nod: unknown = new Proxy(function () {} as unknown as object, {
    get(_t, cheie) {
      if (cheie === "then") {
        return (resolve: (v: Raspuns) => void) => resolve(raspuns);
      }
      return () => nod;
    },
    apply() { return nod; },
  });
  return nod;
}

/** Client fals care raspunde altfel pe fiecare tabela, si tine minte ce s-a scris. */
function clientFals(peTabela: Record<string, Raspuns>) {
  const scrieri: { tabela: string }[] = [];
  const admin = {
    from(tabela: string) {
      const r = peTabela[tabela] ?? { data: null, error: null };
      return new Proxy({} as Record<string, unknown>, {
        get(_t, cheie) {
          if (cheie === "update" || cheie === "insert" || cheie === "upsert" || cheie === "delete") {
            scrieri.push({ tabela });
          }
          return () => lant(r);
        },
      });
    },
  };
  return { admin: admin as never, scrieri };
}

const CTX = {
  businessId: "biz-1",
  auth: { username: "u", password: "p", tara: "ro" },
  config: {},
  vatRate: 21,
  pricesIncludeVat: true,
} as never;

const CADERE = { message: "canceling statement due to statement timeout", code: "57014" };

/* ── Ajutoarele, singure ─────────────────────────────────────────────────── */

test("randCitit: zero randuri e un raspuns, refuzul e o cadere", () => {
  assert.equal(randCitit("t", { data: null, error: null }), null, "zero randuri: raspuns");
  assert.deepEqual(randCitit("t", { data: { a: 1 }, error: null }), { a: 1 });

  assert.throws(
    () => randCitit("t", { data: null, error: CADERE }),
    EroareCitireBaza,
    "un refuz al bazei trebuie sa iasa ca eroare, nu ca `null`",
  );
});

test("randCitit: `PGRST116` si `22P02` NU sunt caderi", () => {
  /*
   * ⚠ Ridicate la „reincearca”, ar tine in coada la nesfarsit exact elementele care n-au
   * ce cauta acolo: `PGRST116` inseamna „zero randuri pe `.single()`”, iar `22P02`
   * inseamna „uuid-ul din cerere nu e un uuid”. Amandoua sunt raspunsuri.
   */
  assert.equal(randCitit("t", { data: null, error: { message: "x", code: "PGRST116" } }), null);
  assert.equal(randCitit("t", { data: null, error: { message: "x", code: "22P02" } }), null);
});

test("randuriCitite: lista goala e un raspuns, refuzul e o cadere", () => {
  assert.deepEqual(randuriCitite("t", { data: [], error: null }), []);
  assert.throws(() => randuriCitite("t", { data: null, error: CADERE }), EroareCitireBaza);
});

/* ── `trimiteElement`: „nu stiu” nu se poarta ca „nu exista” ─────────────── */

test("citirea produsului picata da `trecatoare`, NU `sarit`", async () => {
  /*
   * ⚠ Proba cea mai importanta din fisier. `sarit` sterge elementul din coada; niciun
   * mecanism nu-l pune la loc, fiindca nimeni nu stie ca s-a pierdut.
   */
  const { admin } = clientFals({ products: { data: null, error: CADERE } });
  const r = await trimiteElement(admin, CTX, "p-1", "pret");

  assert.equal(r.verdict, "trecatoare", "o baza cazuta nu e un produs sters");
  assert.notEqual(r.verdict, "sarit");
});

test("produsul care CHIAR nu mai exista ramane `sarit`", async () => {
  /*
   * ⚠ Perechea probei de sus, si fara ea reparatia ar fi putut fi „fac totul trecator”.
   * Atunci un produs sters din magazin ar fi ramas in coada pentru totdeauna, reincercat
   * din minut in minut pana la capatul lumii.
   */
  const { admin } = clientFals({
    products: { data: null, error: null },
    emag_offers: { data: [], error: null },
  });
  const r = await trimiteElement(admin, CTX, "p-1", "pret");
  assert.equal(r.verdict, "sarit");
});

test("citirea ofertelor picata da tot `trecatoare`", async () => {
  /*
   * ⚠ Aici lipsa se vede si mai greu: `[]` peste o citire picata arata exact ca „produsul
   * n-are nicio oferta”. La o RETRAGERE, asta inseamna „n-a ajuns niciodata pe eMAG” —
   * deci oferta ramane la vanzare pentru marfa stearsa din magazin.
   */
  const { admin } = clientFals({
    products: { data: { id: "p-1", name: "X" }, error: null },
    emag_offers: { data: null, error: CADERE },
  });
  const r = await trimiteElement(admin, CTX, "p-1", "retragere");
  assert.equal(r.verdict, "trecatoare");
});

test("retragerea pe `emag_id`: citirea picata NU e „oferta nu mai există la noi”", async () => {
  /*
   * ⚠ Elementul asta e retragerea unui produs DEJA STERS din magazin. Sters din coada,
   * nu-l mai pune nimeni la loc: legatura `emag_offers.product_id` s-a rupt la stergere
   * (`on delete set null`), deci nici macar nu se mai poate afla ce era de retras.
   */
  const { admin } = clientFals({ emag_offers: { data: null, error: CADERE } });
  const r = await retragePeEmagId(admin, CTX, 12345);

  assert.equal(r.verdict, "trecatoare");
  assert.notEqual(r.verdict, "sarit");
});

test("retragerea pe `emag_id`: oferta care chiar lipseste ramane `sarit`", async () => {
  const { admin } = clientFals({ emag_offers: { data: null, error: null } });
  const r = await retragePeEmagId(admin, CTX, 12345);
  assert.equal(r.verdict, "sarit");
});

/* ── Cei doi martori ─────────────────────────────────────────────────────── */

test("o oferta PRELUATA exista la ei, chiar daca n-am trimis-o noi niciodata", () => {
  /*
   * ⚠ Regula era scrisa de trei ori in `trimite.ts`, si una din copii ramasese in urma:
   * `retrage()` se uita numai la `last_synced_at`. Deci un produs cu oferte preluate din
   * contul comerciantului trecea de alegerea rutei si pica la retragerea propriu-zisa —
   * `sarit`, sters din coada, numarat la „duse”, si oferta ramasa la VANZARE.
   *
   * Acum e o singura functie, si asta e proba ei.
   */
  assert.equal(ofertaEsteLaEi({ last_synced_at: null, creat_de_edinio: false }), true,
    "preluata la import: exista acolo dinainte de noi");
  assert.equal(ofertaEsteLaEi({ last_synced_at: "2026-08-01T00:00:00Z", creat_de_edinio: true }), true,
    "trimisa de noi");
  assert.equal(ofertaEsteLaEi({ last_synced_at: null, creat_de_edinio: true }), false,
    "facuta de noi si netrimisa inca: chiar nu e la ei");
});

/* ── Regula, pazita peste tot ────────────────────────────────────────────── */

/** Fisierele integrarii, fara probe si fara comentarii. */
function surseleIntegrarii(): { nume: string; cod: string }[] {
  return readdirSync("src/lib/emag")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({
      nume: f,
      /*
       * ⚠ FARA COMENTARII, si nu din cochetarie: notele care EXPLICA reparatia arata
       * chiar forma reparata. Fara curatarea asta, proba ar cadea pe propriul ei text —
       * tiparul care a muscat de patru ori pana acum in proiectul asta.
       */
      cod: readFileSync(`src/lib/emag/${f}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, ""),
    }));
}

test("proba insasi vede fisierele integrarii", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. Se dovedeste intai ca citeste. */
  const surse = surseleIntegrarii();
  assert.ok(surse.length > 30, `prea putine fisiere (${surse.length}): proba nu citeste`);
  assert.ok(
    surse.some((f) => /await admin\.from\(/.test(f.cod) || /await db\.from\(/.test(f.cod)),
    "niciun apel PostgREST gasit: filtrul e rupt, nu integrarea curata",
  );
});

test("nicio citire din integrare nu-si mai arunca `error`", () => {
  /*
   * ⚠ Regula, nu vanatoare. Aceeasi clasa de defect a fost gasita in proiect de patru
   * ori, de fiecare data din alt unghi — `configPentruCoada`, maparea codurilor Trendyol,
   * `domains-reconcile` si numaratoarea ofertelor. Reparata de fiecare data caz cu caz,
   * revenea din alta parte. Asta o opreste structural.
   *
   * ⚠ Se cauta destructurarea care ARUNCA `error`: `const { data } = await …` sau
   * `const { data: x } = await …`. Cine chiar are nevoie doar de `data` fara sa-i pese
   * de `error` are `randCitit`/`randuriCitite`, care fac deosebirea in locul lui.
   */
  const rele: string[] = [];
  for (const { nume, cod } of surseleIntegrarii()) {
    const linii = cod.split(NL);
    linii.forEach((l, i) => {
      if (!/const\s*\{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await\s/.test(l)) return;
      rele.push(`${nume}:${i + 1}: ${l.trim()}`);
    });
  }

  assert.deepEqual(
    rele, [],
    "citiri care arunca `error`. PostgREST NU arunca la refuz: intoarce "
    + "`{ data: null, error }`, deci `!data` inseamna si „nu exista”, si „n-am putut "
    + "intreba”. Foloseste `randCitit`/`randuriCitite` din `citire.ts`, sau citeste "
    + "`error` si spune ce faci cu el.",
  );
});
