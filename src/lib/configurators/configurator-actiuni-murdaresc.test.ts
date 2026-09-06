import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O ACTIUNE DE CONFIGURATOR CARE SCRIE, DAR NU MURDARESTE, E O MINCIUNA PE CARD
   ══════════════════════════════════════════════════════════════════════════

   Cardul din grila citeste `catalog_produs.cere_configurare` si `catalog_produs.pret_pornire`.
   Modelul ala se reimprospateaza dintr-un SINGUR loc: declansatorul `products_catalog_proiectie`,
   care marcheaza randul in `catalog_murdar` la fiecare scriere pe `products`.

   ⚠ Niciuna dintre actiunile configuratorului nu atinge `products`. Ele scriu in
   `configurator_produse`, `configurator_categorii`, `configurator_versiuni` si `configuratoare`.
   Deci declansatorul nu se aprinde NICIODATA pentru ele, si urmarea nu e „cardul se actualizeaza
   cu intarzierea unui cron”, ci „cardul nu se actualizeaza deloc”: un configurator publicat azi
   apare pe carduri abia cand cineva salveaza fiecare produs de mana.

   ⚠ SI DE CE O PROBA PE SURSA, NU PE PURTARE. Actiunile sunt „use server”, cer sesiune si
   scriu in patru tabele; probate prin rulare, ar fi cerut o baza. Ce trebuie aparat aici nu e
   insa un rezultat, ci o REGULA DE SCRIERE: „daca atingi legaturile, marchezi”. Regula asta se
   incalca prin OMISIUNE — cineva adauga a saisprezecea actiune si nu stie ca datoreaza un marcaj
   — iar omisiunea se vede in sursa, nu intr-un rezultat.
*/

/*
 * ⚠ COMENTARIILE DE LINIE SE STERG PRIMELE, si ordinea nu e o preferinta: o secventa de
 * deschidere de bloc aflata intr-un comentariu de linie porneste stergatorul de blocuri, care
 * inghite tot pana la urmatoarea inchidere — adica bucati de cod adevarat. Iar o proba care cauta
 * ceva in bucata inghitita trece linistita, pe gol.
 */
const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ACTIUNI = viu("src/lib/actions/configurator.actions.ts");
const MURDARESTE = viu("src/lib/configurators/murdareste.ts");

/** Fiecare `export async function` din fisier, cu tot corpul lui pana la urmatorul. */
function bucati(sursa: string, tipar: RegExp): { nume: string; corp: string }[] {
  const capete = [...sursa.matchAll(tipar)];
  return capete.map((m, i) => ({
    nume: m[1],
    corp: sursa.slice(m.index ?? 0, i + 1 < capete.length ? capete[i + 1].index : sursa.length),
  }));
}

const actiuni = bucati(ACTIUNI, /export async function (\w+)/g);

/**
 * Ce inseamna „a atins legaturile”.
 *
 * Nu orice scriere din fisier schimba raspunsul cardului: ciorna si numele nu se servesc nimanui.
 * Se numara doar ce schimba CE VEDE cumparatorul — legaturile, si starea servita.
 */
