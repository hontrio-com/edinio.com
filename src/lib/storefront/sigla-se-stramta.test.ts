import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { stilSigla } from "./logo-box";

/*
 * Sigla din antet se stramta pe telefon (19.11.2026).
 *
 * Gasit inaintea unui push, pe magazinele REALE randate local: la un magazin cu antetul „hipermarket” si o sigla lata
 * (1600x289 la inaltimea 56, adica 310 px), iconita cosului statea la 385..429 intr-un ecran de 390, deci in afara lui,
 * iar pagina se derula lateral cu 47 px. Aceeasi masuratoare in productie, pe codul de atunci: 47 px. Vina: ancora
 * siglei avea `shrink-0`, deci plafonul `100%` din `stilSigla` nu mai plafona nimic.
 *
 * Auditul temelor nu l-a vazut fiindca magazinele demo au sigle scurte. De-aia regula se tine AICI, pe sursa fiecarui
 * antet, nu pe o captura: o sigla lata e a comerciantului, nu a noastra.
 *
 * Proiectul n-are jsdom, deci antetele se citesc ca text, ca in restul probelor de vitrina.
 */

const DOSAR = "src/components/storefront/sections/chrome";
const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

/** Clasele care opresc stramtarea pe ORICE latime. Cu prefix de prag (`lg:shrink-0`) sunt in regula: pe telefon nu se aplica. */
const oprescStramtarea = (clase: string) => clase.split(/\s+/).filter((c) => c === "shrink-0" || c === "flex-shrink-0" || c === "flex-none");

test("stilSigla pune amandoua plafoanele in aceeasi declaratie", () => {
  assert.deepEqual(stilSigla(40), { height: 40, maxWidth: "min(200px, 100%)" });
  assert.deepEqual(stilSigla(56), { height: 56, maxWidth: "min(280px, 100%)" });
});

test("in fiecare antet, ancora siglei si imaginea ei se pot stramta pe telefon", () => {
  const antete = readdirSync(DOSAR).filter((f) => /^Header[A-Z]\w*\.tsx$/.test(f));
  // Martorul: lista nu e goala si nu s-a micsorat pe tacute (noua antete pe 19.11.2026).
  assert.ok(antete.length >= 9, `astept cel putin 9 antete in ${DOSAR}, am gasit ${antete.length}`);

  let imaginiVerificate = 0;
  for (const fisier of antete) {
    const s = cod(`${DOSAR}/${fisier}`);
    const imagini = [...s.matchAll(/<img src=\{cdnImage\(business\.logo_url, \d+\)\}[\s\S]*?\/>/g)];
    assert.ok(imagini.length >= 1, `${fisier}: nu mai gasesc imaginea siglei (\`<img src={cdnImage(business.logo_url, …)}\`)`);

    for (const img of imagini) {
      // Ancora: ultimul `<a href={acasa}` dinaintea imaginii, inca deschis.
      const inainte = s.slice(0, img.index);
      const inceput = inainte.lastIndexOf("<a href={acasa}");
      assert.ok(inceput >= 0, `${fisier}: sigla nu mai sta intr-o ancora catre prima pagina`);
      const ancora = inainte.slice(inceput);
      assert.doesNotMatch(ancora, /<\/a>/, `${fisier}: ancora dinaintea siglei s-a inchis inainte de imagine`);

      // Listele de clase ale ancorei (pot fi doua, cand antetul are si varianta cu cautare).
      const liste = [...ancora.matchAll(/"([^"]*\bitems-center\b[^"]*)"/g)].map((m) => m[1]);
      assert.ok(liste.length >= 1, `${fisier}: nu mai gasesc clasele ancorei siglei`);
      for (const clase of liste) {
        assert.match(clase, /(?:^|\s)min-w-0(?:\s|$)/, `${fisier}: ancora siglei nu are \`min-w-0\`, deci nu se poate stramta sub latimea siglei`);
        assert.deepEqual(oprescStramtarea(clase), [], `${fisier}: ancora siglei are ${oprescStramtarea(clase).join(", ")} fara prag; pe telefon o sigla lata impinge cosul din ecran`);
      }

      // Imaginea: nu are voie sa refuze stramtarea, iar plafonul ei trebuie sa urmeze ancora.
      const eticheta = img[0];
      const claseImagine = eticheta.match(/className="([^"]*)"/)?.[1];
      assert.ok(claseImagine, `${fisier}: imaginea siglei nu mai are \`className\` scris ca sir`);
      assert.deepEqual(oprescStramtarea(claseImagine), [], `${fisier}: imaginea siglei are ${oprescStramtarea(claseImagine).join(", ")}; ramane la plafonul ei si iese din ancora`);
      if (/style=\{stilSigla\(logoSize\)\}/.test(eticheta)) {
        // Plafonul `min(…, 100%)` vine din `stilSigla`.
      } else {
        // Plafon scris in pixeli (antetul clasic): imaginea trebuie sa se poata stramta ca element flex.
        assert.match(eticheta, /style=\{\{ height: logoSize, maxWidth: logoSize \* [\d.]+ \}\}/, `${fisier}: stilul siglei nu e nici \`stilSigla(logoSize)\`, nici plafonul in pixeli cunoscut`);
        assert.match(claseImagine, /(?:^|\s)min-w-0(?:\s|$)/, `${fisier}: sigla cu plafon in pixeli cere \`min-w-0\` pe imagine, altfel nu coboara sub plafon`);
      }
      imaginiVerificate++;
    }
  }
  assert.ok(imaginiVerificate >= antete.length, "fiecare antet trebuie sa aiba macar o sigla verificata");
});

