import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DescriereAutomataCategorie } from "@/lib/storefront/catalog/descriere-automata";
import {
  avertismenteEditor, butoaneEditor, CONTOR, lungimePublicata, previzualizare, stareDescriere, titluEticheta,
} from "./descriere-google";

/*
 * Editorul descrierii pentru Google din Produse > Categorii. Regulile se probeaza pe functiile
 * pure pe care le cheama chiar panoul; cablarea din cele doua `.tsx` (care nu se pot rula in
 * probe) se verifica pe sursa, cu comentariile scoase, ca un comentariu sa nu poata tine loc de cod.
 */

const AUTOMAT: DescriereAutomataCategorie = {
  text: "PROSOAPE la CAIAN TEXTILE: 18 produse, de la 8,63 lei. Subcategorii: Prosoape Hotel, Prosoape SPA și Seturi.",
  titlu: "PROSOAPE | CAIAN TEXTILE",
  adresa: "https://caian-textile.ro/magazin/prosoape",
  ascunsa: false,
  umbritaDe: null,
  areDomeniu: true,
};
const ASCUNSA: DescriereAutomataCategorie = { ...AUTOMAT, text: null, titlu: null, ascunsa: true };
const UMBRITA: DescriereAutomataCategorie = { ...AUTOMAT, text: null, titlu: null, umbritaDe: { id: "c1", nume: "PROSOAPE" } };
const FARA_DOMENIU: DescriereAutomataCategorie = {
  ...AUTOMAT, adresa: "https://www.edinio.com/caian/magazin/prosoape", areDomeniu: false,
};

const tipuri = (a: Parameters<typeof avertismenteEditor>[0]) => avertismenteEditor(a).map((x) => x.tip);

describe(`eticheta „Google” de pe rand`, () => {
  test("colorata numai pe un text care chiar se publica", () => {
    assert.equal(stareDescriere("Prosoape din bumbac", true), "proprie");
    assert.equal(stareDescriere(null, true), "automata");
    assert.equal(stareDescriere(undefined, true), "automata");
    // Pentru vitrina, numai spatii sau etichete goale inseamna „nimic scris".
    assert.equal(stareDescriere("   ", true), "automata");
    assert.equal(stareDescriere("<b> </b>", true), "automata");
  });

  test(`⚠ citirea cazuta: nici „text automat”, nici „text propriu”`, () => {
    assert.equal(stareDescriere(null, false), "necunoscuta");
    assert.equal(stareDescriere("Prosoape", false), "necunoscuta");
  });

  test("numele accesibil contine textul vizibil si spune starea", () => {
    const t = (["proprie", "automata", "necunoscuta"] as const).map(titluEticheta);
    assert.equal(new Set(t).size, 3, "doua stari cu acelasi nume");
    for (const x of t) assert.ok(x.startsWith("Descrierea pentru Google"), x);
    assert.match(titluEticheta("automata"), /automat/);
    assert.match(titluEticheta("proprie"), /scris de tine/);
  });
});

