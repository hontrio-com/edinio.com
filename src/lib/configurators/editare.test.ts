import test from "node:test";
import assert from "node:assert/strict";
import {
  idNou, adaugaPas, adaugaGrup, adaugaNod, schimbaNod, schimbaPas, schimbaGrup,
  stergeNod, stergeGrup, stergePas, mutaPas, mutaGrup, mutaNod,
  adaugaOptiune, stergeOptiune, mutaOptiune, faraReferintaLa,
  faraModificatoriMorti, puneBazaPret, puneTaxaInitiala, punePragPret, puneRotunjire,
  problemeleDePret, adaugaRegula, schimbaRegula, stergeRegula,
  regulaDinPresetare, presetareaDin, presetareNoua, asezata, tinteleDe,
  cuDeclansatorulPe, cuTintaPe, declansatoriiPosibili, descrieRegula, MESAJ_OPRIRE, optiuniRamase,
  schimbaOptiune, puneImplicitAlegere, comutaImplicitAlegeri, problemeleNodului, numarScris,
  type Presetare,
} from "./editare";
import { MAX_PASI } from "./definitie";
import { citesteContinut, citestePretuire, citesteReguli, type Continut } from "./citeste";
import type { Definitie, Nod } from "./definitie";
import { aplicaRegulile, esteAscuns, esteCerut, optiuniDeAles, MAX_REGULI, type Regula } from "./reguli";
import { calculeazaPretul, type Pretuire } from "./pret";
import { valideaza } from "./validare";

const GOL: Continut = {
  definitie: { versiuneSchema: 1, mod: "auto", pasi: [] },
  reguli: [],
  pretuire: { baza: "produs" },
};

const text = (id: string): Nod => ({ fel: "text", control: "scurt", id, eticheta: id });

/** Un continut cu un pas, un grup si doua noduri, plus id-urile lor. */
function schela() {
  let c = adaugaPas(GOL, "Pas");
  const idPas = c.definitie.pasi[0].id;
  const idGrup = c.definitie.pasi[0].grupuri[0].id;
  c = adaugaNod(c, idGrup, text("a"));
  c = adaugaNod(c, idGrup, text("b"));
  return { c, idPas, idGrup };
}

/* ── Id-uri ──────────────────────────────────────────────────────────────── */

test("id-urile sunt unice, nu un contor previzibil", () => {
  /*
   * Builderul din pagini foloseste `Date.now()` cu un contor si a mai avut ciocniri: doua file
   * deschise, sau doua creari rapide, dau acelasi numar. Aici id-ul e AUTORITATEA — formulele si
   * regulile trimit la el.
   */
  const vazute = new Set<string>();
  for (let i = 0; i < 2000; i++) vazute.add(idNou());
  assert.equal(vazute.size, 2000);
});

/* ── Adaugare ────────────────────────────────────────────────────────────── */

test("un pas nou vine cu un grup gata facut", () => {
  const c = adaugaPas(GOL, "Dimensiune");
  assert.equal(c.definitie.pasi.length, 1);
  assert.equal(c.definitie.pasi[0].eticheta, "Dimensiune");
  assert.equal(c.definitie.pasi[0].grupuri.length, 1, "altfel n-ar avea unde intra prima optiune");
});

test("plafonul de pasi se respecta", () => {
  let c = GOL;
  for (let i = 0; i < MAX_PASI + 5; i++) c = adaugaPas(c);
  assert.equal(c.definitie.pasi.length, MAX_PASI);
});

test("adaugarea unei optiuni o pune in grupul cerut", () => {
  const { c, idGrup } = schela();
  assert.deepEqual(
    c.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["a", "b"],
  );
  const alt = adaugaNod(c, "grup-inexistent", text("c"));
  assert.deepEqual(alt.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["a", "b"]);
  void idGrup;
});

/* ── Nimic nu se modifica pe loc ─────────────────────────────────────────── */

test("NIMIC nu se schimba pe loc: React compara referinte", () => {
  /*
   * O structura schimbata pe loc n-ar declansa randarea, iar comerciantul ar apasa un buton care
   * „nu face nimic" — pana la urmatoarea schimbare, cand i-ar aparea toate deodata.
   */
  const { c, idGrup } = schela();
  const inainte = JSON.stringify(c);
  const dupa = adaugaNod(c, idGrup, text("nou"));
  assert.equal(JSON.stringify(c), inainte, "intrarea ramane neatinsa");
  assert.notEqual(dupa, c);
  assert.notEqual(dupa.definitie, c.definitie);
  assert.notEqual(dupa.definitie.pasi[0].grupuri[0].noduri, c.definitie.pasi[0].grupuri[0].noduri);
});

/* ── Schimbare ───────────────────────────────────────────────────────────── */

test("schimbarea unui nod ii pastreaza locul si id-ul", () => {
  const { c } = schela();
  const dupa = schimbaNod(c, { ...text("a"), eticheta: "Latime" });
  const noduri = dupa.definitie.pasi[0].grupuri[0].noduri;
  assert.equal(noduri[0].eticheta, "Latime");
  assert.deepEqual(noduri.map((n) => n.id), ["a", "b"], "ordinea nu se schimba");
});

test("id-ul nu se poate schimba prin campuri", () => {
  // Regulile si formulele trimit la el; schimbat, ar fi rupt tot ce arata spre el.
  const { c, idPas } = schela();
  const dupa = schimbaPas(c, idPas, { id: "altul", eticheta: "Alt nume" } as never);
  assert.equal(dupa.definitie.pasi[0].id, idPas);
  assert.equal(dupa.definitie.pasi[0].eticheta, "Alt nume");
});

test("grupul poate primi rolul de dimensiuni", () => {
  const { c, idGrup } = schela();
  const dupa = schimbaGrup(c, idGrup, { rol: "dimensiuni", proportieLegata: true });
  assert.equal(dupa.definitie.pasi[0].grupuri[0].rol, "dimensiuni");
});

/* ── Stergere, si curatarea de dupa ──────────────────────────────────────── */

