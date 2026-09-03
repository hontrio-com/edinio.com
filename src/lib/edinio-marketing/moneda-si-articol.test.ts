import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { monedaDeIncredere } from "./moneda-incasata";
import { verdictulPlatii, type SesiuneStripe } from "./verdict-plata";
import { adaptorGa4 } from "./adaptor-ga4";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DOUA LUCRURI CARE SE ATING DE BANI: CE MONEDA SPUNEM, SI CE AM VANDUT
  ═══════════════════════════════════════════════════════════════════════════════
*/

/**
 * Codul fara comentarii, ca o cautare pe sursa sa nu se poticneasca de vorbele
 * despre cod. Merge caracter cu caracter fiindca sirurile si sabloanele pot
 * contine `//` — un `https://` taiat cu regexul ar fi ascuns tocmai randurile
 * pe care le cautam.
 */
function faraComentarii(cod: string): string {
  let out = "";
  let i = 0;
  while (i < cod.length) {
    const c = cod[i], d = cod[i + 1];
    if (c === "/" && d === "/") { while (i < cod.length && cod[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < cod.length && !(cod[i] === "*" && cod[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "\'" || c === "`") {
      const q = c; out += c; i++;
      while (i < cod.length && cod[i] !== q) { if (cod[i] === "\\") { out += cod[i]; i++; } out += cod[i]; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/* ─────────────────────── 1. Moneda ─────────────────────── */

test("⚠ moneda lipsa se poarta ca o moneda straina: amandoua opresc conversia", () => {
  /*
    ⚠ CE APARA. Taxonomia noastra cunoaste doar `RON`, fiindca atat facturam. O
    suma incasata in alta moneda, trimisa cu eticheta `RON`, raporteaza un venit
    fals — si nu cade nimic, deci nimic n-arata de ce.

    ⚠ SI DE CE E AICI SI GOLUL, nu doar strainul. Webhook-ul scria
    `session.currency ?? "ron"` sub un titlu care spunea, cu litere mari, „MONEDA
    SE VERIFICA, NU SE TOARNA". O sesiune cu moneda goala trecea drept lei.
  */
  assert.equal(monedaDeIncredere("ron"), "RON");
  assert.equal(monedaDeIncredere("RON"), "RON", "moneda scrisa cu majuscule a fost respinsa");
  for (const strain of ["eur", "EUR", "usd", "", null, undefined, "ro", "ronn"]) {
    assert.equal(monedaDeIncredere(strain), null, `"${strain}" a trecut drept lei`);
  }
});

test("⚠ regula monedei e UNA, chemata din amandoua capetele conversiei", () => {
  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ DEFECTUL PE CARE IL INCHIDE, SI E UN TIPAR, NU O INTAMPLARE
    ═══════════════════════════════════════════════════════════════════════════

    Aceeasi conversie pleaca pe doua drumuri: din browser, cand omul se intoarce
    de la Stripe, si de pe server, din webhook. Regula monedei era scrisa in
    amandoua, de mana.

    Cand a fost reparata, a fost reparata INTR-UNUL. Browserul a invatat sa refuze
    o moneda necunoscuta si a primit si o proba; webhook-ul a ramas cu turnarea.
    Aceeasi lectie ca la Trendyol si About You: o nota buna nu trece singura la
    urmatoarea integrare.

    ⚠ DE ASTA PROBA NU SE UITA LA PURTARE, ci la faptul ca NU EXISTA A DOUA
    SCRIERE A REGULII. O purtare corecta scrisa de doua ori se poate desparti din
    nou maine.
  */
  const capete = [
    "src/lib/edinio-marketing/verdict-plata.ts",
    "src/app/api/stripe/webhook/route.ts",
  ];
  for (const p of capete) {
    const cod = readFileSync(p, "utf8");
    assert.match(cod, /monedaDeIncredere\(/,
      `${p} nu mai cheama regula comuna a monedei — si-o scrie iar de mana`);
    /*
      ⚠ SI NU SE MAI TOARNA NICAIERI. `?? "ron"` e chiar forma prin care defectul
      a intrat; daca reapare, cade aici, oricat de bine ar suna comentariul de
      deasupra lui.

      ⚠ SE CAUTA IN COD, NU IN COMENTARII — si randurile astea au invatat-o pe
      pielea lor. Prima forma cauta in fisierul intreg si a cazut pe COMENTARIUL
      de deasupra reparatiei, care citeaza chiar forma veche ca s-o explice. O
      proba care nu deosebeste codul de vorbele despre cod nu apara o regula, ci
      interzice sa scrii despre ea.
    */
    assert.ok(
      !/currency\s*(\?\?|\|\|)\s*["']ron["']/i.test(faraComentarii(cod)),
      `${p} toarna iar "ron" cand Stripe tace`,
    );
  }
});

test("⚠ o sesiune platita FARA moneda nu produce nicio conversie", () => {
  const buna: SesiuneStripe = {
    id: "cs_test_x", status: "complete", payment_status: "paid",
    amount_total: 24900, currency: "ron",
    client_reference_id: "u1", metadata: { user_id: "u1", plan: "pro" },
  };
  assert.equal(verdictulPlatii(buna, "u1").ok, true, "martorul: o sesiune buna trece");
  assert.equal(verdictulPlatii({ ...buna, currency: null }, "u1").ok, false, "fara moneda a trecut");
  assert.equal(verdictulPlatii({ ...buna, currency: "eur" }, "u1").ok, false, "euro a trecut drept lei");

  const v = verdictulPlatii(buna, "u1");
  if (v.ok) assert.equal(v.moneda, "RON", "moneda raportata nu mai vine din regula comuna");
});

/* ─────────────────────── 2. Articolul ─────────────────────── */

/** Prinde ce a ajuns la `gtag`, punand o lume in care GA4 e configurat. */
function ceAPlecatLaGa4(ev: Record<string, unknown>): Record<string, unknown> | null {
  const g = globalThis as unknown as Record<string, unknown>;
  const inainte = g.window;
  const primite: unknown[][] = [];
  try {
    g.window = {
      gtag: (...a: unknown[]) => { primite.push(a); },
      __edinioGa4Pornit: true,
      dataLayer: [],
    };
    adaptorGa4.trimite(ev as never, { page_type: "landing", page_group: "onboarding" } as never);
  } finally {
    if (inainte === undefined) delete g.window; else g.window = inainte;
  }
  const eveniment = primite.find((a) => a[0] === "event");
  return eveniment ? (eveniment[2] as Record<string, unknown>) : null;
}

const PURCHASE = {
  name: "purchase", plan_id: "pro", billing_period: "annual",
  value: 249, currency: "RON", event_id: "cs_test_abc",
};

test("⚠ `purchase` isi duce articolul, altfel rapoartele de comert din GA4 raman goale", () => {
  /*
    ⚠ CE LIPSEA. Venitul se vedea — GA4 il ia din `value`, nu din suma articolelor
    — dar „ce plan s-a vandut" nu se putea citi de nicaieri: sectiunea de comert
    din GA4 se umple din `items`, si `items` nu pleca.

    ⚠ SI PRETUL VINE DIN CE S-A INCASAT. `value` se naste din `amount_total` de la
    Stripe, deci reducerile si proratiile sunt deja in el. Un pret luat din tabelul
    de preturi ar fi o presupunere raportata ca venit.
  */
  const p = ceAPlecatLaGa4(PURCHASE);
  assert.ok(p, "`purchase` nu mai ajunge la GA4 deloc");

  const items = p.items as Array<Record<string, unknown>> | undefined;
  assert.ok(Array.isArray(items) && items.length === 1, "`purchase` pleaca fara `items`");
  assert.equal(items[0].item_id, "pro", "articolul nu spune ce plan s-a vandut");
  assert.equal(items[0].price, 249, "pretul articolului nu e suma incasata");
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].item_category, "annual", "articolul nu spune lunar/anual");

  /* ⚠ Si nu s-a pierdut ce era deja acolo. */
  assert.equal(p.transaction_id, "cs_test_abc", "`transaction_id` s-a pierdut odata cu adaugarea articolului");
  assert.equal(p.value, 249);
  assert.equal(p.currency, "RON");
});

test("⚠ `begin_checkout` NU primeste un articol, si asta e hotararea", () => {
  /*
    ⚠ DE CE NU. Acolo omul abia a intrat pe pagina de planuri si n-a ales nimic:
    evenimentul n-are nici `plan_id`, nici `value`, nici `currency`. Un articol
    construit acolo ar fi un rand gol in raport — un „ceva" fara pret si fara nume
    adevarat, care arata a date si nu e.

    ⚠ SI DE CE E O PROBA, nu doar o omisiune. Cine citeste ca `purchase` are
    `items` va vrea sa „repare" si aici, din simetrie. Randurile astea spun ca
    lipsa e aleasa.
  */
  const p = ceAPlecatLaGa4({ name: "begin_checkout", billing_period: "monthly" });
  assert.ok(p, "martorul: `begin_checkout` chiar pleaca spre GA4");
  assert.equal(p.items, undefined, "`begin_checkout` a primit un articol gol");
  assert.equal(p.billing_period, "monthly", "martorul: evenimentul isi duce parametrii");
});
