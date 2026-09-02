import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { urmareste, inregistreazaAdaptor, goleste, resetPentruProbe, lungimeCoada, type Adaptor } from "./magistrala";
import type { EvenimentEdinio } from "./evenimente";
import { clasificaPagina, grupPagina } from "./pagini";
import { curataAdresa, doarCalea } from "./adresa-curata";
import { verificaFaraPii, EroarePii } from "./fara-pii";
import { serializeaza, NIMIC, type Stare } from "./consimtamant/stare";
import { NUME_COOKIE } from "./consimtamant/cookie";

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
  categorie: "statistici",
  gata: () => gataAcum,
  trimite: (ev, context) => { primite.push({ ev, context: context as unknown as Record<string, unknown> }); },
};

function inBrowser(cale = "/preturi") {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {
    location: { pathname: cale, hostname: "www.edinio.com", href: `https://www.edinio.com${cale}` },
    localStorage: { getItem: () => null },
  };
  g.document = { title: "Edinio", cookie: "" };
}

/**
 * Pune in browserul de proba hotararea omului.
 *
 * ⚠ SE SCRIE PRIN `serializeaza`, nu de mana. Un sir scris de mana ar imbatrani
 * la prima schimbare de format sau de amprenta a scopurilor, si probele ar cadea
 * toate deodata pe ceva ce n-are legatura cu ele.
 */
function hotaraste(statistici: boolean, marketing: boolean, metoda: Stare["metoda"] = "t") {
  const s: Stare = { ...NIMIC, statistici, marketing, cand: Math.floor(Date.now() / 1000), metoda };
  (globalThis as unknown as { document: { cookie: string } }).document.cookie =
    `${NUME_COOKIE}=${serializeaza(s)}`;
}

/** Sterge hotararea: omul n-a ales inca. */
function fataAlegere() {
  (globalThis as unknown as { document: { cookie: string } }).document.cookie = "";
}

