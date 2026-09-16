import { strict as assert } from "node:assert";
import { test, afterEach } from "node:test";
import { probaConexiune, poartaLista, CHEI_LISTA, type PostaConfig } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SONDA PUBLICA TREBUIE SA JUDECE CU ACEEASI MASURA           (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `probaConexiune` intoarce TREI verdicte, nu doua. Al treilea — `raspunde_dar_public` —
 * exista fiindca o bifa verde n-ar dovedi nimic despre user si parola daca nomenclatorul
 * s-ar dovedi deschis oricui. E lectia platita la eColet.
 *
 * ⚠⚠ Dar cele doua drumuri citeau raspunsul cu masuri DIFERITE:
 *   - cel autentificat, prin `listaDinRaspuns`, accepta si `{data: […]}`;
 *   - sonda publica cerea `Array.isArray(JSON.parse(text))`, adica lista GOALA.
 *
 * Daca Posta impacheteaza — si nu stim, formatul nu e documentat pentru niciun nomenclator —
 * sonda spunea „nu e public" despre exact raspunsul pe care celalalt drum il citeste ca lista.
 * Verdictul iesea `autentificat`: bifa verde care spune ca datele de acces sunt bune, cand de
 * fapt nu se dovedise nimic despre ele.
 *
 * ⚠ O proba de conexiune care minte in VERDE e mai rea decat una care lipseste: comerciantul
 * afla ca nu e conectat abia la prima expediere, cu un cumparator care asteapta.
 */

const CONFIG: PostaConfig = {
  enabled: true,
  username: "user",
  password: "parola",
  cod_trimitere: "3,1,10",
};

const fetchAdevarat = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchAdevarat; });

/** Acelasi corp la ambele cereri; a doua (fara `Authorization`) e sonda publica. */
function raspundeCu(corp: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(corp), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

test("⚠⚠ nomenclator public IMPACHETAT: verdictul e `raspunde_dar_public`, nu verde", async () => {
  raspundeCu({ data: [{ id: 1 }, { id: 2 }] });
  const r = await probaConexiune(CONFIG);
  assert.equal(
    r.fel, "raspunde_dar_public",
    "sonda publica nu recunoaste lista impachetata: da bifa verde pe o resursa deschisa",
  );
});

test("lista neimpachetata se prindea si inainte, si se prinde in continuare", async () => {
  raspundeCu([{ id: 1 }]);
  const r = await probaConexiune(CONFIG);
  assert.equal(r.fel, "raspunde_dar_public");
});

test("⚠ iar cand resursa CHIAR e aparata, verdictul ramane `autentificat`", async () => {
  /* Fara asta, reparatia ar fi putut fi „intoarce mereu public”, care nu repara nimic. */
  let sAApelat = false;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    const areAutorizare = !!(init?.headers as Record<string, string> | undefined)?.Authorization;
    sAApelat = true;
    return areAutorizare
      ? new Response(JSON.stringify([{ id: 1 }]), { status: 200 })
      : new Response("Unauthorized", { status: 401 });
  }) as typeof fetch;
  const r = await probaConexiune(CONFIG);
  assert.equal(r.fel, "autentificat", "o resursa aparata nu mai e recunoscuta ca atare");
  assert.equal(sAApelat, true, "sonda publica nici nu s-a facut");
});

test("⚠ si o lista GOALA tot inseamna „deschis”: tacerea nu e dovada de aparare", async () => {
  /*
   * De aia sonda foloseste `poartaLista`, nu `listaDinRaspuns(r).length`: functia aceea
   * intoarce `[]` si cand raspunsul nu e lista, si cand lista chiar e goala. Pentru sonda,
   * cele doua inseamna lucruri OPUSE.
   */
  raspundeCu({ data: [] });
  const r = await probaConexiune(CONFIG);
  assert.equal(r.fel, "raspunde_dar_public");
});

test("⚠ cele doua citiri impart aceleasi chei, dintr-un singur loc", () => {
  /* Rupte in doua copii, ar fi divergit iar la prima cheie noua. */
  for (const cheie of CHEI_LISTA) {
    assert.ok(poartaLista({ [cheie]: [] }), `cheia ${cheie} nu e vazuta de sonda`);
  }
  assert.ok(!poartaLista({ altceva: [] }));
  assert.ok(!poartaLista({ data: "nu e lista" }));
  assert.ok(!poartaLista(null));
  assert.ok(!poartaLista("text"));
  assert.ok(poartaLista([]));
});
