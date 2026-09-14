import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signShippingQuote, verificaCotatia, semneazaOptiuni, amprentaPlanului } from "./quote-token";

const COMANDA = "src/lib/actions/order.actions.ts";
const COTARE = "src/lib/actions/shipping.actions.ts";
const sursa = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PLANUL SI SUMA RAMBURSULUI SUNT SEMNATE                       (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Amprenta lega pretul, destinatia, curierul, tipul de livrare, eticheta si regimul de ramburs.
 * NU lega serviciul si NU lega suma. Doua gauri, amandoua platite de comerciant:
 *
 *   1. acelasi curier are mai multe servicii la preturi diferite (Shipo `rate_id`, UPS
 *      `serviceCode`, SmartShip acelasi curier pe doua contracte). Se cerea cotatia pentru cel
 *      ieftin, se schimba UN camp la trimitere, si comanda intra la pretul mic pe serviciul mare;
 *   2. suma de ramburs avea drept podea `min(subtotal din browser, plafonul din catalog)`. Amandoi
 *      termenii veneau de la client: `subtotal: 0.01` cobora podeaua la un ban, iar `cart` omis o
 *      cobora la ZERO, fiindca plafonul se socoteste chiar din liniile declarate.
 *
 * ⚠ CE APARA PROBA ASTA, SI CE NU. Aici se dovedeste ca semnarea si verificarea se inchid una pe
 * alta, si mai ales ca ESECURILE MERG IN DIRECTIILE BUNE. Ca fiecare apelant chiar leaga planul
 * se probeaza separat, pe apelanti: o regula dovedita doar pe functia pura nu apara cablarea.
 */

const BIZ = "b7a9c3d1-0000-4000-8000-000000000001";
const DEST = { county: "Cluj", city: "Cluj-Napoca" };
const CARGUS = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", ramburs: true };
/** Ora fixa: altfel fiecare rulare ar semna alt token si nimic nu s-ar putea compara. */
const EXPIRA = 4_102_444_800_000;

const PLAN_SHIPO = { shipoRateId: 101 };
const PLAN_SHIPO_ALTUL = { shipoRateId: 205 };

/* ── 1. Inelul de chei: nimic din ce circula azi nu se clinteste ──────────── */

test("⚠ fara plan si fara suma, tokenul iese in forma VECHE, de trei bucati", () => {
  /*
   * ⚠ ASTA E CONDITIA INTREGII LUCRARI, si de aceea e prima proba.
   *
   * Un token traieste 24 de ore. Daca forma se schimba pentru toata lumea deodata, fiecare pagina
   * de finalizare deschisa in clipa desfasurarii poarta un token care nu mai bate, iar comanda
   * cade pe `max(suma ceruta, tarif implicit)`: omul vede 0,00 la „Ridicare personala" si plateste
   * intre 18 si 45 de lei. Forma noua apare DOAR unde chiar e ceva nou de legat.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA);
  assert.equal(t.split(".").length, 3, "o cotatie fara plan si fara suma si-a schimbat forma");
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS).ok, true);
});

test("⚠ forma veche intoarce `rambursBani: null`, nu zero", () => {
  /*
   * Deosebirea nu e de stil: `0` ar insemna „s-a cotat cu ramburs zero", adica o comanda platita
   * in avans, si apelantul ar refuza pe loc orice comanda cu ramburs venita pe un token vechi.
   * `null` inseamna „tokenul asta nu poarta suma", si atunci nu se judeca nimic.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA);
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS);
  assert.equal(v.ok && v.rambursBani, null);
});

/* ── 2. Forma noua: suma calatoreste si se intoarce ───────────────────────── */

test("suma de ramburs se semneaza si se intoarce la verificare", () => {
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 50_000);
  /*
   * ⚠ SASE, NU CINCI (indreptat 14.09.2026, odata cu pretul purtat).
   *
   * Numarul s-a schimbat fiindca forma noua poarta si pretul cotat, in clar si sub MAC, ca sa se
   * poata verifica planul pe drumul livrarii GRATUITE, unde browserul trimite zero. Proprietatea
   * aparata de afirmatia asta nu s-a clintit: cotatia cu ceva nou de legat pleaca in forma noua,
   * iar cea fara ramane in cea veche (vezi prima proba din fisier).
   */
  assert.equal(t.split(".").length, 6, "forma cu suma si pretul purtat n-a aparut");
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS);
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.rambursBani, 50_000, "suma semnata nu se intoarce apelantului");
});

