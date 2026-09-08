import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citesteEticheta, MAX_ETICHETA_OCTETI, PREFIX_ETICHETE } from "./eticheta";

/* ══════════════════════════════════════════════════════════════════════════
   ETICHETA DE COLET PRIMITA DE LA PEPITA (08.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE A COSTAT. Documentatia lor are `package_label`, iar noi il aruncam tacut. Cand un audit
   extern a spus ca exista, am cautat in copia pastrata de noi si am raspuns, de DOUA ori, ca nu
   apare in documentatie. Copia aia era o reimprimare a unei versiuni vechi — nu fisierul lor.
   Toata povestea, cu metadatele care o dovedesc, in `docs/pepita/README.md`.

   ⚠ SI DE CE E O PIESA DE SECURITATE, NU DE COMODITATE. Octetii vin din afara, ajung intr-un
   depozit si sunt serviti inapoi cu `application/pdf`. Fiecare verificare de mai jos apara ceva ce
   s-a intamplat deja in proiectul asta: un raspuns citit pe dos salvat ca fisier bun, un antet in
   care crezi in locul octetilor, un fisier public care poarta datele unui om.
*/

const PDF_MIC = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "latin1");
const b64 = (b: Buffer) => b.toString("base64");

test("lipsa e lipsa, nu eroare", () => {
  /* O comanda fara eticheta e cazul OBISNUIT: vine doar la Pepita Delivery, si nici acolo mereu. */
  for (const gol of [null, undefined, "", "   ", "\n\n"]) {
    assert.equal(citesteEticheta(gol).fel, "lipsa", JSON.stringify(gol));
  }
});

test("un PDF adevarat trece, si iese cu octetii lui", () => {
  const r = citesteEticheta(b64(PDF_MIC));
  assert.equal(r.fel, "buna");
  if (r.fel !== "buna") return;
  assert.deepEqual(r.octeti, PDF_MIC);
});

test("⚠ si rupt pe randuri de 76 de semne, cum il rup unele biblioteci", () => {
  /* Base64 din MIME vine adesea cu randuri. Refuzat pentru asta, ar fi fost o eticheta pierduta
     dintr-un detaliu de formatare. */
  const rupt = b64(PDF_MIC).replace(/(.{4})/g, "$1\n");
  assert.equal(citesteEticheta(rupt).fel, "buna");
});

test("⚠ ce nu e Base64 se refuza INAINTE de decodare", () => {
  /*
   * ⚠ ASTA E VERIFICAREA CARE PARE DE PRISOS SI NU E. `Buffer.from(x, "base64")` NU arunca pe
   * intrare nevalida: sare peste ce nu recunoaste si intoarce ce a apucat. Fara verificarea de
   * forma, un sir de gunoi ar fi fost decodat in gunoi mai scurt, scris in depozit, si servit
   * comerciantului cu `application/pdf`.
   */
  for (const rau of ["nu sunt base64!!", "%PDF-1.4 direct, nu codat", "@@@@"]) {
    const r = citesteEticheta(rau);
    assert.equal(r.fel, "rea", rau);
    if (r.fel === "rea") assert.match(r.motiv, /Base64/);
  }
});

test("⚠ ce nu e PDF se refuza, oricat de valid ar fi Base64-ul", () => {
  /*
   * Tiparul „citeste raspunsul PE DOS": o pagina HTML de eroare, codata cinstit, ar fi trecut de
   * toate celelalte verificari. Comerciantul ar fi aflat de la imprimanta.
   */
  const r = citesteEticheta(b64(Buffer.from("<html>Eroare 500</html>", "latin1")));
  assert.equal(r.fel, "rea");
  if (r.fel === "rea") assert.match(r.motiv, /PDF/);
});

test("⚠ plafonul taie si INAINTE, si DUPA decodare", () => {
  /*
   * Inainte, ca sa nu decodam in memoria functiei ceva urias. Dupa, fiindca raportul 4/3 e o
   * presupunere despre intrare, iar intrarea vine de la altcineva: cu spatii, un sir „mic" poate
   * ascunde octeti multi.
   */
  const prea = b64(Buffer.concat([PDF_MIC, Buffer.alloc(MAX_ETICHETA_OCTETI, 0x41)]));
  const r = citesteEticheta(prea);
  assert.equal(r.fel, "rea");
  if (r.fel === "rea") assert.match(r.motiv, /plafon/);

  /* Si un sir imens, care nici n-ar trebui decodat ca sa se stie ca e prea mare. */
  const imens = "A".repeat(Math.ceil((MAX_ETICHETA_OCTETI * 4) / 3) + 1000);
  assert.equal(citesteEticheta(imens).fel, "rea");
});

