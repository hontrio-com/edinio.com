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
 * ⚠ Proba apara grupurile din `GRUPURI_APARATE`, nu tot meniul. Restul a divergit demult, iar o
 * proba care cade de la prima rulare pe o divergenta veche ar fi fost stinsa in aceeasi zi. Aici
 * apara ce se poate apara acum, si creste cand se repara restul: vezi nota de langa lista.
 */

const RADACINA = path.resolve(process.cwd(), "src/components/dashboard");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(fisier: string): string {
  return readFileSync(path.join(RADACINA, fisier), "utf8").replace(/\r\n/g, "\n");
}

/** Intrarile copil ale unui grup, in ordine. */
function copiiiGrupului(fisier: string, eticheta: string): string[] {
  const s = sursa(fisier);
  const grup = s.indexOf(`label: "${eticheta}"`);
  assert.ok(grup > 0, `nu am gasit grupul ${eticheta} in ${fisier}`);
  const start = s.indexOf("children: [", grup);
  const stop = s.indexOf("]", start);
  assert.ok(start > 0 && stop > start, `nu am gasit lista de copii a grupului ${eticheta} in ${fisier}`);
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

/*
 * ⚠ GRUPURILE APARATE CRESC, NU SE INLOCUIESC.
 *
 * Proba s-a nascut aparand doar PRODUSE, fiindca restul meniului divergise demult si o proba
 * care cade de la prima rulare se stinge in aceeasi zi. COMENZI a intrat pe 16.09.2026, cand
 * „Decontari” s-a mutat din radacina in grupul comenzilor: cu prilejul ala s-a vazut ca
 * meniul de telefon nu avea deloc RETURURILE, deci cine lucreaza de pe telefon n-avea cum sa
 * ajunga la ele. Cele doua liste sunt acum identice, deci se pot apara.
 */
const GRUPURI_APARATE = ["Produse", "Comenzi"] as const;

for (const grup of GRUPURI_APARATE) {
  test(`grupul ${grup} e IDENTIC in bara laterala si in meniul de telefon`, () => {
    assert.deepEqual(
      copiiiGrupului("DashboardTopbar.tsx", grup),
      copiiiGrupului("Sidebar.tsx", grup),
      "o intrare adaugata intr-un singur meniu nu exista pentru cine lucreaza de pe telefon",
    );
  });
}

/*
 * ⚠ Si nu se pierde pe drum: o intrare mutata sub un grup trebuie sa fie CHIAR acolo, nu
 * doar sa lipseasca din radacina. O proba care ar cere numai lipsa ar trece si daca cineva ar
 * sterge pagina cu totul.
 */
test("Decontarile stau sub Comenzi in amandoua meniurile, si nu in radacina", () => {
  for (const fisier of ["Sidebar.tsx", "DashboardTopbar.tsx"]) {
    const copii = copiiiGrupului(fisier, "Comenzi");
    assert.ok(
      copii.some((c) => c.startsWith("/dashboard/settlements ::")),
      `Decontarile nu mai sunt sub Comenzi in ${fisier}`,
    );
    assert.doesNotMatch(
      sursa(fisier),
      /icon:\s*Banknote/,
      `${fisier} are inca o intrare de radacina pentru Decontari`,
    );
  }
});

test("⚠ probele CHIAR citesc doua fisiere diferite", () => {
  /*
   * ⚠ Perechea obligatorie a probei de deasupra. `deepEqual` pe doua liste identice trece si
   * cand cititorul ar aduce, din greseala, ACELASI fisier de doua ori — de pilda dupa o
   * redenumire, sau daca cineva ar face `sursa()` sa cada pe o cale implicita. Atunci proba ar
   * ramane verde la nesfarsit, fara sa mai compare nimic.
   */
  const a = sursa("Sidebar.tsx");
  const b = sursa("DashboardTopbar.tsx");
  assert.notEqual(a, b, "cele doua meniuri se citesc din acelasi fisier");
});
