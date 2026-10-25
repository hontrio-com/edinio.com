import test from "node:test";
import assert from "node:assert/strict";
import { creeazaCoadaSalvarii, type Ceas } from "./coada-salvarii";

/**
 * Coada de salvare a ciornei de design (25.10.2026). Vezi antetul din `coada-salvarii.ts`.
 *
 * Rulare: `npm test`.
 */

function ceasFals() {
  let urmatorul = 1;
  const programate = new Map<number, () => void>();
  const ceas: Ceas = {
    setTimeout: (fn) => {
      const id = urmatorul++;
      programate.set(id, fn);
      return id;
    },
    clearTimeout: (id) => {
      programate.delete(id as number);
    },
  };
  return {
    ceas,
    /** Trece timpul: pornesc toate salvarile programate. */
    trece() {
      const acum = [...programate.values()];
      programate.clear();
      for (const fn of acum) fn();
    },
    numar: () => programate.size,
  };
}

function amanat() {
  let rezolva!: (v: boolean) => void;
  const p = new Promise<boolean>((r) => { rezolva = r; });
  return { p, rezolva };
}

const asteapta = () => new Promise((r) => setImmediate(r));

test("doua modificari in aceeasi secunda pleaca o singura data, cu cea de-a doua", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return true; } });
  coada.programeaza("A");
  coada.programeaza("B");
  assert.equal(timp.numar(), 1, "programarea noua o inlocuieste pe cea veche");
  timp.trece();
  await asteapta();
  assert.deepEqual(scrise, ["B"]);
});

test("⚠⚠ o scriere nu porneste cat cea de dinainte e inca pe drum", async () => {
  const timp = ceasFals();
  const jurnal: string[] = [];
  const primul = amanat();
  const coada = creeazaCoadaSalvarii<string>({
    intarziere: 1200,
    ceas: timp.ceas,
    scrie: async (v) => {
      jurnal.push(`porneste ${v}`);
      const ok = v === "A" ? await primul.p : true;
      jurnal.push(`gata ${v}`);
      return ok;
    },
  });
  coada.programeaza("A");
  timp.trece();
  await asteapta();
  coada.programeaza("B");
  timp.trece();
  await asteapta();
  // Altfel B ar fi plecat cu baza de dinaintea lui A si garda l-ar fi respins.
  assert.deepEqual(jurnal, ["porneste A"], "B asteapta raspunsul lui A");
  primul.rezolva(true);
  await asteapta();
  await asteapta();
  assert.deepEqual(jurnal, ["porneste A", "gata A", "porneste B", "gata B"]);
});

test("⚠⚠ `goleste` trimite pe loc modificarea programata si spune cum s-a terminat", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return v !== "rau"; } });
  coada.programeaza("ultima");
  // Iesirea din editor la mai putin de o secunda dupa modificare: temporizatorul n-a pornit.
  assert.equal(await coada.goleste(), true);
  assert.deepEqual(scrise, ["ultima"]);
  assert.equal(timp.numar(), 0, "temporizatorul e oprit, deci nu scrie a doua oara");
  timp.trece();
  await asteapta();
  assert.deepEqual(scrise, ["ultima"]);

  coada.programeaza("rau");
  assert.equal(await coada.goleste(), false, "scrierea cazuta se spune, ca iesirea sa nu plece");
});

test("`goleste` fara nimic programat asteapta scrierea de pe drum; fara nimic deloc, e gata", async () => {
  const timp = ceasFals();
  const peDrum = amanat();
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: () => peDrum.p });
  assert.equal(await coada.goleste(), true);

  coada.programeaza("A");
  timp.trece();
  let terminat = false;
  const golire = coada.goleste().then((r) => { terminat = true; return r; });
  await asteapta();
  assert.equal(terminat, false, "nu raspunde inaintea scrierii de pe drum");
  peDrum.rezolva(true);
  assert.equal(await golire, true);
});

test("`anuleaza` uita salvarea programata (Publica, Renunta)", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return true; } });
  coada.programeaza("A");
  coada.anuleaza();
  timp.trece();
  assert.equal(await coada.goleste(), true);
  assert.deepEqual(scrise, []);
});

test("o scriere care arunca nu opreste coada", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({
    intarziere: 1200,
    ceas: timp.ceas,
    scrie: async (v) => {
      if (v === "A") throw new Error("retea");
      scrise.push(v);
      return true;
    },
  });
  coada.programeaza("A");
  assert.equal(await coada.goleste(), false);
  coada.programeaza("B");
  assert.equal(await coada.goleste(), true);
  assert.deepEqual(scrise, ["B"]);
});
