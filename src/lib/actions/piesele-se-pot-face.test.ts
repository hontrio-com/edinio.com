import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Comerciantul poate CHIAR sa faca o piesa?
 *
 * ═══ ⚠ DE CE E NEVOIE DE PROBA ASTA ═══
 *
 * Fiindca raspunsul a fost NU luni de zile, si nimic n-a cazut. Motorul stia sa scada balamale
 * (`componente.ts`), calea de stoc le contopea in `decrements`, migratia crea tabelul, publicarea
 * le ingheta pretul — si `configurator_componente` avea EXACT O atingere in tot codul: o citire.
 * Nu exista nicio actiune care sa scrie, si niciun camp `componenta` in builder.
 *
 * Adica F5 era livrat pe dinauntru si inaccesibil pe dinafara. Toate probele lui treceau verzi,
 * fiindca fiecare proba din lot verifica o bucata care chiar functiona.
 *
 * ⚠ Proba de aici e pe SURSA, si nu se poate altfel: ce apara e LANTUL — actiune, camp, panou —
 * iar fiecare veriga in parte merge si fara celelalte.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

const ACTIUNI = "lib/actions/configurator.actions.ts";
const PANOU = "components/dashboard/configurator/PanouPiese.tsx";
const INSPECTOR = "components/dashboard/configurator/InspectorNod.tsx";
const BUILDER = "components/dashboard/configurator/ConfiguratorBuilder.tsx";

test("⚠ probele stiu sa citeasca fisierele", () => {
  assert.ok(sursa(ACTIUNI).length > 20_000);
  assert.ok(sursa(PANOU).length > 3_000);
});

