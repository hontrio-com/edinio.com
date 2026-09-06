import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randPersonalizare } from "@/lib/email";

/**
 * Personalizarea ajunge in emailul comerciantului SI in al clientului.
 *
 * ═══ ⚠ DE CE EXISTA FISIERUL ASTA ═══
 *
 * Un ajutor care facea exact lucrul asta a mai existat o data si s-a PIERDUT la o curatenie:
 * `grep -rn randConfiguratie src/` da azi zero, desi in istorie e scris cu tot cu motive. Nimic
 * n-a cazut cand a plecat — nici tsc, nici testele, nici build-ul — fiindca un email caruia ii
 * lipseste un rand se trimite in continuare, la fel de verde. A doua oara nu mai trebuie sa se
 * poata intampla in tacere, si de-asta prima proba de mai jos citeste SURSA: intr-o proba nu se
 * poate randa emailul intreg (nu exista harness care sa cheme `sendNewOrderEmail`), deci
 * legatura dintre ajutor si constructorul de randuri se apara pe text.
 *
 * ⚠ CE COSTA lipsa lui: atelierul primeste „Fototapet personalizat x1 — 1.234,00 lei" si atat,
 * desi dimensiunile, textul scris de client si fisierul incarcat sunt toate scrise in comanda.
 */

const RAD = process.cwd();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF (`order.actions.ts` e unul). */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

/** Bucata de la `export ... function <nume>` pana la urmatorul export de nivel zero. */
function corpul(text: string, nume: string): string {
  const start = text.indexOf(`export async function ${nume}(`);
  assert.notEqual(start, -1, `nu s-a gasit ${nume} in src/lib/email.ts`);
  const stop = text.indexOf("\nexport ", start + 1);
  return text.slice(start, stop === -1 ? text.length : stop);
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. LEGATURA: ajutorul e CHEMAT, nu doar scris
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ ambele emailuri de comanda cheama `randPersonalizare` in constructorul de randuri", () => {
  const email = sursa("src/lib/email.ts");

  for (const nume of ["sendNewOrderEmail", "sendOrderConfirmationToCustomer"]) {
    const corp = corpul(email, nume);
    assert.ok(
      corp.includes("${esc(i.name)}"),
      `${nume}: nu s-a gasit constructorul de randuri de produs`,
    );
    assert.ok(
      corp.includes("${randPersonalizare(i)}"),
      `${nume}: randul de produs nu mai spune ce a personalizat clientul`,
    );
  }
});