test("ce nu e text nu e eticheta", () => {
  for (const rau of [42, true, {}, [], { data: "x" }]) {
    assert.equal(citesteEticheta(rau).fel, "rea", JSON.stringify(rau));
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   SI DRUMUL DE LA CAPATUL CELALALT
   ══════════════════════════════════════════════════════════════════════════ */

const RAND_NOU = String.fromCharCode(10);

test("⚠ eticheta se scrie in galeata PRIVATA, nu prin `uploadToR2`", () => {
  /*
   * `uploadToR2` scrie in galeata PUBLICA, intoarce adresa publica, si are implicit
   * `public, max-age=31536000, immutable`. Pentru un document cu numele, adresa si telefonul unui
   * cumparator, fiecare dintre cele trei e gresita. Lectia e scrisa in `fisiere-private.ts` si a
   * fost platita o data, la incarcarile cumparatorilor.
   */
  const sursa = readFileSync("src/lib/pepita/eticheta.ts", "utf8");
  assert.match(sursa, /incarcaPrivat\(/);
  /* ⚠ Se cere sa nu existe APELUL, nu cuvantul: chiar fisierul isi explica in comentariu de ce
     nu foloseste `uploadToR2`, si o cautare oarba ar fi cazut pe propria lui nota. */
  assert.doesNotMatch(sursa, /uploadToR2\(/);
  assert.doesNotMatch(sursa, /import \{[^}]*uploadToR2/);
  assert.match(sursa, /galeataIncarcarilor\(\)/);
});

test("⚠ ruta care serveste eticheta are toate cele patru porti", () => {
  const sursa = readFileSync("src/app/api/pepita/eticheta/route.ts", "utf8");

  assert.match(sursa, /auth\.getUser\(\)/, "fara sesiune");
  assert.match(sursa, /\.eq\("user_id", user\.id\)/, "fara proprietatea magazinului");
  /*
   * ⚠ A PATRA POARTA NU E CEA DE LA `customization-file`. Acolo se cere „cheia sa fie in
   * `orders.items`". Aici ar fi gresit: pe comenzile de marketplace adaugarea de linii din panou e
   * permisa, deci autorizatia ar atarna de un jsonb care se rescrie sub noi.
   */
  assert.match(sursa, /from\("pepita_comenzi"\)/, "fara legatura cu comanda Pepita");
  assert.match(sursa, /\.eq\("order_id", orderId\)/);
  assert.match(sursa, /\.eq\("business_id", businessId\)/, "citirea de sistem fara filtru pe magazin");
  assert.match(sursa, /rateLimit\(/, "fara frana");

  /* ⚠ Raspunsul poarta un link semnat: cache-uit, ar fi servit altcuiva cat mai e valabil. */
  assert.match(sursa, /"cache-control": "private, no-store"/);
  /* ⚠ Si depozitul cazut NU e „fisier negasit": comerciantul ar cere alta eticheta degeaba. */
  assert.match(sursa, /503/);
});

test("⚠ prefixul etichetelor e maturat de cronul de retentie", () => {
  /*
   * Un prefix pe care nu-l matura nimeni inseamna date personale pastrate la nesfarsit — si nimeni
   * n-ar observa, fiindca curatenia ar raporta in fiecare zi ca s-a terminat cu bine.
   */
  const cron = readFileSync("src/app/api/cron/curata-fisiere/route.ts", "utf8");
  assert.match(cron, /PREFIX_ETICHETE/, "cronul nu stie de dosarul etichetelor");
  assert.match(cron, /cheieEticheta\(/, "eticheta unei comenzi vii nu e aparata de stergere");
  assert.equal(PREFIX_ETICHETE.endsWith("/"), true, "prefixul trebuie sa fie un dosar");
});

test("⚠ plafonul corpului cererii incape o eticheta, altfel comanda se pierde", () => {
  /*
   * Base64 umfla cu 4/3. Cu plafonul vechi de 512 KB, orice eticheta peste ~380 KB facea sa cada
   * TOATA comanda, cu 413, inainte ca ceva sa fie salvat — iar „Resend order" e un buton apasat de
   * om, deci comanda ramanea pierduta.
   */
  const ruta = readFileSync("src/lib/pepita/ruta-comenzi.ts", "utf8");
  const linia = ruta.split(RAND_NOU).find((l) => l.includes("const MAX_OCTETI"));
  assert.ok(linia, "plafonul corpului a disparut");
  const m = linia.match(/(\d+)\s*\*\s*1024\s*\*\s*1024|(\d+)\s*\*\s*1024/);
  assert.ok(m, `plafonul nu se mai poate citi: ${linia}`);
  const octeti = m[1] ? Number(m[1]) * 1024 * 1024 : Number(m[2]) * 1024;
  const nevoie = Math.ceil((MAX_ETICHETA_OCTETI * 4) / 3);
  assert.ok(
    octeti > nevoie,
    `plafonul corpului (${octeti}) nu incape o eticheta la plafonul ei (${nevoie} codati)`,
  );
});
