import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { FELURI_DIN_BROWSER } from "./semnal";
import { produsulComenzii } from "./cumparare";

/*
 * PALNIA E INTREAGA: fiecare treapta se scrie din TOATE drumurile care duc la ea (20.11.2026).
 *
 * Gasit in productie, la o saptamana de comenzi (13-19.11.2026): 150 de comenzi din vitrina, 29 de evenimente `purchase`.
 * „A cumparat” se scria doar din `placeOrder` (comanda rapida, de pe pagina de produs), nu si din `placeCartOrder`
 * (comanda din cos), iar „a inceput comanda” doar la randarea paginii de comanda, deci niciodata pe magazinele cu
 * formularul in fereastra. Nicio cifra nu arata lipsa: o treapta scrisa pe jumatate arata ca o treapta mica.
 *
 * Probele de aici pazesc REGULA („toate drumurile”), nu cele doua locuri reparate: un drum nou care plaseaza o comanda
 * sau deschide formularul intr-o fereastra cade aici pana isi scrie treapta.
 */

/** ⚠ Terminatiile se normalizeaza, iar comentariile se scot: un apel dintr-un comentariu nu e un apel. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Fisierele `.ts` / `.tsx` din `dosar` (fara probe), cu textul lor fara comentarii. */
function surse(dosar: string): { cale: string; text: string }[] {
  const iesire: { cale: string; text: string }[] = [];
  const umbla = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const cale = `${d}/${e.name}`;
      if (e.isDirectory()) umbla(cale);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name)) iesire.push({ cale, text: cod(cale) });
    }
  };
  umbla(dosar);
  return iesire;
}

