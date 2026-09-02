import { strict as assert } from "node:assert";
import { test } from "node:test";
import { curataTitlu, LUNGIME_MAXIMA } from "./titlu-curat";
import { verificaFaraPii } from "./fara-pii";

test("⚠ ce a cautat omul nu iese prin titlu", () => {
  /*
    ⚠ DEFECTUL VIU, gasit pe 03.09.2026. `/blog/cautare?q=…` isi pune in titlu
    exact ce s-a tastat, iar `page_view` trimite `document.title` ca `page_title`.
    Adresa era curatata; titlul nu. Deci textul scapa pe usa din dos.
  */
  const curat = curataTitlu("Căutare: adresa mea de email | Edinio", "?q=adresa mea de email");
  assert.ok(!curat.includes("adresa mea de email"), `a ramas ce a tastat omul: ${curat}`);
  assert.match(curat, /Edinio/, "s-a pierdut si partea care nu venea de la om");
});

test("⚠ regula e generala, nu legata de prefixul „Căutare:”", () => {
  /*
    Un leac scris pe prefix s-ar strica la prima pagina noua care pune altceva din
    adresa in titlu. Aici se probeaza chiar generalitatea.
  */
  const curat = curataTitlu("Comanda 998877 — starea livrarii", "?comanda=998877");
  assert.ok(!curat.includes("998877"), `valoarea din adresa a ramas in titlu: ${curat}`);
});

test("un titlu care nu poarta nimic din adresa ramane neatins", () => {
  /* ⚠ MARTORUL: regula n-are voie sa ciopirteasca titlurile obisnuite. */
  assert.equal(curataTitlu("Prețuri | Edinio", "?utm_source=google"), "Prețuri | Edinio");
  assert.equal(curataTitlu("Prețuri | Edinio", ""), "Prețuri | Edinio");
});

test("bucatile foarte scurte din adresa nu ciopirtesc titlul", () => {
  /*
    ⚠ CE APARA. `?p=2` sau `?a=de` s-ar potrivi in aproape orice titlu romanesc.
    Fara pragul de trei caractere, „Prețuri” ar deveni „Pr…țuri”.
  */
  assert.equal(curataTitlu("Prețuri și pachete", "?p=2&x=și"), "Prețuri și pachete");
});

test("⚠ un titlu lung nu mai poate omori evenimentul", () => {
  /*
    ⚠ CE APARA. `page_title` nu e anuntat ca text liber, deci paza il opreste
    peste 100 de caractere — iar cand ea opreste, se pierde evenimentul pentru
    TOTI furnizorii. Acelasi tipar ca la adresele de reclama.

    Proba se confrunta cu chiar paza, nu cu o cifra scrisa de mana aici.
  */
  const lung = "Ghid complet pentru deschiderea unui magazin online in Romania in 2026, pas cu pas, de la zero la prima comanda | Edinio";
  assert.ok(lung.length > LUNGIME_MAXIMA, "titlul de proba nu mai e lung — proba nu dovedeste nimic");

  const curat = curataTitlu(lung, "");
  assert.ok(curat.length <= LUNGIME_MAXIMA, `${curat.length} de caractere dupa curatare`);
  assert.doesNotThrow(
    () => verificaFaraPii("page_view", { page_title: curat }),
    "paza tot opreste titlul — deci `page_view` s-ar pierde pentru toti furnizorii",
  );
});

test("⚠ un text cautat cu semne de regex nu arunca si nu potriveste aiurea", () => {
  /*
    ⚠ CE APARA. Textul vine de la om. Construit intr-un `new RegExp`, `a.*b` ar fi
    sters jumatate de titlu, iar `(` ar fi aruncat — si aruncarea ar fi cazut in
    mijlocul lui `page_view`.
  */
  assert.doesNotThrow(() => curataTitlu("Rezultate pentru (a.*b | Edinio", "?q=(a.*b"));
  assert.equal(curataTitlu("Prețuri (a.*b) | Edinio", "?q=x.*y"), "Prețuri (a.*b) | Edinio");
});

test("un titlu gol ramane gol, nu devine trei puncte", () => {
  assert.equal(curataTitlu("", "?q=ceva"), "");
  assert.equal(curataTitlu("   ", "?q=ceva"), "");
});