test("⚠ suma purtata e ACOPERITA de semnatura: rescrisa, tokenul cade", () => {
  /*
   * Ca la grame: numarul calatoreste in clar ca verificarea sa aiba fata de ce compara, dar e in
   * MAC. Neacoperit, cine subdeclara ar rescrie pur si simplu cifra din token.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 50_000);
  /* ⚠ SASE BUCATI de cand pretul calatoreste si el: `[expira, grame, bani, plan, pret, mac]`. */
  const [exp, g, , amp, pret, mac] = t.split(".");
  const rescris = `${exp}.${g}.1.${amp}.${pret}.${mac}`;
  const v = verificaCotatia(BIZ, DEST, 18, rescris, CARGUS);
  assert.equal(v.ok, false, "o suma rescrisa a trecut");
  assert.equal(v.ok === false && v.motiv, "semnatura");
});

/* ── 3. Planul, si DIRECTIA in care cade ──────────────────────────────────── */

test("planul care se potriveste trece", () => {
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN_SHIPO);
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN_SHIPO).ok, true);
});

test("⚠⚠ PLANUL SCHIMBAT DA `plan`, NU `semnatura`, SI ASTA E TOATA REGULA", () => {
  /*
   * ⚠ DE CE CONTEAZA CARE MOTIV IESE. Cele doua duc in directii OPUSE la apelant:
   *
   *   `semnatura` -> cotatie pierduta (desfasurare, token expirat) -> se cade pe tariful
   *                  implicit si comanda INTRA. O purtare blanda, dinadins.
   *   `plan`      -> cineva a schimbat serviciul dupa ce a primit pretul -> comanda se REFUZA
   *                  si se cere recotare.
   *
   * Daca MAC-ul s-ar reface cu planul PRETINS in loc de cel purtat, orice falsificare ar strica
   * MAC-ul si ar iesi `semnatura`: atacatorul ar primi chiar purtarea blanda, iar comanda lui ar
   * intra la pretul mic pe serviciul scump. Ordinea celor doua verificari E regula.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN_SHIPO);
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN_SHIPO_ALTUL);
  assert.equal(v.ok, false, "serviciul schimbat a trecut");
  assert.equal(
    v.ok === false && v.motiv, "plan",
    "planul schimbat cade ca `semnatura`, deci comanda ar intra pe tarif in loc sa fie refuzata",
  );
});

test("⚠ apelantul care NU poate spune planul nu e judecat pe el", () => {
  /*
   * `undefined` inseamna „n-am de unde sti", ca la greutate pe drumul panoului. Nu e portita:
   * cine nu poate socoti planul n-are nici cu ce sa minta. Fara regula asta, recotarea din panou
   * ar fi cazut la fiecare incercare.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN_SHIPO);
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS).ok, true);
});

test("⚠⚠ o cotatie FARA plan REFUZA o comanda care declara unul", () => {
  /*
   * ═══ ⚠ PROBA ASTA CEREA, PANA PE 15.09.2026, EXACT PE DOS ═══
   *
   * Scria ca o cotatie fara plan trebuie sa ACCEPTE un plan declarat, cu motivul: „curierul simplu
   * la adresa nu leaga niciun serviciu, deci comparata cu una nevida, fiecare asemenea comanda ar
   * fi fost refuzata fara motiv". Premisa aia nu fusese masurata NICIODATA. Masurata: zero din 456
   * de comenzi din productie poarta vreun camp de plan. Nu exista nicio asemenea comanda.
   *
   * Deci proba nu apara o comanda cinstita; inghetase chiar gaura: cotatiile fara plan sunt REGULA
   * (tarif fix de zona, curier care n-a raspuns, plafonul de 25 de secunde, plafonul de cereri),
   * iar pe fiecare din ele se putea adauga la comanda un `shipo_rate_id` si trecea.
   *
   * ⚠ O proba verde care apara o gaura e mai rea decat gaura: gaura se vede, proba o ascunde.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 7_700);
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN_SHIPO);
  assert.equal(v.ok, false, "un serviciu declarat peste o cotatie fara serviciu a trecut");
  assert.equal(v.ok === false && v.motiv, "plan",
    "a cazut ca `semnatura`, deci comanda ar fi intrat pe tarif in loc sa fie refuzata");
});

test("⚠ si comanda CINSTITA fara serviciu trece mai departe", () => {
  /*
   * Cealalta jumatate, si ea e motivul pentru care comparatia stricta e sigura: `planulPretins`
   * intoarce mereu un obiect, iar cand browserul n-a primit niciun serviciu toate campurile lui ies
   * `undefined`, deci amprenta pretinsa e tot goala. Gol cu gol trece.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 7_700);
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, {}).ok, true,
    "o comanda fara niciun serviciu declarat a fost refuzata");
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, { shipoRateId: null }).ok, true,
    "`null` de la browser nu mai inseamna „n-am ales nimic”");
});

/* ── 4. Amprenta planului: stabila, si nu se lasa pacalita ────────────────── */

test("⚠ amprenta nu depinde de ORDINEA cheilor obiectului", () => {
  /*
   * Ordinea dintr-un obiect literal e a celui care l-a construit. Scoasa din `Object.keys`,
   * amprenta ar fi iesit altfel din browser decat din cotare, si FIECARE comanda cinstita ar fi
   * cazut pe `plan`, adica ar fi fost refuzata.
   */
  const a = amprentaPlanului({ shipoRateId: 101, upsServiceCode: "11" });
  const b = amprentaPlanului({ upsServiceCode: "11", shipoRateId: 101 });
  assert.equal(a, b);
  assert.notEqual(a, "", "un plan cu doua campuri a iesit gol");
});

test("⚠ lipsa, `null` si sirul gol sunt acelasi lucru", () => {
  /* Browserul trimite cand `undefined`, cand `""`, cand `null` pentru acelasi „n-am ales". */
  assert.equal(amprentaPlanului({}), "");
  assert.equal(amprentaPlanului({ shipoRateId: null }), "");
  assert.equal(amprentaPlanului({ upsServiceCode: "" }), "");
  assert.equal(amprentaPlanului(null), "");
  assert.equal(amprentaPlanului(undefined), "");
});

test("⚠ contractul propriu SmartShip intra in amprenta", () => {
  /*
   * Cu `show_byoc: 1` acelasi curier apare de DOUA ori, pe contractul comerciantului si pe cel
   * SmartShip, la preturi diferite. Lasat afara, cele doua s-ar prabusi una peste alta si
   * cumparatorul ar alege una si ar primi alta.
   */
  const pe = amprentaPlanului({ smartshipCourierId: 7, smartshipOwnContract: true });
  const peAltul = amprentaPlanului({ smartshipCourierId: 7, smartshipOwnContract: false });
  assert.notEqual(pe, peAltul, "contractul nu schimba amprenta, deci nu e legat");
});

test("⚠ produsul local DHL intra si el, nu doar cel global", () => {
  /*
   * `localProductCode` e codul cu care contul comerciantului are tariful. Pierdut, emiterea pleaca
   * pe produsul global si pretul facturat se departeaza de cel aratat cumparatorului.
   */
  const a = amprentaPlanului({ dhlProductCode: "P", dhlLocalProductCode: "N" });
  const b = amprentaPlanului({ dhlProductCode: "P", dhlLocalProductCode: "K" });
  assert.notEqual(a, b);
});

/* ── 5. Cusatura: semnarea in lot duce planul mai departe ─────────────────── */

test("⚠ `semneazaOptiuni` ia planul DIN OPTIUNE, nu de la apelant", () => {
  /*
   * Serverul produce deja identitatea serviciului pe fiecare optiune (`ShippingOption` o poarta,
   * cu motivul scris pe fiecare camp). Luat de la apelant, ar fi fost inca un loc prin care cineva
   * poate trimite altceva decat s-a cotat.
   */
  const [o] = semneazaOptiuni(BIZ, DEST, true, 1000, [{
    price: 18, courier: "shipo", deliveryType: "address", courierLabel: "Shipo (Sameday)",
    shipoRateId: 101,
  }], 50_000);
  assert.equal(o.token.split(".").length, 6, "optiunea cu serviciu a plecat in forma veche");

  const opt = { courier: "shipo", deliveryType: "address", courierLabel: "Shipo (Sameday)", ramburs: true };
  assert.equal(verificaCotatia(BIZ, DEST, 18, o.token, opt, null, { shipoRateId: 101 }).ok, true);
  const alt = verificaCotatia(BIZ, DEST, 18, o.token, opt, null, { shipoRateId: 205 });
  assert.equal(alt.ok === false && alt.motiv, "plan", "serviciul schimbat n-a fost prins pe calea din lot");
});

test("⚠ o optiune fara serviciu pleaca neschimbata, in forma veche", () => {
  /* Altfel fiecare magazin cu un singur curier simplu ar fi primit tokene noi degeaba. */
  const [o] = semneazaOptiuni(BIZ, DEST, false, 1000, [{
    price: 17, courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus",
  }]);
  assert.equal(o.token.split(".").length, 3);
});

/* ── 6. Greutatea ramane judecata si pe forma noua ────────────────────────── */

test("⚠ pe forma noua greutatea se judeca la fel: mai greu cade", () => {
  /*
   * Forma noua a fost scrisa de mana, separat de cea de trei bucati. Copiata gresit, ar fi putut
   * pierde tocmai poarta greutatii, si atunci atacul „coteaza un kilogram, comanda cincisprezece"
   * s-ar fi redeschis exact pe cotatiile cele mai noi.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 50_000, PLAN_SHIPO);
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, 900, PLAN_SHIPO).ok, true, "un cos mai usor a fost refuzat");
  const greu = verificaCotatia(BIZ, DEST, 18, t, CARGUS, 15_000, PLAN_SHIPO);
  assert.equal(greu.ok === false && greu.motiv, "greutate");
});

/* ── 7. Formele care NU se accepta ────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════════
   8. CUSATURA: APELANTII CHIAR FOLOSESC REGULA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ FARA SECTIUNEA ASTA, TOT CE E MAI SUS E DECOR.

   Asa a supravietuit chiar defectul pe care il reparam: `pragul-rambursului.test.ts` avea noua
   teste si o cusatura pe apelant, dar cusatura afirma FORMA chemarii, nu PROVENIENTA
   argumentului. Fiecare test dadea podeaua ca literal (`pragulRambursului(cerut, 500, true)`) si
   nu intreba niciodata de unde vine 500. Functia pura era corecta; argumentul ei nu.

   Deci aici se cere ca drumurile reale sa poarte regula, si fiecare afirmatie e scrisa ca sa CADA
   daca randul ei e sters.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ AMANDOUA checkout-urile trimit planul pretins", () => {
  /*
   * ⚠ DOUA, nu „cel putin unul". Cele doua drumuri de comanda sunt copii una alteia pana la
   * declaratiile de tip, care sunt si ele duplicate. O reparatie pusa intr-una singura trece toate
   * portile si lasa cealalta usa larg deschisa: aceeasi clasa ca `acelasi-lucru-in-doua-copii`.
   */
  const cod = faraComentarii(sursa(COMANDA));
  const apeluri = (cod.match(/planulPretins\(data\)/g) ?? []).length;
  assert.equal(apeluri, 2, `planul se trimite pe ${apeluri} drumuri, nu pe cele doua de comanda`);
  assert.match(cod, /import \{ campuriDeCurier, planulPretins,/,
    "ajutorul nu mai e importat, deci s-a nascut o a treia copie scrisa pe loc");
});

test("⚠ AMANDOUA confrunta suma semnata cu marfa adevarata", () => {
  const cod = faraComentarii(sursa(COMANDA));
  const confruntari = (cod.match(/verdictTransport\.rambursBaniSemnat != null/g) ?? []).length;
  assert.equal(confruntari, 2,
    `suma se confrunta pe ${confruntari} drumuri, nu pe cele doua de comanda`);
});

test("⚠⚠ CONFRUNTAREA E LEGATA DE RAMBURS, altfel refuza fiecare plata cu cardul", () => {
  /*
   * O comanda platita in avans poarta zero semnat si marfa de mii de lei. Comparata orbeste, ar
   * iesi „subdeclarata" de fiecare data. Paguba ar fi fost mult mai mare decat gaura reparata:
   * nu s-ar mai fi putut plati cu cardul nicaieri.
   */
  const cod = faraComentarii(sursa(COMANDA));
  const bucati = cod.split("verdictTransport.rambursBaniSemnat != null").slice(1);
  /*
   * ⚠ PAZA IMPOTRIVA VIDULUI. Fara ea, daca sirul dispare cu totul, lista e goala, bucla nu
   * ruleaza niciodata si testul trece DEGEABA. Se sprijinea pe testul vecin care numara doua
   * aparitii, dar o proba care nu poate cadea singura nu e o proba.
   */
  assert.ok(bucati.length > 0, "nu mai exista nicio confruntare de verificat");
  for (const bucata of bucati) {
    const inainte = cod.slice(0, cod.indexOf(bucata));
    assert.ok(
      inainte.slice(-220).includes("isCodPaymentMethod(metodaPlata)"),
      "o confruntare nu e legata de ramburs: ar refuza si comenzile platite in avans",
    );
  }
});

test("⚠⚠ SE COMPARA CU MARFA, NU CU TOTALUL, si asta e regula de unitati", () => {
  /*
   * ═══ ⚠ CHIAR GRESEALA REPARATA IN ACEEASI ZI, IN ALT LOC ═══
   *
   * Jurnalul rambursului numea „subdeclarare" propria noastra nepotrivire de unitati, fiindca
   * compara marfa cu o marime care continea altceva. Aici capcana e aceeasi, oglindita: cotatia a
   * fost ceruta pe MARFA (amandoua formularele trimit marfa), iar curierul incaseaza la usa
   * TOTALUL, care e mereu mai mare. Cine „indreapta" comparatia catre `total` face ca FIECARE
   * comanda cinstita sa iasa subdeclarata, si nicio alta proba de azi n-ar prinde-o.
   */
  const cod = faraComentarii(sursa(COMANDA));
  const confruntari = cod.split("verdictTransport.rambursBaniSemnat != null").slice(1);
  assert.ok(confruntari.length > 0, "nu mai exista nicio confruntare de comparat");
  for (const bucata of confruntari) {
    const fereastra = bucata.slice(0, 260);
    assert.match(fereastra, /round2\(subtotal \+ extrasTotal - discountAmount\)/,
      "confruntarea nu se mai face pe marfa");
    assert.doesNotMatch(fereastra, /\btotal\b\s*-/,
      "confruntarea s-a mutat pe TOTAL: fiecare comanda cinstita ar iesi subdeclarata");
  }
});

test("⚠ fiecare cauza de recotare are textul EI, si niciuna nu imprumuta de la alta", () => {
  /*
   * Patru cauze, patru texte. Doua care impart o propozitie inseamna ca omul citeste despre o
   * problema pe care n-o are: „cosul s-a schimbat" spus cuiva care si-a schimbat serviciul il
   * trimite sa caute in cos ceva ce nu exista.
   */
  /*
   * ⚠ AJUTORUL STA IN MODUL PROPRIU, nu in `order.actions.ts`. Acolo l-am pus prima data, si
   * buildul a cazut cu „Only async functions are allowed to be exported in a `use server` file",
   * lasand modulul FARA niciun export: nouasprezece erori, dintre care optsprezece doar ecouri.
   * `tsc` trecuse curat. Vezi antetul din `recotarea.ts`.
   *
   * ⚠ Si fisierul fiind mic, se citeste INTREG: felia care taie pana la un `\n}` era chiar capcana
   * „slice-ul de corp imprumuta de la vecin", pe care am intalnit-o de doua ori azi.
   */
  const corp = sursa("src/lib/shipping/recotarea.ts");
  assert.match(corp, /export function mesajulRecotarii\(/, "ajutorul de mesaje a disparut");
  assert.doesNotMatch(sursa(COMANDA), /export function mesajulRecotarii\(/,
    "ajutorul s-a intors in fisierul `use server`, deci buildul cade cu modulul fara exporturi");
  const texte = (corp.match(/catreClient: "[^"]+/g) ?? []).map((t) => t.slice(0, 40));
  assert.equal(texte.length, 4, `ajutorul are ${texte.length} texte, nu patru cauze`);
  assert.equal(new Set(texte).size, 4, "doua cauze impart acelasi text catre cumparator");
});

test("⚠ cotarea semneaza suma pe AMANDOUA iesirile", () => {
  /*
   * `getShippingOptions` are doua `return` cu optiuni semnate, iar ramura internationala a mai
   * plecat o data fara token DELOC. Legata doar la iesirea finala, comenzile internationale ar fi
   * plecat cu suma nesemnata, adica exact cu gaura deschisa acolo unde e cel mai greu de vazut.
   */
  const cod = faraComentarii(sursa(COTARE));
  const apeluri = cod.match(/semneazaOptiuni\([^;]*/g) ?? [];
  assert.ok(apeluri.length >= 2, `nu mai gasesc cele doua iesiri semnate; gasite ${apeluri.length}`);
  for (const a of apeluri) {
    assert.match(a, /rambursCotatBani/, `o iesire semneaza fara suma: ${a.slice(0, 90)}`);
  }
});

test("⚠ formele acceptate sunt EXACT patru, si orice alta cade", () => {
  /*
   * ⚠ NUMELE S-A SCHIMBAT A DOUA OARA, si merita spus de ce.
   *
   * Se numea „EXACT trei" cat timp formele erau doua, trei si cinci bucati. De cand exista si cea
   * de SASE, cu pretul purtat, numarul acela ar fi devenit fals, iar mutantii de mai jos ar fi
   * cazut mai departe din alte motive: proba ar fi ramas VERDE cu numele mincinos. Aceeasi lectie
   * pe care o poarta si nota de mai jos, despre proba din `quote-token.test.ts`.
   *
   * Regula, neschimbata: lungimile se citesc STRICT, iar orice numar de bucati din afara celor
   * patru cunoscute cade. Se sting singure formele vechi in 24 de ore, dar pana atunci sunt primite.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 50_000, PLAN_SHIPO);
  for (const stricat of [`${t}.inca-ceva`, t.split(".").slice(0, 4).join("."), "fara-nimic", ""]) {
    assert.equal(
      verificaCotatia(BIZ, DEST, 18, stricat, CARGUS).ok, false,
      `o forma nerecunoscuta a trecut: ${stricat.slice(0, 40)}`,
    );
  }
});
