import assert from "node:assert/strict";
import { test } from "node:test";
import { cheieOperatie, cuRegistru, eAtarnata, nuStim, PRAG_ATARNATA_MS, type Verdict } from "./registru";
import { eroareCuStatus, eroareNesigura, eroareRefuz, verdictFurnizor } from "./eroare-furnizor";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Baza e probata separat, in migratie, cu `do $$ … raise exception` pe date reale
 * (vezi migrations/2026-08-20-registru-operatii-externe.sql). Aici se probeaza
 * DECIZIILE din TypeScript, adica exact ce nu se vede din SQL:
 *
 *   * furnizorul nu e chemat cand rezervarea e refuzata;
 *   * un rezultat deja obtinut se ADOPTA, nu se reface;
 *   * o incheiere picata NU transforma un succes real in eroare raportata;
 *   * registrul indisponibil OPRESTE apelul (invers fata de stripe_events).
 */

type Raspuns = { data: unknown; error: { message: string; code?: string } | null };

/** Un client fals care raspunde la cele doua RPC-uri si numara apelurile. */
function client(raspunsuri: {
  rezerva: Raspuns;
  incheie?: Raspuns;
}): { admin: SupabaseClient<Database>; apeluri: string[] } {
  const apeluri: string[] = [];
  const admin = {
    rpc: async (nume: string) => {
      apeluri.push(nume);
      if (nume === "rezerva_operatie_externa") return raspunsuri.rezerva;
      return raspunsuri.incheie ?? { data: { gasit: true, stare: "reusit" }, error: null };
    },
  } as unknown as SupabaseClient<Database>;
  return { admin, apeluri };
}

const CERERE = {
  businessId: "b1",
  orderId: "o1",
  fel: "awb" as const,
  furnizor: "woot" as const,
  cheie: "awb:woot:o1",
};

test("cheia contine furnizorul, ca doua case sa nu se blocheze reciproc", () => {
  const a = cheieOperatie("factura", "smartbill", "#0005");
  const b = cheieOperatie("factura", "oblio", "#0005");
  assert.notEqual(a, b);
  // Fara furnizor in cheie, emiterea la Oblio ar fi blocat-o pe cea la SmartBill
  // desi sunt operatii diferite si amandoua au voie sa se intample.
  assert.ok(a.includes("smartbill"), a);
});

test("cheia separa felurile: un storno nu blocheaza o emitere", () => {
  assert.notEqual(
    cheieOperatie("factura", "fgo", "#0005"),
    cheieOperatie("storno", "fgo", "#0005"),
  );
});

test("rezervare refuzata cu `in_curs` -> furnizorul NU e chemat", async () => {
  const { admin, apeluri } = client({
    rezerva: { data: { rezervat: false, motiv: "in_curs", id: "op1", incercari: 3 }, error: null },
  });
  let chemat = false;

  const r = await cuRegistru(admin, CERERE, async () => {
    chemat = true;
    return { referinta: "AWB1", valoare: 1 };
  }, nuStim);

  assert.equal(chemat, false, "furnizorul a fost chemat desi operatia e in curs");
  assert.equal(r.fel, "blocat");
  if (r.fel === "blocat") {
    assert.ok(r.mesaj.includes("woot"), r.mesaj);
    // Mesajul trebuie sa spuna ce are omul de facut, nu doar ca a esuat.
    assert.ok(r.mesaj.includes("verifica"), r.mesaj);
  }
  assert.deepEqual(apeluri, ["rezerva_operatie_externa"]);
});

test("rezervare refuzata cu `reusit` -> se ADOPTA rezultatul, fara al doilea apel", async () => {
  const { admin, apeluri } = client({
    rezerva: {
      data: { rezervat: false, motiv: "reusit", referinta_externa: "AWB-VECHI", detalii: { s: 1 } },
      error: null,
    },
  });
  let chemat = false;

  const r = await cuRegistru(admin, CERERE, async () => {
    chemat = true;
    return { referinta: "AWB-NOU", valoare: 1 };
  }, nuStim);

  assert.equal(chemat, false, "s-a chemat furnizorul desi aveam deja rezultatul");
  assert.equal(r.fel, "deja");
  if (r.fel === "deja") assert.equal(r.referinta, "AWB-VECHI");
  assert.deepEqual(apeluri, ["rezerva_operatie_externa"]);
});