const R_PE_A: Regula[] = [
  { id: "r1", cand: { c: "completat", nod: "a" }, atunci: [{ a: "ascunde", tinta: "b" }] },
  { id: "r2", cand: { c: "completat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "a" }] },
  { id: "r3", cand: { c: "completat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "b" }] },
];

test("STERGEREA UNUI NOD CURATA SI REGULILE care trimiteau la el", () => {
  /*
   * O regula al carei declansator a disparut nu se mai aprinde niciodata; una a carei tinta a
   * disparut nu mai schimba nimic. Amandoua ar fi ramas in panou ca reguli care „exista si nu
   * fac nimic", si ar fi picat validarea cu un mesaj despre ceva ce comerciantul nu mai vede.
   */
  const { c } = schela();
  const dupa = stergeNod({ ...c, reguli: R_PE_A }, "a");
  assert.deepEqual(dupa.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["b"]);
  // r1 citeste `a` -> se scoate. r2 tinteste `a` -> ramane fara actiuni -> se scoate. r3 e curata.
  assert.deepEqual(dupa.reguli.map((r) => r.id), ["r3"]);
});

test("stergerea unui GRUP curata dupa toate nodurile din el", () => {
  const { c, idGrup } = schela();
  const dupa = stergeGrup({ ...c, reguli: R_PE_A }, idGrup);
  assert.equal(dupa.definitie.pasi[0].grupuri.length, 0);
  assert.deepEqual(dupa.reguli, [], "toate regulile trimiteau la nodurile din grup");
});

test("stergerea unui PAS ia cu ea grupurile si nodurile lui", () => {
  const { c, idPas } = schela();
  const dupa = stergePas({ ...c, reguli: R_PE_A }, idPas);
  assert.equal(dupa.definitie.pasi.length, 0);
  assert.deepEqual(dupa.reguli, []);
});

test("o regula care tinteste un GRUP sters se scoate si ea", () => {
  const { c, idGrup } = schela();
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "a" }, atunci: [{ a: "ascunde", tinta: idGrup }] },
  ];
  const dupa = stergeGrup({ ...c, reguli }, idGrup);
  assert.deepEqual(dupa.reguli, []);
});

test("regulile care nu ating nimic sters raman neatinse", () => {
  const { c } = schela();
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "b" }, atunci: [{ a: "ascunde", tinta: "b" }] },
  ];
  const dupa = stergeNod({ ...c, reguli }, "a");
  assert.deepEqual(dupa.reguli, reguli);
});

test("faraReferintaLa pastreaza actiunile bune ale unei reguli", () => {
  const reguli: Regula[] = [
    { id: "r", cand: { c: "completat", nod: "x" }, atunci: [{ a: "ascunde", tinta: "sters" }, { a: "ascunde", tinta: "ramas" }] },
  ];
  const dupa = faraReferintaLa(reguli, new Set(["sters"]));
  assert.equal(dupa.length, 1);
  assert.deepEqual(dupa[0].atunci, [{ a: "ascunde", tinta: "ramas" }]);
});

/* ── Mutare ──────────────────────────────────────────────────────────────── */

test("mutarea sus si jos, cu butoane — nu doar cu mausul", () => {
  /*
   * Tragerea e greu de folosit pe telefon si imposibila cu tastatura. Butoanele nu sunt o
   * rezerva de politete: pentru o parte dintre oameni sunt singurul drum.
   */
  const { c } = schela();
  const jos = mutaNod(c, "a", 1);
  assert.deepEqual(jos.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["b", "a"]);
  const inapoi = mutaNod(jos, "a", -1);
  assert.deepEqual(inapoi.definitie.pasi[0].grupuri[0].noduri.map((n) => n.id), ["a", "b"]);
});

test("la CAPAT nu se intampla nimic: lista nu se roteste", () => {
  const { c } = schela();
  assert.equal(mutaNod(c, "a", -1), c, "primul, mutat in sus, ramane pe loc");
  assert.equal(mutaNod(c, "b", 1), c, "ultimul, mutat in jos, ramane pe loc");
  assert.equal(mutaNod(c, "inexistent", 1), c);
});

test("pasii si grupurile se muta la fel", () => {
  let c = adaugaPas(GOL, "Unu");
  c = adaugaPas(c, "Doi");
  const [p1, p2] = c.definitie.pasi.map((p) => p.id);
  assert.deepEqual(mutaPas(c, p1, 1).definitie.pasi.map((p) => p.id), [p2, p1]);

  const cuGrupuri = adaugaGrup(c, p1, "Al doilea grup");
  const [g1, g2] = cuGrupuri.definitie.pasi[0].grupuri.map((g) => g.id);
  assert.deepEqual(mutaGrup(cuGrupuri, g1, 1).definitie.pasi[0].grupuri.map((g) => g.id), [g2, g1]);
});

test("grupul se muta INAUNTRUL pasului lui, nu intre pasi", () => {
  let c = adaugaPas(GOL, "Unu");
  c = adaugaPas(c, "Doi");
  const gDinPrimul = c.definitie.pasi[0].grupuri[0].id;
  // Singur in pasul lui: mutat in jos, nu pleaca in al doilea pas.
  const dupa = mutaGrup(c, gDinPrimul, 1);
  assert.equal(dupa.definitie.pasi[0].grupuri.length, 1);
  assert.equal(dupa.definitie.pasi[1].grupuri.length, 1);
});

/* ── Optiuni ─────────────────────────────────────────────────────────────── */

const alegere: Nod = {
  fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
  optiuni: [{ id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }],
  implicit: "a",
};

test("optiunile se adauga, se muta si se sterg", () => {
  const cuTrei = adaugaOptiune(alegere, "C");
  assert.equal(cuTrei.fel === "alegere" && cuTrei.optiuni.length, 3);
  const mutata = mutaOptiune(alegere, "a", 1);
  assert.deepEqual(mutata.fel === "alegere" ? mutata.optiuni.map((o) => o.id) : [], ["b", "a"]);
});

test("stergerea optiunii care era IMPLICIT scoate si implicitul", () => {
  /*
   * Lasat, ar fi aratat spre ceva inexistent, iar validatorul l-ar fi refuzat la publicare cu un
   * mesaj despre o optiune pe care comerciantul tocmai a sters-o.
   */
  const dupa = stergeOptiune(alegere, "a");
  assert.ok(dupa.fel === "alegere");
  assert.deepEqual(dupa.optiuni.map((o) => o.id), ["b"]);
  assert.equal(dupa.implicit, undefined);
});

