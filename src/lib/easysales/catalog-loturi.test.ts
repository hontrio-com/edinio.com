import { test } from "node:test";
import assert from "node:assert/strict";
import { eroriPeElement, imparteInLoturi, trimiteInLoturi, type RezultatLot, type SoartaElement } from "./catalog-loturi";

/*
 * ═══ UN LOT TERMINAT NU INSEAMNA REUSITA, IAR UN LOT REFUZAT NU INSEAMNA CA TOATE SUNT REA ═══
 *
 * Serverul de aici e o functie: primeste lotul si raspunde dupa o regula („elementele cu `rau` dau
 * 422"). Probele cer ca elementele bune sa plece, iar cele rele sa ramana `respins`, cu mesajul lor.
 */

interface E { id: number; rau?: boolean; octeti?: number }

function server(opt: { cuIndici: boolean; partialTacut?: boolean }) {
  const loturi: number[][] = [];
  const singure: number[] = [];
  const intrate = new Set<number>();
  const trimiteLot = async (lot: E[]): Promise<RezultatLot> => {
    loturi.push(lot.map((e) => e.id));
    const rele = lot.map((e, i) => (e.rau ? i : -1)).filter((i) => i >= 0);
    if (rele.length && !opt.partialTacut) {
      return { fel: "validare", campuri: opt.cuIndici ? rele.map((i) => `products.${i}.sku: The products.${i}.sku field is required.`) : ["The given data was invalid."] };
    }
    for (const e of lot) if (!e.rau) intrate.add(e.id);
    return { fel: "ok" };
  };
  const trimiteUnul = async (e: E): Promise<SoartaElement> => {
    singure.push(e.id);
    if (e.rau) return { fel: "respins", mesaj: "product.sku: The product.sku field is required." };
    intrate.add(e.id);
    return { fel: "confirmat", esId: String(e.id + 1000) };
  };
  return { loturi, singure, intrate, trimiteLot, trimiteUnul };
}

const elemente = (n: number, rele: number[] = []): E[] => Array.from({ length: n }, (_, i) => ({ id: i, rau: rele.includes(i) }));

test("pana la prag, fiecare pleaca singur si afla pe loc daca a intrat", async () => {
  const s = server({ cuIndici: true });
  const r = await trimiteInLoturi({ elemente: elemente(5, [2]), octeti: () => 10, trimiteLot: s.trimiteLot, trimiteUnul: s.trimiteUnul, maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50 });
  assert.deepEqual(s.loturi, []);
  assert.deepEqual(r.map((x) => x.fel), ["confirmat", "confirmat", "respins", "confirmat", "confirmat"]);
});

test("peste prag, in loturi de cel mult 100; vinovatii se afla din cheile erorilor, restul pleaca din nou", async () => {
  const s = server({ cuIndici: true });
  const r = await trimiteInLoturi({ elemente: elemente(250, [7, 130]), octeti: () => 10, trimiteLot: s.trimiteLot, trimiteUnul: s.trimiteUnul, maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50 });
  assert.equal(r.filter((x) => x.fel === "respins").length, 2);
  assert.equal(r[7].fel, "respins");
  assert.match((r[7] as { mesaj: string }).mesaj, /^sku: The sku field/, "mesajul fara prefixul lotului");
  assert.equal(r[130].fel, "respins");
  assert.equal(s.intrate.size, 248, "toate celelalte au intrat");
  assert.ok(s.loturi.every((l) => l.length <= 100));
  assert.equal(s.loturi.length, 5, "3 loturi + 2 retrimiteri ale loturilor cu un vinovat");
});

test("fara indici in erori: se injumatateste pana la element, iar elementul singur isi afla eroarea", async () => {
  const s = server({ cuIndici: false });
  const r = await trimiteInLoturi({ elemente: elemente(64, [5]), octeti: () => 10, trimiteLot: s.trimiteLot, trimiteUnul: s.trimiteUnul, maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50 });
  assert.equal(r[5].fel, "respins");
  assert.equal(s.intrate.size, 63);
  assert.deepEqual(s.singure, [5], "numai vinovatul a plecat singur");
  assert.ok(s.loturi.length <= 2 * 7 + 1, `prea multe loturi: ${s.loturi.length}`);
});

test("prelucrarea partiala TACUTA nu se vede aici: elementele ies `trimis`, iar verificarea le prinde", async () => {
  const s = server({ cuIndici: true, partialTacut: true });
  const r = await trimiteInLoturi({ elemente: elemente(60, [3]), octeti: () => 10, trimiteLot: s.trimiteLot, trimiteUnul: s.trimiteUnul, maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50 });
  assert.ok(r.every((x) => x.fel === "trimis"), "niciunul nu e socotit confirmat din `data: null`");
  assert.ok(!s.intrate.has(3));
});

test("o pana trecatoare opreste trecerea: ce n-a plecat ramane `oprit`, nu `respins`", async () => {
  let cereri = 0;
  const r = await trimiteInLoturi<E>({
    elemente: elemente(300), octeti: () => 10, maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50,
    trimiteLot: async () => (++cereri === 2 ? { fel: "opreste", mesaj: "429" } : { fel: "ok" }),
    trimiteUnul: async () => ({ fel: "confirmat", esId: null }),
  });
  assert.equal(cereri, 2, "dupa pana nu mai pleaca nimic");
  assert.deepEqual([r[0].fel, r[150].fel, r[299].fel], ["trimis", "oprit", "oprit"]);
});

test("un raspuns necunoscut (timp expirat) nu se reia orb: lotul e `trimis` si il judeca verificarea", async () => {
  let cereri = 0;
  const r = await trimiteInLoturi<E>({
    elemente: elemente(60), octeti: () => 10, maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50,
    trimiteLot: async () => { cereri++; return { fel: "necunoscut" }; },
    trimiteUnul: async () => ({ fel: "confirmat", esId: null }),
  });
  assert.equal(cereri, 1);
  assert.ok(r.every((x) => x.fel === "trimis"));
});

test("bugetul trecerii: cand se termina, restul ramane pentru trecerea urmatoare", async () => {
  let ramase = 2;
  const s = server({ cuIndici: true });
  const r = await trimiteInLoturi({
    elemente: elemente(300), octeti: () => 10, trimiteLot: s.trimiteLot, trimiteUnul: s.trimiteUnul,
    maxLot: 100, maxOcteti: 1e6, peElementPanaLa: 50, maiAreTimp: () => ramase-- > 0,
  });
  assert.equal(s.loturi.length, 2);
  assert.equal(r.filter((x) => x.fel === "oprit").length, 100);
});

test("loturile se taie si dupa octeti, iar un element mai mare decat plafonul pleaca singur", () => {
  const e = [{ o: 400 }, { o: 400 }, { o: 400 }, { o: 1500 }, { o: 10 }];
  assert.deepEqual(imparteInLoturi(e, (x) => x.o, 100, 1000), [[0, 1], [2], [3], [4]]);
  assert.deepEqual(imparteInLoturi([1, 2, 3, 4, 5], () => 1, 2, 1e6), [[0, 1], [2, 3], [4]]);
});

test("cheile erorilor se citesc pe element, iar cele fara indice se ignora", () => {
  const m = eroriPeElement(["products.3.sku: The products.3.sku field is required.", "products.3.name: lipsa", "products: prea multe", "products.x.y: z"]);
  assert.deepEqual([...m.keys()], [3]);
  assert.deepEqual(m.get(3), ["sku: The sku field is required.", "name: lipsa"]);
});
