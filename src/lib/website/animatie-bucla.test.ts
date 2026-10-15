import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cadrePista, esantioanePista, urmatorulMoment, type Pista } from "./animatie-bucla";
import * as magazin from "./magazin-animat";
import * as integrari from "./integrari-animat";
import * as automatizari from "./automatizari-animat";
import * as vanzari from "./vanzari-animat";

/*
  Regulile motorului comun, verificate pe TOATE machetele odată. O regulă care ține de motor n-are
  ce căuta în proba unei singure machete: ar apăra-o pe aceea și ar lăsa-o nesupravegheată pe
  următoarea. Cine adaugă o machetă nouă o pune în lista de mai jos.
*/
const MACHETE: ReadonlyArray<{
  nume: string;
  piste: readonly Pista[];
  buclaS: number;
  momente: readonly number[];
  componenta: string;
  atribut: string;
}> = [
  {
    nume: "magazin",
    piste: magazin.PISTE,
    buclaS: magazin.BUCLA_S,
    momente: magazin.MOMENTE_DISCRETE,
    componenta: "src/components/website/sections/MagazinAnimat.tsx",
    atribut: "emx",
  },
  {
    nume: "integrari",
    piste: integrari.PISTE,
    buclaS: integrari.BUCLA_S,
    momente: integrari.MOMENTE_DISCRETE,
    componenta: "src/components/website/sections/IntegrariAnimat.tsx",
    atribut: "eic",
  },
  {
    nume: "automatizari",
    piste: automatizari.PISTE,
    buclaS: automatizari.BUCLA_S,
    momente: automatizari.MOMENTE_DISCRETE,
    componenta: "src/components/website/sections/AutomatizariAnimat.tsx",
    atribut: "eau",
  },
  {
    nume: "vanzari",
    piste: vanzari.PISTE,
    buclaS: vanzari.BUCLA_S,
    momente: vanzari.MOMENTE_DISCRETE,
    componenta: "src/components/website/sections/VanzariAnimat.tsx",
    atribut: "evz",
  },
];

for (const m of MACHETE) {
  test(`${m.nume}: cadrele-cheie trec prin fiecare eșantion, în toleranța pistei`, () => {
    /* Browserul interpolează LINIAR între cadre. Deci se socotește exact ce va desena el la fiecare
       eșantion (60 pe secundă) și se compară cu funcția pistei. */
    for (const p of m.piste) {
      const { ts, vs, pastrate } = esantioanePista(p, m.buclaS);
      let s = 0;
      for (let k = 0; k < ts.length; k++) {
        while (s < pastrate.length - 2 && pastrate[s + 1] <= k) s++;
        const a = pastrate[s];
        const b = pastrate[s + 1];
        /* În trepte (`step-end`), fiecare cadru ține până la următorul; altfel, dreapta dintre ele. */
        const f = p.trepte ? (k === b ? 1 : 0) : b === a ? 0 : (ts[k] - ts[a]) / (ts[b] - ts[a]);
        for (let d = 0; d < p.toleranta.length; d++) {
          const desenat = vs[a][d] + (vs[b][d] - vs[a][d]) * f;
          assert.ok(
            Math.abs(desenat - vs[k][d]) <= p.toleranta[d] + 1e-9,
            `${p.tinta}[${d}] la ${ts[k].toFixed(3)}s: desenat ${desenat}, trebuia ${vs[k][d]}`,
          );
        }
      }
    }
  });

  test(`${m.nume}: cadrele-cheie sunt valide pentru Web Animations și puține`, () => {
    let total = 0;
    for (const p of m.piste) {
      const cadre = cadrePista(p, m.buclaS);
      total += cadre.length;
      assert.equal(cadre[0].offset, 0, `${p.tinta}: primul cadru la 0`);
      assert.equal(cadre[cadre.length - 1].offset, 1, `${p.tinta}: ultimul cadru la 1`);
      for (let i = 1; i < cadre.length; i++) {
        assert.ok((cadre[i].offset as number) >= (cadre[i - 1].offset as number), `${p.tinta}: offset descrescător`);
      }
    }
    /* Măsurat 14.10.2026: ~1.250 la magazin, ~1.300 la integrări. Pragul nu e o țintă, e plasa: o
       regresie a simplificării ar umple cu zeci de mii de cadre (fără ea ar fi 1.441 pe pistă). */
    assert.ok(total < 3000, `${total} de cadre-cheie`);
  });

  test(`${m.nume}: ⚠ în cadrele-cheie intră numai \`transform\` și \`opacity\``, () => {
    /* MĂSURAT 14.10.2026: o singură proprietate care nu merge pe compozitor (era `visibility` pe
       paginile magazinului) scoate toată animația elementului de pe el. Chrome recalcula atunci
       stilul la fiecare cadru: 143 ms din fiecare secundă pe un telefon încetinit de 4 ori, mai
       mult decât macheta originală. Proba ține ușa închisă pentru orice altă proprietate. */
    for (const p of m.piste) {
      for (const cadru of cadrePista(p, m.buclaS)) {
        /* `offset` și `easing` (treptele) țin de cronometrare, nu de stil. */
        const proprietati = Object.keys(cadru).filter((k) => k !== "offset" && k !== "easing");
        for (const k of proprietati) assert.ok(k === "transform" || k === "opacity", `${p.tinta}: \`${k}\` în cadre`);
      }
    }
  });

  test(`${m.nume}: fiecare țintă e unică și există în componentă`, () => {
    /* O țintă scrisă greșit nu dă eroare: elementul lipsește din hartă și pista dispare în tăcere.
       Se citește chiar sursa componentei; țintele numerotate (`linie-0`...) vin dintr-un șablon. */
    const sursa = readFileSync(join(process.cwd(), m.componenta), "utf8");
    const tinte = m.piste.map((p) => p.tinta);
    assert.equal(new Set(tinte).size, tinte.length, "o țintă apare în două piste");
    for (const tinta of tinte) {
      const sablon = /^(.*)-(\d)$/.exec(tinta);
      const scrise = [
        `data-${m.atribut}="${tinta}"`,
        `tinta("${tinta}"`,
        ...(sablon ? [`data-${m.atribut}={\`${sablon[1]}-\${i}\`}`, `tinta(\`${sablon[1]}-\${i}\``] : []),
      ];
      const aparitii = scrise.reduce((n, s) => n + (sursa.split(s).length - 1), 0);
      assert.equal(aparitii, 1, `ținta ${tinta}: ${aparitii} locuri în componentă`);
    }
  });

  test(`${m.nume}: clipele scrise din JavaScript sunt în ordine, în buclă, și se reiau`, () => {
    for (let i = 1; i < m.momente.length; i++) assert.ok(m.momente[i] > m.momente[i - 1], `clipa ${i} nu e după ${i - 1}`);
    assert.equal(m.momente[0], 0, "începutul buclei e o clipă");
    assert.ok(m.momente[m.momente.length - 1] < m.buclaS);
    assert.equal(urmatorulMoment(m.momente, m.buclaS - 0.001, m.buclaS), m.buclaS, "după ultima vine începutul buclei");
  });
}
