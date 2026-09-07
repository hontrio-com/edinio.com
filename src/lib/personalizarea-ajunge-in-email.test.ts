import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randPersonalizare } from "@/lib/email";
import { cheieIncarcare } from "@/lib/customization/fisiere-private";

/**
 * Personalizarea ajunge in emailul comerciantului SI in al clientului.
 *
 * ═══ ⚠ DE CE EXISTA FISIERUL ASTA ═══
 *
 * Un ajutor care facea exact lucrul asta a mai existat o data si s-a PIERDUT la o curatenie:
 * `grep -rn randConfiguratie src/` da azi zero, desi in istorie e scris cu tot cu motive. Nimic
 * n-a cazut cand a plecat — nici tsc, nici testele, nici build-ul — fiindca un email caruia ii
 * lipseste un rand se trimite in continuare, la fel de verde. A doua oara nu mai trebuie sa se
 * poata intampla in tacere, si de-asta prima proba de mai jos citeste SURSA: intr-o proba nu se
 * poate randa emailul intreg (nu exista harness care sa cheme `sendNewOrderEmail`), deci
 * legatura dintre ajutor si constructorul de randuri se apara pe text.
 *
 * ⚠ CE COSTA lipsa lui: atelierul primeste „Fototapet personalizat x1 — 1.234,00 lei” si atat,
 * desi dimensiunile, textul scris de client si fisierul incarcat sunt toate scrise in comanda.
 */

const RAD = process.cwd();

/**
 * ⚠ Secretul se pune AICI, nu se presupune: `cheieIncarcare` il citeste la fiecare chemare si
 * ARUNCA daca lipseste (vezi `secret()` din `fisiere-private.ts`). Fara randul asta proba n-ar
 * cadea pe ce apara ea, ci la import.
 */
process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-emailuri";

const BIZ = "11111111-1111-4111-8111-111111111111";

/**
 * ⚠ O CHEIE ADEVARATA, SEMNATA — nu o adresa veche.
 *
 * Toate probele de aici hraneau `randPersonalizare` numai cu `https://cdn.exemplu.ro/...`. Adica
 * masurau un singur lucru: ca se taie adresele `http`. O ramura care scrie valoarea tocmai cand
 * ea NU e o adresa — „e doar un nume de fisier, ce rau sa faca” — trecea nevazuta, si tocmai
 * forma aia e cea de azi.
 *
 * ⚠ MASURAT, nu banuit: un mutant care adauga la numar si cheile
 * (`adrese.filter((a) => a.startsWith("products/customizations/"))`, tiparite langa cifra) a
 * trecut VERDE peste probele vechi, si cade pe cele de acum. Cu el, cheia semnata — purtatoare
 * de acces direct la galeata — se intorcea in email, adica exact ce s-a scos.
 */
const CHEIE = cheieIncarcare(BIZ, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "jpg");

/** Coada semnata a cheii. Nici ea singura nu are voie sa apara in HTML-ul emis. */
const SEMNATURA = (() => {
  const m = /-([0-9a-f]{24})\.[a-z0-9]{1,5}$/.exec(CHEIE);
  if (!m) throw new Error(`cheia de proba nu are forma asteptata: ${CHEIE}`);
  return m[1];
})();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF (`order.actions.ts` e unul). */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

/** Bucata de la `export ... function <nume>` pana la urmatorul export de nivel zero. */
function corpul(text: string, nume: string): string {
  const start = text.indexOf(`export async function ${nume}(`);
  assert.notEqual(start, -1, `nu s-a gasit ${nume} in src/lib/email.ts`);
  const stop = text.indexOf("\nexport ", start + 1);
  return text.slice(start, stop === -1 ? text.length : stop);
}

/**
 * Bucata de sursa cu comentariile APLATIZATE: fara prefixele ` * ` si fara taieturile de rand.
 *
 * ⚠ Fara asta orice regula pusa pe textul unui comentariu trece degeaba: promisiunea din
 * `randPersonalizare` e rupta la jumatate de sfarsitul randului („…butonul «Vezi comanda in” /
 * „dashboard» e chiar dedesubt…”), deci cautata ca sir intreg nu se gaseste NICIODATA, iar
 * asertiunea de deasupra ei ar fi verde orice ar scrie acolo.
 */
