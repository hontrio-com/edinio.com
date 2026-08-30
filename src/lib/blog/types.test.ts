import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import {
  adreseBune, asteaptaCeasul, minuteDeCitit, pliaza, seVede, slugDin,
  SLUGURI_REZERVATE_BLOG,
} from "./types";

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

// ── Profilurile publice ale autorului ──

/*
  ⚠ DE CE E FUNCȚIA ASTA PROBATĂ SEPARAT.

  Pe 30.08.2026 filtrarea exista DOAR în acțiunea de server, adică doar pe drumul
  prin care scrie omul. Un rând pus direct în bază („nu-e-adresa") a trecut
  netulburat și a ajuns întreg în `Person.sameAs` din datele structurate, și ca
  buton în pagină.

  `sameAs` e o declarație verificabilă despre cine e autorul. Una care nu duce
  nicăieri e mai rea decât lipsa ei: trece drept afirmație și cade la prima
  verificare. Acum funcția se cheamă și la scriere, și la afișare.
*/

test("un rand care nu e adresa nu trece", () => {
  assert.deepEqual(adreseBune(["nu-e-adresa"]), []);
  assert.deepEqual(adreseBune(["www.linkedin.com/in/x"]), [], "lipsa protocolului nu face o adresa");
  assert.deepEqual(adreseBune([""]), []);
  assert.deepEqual(adreseBune(["   "]), []);
});

test("adresele bune trec, si se curata de spatii", () => {
  assert.deepEqual(
    adreseBune(["  https://www.linkedin.com/in/x  ", "http://exemplu.ro"]),
    ["https://www.linkedin.com/in/x", "http://exemplu.ro"],
  );
});

test("scheme periculoase nu trec", () => {
  // `javascript:` ar deveni un buton apasabil in pagina de autor.
  assert.deepEqual(adreseBune(["javascript:alert(1)"]), []);
  assert.deepEqual(adreseBune(["data:text/html,<script>x</script>"]), []);
  assert.deepEqual(adreseBune(["file:///etc/passwd"]), []);
});

test("lista goala sau lipsa nu strica nimic", () => {
  assert.deepEqual(adreseBune([]), []);
  assert.deepEqual(adreseBune(null), []);
  assert.deepEqual(adreseBune(undefined), []);
});

test("rele si bune amestecate: raman doar bunele", () => {
  // Cazul adevarat: un rand gresit langa unul corect nu trebuie sa le piarda pe
  // amandoua, dar nici sa treaca cu ele.
  assert.deepEqual(
    adreseBune(["https://x.ro", "stricat", "https://y.ro"]),
    ["https://x.ro", "https://y.ro"],
  );
});

// ── Adresele pe care un articol nu le poate lua ──────────────────────────────

/*
  ⚠ PROBA ASTA ERA PROMISĂ ÎNTR-UN COMENTARIU ȘI NU EXISTA.

  `types.ts` spunea, negru pe alb, „proba din `types.test.ts` compară cele două
  liste și cade dacă se despart". Nu compara nimeni nimic. O notă care promite o
  plasă inexistentă e mai rea decât lipsa notei: următorul care adaugă o rută sub
  `/blog` o citește și pleacă liniștit.

  Ce apără: un articol cu slugul „cautare" ar fi acceptat de bază, salvat,
  publicat, ar apărea în listă și în sitemap — dar `/blog/cautare` e ruta de
  căutare, iar Next alege întotdeauna segmentul static. Articolul ar exista
  peste tot, mai puțin la propria lui adresă, și nimic n-ar da vreo eroare.
*/
test("fiecare dosar de sub /blog e un slug rezervat", () => {
  const dosare = readdirSync("src/app/(website)/blog", { withFileTypes: true })
    .filter((d) => d.isDirectory())
    /* `[slug]` e chiar ruta articolului, deci nu e o adresă ocupată. */
    .map((d) => d.name)
    .filter((n) => !n.startsWith("[") && !n.startsWith("("));

  const lipsa = dosare.filter((d) => !SLUGURI_REZERVATE_BLOG.has(d));
  assert.deepEqual(
    lipsa, [],
    `rute sub /blog care NU sunt în SLUGURI_REZERVATE_BLOG: ${lipsa.join(", ")}`,
  );
});

test("nu se rezervă adrese care nu sunt rute — ar bloca titluri degeaba", () => {
  const dosare = new Set(
    readdirSync("src/app/(website)/blog", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  );
  const inPlus = [...SLUGURI_REZERVATE_BLOG].filter((r) => !dosare.has(r));
  assert.deepEqual(
    inPlus, [],
    `rezervate fără rută: ${inPlus.join(", ")} — un redactor ar fi oprit degeaba`,
  );
});

// ── Plierea diacriticelor, față în față cu baza ──────────────────────────────

/*
  ⚠ PERECHILE SUNT LUATE DIN BAZA ADEVĂRATĂ, nu scrise din cap.

  Fiecare rând de mai jos e rezultatul lui
  `select lower(public.fara_diacritice(t))` rulat pe 30.08.2026. Coloana
  `blog_posts.cauta` e derivată cu funcția aceea; dacă `pliaza` se desparte de
  ea, căutarea nu crapă — pur și simplu nu mai găsește. Cineva scrie „livrări",
  nu primește nimic, și crede că nu există articolul.

  Așa s-a găsit singura despărțire care era: `Straße`. `ß` nu e o diacritică
  românească și `normalize("NFD")` nu-l desface, deci trecea neatins prin
  `pliaza`, în timp ce `unaccent` îl scrie „ss".
*/
const CA_IN_BAZA: [string, string][] = [
  ["Livrări", "livrari"], ["LIVRĂRI", "livrari"],
  ["Întârziere", "intarziere"], ["ÎNTÂRZIERE", "intarziere"],
  ["Așteptare", "asteptare"], ["AȘTEPTARE", "asteptare"],
  ["Plăți", "plati"], ["Țară", "tara"], ["ŢARĂ", "tara"],
  ["şi", "si"], ["Ş", "s"],
  ["â", "a"], ["Â", "a"], ["î", "i"], ["Î", "i"], ["ă", "a"], ["Ă", "a"],
  ["ș", "s"], ["Ș", "s"], ["ț", "t"], ["Ț", "t"],
  ["Găsești", "gasesti"], ["mâine", "maine"], ["coș", "cos"], ["preț", "pret"],
  /* Și semne care nu sunt românești, fiindcă în articole apar nume de mărci. */
  ["Ediniö", "edinio"], ["naïve", "naive"], ["Straße", "strasse"],
];

test("pliaza da exact ce da fara_diacritice din baza", () => {
  const diferite = CA_IN_BAZA.filter(([intrare, dinBaza]) => pliaza(intrare) !== dinBaza)
    .map(([intrare, dinBaza]) => `${intrare}: js=${pliaza(intrare)} baza=${dinBaza}`);
  assert.deepEqual(diferite, [], `s-au despartit:\n  ${diferite.join("\n  ")}`);
});
