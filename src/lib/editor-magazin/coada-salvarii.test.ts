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
  /** Intarzierile cerute, in ordine: asa se vede rarirea reincercarilor. */
  const intarzieri: number[] = [];
  const ceas: Ceas = {
    setTimeout: (fn, ms) => {
      const id = urmatorul++;
      programate.set(id, fn);
      intarzieri.push(ms);
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
    intarzieri,
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

/*
  ═══ O SCRIERE CAZUTA NU SE MAI UITA (19.11.2026, auditul editorului) ═══

  Pana atunci, dupa o cadere coada ramanea goala. Ciorna de pe ecran nu mai ajungea in baza pana la urmatoarea
  modificare, iar „Ieși” primea `false` de la `goleste` la nesfarsit, fara sa mai incerce nimic: butonul parea mort.
*/

test("⚠⚠ dupa o cadere, `goleste` REINCEARCA scrierea, nu raspunde `false` la nesfarsit („Ieși” ramanea blocat)", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  let legatura = false;
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return legatura; } });
  coada.programeaza("A");
  assert.equal(await coada.goleste(), false, "prima incercare cade");
  // Omul apasa „Ieși” din nou, cu legatura revenita: fara nicio modificare noua, scrierea trebuie sa plece iar.
  legatura = true;
  assert.equal(await coada.goleste(), true, "a doua golire o reincearca si reuseste");
  assert.deepEqual(scrise, ["A", "A"]);
  assert.equal(await coada.goleste(), true, "odata scrisa, nu mai e nimic de reluat");
  assert.deepEqual(scrise, ["A", "A"]);
});

test("⚠⚠ o scriere cazuta se reincearca SINGURA, tot mai rar, pana reuseste", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  let caderi = 3;
  const coada = creeazaCoadaSalvarii<string>({
    intarziere: 1200, ceas: timp.ceas, reincercari: [4000, 10000, 30000],
    scrie: async (v) => { scrise.push(v); return caderi-- <= 0; },
  });
  coada.programeaza("A");
  timp.trece();
  await asteapta();
  for (let i = 0; i < 3; i++) {
    assert.equal(timp.numar(), 1, `dupa caderea ${i + 1} e programata o reincercare`);
    timp.trece();
    await asteapta();
  }
  assert.deepEqual(scrise, ["A", "A", "A", "A"], "trei caderi, apoi reusita");
  assert.equal(timp.numar(), 0, "dupa reusita nu mai e nimic programat");
  assert.deepEqual(timp.intarzieri, [1200, 4000, 10000, 30000], "prima e amanarea obisnuita, apoi rarirea");
});

test("rarirea ramane pe ultima treapta cand caderile continua", async () => {
  const timp = ceasFals();
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, reincercari: [100, 200], scrie: async () => false });
  coada.programeaza("A");
  for (let i = 0; i < 5; i++) { timp.trece(); await asteapta(); }
  assert.deepEqual(timp.intarzieri, [1200, 100, 200, 200, 200, 200]);
});

test("⚠ o modificare mai noua inlocuieste scrierea cazuta: cea veche nu se mai trimite", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return v !== "A"; } });
  coada.programeaza("A");
  timp.trece();
  await asteapta();
  assert.equal(timp.numar(), 1, "A a cazut si asteapta reincercarea");
  coada.programeaza("B");
  assert.equal(timp.numar(), 1, "reincercarea lui A s-a oprit, ramane doar amanarea lui B");
  timp.trece();
  await asteapta();
  assert.deepEqual(scrise, ["A", "B"], "B duce ciorna intreaga; A nu se mai scrie peste ea");
  assert.equal(timp.numar(), 0);
});

test("⚠ un refuz al serverului NU se reincearca singur (ar primi acelasi raspuns), dar `goleste` il mai incearca o data", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  let refuza = true;
  const coada = creeazaCoadaSalvarii<string>({
    intarziere: 1200, ceas: timp.ceas,
    scrie: async (v) => { scrise.push(v); return refuza ? "refuzat" : true; },
  });
  coada.programeaza("A");
  timp.trece();
  await asteapta();
  assert.equal(timp.numar(), 0, "niciun temporizator dupa un refuz");
  assert.equal(await coada.goleste(), false, "la cerere se incearca din nou si se spune ca tot nu a mers");
  refuza = false;
  assert.equal(await coada.goleste(), true);
  assert.deepEqual(scrise, ["A", "A", "A"]);
});

test("`anuleaza` uita si scrierea cazuta (Publica, Renunta): nu mai invie ciorna golita", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return false; } });
  coada.programeaza("A");
  timp.trece();
  await asteapta();
  assert.equal(timp.numar(), 1);
  coada.anuleaza();
  assert.equal(timp.numar(), 0, "reincercarea e oprita");
  timp.trece();
  await asteapta();
  assert.deepEqual(scrise, ["A"]);
  // Dupa „Publică” / „Renunță” nu mai e nimic de scris: caderea de dinainte nu mai tine „Ieși” pe loc.
  assert.equal(await coada.goleste(), true, "nimic de scris, deci gata; caderea veche e uitata");
  assert.deepEqual(scrise, ["A"]);
});

test("`reincearca` trimite pe loc scrierea cazuta (legatura a revenit) si nu face nimic cand nu e nimic cazut", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  let legatura = false;
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return legatura; } });
  coada.reincearca();
  await asteapta();
  assert.deepEqual(scrise, [], "nimic cazut, nimic de trimis");

  coada.programeaza("A");
  timp.trece();
  await asteapta();
  legatura = true;
  coada.reincearca();
  await asteapta();
  assert.deepEqual(scrise, ["A", "A"]);
  assert.equal(timp.numar(), 0, "reincercarea automata e oprita, nu scrie a treia oara");
  coada.reincearca();
  await asteapta();
  assert.deepEqual(scrise, ["A", "A"]);
});

test("cu o modificare noua programata, `reincearca` lasa locul ei (n-o intrece cu valoarea veche)", async () => {
  const timp = ceasFals();
  const scrise: string[] = [];
  const coada = creeazaCoadaSalvarii<string>({ intarziere: 1200, ceas: timp.ceas, scrie: async (v) => { scrise.push(v); return v !== "A"; } });
  coada.programeaza("A");
  timp.trece();
  await asteapta();
  coada.programeaza("B");
  coada.reincearca();
  await asteapta();
  assert.deepEqual(scrise, ["A"], "nimic pana nu vine randul lui B");
  assert.equal(await coada.goleste(), true);
  assert.deepEqual(scrise, ["A", "B"]);
});