function fraze(bloc: string): string {
  return bloc.replace(/^[ \t]*\*[ \t]?/gm, "").replace(/\s+/g, " ");
}

/**
 * Textul butonului din emailul comerciantului. ⚠ E ancora care leaga comentariul de AMANDOUA
 * sursele: proba cere ca el sa existe in corpul lui `sendNewOrderEmail`, sa NU existe in al lui
 * `sendOrderConfirmationToCustomer`, si ca orice pomenire a lui din comentariu sa fie lipita de
 * emailul comerciantului. Daca butonul se redenumeste in email, comentariul care il citeaza
 * trebuie sa se schimbe odata cu el — asta e si scopul.
 */
const BUTON = "Vezi comanda in dashboard";

/* ═══════════════════════════════════════════════════════════════════════════
   1. LEGATURA: ajutorul e CHEMAT, nu doar scris
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ ambele emailuri de comanda cheama `randPersonalizare` in constructorul de randuri", () => {
  const email = sursa("src/lib/email.ts");

  for (const nume of ["sendNewOrderEmail", "sendOrderConfirmationToCustomer"]) {
    const corp = corpul(email, nume);
    assert.ok(
      corp.includes("${esc(i.name)}"),
      `${nume}: nu s-a gasit constructorul de randuri de produs`,
    );
    assert.ok(
      corp.includes("${randPersonalizare(i)}"),
      `${nume}: randul de produs nu mai spune ce a personalizat clientul`,
    );
  }
});

test("⚠ `emailPayload` din `placeOrder` duce mai departe instantaneul", () => {
  /*
   * Celalalt capat al lantului. Ajutorul poate fi chemat perfect si sa nu aiba ce citi:
   * `orders.items[].customization` se scrie corect de luni de zile, dar pana acum nu intra
   * niciodata in obiectul trimis emailurilor.
   */
  const actions = sursa("src/lib/actions/order.actions.ts");
  const start = actions.indexOf("const emailPayload = {");
  assert.notEqual(start, -1, "nu s-a gasit `emailPayload` in order.actions.ts");
  const stop = actions.indexOf("\n      };", start);
  assert.notEqual(stop, -1, "nu s-a gasit capatul lui `emailPayload`");
  const payload = actions.slice(start, stop);

  assert.ok(payload.includes("allItems.map"), "liniile nu mai vin din `allItems`");
  assert.ok(
    payload.includes('"customization" in i'),
    "instantaneul nu mai ajunge in payload-ul de email — emailurile n-au ce citi",
  );
});

