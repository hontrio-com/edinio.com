import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { corpBazaGtag } from "./corp-gtag";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TEMEIUL gtag SE EXECUTA, NU SE CITESTE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA, PE LANGA PROBA DIN `poarta.test.ts`. Aceea cauta text in sursa:
  „apare `consent update` inaintea lui `gtag('js')`". Am confruntat-o cu un mutant
  care punea `if (false)` in fata comenzii — textul ramanea la locul lui, ordinea
  parea buna, si proba trecea VERDE peste o comanda care nu se mai executa
  niciodata.

  Aici temeiul e chiar RULAT, intr-un `window` de mana, si se citeste ce a ajuns
  in `dataLayer`. Un `if (false)` cade pe loc.
*/

/**
 * Ruleaza chiar corpul intors de `corpBazaGtag`, intr-un context de `vm`.
 *
 * ⚠ `window` E CHIAR GLOBALUL, ca in browser. Prima forma dadea un obiect
 * oarecare drept `window`, si atunci `window.gtag = …` nu mai facea o variabila
 * globala — iar chemarea `gtag(…)` de pe randul urmator cadea cu „gtag is not
 * defined". Adica sandbox-ul se deosebea de lume tocmai in locul pe care il
 * probam.
 */
function contextDeProba(gazda = "www.edinio.com") {
  const scripturi: unknown[] = [];
  const ctx: Record<string, unknown> = {
    location: { hostname: gazda },
    document: {
      createElement: () => ({ async: false, src: "" }),
      head: { appendChild: (n: unknown) => { scripturi.push(n); } },
    },
  };
  ctx.window = ctx;
  createContext(ctx);
  return { ctx, scripturi };
}

function ruleazaIn(ctx: Record<string, unknown>, s: { statistici: boolean; marketing: boolean }): void {
  const corp = corpBazaGtag({
    gazde: ["www.edinio.com"],
    statistici: s.statistici,
    marketing: s.marketing,
    idIncarcare: "G-PROBA",
  });
  /* ⚠ Infasurat, exact ca in componenta: temeiul incepe cu un `return` de paza. */
  runInContext(`(function(){${corp}})();`, ctx);
}

/**
 * Ce a ajuns in `dataLayer`, ca liste din REALM-UL PROBEI.
 *
 * ⚠ SI DE CE CONTEAZA REALM-UL. `dataLayer` se naste inauntrul contextului `vm`,
 * deci si el si tot ce iese din `.map()` pe el sunt `Array`-uri ale ACELUI realm.
 * `assert.deepEqual` din `node:assert/strict` compara si prototipul, asa ca doua
 * liste cu acelasi continut cad — si mesajul arata doua liste identice, ceea ce
 * te trimite sa cauti defectul unde nu e. Se copiaza aici, o data, in realmul
 * probei.
 */
function ruleaza(s: { statistici: boolean; marketing: boolean }): unknown[][] {
  const { ctx } = contextDeProba();
  ruleazaIn(ctx, s);
  const brut = (ctx.dataLayer ?? []) as ArrayLike<ArrayLike<unknown>>;
  const iesire: unknown[][] = [];
  for (let i = 0; i < brut.length; i++) iesire.push(Array.from(brut[i]));
  return iesire;
}

test("⚠ secventa CHIAR se executa: default refuzat, apoi update cu adevarul, apoi js", () => {
  const dl = ruleaza({ statistici: true, marketing: false });
  /* Numai NUMELE comenzilor: al treilea argument al lui `js` e un ceas, si n-are
     ce cauta intr-o comparatie de ordine. */
  const comenzi = Array.from(dl, (a) => (a[0] === "consent" ? `consent:${String(a[1])}` : String(a[0])));

  assert.deepEqual(
    comenzi.slice(0, 3),
    ["consent:default", "consent:update", "js"],
    "secventa executata nu e default -> update -> js, ci: " + comenzi.join(" | "),
  );

  const implicit = dl[0][2] as Record<string, string>;
  for (const semnal of ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"]) {
    assert.equal(implicit[semnal], "denied", `\`default\` porneste cu "${semnal}" acordat`);
  }
  assert.equal(implicit.wait_for_update, 500, "`wait_for_update` a disparut, deci `update` poate ajunge prea tarziu");
});

test("⚠ `update` poarta EXACT ce a ales omul, pe fiecare categorie", () => {
  /*
    ⚠ CE APARA. Eticheta de reclame poate rula fara cea de statistici. Daca
    `update` ar turna aceeasi valoare peste toate patru semnalele, cine a ales
    numai marketing ar aparea la Google ca avand si analiza acordata.
  */
  for (const [statistici, marketing] of [[true, false], [false, true], [true, true]] as const) {
    const dl = ruleaza({ statistici, marketing });
    const u = dl.find((a) => a[0] === "consent" && a[1] === "update")?.[2] as Record<string, string>;
    assert.ok(u, `nu s-a executat niciun update pentru (${statistici}, ${marketing})`);

    assert.equal(u.analytics_storage, statistici ? "granted" : "denied");
    for (const semnal of ["ad_storage", "ad_user_data", "ad_personalization"]) {
      assert.equal(u[semnal], marketing ? "granted" : "denied", `"${semnal}" nu urmeaza alegerea de marketing`);
    }
  }
});

test("⚠ pe o gazda straina nu se executa NIMIC", () => {
  /*
    ⚠ CE APARA. Pe `localhost` si pe desfasurarile de previzualizare nu trebuie sa
    plece nimic. Poarta sta in chiar sirul intors, nu in componenta — care nu stie
    unde ruleaza.
  */
  const { ctx } = contextDeProba("localhost");
  ruleazaIn(ctx, { statistici: true, marketing: true });
  assert.equal(ctx.dataLayer, undefined, "s-a pornit gtag pe o gazda care nu e a noastra");
});

test("temeiul se pune o singura data, oricine ar ajunge primul", () => {
  /*
    ⚠ Doua etichete Google, fara niciun contract de ordine intre ele. Iar
    `gtag('consent','default')` chemat a doua oara nu e o repetare nevinovata:
    Google citeste starea implicita O SINGURA DATA.
  */
  const { ctx, scripturi } = contextDeProba();
  ruleazaIn(ctx, { statistici: true, marketing: true });
  const dupaUnul = (ctx.dataLayer as unknown[]).length;

  ruleazaIn(ctx, { statistici: true, marketing: true });
  assert.equal((ctx.dataLayer as unknown[]).length, dupaUnul,
    "al doilea temei a declarat consimtamantul din nou");
  assert.equal(scripturi.length, 1, "biblioteca gtag s-a incarcat de doua ori");
});
