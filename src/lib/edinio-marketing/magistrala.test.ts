import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { urmareste, inregistreazaAdaptor, goleste, resetPentruProbe, lungimeCoada, type Adaptor } from "./magistrala";
import type { EvenimentEdinio } from "./evenimente";
import { clasificaPagina, grupPagina } from "./pagini";
import { curataAdresa, doarCalea } from "./adresa-curata";
import { verificaFaraPii, EroarePii } from "./fara-pii";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  MAGISTRALA DE MASURARE — PROBATA PRIN CHEMARE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TOT CE E AICI SE EXECUTA. Nicio proba nu cauta text in sursa: lectia zilei de
  01.09.2026 e ca o proba care citeste forma trece verde peste sase mutatii din
  noua. Aici se pune un adaptor de mana, se trage un eveniment, si se verifica CE
  A PRIMIT el.
*/

type Primit = { ev: EvenimentEdinio; context: Record<string, unknown> };

let primite: Primit[] = [];
let gataAcum = true;

const adaptorDeProba: Adaptor = {
  nume: "proba",
  gata: () => gataAcum,
  trimite: (ev, context) => { primite.push({ ev, context: context as unknown as Record<string, unknown> }); },
};

function inBrowser(cale = "/preturi") {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {
    location: { pathname: cale, hostname: "www.edinio.com", href: `https://www.edinio.com${cale}` },
    localStorage: { getItem: () => null },
  };
  g.document = { title: "Edinio" };
}

beforeEach(() => {
  resetPentruProbe();
  primite = [];
  gataAcum = true;
  inBrowser();
  inregistreazaAdaptor(adaptorDeProba);
});

/* ═══ 1. Contextul se pune de magistrala, nu de componenta ═══ */

test("fiecare eveniment poarta felul si grupul paginii, fara ca apelantul sa le stie", () => {
  /*
    ⚠ ASTA E ROSTUL MAGISTRALEI. O componenta spune „s-a apasat butonul asta". Ea
    nu stie, si n-are de ce sa stie, pe ce fel de pagina se afla. Daca ar sti,
    fiecare componenta ar duplica clasificarea si cele douazeci de copii s-ar
    desparti la prima ruta noua.
  */
  urmareste({ name: "cta_click", cta_id: "hero_incepe", cta_location: "hero" });

  assert.equal(primite.length, 1);
  assert.equal(primite[0].context.page_type, "pricing");
  assert.equal(primite[0].context.page_group, "site");
});

test("un adaptor cazut nu-i opreste pe ceilalti si nu doboara pagina", () => {
  /*
    ⚠ REGULA PE CARE O INCALCA CELE MAI MULTE SISTEME DE URMARIRE. O masuratoare
    stricata n-are voie sa strice pagina omului. Daca proba asta cade, o eroare
    dintr-un furnizor ajunge in randarea site-ului.
  */
  inregistreazaAdaptor({
    nume: "stricat",
    gata: () => true,
    trimite: () => { throw new Error("furnizorul a cazut"); },
  });

  assert.doesNotThrow(() => urmareste({ name: "registration_view" }));
  assert.equal(primite.length, 1, "adaptorul bun n-a mai primit evenimentul");
});

/* ═══ 2. Coada — evenimentele de la montare nu se pierd ═══ */

test("⚠ un eveniment tras inainte ca furnizorul sa fie gata NU se pierde", () => {
  /*
    Eticheta Google se incarca `afterInteractive`. Un `page_view` tras dintr-un
    efect la montare se produce INAINTE ca `gtag` sa existe. Fara coada, el se
    pierde tacut — si abia peste o luna se intreaba cineva de ce paginile au mai
    putine vizualizari decat sesiuni.
  */
  gataAcum = false;
  urmareste({ name: "page_view", page_location: "https://www.edinio.com/preturi" });

  assert.equal(primite.length, 0, "a fost trimis desi furnizorul nu era gata");
  assert.equal(lungimeCoada(), 1, "n-a intrat la coada");

  gataAcum = true;
  goleste("proba");

  assert.equal(primite.length, 1, "coada nu s-a golit");
  assert.equal(lungimeCoada(), 0);
});

test("golirea nu trimite de doua ori", () => {
  gataAcum = false;
  urmareste({ name: "registration_view" });
  gataAcum = true;
  goleste("proba");
  goleste("proba");
  assert.equal(primite.length, 1, "acelasi eveniment a plecat de doua ori");
});

test("coada are plafon — un furnizor care nu vine niciodata nu umfla memoria", () => {
  gataAcum = false;
  for (let i = 0; i < 80; i++) urmareste({ name: "registration_view" });
  assert.ok(lungimeCoada() <= 50, `coada a crescut la ${lungimeCoada()}`);
});

/* ═══ 3. Nimic personal nu iese ═══ */