test("⚠ exista actiuni care CHIAR scriu piese", () => {
  /*
   * ⚠ Pana la faza asta tabelul avea o singura atingere in tot codul, si aia era o CITIRE la
   * publicare. Deci piesele se puteau crea numai scriind direct in baza.
   */
  const s = sursa(ACTIUNI);
  for (const f of ["listeazaPiese", "creeazaPiesa", "schimbaPiesa"]) {
    assert.match(s, new RegExp(`export async function ${f}\\(`), `lipseste \`${f}\``);
  }
  assert.match(s, /\.from\("configurator_componente"\)\s*\n\s*\.insert\(/, "nimic nu creeaza o piesa");
  assert.match(s, /\.from\("configurator_componente"\)\s*\n\s*\.update\(/, "nimic nu schimba o piesa");
});

test("⚠ produsul unei piese se verifica sa fie AL MAGAZINULUI", () => {
  /*
   * ⚠ ASTA E CEA MAI SCUMPA. Cheia straina catre `products` e globala si se verifica cu drepturile
   * proprietarului constrangerii, deci OCOLESTE RLS-ul de pe `products`. Iar id-urile de produs
   * sunt publice pe vitrina: se citesc din formularul de comanda.
   *
   * Fara verificarea asta, o piesa putea arata catre produsul ALTUI magazin, iar fiecare comanda
   * de pe magazinul meu ar fi scazut stocul victimei — `revendica_stoc_complet` cauta
   * `where id = pid`, fara `business_id`. Nu supravanzare: blocarea vanzarii altcuiva, de la
   * distanta, si fara nicio urma dupa anulare.
   */
  const s = sursa(ACTIUNI);
  assert.match(s, /async function produsulEAlMeu\(/, "lipseste verificarea produsului");
  assert.match(
    s,
    /\.eq\("id", productId\)\.eq\("business_id", a\.magazin\.id\)/,
    "verificarea nu cere si magazinul",
  );
  /* Si ca e chemata pe AMANDOUA drumurile de scriere: crearea si editarea. */
  const chemari = s.match(/await produsulEAlMeu\(a, String\(curat\.camp\.product_id\)\)/g) ?? [];
  assert.equal(chemari.length, 2, `se verifica pe ${chemari.length} drumuri, nu pe 2`);
});

test("⚠ un pret negativ pe piesa se REFUZA", () => {
  /*
   * ⚠ Ar fi insemnat ca cine consuma din depozit primeste bani inapoi: cumparatorul alege optiunea
   * care ne costa cel mai mult ca sa-si ieftineasca comanda, si cu cat mai multe bucati, cu atat
   * mai ieftin. Baza il refuza si ea, dar mesajul de acolo n-ar spune nimic omului.
   */
  const s = sursa(ACTIUNI);
  assert.match(s, /pret < 0\) return \{ error: "Pretul pe bucata nu poate fi negativ\." \}/);
  assert.match(s, /cost < 0\) return \{ error: "Costul pe bucata nu poate fi negativ\." \}/);
});

test("⚠ optiunea se poate LEGA de o piesa, din panou", () => {
  /*
   * ⚠ `Optiune.componenta` exista in model de la F1: se parsa, se compila, si nu-l putea completa
   * nimeni. Motorul stia sa scada patru balamale; comerciantul n-avea de unde sa spuna cate.
   *
   * ⚠ Si se scriu DOAR `id` si `bucati`. Pretul si produsul se ingheata la PUBLICARE, pe server;
   * `citeste.ts` le arunca dinadins cand vin dintr-o ciorna, fiindca altfel oricine poate salva o
   * ciorna ar fi scris el pretul dupa care se incaseaza.
   */
  const s = sursa(INSPECTOR);
  assert.match(s, /componenta: e\.target\.value/, "nu se poate alege piesa unei optiuni");
  assert.match(s, /componenta: n && o\.componenta\?\.id/, "nu se pot scrie bucatile");
  /*
   * ⚠ SE CITESTE FEREASTRA DE DUPA FIECARE `componenta:`, nu o expresie care cere `{` imediat.
   *
   * Prima forma era `/componenta:\s*\{[^}]*pretBucata/`, si a supravietuit mutantului: scrierea
   * adevarata trece printr-un ternar pe trei randuri (`componenta: x ? { ... } : undefined`), deci
   * dupa `componenta:` nu vine o acolada. Expresia nu potrivea nimic, si un `pretBucata: 0`
   * strecurat acolo ar fi trecut verde — adica exact defectul cel mai scump al fazei, inghetat
   * imutabil in fiecare versiune publicata de atunci incolo.
   */
  for (const interzis of ["pretBucata", "produsId", "nume:"]) {
    for (let i = s.indexOf("componenta:"); i >= 0; i = s.indexOf("componenta:", i + 1)) {
      assert.equal(
        s.slice(i, i + 220).includes(interzis),
        false,
        `panoul scrie \`${interzis}\` pe piesa; el trebuie inghetat la publicare, de pe server`,
      );
    }
  }
});

test("⚠ inspectorul vede DOAR piesele aprinse", () => {
  /*
   * ⚠ O piesa stinsa se pastreaza pentru versiunile publicate care o poarta, dar nu se mai poate
   * LEGA de o optiune noua — altfel comerciantul ar fi construit pe ceva ce tocmai a scos din
   * vanzare, si ar fi aflat abia la publicare.
   */
  const b = sursa(BUILDER);
  assert.match(b, /piese\.filter\(\(x\) => x\.activa\)/, "inspectorul primeste si piesele stinse");
  assert.match(b, /piese=\{pieseDeAles\}/, "inspectorul nu primeste deloc piesele");
});

test("⚠ piesele se citesc O DATA, in builder", () => {
  /*
   * ⚠ Citite separat in fila de piese si in inspector, cele doua ar fi ajuns sa arate liste
   * diferite: comerciantul face o piesa noua in fila „Piese", trece la „Structura", si n-o
   * gaseste — apoi o face inca o data.
   */
  const b = sursa(BUILDER);
  assert.match(b, /const \[piese, setPiese\] = useState<RandPiesa\[\]>\(\[\]\)/);
  assert.match(b, /<PanouPiese onSchimbat=\{reincarcaPiesele\} \/>/, "fila nu anunta builderul cand lista se schimba");
  /* ⚠ Panoul de piese CHIAR cheama inapoi, altfel propul de mai sus nu apara nimic. */
  assert.match(sursa(PANOU), /setRanduri\(r\.randuri\); setProblema\(null\); onSchimbat\(\);/);
});

test("⚠ piesa se STINGE, nu se sterge", () => {
  /*
   * ⚠ Versiunile publicate poarta `componenta.id` inghetat. Stearsa, validarea ar fi raportat-o ca
   * FANTOMA la urmatoarea publicare a oricarui configurator care o cere — iar comerciantul ar fi
   * citit pe ecran ca o piesa pe care tocmai a scos-o dinadins e o greseala.
   */
  const s = sursa(ACTIUNI);
  assert.equal(
    /\.from\("configurator_componente"\)\s*\n\s*\.delete\(/.test(s),
    false,
    "exista o cale care STERGE o piesa",
  );
  assert.match(sursa(PANOU), /schimbaPiesa\(piesa\.id, \{ activa: !piesa\.activa \}\)/);
});