/** Functiile exportate dintr-un fisier de actiuni: numele si corpul fiecareia, pana la urmatoarea. */
function functiiExportate(text: string): { nume: string; corp: string }[] {
  const inceputuri = [...text.matchAll(/^export async function (\w+)\(/gm)];
  return inceputuri.map((m, i) => ({ nume: m[1], corp: text.slice(m.index!, inceputuri[i + 1]?.index ?? text.length) }));
}

test("⚠ orice actiune care plaseaza o comanda din vitrina scrie „a cumparat”, printr-un singur scriitor", () => {
  const actiuni = cod("src/lib/actions/order.actions.ts");
  /*
   * Semnul unei comenzi din vitrina: conversia trimisa la GA4 cu eticheta `ga4.cumparare` (comenzile facute de mana din
   * panou au eticheta lor, `ga4.cumparareManuala`, si nu sunt drumul unui cumparator prin magazin).
   */
  const dinVitrina = functiiExportate(actiuni).filter((f) => /"ga4\.cumparare"/.test(f.corp));
  // Martorul: cele doua actiuni stiute chiar sunt gasite; daca semnul se schimba, proba nu trece in tacere pe zero functii.
  assert.deepEqual(dinVitrina.map((f) => f.nume).sort(), ["placeCartOrder", "placeOrder"]);
  for (const f of dinVitrina) {
    assert.equal([...f.corp.matchAll(/programeazaCumparareaInPalnie\(\{/g)].length, 1, `${f.nume} plaseaza o comanda din vitrina si nu scrie „a cumparat” in palnie`);
    assert.match(f.corp, /programeazaCumparareaInPalnie\(\{ businessId: data\.business_id, productId: [^,]+, valoare: total \}\)/, `${f.nume}: treapta se scrie cu magazinul comenzii si cu totalul ei`);
  }
  // Un singur scriitor: actiunile nu mai scriu evenimentul de mana (asa a ajuns sa existe intr-una si sa lipseasca din cealalta).
  assert.doesNotMatch(actiuni, /scrieEvenimentAnalitic\(/, "order.actions.ts scrie iar evenimentul de mana, pe langa scriitorul comun");
  const scriitori = surse("src").filter((s) => /fel: "purchase"/.test(s.text)).map((s) => s.cale);
  assert.deepEqual(scriitori, ["src/lib/analitice/cumparare.ts"], "„a cumparat” se scrie dintr-un singur loc");
});

test("scriitorul cumpararii: dupa raspuns, cu regula de masurare a celorlalte trepte", () => {
  const c = cod("src/lib/analitice/cumparare.ts");
  assert.match(c, /dupaRaspuns\(async \(\) => \{/, "treapta nu are voie sa tina raspunsul comenzii pe loc");
  assert.match(c, /\}, "analitice\.cumparare", businessId\);/, "caderea scrierii trebuie sa ajunga in jurnal, cu numele ei");
  // Comanda de proba a proprietarului si cele de pe gazde de test nu intra in palnie, cum nu intra nici vizitele lor.
  assert.match(c, /if \(!seMasoaraVizita\(\{\s*esteProprietar: await esteProprietarulMagazinului\(magazin\?\.user_id\),\s*host: anteturi\.get\("host"\)\?\.split\(":"\)\[0\] \?\? "",\s*userAgent: ua,\s*dinActiune: false,\s*\}\)\) return;/);
  assert.match(c, /fel: "purchase",/);
  assert.match(c, /valoare,/);
});

test("produsul comenzii din cos: cel al cosului cu un singur produs, altfel niciunul", () => {
  assert.equal(produsulComenzii([{ product_id: "a" }]), "a");
  // Doua linii ale aceluiasi produs (doua variante) sunt tot un produs.
  assert.equal(produsulComenzii([{ product_id: "a" }, { product_id: "a" }]), "a");
  assert.equal(produsulComenzii([{ product_id: "a" }, { product_id: "b" }]), null);
  assert.equal(produsulComenzii([]), null);
});

test("⚠ din browser se primesc doar „adaugat in cos” si „a inceput comanda”, niciodata cumpararea", () => {
  assert.deepEqual([...FELURI_DIN_BROWSER], ["add_to_cart", "begin_checkout"]);
  const ruta = cod("src/app/api/analitice/eveniment/route.ts");
  // Ruta recunoaste felurile prin lista celui care le trimite, nu printr-o lista a ei.
  assert.match(ruta, /if \(!\(FELURI_DIN_BROWSER as readonly unknown\[\]\)\.includes\(corp\.fel\)\) \{\s*return NextResponse\.json\(\{ error: "eveniment neacceptat" \}, \{ status: 400 \}\);/);
  assert.doesNotMatch(ruta, /"purchase"|"visit"|"product_view"/, "ruta browserului nu are voie sa pomeneasca treptele care se scriu doar pe server");
  assert.match(ruta, /fel,\n\s*ip: clientIpFromHeaders\(anteturi\),/, "ruta scrie felul primit, dupa ce l-a recunoscut");
});

test("⚠ fiecare loc care deschide formularul de comanda intr-o FEREASTRA spune si Statisticilor ca a inceput comanda", () => {
  /*
   * Semnul unui inceput de comanda: evenimentul trimis la GA4 (`begin_checkout`). Unde pleaca el, pleaca si treapta
   * noastra, mai putin pe PAGINA de comanda, unde o scrie serverul la randare (trimisa si din browser, s-ar dubla).
   */
  const PAGINA = "src/components/storefront/sections/checkout/CheckoutPageClient.tsx";
  const cuInceput = surse("src/components").filter((s) => /gtagEvent\("begin_checkout"/.test(s.text));
  // Martorul: cele cinci locuri stiute. Un al saselea trebuie sa hotarasca: fereastra (trimite) sau pagina (scrie serverul).
  assert.deepEqual(cuInceput.map((s) => s.cale).sort(), [
    "src/components/ministore/MiniStoreRenderer.tsx",
    "src/components/ministore/OrderModal.tsx",
    PAGINA,
    "src/components/storefront/StoreCartPanels.tsx",
    "src/components/storefront/sections/cart/CartPageClient.tsx",
  ].sort());
  for (const s of cuInceput) {
    const catre = [...s.text.matchAll(/gtagEvent\("begin_checkout"/g)].length;
    const semnale = [...s.text.matchAll(/semnaleazaInceputulComenzii\(/g)].length;
    if (s.cale === PAGINA) assert.equal(semnale, 0, "pagina de comanda trimite treapta si din browser: s-ar dubla cu cea scrisa de server");
    else assert.equal(semnale, catre, `${s.cale}: ${catre} inceputuri de comanda trimise pixelilor, ${semnale} spuse Statisticilor`);
  }
  // Pagina de comanda isi scrie treapta pe server, la randare.
  assert.match(cod("src/app/(public)/[slug]/checkout/page.tsx"), /fel: "begin_checkout",/);
  // Formularul rapid stie si produsul; cosurile nu (pot avea mai multe).
  assert.match(cod("src/components/ministore/OrderModal.tsx"), /semnaleazaInceputulComenzii\(business\.id, product\.id\);/);
});
