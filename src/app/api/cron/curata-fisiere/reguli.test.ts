import test from "node:test";
import assert from "node:assert/strict";
import { cheileComenzii, deSters, pragulComenzilor, ZILE_ORFAN, LUNI_PE_COMANDA } from "./reguli";

/**
 * Regula dupa care se sterg fisierele incarcate de cumparatori.
 *
 * ═══ ⚠ DE CE PROBELE ASTEA SUNT ALTFEL DECAT CELELALTE ═══
 *
 * Aici greseala nu produce un ecran urat sau o suma gresita: sterge definitiv poza unui om si
 * hartia dupa care atelierul produce marfa. Deci fiecare afirmatie de mai jos are PERECHE — ce
 * trebuie sters SI ce trebuie sa ramana. O proba care doar cere „s-a sters X" trece verde si
 * peste o regula care sterge tot, adica peste chiar caderea de care ne temem.
 *
 * ⚠ SI CLIPA SE DA, nu se ia din ceas: `deSters` primeste `acum`. Altfel probele care ating
 * marginile ar fi trecut sau cazut dupa ora la care se ruleaza.
 */

const ZI = 24 * 60 * 60 * 1000;
const ACUM = new Date("2026-09-07T12:00:00.000Z");
const BIZ = "11111111-1111-4111-8111-111111111111";
const PREFIX = "products/customizations/";

const cheie = (n: string) => `${PREFIX}${BIZ}/${n}`;
const cuZile = (zile: number) => new Date(ACUM.getTime() - zile * ZI);
const obiect = (n: string, zile: number) => ({ cheie: cheie(n), incarcatLa: cuZile(zile) });
const cheileDin = (v: { cheie: string }[]) => v.map((x) => x.cheie).sort();

/* ═══════════════════════════════════════════════════════════════════════════
   ORFANII — fisiere pe care nu le apara nicio comanda
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ un fisier proaspat NU se sterge, oricat de orfan ar fi", () => {
  /*
   * ⚠ ASTA E CEA MAI IMPORTANTA DIN FISIER, si merita citita de doua ori.
   *
   * Intre incarcarea fisierului si apasarea butonului „Trimite comanda" poate trece oricat: omul
   * lasa fila deschisa, se razgandeste, revine a doua zi. In tot acel timp fisierul E orfan — nu
   * exista nicio comanda care sa-l apere. Fara marginea de 30 de zile, cronul ar sterge fisierul
   * din chiar formularul pe care cineva il completeaza, iar comanda ar pleca cu o cheie catre
   * nimic. Campul e de obicei OBLIGATORIU.
   */
  const v = deSters([obiect("azi.jpg", 0), obiect("ieri.jpg", 1), obiect("acum-29-zile.jpg", 29)], new Set(), ACUM);
  assert.deepEqual(v, [], "un fisier de sub 30 de zile a fost sters desi nimeni nu-l apara");
});

test("⚠ un orfan trecut de 30 de zile se sterge", () => {
  /* Perechea celei de sus: fara randul asta, regula ar putea sa nu stearga niciodata nimic. */
  const v = deSters([obiect("vechi.jpg", ZILE_ORFAN + 1)], new Set(), ACUM);
  assert.deepEqual(cheileDin(v), [cheie("vechi.jpg")]);
  assert.equal(v[0].motiv, "orfan");
});

test("⚠ marginea celor 30 de zile e chiar unde scrie", () => {
  /*
   * ⚠ MARGINEA SE PROBEAZA DE AMANDOUA PARTILE, la o zi distanta. O regula scrisa cu `<=` in loc
   * de `<`, sau socotita in ore, ar trece de o proba care se uita numai la „vechi" si „nou".
   */
  const subMargine = deSters([obiect("x.jpg", ZILE_ORFAN - 0.5)], new Set(), ACUM);
  const pesteMargine = deSters([obiect("x.jpg", ZILE_ORFAN + 0.5)], new Set(), ACUM);
  assert.deepEqual(subMargine, [], `un fisier de ${ZILE_ORFAN - 0.5} zile s-a sters`);
  assert.equal(pesteMargine.length, 1, `un fisier de ${ZILE_ORFAN + 0.5} zile a ramas`);
});

/* ═══════════════════════════════════════════════════════════════════════════
   FISIERELE DE PE COMENZI
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ un fisier de pe o comanda din fereastra NU se sterge, oricat de vechi ar fi obiectul", () => {
  /*
   * ⚠ VECHIMEA OBIECTULUI NU HOTARASTE CAND E APARAT. Un fisier urcat acum cinci luni, pe o
   * comanda de acum cinci luni, e cu mult peste cele 30 de zile — si totusi trebuie sa ramana,
   * fiindca hotararea proprietarului e SASE luni de la ULTIMA ATINGERE a comenzii. O regula care
   * s-ar fi uitat numai la vechimea obiectului ar fi sters hartia dupa care atelierul tocmai a
   * produs marfa.
   */
  const o = obiect("pe-comanda.jpg", 150);
  const v = deSters([o], new Set([o.cheie]), ACUM);
  assert.deepEqual(v, [], "fisierul unei comenzi din ultimele sase luni s-a sters");
});

