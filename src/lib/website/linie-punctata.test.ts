import { strict as assert } from "node:assert";
import { test } from "node:test";
import { liniiPunctate, pas, PUNCTAT, type Latura } from "./linie-punctata";

test("cele trei liste au aceeași lungime și aceeași ordine", () => {
  /*
    Defectul de care apără proba: `backgroundImage`, `backgroundSize` și
    `backgroundPosition` sunt trei liste potrivite pe poziție. Dacă una are alt
    număr de elemente sau altă ordine, CSS-ul nu dă nicio eroare — pur și simplu
    o linie capătă mărimea alteia. O linie de sus cu mărimea uneia laterale iese
    de 2px lățime și 100% înălțime, adică o dâră verticală în colț.
  */
  const laturi: Latura[] = ["sus", "jos", "stanga", "dreapta"];
  const stil = liniiPunctate(laturi);

  const imagini = String(stil.backgroundImage).split(/,(?![^(]*\))/);
  const marimi = String(stil.backgroundSize).split(",");
  const locuri = String(stil.backgroundPosition).split(",");

  assert.equal(imagini.length, laturi.length);
  assert.equal(marimi.length, laturi.length);
  assert.equal(locuri.length, laturi.length);

  /* Laturile de sus/jos sunt late cât tot elementul și înalte cât grosimea;
     cele laterale, invers. Dacă ordinea s-ar amesteca, asta cade. */
  assert.match(marimi[0].trim(), /^100% \d+px$/, "sus nu e o linie orizontală");
  assert.match(marimi[1].trim(), /^100% \d+px$/, "jos nu e o linie orizontală");
  assert.match(marimi[2].trim(), /^\d+px 100%$/, "stânga nu e o linie verticală");
  assert.match(marimi[3].trim(), /^\d+px 100%$/, "dreapta nu e o linie verticală");
});

test("fiecare latură se lipește de marginea ei", () => {
  const stil = liniiPunctate(["sus", "jos", "stanga", "dreapta"]);
  const locuri = String(stil.backgroundPosition).split(",").map((l) => l.trim());

  assert.deepEqual(locuri, ["0 0", "0 100%", "0 0", "100% 0"]);
});

test("se cere doar ce s-a cerut", () => {
  /* Celulele au nevoie doar de despărțituri, nu de ramă: o celulă cu ramă
     întreagă ar dubla liniile grilei, și s-ar vedea o linie de 4px. */
  const stil = liniiPunctate(["jos"]);
  assert.equal(String(stil.backgroundImage).split(/,(?![^(]*\))/).length, 1);
  assert.equal(String(stil.backgroundSize), `100% ${PUNCTAT.grosime}px`);
});

test("liniuța e mai lungă decât golul, și amândouă mai lungi decât grosimea", () => {
  /*
    ⚠ ASTA E CHIAR CE A CERUT CLIENTUL, scris ca o probă: „nu mai groase, fă
    liniile mai lungi". Dacă cineva mărește `grosime` ca să se vadă mai bine,
    proba cade și îi spune că merge în direcția din care tocmai s-a venit.

    Iar liniuța mai lungă decât golul e ce deosebește o linie întreruptă de un
    șir de puncte răzlețe.
  */
  assert.ok(PUNCTAT.linie > PUNCTAT.gol, "liniuța a ajuns mai scurtă decât golul");
  assert.ok(PUNCTAT.gol > PUNCTAT.grosime, "golul a ajuns cât grosimea: iese linie continuă");
  assert.ok(
    PUNCTAT.linie >= PUNCTAT.grosime * 4,
    "liniuța nu mai e vizibil mai lungă decât groasă — asta e chiar un `dotted`",
  );
  assert.ok(PUNCTAT.grosime <= 2, "liniile s-au îngroșat; clientul a cerut lungi, nu groase");
});

test("pasul e liniuța plus golul", () => {
  assert.equal(pas(), PUNCTAT.linie + PUNCTAT.gol);

  /* Gradientul trebuie să se închidă chiar la pas, altfel tiparul se decalează
     de la o repetare la alta. */
  const stil = liniiPunctate(["sus"]);
  assert.ok(
    String(stil.backgroundImage).includes(`${PUNCTAT.linie}px ${pas()}px`),
    "tiparul nu se închide la pas",
  );
});