test("stergerea altei optiuni lasa implicitul in pace", () => {
  const dupa = stergeOptiune(alegere, "b");
  assert.ok(dupa.fel === "alegere");
  assert.equal(dupa.implicit, "a");
});

test("un nod care nu are optiuni ramane neatins", () => {
  const t = text("x");
  assert.equal(adaugaOptiune(t), t);
  assert.equal(stergeOptiune(t, "a"), t);
  assert.equal(mutaOptiune(t, "a", 1), t);
});
/* ═══════════════════════════════════════════════════════════════════════════
   O DEFINITIE ADEVARATA, PENTRU PRET SI REGULI
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un pas, doua grupuri: un material, un comutator, o latime, un text si niste extraoptiuni. */
function definitieDeProba(): Definitie {
  return {
    versiuneSchema: 1, mod: "auto",
    pasi: [{
      id: "pas1", eticheta: "Pasul intai",
      grupuri: [
        {
          id: "gr1", eticheta: "Alegeri", noduri: [
            {
              fel: "alegere", control: "lista", id: "material", eticheta: "Material",
              optiuni: [{ id: "lemn", eticheta: "Lemn" }, { id: "sticla", eticheta: "Sticla" }],
            },
            { fel: "comutator", control: "comutator", id: "gravare", eticheta: "Gravare" },
          ],
        },
        {
          id: "gr2", eticheta: "Masuri", noduri: [
            { fel: "numar", control: "camp", id: "latime", eticheta: "Latime" },
            { fel: "text", control: "scurt", id: "mesajul", eticheta: "Mesajul gravat" },
            {
              fel: "alegeri", control: "bifare", id: "extra", eticheta: "Extraoptiuni",
              optiuni: [{ id: "e1", eticheta: "Ambalaj" }, { id: "e2", eticheta: "Felicitare" }],
            },
          ],
        },
      ],
    }],
  };
}