beforeEach(() => {
  resetPentruProbe();
  primite = [];
  gataAcum = true;
  inBrowser();
  /* Probele de mai jos masoara ALTCEVA decat poarta; omul a acceptat. */
  hotaraste(true, true);
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
    categorie: "statistici",
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

/* ═══ Adresa de reclama ═══ */

test("⚠ o adresa de RECLAMA nu omoara evenimentul", () => {
  /*
    ═══ ⚠ DEFECTUL PE CARE PROBELE VECHI NU-L PUTEAU VEDEA ═══

    Paza PII arunca orice valoare mai lunga de 100 de caractere, iar cand arunca
    se pierde evenimentul pentru TOTI adaptorii — `return`, nu `continue`.

    Curatarea adresei exista, dar traia in adaptorul GA4, adica STRUCTURAL dupa
    paza. Deci `page_view`-ul de pe orice adresa cu `utm_*` si `gclid` — adica de
    pe orice clic platit — se pierdea intreg.

    ⚠ MASURAT IN PRODUCTIE pe 03.09.2026, nu dedus: cu o adresa de 177 de
    caractere, niciun `page_view` ajuns la GA4 nu purta `page_type`/`page_group`,
    parametrii pe care numai ai nostri ii au. Rapoartele pareau intregi fiindca
    GA4 trage singur un `page_view` la schimbarea de istoric.

    ⚠ Si tocmai de aceea proba se uita la ce PRIMESTE adaptorul, nu la ce s-a
    chemat: „s-a chemat urmareste" era deja adevarat si inainte de reparatie.
  */
  const adresaDeReclama =
    "https://www.edinio.com/preturi?utm_source=google&utm_medium=cpc" +
    "&utm_campaign=magazin-online-romania-2026&utm_content=anunt-text-varianta-1" +
    "&utm_term=creare+magazin+online&gclid=Cj0KCQiA1234567890abcdefghijklmnop" +
    "&fbclid=IwAR1234567890abcdefghijklmnopqrstuv";

  assert.ok(adresaDeReclama.length > 100, "adresa de proba nu e destul de lunga ca sa declanseze paza");

  urmareste({ name: "page_view", page_location: adresaDeReclama });

  assert.equal(primite.length, 1, "evenimentul s-a pierdut — exact defectul de pe traficul platit");

  const trimis = primite[0].ev as { page_location?: string };
  assert.ok(trimis.page_location, "adresa a disparut cu totul");
  /* ⚠ NU se scurteaza sub 100: o adresa de reclama e lunga din pricina
     parametrilor pastrati dinadins. Ce conteaza e ca a AJUNS, si curatata. */
  assert.ok(trimis.page_location.length > 100, "adresa de proba n-a ramas lunga");

  /* ⚠ Si ca s-a pastrat ce trebuie: parametrii de achizitie, fara id-ul de clic. */
  assert.match(trimis.page_location, /utm_source=google/, "s-a pierdut sursa campaniei");
  assert.match(trimis.page_location, /gclid=/, "s-a pierdut id-ul de clic Google, care e pastrat dinadins");
  /* ⚠ `fbclid` e dinadins in AFARA listei albe — un id de clic al unui tert n-are
     ce cauta intr-un raport de analiza. `utm_term` si `gclid` sunt pe lista. */
  assert.ok(!trimis.page_location.includes("fbclid"), "a ramas `fbclid`, care nu e pe lista alba");
  assert.match(trimis.page_location, /utm_term=/, "s-a pierdut un parametru care E pe lista alba");
});

test("⚠ adresa curatata ajunge la TOTI adaptorii, nu doar la GA4", () => {
  /*
    ⚠ Pana la reparatie, fiecare adaptor se curata singur — si numai GA4 o facea.
    Deci adresa intreaga, cu `gclid`, ajungea la Meta si la TikTok.
  */
  const cuGclid = "https://www.edinio.com/?gclid=Cj0KCQiA" + "x".repeat(80) + "&utm_source=google";
  urmareste({ name: "page_view", page_location: cuGclid });

  assert.equal(primite.length, 1);
  const trimis = primite[0].ev as { page_location: string };
  assert.notEqual(trimis.page_location, cuGclid, "adaptorul a primit adresa BRUTA");
  assert.equal(trimis.page_location, curataAdresa(cuGclid), "adaptorul n-a primit chiar versiunea curatata");
});

/* ═══ 7. Poarta consimtamantului ═══ */

test("⚠ inainte de alegere nu se trimite nimic — SI NICI NU SE ASTEAPTA", () => {
  /*
    ⚠ CE APARA, si de ce a doua jumatate conteaza mai mult decat prima.

    Ca nu se trimite fara acord se vedea si inainte: niciun furnizor nu era
    incarcat, deci `gata()` era fals. Numai ca atunci evenimentul intra LA COADA.
    Iar coada se golea la „Accepta" — deci furnizorii primeau, cu intarziere, tot
    ce facuse omul cat timp inca se gandea.

    Acordul se da inainte. Nu se cumpara retroactiv.
  */
  fataAlegere();
  gataAcum = false;
  urmareste({ name: "cta_click", cta_id: "hero_incepe", cta_location: "hero" });

  assert.equal(primite.length, 0, "s-a trimis fara acord");
  assert.equal(lungimeCoada(), 0, "evenimentul asteapta ca sa fie trimis dupa „Accepta”");

  /* Si acum omul accepta. Ce a fost inainte ramane inainte. */
  hotaraste(true, true);
  gataAcum = true;
  goleste("proba");
  assert.equal(primite.length, 0, "acceptarea a trimis retroactiv ce s-a intamplat inaintea ei");
});

test("⚠ dupa retragere, un furnizor DEJA INCARCAT nu mai primeste", () => {
  /*
    ⚠ CE APARA. `window.gtag` nu se descarca. Odata pusa in pagina, functia ramane
    acolo — deci `gata()` ramane adevarat si dupa ce omul a retras. Pe o aplicatie
    de o singura pagina, asta tine pana la urmatoarea reincarcare, adica oricat.

    Aici `gataAcum` ramane dinadins `true`: exact lumea de dupa retragere.
  */
  urmareste({ name: "cta_click", cta_id: "unu", cta_location: "hero" });
  assert.equal(primite.length, 1, "martorul: cu acord se trimite");

  hotaraste(false, false, "r");
  urmareste({ name: "cta_click", cta_id: "doi", cta_location: "hero" });

  assert.equal(primite.length, 1, "s-a trimis dupa retragere, catre un furnizor ramas incarcat");
  assert.equal(lungimeCoada(), 0, "evenimentul de dupa retragere asteapta o razgandire");
});

test("⚠ acordul pentru statistici nu deschide si marketingul", () => {
  /*
    ⚠ CE APARA. Toti furnizorii Google impart acelasi `window.gtag`. Cu forma
    veche — `gata: () => gtag() !== null` la amandoua — eticheta GA4 incarcata pe
    temei de statistici facea si adaptorul Google Ads sa se creada gata. O
    conversie publicitara pleca atunci pentru un om care bifase DOAR statistici.
  */
  const laMarketing: EvenimentEdinio[] = [];
  inregistreazaAdaptor({
    categorie: "marketing",
    nume: "reclame-proba",
    gata: () => true,
    trimite: (ev) => { laMarketing.push(ev); },
  });

  hotaraste(true, false, "p");
  urmareste({ name: "cta_click", cta_id: "hero_incepe", cta_location: "hero" });

  assert.equal(primite.length, 1, "statisticile erau acordate — martorul n-a primit");
  assert.equal(laMarketing.length, 0, "o conversie publicitara a plecat cu acord doar de statistici");
});

test("⚠ un cookie stricat inseamna NU, nu «probabil da»", () => {
  /*
    Toate caile de esec ale citirii — versiune veche, amprenta schimbata, sir
    ciuntit — dau `null`. Niciuna n-are voie sa cada spre „a acceptat".
  */
  (globalThis as unknown as { document: { cookie: string } }).document.cookie =
    "edinio_consimtamant=asta-nu-e-o-hotarare";
  urmareste({ name: "cta_click", cta_id: "x", cta_location: "hero" });
  assert.equal(primite.length, 0, "un cookie de neinteles a fost luat drept acord");
});

test("⚠ retragerea prinde din urma un eveniment care astepta deja la coada", () => {
  /*
    ⚠ FEREASTRA. Omul accepta, evenimentul se trage inainte ca eticheta sa se fi
    incarcat — deci intra la coada, pe drept. Pana sa se incarce eticheta, omul se
    razgandeste din „Setari Cookies". Apoi eticheta se incarca si cheama `goleste`.

    Fara reverificare la golire, evenimentul pleaca — pe un acord care nu mai
    exista in clipa trimiterii. Coada nu e o promisiune, e o asteptare.
  */
  gataAcum = false;
  urmareste({ name: "cta_click", cta_id: "hero_incepe", cta_location: "hero" });
  assert.equal(lungimeCoada(), 1, "martorul: cu acord si fara eticheta, se asteapta");

  hotaraste(false, false, "r");
  gataAcum = true;
  goleste("proba");

  assert.equal(primite.length, 0, "s-a trimis ce astepta, desi acordul s-a stins intre timp");
  assert.equal(lungimeCoada(), 0, "a ramas la coada dupa retragere");
});

test("⚠ un camp de AUTOR nou e oprit; `article_author` trece, fiindca poarta slugul", () => {
  /*
    ⚠ DEFECTUL VIU, reparat pe 03.09.2026. `article_view` trimitea numele adevarat
    al omului care a scris articolul — catre GA4, Meta SI TikTok. Publicat sub
    articol nu inseamna ingaduit intr-un cont de reclame; politica Google
    interzice datele care identifica o persoana in Analytics, iar sanctiunea lor
    poate fi stergerea datelor proprietatii.

    Acum pleaca slugul. Proba pazeste URMATORUL camp de acelasi fel.
  */
  assert.throws(
    () => verificaFaraPii("comment_view", { comment_author: "Ion Popescu" }),
    EroarePii,
    "un camp de autor nou ar duce numele unui om in trei conturi de reclame",
  );
  assert.throws(() => verificaFaraPii("x", { autor: "Ion Popescu" }), EroarePii);

  /* Si martorul: cel anuntat, care poarta slugul, trece. */
  assert.doesNotThrow(() => verificaFaraPii("article_view", { article_author: "ion-popescu" }));
});
