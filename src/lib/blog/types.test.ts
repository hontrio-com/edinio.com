import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { asteaptaCeasul, minuteDeCitit, seVede, slugDin } from "./types";

/*
  Regula care hotaraste daca un articol se vede e scrisa in DOUA locuri: ca
  politica de citire in baza (`scripts/migrations/2026-08-30_blog.sql`) si ca
  `seVede()` aici. Baza e paza adevarata; `seVede` e ca ecranele de admin sa
  poata spune „se vede" / „nu se vede" fara sa mai intrebe baza.

  Probele de mai jos apara amandoua capetele.
*/

const ACUM = new Date("2026-08-30T12:00:00Z");
const IERI = "2026-08-29T12:00:00Z";
const MAINE = "2026-08-31T12:00:00Z";

// ── Cine se vede si cine nu ──

test("doar articolul publicat cu data trecuta se vede", () => {
  assert.equal(seVede({ status: "published", published_at: IERI }, ACUM), true);
});

test("ciorna nu se vede, oricat de veche ar fi data", () => {
  assert.equal(seVede({ status: "draft", published_at: IERI }, ACUM), false);
});

test("articolul la verificare nu se vede", () => {
  assert.equal(seVede({ status: "review", published_at: IERI }, ACUM), false);
});

test("articolul arhivat nu se mai vede", () => {
  assert.equal(seVede({ status: "archived", published_at: IERI }, ACUM), false);
});

test("publicat cu data in viitor asteapta ceasul, nu se vede inca", () => {
  const a = { status: "published" as const, published_at: MAINE };
  assert.equal(seVede(a, ACUM), false);
  assert.equal(asteaptaCeasul(a, ACUM), true);
});

test("publicat fara data nu se vede", () => {
  // Baza nu ingaduie asta (`blog_posts_published_has_date`), dar daca vreodata
  // ar ingadui-o, un articol fara data nu are cum sa fie ordonat si nu are ce
  // cauta in lista. Regula nu se sprijina doar pe constrangerea din baza.
  assert.equal(seVede({ status: "published", published_at: null }, ACUM), false);
});

test("ce nu se vede si nu e programat nu asteapta nimic", () => {
  assert.equal(asteaptaCeasul({ status: "draft", published_at: MAINE }, ACUM), false);
  assert.equal(asteaptaCeasul({ status: "published", published_at: IERI }, ACUM), false);
});

/*
  ⚠ CE DOVEDESTE PROBA URMATOARE SI CE NU.

  Nu ruleaza SQL si nu atinge baza. Citeste fisierul de migrare si se uita daca
  politica publica mai contine cele trei conditii pe care le are si `seVede`.

  Deci NU dovedeste ca baza se poarta asa — pentru asta am bagat patru randuri
  si le-am citit ca `anon` cand am facut migrarea. Ce face e sa dea alarma daca
  cineva schimba o regula si o uita pe cealalta. Atat, dar exact asta e riscul:
  cele doua stau in fisiere diferite, in limbaje diferite, si nimic altceva nu
  le tine legate.
*/
test("politica din migrare are aceleasi trei conditii ca seVede", () => {
  const sql = readFileSync(
    new URL("../../../scripts/migrations/2026-08-30_blog.sql", import.meta.url),
    "utf8",
  );

  const politica = sql.slice(sql.indexOf("create policy blog_posts_public_read"));
  const pana = politica.slice(0, politica.indexOf(";"));

  assert.ok(pana.includes("status = 'published'"), "lipseste conditia de stare");
  assert.ok(pana.includes("published_at is not null"), "lipseste conditia de data existenta");
  assert.ok(pana.includes("published_at <= now()"), "lipseste conditia de ceas");
});

// ── Adresa web ──

test("diacriticele romanesti se aseaza pe literele lor", () => {
  assert.equal(slugDin("Cum îți alegi curierul"), "cum-iti-alegi-curierul");
  // Si virgula dedesubt (ș U+0219), si sedila (ş U+015F), amandoua circula in texte romanesti.
  assert.equal(slugDin("Măr și Țară — Şerban"), "mar-si-tara-serban");
});

test("semnele si spatiile in plus nu lasa urme", () => {
  assert.equal(slugDin("  Spații   multiple  "), "spatii-multiple");
  assert.equal(slugDin("eMAG: ghid 2026!"), "emag-ghid-2026");
});

test("un titlu lung se taie fara sa ramana cu cratima la coada", () => {
  // Taierea la 80 poate cadea fix pe o cratima; slug-ul nu are voie sa se
  // termine asa, fiindca `blog_posts_slug_form` din baza il respinge, iar un
  // `check` picat nu strica un camp, ci opreste INTREGUL rand sa existe.
  const lung = slugDin("a".repeat(78) + " cuvant urmator");
  assert.ok(lung.length <= 80);
  assert.ok(!lung.endsWith("-"), `s-a terminat cu cratima: ${JSON.stringify(lung)}`);
  assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lung), `nu trece de regula bazei: ${lung}`);
});

test("un nume din care nu iese nimic da sir gol, nu un slug stramb", () => {
  // Actiunea de server se bazeaza pe asta ca sa spuna omului ce s-a intamplat,
  // in loc sa-l lase sa primeasca „eroare la salvare" de la baza.
  assert.equal(slugDin("!!! ??? ..."), "");
  assert.equal(slugDin("   "), "");
});

// ── Minutele de citit ──

test("minutele se socotesc pe text, nu pe etichete HTML", () => {
  const cuvinte = Array.from({ length: 400 }, () => "cuvant").join(" ");
  const html = `<p class="ceva lung si plin de atribute">${cuvinte}</p>`;
  assert.equal(minuteDeCitit(html), 2);
});

test("un articol gol are macar un minut, nu zero", () => {
  assert.equal(minuteDeCitit(""), 1);
  assert.equal(minuteDeCitit("<p></p>"), 1);
});