function continutDeProba(): Continut {
  return { definitie: definitieDeProba(), reguli: [], pretuire: { baza: "produs" } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL: NUMERELE
   ═══════════════════════════════════════════════════════════════════════════ */

test("un prag golit se STERGE, nu se face zero", () => {
  /*
   * „Minim 0 lei" si „fara minim" sunt doua reguli diferite, si a doua e chiar cea pe care
   * comerciantul tocmai a sters-o din camp.
   */
  let c: Continut = { ...continutDeProba(), pretuire: { baza: "produs", minim: 25, maxim: 300 } };
  c = punePragPret(c, "minim", undefined);
  assert.equal("minim" in c.pretuire, false, "cheia nu ramane cu 0 sau cu undefined");
  assert.equal(c.pretuire.maxim, 300, "celalalt prag ramane neatins");

  c = punePragPret(c, "minim", 0);
  assert.equal(c.pretuire.minim, 0, "iar zero scris intentionat CHIAR se pastreaza");
});

test("rotunjirea cu pas zero nu se pastreaza, fiindca reincarcarea o arunca oricum", () => {
  /*
   * `citeste.ts` refuza `{ fel, pas: 0 }` la citirea ciornei din baza. Pastrata aici, ar fi
   * aratat pe ecran o rotunjire pe care prima reincarcare a paginii o facea sa dispara.
   */
  const dovada = citestePretuire({ baza: "produs", rotunjire: { fel: "insus", pas: 0 } });
  assert.equal(dovada.rotunjire, undefined, "asa se poarta citirea din baza");

  let c: Continut = { ...continutDeProba(), pretuire: { baza: "produs", rotunjire: { fel: "insus", pas: 5 } } };
  c = puneRotunjire(c, { fel: "insus", pas: 0 });
  assert.equal(c.pretuire.rotunjire, undefined);
  c = puneRotunjire(c, { fel: "insus", pas: -1 });
  assert.equal(c.pretuire.rotunjire, undefined);
  c = puneRotunjire(c, { fel: "aproape", pas: 0.5 });
  assert.deepEqual(c.pretuire.rotunjire, { fel: "aproape", pas: 0.5 });
  c = puneRotunjire(c, undefined);
  assert.equal(c.pretuire.rotunjire, undefined);
});

test("schimbarea bazei nu sterge taxa de pornire", () => {
  let c: Continut = { ...continutDeProba(), pretuire: { baza: "taxa", taxaInitiala: 49 } };
  c = puneBazaPret(c, "produs");
  assert.equal(c.pretuire.taxaInitiala, 49, "altfel numarul scris de om dispare la o apasare gresita");
  c = puneBazaPret(c, "taxa");
  assert.equal(c.pretuire.taxaInitiala, 49);
  c = puneTaxaInitiala(c, undefined);
  assert.equal("taxaInitiala" in c.pretuire, false);
});

test("⚠ un pret maxim de 0 lei NU se mai poate publica", () => {
  /*
   * ⚠ PROBA ASTA A FOST INTOARSA PE FATA CEALALTA, si merita spus de ce.
   *
   * Pana la auditul probelor ea afirma exact pe dos: ca pretul iese 0 SI ca `sePoatePublica` e
   * `true`, cu mesajul „si publicarea o primeste fara o vorba”. Adica documenta un defect si il
   * si INGHETA — o proba care, in ziua in care cineva ar fi reparat defectul, ar fi devenit rosie
   * si l-ar fi impins sa repare proba.
   *
   * Ce ramane adevarat, si de aceea se masoara mai jos cu chiar motorul: pretul iese 0, nu
   * negativ, deci `pret_negativ` NU-l prinde. Motorul e in regula asa — toata apararea impotriva
   * marfii date pe gratis sta la PUBLICARE, unde comerciantul o poate inca repara.
   *
   * ⚠ Iar zeroul in campul „Pret maxim” nu e o greseala ciudata: e felul obisnuit in care omul
   * scrie „fara limita”. Gol inseamna fara limita; zero inseamna gratis.
   */
  const d = definitieDeProba();
  const pretuire: Pretuire = { baza: "produs", maxim: 0 };
  const stare = aplicaRegulile(d, [], {});
  const r = calculeazaPretul({ definitie: d, pretuire, stare, pretProdus: 100 });
  assert.equal(r.ok, true, "motorul nu se plange: zero nu e negativ");
  assert.equal(r.ok && r.d.unitar, 0, "o suta de lei chiar devin zero");

  const v = valideaza({ definitie: d, reguli: [], pretuire, pretProdus: 100 });
  assert.equal(v.sePoatePublica, false, "marfa pe gratis nu are voie sa plece in vanzare");
  assert.ok(v.constatari.some((x) => x.cod === "plafon_pret_zero"), JSON.stringify(v.constatari));

  // Si avertismentul din panou ramane, ca omul sa afle inainte sa apese „Publica”.
  assert.ok(problemeleDePret(pretuire).some((x) => x.includes("0 lei")));
});

test("⚠ un factor de inmultire 0 nu se mai poate publica", () => {
  /*
   * ⚠ Acelasi efect, alta usa: `fel: "inmultire"` cu `valoare: 0` inmulteste tot subtotalul cu
   * zero. Se scrie la fel de usor din reflex, si nu se vede nicaieri altundeva decat in pretul
   * final — adica dupa ce prima comanda a intrat pe gratis.
   */
  const d = definitieDeProba();
  const pretuire: Pretuire = {
    baza: "produs",
    modificatori: [{ id: "m1", eticheta: "Reducere", fel: "inmultire", valoare: 0 }],
  };
  const stare = aplicaRegulile(d, [], {});
  const r = calculeazaPretul({ definitie: d, pretuire, stare, pretProdus: 100 });
  assert.equal(r.ok && r.d.unitar, 0, "motorul chiar da zero");

  const v = valideaza({ definitie: d, reguli: [], pretuire, pretProdus: 100 });
  assert.equal(v.sePoatePublica, false);
  assert.ok(v.constatari.some((x) => x.cod === "inmultire_cu_zero"), JSON.stringify(v.constatari));
});

test("un plafon si un factor OBISNUITE nu supara pe nimeni", () => {
  /*
   * ⚠ Perechea obligatorie: fara ea, garda de mai sus ar fi putut refuza orice plafon si nimeni
   * n-ar fi observat pana cand un comerciant cu un maxim legitim de 5000 de lei n-ar mai fi putut
   * publica deloc.
   */
  const d = definitieDeProba();
  const v = valideaza({
    definitie: d, reguli: [], pretProdus: 100,
    pretuire: {
      baza: "produs", minim: 50, maxim: 5000,
      modificatori: [{ id: "m1", eticheta: "TVA", fel: "inmultire", valoare: 1.19 }],
    },
  });
  assert.equal(v.sePoatePublica, true, JSON.stringify(v.constatari));
});

test("problemele de pret le prind pe cele pe care le poate face chiar ecranul", () => {
  assert.deepEqual(problemeleDePret({ baza: "produs" }), []);
  assert.ok(problemeleDePret({ baza: "produs", minim: 300, maxim: 100 })[0].includes("minim"));
  assert.ok(problemeleDePret({ baza: "taxa" }).some((x) => x.includes("taxa")));
  assert.deepEqual(problemeleDePret({ baza: "taxa", taxaInitiala: 10 }), []);
  assert.ok(problemeleDePret({ baza: "produs", minim: -5 }).some((x) => x.includes("negativ")));
});

/* ═══════════════════════════════════════════════════════════════════════════
   STERGEREA CURATA SI PRETUIREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ciorna de proba, cu trei adaosuri: unul legat de material, unul de gravare, unul neconditionat. */
function cuModificatori(): Continut {
  return {
    ...continutDeProba(),
    pretuire: {
      baza: "produs",
      modificatori: [
        { id: "m_material", fel: "fix", valoare: 10, cand: { c: "este", nod: "material", v: "lemn" } },
        { id: "m_gravare", fel: "fix", valoare: 20, cand: { c: "pornit", nod: "gravare" } },
        { id: "m_mereu", fel: "procent", valoare: 5 },
      ],
    },
  };
}

test("stergerea unui camp scoate si adaosurile care se uitau la el", () => {
  /*
   * ⚠ Nu doar `reguli`: ORICE camp al ciornei trebuie curatat. Un adaos al carui `cand` citeste
   * un camp sters nu se mai aprinde niciodata, deci ar fi stat in fila de pret ca un adaos care
   * „se aplica" si nu schimba nimic.
   */
  const dupa = stergeNod(cuModificatori(), "material");
  assert.deepEqual((dupa.pretuire.modificatori ?? []).map((m) => m.id), ["m_gravare", "m_mereu"]);
});

test("stergerea unui grup si a unui pas curata pretuirea la fel", () => {
  const dupaGrup = stergeGrup(cuModificatori(), "gr1");
  assert.deepEqual((dupaGrup.pretuire.modificatori ?? []).map((m) => m.id), ["m_mereu"],
    "grupul ducea si materialul, si gravarea");

  const dupaPas = stergePas(cuModificatori(), "pas1");
  assert.deepEqual((dupaPas.pretuire.modificatori ?? []).map((m) => m.id), ["m_mereu"]);
});

test("ORICE camp al ciornei trebuie curatat la stergere, nu doar regulile", () => {
  /*
   * ⚠ Proba asta e o alarma, nu o masuratoare. `stergeNod`, `stergeGrup` si `stergePas` curata
   * azi `reguli` si `pretuire`. Un camp NOU pe `Continut` ar trece neatins prin toate trei — s-a
   * si intamplat o data cu `pretuire`, unde adaosurile unui camp sters ramaneau in lista si nu se
   * mai aprindeau niciodata, aratand in panou ca „se aplica".
   *
   * Daca proba asta cade fiindca ai adaugat un camp la `Continut`: curata-l in cele trei
   * stergeri, apoi treci-l si aici.
   */
  const c = citesteContinut({});
  assert.deepEqual(Object.keys(c).sort(), ["definitie", "pretuire", "reguli"]);
});

test("formula de pret NU se atinge la stergere", () => {
  /*
   * O formula care trimite la un camp sters PICA publicarea cu „referinta lipsa", si asta e bine:
   * acolo comerciantul chiar are ce repara. Stearsa tacut, i s-ar fi schimbat pretul sub mana.
   */
  const c: Continut = {
    ...continutDeProba(),
    pretuire: { baza: "fara", formula: { k: "ref", id: "latime" } },
  };
  const dupa = stergeNod(c, "latime");
  assert.deepEqual(dupa.pretuire.formula, { k: "ref", id: "latime" });
  const v = valideaza({ definitie: dupa.definitie, reguli: dupa.reguli, pretuire: dupa.pretuire });
  assert.ok(v.constatari.some((x) => x.cod === "referinta_lipsa"), "si publicarea chiar o spune");
});

test("cand nu e nimic de curatat, pretuirea se intoarce NESCHIMBATA", () => {
  const p: Pretuire = { baza: "produs", modificatori: [{ id: "m", fel: "fix", valoare: 1 }] };
  assert.equal(faraModificatoriMorti(p, new Set(["altceva"])), p, "aceeasi referinta, ca sa nu se randeze degeaba");
  const gol = faraModificatoriMorti(
    { baza: "produs", modificatori: [{ id: "m", fel: "fix", valoare: 1, cand: { c: "pornit", nod: "x" } }] },
    new Set(["x"]),
  );
  assert.equal("modificatori" in gol, false, "lista ramasa goala se scoate cu totul");
});

/* ═══════════════════════════════════════════════════════════════════════════
   REGULILE PRESETATE
   ═══════════════════════════════════════════════════════════════════════════ */

const CELE_CINCI: Presetare[] = [
  { fel: "ascunde", cand: { fel: "optiune", nod: "material", optiune: "lemn" }, tinta: "latime" },
  { fel: "obligatoriu", cand: { fel: "pornit", nod: "gravare" }, tinta: "mesajul" },
  { fel: "limiteaza", cand: { fel: "optiune", nod: "material", optiune: "sticla" }, tinta: "latime", min: 100, max: 800 },
  { fel: "scoate_optiuni", cand: { fel: "pornit", nod: "gravare" }, tinta: "extra", optiuni: ["e2"] },
  { fel: "opreste", cand: { fel: "optiune", nod: "material", optiune: "sticla" }, text: "Sticla nu se graveaza." },
];

test("presetarea se recunoaste inapoi din regula, fara niciun marcaj in ciorna", () => {
  /*
   * ⚠ `citeste.ts` pastreaza numai cheile pe care le stie. Un `presetKey` scris in ciorna ar fi
   * disparut tacut la prima citire din baza, si comerciantul ar fi gasit un builder brut acolo
   * unde lasase un rand simplu. Deci recunoasterea trebuie sa se tina de FORMA.
   */
  for (const p of CELE_CINCI) {
    const r = regulaDinPresetare("r1", p);
    assert.deepEqual(presetareaDin(r), p, `dus-intors pentru ${p.fel}`);

    // Si dupa o trecere adevarata prin `jsonb`, ca in baza.
    const prinBaza = citesteReguli(JSON.parse(JSON.stringify([r])));
    assert.equal(prinBaza.length, 1, `regula ${p.fel} supravietuieste citirii`);
    assert.deepEqual(presetareaDin(prinBaza[0]), p, `dus-intors prin baza pentru ${p.fel}`);
  }
});

test("limitele pe DOUA campuri diferite nu sunt o presetare", () => {
  /*
   * Desenata cu un singur select de tinta, prima atingere a comerciantului ar fi mutat pe tacute
   * si limita celuilalt camp.
   */
  const r: Regula = {
    id: "r", cand: { c: "pornit", nod: "gravare" },
    atunci: [{ a: "min", tinta: "latime", v: 10 }, { a: "max", tinta: "altul", v: 90 }],
  };
  assert.equal(presetareaDin(r), null);
});

test("doua limite de acelasi fel, sau o actiune necunoscuta, nu sunt presetari", () => {
  assert.equal(presetareaDin({
    id: "r", cand: { c: "pornit", nod: "gravare" },
    atunci: [{ a: "min", tinta: "latime", v: 10 }, { a: "min", tinta: "latime", v: 20 }],
  }), null);
  assert.equal(presetareaDin({
    id: "r", cand: { c: "pornit", nod: "gravare" },
    atunci: [{ a: "ascunde", tinta: "latime" }, { a: "ascunde", tinta: "mesajul" }],
  }), null, "doua ascunderi deodata: se arata scrise, nu desenate");
  assert.equal(presetareaDin({
    id: "r", cand: { c: "cmp", nod: "latime", op: ">", v: 500 },
    atunci: [{ a: "ascunde", tinta: "mesajul" }],
  }), null, "un declansator mai bogat decat cele doua forme presetate");
});

test("o singura limita e o presetare, si se intoarce fara capatul lipsa", () => {
  const p = presetareaDin({
    id: "r", cand: { c: "pornit", nod: "gravare" }, atunci: [{ a: "max", tinta: "latime", v: 800 }],
  });
  assert.deepEqual(p, { fel: "limiteaza", cand: { fel: "pornit", nod: "gravare" }, tinta: "latime", max: 800 });
});

test("tintele nu-l cuprind pe cel care aprinde regula, nici grupul, nici pasul lui", () => {
  const d = definitieDeProba();
  const tinte = tinteleDe(d, "ascunde", "material").map((t) => t.id);
  assert.equal(tinte.includes("material"), false, "campul insusi");
  assert.equal(tinte.includes("gr1"), false, "grupul in care sta");
  assert.equal(tinte.includes("pas1"), false, "pasul in care sta");
  assert.ok(tinte.includes("latime") && tinte.includes("gr2"), "restul se poate ascunde");
});

test("MASURAT: o regula care ascunde chiar campul care o aprinde face campul sa se goleasca singur", () => {
  /*
   * Nu oscileaza, deci publicarea o primeste fara o vorba. Ce se intampla e ca ascunderea sterge
   * valoarea campului, iar fara valoare regula nu se mai aprinde — asa ca la trecerea urmatoare
   * campul nici macar nu mai e ascuns: se intoarce pe ecran, GOL. Un camp care isi sterge singur
   * alegerea, la nesfarsit, fara nicio eroare nicaieri.
   */
  const d = definitieDeProba();
  const reguli: Regula[] = [{
    id: "r", cand: { c: "este", nod: "material", v: "lemn" },
    atunci: [{ a: "ascunde", tinta: "material" }],
  }];
  const s = aplicaRegulile(d, reguli, { material: { f: "alegere", v: "lemn" } });
  assert.equal(s.neasezat, false, "validatorul NU o prinde: nu oscileaza");
  assert.equal(valideaza({ definitie: d, reguli, pretuire: { baza: "produs" } }).sePoatePublica, true);
  assert.equal(s.valori.material, undefined, "alegerea cumparatorului s-a evaporat");
  assert.equal(esteAscuns(d, s, "material"), false, "si campul e din nou la vedere, doar ca gol");
});

test("MASURAT: acelasi lucru daca se ascunde PASUL in care sta declansatorul", () => {
  const d = definitieDeProba();
  const reguli: Regula[] = [{
    id: "r", cand: { c: "este", nod: "material", v: "lemn" }, atunci: [{ a: "ascunde", tinta: "pas1" }],
  }];
  const s = aplicaRegulile(d, reguli, { material: { f: "alegere", v: "lemn" } });
  assert.equal(s.valori.material, undefined);
  assert.equal(esteAscuns(d, s, "material"), false);
});

test("schimbarea campului care aprinde regula NU lasa in urma optiunea vechiului camp", () => {
  /*
   * Ramasa, regula ar fi fost scrisa corect si nu s-ar fi aprins niciodata: „cand Extraoptiuni
   * este lemn" nu se intampla, fiindca „lemn" e o optiune de pe alt camp.
   */
  const d = definitieDeProba();
  const p = CELE_CINCI[0];
  const dupa = cuDeclansatorulPe(p, d, "extra");
  assert.deepEqual(dupa.cand, { fel: "optiune", nod: "extra", optiune: "e1" });

  const peComutator = cuDeclansatorulPe(p, d, "gravare");
  assert.deepEqual(peComutator.cand, { fel: "pornit", nod: "gravare" }, "un Da/Nu n-are optiuni de ales");
});

test("declansatorul ia prima optiune ACTIVA, nu prima din lista", () => {
  const d = definitieDeProba();
  const material = d.pasi[0].grupuri[0].noduri[0];
  assert.ok(material.fel === "alegere");
  material.optiuni[0].activa = false;
  const p = asezata({ fel: "ascunde", cand: { fel: "optiune", nod: "material", optiune: "" }, tinta: "latime" }, d);
  assert.deepEqual(p?.cand, { fel: "optiune", nod: "material", optiune: "sticla" },
    "una scoasa din vanzare n-ar fi aprins regula niciodata");
});

test("schimbarea tintei la scoaterea de optiuni reface lista de optiuni", () => {
  /*
   * ⚠ Lasata, regula ar fi trimis la optiuni de pe alt camp, iar publicarea ar fi picat cu „o
   * regula trimite la o optiune care nu mai exista" — despre optiuni pe care comerciantul nu
   * le-a atins.
   */
  const d = definitieDeProba();
  const stricata: Regula = regulaDinPresetare("r", {
    fel: "scoate_optiuni", cand: { fel: "pornit", nod: "gravare" }, tinta: "material", optiuni: ["e2"],
  });
  const v = valideaza({ definitie: d, reguli: [stricata], pretuire: { baza: "produs" } });
  assert.ok(v.constatari.some((x) => x.cod === "regula_optiune_lipsa"), "asa arata paguba");

  const asa = cuTintaPe(CELE_CINCI[3], d, "material");
  assert.deepEqual(asa, {
    fel: "scoate_optiuni", cand: { fel: "pornit", nod: "gravare" }, tinta: "material", optiuni: ["lemn"],
  });
  const bun = valideaza({
    definitie: d, reguli: [regulaDinPresetare("r", asa)], pretuire: { baza: "produs" },
  });
  assert.equal(bun.constatari.some((x) => x.cod === "regula_optiune_lipsa"), false);
});

test("o limitare fara niciun capat primeste minimul zero, ca sa nu dispara la reincarcare", () => {
  /*
   * Ramasa fara actiuni, `citeste.ts` arunca regula intreaga si randul dispare singur de pe
   * ecran.
   */
  assert.deepEqual(citesteReguli([{ id: "r", cand: { c: "pornit", nod: "gravare" }, atunci: [] }]), [],
    "asa se poarta citirea din baza");

  const d = definitieDeProba();
  const p = asezata({ fel: "limiteaza", cand: { fel: "pornit", nod: "gravare" }, tinta: "latime" }, d);
  assert.deepEqual(p, { fel: "limiteaza", cand: { fel: "pornit", nod: "gravare" }, tinta: "latime", min: 0 });
  assert.equal(regulaDinPresetare("r", p!).atunci.length, 1);
});

test("mesajul de oprire golit se umple la loc, ca sa nu dispara regula", () => {
  /*
   * `citeste.ts` arunca actiunea fara text, si odata cu ea regula intreaga: randul ar fi disparut
   * singur de pe ecran la prima reincarcare a paginii.
   */
  assert.deepEqual(citesteReguli([{
    id: "r", cand: { c: "pornit", nod: "gravare" }, atunci: [{ a: "opreste", text: "   " }],
  }]), [], "asa se poarta citirea din baza");

  const d = definitieDeProba();
  const p = asezata({ fel: "opreste", cand: { fel: "pornit", nod: "gravare" }, text: "  " }, d);
  assert.deepEqual(p, { fel: "opreste", cand: { fel: "pornit", nod: "gravare" }, text: MESAJ_OPRIRE });

  const alMeu = asezata({ fel: "opreste", cand: { fel: "pornit", nod: "gravare" }, text: "Nu se poate." }, d);
  assert.equal(alMeu?.fel === "opreste" && alMeu.text, "Nu se poate.", "textul scris de om ramane al lui");
});

test("presetarea noua se refuza cand definitia n-are cu ce s-o poarte", () => {
  const gol: Definitie = { versiuneSchema: 1, mod: "auto", pasi: [] };
  for (const fel of ["ascunde", "obligatoriu", "limiteaza", "scoate_optiuni", "opreste"] as const) {
    assert.equal(presetareNoua(gol, fel), null, `fara niciun camp: ${fel}`);
  }
  const d = definitieDeProba();
  assert.ok(presetareNoua(d, "ascunde"));
  assert.ok(presetareNoua(d, "limiteaza"));
  assert.deepEqual(declansatoriiPosibili(d).map((n) => n.id), ["material", "gravare", "extra"]);
});

test("scoaterea de optiuni se refuza cand singurul camp cu optiuni e chiar declansatorul", () => {
  const d = definitieDeProba();
  d.pasi[0].grupuri[1].noduri = d.pasi[0].grupuri[1].noduri.filter((n) => n.id !== "extra");
  // A ramas doar „material" cu optiuni, si el e si singurul declansator cu optiuni.
  const p = asezata({
    fel: "scoate_optiuni", cand: { fel: "optiune", nod: "material", optiune: "lemn" },
    tinta: "material", optiuni: ["lemn"],
  }, d);
  assert.equal(p, null);
});

test("scoaterea TUTUROR optiunilor lasa un camp din care nu se poate alege nimic", () => {
  /*
   * Publicarea trece: `validare.ts` numara optiunile active din DEFINITIE, nu ce lasa regulile.
   * Pe magazin campul iese gol, iar daca e si obligatoriu comanda nu mai trece niciodata.
   * De aceea panoul opreste ultima bifa — masurat aici cu chiar motorul.
   */
  const d = definitieDeProba();
  const extra = d.pasi[0].grupuri[1].noduri.find((n) => n.id === "extra")!;
  assert.ok(extra.fel === "alegeri");
  extra.obligatoriu = true;

  const reguli: Regula[] = [regulaDinPresetare("r", {
    fel: "scoate_optiuni", cand: { fel: "pornit", nod: "gravare" }, tinta: "extra", optiuni: ["e1", "e2"],
  })];
  assert.equal(valideaza({ definitie: d, reguli, pretuire: { baza: "produs" } }).sePoatePublica, true,
    "publicarea nu prinde nimic");

  const stare = aplicaRegulile(d, reguli, { gravare: { f: "comutator", v: true } });
  assert.deepEqual(optiuniDeAles(extra, stare), [], "iar pe magazin nu mai e nimic de ales");
  assert.equal(esteCerut(d, extra, stare), true, "si campul se cere completat mai departe");

  assert.deepEqual(optiuniRamase(extra, ["e1", "e2"]), []);
  assert.deepEqual(optiuniRamase(extra, ["e1"]), ["e2"], "cu una scoasa mai ramane ce alege omul");

  /*
   * ⚠ O optiune SCOASA DIN VANZARE nu tine locul nimanui: `optiuniDeAles` o filtreaza oricum, deci
   * un camp cu o singura optiune activa si una stinsa ramane gol daca regula o scoate pe cea
   * activa. Numarata, panoul ar fi lasat bifa sa treaca si campul ar fi iesit gol pe magazin.
   */
  const cuStinsa = schimbaOptiune(extra, "e2", { activa: false });
  assert.ok(cuStinsa.fel === "alegeri");
  assert.deepEqual(optiuniRamase(cuStinsa, ["e1"]), [], "stinsa nu mai e de ales");
  const stare2 = aplicaRegulile(
    { ...d, pasi: [{ ...d.pasi[0], grupuri: [d.pasi[0].grupuri[0], { ...d.pasi[0].grupuri[1], noduri: [cuStinsa] }] }] },
    [regulaDinPresetare("r", {
      fel: "scoate_optiuni", cand: { fel: "pornit", nod: "gravare" }, tinta: "extra", optiuni: ["e1"],
    })],
    { gravare: { f: "comutator", v: true } },
  );
  assert.deepEqual(optiuniDeAles(cuStinsa, stare2), [], "si motorul spune la fel");
});

test("un camp cu lista goala nu se ofera ca tinta pentru scoaterea de optiuni", () => {
  /*
   * Oferit, `asezata` ar fi refuzat presetarea intreaga si butonul ar fi ramas stins desi in
   * configurator exista alt camp bun pentru ea.
   */
  const d = definitieDeProba();
  const material = d.pasi[0].grupuri[0].noduri[0];
  assert.ok(material.fel === "alegere");
  material.optiuni = [];

  const tinte = tinteleDe(d, "scoate_optiuni", "gravare").map((t) => t.id);
  assert.deepEqual(tinte, ["extra"], "materialul gol nu apare");
  assert.ok(presetareNoua(d, "scoate_optiuni"), "iar presetarea se poate face pe celalalt camp");
});

test("regulile: adaugare, schimbare, stergere", () => {
  let c = continutDeProba();
  const r = regulaDinPresetare("r1", CELE_CINCI[0]);
  c = adaugaRegula(c, r);
  assert.equal(c.reguli.length, 1);

  c = schimbaRegula(c, "r1", { activa: false, id: "altul" } as Partial<Regula>);
  assert.equal(c.reguli[0].id, "r1", "id-ul nu se schimba: constatarile de la publicare trimit la el");
  assert.equal(c.reguli[0].activa, false);

  c = stergeRegula(c, "r1");
  assert.equal(c.reguli.length, 0);
});

test("plafonul de reguli se respecta", () => {
  let c = continutDeProba();
  for (let i = 0; i < MAX_REGULI + 5; i++) {
    c = adaugaRegula(c, regulaDinPresetare(`r${i}`, CELE_CINCI[0]));
  }
  assert.equal(c.reguli.length, MAX_REGULI);
});

test("regula se spune in romana cu ETICHETE, nu cu id-uri", () => {
  const d = definitieDeProba();
  const text = descrieRegula(d, regulaDinPresetare("r", CELE_CINCI[0]));
  assert.ok(text.includes("Material") && text.includes("Lemn") && text.includes("Latime"), text);
  assert.equal(text.includes("material"), false, "id-ul nu se vede nicaieri");

  const bogata = descrieRegula(d, {
    id: "r", cand: { c: "si", din: [{ c: "pornit", nod: "gravare" }, { c: "cmp", nod: "latime", op: ">", v: 500 }] },
    atunci: [{ a: "mesaj", nivel: "atentie", text: "Se face din doua bucati." }],
  });
  assert.ok(bogata.includes("Gravare") && bogata.includes("Latime") && bogata.includes("doua bucati"), bogata);
});

/* ═══════════════════════════════════════════════════════════════════════════
   OPTIUNILE, IN AMANUNT
   ═══════════════════════════════════════════════════════════════════════════ */

const cuOptiuni: Nod = {
  fel: "alegere", control: "lista", id: "mat", eticheta: "Material",
  optiuni: [{ id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }], implicit: "a",
};

test("scoaterea din vanzare a optiunii implicite scoate si implicitul", () => {
  /*
   * `validare.ts` sare peste un implicit stins fara sa spuna nimic: configuratorul s-ar fi
   * deschis cu campul gol, in timp ce panoul continua sa arate ca implicitul e pus.
   */
  const dupa = schimbaOptiune(cuOptiuni, "a", { activa: false });
  assert.ok(dupa.fel === "alegere");
  assert.equal(dupa.implicit, undefined);
  assert.equal(dupa.optiuni[0].activa, false, "optiunea ramane, pentru comenzile vechi");

  const alta = schimbaOptiune(cuOptiuni, "b", { activa: false });
  assert.equal(alta.fel === "alegere" && alta.implicit, "a", "stingerea altei optiuni nu atinge implicitul");
});

test("acelasi lucru la alegerile multiple", () => {
  const multe: Nod = {
    fel: "alegeri", control: "bifare", id: "extra", eticheta: "Extra",
    optiuni: [{ id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }], implicit: ["a", "b"],
  };
  const dupa = schimbaOptiune(multe, "a", { activa: false });
  assert.ok(dupa.fel === "alegeri");
  assert.deepEqual(dupa.implicit, ["b"]);
  const siCealalta = schimbaOptiune(dupa, "b", { activa: false });
  assert.equal(siCealalta.fel === "alegeri" && siCealalta.implicit, undefined);
});

test("id-ul optiunii nu se poate schimba: comenzile vechi trimit la el", () => {
  const dupa = schimbaOptiune(cuOptiuni, "a", { id: "altul", eticheta: "Alt nume" });
  assert.ok(dupa.fel === "alegere");
  assert.equal(dupa.optiuni[0].id, "a");
  assert.equal(dupa.optiuni[0].eticheta, "Alt nume");
});

test("o optiune stinsa nu se poate pune implicit", () => {
  const cuStinsa = schimbaOptiune(cuOptiuni, "b", { activa: false });
  assert.equal(puneImplicitAlegere(cuStinsa, "b"), cuStinsa, "nu se schimba nimic");
  const pus = puneImplicitAlegere(cuOptiuni, "b");
  assert.equal(pus.fel === "alegere" && pus.implicit, "b");
  const scos = puneImplicitAlegere(cuOptiuni, undefined);
  assert.equal(scos.fel === "alegere" && scos.implicit, undefined);
});

test("implicitul alegerilor multiple se tine in ordinea optiunilor, nu a bifarii", () => {
  const multe: Nod = {
    fel: "alegeri", control: "bifare", id: "extra", eticheta: "Extra",
    optiuni: [{ id: "a", eticheta: "A" }, { id: "b", eticheta: "B" }, { id: "c", eticheta: "C" }],
  };
  let n = comutaImplicitAlegeri(multe, "c");
  n = comutaImplicitAlegeri(n, "a");
  assert.deepEqual(n.fel === "alegeri" ? n.implicit : null, ["a", "c"], "altfel bifele ar sari in panou");
  n = comutaImplicitAlegeri(n, "c");
  assert.deepEqual(n.fel === "alegeri" ? n.implicit : null, ["a"]);
  n = comutaImplicitAlegeri(n, "a");
  assert.equal(n.fel === "alegeri" && n.implicit, undefined, "lista goala se scoate");
});

test("problemele campului le prind pe cele pe care publicarea le refuza sau le sare", () => {
  assert.deepEqual(problemeleNodului({ fel: "numar", control: "camp", id: "x", eticheta: "X", min: 10, max: 5 }).length, 1);
  assert.deepEqual(problemeleNodului({ fel: "numar", control: "camp", id: "x", eticheta: "X", min: 5, max: 10 }), []);

  const grameNegative: Nod = {
    fel: "alegere", control: "lista", id: "m", eticheta: "M",
    optiuni: [{ id: "a", eticheta: "Fara ambalaj", grame: -50 }],
  };
  assert.ok(problemeleNodului(grameNegative)[0].includes("greutate"));
  assert.ok(valideaza({
    definitie: { versiuneSchema: 1, mod: "auto", pasi: [{ id: "p", eticheta: "P", grupuri: [{ id: "g", noduri: [grameNegative] }] }] },
    reguli: [], pretuire: { baza: "produs" },
  }).constatari.some((x) => x.cod === "grame_optiune_nevalid"), "si publicarea chiar o refuza");

  const toateStinse = schimbaOptiune(grameNegative, "a", { activa: false });
  assert.ok(problemeleNodului(toateStinse).some((x) => x.includes("scoase din vanzare")));

  assert.ok(problemeleNodului({
    fel: "alegeri", control: "bifare", id: "x", eticheta: "X", optiuni: [{ id: "a", eticheta: "A" }],
    minAlese: 3, maxAlese: 1,
  }).some((x) => x.includes("alegeri")));
});

test("ciorna trece intreaga prin `jsonb` dupa ce panoul umbla la ea", () => {
  /*
   * Tot ce scriu ecranele noi trebuie sa se poata citi inapoi din baza. Ce nu se citeste dispare
   * tacut, si comerciantul ar fi gasit alt configurator decat cel pe care l-a lasat.
   */
  let c = continutDeProba();
  c = puneBazaPret(c, "taxa");
  c = puneTaxaInitiala(c, 49.5);
  c = punePragPret(c, "minim", 100);
  c = punePragPret(c, "maxim", 900);
  c = puneRotunjire(c, { fel: "insus", pas: 5 });
  for (const p of CELE_CINCI) c = adaugaRegula(c, regulaDinPresetare(idNou(), p));

  const inapoi = citesteContinut(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(inapoi.pretuire, c.pretuire);
  assert.equal(inapoi.reguli.length, c.reguli.length);
  assert.deepEqual(inapoi.reguli.map((r) => presetareaDin(r)), CELE_CINCI);
});

test("un camp de numar golit da NIMIC, nu zero", () => {
  /*
   * `Number("")` e 0, iar un camp golit ar fi devenit tacut „minim 0" in loc de „fara minim".
   * Si 2,5 scris cu virgula, ca pe o tastatura romaneasca, trebuie sa fie 2.5, nu `NaN`.
   */
  assert.equal(numarScris(""), undefined);
  assert.equal(numarScris("   "), undefined);
  assert.equal(numarScris("abc"), undefined);
  assert.equal(numarScris("0"), 0, "zero scris intentionat CHIAR e zero");
  assert.equal(numarScris("2,5"), 2.5);
  assert.equal(numarScris(" -12.75 "), -12.75);
});