test("registrul indisponibil OPRESTE apelul (invers fata de stripe_events)", async () => {
  const { admin } = client({
    rezerva: { data: null, error: { message: "connection refused", code: "08006" } },
  });
  let chemat = false;

  const r = await cuRegistru(admin, CERERE, async () => {
    chemat = true;
    return { referinta: "AWB1", valoare: 1 };
  }, nuStim);

  /*
   * La `stripe_events` regula e „procesez fara dedupe", si acolo e corecta: un
   * eveniment pierdut nu mai vine niciodata. Aici operatia e pornita de om si se
   * poate relua peste un minut, iar raul de evitat e chiar duplicatul.
   */
  assert.equal(chemat, false, "s-a chemat furnizorul fara sa putem garanta unicitatea");
  assert.equal(r.fel, "eroare");
  if (r.fel === "eroare") {
    // `esuat`, nu `necunoscut`: nu s-a chemat nimic, deci nu e nimic de lamurit
    // la furnizor si reincercarea e complet sigura.
    assert.equal(r.verdict, "esuat");
  }
});

test("efectul extern reusit NU devine eroare daca incheierea pica", async () => {
  const { admin, apeluri } = client({
    rezerva: { data: { rezervat: true, id: "op1" }, error: null },
    incheie: { data: null, error: { message: "timeout" } },
  });

  const r = await cuRegistru(admin, CERERE, async () => ({
    referinta: "AWB-REAL",
    valoare: { barCode: "AWB-REAL" },
  }), nuStim);

  /*
   * Chiar asta e garantia pentru care exista registrul. AWB-ul EXISTA si e platit;
   * a raporta eroare l-ar impinge pe om sa apese din nou. Randul ramane `in_curs`,
   * deci a doua apasare va fi refuzata — cazul cel mai prost nu mai e un duplicat,
   * ci o operatie de lamurit.
   */
  assert.equal(r.fel, "facut");
  if (r.fel === "facut") assert.equal(r.referinta, "AWB-REAL");
  assert.deepEqual(apeluri, ["rezerva_operatie_externa", "incheie_operatie_externa"]);
});

test("verdictul dat de apelant ajunge in rezultat", async () => {
  for (const verdict of ["esuat", "necunoscut"] as Verdict[]) {
    const { admin } = client({ rezerva: { data: { rezervat: true, id: "op1" }, error: null } });
    const r = await cuRegistru(admin, CERERE, async () => {
      throw new Error("Woot API error 400");
    }, () => verdict);

    assert.equal(r.fel, "eroare");
    if (r.fel === "eroare") {
      assert.equal(r.verdict, verdict);
      assert.ok(r.mesaj.includes("400"), r.mesaj);
    }
  }
});

test("implicitul e `necunoscut`: un timeout nu se ia drept refuz", () => {
  // Daca implicitul ar fi `esuat`, un timeout ar debloca exact reincercarea care
  // emite al doilea document fiscal.
  assert.equal(nuStim(), "necunoscut");
});

test("o incheiere inghitita (`deja`) NU se raporteaza ca reusita", async () => {
  /*
   * Randul se incheiase pe alta cale intre rezervare si incheierea noastra, deci
   * referinta pe care tocmai am obtinut-o de la furnizor NU s-a inregistrat.
   * `gasit: true` singur ar fi ascuns-o — exact starea tacuta pe care registrul
   * exista sa n-o mai lase sa treaca.
   */
  const jurnal: string[] = [];
  const admin = {
    rpc: async (nume: string) => {
      jurnal.push(nume);
      if (nume === "rezerva_operatie_externa") return { data: { rezervat: true, id: "op1" }, error: null };
      return { data: { gasit: true, deja: true, stare: "esuat" }, error: null };
    },
  } as unknown as SupabaseClient<Database>;

  const r = await cuRegistru(admin, CERERE, async () => ({ referinta: "AWB-REAL", valoare: 1 }), nuStim);

  // Efectul extern s-a produs, deci apelantul primeste tot succes...
  assert.equal(r.fel, "facut");
  // ...dar incheierea a fost inghitita, deci trebuie sa fi trecut prin ramura de log.
  assert.deepEqual(jurnal, ["rezerva_operatie_externa", "incheie_operatie_externa"]);
});

