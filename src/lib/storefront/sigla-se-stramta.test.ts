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

test("regula chiar prinde: `shrink-0` fara prag e vazut, `lg:shrink-0` nu", () => {
  assert.deepEqual(oprescStramtarea("flex items-center min-w-0 shrink-0 hover:opacity-85"), ["shrink-0"]);
  assert.deepEqual(oprescStramtarea("w-auto object-contain flex-shrink-0"), ["flex-shrink-0"]);
  assert.deepEqual(oprescStramtarea("flex items-center min-w-0 lg:shrink-0 hover:opacity-85"), []);
});