test("⚠ un parametru cu nume oprit ARUNCA in dezvoltare", () => {
  /*
    Aruncarea e dinadins: greseala trebuie vazuta de cine o scrie, in clipa in
    care o scrie. In productie magistrala prinde aruncarea si lasa evenimentul
    balta — vezi nota din `fara-pii.ts`.
  */
  assert.throws(
    () => verificaFaraPii("test", { email: "ion@exemplu.ro" }),
    EroarePii,
  );
  assert.throws(() => verificaFaraPii("test", { user_phone: "0750456809" }), EroarePii);
  assert.throws(() => verificaFaraPii("test", { token: "abc" }), EroarePii);
});

test("⚠ si o valoare care ARATA a om, chiar sub un nume nevinovat", () => {
  /*
    Paza pe numele cheilor nu ajunge: `termen_cautare` poate purta o adresa de
    email daca omul a cautat-o. De aceea se cauta si TIPARE in valori.
  */
  assert.throws(() => verificaFaraPii("test", { search_term: "ion@exemplu.ro" }), EroarePii);
  assert.throws(() => verificaFaraPii("test", { nota: "sunam la 0750456809" }), EroarePii);
  assert.throws(() => verificaFaraPii("test", { cod: "RO49AAAA1B31007593840000" }), EroarePii);
});

test("valorile obisnuite trec fara sa se planga nimeni", () => {
  assert.doesNotThrow(() => verificaFaraPii("cta_click", {
    cta_id: "hero_incepe", cta_location: "hero", plan_id: "pro", billing_period: "annual",
  }));
});

/* ═══ 4. Adresa care ajunge in raport ═══ */

test("⚠ jetonul de dezabonare NU ajunge in raport", () => {
  /*
    ⚠ NU E DOAR CONFIDENTIALITATE. Jetonul ala E cheia: cine vede raportul poate
    dezabona in numele omului. Si din GA4 nu se sterge.
  */
  const curat = curataAdresa("https://www.edinio.com/blog/dezabonare?token=abc123&utm_source=x");
  assert.equal(curat, "https://www.edinio.com/blog/dezabonare");
  assert.doesNotMatch(curat, /token/);
  assert.doesNotMatch(curat, /utm_source/, "pe o cale sensibila se taie TOT, nu doar jetonul");
});

test("parametrii de achizitie raman pe paginile obisnuite", () => {
  const curat = curataAdresa("https://www.edinio.com/preturi?utm_source=google&gclid=abc&altceva=1");
  assert.match(curat, /utm_source=google/);
  assert.match(curat, /gclid=abc/);
  assert.doesNotMatch(curat, /altceva/, "un parametru necunoscut a trecut");
});

test("identificatorii de clic ai tertilor NU intra in Analytics", () => {
  /* `fbclid`/`ttclid` sunt ai altcuiva si n-au ce cauta intr-un raport de analiza. */
  const curat = curataAdresa("https://www.edinio.com/?fbclid=xyz&ttclid=abc&utm_source=fb");
  assert.doesNotMatch(curat, /fbclid/);
  assert.doesNotMatch(curat, /ttclid/);
  assert.match(curat, /utm_source=fb/);
});

test("fragmentul se arunca intotdeauna", () => {
  assert.doesNotMatch(curataAdresa("https://www.edinio.com/preturi#orice"), /orice/);
});

test("o adresa stricata nu doboara nimic", () => {
  assert.equal(curataAdresa("nu e o adresa"), "");
  assert.equal(doarCalea("nici asta"), "");
});

/* ═══ 5. Clasificarea paginilor ═══ */

test("caile se clasifica, si cele lungi bat pe cele scurte", () => {
  assert.equal(clasificaPagina("/"), "home");
  assert.equal(clasificaPagina("/preturi"), "pricing");
  assert.equal(clasificaPagina("/blog"), "blog_index");
  assert.equal(clasificaPagina("/blog/un-articol"), "blog_article");
  /* ⚠ Ordinea: fara ea, `/blog/categorie/x` ar fi socotit articol. */
  assert.equal(clasificaPagina("/blog/categorie/marketing"), "blog_category");
  assert.equal(clasificaPagina("/ajutor/comenzi/cum-anulez"), "help_guide");
  assert.equal(clasificaPagina("/cookies"), "legal");
});

test("bara de la sfarsit si parametrii nu schimba felul paginii", () => {
  assert.equal(clasificaPagina("/preturi/"), "pricing");
  assert.equal(clasificaPagina("/preturi?utm_source=x"), "pricing");
  assert.equal(clasificaPagina("/preturi#sectiune"), "pricing");
});

test("o cale necunoscuta e `other`, nu o aruncare", () => {
  assert.equal(clasificaPagina("/ceva-ce-nu-exista"), "other");
  assert.equal(clasificaPagina(null), "other");
  assert.equal(grupPagina("other"), "other");
});
