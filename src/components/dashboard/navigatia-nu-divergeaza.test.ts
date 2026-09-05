import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Cele doua meniuri ale panoului spun acelasi lucru despre PRODUSE?
 *
 * ⚠ EXISTA DOUA, SI AU DIVERGIT DEJA.
 *
 * `Sidebar.tsx` e meniul de pe ecran lat; `DashboardTopbar.tsx` e cel de pe telefon. Al doilea
 * spune despre sine ca il oglindeste pe primul — si nu il oglindeste: ii lipsesc intrari intregi
 * din alte grupuri. Nimic nu paza asta.
 *
 * Costul e mare tocmai fiindca e invizibil pe ecranul dezvoltatorului: o functie adaugata numai
 * in bara laterala nu exista pentru comerciantii care lucreaza de pe telefon, si nimeni nu afla,
 * fiindca panoul „merge".
 *
 * ⚠ Proba se margineste la grupul PRODUSE, dinadins. Restul meniului a divergit demult, iar o
 * proba care cade de la prima rulare pe o divergenta veche ar fi fost stinsa in aceeasi zi. Aici
 * apara ce se poate apara acum, si creste cand se repara restul.
 */

const RADACINA = path.resolve(process.cwd(), "src/components/dashboard");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(fisier: string): string {
  return readFileSync(path.join(RADACINA, fisier), "utf8").replace(/\r\n/g, "\n");
}

/** Intrarile copil ale grupului „Produse", in ordine. */
function copiiiProduselor(fisier: string): string[] {
  const s = sursa(fisier);
  const grup = s.indexOf('label: "Produse"');
  assert.ok(grup > 0, `nu am gasit grupul Produse in ${fisier}`);
  const start = s.indexOf("children: [", grup);
  const stop = s.indexOf("]", start);
  assert.ok(start > 0 && stop > start, `nu am gasit lista de copii in ${fisier}`);
  const bucata = s.slice(start, stop);
  const out: string[] = [];
  for (const m of bucata.matchAll(/href:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"/g)) {
    out.push(`${m[1]} :: ${m[2]}`);
  }
  /*
   * ⚠ GARDA DE NUMARATOARE. Fara ea, o schimbare de forma a fisierului — alt fel de a scrie
   * obiectele, o virgula mutata — ar face expresia sa nu mai potriveasca nimic, iar proba ar
   * trece pe gol comparand doua liste goale. Exact modul de esec pe care proiectul il are scris.
   */
  assert.ok(out.length >= 3, `am citit doar ${out.length} intrari din ${fisier} — cititorul s-a rupt`);
  return out;
}

test("grupul Produse e IDENTIC in bara laterala si in meniul de telefon", () => {
  assert.deepEqual(
    copiiiProduselor("DashboardTopbar.tsx"),
    copiiiProduselor("Sidebar.tsx"),
    "o intrare adaugata intr-un singur meniu nu exista pentru cine lucreaza de pe telefon",
  );
});

test("Configuratoare chiar e in amandoua", () => {
  for (const fisier of ["Sidebar.tsx", "DashboardTopbar.tsx"]) {
    assert.ok(
      copiiiProduselor(fisier).some((x) => x.includes("/dashboard/products/configurators")),
      `lipseste din ${fisier}`,
    );
  }
});