test("⚠ dupa ce comanda iese din fereastra, fisierul ei se sterge", () => {
  /*
   * Comanda mai veche de sase luni nu mai apara nimic — deci cheia ei nu mai e in multimea celor
   * aparate, si obiectul (urcat cel putin atunci) e demult peste cele 30 de zile.
   *
   * ⚠ MOTIVUL SE CITESTE DIN LOG: „comanda-veche", nu „orfan". Cele doua se intampla din motive
   * diferite, si cine se uita peste raport trebuie sa poata deosebi o curatenie normala de o
   * multime de fisiere care n-au ajuns niciodata pe vreo comanda.
   */
  const v = deSters([obiect("comanda-veche.jpg", 200)], new Set(), ACUM);
  assert.equal(v.length, 1);
  assert.equal(v[0].motiv, "comanda-veche");
});

test("⚠ multimea de chei aparate GOALA nu inseamna „sterge tot ce e nou”", () => {
  /*
   * ⚠ CAZUL CARE SPERIE: baza raspunde, dar nicio comanda din ultimele sase luni nu poarta
   * fisiere — starea reala masurata pe 07.09.2026, cand din 384 de comenzi ZERO purtau vreo
   * personalizare. Atunci TOATE fisierele sunt neaparate, si singurul lucru care mai sta intre
   * ele si stergere e vechimea. Randul asta cere ca vechimea sa fie de ajuns.
   *
   * (Cazul in care baza NU raspunde nu ajunge aici deloc: ruta cade inchis inainte de a chema
   * regula. Vezi `route.ts`, pasul 1.)
   */
  const v = deSters([obiect("nou.jpg", 3), obiect("vechi.jpg", 90)], new Set(), ACUM);
  assert.deepEqual(cheileDin(v), [cheie("vechi.jpg")], "fisierul proaspat n-a fost aparat de varsta lui");
});

test("⚠ o data necitibila APARA fisierul, nu il condamna", () => {
  /*
   * `LastModified` lipsa sau stricat inseamna ca nu stim nimic despre obiectul asta. Necunoscutul
   * nu se sterge: e singura purtare din care nu se poate pierde nimic definitiv.
   */
  const stricate = [
    { cheie: cheie("fara-data.jpg"), incarcatLa: new Date("nu e o data") },
    { cheie: cheie("nedefinit.jpg"), incarcatLa: undefined as unknown as Date },
    { cheie: "", incarcatLa: cuZile(999) },
  ];
  assert.deepEqual(deSters(stricate, new Set(), ACUM), []);
});

test("⚠ pragul comenzilor e in LUNI calendaristice, nu in 183 de zile", () => {
  /*
   * „Sase luni" e ce a spus proprietarul, si `setMonth` da chiar asta. Scrisa in zile, regula din
   * cod si regula din vorbe s-ar fi departat cu cateva zile — iar diferenta se vede tocmai la
   * fisierele de la margine, cele mai vechi si mai usor de pierdut fara sa observe cineva.
   */
  assert.equal(pragulComenzilor(new Date("2026-09-07T00:00:00Z")).toISOString().slice(0, 10), "2026-03-07");
  assert.equal(LUNI_PE_COMANDA, 6);
  /* Si o luna scurta: 31 martie minus sase luni nu are un „31 septembrie". */
  assert.equal(pragulComenzilor(new Date("2026-03-31T00:00:00Z")).toISOString().slice(0, 8), "2025-10-");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CE CHEI POARTA O COMANDA — partea de care depinde tot ce e mai sus
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ cheile se citesc din AMANDOUA formele de valoare", () => {
  const items = [
    { customization: { g: { type: "text", label: "Gravura", value: "Robert" } } },
    { customization: { f: { type: "fisier", label: "Tipar", value: [cheie("a.pdf"), cheie("b.jpg")] } } },
    { customization: { p: { type: "image", label: "Poza", value: cheie("c.png") } } },
  ];
  assert.deepEqual(
    cheileComenzii(items, PREFIX).sort(),
    [cheie("a.pdf"), cheie("b.jpg"), cheie("c.png")],
    "o forma de valoare nu s-a citit: fisierele ei ar fi ramas neaparate si s-ar fi sters",
  );
});

test("⚠ NU se citeste `type`, ci FORMA valorii", () => {
  /*
   * ⚠ DE CE CONTEAZA: `type` din instantaneu vine din definitia produsului, iar definitia se poate
   * schimba dupa comanda. Un camp `fisier` pe care comerciantul il face `text` maine si-ar face
   * fisierele invizibile aici, si cronul le-ar sterge desi stau pe o comanda de saptamana trecuta.
   * Prefixul, in schimb, nu se schimba niciodata sub noi.
   */
  const items = [{ customization: { x: { type: "text", label: "Ceva", value: cheie("desi-zice-text.jpg") } } }];
  assert.deepEqual(cheileComenzii(items, PREFIX), [cheie("desi-zice-text.jpg")]);
});