// ─── Pragul de „atarnata" ────────────────────────────────────────────────────

test("o operatie PROASPAT in zbor nu se arata ca atarnata", () => {
  /*
   * Daca s-ar arata, langa ea ar aparea butonul „Am verificat, deblocheaza" pe o
   * operatie care CHIAR se executa in acel moment — iar deblocarea ar produce
   * exact duplicatul pe care tot mecanismul il inchide.
   */
  const acum = Date.UTC(2026, 7, 20, 12, 0, 0);
  const op = { stare: "in_curs" as const, creatLa: new Date(acum - 5_000).toISOString() };
  assert.equal(eAtarnata(op, acum), false);
});

test("dupa prag, aceeasi operatie `in_curs` devine atarnata", () => {
  const acum = Date.UTC(2026, 7, 20, 12, 0, 0);
  const op = { stare: "in_curs" as const, creatLa: new Date(acum - PRAG_ATARNATA_MS - 1).toISOString() };
  assert.equal(eAtarnata(op, acum), true);
});

test("`necunoscut` se arata imediat: apelul s-a incheiat deja", () => {
  const acum = Date.UTC(2026, 7, 20, 12, 0, 0);
  const op = { stare: "necunoscut" as const, creatLa: new Date(acum - 1_000).toISOString() };
  assert.equal(eAtarnata(op, acum), true);
});

test("data necitibila se arata, nu se ascunde", () => {
  // Mai bine un chenar in plus decat o operatie blocanta invizibila.
  assert.equal(eAtarnata({ stare: "in_curs", creatLa: "nu e o data" }, Date.now()), true);
});

// ─── Verdictul furnizorului ──────────────────────────────────────────────────

test("verdictul implicit e `necunoscut` pentru orice eroare nemarcata", () => {
  // `fetch` picat, `JSON.parse` crapat, o exceptie din codul nostru.
  assert.equal(verdictFurnizor(new Error("fetch failed")), "necunoscut");
  assert.equal(verdictFurnizor("nici macar Error"), "necunoscut");
});

test("refuzul dovedit deblocheaza reincercarea, nesigurul nu", () => {
  assert.equal(verdictFurnizor(eroareRefuz("IBAN lipsa")), "esuat");
  assert.equal(verdictFurnizor(eroareNesigura("timeout")), "necunoscut");
});

test("statusul HTTP: 4xx e refuz, 408 si 5xx nu", () => {
  assert.equal(verdictFurnizor(eroareCuStatus("Woot: diacritice", 400)), "esuat");
  assert.equal(verdictFurnizor(eroareCuStatus("prea multe cereri", 429)), "esuat");
  // 408 si 5xx: cererea a ajuns, deci coletul poate exista.
  assert.equal(verdictFurnizor(eroareCuStatus("timeout", 408)), "necunoscut");
  assert.equal(verdictFurnizor(eroareCuStatus("eroare interna", 500)), "necunoscut");
  assert.equal(verdictFurnizor(eroareCuStatus("gateway", 502)), "necunoscut");
});

test("marcarea nu schimba mesajul erorii", () => {
  // Wrapperele functioneaza si sunt testate: cine prinde eroarea si citeste
  // `.message` nu are voie sa vada nicio diferenta.
  for (const e of [eroareRefuz("Woot: adresa"), eroareNesigura("Woot: adresa"), eroareCuStatus("Woot: adresa", 400)]) {
    assert.equal(e.message, "Woot: adresa");
    assert.ok(e instanceof Error);
  }
});
