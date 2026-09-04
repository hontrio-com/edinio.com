import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ACASA,
  firimituriJsonLd,
  firimituriStructurate,
  verificaFirimituri,
  type Firimitura,
} from "./breadcrumbs";
import { SITE_URL } from "./metadata";

/*
 * De ce probe si nu o privire in browser:
 *
 * Firimiturile au o jumatate pe care NU o vede nimeni — blocul `BreadcrumbList`
 * trimis catre Google. O adresa relativa, o cheie `item` pusa si pe ultima
 * pozitie sau o firimitura de mijloc fara link arata IDENTIC pe ecran si strica
 * doar rezultatul din cautare, adica exact locul in care nimeni nu se uita
 * saptamani la rand.
 *
 * Aceeasi lectie ca la sitemap: [[sitemap-arhitectura]] a stat gol doua
 * saptamani fiindca nimic nu-l intreba daca mai are ceva in el.
 */

const SIR: Firimitura[] = [
  ACASA,
  { label: "Centru de ajutor", href: "/ajutor" },
  { label: "Primii pasi" },
];

test("prima firimitura duce la radacina, fara slash la coada", () => {
  const bloc = firimituriStructurate([ACASA, { label: "Oriunde" }]);
  /* `${SITE_URL}/` ar da „https://www.edinio.com/", care e alta adresa decat
     canonicul paginii de start. */
  assert.equal(bloc.itemListElement[0].item, SITE_URL);
});

test("ULTIMA firimitura ramane fara `item`: e pagina pe care esti deja", () => {
  const bloc = firimituriStructurate(SIR);
  const ultima = bloc.itemListElement[bloc.itemListElement.length - 1];
  assert.equal("item" in ultima, false);
  assert.equal(ultima.name, "Primii pasi");
});

test("toate celelalte au adresa ABSOLUTA, nu calea relativa", () => {
  const bloc = firimituriStructurate(SIR);
  assert.equal(bloc.itemListElement[1].item, `${SITE_URL}/ajutor`);
});

test("pozitiile pornesc de la 1 si merg din unu in unu", () => {
  const bloc = firimituriStructurate(SIR);
  assert.deepEqual(
    bloc.itemListElement.map((x) => x.position),
    [1, 2, 3],
  );
});

test("un sir corect trece verificarea", () => {
  assert.equal(verificaFirimituri(SIR), null);
  assert.equal(verificaFirimituri([ACASA, { label: "Contact" }]), null);
});

test("o firimitura din MIJLOC fara href e semnalata", () => {
  /* Asta e greseala care nu se vede pe ecran: pe pagina, o firimitura fara link
     arata doar ca text stins, dar in `BreadcrumbList` Google cere `item` pentru
     tot ce nu e ultimul element, si respinge blocul intreg. */
  const stricat: Firimitura[] = [ACASA, { label: "Resurse" }, { label: "Blog" }];
  const eroare = verificaFirimituri(stricat);
  assert.notEqual(eroare, null);
  assert.match(String(eroare), /Resurse/);
});

test("sirul gol si eticheta goala sunt semnalate", () => {
  assert.notEqual(verificaFirimituri([]), null);
  assert.notEqual(verificaFirimituri([ACASA, { label: "   " }]), null);
});

test("`<` iese escapat, ca un `</script>` sa nu inchida blocul mai devreme", () => {
  const text = firimituriJsonLd([ACASA, { label: "a</script><b>" }]);
  assert.equal(text.includes("</script>"), false);
  assert.equal(text.includes("\\u003c/script>"), true);
  /* Escapat, dar tot JSON valid — altfel am fi rezolvat o problema stricand alta. */
  assert.equal(JSON.parse(text).itemListElement[1].name, "a</script><b>");
});
