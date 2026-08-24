import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O EDITARE NOUA NU ARE VOIE SA FIE STEARSA DE LUCRATORUL VECHI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CURSA, ASA CUM ERA.

   Unicul cozii e pe `(business_id, offer_id, op)`, iar punerea la coada e un `upsert`
   peste acelasi rand. Deci o a doua editare NU face un rand nou: il rescrie pe cel care
   exista, cu `attempts = 0` si fara asteptare.

     T0  produs = Titlu A · se pune in coada randul X
     T1  cronul revendica X, citeste produsul (Titlu A), pleaca cererea catre eMAG
     T2  comerciantul salveaza Titlu B · `upsert` rescrie CHIAR randul X
     T3  cererea reuseste · `delete where id = X`  ← sterge si cererea lui B

     Edinio = Titlu B · eMAG = Titlu A · coada = goala · eroare = niciuna

   ⚠ Pe pret si pe stoc, reconcilierea repara. Pe titlu, descriere, imagini,
   caracteristici, GPSR si categorie NU repara nimeni: nu exista o a doua sursa de adevar
   care sa vada deosebirea. Ramane asa pana cand cineva atinge produsul din alt motiv.

   ⚠ Si pe calea de esec era la fel de rau: `attempts + 1` scris peste cererea noua o
   facea sa mosteneasca incercarile celei vechi, si putea fi ABANDONATA fara sa fi fost
   incercata vreodata. `revendica_din_coada` sare peste `abandonat_la is not null`.

   ══════════════════════════════════════════════════════════════════════════
   CE DOVEDESTE PROBA ASTA, SI CE NU
   ══════════════════════════════════════════════════════════════════════════

   Comparatia insasi traieste in Postgres, deci a fost dovedita in Postgres, pe productie,
   intr-o tranzactie intoarsa la loc (25.08.2026):

     g1=1 (insert) · g2=2 (dupa un update) · g3=3 (dupa `upsert` cu conflict)
     delete … where generation = g1  ->  0 randuri
     delete … where generation = g3  ->  1 rand

   ⚠ Rulata ca `service_role`, adica exact rolul cronului — declansatorul se declanseaza
   si fara `execute` acordat, fiindca dreptul se verifica la crearea declansatorului, nu
   la fiecare scriere.

   Proba de mai jos pazeste CEALALTA jumatate, cea care se poate strica din cod: ca fiecare
   scriere in coada trece prin comparatie. O scriere directa strecurata inapoi peste sase
   luni ar reface gaura fara sa cada nimic.
*/

const NL = String.fromCharCode(10);

/** Cronul eMAG, fara comentarii: notele arata chiar formele reparate. */
function cronulFaraNote(): string {
  return readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("proba insasi vede cronul", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. */
  const cod = cronulFaraNote();
  assert.ok(cod.length > 10_000, `cronul pare gol (${cod.length} semne): proba nu citeste`);
  assert.match(cod, /emag_sync_queue/, "nici macar numele cozii nu se vede");
});

test("coada are un numarator de scrieri, si se ia din revendicare", () => {
  const cod = cronulFaraNote();
  assert.match(cod, /generation: number;/, "elementul de coada trebuie sa poarte generatia");
  assert.match(
    cod, /\.eq\("generation", el\.generation\)/,
    "scrierile trebuie sa ceara generatia cu care s-a revendicat randul",
  );
});