describe("avertismentele editorului", () => {
  test("pana vine raspunsul serverului nu se spune nimic despre pagina", () => {
    assert.deepEqual(tipuri({ automat: null, incarcat: false, citite: true }), []);
    assert.deepEqual(tipuri({ automat: null, incarcat: false, citite: false }), ["necitita"]);
  });

  test("pagina normala, cu domeniu propriu: niciun avertisment", () => {
    assert.deepEqual(tipuri({ automat: AUTOMAT, incarcat: true, citite: true }), []);
  });

  test("ascunsa, umbrita, fara domeniu, fiecare cu motivul ei", () => {
    assert.deepEqual(tipuri({ automat: ASCUNSA, incarcat: true, citite: true }), ["ascunsa"]);
    assert.deepEqual(tipuri({ automat: UMBRITA, incarcat: true, citite: true }), ["umbrita"]);
    assert.deepEqual(tipuri({ automat: FARA_DOMENIU, incarcat: true, citite: true }), ["fara-domeniu"]);
    assert.deepEqual(
      tipuri({ automat: { ...ASCUNSA, areDomeniu: false }, incarcat: true, citite: true }),
      ["ascunsa", "fara-domeniu"],
    );
  });

  test("⚠ o categorie ascunsa n-are pagina, deci nici n-o poate lua alta", () => {
    const ambele = { ...ASCUNSA, umbritaDe: { id: "c1", nume: "PROSOAPE" } };
    assert.deepEqual(tipuri({ automat: ambele, incarcat: true, citite: true }), ["ascunsa"]);
  });

  test("umbrita: numeste categoria care ia pagina, intre ghilimele romanesti", () => {
    const [a] = avertismenteEditor({ automat: UMBRITA, incarcat: true, citite: true });
    assert.ok(a.text.includes(`„PROSOAPE”`), a.text);
  });

  test("⚠ citirea cazuta vine PRIMA: e singura care previne o pierdere", () => {
    assert.deepEqual(
      tipuri({ automat: { ...UMBRITA, areDomeniu: false }, incarcat: true, citite: false }),
      ["necitita", "umbrita", "fara-domeniu"],
    );
  });

  test("textul automat n-a venit: se spune, iar despre pagina nu se ghiceste nimic", () => {
    assert.deepEqual(tipuri({ automat: null, incarcat: true, citite: true }), ["fara-text-automat"]);
    assert.deepEqual(tipuri({ automat: null, incarcat: true, citite: false }), ["necitita", "fara-text-automat"]);
  });

  test("textele: cu diacritice, fara liniuta lunga, fara semn de exclamare", () => {
    const toate = [
      ...avertismenteEditor({ automat: { ...UMBRITA, areDomeniu: false }, incarcat: true, citite: false }),
      ...avertismenteEditor({ automat: ASCUNSA, incarcat: true, citite: true }),
      ...avertismenteEditor({ automat: null, incarcat: true, citite: true }),
    ];
    assert.equal(new Set(toate.map((a) => a.tip)).size, 5, "lipseste un tip de avertisment din proba");
    // Liniuta de dialog si cea lunga, construite din coduri: scrise de mana, ar fi fost chiar ce se interzice.
    const interzise = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}!]`);
    for (const { tip, text } of toate) {
      assert.ok(/[ăâîșț]/.test(text), `${tip}: fara diacritice`);
      assert.ok(!interzise.test(text), `${tip}: ${text}`);
    }
  });
});

describe("previzualizarea Google", () => {
  test("campul gol (sau numai spatii, sau etichete goale) lasa textul automat", () => {
    for (const camp of ["", "   ", "<b> </b>"]) {
      assert.deepEqual(previzualizare(camp, AUTOMAT), {
        titlu: "PROSOAPE | CAIAN TEXTILE", descriere: AUTOMAT.text, adresa: AUTOMAT.adresa,
      }, JSON.stringify(camp));
    }
  });

  test("textul scris, in forma in care il publica vitrina", () => {
    const p = previzualizare(`  Prosoape <b>hoteliere</b>\n din bumbac${String.fromCharCode(0x202e)} `, AUTOMAT);
    assert.equal(p?.descriere, "Prosoape hoteliere din bumbac");
    assert.equal(p?.titlu, AUTOMAT.titlu);
  });

  test("taiat la 300, la cuvant, ca la citirea din vitrina", () => {
    const lung = Array.from({ length: 60 }, (_, i) => `prosop${i}`).join(" ");
    const d = previzualizare(lung, AUTOMAT)!.descriere;
    assert.ok(d.length <= 300 && d.length > 240, String(d.length));
    assert.ok(lung.startsWith(d) && lung[d.length] === " ", "taiat prin mijlocul unui cuvant");
  });

  test("⚠ fara pagina (ascunsa, umbrita) sau fara raspuns: nimic de previzualizat", () => {
    assert.equal(previzualizare("Text", ASCUNSA), null);
    assert.equal(previzualizare("Text", UMBRITA), null);
    assert.equal(previzualizare("Text", null), null);
  });
});

describe("contorul", () => {
  test("pragurile descrierii paginii principale", () => {
    assert.deepEqual({ ...CONTOR }, { idealMin: 140, max: 160 });
  });

  test("numara ce se publica: fara etichete si spatii in plus", () => {
    assert.equal(lungimePublicata(""), 0);
    assert.equal(lungimePublicata("   "), 0);
    assert.equal(lungimePublicata("  a   b "), 3);
    assert.equal(lungimePublicata("<b>ab</b>"), 2);
  });
});

describe("butoanele editorului", () => {
  const b = (o: Partial<Parameters<typeof butoaneEditor>[0]>) =>
    butoaneEditor({ camp: "", salvata: null, citite: true, automat: AUTOMAT, ocupat: false, ...o });

  test(`nimic scris, nimic salvat: doar „Porneste de la textul automat”`, () => {
    assert.deepEqual(b({}), { salveaza: false, foloseste: false, porneste: true });
  });

  test("text nou: se poate salva sau arunca", () => {
    assert.deepEqual(b({ camp: "Prosoape din bumbac" }), { salveaza: true, foloseste: true, porneste: true });
  });

  test("acelasi text ca cel salvat, dupa curatare: nimic de salvat", () => {
    assert.equal(b({ camp: "Prosoape", salvata: "Prosoape" }).salveaza, false);
    assert.equal(b({ camp: "  Prosoape ", salvata: "Prosoape" }).salveaza, false);
    assert.equal(b({ camp: "Prosoape!", salvata: "Prosoape" }).salveaza, true);
  });

  test("campul golit peste un text salvat: salvarea il sterge, iar stergerea e activa", () => {
    assert.deepEqual(b({ camp: "", salvata: "Prosoape" }), { salveaza: true, foloseste: true, porneste: true });
  });

  test("⚠ citirea cazuta: campul gol NU se salveaza, stergerea ramane pe butonul ei", () => {
    assert.deepEqual(b({ citite: false }), { salveaza: false, foloseste: true, porneste: true });
    assert.equal(b({ citite: false, camp: "Prosoape" }).salveaza, true);
  });

  test("fara text automat (ascunsa, umbrita, raspuns lipsa) sau deja copiat: nu se copiaza nimic", () => {
    assert.equal(b({ automat: null }).porneste, false);
    assert.equal(b({ automat: ASCUNSA }).porneste, false);
    assert.equal(b({ automat: UMBRITA }).porneste, false);
    assert.equal(b({ camp: String(AUTOMAT.text) }).porneste, false);
  });

  test("⚠ fara text automat, cu ceva scris in camp: tot inactiv (copierea ar fi golit campul)", () => {
    for (const automat of [null, ASCUNSA, UMBRITA]) {
      assert.equal(b({ automat, camp: "Prosoape din bumbac" }).porneste, false, JSON.stringify(automat));
    }
  });

  test("o salvare in curs opreste tot", () => {
    assert.deepEqual(
      b({ camp: "Prosoape", salvata: "Altceva", citite: false, ocupat: true }),
      { salveaza: false, foloseste: false, porneste: false },
    );
  });
});

/**
 * Sursa fara comentarii: un comentariu care numeste apelul nu tine loc de apel.
 *
 * ⚠ Numai comentariile care INCEP un rand, cele JSX si ` // ` de la coada. Un `/\*…*\/` cautat
 * oriunde porneste si din `accept="image/*"` si inghite codul pana la primul `*\/` de mai jos.
 */
function sursa(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/ .*$/gm, "");
}

/** Liniile de import ale unui fisier. */
const importuri = (s: string) => [...s.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["'];?$/gm)].map((m) => ({ linie: m[0], din: m[1] }));

/** Module care n-au ce cauta intr-un fisier „use client": citesc baza sau cookie-urile. */
const DE_SERVER = [
  "@/lib/supabase/admin", "@/lib/supabase/server", "server-only", "next/headers",
  "@/lib/storefront/catalog/seo-categorie", "@/lib/storefront/catalog/context-descriere",
];

describe("cablarea din panou", () => {
  const EDITOR = "src/components/dashboard/EditorDescriereCategorie.tsx";
  const PANOU = "src/components/dashboard/CategoriesClient.tsx";
  const editor = sursa(EDITOR);
  const panou = sursa(PANOU);

  test("⚠ niciun modul de server in fisierele din browser; `descriere-automata` doar ca TIP", () => {
    for (const [rel, s] of [[EDITOR, editor], [PANOU, panou], ["src/lib/categories/descriere-google.ts", sursa("src/lib/categories/descriere-google.ts")]] as const) {
      for (const { linie, din } of importuri(s)) {
        assert.ok(!DE_SERVER.includes(din), `${rel}: ${linie}`);
        if (din === "@/lib/storefront/catalog/descriere-automata") assert.match(linie, /^import type /, `${rel}: ${linie}`);
      }
    }
    assert.match(readFileSync(path.resolve(process.cwd(), EDITOR), "utf8"), /^"use client";/);
  });

  test("editorul: placeholderul e textul automat de la server, iar campul are limita salvarii", () => {
    assert.match(editor, /descriereAutomataCategorie\(categorie\.id\)/);
    assert.match(editor, /placeholder=\{automat\?\.text \?\? ""\}/);
    assert.match(editor, /maxLength=\{SEO_DESCRIERE_CATEGORIE_MAX\}/);
    assert.match(editor, /<CharCounter len=\{lungimePublicata\(camp\)\} idealMin=\{CONTOR\.idealMin\} max=\{CONTOR\.max\} \/>/);
  });

  test("editorul: avertismentele, butoanele si previzualizarea vin din functiile probate aici", () => {
    assert.match(editor, /avertismenteEditor\(\{ automat, incarcat, citite \}\)/);
    assert.match(editor, /butoaneEditor\(\{ camp, salvata, citite, automat, ocupat \}\)/);
    assert.match(editor, /previzualizare\(camp, automat\)/);
    assert.match(editor, /<GooglePreview title=\{prev\.titlu\} description=\{prev\.descriere\} url=\{prev\.adresa\} \/>/);
  });

  test("editorul: fiecare buton face ce spune", () => {
    assert.match(editor, /disabled=\{!butoane\.porneste\}\s*onClick=\{\(\) => setCamp\(automat\?\.text \?\? ""\)\}\s*>\s*Pornește de la textul automat/);
    assert.match(editor, /disabled=\{!butoane\.foloseste\}\s*onClick=\{\(\) => salveaza\(null\)\}\s*>\s*Folosește textul automat/);
    assert.match(editor, /onClick=\{\(\) => salveaza\(camp\)\} disabled=\{!butoane\.salveaza\}>[\s\S]{0,80}Salvează/);
    assert.match(editor, /salveazaSeoCategorie\(categorie\.id, text\)/);
  });

  test("⚠ dupa salvare, campul si eticheta primesc textul INTORS de server (forma publicata)", () => {
    assert.match(editor, /setCamp\(r\.descriere \?\? ""\);\s*onSalvata\(categorie\.id, r\.descriere\);/);
    assert.match(panou, /if \(text\) next\[id\] = text; else delete next\[id\];/);
    assert.match(panou, /onSalvata=\{descriereSalvata\}/);
  });

  test("editorul se reface la fiecare deschidere: un raspuns intarziat nu nimereste alta categorie", () => {
    assert.match(editor, /key=\{`\$\{categorie\.id\}:\$\{deschidere\}`\}/);
    assert.match(editor, /if \(anulat\) return;/);
    assert.match(editor, /return \(\) => \{\s*anulat = true;\s*\};/);
  });

  test(`eticheta: text vizibil „Google”, starea din descrierile citite, pe AMBELE feluri de rand`, () => {
    assert.match(panou, /stareDescriere\(descrieri\[cat\.id\], descrieriCitite\)/);
    const functia = panou.slice(panou.indexOf("function etichetaGoogle("), panou.indexOf("function orderActions("));
    assert.match(functia, />\s*Google\s*<\/button>/);
    assert.match(functia, /onClick=\{\(\) => deschideDescrierea\(cat\.id\)\}/);
    assert.equal(panou.split("{etichetaGoogle(cat, isTemp)}").length - 1, 2, "radacina si subcategoria");
  });

  test("⚠ pictogramele de pe rand raman cinci si pe locurile lor: eticheta nu e printre ele", () => {
    const actiuni = panou.slice(panou.indexOf("function rowActions("), panou.indexOf("function moveForm("));
    assert.equal(actiuni.split("<button").length - 1, 5);
    assert.ok(!actiuni.includes("etichetaGoogle"), "eticheta a intrat intre actiuni");
  });

  test("panoul trimite editorului textul salvat al categoriei deschise si starea citirii", () => {
    assert.match(panou, /salvata=\{descriereCatId \? descrieri\[descriereCatId\] \?\? null : null\}/);
    assert.match(panou, /citite=\{descrieriCitite\}/);
  });
});
