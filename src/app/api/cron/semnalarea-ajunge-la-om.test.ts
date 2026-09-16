import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { proprietariiMagazinelor, stareaSaSchimbat } from "@/lib/orders/semnalarea-ajunge-la-om";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O SEMNALARE CARE NU AJUNGE LA OM NU E O SEMNALARE          (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Masurat pe baza de productie: ZERO randuri de tip `woot` in `notifications`, desi jurnalul
 * platformei are patru retururi Woot semnalate la FIECARE rulare (02:59, 04:59, 06:59).
 *
 * Cauza, gasita in cod: din cele saptesprezece cronuri de urmarire, cinci scriau numai in
 * `error_logs` — iar printre ele erau chiar cele TREI transportatoare care au miscat vreodata
 * un colet: Woot (172 AWB-uri), DPD (3) si Sameday (1). Toate trei calculau `semnalate++`,
 * compuneau propozitia, si o scriau intr-un jurnal pe care comerciantul nu-l deschide.
 *
 * ⚠ Si a doua jumatate: niciuna dintre cele trei nu compara starea noua cu cea veche, deci
 * semnalul se repeta la fiecare rulare. In jurnal e inofensiv; ca notificare ar fi fost o
 * alarma la doua ore pentru acelasi eveniment. De aia cele doua se repara IMPREUNA.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CRONURI = join("src", "app", "api", "cron");

/** Toate cronurile de urmarire, gasite pe disc — nu o lista scrisa de mana. */
function cronuriDeUrmarire(): { nume: string; cale: string }[] {
  return readdirSync(CRONURI, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-tracking"))
    .map((d) => ({ nume: d.name, cale: join(CRONURI, d.name, "route.ts") }))
    .sort((a, b) => a.nume.localeCompare(b.nume));
}

/*
 * ⚠ Cine NU-si scrie singur notificarea o face printr-un ajutor. Lista e declarata pe fata,
 * si ajutorul e verificat si el: altfel „deleaga" ar fi o scuza care nu se poate cadea.
 */
const PRIN_AJUTOR_PROPRIU: Record<string, string> = {
  "innoship-tracking": "src/lib/innoship/aplica-urmarire.ts",
};

describe("Fiecare cron care semnaleaza ajunge la clopotel", () => {
  test("cititorul chiar gaseste cronurile", () => {
    const toate = cronuriDeUrmarire();
    assert.ok(toate.length >= 17, `am gasit doar ${toate.length} cronuri de urmarire`);
  });

  test("⚠⚠ niciun cron nu mai semnaleaza DOAR in jurnal", () => {
    const vinovate: string[] = [];
    for (const { nume, cale } of cronuriDeUrmarire()) {
      const s = viu(cale);
      /* Un cron care nu numara semnalari n-are ce sa ajunga la om: Cargus si Colete nu au
         inca nicio harta de stari publicata de ei, deci nu semnaleaza nimic. */
      if (!/semnalate\s*\+\+/.test(s)) continue;

      const singurEl = /from\("notifications"\)/.test(s);
      const prinAjutorComun = /semnaleazaExpedierea\s*\(/.test(s);
      const delegat = PRIN_AJUTOR_PROPRIU[nume];
      const prinAjutorPropriu = delegat ? /from\("notifications"\)/.test(viu(delegat)) : false;

      if (!singurEl && !prinAjutorComun && !prinAjutorPropriu) vinovate.push(nume);
    }
    assert.deepEqual(
      vinovate, [],
      "cronurile astea decid ca ceva merita spus si nu-i spun comerciantului nimic",
    );
  });

  test("⚠ si cei trei care CHIAR duc colete sunt printre ei", () => {
    /* Woot 172 AWB-uri, DPD 3, Sameday 1. Restul sunt la zero, deci daca proba de mai sus se
       strica vreodata, trebuie sa cada pe ACESTIA, nu pe un numar. */
    for (const nume of ["woot-tracking", "dpd-tracking", "sameday-tracking"]) {
      const s = viu(join(CRONURI, nume, "route.ts"));
      assert.match(s, /semnaleazaExpedierea\s*\(/, `${nume} nu mai duce semnalul la om`);
    }
  });

  test("⚠ si niciunul nu semnaleaza fara sa se fi SCHIMBAT ceva", () => {
    /* Fara garda, notificarea ar fi mai rea decat lipsa ei: acelasi retur, la fiecare doua ore. */
    for (const nume of ["woot-tracking", "dpd-tracking", "sameday-tracking"]) {
      const s = viu(join(CRONURI, nume, "route.ts"));
      assert.match(s, /stareaSaSchimbat\s*\(/, `${nume} semnaleaza si cand nu s-a schimbat nimic`);
    }
  });
});

describe("`stareaSaSchimbat`: ce inseamna o schimbare", () => {
  test("stare noua fata de nimic scris inca: DA", () => {
    assert.equal(stareaSaSchimbat(null, 9), true);
    assert.equal(stareaSaSchimbat(undefined, "DL"), true);
    assert.equal(stareaSaSchimbat("", 3), true);
  });

  test("aceeasi stare, oricum ar fi scrisa: NU", () => {
    assert.equal(stareaSaSchimbat(9, 9), false);
    assert.equal(stareaSaSchimbat("9", 9), false, "numarul venit ca text e aceeasi stare");
    assert.equal(stareaSaSchimbat("dl", "DL"), false, "un cod scris de mana cu litere mici la fel");
    assert.equal(stareaSaSchimbat(" DL ", "DL"), false);
  });

  test("alta stare: DA", () => {
    assert.equal(stareaSaSchimbat(8, 9), true);
    assert.equal(stareaSaSchimbat("IT", "DL"), true);
  });

  test("⚠ fara stare noua nu se semnaleaza nimic", () => {
    /* Altfel un raspuns gol ar parea o schimbare fata de orice avem scris. */
    assert.equal(stareaSaSchimbat(9, null), false);
    assert.equal(stareaSaSchimbat(9, undefined), false);
    assert.equal(stareaSaSchimbat(9, ""), false);
  });
});

describe("`proprietariiMagazinelor`: fara `user_id` nu se scrie nicio notificare", () => {
  function bazaFalsa(randuri: { id: string; user_id: string | null }[]) {
    const cereri: string[][] = [];
    const admin = {
      from: () => ({
        select: () => ({
          in: (_camp: string, ids: string[]) => {
            cereri.push(ids);
            return Promise.resolve({ data: randuri.filter((r) => ids.includes(r.id)), error: null });
          },
        }),
      }),
    };
    return { admin, cereri };
  }

  test("intoarce harta, si nu cere nimic pe lista goala", async () => {
    const { admin, cereri } = bazaFalsa([{ id: "b1", user_id: "u1" }]);
    const h = await proprietariiMagazinelor(admin as never, []);
    assert.equal(h.size, 0);
    assert.equal(cereri.length, 0, "a plecat o cerere pentru nimic");
  });

  test("id-urile se cer o singura data, chiar daca vin de zeci de ori", async () => {
    const { admin, cereri } = bazaFalsa([{ id: "b1", user_id: "u1" }]);
    const h = await proprietariiMagazinelor(admin as never, Array(40).fill("b1"));
    assert.equal(h.get("b1"), "u1");
    assert.deepEqual(cereri, [["b1"]], "acelasi magazin s-a cerut de mai multe ori");
  });

  test("⚠ `.in()` se taie in bucati de cel mult 100", async () => {
    /* Adresa unei cereri PostgREST are limita de lungime: un lot mare ar face cererea sa cada
       intreaga, adica nimeni n-ar mai primi nicio notificare. */
    const randuri = Array.from({ length: 250 }, (_, i) => ({ id: `b${i}`, user_id: `u${i}` }));
    const { admin, cereri } = bazaFalsa(randuri);
    const h = await proprietariiMagazinelor(admin as never, randuri.map((r) => r.id));
    assert.equal(h.size, 250);
    assert.equal(cereri.length, 3, "nu s-a taiat in bucati");
    for (const c of cereri) assert.ok(c.length <= 100, `o bucata are ${c.length} id-uri`);
  });
});

describe("Woot: filtrul lor de data e refuzat, si ne descurcam fara el", () => {
  /*
   * Masurat in jurnalul platformei: la fiecare rulare, pentru fiecare din cele trei magazine,
   * „date_from: The date_from field must contain a valid date." Deci reconcilierea
   * rambursurilor n-a mers niciodata. Specificatia lor declara `format: date` si noi trimitem
   * chiar `YYYY-MM-DD`, deci formatul nu se poate afla din documente.
   */
  const RAMBURS = join(CRONURI, "woot-repayments", "route.ts");

  test("refuzul se recunoaste dupa NUMELE CAMPULUI, nu dupa propozitia lor", () => {
    const s = viu(RAMBURS);
    assert.match(s, /\/date_from\/i/, "recunoasterea nu mai e pe numele campului");
    assert.ok(
      !/must contain a valid date/.test(s),
      "nu se codifica dupa mesajul lor: il pot schimba oricand",
    );
  });

  test("⚠ si atunci se reia FARA filtru, taind local", () => {
    const s = viu(RAMBURS);
    assert.match(s, /adunaPagini\(false\)/, "nu exista reluarea fara filtru");
    assert.match(s, /dataRambursului/, "nu se mai taie local dupa data");
  });

  test("⚠ dar numai pentru refuzul care numeste `date_from`", () => {
    /* Un 401 sau o cadere de retea nu se reincearca fara filtru: n-ar repara nimic, si ar
       ascunde cauza adevarata sub o a doua eroare. */
    const s = viu(RAMBURS);
    assert.match(s, /if \(!refuzaFiltrulDeData\(e\)\) throw e;/);
  });
});