/*
 * Antetul cu sigla la mijloc: coloanele din margini au un minim pe telefon (20.11.2026).
 *
 * Gasit pe un magazin real care si-a pus sigla scrisa pe un rand (7:1): cu `grid-cols-[1fr_auto_1fr]` si `min-w-0` pe
 * grupul din stanga, coloanele din margini se strangeau la zero, iar sigla statea PESTE butonul de meniu si peste lupa.
 * Masurat la 390 px: sigla 32..336, meniul 10..54, lupa 46..90. Nimic nu iesea din ecran si pagina nu se derula lateral,
 * deci proba de depasire din 19.11 n-avea ce vedea: o suprapunere nu e o depasire.
 *
 * Regula de mai sus (ancora si imaginea se pot stramta) e necesara, dar nu ajunge intr-o grila: acolo sigla se stramta
 * doar daca vecinii ei NU se pot strange sub continutul lor.
 */
const minimeleMarginilor = (clase: string): string[] | null => {
  // Clasa de grila FARA prag de ecran (`lg:grid-cols-…` se aplica doar pe ecrane late).
  const faraPrag = clase.split(/\s+/).filter((c) => c.startsWith("grid-cols-"));
  if (faraPrag.length !== 1) return null;
  const m = /^grid-cols-\[minmax\(([\d.]+rem),1fr\)_auto_minmax\(([\d.]+rem),1fr\)\]$/.exec(faraPrag[0]);
  return m ? [m[1], m[2]] : null;
};

test("in antetul cu sigla la mijloc, coloanele din margini nu se pot strange sub butoanele lor pe telefon", () => {
  const s = cod(`${DOSAR}/HeaderCentered.tsx`);
  const randuri = [...s.matchAll(/className="([^"]*\bgrid\b[^"]*\bgrid-cols-[^"]*)"/g)].map((m) => m[1]);
  // Martorul: randul cu sigla e singura grila a antetului.
  assert.equal(randuri.length, 1, `astept o singura grila in HeaderCentered, am gasit ${randuri.length}`);

  const minime = minimeleMarginilor(randuri[0]);
  assert.ok(minime, `randul cu sigla nu mai are, fara prag de ecran, forma \`grid-cols-[minmax(Xrem,1fr)_auto_minmax(Xrem,1fr)]\`: ${randuri[0]}`);
  // Egale, altfel sigla nu mai cade pe mijlocul ecranului.
  assert.equal(minime[0], minime[1], "cele doua margini au minime diferite: sigla iese de pe mijloc");
  /*
   * ⚠ CAT TREBUIE SI NU MAI MULT. Grupul din stanga (meniul si lupa) ajunge, masurat, la 74 px de la inceputul coloanei
   * (lupa se termina la 90, coloana incepe la 16). Minimul plus golul grilei trebuie sa-l acopere, cu cativa pixeli
   * liberi pana la sigla. Dar un minim mai mare decat e nevoie micsoreaza si siglele care aveau loc: prima forma, `5rem`,
   * ducea sigla de 200 px a unui magazin fara nicio suprapunere la 166 (vazut la proba pe magazinele reale, 20.11.2026).
   */
  const GRUP_STANGA = 74;
  const gol = Number(/(?:^|\s)gap-(\d+)(?:\s|$)/.exec(randuri[0])?.[1]) * 4;
  assert.ok(gol > 0, `golul grilei nu s-a citit din clase: ${randuri[0]}`);
  const liber = parseFloat(minime[0]) * 16 + gol - GRUP_STANGA;
  assert.ok(liber >= 4, `minimul marginilor (${minime[0]}) lasa ${liber} px intre lupa si sigla: se ating sau se suprapun`);
  assert.ok(liber <= 8, `minimul marginilor (${minime[0]}) lasa ${liber} px intre lupa si sigla: e mai mare decat trebuie si micsoreaza siglele care aveau loc`);
  // Pe ecranele late ramane grila de dinainte: acolo contactul din stanga se taie cu puncte, nu impinge sigla.
  assert.match(randuri[0], /(?:^|\s)lg:grid-cols-\[1fr_auto_1fr\](?:\s|$)/, "de la `lg` in sus astept grila `1fr auto 1fr`");
});

test("regula marginilor chiar prinde: grila veche, minime diferite si minimul prea mic sunt vazute", () => {
  assert.equal(minimeleMarginilor("h-16 lg:h-24 grid grid-cols-[1fr_auto_1fr] items-center gap-4"), null);
  assert.deepEqual(minimeleMarginilor("grid grid-cols-[minmax(5rem,1fr)_auto_minmax(3rem,1fr)] lg:grid-cols-[1fr_auto_1fr]"), ["5rem", "3rem"]);
  assert.deepEqual(minimeleMarginilor("grid grid-cols-[minmax(5rem,1fr)_auto_minmax(5rem,1fr)] lg:grid-cols-[1fr_auto_1fr]"), ["5rem", "5rem"]);
  // Doua clase fara prag s-ar bate intre ele: nu se stie care castiga.
  assert.equal(minimeleMarginilor("grid grid-cols-[1fr_auto_1fr] grid-cols-[minmax(5rem,1fr)_auto_minmax(5rem,1fr)]"), null);
});

test("regula chiar prinde: `shrink-0` fara prag e vazut, `lg:shrink-0` nu", () => {
  assert.deepEqual(oprescStramtarea("flex items-center min-w-0 shrink-0 hover:opacity-85"), ["shrink-0"]);
  assert.deepEqual(oprescStramtarea("w-auto object-contain flex-shrink-0"), ["flex-shrink-0"]);
  assert.deepEqual(oprescStramtarea("flex items-center min-w-0 lg:shrink-0 hover:opacity-85"), []);
});