function schimbaRaspunsulCardului(corp: string): boolean {
  const scrie = /\.(upsert|insert|delete|update)\(/;
  for (const tabela of ["configurator_produse", "configurator_categorii"]) {
    /*
     * ⚠ TOATE aparitiile tabelei, nu prima.
     *
     * Prima forma se uita doar la `indexOf`, adica la PRIMA chemare. In `aplicaLaProduse` prima
     * chemare e o CITIRE de verificare — „cine a luat deja produsele astea?" — iar scrierea vine
     * cateva zeci de randuri mai jos. Deci predicatul raspundea `false` tocmai pentru actiunea
     * cea mai importanta din fisier: proba trecea verde si nu paza nimic acolo unde conta.
     */
    for (const m of corp.matchAll(new RegExp(`\.from\("${tabela}"\)`, "g"))) {
      if (scrie.test(corp.slice(m.index ?? 0, (m.index ?? 0) + 400))) return true;
    }
  }
  // Pointerul de versiune si starea sunt chiar ce hotaraste daca un configurator se SERVESTE.
  if (/\.update\(\{[^}]*\b(stare|versiune_activa_id)\b/.test(corp)) return true;
  return false;
}

/** Marcarea, oricare dintre cele trei forme, sau delegarea catre o actiune care o face. */
function murdareste(corp: string): boolean {
  return /murdaresteSiProiecteaza\(|murdaresteCategoriile\(|murdaresteConfiguratorul\(/.test(corp)
    || /return aplicaLaProduse\(/.test(corp);
}

/* ── Ca proba sa poata si CADEA, intai trebuie sa fi gasit ceva ───────────── */

test("s-au gasit toate actiunile fisierului", () => {
  /*
   * ⚠ Fara pragul asta, o schimbare de forma („export const x = async () =>”) ar fi golit lista,
   * si toate probele de mai jos ar fi trecut peste zero actiuni — verzi, si complet oarbe.
   */
  assert.ok(actiuni.length >= 15, `am gasit doar ${actiuni.length} actiuni`);
  for (const nume of [
    "aplicaLaProduse", "scoateProduse", "aplicaLaCategorii", "scoateCategorii",
    "aplicaLaProduseleDinCategorie", "publicaConfigurator", "schimbaStareaConfiguratorului",
  ]) {
    assert.ok(actiuni.some((a) => a.nume === nume), `lipseste actiunea ${nume}`);
  }
});

test("⚠ orice actiune care schimba raspunsul cardului murdareste proiectia", () => {
  const vinovate = actiuni.filter((a) => schimbaRaspunsulCardului(a.corp) && !murdareste(a.corp));
  assert.deepEqual(
    vinovate.map((a) => a.nume), [],
    "actiunile astea scriu in legaturile configuratorului dar nu marcheaza nimic in "
    + "`catalog_murdar`; cardul lor ar minti pana cand cineva salveaza produsele de mana",
  );
});

test("cele sapte actiuni cunoscute chiar murdaresc, fiecare", () => {
  /*
   * Perechea probei de sus. Aia prinde o actiune NOUA care uita; asta prinde ca una dintre cele
   * de azi si-a pierdut marcarea SI, in aceeasi schimbare, si scrierea care o cerea — caz in care
   * proba de sus ar fi ramas verde fara ca nimic sa mai actualizeze cardul.
   */
  const cerute = [
    "aplicaLaProduse", "scoateProduse", "aplicaLaCategorii", "scoateCategorii",
    "aplicaLaProduseleDinCategorie", "publicaConfigurator", "schimbaStareaConfiguratorului",
  ];
  for (const nume of cerute) {
    const a = actiuni.find((x) => x.nume === nume);
    assert.ok(a, `lipseste ${nume}`);
    assert.ok(murdareste(a.corp), `${nume} nu cheama nicio forma de murdarire`);
  }
});

test("marcarea vine din `murdareste.ts`, nu dintr-un ajutor local", () => {
  // Un `function murdaresteSiProiecteaza() {}` scris pe loc ar fi trecut probele de sus fara sa
  // scrie nimic nicaieri. Importul e singurul care leaga numele de codul care chiar marcheaza.
  assert.match(ACTIUNI, /from "@\/lib\/configurators\/murdareste"/);
});

test("⚠ actiunile NU cheama ele `proiecteazaImediat`", () => {
  /*
   * Proiectia sincrona are un singur loc unde e potrivita — o lista marginita de produse — si
   * acela e `murdaresteSiProiecteaza`. Chemata din actiune, ar fi ajuns si dupa o legare de
   * CATEGORIE, unde produsele atinse pot fi mii: actiunea de panou s-ar fi intins zeci de
   * secunde si ar fi cazut pe timeout, cu marcajele deja scrise — adica o eroare aratata pentru
   * o legatura care de fapt s-a facut.
   */
  assert.equal(/proiecteazaImediat/.test(ACTIUNI), false);
});

/* ── Si modulul de marcare isi tine partea lui de intelegere ──────────────── */

test("numai calea cu lista marginita proiecteaza pe loc", () => {
  const forme = bucati(MURDARESTE, /export async function (\w+)/g);
  assert.ok(forme.length >= 3, `am gasit doar ${forme.length} forme de marcare`);

  const cuLista = forme.find((f) => f.nume === "murdaresteSiProiecteaza");
  assert.ok(cuLista, "lipseste `murdaresteSiProiecteaza`");
  assert.match(cuLista.corp, /proiecteazaImediat\(/);

  for (const nume of ["murdaresteCategoriile", "murdaresteConfiguratorul"]) {
    const f = forme.find((x) => x.nume === nume);
    assert.ok(f, `lipseste ${nume}`);
    assert.equal(
      /proiecteazaImediat\(/.test(f.corp), false,
      `${nume} atinge un numar NEMARGINIT de produse; proiectate in cererea actiunii, ar fi `
      + "facut-o sa cada pe timeout cu marcajele deja scrise",
    );
  }
});

test("⚠ marcarea se scrie cu cheia de SERVICIU", () => {
  /*
   * `catalog_murdar` are RLS pornit si NICIO politica. Cu clientul comerciantului, PostgREST nu
   * da eroare: raporteaza senin zero randuri afectate. Adica un card care nu se mai actualizeaza
   * niciodata, si nimic de vazut nicaieri.
   */
  assert.match(MURDARESTE, /createAdminClient\(\)/);
});

test("subarborele NU se rescrie in modulul de marcare", () => {
  // `extindeCategoriile` e chiar functia folosita de rezolvarea configuratorului. O a doua
  // implementare ar fi divergit, si divergenta s-ar fi vazut ca „produsele din subcategorie nu
  // s-au actualizat” — fara nicio eroare nicaieri.
  assert.match(MURDARESTE, /import \{ extindeCategoriile \} from "@\/lib\/offers\/offer-pricing"/);
});