test("⚠ un text obisnuit NU e luat drept cheie", () => {
  /*
   * Perechea celei de sus. Fara ea, „citeste forma" ar putea insemna „ia orice sir", iar multimea
   * aparata s-ar umple cu gunoi — nevatamator azi, dar ar face ca o cheie adevarata pierduta sa nu
   * se mai observe niciodata.
   */
  const items = [
    { customization: { g: { type: "text", label: "Gravura", value: "Maria" } } },
    { customization: { u: { type: "text", label: "Link", value: "https://exemplu.ro/products/customizations/x.jpg" } } },
    { customization: { d: { type: "dimensiuni", label: "Dim", value: "350 x 250 cm" } } },
  ];
  assert.deepEqual(cheileComenzii(items, PREFIX), []);
});

test("⚠ SI FORMA COSULUI ABANDONAT, nu doar cea a comenzii", () => {
  /*
   * ═══ ⚠ DOUA SUBSISTEME SCHIMBATE SEPARAT ═══
   *
   * Cautarea mergea exact doi pasi — `customization[camp].value` —, adica forma INSTANTANEULUI de
   * pe comanda. Aceleasi chei stau insa si in `abandoned_carts.items[].customization`, unde
   * valorile sunt BRUTE: `customization[camp]` direct, fara `.value`.
   *
   * Masurat pe 07.09.2026: 23 de cosuri DESCHISE mai vechi de 30 de zile. Fisierele lor nu erau pe
   * nicio comanda, deci cronul le vedea drept orfani si le stergea — iar linkul de recuperare,
   * care merge mai departe, refacea linia cu cheia unui fisier ai carui octeti nu mai existau.
   *
   * ⚠ Cat timp cosul abandonat NU purta personalizarea, aici nu era nimic de aparat. Gaura s-a
   * deschis chiar in saptamana in care el a inceput s-o poarte.
   */
  const cos = [
    { product_id: "p1", customization: { p: cheie("cos-poza.png") } },
    { product_id: "p2", customization: { f: [cheie("cos-a.pdf"), cheie("cos-b.jpg")] } },
    { product_id: "p3", customization: { g: "Robert", d: { latime: 350, inaltime: 250 } } },
  ];
  assert.deepEqual(
    cheileComenzii(cos, PREFIX).sort(),
    [cheie("cos-a.pdf"), cheie("cos-b.jpg"), cheie("cos-poza.png")],
    "cheile din forma BRUTA a cosului nu se vad: fisierele lor s-ar sterge sub un cos recuperabil",
  );

  /* ⚠ Si amandoua formele in acelasi lot — cronul le aduna in aceeasi multime. */
  const amestec = [
    { customization: { p: { type: "image", label: "Poza", value: cheie("comanda.png") } } },
    { customization: { p: cheie("cos.png") } },
  ];
  assert.deepEqual(cheileComenzii(amestec, PREFIX).sort(), [cheie("comanda.png"), cheie("cos.png")]);
});

test("⚠ o imbricare adanca nu tine cronul pe loc", () => {
  /*
   * `items` e jsonb scris de client prin cos. Fara plafon de adancime, un obiect imbricat de zece
   * mii de niveluri ar fi oprit chiar cronul care apara fisierele — adica ar fi transformat o
   * paguba de stocare intr-una de disponibilitate.
   *
   * ⚠ Se cere si ca plafonul sa fie mai adanc decat formele reale: cheia de la nivelul 3 (forma
   * comenzii cu valoare in lista) trebuie sa se vada in continuare.
   */
  let adanc: unknown = cheie("prea-adanc.jpg");
  for (let i = 0; i < 5000; i++) adanc = { x: adanc };
  assert.doesNotThrow(() => cheileComenzii([{ customization: { c: adanc } }], PREFIX));
  assert.deepEqual(cheileComenzii([{ customization: { c: adanc } }], PREFIX), []);

  assert.deepEqual(
    cheileComenzii([{ customization: { f: { value: [cheie("la-adancime-normala.pdf")] } } }], PREFIX),
    [cheie("la-adancime-normala.pdf")],
    "forma obisnuita a comenzii a cazut sub plafonul de adancime",
  );
});

test("⚠ forme stramte de `items` nu arunca si nu inventeaza chei", () => {
  /*
   * Cronul citeste `items` din randuri scrise de-a lungul anilor. O exceptie aici ar opri INTREAGA
   * rulare — si, mai rau, ar putea opri-o dupa ce s-a citit doar o parte din comenzi, adica exact
   * starea in care restul fisierelor par orfane.
   */
  for (const brut of [null, undefined, 42, "sir", {}, [], [null], [{}], [{ customization: null }],
    [{ customization: "nu e obiect" }], [{ customization: [] }], [{ customization: { x: null } }],
    [{ customization: { x: { value: null } } }], [{ customization: { x: { value: [null, 7] } } }]]) {
    assert.deepEqual(cheileComenzii(brut, PREFIX), [], `a intors chei pentru ${JSON.stringify(brut)}`);
  }
});
