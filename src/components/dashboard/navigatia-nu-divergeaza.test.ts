import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MENIU_PANOU, meniuPentru } from "../../lib/navigatie-panou";

/**
 * Meniul panoului: UN SINGUR LOC, si nimeni nu-si mai face copie.
 *
 * ⚠ ISTORIA, fiindca explica de ce proba arata asa.
 *
 * `Sidebar.tsx` (ecran lat) si `DashboardTopbar.tsx` (sertarul de pe telefon) isi tineau
 * fiecare propria lista. Al doilea spunea despre sine ca il oglindeste pe primul si nu il
 * oglindea: masurat pe 20.09.2026, lipseau „Oferte", „SMS Marketing" si „Design sectiuni".
 * Adica functii intregi invizibile pentru cine lucreaza de pe telefon.
 *
 * Prima forma a probei compara cele doua liste intre ele, grup cu grup, si apara doar doua
 * grupuri din unsprezece — restul divergisera demult. Acum lista e una singura
 * (`@/lib/navigatie-panou`), deci nu mai e nimic de comparat: proba apara chiar REGULA,
 * adica faptul ca nu s-a intors nimeni la doua copii.
 */

const RADACINA = path.resolve(process.cwd(), "src/components/dashboard");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(fisier: string): string {
  return readFileSync(path.join(RADACINA, fisier), "utf8").replace(/\r\n/g, "\n");
}

const MENIURI = ["Sidebar.tsx", "DashboardTopbar.tsx"] as const;

for (const fisier of MENIURI) {
  test(`${fisier} citeste meniul comun, nu unul propriu`, () => {
    const s = sursa(fisier);
    assert.match(
      s,
      /from "@\/lib\/navigatie-panou"/,
      "meniul trebuie sa vina din modulul comun",
    );
    /*
     * ⚠ Semnul unei liste proprii e `children: [` sau un `label: "..."` langa un `href:`.
     * Daca cineva scrie iar un meniu aici, proba cade inainte ca telefonul sa ramana fara
     * jumatate din sectiuni.
     */
    assert.doesNotMatch(s, /children:\s*\[/, `${fisier} si-a facut din nou lista lui de submeniuri`);
    assert.doesNotMatch(
      s,
      /href:\s*"\/dashboard[^"]*",\s*icon:/,
      `${fisier} si-a facut din nou lista lui de sectiuni`,
    );
  });
}

test("⚠ proba chiar citeste doua fisiere diferite", () => {
  /* Perechea obligatorie: doua verificari identice trec si cand cititorul aduce, din
     greseala, acelasi fisier de doua ori. */
  assert.notEqual(sursa("Sidebar.tsx"), sursa("DashboardTopbar.tsx"));
});

test("ordinea sectiunilor e cea ceruta de proprietar (20.09.2026)", () => {
  const ceruta = [
    "Panou principal", "Comenzi", "Clienti", "Produse", "Discounturi",
    "Oferte", "Statistici", "Cosuri abandonate", "SMS Marketing", "Integrari",
  ];
  assert.deepEqual(MENIU_PANOU.map((i) => i.label).slice(0, ceruta.length), ceruta);
});

test("Decontarile si Retururile stau sub Comenzi, nu in radacina", () => {
  const comenzi = MENIU_PANOU.find((i) => i.label === "Comenzi");
  const cai = (comenzi?.children ?? []).map((c) => c.href);
  assert.ok(cai.includes("/dashboard/returns"), "Retururile au disparut din grupul Comenzi");
  assert.ok(cai.includes("/dashboard/settlements"), "Decontarile au disparut din grupul Comenzi");
  assert.ok(
    !MENIU_PANOU.some((i) => i.href === "/dashboard/settlements"),
    "Decontarile s-au intors in radacina meniului",
  );
});

test("SMS Marketing se arata doar cand comerciantul il are pornit", () => {
  const cuSms = meniuPentru({ smsoEnabled: true }).map((i) => i.label);
  const faraSms = meniuPentru({ smsoEnabled: false }).map((i) => i.label);
  assert.ok(cuSms.includes("SMS Marketing"));
  assert.ok(!faraSms.includes("SMS Marketing"));
  /* ⚠ Si nu dispare altceva odata cu el. */
  assert.equal(faraSms.length, cuSms.length - 1);
});

test("⚠ bara de jos de pe telefon nu trimite nicaieri in afara meniului", () => {
  /*
   * Bara de jos isi are lista ei, fiindca e o alegere de patru sectiuni, nu o oglinda. Dar o
   * legatura catre o sectiune care nu exista in meniu ar fi o cale pe care nimeni n-o poate
   * gasi altfel, si care s-ar rupe tacut la prima redenumire de pagina.
   */
  const bara = sursa("BottomNav.tsx");
  const caiBara = [...bara.matchAll(/href:\s*"(\/dashboard[^"]*)"/g)].map((m) => m[1]);
  assert.ok(caiBara.length >= 4, `am citit doar ${caiBara.length} intrari — cititorul s-a rupt`);

  const caiMeniu = new Set(MENIU_PANOU.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]));
  for (const cale of caiBara) {
    assert.ok(caiMeniu.has(cale), `bara de jos duce la ${cale}, care nu exista in meniu`);
  }
});
