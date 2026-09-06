import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Previzualizarea din panou e CHIAR vitrina, sau o copie a ei?
 *
 * ═══ ⚠ CE COSTA O COPIE ═══
 *
 * O previzualizare desenata separat arata ce CREDE panoul ca face configuratorul, nu ce face. La
 * prima schimbare in slot, comerciantul ar verifica pe un ecran si ar vinde pe altul — iar
 * diferenta s-ar vedea abia intr-o reclamatie de client, care e ultimul loc in care vrei sa afli.
 *
 * Proiectul are tiparul scris de patru ori: al doilea meniu al panoului, cele doua cai de comanda,
 * modelele de pagina de produs, si suprafetele cosului. De fiecare data, a doua copie a divergit.
 */

const FISIER = path.resolve(
  process.cwd(),
  "src/components/dashboard/configurator/Previzualizare.tsx",
);

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

test("previzualizarea randeaza CHIAR slotul vitrinei", () => {
  const s = sursa();
  assert.ok(
    s.includes('from "@/components/storefront/sections/product/_shared/ConfiguratorSlot"'),
    "previzualizarea si-a desenat propriile campuri",
  );
  assert.ok(s.includes("<ConfiguratorSlot cfg={cfg} />"), "si nu le mai randeaza");
});

test("si trece prin ACELASI carlig", () => {
  /*
   * ⚠ Slotul singur n-ar fi de ajuns: regula „cand se poate comanda" si semanarea implicitelor
   * stau in carlig. Cu o stare scrisa de mana aici, previzualizarea ar fi aratat pagina deschisa
   * goala, iar vitrina cu implicitele comerciantului.
   */
  const s = sursa();
  assert.ok(
    s.includes('from "@/components/storefront/sections/product/_shared/useConfigurator"'),
    "previzualizarea si-a scris propria stare",
  );
  assert.match(s, /useConfigurator\(\s*\{/, "carligul nu mai primeste configuratorul prefacut");
});

test("se compileaza CIORNA cu acelasi `compileaza` ca publicarea", () => {
  /*
   * ⚠ Randata din definitia bruta, previzualizarea ar fi aratat si ce `compileaza` TAIE pentru
   * vitrina — costul intern al componentelor, regulile stinse. Comerciantul ar fi verificat un
   * configurator care nu exista nicaieri.
   */
  const s = sursa();
  assert.ok(s.includes('from "@/lib/configurators/compileaza"'), "nu mai trece prin compilare");
  assert.match(
    s,
    /compileaza\(continut\.definitie, continut\.reguli, continut\.pretuire\)/,
    "compilarea nu mai porneste de la ciorna",
  );
});

test("verificarea ruleaza LA FIECARE SCHIMBARE, nu doar la publicare", () => {
  /*
   * ⚠ Pana acum constatarile se vedeau numai dupa ce comerciantul apasa „Publica" si primea un
   * refuz. Cine construieste zece minute si abia apoi afla ca nu se poate publica reface pe
   * dibuite.
   */
  const s = sursa();
  assert.ok(s.includes('from "@/lib/configurators/validare"'), "nu mai valideaza nimic");
  assert.match(s, /valideaza\(\{[\s\S]{0,200}?definitie: continut\.definitie/, "nu valideaza ciorna");
});

test("fila e legata in builder si primeste CIORNA", () => {
  const b = readFileSync(
    path.resolve(process.cwd(), "src/components/dashboard/configurator/ConfiguratorBuilder.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert.ok(b.includes("<Previzualizare continut={continut} />"), "fila nu e legata, sau nu pe ciorna");
  assert.ok(b.includes('setFila("previzualizare")'), "butonul de fila lipseste");
});