test("nicio scriere in coada nu ocoleste comparatia", () => {
  /*
   * ⚠ Asta e miezul. Se cauta scrieri directe pe `emag_sync_queue` legate de UN element
   * (`.eq("id", …)`), care ar trebui toate sa treaca prin `scoateDinCoada`/`scrieInCoada`.
   *
   * ⚠ Cele trei ajutoare sunt singurele care au voie, fiindca ele FAC comparatia. Se
   * recunosc dupa unde stau in fisier, nu dupa cum arata linia: inauntrul lor exista si
   * scrieri fara comparatie, si trebuie sa existe — sunt plasa scrisa anume pentru cazul
   * in care coloana lipseste cu totul.
   */
  const cod = cronulFaraNote();
  const linii = cod.split(NL);

  /* Marginile celor doua ajutoare: inauntrul lor, scrierea directa e chiar leacul. */
  const inceput = linii.findIndex((l) => l.includes("async function scoateDinCoada"));
  const sfarsit = linii.findIndex((l) => l.includes("async function elibereazaPentruCerereaNoua"));
  assert.ok(inceput > 0 && sfarsit > inceput, "n-am gasit ajutoarele de coada");

  const rele: string[] = [];
  linii.forEach((l, i) => {
    if (i >= inceput && i <= sfarsit + 6) return;
    if (!/from\("emag_sync_queue"\)/.test(l)) return;
    /* Stergerea in masa a unui magazin deconectat merge pe `.in("id", …)`: acolo nu e
       vorba de un element anume, ci de toata coada lui, si e corect sa plece toata. */
    if (/\.in\("id"/.test(l)) return;
    rele.push(`${i + 1}: ${l.trim()}`);
  });

  assert.deepEqual(
    rele, [],
    "scriere directa in coada, in afara ajutoarelor. Fara comparatia pe `generation`, "
    + "lucratorul vechi poate sterge o cerere pusa intre timp — si atunci eMAG ramane cu "
    + "datele vechi, coada e goala si nu exista nicio eroare de vazut.",
  );
});

test("abandonul nu se scrie peste o cerere noua", () => {
  /*
   * ⚠ Cea mai importanta dintre comparatii. `abandonat_la` scos peste cererea noua ar
   * opri-o definitiv fara s-o fi incercat: `revendica_din_coada` sare peste randurile
   * abandonate, deci n-ar mai lua-o nimeni niciodata.
   */
  const cod = cronulFaraNote();
  const i = cod.indexOf("abandonat_la: new Date().toISOString()");
  assert.ok(i > 0, "n-am gasit abandonul");

  const inainte = cod.slice(Math.max(0, i - 400), i);
  assert.match(inainte, /scrieInCoada\(admin, el, \{/, "abandonul trebuie sa treaca prin comparatie");

  const dupa = cod.slice(i, i + 300);
  assert.match(dupa, /if \(!sAScris\) continue;/,
    "iar daca n-a scris, nu se mai jurnalizeaza un abandon care nu s-a intamplat");
});

test("migratia pune numaratorul pe TOATE cele cinci cozi", () => {
  /*
   * ⚠ Tiparul e acelasi la toate cinci: aceeasi cheie unica, acelasi `upsert`, acelasi
   * `delete` dupa reusita. Pus doar pe eMAG, leacul ar fi lasat celelalte patru cu
   * defectul intreg si cu impresia ca s-a rezolvat.
   */
  const m = readdirSync("migrations")
    .filter((f) => f.includes("generatia-cozilor"))
    .map((f) => readFileSync(`migrations/${f}`, "utf8"))
    .join(NL);
  assert.ok(m.length > 0, "n-am gasit migratia");

  for (const coada of [
    "emag_sync_queue", "trendyol_sync_queue", "olx_sync_queue",
    "gmc_sync_queue", "aboutyou_sync_queue",
  ]) {
    assert.match(
      m, new RegExp(`alter table public\\.${coada}\\s+add column if not exists generation`),
      `${coada} n-a primit coloana`,
    );
    assert.match(
      m, new RegExp(`create trigger trg_generatie before update on public\\.${coada}`),
      `${coada} n-a primit declansatorul`,
    );
  }
});

test("declansatorul creste din OLD, nu din NEW", () => {
  /*
   * ⚠ Deosebirea nu e de stil. Caile de punere in coada trimit un obiect care nu
   * pomeneste `generation`, deci `new.generation` vine cu implicitul coloanei — 1. Scris
   * `new.generation + 1`, numaratorul ar fi sarit inapoi la 2 la fiecare punere in coada,
   * iar comparatia lucratorului vechi ar fi nimerit din nou.
   */
  const m = readdirSync("migrations")
    .filter((f) => f.includes("generatia-cozilor"))
    .map((f) => readFileSync(`migrations/${f}`, "utf8"))
    .join(NL);
  assert.match(m, /new\.generation\s*:=\s*old\.generation\s*\+\s*1/, "trebuie luat din OLD");
});
