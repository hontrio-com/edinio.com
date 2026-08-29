import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   PATRU LUCRURI CERUTE DE COMERCIANT, LA LISTA DE PRODUSE      (30.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Toate patru vin din folosirea zilnica, nu dintr-un audit — si trei dintre ele lovesc exact pe
   cine lucreaza mai incet sau se uita mai atent.
*/

const pagina = readFileSync("src/app/(dashboard)/dashboard/products/page.tsx", "utf8");
const lista = readFileSync("src/components/dashboard/ProductsClient.tsx", "utf8");
const editare = readFileSync("src/app/(dashboard)/dashboard/products/[productId]/edit/page.tsx", "utf8");
const sigla = readFileSync("src/components/dashboard/SiglaMarketplace.tsx", "utf8");
const formular = readFileSync("src/components/dashboard/ProductForm.tsx", "utf8");

function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

test("⚠ lista nu se remonteaza la fiecare litera scrisa in cautare", () => {
  /*
   * ═══ CINE SCRIE INCET PIERDEA FOCUSUL DUPA FIECARE LITERA ═══
   *
   * `<Suspense key={JSON.stringify(filtre)}>` cuprindea si textul cautat. Fiecare litera ajunsa la
   * server schimba cheia, React demonta tot `ProductsClient`, si caseta de cautare devenea alt nod
   * DOM: focusul se ducea, iar intre timp se vedea scheletul.
   *
   * ⚠ Un om care scrie repede nu simtea nimic — asteptarea de 400 ms ii aduna literele intr-o
   * singura cerere. Reclamat de un comerciant cu dificultati locomotorii: defectul lovea exact pe
   * cine scrie mai greu.
   */
  const cod = faraComentarii(pagina);
  assert.doesNotMatch(cod, /<Suspense[^>]*key=/,
    "o cheie pe `Suspense` remonteaza lista, deci arunca si caseta de cautare");
  assert.match(cod, /<Suspense fallback=/, "scheletul ramane, doar cheia pleaca");
});

test("⚠ dar selectia tot se goleste cand se schimba ce se vede", () => {
  /*
   * ⚠ Remontarea avea un rost adevarat: altfel raman bifate produse care nu mai sunt in lista, iar
   * actiunile in masa — inclusiv STERGEREA — ar lucra pe ele. Rostul ramane, mijlocul se schimba.
   */
  const cod = faraComentarii(lista);
  assert.match(cod, /const semnaturaFiltre = JSON\.stringify\(filtre\);/,
    "nu se urmareste schimbarea filtrelor");
  const i = cod.indexOf("semnaturaVeche.current = semnaturaFiltre;");
  assert.ok(i > 0, "nu se tine minte semnatura veche");
  const ram = cod.slice(i, i + 200);
  assert.match(ram, /clearSelection\(\);/,
    "la schimbarea filtrelor selectia trebuie golita, altfel se lucreaza pe produse nevazute");
});

test("⚠ intoarcerea din editare poarta TOATE filtrele, nu doar pagina", () => {
  /*
   * ⚠ Se ducea numai `?page=`. Cine cautase ceva se intorcea dupa „Salveaza" intr-o lista
   * NEFILTRATA — la aceeasi pagina, dar cu alte produse. Iar cand lista lui filtrata avea o
   * singura pagina, `currentPage` era 1, deci nu se trimitea nimic si intoarcerea ateriza chiar
   * la inceputul catalogului.
   */
  const cod = faraComentarii(lista);
  /*
   * ⚠ SE DECUPEAZA CHIAR `interogareLista`, nu se cauta in tot fisierul. `cereFiltre` scrie
   * ACELEASI linii `p.set(…)` cateva randuri mai sus — iar o cautare larga ramane verde cand se
   * scoate o cheie de aici, fiindca se potriveste cu ea. Confruntarea cu defectul a aratat-o.
   */
  const iI = cod.indexOf("const interogareLista = () => {");
  assert.ok(iI > 0, "interogareLista a disparut");
  const corpI = cod.slice(iI, cod.indexOf("};", iI));
  for (const cheie of ["search", "cat", "stare", "stoc", "page"]) {
    assert.match(corpI, new RegExp(`p\\.set\\("${cheie}"`),
      `adresa de intoarcere nu poarta \`${cheie}\``);
  }
  assert.match(cod, /const editHref = \(id: string\) => \{/, "editHref nu mai compune interogarea");
  assert.match(cod, /interogareLista\(\)/, "editHref nu foloseste interogarea listei");

  /* ⚠ Si pagina de editare le citeste inapoi pe toate, nu doar pe una. */
  const ed = faraComentarii(editare);
  assert.match(ed, /function intoarcereLaLista\(/, "editarea nu reface adresa listei");
  for (const cheie of ["search", "cat", "stare", "stoc", "page"]) {
    assert.match(ed, new RegExp(`sp\\.${cheie}`), `intoarcerea nu citeste \`${cheie}\``);
  }
  assert.doesNotMatch(ed, /page=\$\{encodeURIComponent\(page\)\}/,
    "forma veche ducea numai pagina");
});

test("⚠ siglele marketplace-urilor isi pastreaza raportul", () => {
  /*
   * ═══ TOATE ERAU STRIVITE INTR-UN PATRAT DE 16×16 ═══
   *
   * Niciuna nu e patrata: Trendyol 4,35:1, eMAG 3,73:1, About You 9,86:1, OLX 1,73:1. Reclamat cu
   * poza: literele ieseau lipite si ilizibile.
   */
  assert.match(sigla, /width: "auto"/, "latimea trebuie sa iasa din raport, nu sa fie impusa");
  assert.match(sigla, /object-contain/, "fara `object-contain`, un parinte tot o poate intinde");
  assert.match(sigla, /maxWidth: latimeMax/,
    "fara margine de latime, About You ar impinge butonul afara din rand");

  /*
   * ⚠ Si nicaieri nu se mai deseneaza o sigla de marketplace cu latime SI inaltime fixate. Asta e
   * chiar forma defectului, si e usor de scris din nou din obisnuinta.
   */
  for (const [nume, sursa] of [["ProductForm", formular], ["ProductsClient", lista]] as const) {
    assert.doesNotMatch(sursa, /integrations\/(olx|trendyol|emag|aboutyou)[^"]*"[^/]*className="h-\d/,
      `${nume} deseneaza o sigla cu dimensiuni fixate`);
    assert.match(sursa, /<SiglaMarketplace piata=/, `${nume} nu foloseste componenta`);
  }
});

test("⚠ bara de selectie publica numai unde exista o cale pe ID-uri", () => {
  /*
   * ⚠ ABOUT YOU LIPSESTE DINADINS. Caile lui in masa pornesc de la `aboutyou_listings`, deci ating
   * numai produsele care AU DEJA o listare acolo. Un buton „Publica pe About You" ar fi sarit tacut
   * exact produsele pe care le-ar bifa cineva care vrea sa le publice — chiar defectul documentat
   * la eMAG, unde „la prima folosire nu se punea nimic la rand" si mesajul dadea vina pe altceva.
   */
  const cod = faraComentarii(lista);
  assert.match(cod, /publishProductsToOlx\(businessId/, "OLX");
  assert.match(cod, /bulkPublishTrendyol\(businessId/, "Trendyol");
  assert.match(cod, /publicaSelectiaPeEmag\(businessId/, "eMAG");
  assert.doesNotMatch(cod, /aboutyou|AboutYou/i,
    "About You n-are cale pe id-uri; un buton acolo ar sari tacut produsele nelistate");

  /* ⚠ Si fiecare buton apare numai daca integrarea lui e chiar conectata. */
  for (const steag of ["olxConnected", "trendyolConnected", "emagConnected"]) {
    assert.match(cod, new RegExp(`\\{${steag} && \\(`), `butonul nu se ascunde cand lipseste ${steag}`);
  }
  /* ⚠ Iar steagurile vin de la server, citite din configurari. */
  const p = faraComentarii(pagina);
  assert.match(p, /trendyol_config, emag_config/, "pagina nu citeste conexiunile");
});