test("⚠ butonul catre panou e DOAR in emailul comerciantului, si comentariul o spune", () => {
  /*
   * ⚠ CE APARA PROBA ASTA: un comentariu care justifica o taietura cu un lucru adevarat pe
   * jumatate. `randPersonalizare` taie adresa fisierului din AMANDOUA emailurile de comanda, iar
   * comentariul de la taietura spunea, fara sa spuna in care: „fisierele se deschid din panou —
   * butonul «Vezi comanda in dashboard» e chiar dedesubt, in acelasi email”. Adevarat pentru
   * comerciant. Cumparatorul insa n-are panou, si emailul lui n-are niciun buton catre comanda:
   * el ramane cu „2 fisiere incarcate” si cu nicio cale. Comentariul ascundea exact jumatatea
   * care doare, si nimic nu-l putea contrazice — un comentariu nu se compileaza.
   *
   * ⚠ Nu se apara aici o purtare, ci potrivirea dintre COD si motivul scris langa el. De aceea
   * proba citeste sursa: singurul fel in care o afirmatie din comentariu poate PICA.
   *
   * ⚠ MASURAT PE MUTANT, nu banuit: prima forma a probei cerea doar ca numele emailului
   * cumparatorului sa APARA undeva in bloc. Un mutant care inlocuia punctul lui de lista cu
   * „`sendOrderConfirmationToCustomer` (CUMPARATORUL) are aceeasi cale: butonul «Vezi comanda in
   * dashboard» e si in emailul lui” — o minciuna dovedita de sursa — trecea VERDE, fiindca si el
   * pomenea numele. Adica proba masura PREZENTA unui nume, nu potrivirea dintre afirmatie si cod.
   * De-aia se cere acum ca fiecare pomenire a butonului sa fie LIPITA de emailul comerciantului.
   */
  const email = sursa("src/lib/email.ts");

  assert.ok(
    corpul(email, "sendNewOrderEmail").includes(BUTON),
    "emailul comerciantului n-are butonul catre panou: comentariul de la fisiere il promite degeaba",
  );

  const client = corpul(email, "sendOrderConfirmationToCustomer");
  assert.ok(
    !client.includes("/dashboard/"),
    "emailul cumparatorului a capatat o cale catre comanda: rescrie hotararea din `randPersonalizare`, nu proba",
  );
  assert.ok(
    !client.includes(BUTON),
    "emailul cumparatorului a capatat butonul catre panou: rescrie hotararea din `randPersonalizare`, nu proba",
  );

  /* Bucata de la comentariul-doc al lui `randPersonalizare` pana la urmatorul export. */
  const inceput = email.indexOf("export function randPersonalizare(");
  assert.notEqual(inceput, -1, "nu s-a gasit `randPersonalizare` in src/lib/email.ts");
  const doc = email.lastIndexOf("/**", inceput);
  const sfarsit = email.indexOf("\nexport ", inceput + 1);
  const bucata = email.slice(doc === -1 ? inceput : doc, sfarsit === -1 ? email.length : sfarsit);

  assert.ok(
    bucata.includes("sendOrderConfirmationToCustomer"),
    "comentariul nu pomeneste emailul CUMPARATORULUI, desi ajutorul e chemat si din el: cine citeste crede ca taietura costa un singur drum",
  );

  /*
   * ⚠ REGULA CARE CHIAR TINE: butonul se poate promite DOAR langa emailul comerciantului.
   *
   * Pentru fiecare pomenire a butonului in bloc se cere ca ultimul nume de email dinaintea ei sa
   * fie `sendNewOrderEmail`, nu `sendOrderConfirmationToCustomer`. Asa, o fraza care ii da
   * butonul cumparatorului cade indiferent cum e formulata, fiindca ea trebuie oricum sa
   * numeasca butonul ca sa insemne ceva — iar butonul e ancorat in amandoua corpurile, mai sus.
   *
   * ⚠ Se lucreaza pe textul APLATIZAT: in sursa promisiunea e rupta intre doua randuri.
   *
   * ⚠ CE NU PRINDE, ca sa nu para mai mult decat e: o fraza care ii da butonul cumparatorului
   * FARA sa-l numeasca („are si el o cale”). Un comentariu nu se compileaza; ancora asta e cea
   * mai tare care se poate verifica in amandoua sursele.
   */
  const text = fraze(bucata);
  assert.ok(
    text.includes(BUTON),
    `comentariul nu mai citeaza butonul „${BUTON}”: taietura de la fisiere ramane fara justificarea care se poate verifica in sursa`,
  );
  for (let i = text.indexOf(BUTON); i !== -1; i = text.indexOf(BUTON, i + 1)) {
    const inainte = text.slice(0, i);
    assert.ok(
      inainte.lastIndexOf("sendNewOrderEmail") > inainte.lastIndexOf("sendOrderConfirmationToCustomer"),
      `comentariul promite butonul „${BUTON}” langa emailul CUMPARATORULUI, care nu-l are: ajutorul taie adresa din amandoua emailurile, dar numai comerciantul ramane cu un drum`,
    );
  }

  /*
   * Extra ingust, pastrat pentru formularea de azi: orice „acelasi email” trebuie sa spuna IN
   * CARE. Se cauta numele emailului comerciantului in cele 400 de caractere dinainte, adica in
   * aceeasi fraza sau in acelasi punct de lista. ⚠ E o capcana pe un SIR, nu o regula — o
   * reformulare („in emailul acesta”) trece pe langa ea; ce tine cu adevarat e regula de deasupra.
   */
  for (let i = text.indexOf("acelasi email"); i !== -1; i = text.indexOf("acelasi email", i + 1)) {
    assert.ok(
      text.slice(Math.max(0, i - 400), i).includes("sendNewOrderEmail"),
      "comentariul promite butonul de panou „in acelasi email” fara sa spuna in care: ajutorul e chemat si din emailul cumparatorului, care n-are niciun buton catre comanda",
    );
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. PURTAREA: ce iese e ESCAPAT
   ═══════════════════════════════════════════════════════════════════════════ */

/** Forma reala a instantaneului: `Record<id, { type, label, value }>`. Vezi `customization/comanda.ts`. */
const LINIE_OSTILA = {
  product_id: "p1",
  name: "Fototapet personalizat",
  quantity: 1,
  price: 1234,
  customization: {
    d: { type: "dimensiuni", label: "Dimensiuni", value: "350 x 250 cm" },
    t: {
      type: "textarea",
      label: "Text <script>alert('et')</script>",
      value: "Ana & \"Bob\" <script>alert(1)</script>",
    },
  },
};

test("⚠ eticheta si valoarea trec prin escapare: formularul e PUBLIC", () => {
  const out = randPersonalizare(LINIE_OSTILA);

  assert.ok(out.includes("350 x 250 cm"), "dimensiunile nu ajung in email");
  assert.ok(!out.includes("<script"), "HTML de la un strain ajunge intreg in casuta comerciantului");
  assert.ok(!out.includes("</script"), "HTML de la un strain ajunge intreg in casuta comerciantului");
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "valoarea nu e escapata");
  assert.ok(out.includes("Text &lt;script&gt;"), "eticheta nu e escapata");
  assert.ok(out.includes("Ana &amp; &quot;Bob&quot;"), "`&` si ghilimelele nu sunt escapate");
});

test("⚠ eticheta se escapeaza SI pe ramura de FISIERE, nu doar pe cea de text", () => {
  /*
   * ⚠ CE APARA PROBA ASTA: escaparea de pe ramura de fisiere, care pana acum nu era masurata de
   * nimic. Proba de deasupra hraneste numai valori de tip SIR, deci trece exclusiv prin ramura de
   * text; toate probele de fisiere foloseau eticheta nevinovata „Macheta”. MASURAT, nu banuit: un
   * mutant care scotea `esc()` de pe eticheta chiar in ramura de fisiere — adica `esc(eticheta)`
   * inlocuit cu `eticheta` in randul care numara fisierele — trecea VERDE peste toate cele 11
   * probe de dinainte.
   *
   * ⚠ CAT COSTA: randul asta pleaca in casuta comerciantului SI in a cumparatorului, iar `label`
   * sta in acelasi `orders.items` jsonb pe care fisierul de fata il numeste de trei ori editabil
   * din panou. Ca eticheta vine azi din definitia produsului nu ajunge: comentariul-doc al
   * ajutorului promite ca TOT ce iese trece prin `esc`, si o promisiune pe care n-o masoara nimic
   * se pierde la prima curatenie — exact cum s-a pierdut o data intreg ajutorul.
   */
  const out = randPersonalizare({
    customization: {
      f: {
        type: "image",
        label: "Macheta & \"A\" <img src=x onerror=alert('1')>",
        value: [CHEIE, "https://cdn.exemplu.ro/b.jpg"],
      },
    },
  });

  assert.ok(out.includes("2 fisiere incarcate"), `randul de fisiere nu mai iese deloc: ${out}`);
  assert.ok(!out.includes("<img"), `eticheta a intrat NEESCAPATA in email: ${out}`);
  assert.ok(
    out.includes("Macheta &amp; &quot;A&quot; &lt;img src=x onerror=alert(&#39;1&#39;)&gt;"),
    `eticheta nu trece prin \`esc\` pe ramura de fisiere: ${out}`,
  );
  /* Si aici ramane valabil ce apara toata ramura: din valoare nu iese nimic in afara de cifra. */
  assert.ok(!out.includes("cdn.exemplu.ro"), `adresa fisierului a ajuns in email: ${out}`);
  assert.ok(!out.includes(SEMNATURA), `cheia fisierului a ajuns in email: ${out}`);
});

test("⚠ fisierele se dau ca NUMAR: nici imagine, nici adresa, nici CHEIA semnata", () => {
  /*
   * ⚠ PROBA CERE ASTAZI CONTRARIUL a ceea ce cerea cand a fost scrisa, si asta e intentia.
   *
   * Pana la incarcarile private emailul purta legaturi numerotate catre depozitul public, si
   * proba de aici le INGHETA — adica apara forma mai putin privata. Ele au plecat: un email trece
   * prin serverele a doi furnizori si ramane in casute ani de zile, deci adresa pozei de familie a
   * unui cumparator, odata scrisa acolo, nu mai poate fi luata inapoi si nimic n-o expira.
   *
   * ⚠ Ce se apara acum e ca NU IESE NIMIC: nici `<img>`, nici `<a>`, nici adresa, nici cheia
   * semnata. Comerciantul afla CATE fisiere sunt si le deschide din panou, prin ruta cu sesiune —
   * butonul „Vezi comanda in dashboard” e chiar dedesubt, in emailul LUI (`sendNewOrderEmail`);
   * cumparatorul, care primeste acelasi rand din `sendOrderConfirmationToCustomer`, nu are panou
   * si nu primeste nimic in loc, dinadins — vezi hotararea scrisa in `email.ts`.
   *
   * ⚠ LISTA AMESTECA CELE DOUA FORME, si tocmai asta e miezul: o comanda veche poarta adrese
   * intregi, una de azi poarta chei semnate, si un rand editat din panou le poate purta pe
   * amandoua. Cine probeaza numai adrese `http` masoara doar taierea lui `http`.
   */
  const out = randPersonalizare({
    customization: {
      f: {
        type: "image",
        label: "Macheta",
        value: [
          CHEIE,
          "https://cdn.exemplu.ro/products/customizations/b1/a.jpg",
          "javascript:alert(1)",
          "https://cdn.exemplu.ro/products/customizations/b1/b\"onload=x.jpg",
        ],
      },
    },
  });

  assert.ok(!out.includes("<img"), "clientii de mail blocheaza imaginile: ar fi iesit un dreptunghi gol");
  assert.ok(out.includes("4 fisiere"), `comerciantul nu afla cate fisiere are de deschis: ${out}`);
  assert.ok(!out.includes("<a "), "emailul poarta iar o legatura catre fisierul clientului");
  assert.ok(!out.includes("href"), "emailul poarta iar adresa unui fisier");
  assert.ok(!out.includes("cdn.exemplu.ro"), "gazda depozitului a ajuns in email");
  assert.ok(!out.includes("products/customizations/"), "prefixul cheilor a ajuns in email");
  /* ⚠ Cheia INTREAGA deschide fisierul direct din galeata, fara sa treaca pe la noi. */
  assert.ok(!out.includes(CHEIE), `cheia semnata a ajuns intreaga in email: ${out}`);
  assert.ok(!out.includes(SEMNATURA), `semnatura cheii a ajuns in email: ${out}`);
  assert.ok(!out.includes(BIZ), `identificatorul magazinului a ajuns in email: ${out}`);
  assert.ok(!out.toLowerCase().includes("http"), `o adresa a ajuns in email: ${out}`);
  /*
   * ⚠ ULTIMELE DOUA NU MAI MASOARA ESCAPAREA, si mesajele lor o spun acum pe fata: ramura de
   * fisiere nu mai scoate NIMIC din valoare, doar cifra, deci nu e nimic de escapat aici. Raman
   * ca paza impotriva intoarcerii: daca cineva pune la loc tiparirea valorilor, ele cad primele.
   * Escaparea propriu-zisa se apara in `html-escape.test.ts` si, pentru eticheta ramurii de
   * fisiere, in proba de mai sus.
   */
  assert.ok(!/javascript:/i.test(out), `o valoare din tablou s-a intors in email: ${out}`);
  assert.ok(!out.includes('b"onload'), `o valoare din tablou s-a intors NEESCAPATA in email: ${out}`);
});

test("⚠ numarul anuntat e cat s-a incarcat cu adevarat, nu cat a trimis clientul", () => {
  /*
   * ⚠ Tabloul sta in `orders.items`, jsonb vechi si editabil din panou, deci poate avea si
   * intrari care nu sunt fisiere. Numarate si ele, emailul ar spune „4 fisiere incarcate” si
   * atelierul ar cauta in panou doua machete care nu exista nicaieri — ori ar opri o comanda gata
   * platita ca sa le ceara.
   *
   * ⚠ NUMARUL E SINGURUL LUCRU CARE MAI IESE. Cat timp emailul purta si legaturile, cine citea
   * gresit cifra se putea corecta deschizandu-le; acum nu mai are ce sa deschida de-acolo, deci
   * cifra trebuie sa fie exacta.
   */
  const out = randPersonalizare({
    customization: {
      f: {
        type: "image",
        label: "Macheta",
        /* ⚠ Amestecul e real: o comanda editata din panou poate purta si cheie, si adresa veche. */
        value: [CHEIE, null, "   ", "https://cdn.exemplu.ro/b.jpg"],
      },
    },
  });

  const anuntat = Number(/Macheta: (\d+) fisier/.exec(out)?.[1]);
  assert.equal(anuntat, 2, `s-au numarat si intrarile care nu sunt fisiere: ${out}`);
  assert.ok(!out.includes("cdn.exemplu.ro"), `adresa fisierului a ajuns in email: ${out}`);
  assert.ok(!out.includes(SEMNATURA), `cheia fisierului a ajuns in email: ${out}`);
});

test("un singur fisier se numara la singular", () => {
  const out = randPersonalizare({ customization: { f: { type: "image", label: "Macheta", value: [CHEIE] } } });
  assert.ok(out.includes("1 fisier "), out);
  assert.ok(!out.includes("1 fisiere"), out);
  assert.ok(!out.includes(SEMNATURA), out);
});

test("randurile scrise de client raman randuri, dar `<br>` vine de la NOI", () => {
  const out = randPersonalizare({ customization: { t: { type: "textarea", label: "Text", value: "sus\njos" } } });
  assert.ok(out.includes("sus<br>jos"), out);
  const literal = randPersonalizare({ customization: { t: { type: "textarea", label: "Text", value: "a<br>b" } } });
  assert.ok(literal.includes("a&lt;br&gt;b"), literal);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. APARAREA: jsonb vechi si editabil din panou nu ARUNCA niciodata
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ nimic nu arunca: un email care arunca nu se trimite deloc", () => {
  const gunoaie: unknown[] = [
    null,
    undefined,
    "linie",
    42,
    [],
    {},
    { customization: null },
    { customization: "text" },
    { customization: [] },
    { customization: { a: null } },
    { customization: { a: "sir" } },
    { customization: { a: [] } },
    { customization: { a: { label: 7, value: "x" } } },
    { customization: { a: { value: "fara eticheta" } } },
    { customization: { a: { label: "Fara valoare" } } },
    { customization: { a: { label: "Gol", value: "   " } } },
    { customization: { a: { label: "Tablou gol", value: [] } } },
    { customization: { a: { label: "Tablou de gunoi", value: [null, 3, "  "] } } },
    { customization: { a: { label: "Valoare obiect", value: { x: 1 } } } },
  ];
  for (const g of gunoaie) {
    assert.equal(randPersonalizare(g), "", `a iesit ceva pentru ${JSON.stringify(g)}`);
  }
});

test("intrarile stricate se SAR, cele bune raman", () => {
  const out = randPersonalizare({
    customization: {
      rea: { label: "", value: "nu se vede" },
      buna: { type: "text", label: "Nume", value: "Ana" },
      alta: { label: "Fara valoare" },
    },
  });
  assert.ok(out.includes("Nume: Ana"), out);
  assert.ok(!out.includes("nu se vede"), out);
  assert.ok(!out.includes("Fara valoare"), out);
});

test("o linie fara personalizare nu adauga nimic sub numele produsului", () => {
  assert.equal(randPersonalizare({ product_id: "extra_1", name: "Comanda cu Prioritate", quantity: 1, price: 5 }), "");
});
