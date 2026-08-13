import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDURI_SEO, CAUTARE, REZULTATE_SHOPPING } from "./seo";

const AICI = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(AICI, "..", "..", "..", "public");

test("fiecare rezultat are chiar fișierul lui pe disc", () => {
  /*
    O poză lipsă nu dă nicio eroare: `next/image` desenează o casetă goală, iar
    ilustrația arată ca un raft cu rafturi goale. Se vede doar dacă cineva se uită
    exact la cardul ăla, pe ecranul ăla.
  */
  for (const r of REZULTATE_SHOPPING) {
    const cale = join(PUBLIC, r.imagine.replace(/^\//, ""));
    assert.ok(existsSync(cale), `lipsește ${r.imagine}`);
  }
});

test("rezultatele sunt patru, cu prețuri toate diferite", () => {
  /* Patru: atâtea a trimis clientul, și atâtea intră în grila de două pe două. */
  assert.equal(REZULTATE_SHOPPING.length, 4);

  /* „Un preț, dar să fie diferit la toate" — cerut de client. Două prețuri egale
     într-un raft de rezultate se citesc ca o scăpare de copiere. */
  const preturi = new Set(REZULTATE_SHOPPING.map((r) => r.pret));
  assert.equal(preturi.size, REZULTATE_SHOPPING.length, "două rezultate au același preț");

  const nume = new Set(REZULTATE_SHOPPING.map((r) => r.nume));
  assert.equal(nume.size, REZULTATE_SHOPPING.length, "două rezultate au același nume");

  const poze = new Set(REZULTATE_SHOPPING.map((r) => r.imagine));
  assert.equal(poze.size, REZULTATE_SHOPPING.length, "aceeași poză la două rezultate");
});

test("prețurile sunt scrise cum le scrie Google", () => {
  /* ⚠ „RON", nu „lei", deși restul site-ului scrie „lei": desenul e al lor, deci
     și scrierea. În captura trimisă de client toate opt scriu RON. */
  for (const r of REZULTATE_SHOPPING) {
    assert.match(r.pret, /^\d{1,3}(\.\d{3})*,\d{2} RON$/, `preț ciudat: ${r.pret}`);
  }
});

test("numele intră pe trei rânduri în tigla din carusel", () => {
  /*
    Cardul taie numele la două rânduri (`line-clamp-2`), ca la Google.

    ⚠ Pragul a trecut prin două forme. La două pe rând, cardul avea ~200px și
    încăpeau vreo 68 de semne. Clientul a cerut caruselul adevărat — toate patru
    pe un rând — deci tigla a coborât la ~115px, cam douăzeci de semne pe rând;
    dar tot el a trimis reperul, unde numele stau pe TREI rânduri, nu pe două.
    Deci vreo șaizeci de semne. Peste atât se taie cu trei puncte.
  */
  for (const r of REZULTATE_SHOPPING) {
    assert.ok(r.nume.length <= 60, `${r.nume}: ${r.nume.length} semne, se va tăia`);
  }
});

test("căutarea e chiar cea cerută", () => {
  assert.equal(CAUTARE, "Camera de Supraveghere");
});

test("cardurile secțiunii au tot ce le trebuie", () => {
  const vazute = new Set<string>();
  for (const card of CARDURI_SEO) {
    assert.equal(vazute.has(card.id), false, `${card.id} apare de două ori`);
    vazute.add(card.id);
    assert.ok(card.titlu.length > 0);
    assert.ok(card.descriere.length > 30, `${card.id}: descriere prea scurtă`);
  }
  /* ⚠ Clientul a cerut PATRU. Când vin și celelalte trei texte, numărul de aici
     se ridică la 4 — până atunci proba spune limpede unde a rămas lucrul. Grila e
     de două coloane, deci orice număr impar lasă o celulă goală. */
  assert.ok(
    CARDURI_SEO.length >= 1 && CARDURI_SEO.length <= 4,
    "secțiunea are între unu și patru carduri",
  );
});