test("⚠ `emailPayload` din `placeOrder` duce mai departe instantaneul", () => {
  /*
   * Celalalt capat al lantului. Ajutorul poate fi chemat perfect si sa nu aiba ce citi:
   * `orders.items[].customization` se scrie corect de luni de zile, dar pana acum nu intra
   * niciodata in obiectul trimis emailurilor.
   */
  const actions = sursa("src/lib/actions/order.actions.ts");
  const start = actions.indexOf("const emailPayload = {");
  assert.notEqual(start, -1, "nu s-a gasit `emailPayload` in order.actions.ts");
  const stop = actions.indexOf("\n      };", start);
  assert.notEqual(stop, -1, "nu s-a gasit capatul lui `emailPayload`");
  const payload = actions.slice(start, stop);

  assert.ok(payload.includes("allItems.map"), "liniile nu mai vin din `allItems`");
  assert.ok(
    payload.includes('"customization" in i'),
    "instantaneul nu mai ajunge in payload-ul de email — emailurile n-au ce citi",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. PURTAREA: ce iese e ESCAPAT
   ═══════════════════════════════════════════════════════════════════════════ */

/** Forma reala a instantaneului: `Record<id, { type, label, value }>`. Vezi `customization/comanda.ts`. */
const LINIE_OSTILA = {
  product_id: "p1",
  name: "Fototapet personalizat",
  quantity: 1,
  price: 1234,
  customization: {
    d: { type: "dimensiuni", label: "Dimensiuni", value: "350 x 250 cm" },
    t: {
      type: "textarea",
      label: "Text <script>alert('et')</script>",
      value: "Ana & \"Bob\" <script>alert(1)</script>",
    },
  },
};

test("⚠ eticheta si valoarea trec prin escapare: formularul e PUBLIC", () => {
  const out = randPersonalizare(LINIE_OSTILA);

  assert.ok(out.includes("350 x 250 cm"), "dimensiunile nu ajung in email");
  assert.ok(!out.includes("<script"), "HTML de la un strain ajunge intreg in casuta comerciantului");
  assert.ok(!out.includes("</script"), "HTML de la un strain ajunge intreg in casuta comerciantului");
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "valoarea nu e escapata");
  assert.ok(out.includes("Text &lt;script&gt;"), "eticheta nu e escapata");
  assert.ok(out.includes("Ana &amp; &quot;Bob&quot;"), "`&` si ghilimelele nu sunt escapate");
});

test("⚠ fisierele se dau ca NUMAR plus legaturi, nu ca imagini", () => {
  const out = randPersonalizare({
    customization: {
      f: {
        type: "image",
        label: "Macheta",
        value: [
          "https://cdn.exemplu.ro/products/customizations/b1/a.jpg",
          "javascript:alert(1)",
          "https://cdn.exemplu.ro/products/customizations/b1/b\"onload=x.jpg",
        ],
      },
    },
  });

  assert.ok(!out.includes("<img"), "clientii de mail blocheaza imaginile: ar fi iesit un dreptunghi gol");
  assert.ok(out.includes("3 fisiere"), "atelierul nu afla cate fisiere are de deschis");
  assert.ok(
    out.includes('href="https://cdn.exemplu.ro/products/customizations/b1/a.jpg"'),
    "legatura buna nu se poate deschide",
  );
  assert.ok(!/javascript:/i.test(out), "un `javascript:` a ramas intr-un `href` din panoul comerciantului");
  assert.ok(out.includes('href="#"'), "adresa refuzata ar fi trebuit sa devina `#`");
  assert.ok(!out.includes('b"onload'), "ghilimeaua iese din atributul `href`");
});

test("⚠ numarul anuntat e cat se poate DESCHIDE, nu cat a trimis clientul", () => {
  /*
   * ⚠ Numarul si legaturile trebuie sa vina din ACEEASI lista. Tabloul sta in `orders.items`,
   * jsonb vechi si editabil din panou, deci poate avea si intrari care nu sunt adrese; numarate
   * si ele, emailul ar spune „4 fisiere (1, 2)" si atelierul ar cauta doua machete care nu exista
   * nicaieri — ori ar opri o comanda gata platita ca sa le ceara.
   */
  const out = randPersonalizare({
    customization: {
      f: {
        type: "image",
        label: "Macheta",
        value: ["https://cdn.exemplu.ro/a.jpg", null, "   ", "https://cdn.exemplu.ro/b.jpg"],
      },
    },
  });

  const anuntat = Number(/Macheta: (\d+) fisier/.exec(out)?.[1]);
  const legaturi = (out.match(/<a /g) ?? []).length;
  assert.equal(anuntat, 2, `s-au numarat si intrarile care nu sunt adrese: ${out}`);
  assert.equal(legaturi, anuntat, `s-au anuntat ${anuntat} fisiere, dar se pot deschide ${legaturi}`);
});

test("un singur fisier se numara la singular", () => {
  const out = randPersonalizare({ customization: { f: { type: "image", label: "Macheta", value: ["https://cdn.exemplu.ro/a.jpg"] } } });
  assert.ok(out.includes("1 fisier "), out);
  assert.ok(!out.includes("1 fisiere"), out);
});

test("randurile scrise de client raman randuri, dar `<br>` vine de la NOI", () => {
  const out = randPersonalizare({ customization: { t: { type: "textarea", label: "Text", value: "sus\njos" } } });
  assert.ok(out.includes("sus<br>jos"), out);
  const literal = randPersonalizare({ customization: { t: { type: "textarea", label: "Text", value: "a<br>b" } } });
  assert.ok(literal.includes("a&lt;br&gt;b"), literal);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. APARAREA: jsonb vechi si editabil din panou nu ARUNCA niciodata
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ nimic nu arunca: un email care arunca nu se trimite deloc", () => {
  const gunoaie: unknown[] = [
    null,
    undefined,
    "linie",
    42,
    [],
    {},
    { customization: null },
    { customization: "text" },
    { customization: [] },
    { customization: { a: null } },
    { customization: { a: "sir" } },
    { customization: { a: [] } },
    { customization: { a: { label: 7, value: "x" } } },
    { customization: { a: { value: "fara eticheta" } } },
    { customization: { a: { label: "Fara valoare" } } },
    { customization: { a: { label: "Gol", value: "   " } } },
    { customization: { a: { label: "Tablou gol", value: [] } } },
    { customization: { a: { label: "Tablou de gunoi", value: [null, 3, "  "] } } },
    { customization: { a: { label: "Valoare obiect", value: { x: 1 } } } },
  ];
  for (const g of gunoaie) {
    assert.equal(randPersonalizare(g), "", `a iesit ceva pentru ${JSON.stringify(g)}`);
  }
});

test("intrarile stricate se SAR, cele bune raman", () => {
  const out = randPersonalizare({
    customization: {
      rea: { label: "", value: "nu se vede" },
      buna: { type: "text", label: "Nume", value: "Ana" },
      alta: { label: "Fara valoare" },
    },
  });
  assert.ok(out.includes("Nume: Ana"), out);
  assert.ok(!out.includes("nu se vede"), out);
  assert.ok(!out.includes("Fara valoare"), out);
});

test("o linie fara personalizare nu adauga nimic sub numele produsului", () => {
  assert.equal(randPersonalizare({ product_id: "extra_1", name: "Comanda cu Prioritate", quantity: 1, price: 5 }), "");
});
