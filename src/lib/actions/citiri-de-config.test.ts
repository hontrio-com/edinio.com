import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * Proba care ar fi prins pierderea acreditarilor Trendyol, 24.08.2026.
 *
 * ═══ CE S-A INTAMPLAT ═══
 *
 * Un magazin cu Trendyol legat si 1272 de listari active si-a pierdut acreditarile.
 * `trendyol_config` a ramas `{"reconcile_page": 20}` — un cursor, si nimic altceva.
 * Comerciantul n-a atins nimic; integrarea pur si simplu „nu mai era conectata".
 *
 * ═══ MECANISMUL, SI DE CE E AL TUTUROR INTEGRARILOR ═══
 *
 * Fiecare integrare are aceeasi pereche:
 *
 *   loadConfig()  citeste configurarea
 *   saveConfig()  scrie INTREGUL obiect inapoi
 *
 * Iar `loadConfig` ignora `error` si intorcea gol cand citirea dadea gres. Deci un gol
 * INCHIPUIT — o cadere de retea, un `.single()` pe zero randuri — se scria peste
 * acreditari. Nimic nu dadea eroare: scrierea reusea.
 *
 * Masurat la data incidentului: 41 de locuri scriu o configurare intreaga, iar
 * saisprezece functii de citire inghiteau eroarea.
 *
 * ═══ CE ANUME CAUTA PROBA ═══
 *
 * ⚠ NU orice citire tacuta. Multe sunt nevinovate: `order.actions.ts` citeste
 * configurarea de analytics ca sa trimita un eveniment, si daca n-o poate citi, sare
 * peste. Aruncarea acolo ar fi rupt procesarea unei comenzi pentru o statistica.
 *
 * Periculoasa e COMBINATIA: acelasi fisier citeste tacut o coloana SI o scrie intreaga
 * inapoi. Aia e forma care sterge acreditari, si numai aia se opreste aici.
 *
 * ═══ DE CE O PROBA CARE CITESTE FISIERE ═══
 *
 * Fiindca defectul nu se vede nici la citit, nici la rulat: pe drumul fericit totul
 * merge. Se vede abia in ziua in care o citire cade — si atunci nu mai e nimic de
 * vazut, fiindca acreditarile au disparut.
 *
 * ⚠ Si fiindca tiparul se REPETA. Reparat de mana in cele saisprezece locuri, ar fi
 * revenit la urmatoarea integrare, scrisa peste sase luni de cineva care n-a auzit de
 * ziua asta.
 *
 * Apararea are DOUA straturi: paza din baza de date (`privat.pazeste_secretele`, care
 * duce mai departe secretele pe care o scriere le-ar sterge, pentru orice integrare,
 * inclusiv cele care nu s-au scris inca) si proba asta, care opreste tiparul sa
 * reintre in cod.
 */

const ACTIUNI = join(process.cwd(), "src", "lib", "actions");

function fisiere(): string[] {
  return readdirSync(ACTIUNI, { withFileTypes: true })
    .filter((x) => x.isFile() && x.name.endsWith(".actions.ts"))
    .map((x) => join(ACTIUNI, x.name));
}

/** Coloanele citite fara sa se ia `error`. */
function citiriTacute(text: string): Set<string> {
  const gasite = new Set<string>();
  /* ⚠ `[\s\S]` in loc de `.` cu steagul `s`: acela cere es2018, iar proiectul tinteste
     mai jos si `tsc` refuza fisierul. */
  const tipar = /const \{ data \} = await[\s\S]{0,300}?\.from\("store_settings"\)[\s\S]{0,300}?\.select\(\s*"([a-z_]+_config)"/g;
  for (const m of text.matchAll(tipar)) gasite.add(m[1]);
  return gasite;
}

/** Coloanele scrise cu obiectul INTREG, nu cu o bucata. */
function scrieriIntregi(text: string): Set<string> {
  const gasite = new Set<string>();
  const tipar = /([a-z_]+_config):\s*(?:config|configFinal|noua|cfg|nou)\b/g;
  for (const m of text.matchAll(tipar)) gasite.add(m[1]);
  return gasite;
}

test("nicio configurare nu se citeste tacut SI se scrie intreaga in acelasi fisier", () => {
  const vinovate: string[] = [];

  for (const cale of fisiere()) {
    const text = readFileSync(cale, "utf8");
    const citite = citiriTacute(text);
    if (citite.size === 0) continue;

    const scrise = scrieriIntregi(text);
    for (const coloana of citite) {
      if (scrise.has(coloana)) {
        vinovate.push(`${cale.replace(process.cwd(), "")} → ${coloana}`);
      }
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "Un fisier citeste o configurare fara sa ia `error` SI o scrie intreaga inapoi. "
    + "Cand citirea cade, golul se scrie peste acreditari si integrarea se deconecteaza "
    + "singura, fara nicio eroare. Ia si `error`, si arunca. Vezi incidentul Trendyol, 24.08.2026.",
  );
});

/*
 * ═══ CE NU PAZESTE PROBA ASTA, SI DE CE ═══
 *
 * Zece fisiere citesc inca o configurare cu `.single()` in loc de `.maybeSingle()`.
 * `single()` da eroare cand nu exista rand — dar un magazin abia creat, fara rand de
 * setari, e o stare legitima.
 *
 * ⚠ NU pierd date: toate iau acum `error` si arunca. Cel mai rau lucru care se poate
 * intampla e ca un magazin nou sa primeasca o eroare in loc de o configurare goala.
 * Suparator, nu distructiv — alta clasa decat incidentul Trendyol.
 *
 * N-am convertit-o mecanic fiindca `maybeSingle` intoarce `null` acolo unde `single`
 * arunca, iar fiecare apelant trebuie CITIT ca sa se stie daca stie sa primeasca `null`.
 * Zece fisiere schimbate fara citire ar fi inlocuit un defect cunoscut cu zece
 * necunoscute — exact felul de reparatie care face rau in numele curateniei.
 *
 * Scris aici ca sa fie o datorie stiuta, nu una uitata.
 */
