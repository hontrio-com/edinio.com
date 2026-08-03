import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, escapeUrl } from "./html-escape";

/**
 * Emailurile se compun prin lipirea de siruri, deci escaparea e singura bariera.
 *
 * Cele sase copii locale de `esc` din email.ts escapau `& < >` si atat. Testele
 * de mai jos apara exact ce le lipsea: ghilimelele, si contextul de atribut in
 * care lipsa lor conta.
 */

test("escapeHtml scapa toate cele cinci caractere, inclusiv ghilimelele", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("ampersandul se escapeaza primul, ca sa nu se dubleze escaparea", () => {
  // Daca `<` s-ar inlocui inaintea lui `&`, iesirea ar fi `&amp;lt;` si clientul
  // ar vedea textul „&lt;" pe ecran in loc de „<".
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml("&lt;"), "&amp;lt;");
});

test("numele reale de produs raman citibile", () => {
  // Masurat: 34 din 3685 de produse au `&` in nume (Jack&Jones, Mickey & Minnie).
  assert.equal(escapeHtml("Tricou barbati Jack&Jones"), "Tricou barbati Jack&amp;Jones");
  // Si unul are ghilimele: pana acum iesea netocat din toate cele sase copii.
  assert.equal(
    escapeHtml('Air Jordan One Take 5 "White Legend Blue'),
    "Air Jordan One Take 5 &quot;White Legend Blue",
  );
});

test("null si undefined dau sir gol, nu textul null", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("numerele trec neschimbate", () => {
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(129.9), "129.9");
});

/* ── Contextul de atribut: aici conteaza ghilimelele ── */

test("nu se poate iesi dintr-un atribut cu ghilimele duble", () => {
  const cod = '"><img src=x onerror=alert(1)>';
  const html = `<td title="${escapeHtml(cod)}">x</td>`;
  assert.ok(!html.includes('"><img'), "atributul a fost inchis de valoare");
  assert.equal(html, "<td title=\"&quot;&gt;&lt;img src=x onerror=alert(1)&gt;\">x</td>");
});

test("nu se poate iesi nici dintr-un atribut cu ghilimele simple", () => {
  const html = `<td title='${escapeHtml("' onmouseover='alert(1)")}'>x</td>`;
  assert.ok(!html.includes("' onmouseover"));
});

test("codul de reducere venit de la client nu mai poate injecta marcaj", () => {
  // `placeOrder` e export „use server" si `discount_code` vine din cerere; randul
  // asta ajunge in inboxul unei adrese tot alese de apelant.
  const rand = `<td>Reducere (${escapeHtml('X<script>alert(1)</script>')})</td>`;
  assert.ok(!rand.includes("<script>"));
});

/* ── escapeUrl: escaparea singura nu ajunge intr-un href ── */

test("adresele http si https trec intregi", () => {
  assert.equal(escapeUrl("https://edinio.com/magazin"), "https://edinio.com/magazin");
  assert.equal(escapeUrl("http://exemplu.ro"), "http://exemplu.ro");
});

test("mailto si tel sunt permise, ca butonul Suna clientul sa functioneze", () => {
  assert.equal(escapeUrl("mailto:a@b.ro"), "mailto:a@b.ro");
  assert.equal(escapeUrl("tel:+40721234567"), "tel:+40721234567");
});

test("caile relative raman relative", () => {
  assert.equal(escapeUrl("/dashboard/comenzi"), "/dashboard/comenzi");
});

test("javascript: si data: devin diez", () => {
  assert.equal(escapeUrl("javascript:alert(1)"), "#");
  assert.equal(escapeUrl("JavaScript:alert(1)"), "#");
  assert.equal(escapeUrl("data:text/html,<script>alert(1)</script>"), "#");
});

test("schema ascunsa cu spatii sau caractere de control tot se prinde", () => {
  // Browserele ignora tabul si linia noua din interiorul schemei, deci o
  // comparatie pe sirul brut ar fi lasat legatura sa treaca.
  assert.equal(escapeUrl("java\tscript:alert(1)"), "#");
  assert.equal(escapeUrl("  javascript:alert(1)"), "#");
  assert.equal(escapeUrl("java\nscript:alert(1)"), "#");
});

test("adresa fara schema, dar catre alta gazda, se respinge", () => {
  assert.equal(escapeUrl("//gazda-straina.ro/x"), "#");
});

test("escapeUrl escapeaza si ghilimelele adresei permise", () => {
  // Fara asta, un `"` in interiorul unei adrese http valide inchidea atributul.
  assert.equal(
    escapeUrl('https://exemplu.ro/a" onclick="alert(1)'),
    "https://exemplu.ro/a&quot; onclick=&quot;alert(1)",
  );
});

test("gol ramane gol, nu devine diez", () => {
  assert.equal(escapeUrl(""), "");
  assert.equal(escapeUrl(null), "");
  assert.equal(escapeUrl(undefined), "");
});
