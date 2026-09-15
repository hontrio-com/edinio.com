import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { semneazaPunctul } from "./punctul-ales-e-semnat";
import { punctulDePeComanda } from "./punctul-de-pe-comanda";
import { RETEA_UNICA, reteauaDinPlan, reteauaPunctului } from "./reteaua-punctului";
import type { PlanExpedierii } from "./quote-token";

/*
 * ⚠ CHEIA DE PROBA, si e o masuratoare, nu o formalitate.
 *
 * Incarcatorul probelor (`scripts/tests/register.mjs`) nu aduce niciun `.env`: in procesul de test
 * `SHIPPING_QUOTE_SECRET` si `SUPABASE_SERVICE_ROLE_KEY` au amandoua lungimea ZERO. Modulul de
 * semnare ARUNCA fara cheie, dinadins, deci o proba a lui isi aduce cheia ei si nu se bizuie pe
 * masina pe care ruleaza. Motivul intreg e scris in `quote-token.test.ts`.
 *
 * ⚠ ASEZATA DUPA IMPORTURI, ca in `punctul-ales-e-semnat.test.ts`, si nu deasupra lor: in ESM
 * importurile se evalueaza oricum INAINTEA oricarei instructiuni din fisier, deci un rand pus mai
 * sus n-ar rula mai devreme. Ce conteaza cu adevarat e sa stea inaintea oricarei semnari facute la
 * nivel de modul, iar aici nu exista niciuna.
 */
process.env.SHIPPING_QUOTE_SECRET = "cheie-de-proba-punctul-de-pe-comanda";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNCTUL DE PE COMANDA SE SCRIE DIN TOKEN                      (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cele sase campuri ale punctului ajungeau pe comanda exact cum le trimitea browserul. La emitere
 * ele nu sunt decorative: la Sameday `locker_city` si `locker_county` INLOCUIESC destinatarul de pe
 * AWB, la DPD `pickupOfficeId` vine din `Number(locker_id)` cu `recipientCity` suprascris. Deci
 * adresa de livrare era scrisa de cumparator.
 */

const MAGAZIN = "b7a9c3d1-0000-4000-8000-000000000001";
/** Ora fixa: altfel fiecare rulare ar semna alt token si nimic nu s-ar putea compara. */
const EXPIRA = 4_102_444_800_000;

const PUNCT = {
  id: "4242",
  name: "Easybox Kaufland Vitan",
  address: "Calea Vitan 236",
  city: "Bucuresti",
  county: "Bucuresti",
  postCode: "031301",
};

const PLAN_GOL: PlanExpedierii = {};

function tokenSameday(peste: Partial<typeof PUNCT> = {}, expira = EXPIRA): string {
  return semneazaPunctul(
    { businessId: MAGAZIN, curier: "sameday", retea: RETEA_UNICA },
    { ...PUNCT, ...peste },
    expira,
  );
}

/* ── 1. Regula de retea: ce intra in semnatura, si ce NU ───────────────────── */

test("⚠⚠ la UPS, JUDETUL cumparatorului NU intra in reteaua semnata", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CEA MAI SCUMPA DIN FISIER, si apara un defect care s-ar fi vazut abia in
   * productie, la al DOILEA cumparator.
   *
   * Al cincilea argument al lui `getLockers` poarta, la UPS, judetul cumparatorului. Semnat asa cum
   * vine, punctul ar purta judetul in semnatura. Dar cheia de cache a punctelor UPS foloseste doar
   * `orasUps(city, retea)`, care pliaza sectoarele si NU cuprinde judetul: doi cumparatori din
   * acelasi oras cu judete scrise diferit impart aceeasi lista din cache, deci al doilea primeste
   * puncte semnate cu judetul PRIMULUI si fiecare comanda UPS la punct ar cadea la verificare.
   *
   * Se cere deci ca doua judete diferite sa dea ACEEASI retea. Cine ar face reteaua sa poarte
   * semnalul la UPS face proba asta sa cada.
   */
  assert.equal(reteauaPunctului("ups", "Cluj"), reteauaPunctului("ups", "Bucuresti"));
  assert.equal(reteauaPunctului("ups", "Cluj"), RETEA_UNICA);
});

test("⚠ la SmartShip si FAN, semnalul CHIAR deosebeste retelele", () => {
  /*
   * Perechea afirmatiei de sus: daca reteaua ar fi constanta peste tot, proba de la UPS ar trece
   * degeaba. Aici se cere ca acolo unde retelele sunt reale, ele sa iasa DIFERITE.
   */
  assert.notEqual(reteauaPunctului("smartship", "fanbox"), reteauaPunctului("smartship", "easybox"));
  assert.notEqual(reteauaPunctului("fan-courier", "paypoint"), reteauaPunctului("fan-courier", "fanbox"));
  assert.notEqual(reteauaPunctului("fan-courier", "office"), reteauaPunctului("fan-courier", "fanbox"));
});

test("⚠ un semnal FAN lipsa inseamna `fanbox`, nu `nicio retea`", () => {
  /*
   * Pana pe 13.09.2026 FANbox era singura retea oferita, iar optiunile ramase deschise in browserul
   * unui cumparator nu poarta inca tipul. Tratata lipsa ca pe o retea proprie, fiecare comanda
   * pornita inainte de schimbare ar fi cazut la verificare.
   */
  assert.equal(reteauaPunctului("fan-courier", undefined), reteauaPunctului("fan-courier", "fanbox"));
  assert.equal(reteauaPunctului("fan-courier", "inventat"), reteauaPunctului("fan-courier", "fanbox"));
});

test("⚠⚠ reteaua din PLAN e aceeasi cu cea din argumentul lui getLockers", () => {
  /*
   * ⚠ ASTA E BUCLA. Semnarea primeste al cincilea argument al lui `getLockers` (un SIR), iar
   * verificarea primeste planul deja confruntat de cotatie, unde `shipoRateId` e NUMAR si
   * `fanPointType` poate lipsi. Daca cele doua capete n-ar ajunge la acelasi sir, fiecare comanda
   * cinstita la punct ar cadea cu motivul „semnatura", si nimic n-ar arata de ce.
   */
  assert.equal(reteauaDinPlan("shipo", { shipoRateId: 1234 }), reteauaPunctului("shipo", "1234"));
  assert.equal(reteauaDinPlan("fan-courier", { fanPointType: "paypoint" }), reteauaPunctului("fan-courier", "paypoint"));
  assert.equal(reteauaDinPlan("smartship", { smartshipLockerNet: "fanbox" }), reteauaPunctului("smartship", "fanbox"));
  assert.equal(reteauaDinPlan("sameday", PLAN_GOL), reteauaPunctului("sameday", undefined));
});

/* ── 2. Poarta: ce se scrie pe comanda ────────────────────────────────────── */

test("o comanda la ADRESA nu capata campuri de punct", () => {
  const v = punctulDePeComanda({ businessId: MAGAZIN, curier: "sameday", lockerId: undefined, token: undefined, plan: PLAN_GOL });
  assert.equal(v.ok, true);
  assert.equal(v.ok === true && v.campuri, null);
});

test("⚠⚠ campurile se iau din TOKEN, iar cele din cerere se arunca", () => {
  /*
   * ⚠ ROSTUL INTREGII LUCRARI. Cererea nici nu apare in argumente: functia primeste tokenul, si
   * campurile canonice ies din el. Ce trimite browserul pe langa nu are pe unde intra.
   */
  const v = punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242", token: tokenSameday(), plan: PLAN_GOL,
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.ok === true && v.campuri, {
    locker_id: "4242",
    locker_name: "Easybox Kaufland Vitan",
    locker_address: "Calea Vitan 236",
    locker_city: "Bucuresti",
    locker_county: "Bucuresti",
    locker_post_code: "031301",
  });
});

test("⚠⚠ un punct din ALT ORAS, semnat de noi, se scrie cu orasul LUI", () => {
  /*
   * Afirmatia care arata ca nu e o verificare de tip „da/nu", ci o INLOCUIRE. Cumparatorul ar putea
   * trimite orice oras in cerere; pe comanda ajunge cel din fisa.
   */
  const v = punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242",
    token: tokenSameday({ city: "Cluj-Napoca", county: "Cluj" }), plan: PLAN_GOL,
  });
  assert.equal(v.ok === true && v.campuri?.locker_city, "Cluj-Napoca");
  assert.equal(v.ok === true && v.campuri?.locker_county, "Cluj");
});

test("⚠ codul postal LIPSESTE cu totul cand punctul n-are unul", () => {
  /*
   * Nu e stil: Sameday, FAN, DPD si Cargus nu dau niciodata cod postal, iar GLS il CERE la emitere.
   * Cheia prezenta si goala si cheia lipsa se citesc diferit de cine scrie eticheta.
   */
  const v = punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242",
    token: tokenSameday({ postCode: "" }), plan: PLAN_GOL,
  });
  assert.ok(v.ok === true && v.campuri);
  assert.equal(v.ok === true && "locker_post_code" in (v.campuri ?? {}), false);
});

/* ── 3. Ce se refuza, si cu ce motiv ──────────────────────────────────────── */

/** Motivul refuzului, sau `null`. O SINGURA chemare, pastrata: vezi nota din proba temeliei. */
function motivul(v: ReturnType<typeof punctulDePeComanda>): string | null {
  return v.ok ? null : v.motiv;
}

test("⚠⚠ tokenul LIPSA se refuza, nu cade inapoi pe campurile din cerere", () => {
  /*
   * ⚠ AFIRMATIA CARE TINE TOATA POARTA IN PICIOARE.
   *
   * Daca lipsa tokenului ar cadea bland pe campurile browserului, oricine vrea vechea purtare n-ar
   * avea decat sa nu trimita tokenul, si toata lucrarea ar fi fost decor. Purtarea blanda e
   * potrivita la cotatie, unde refuzul omoara vanzarea; aici leacul cumparatorului e o singura
   * apasare, isi alege din nou punctul.
   */
  assert.equal(motivul(punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242", token: undefined, plan: PLAN_GOL,
  })), "lipsa");
});

test("⚠⚠ un punct al altui MAGAZIN nu trece", () => {
  assert.equal(motivul(punctulDePeComanda({
    businessId: "b7a9c3d1-0000-4000-8000-000000000002", curier: "sameday", lockerId: "4242",
    token: tokenSameday(), plan: PLAN_GOL,
  })), "semnatura");
});

test("⚠⚠ un punct al altui CURIER nu trece", () => {
  /* Un id de easybox intr-un AWB DPD e chiar defectul: alt nomenclator, alt spatiu de id-uri. */
  assert.equal(motivul(punctulDePeComanda({
    businessId: MAGAZIN, curier: "dpd", lockerId: "4242", token: tokenSameday(), plan: PLAN_GOL,
  })), "semnatura");
});

test("⚠⚠ un punct FAN dintr-o RETEA nu trece drept punct din alta", () => {
  /*
   * La FAN acelasi `locker_id` poate fi FANbox, PayPoint sau oficiu, iar cele trei se emit cu
   * servicii diferite. Fara reteaua in semnatura, un PayPoint ar fi plecat ca FANbox.
   */
  const tokenPayPoint = semneazaPunctul(
    { businessId: MAGAZIN, curier: "fan-courier", retea: "paypoint" }, PUNCT, EXPIRA,
  );
  assert.equal(motivul(punctulDePeComanda({
    businessId: MAGAZIN, curier: "fan-courier", lockerId: "4242", token: tokenPayPoint,
    plan: { fanPointType: "fanbox" },
  })), "semnatura");
  /* Perechea: cu reteaua LUI, acelasi token trece. Altfel afirmatia de sus ar trece si pe un cod
     care refuza orice. */
  assert.equal(punctulDePeComanda({
    businessId: MAGAZIN, curier: "fan-courier", lockerId: "4242", token: tokenPayPoint,
    plan: { fanPointType: "paypoint" },
  }).ok, true);
});

test("⚠ fisa rescrisa de mana nu mai bate", () => {
  const t = tokenSameday();
  const [, expira, mac] = t.split(".");
  const altaFisa = Buffer.from(JSON.stringify({ ...PUNCT, city: "Cluj-Napoca" }), "utf8").toString("base64url");
  assert.equal(motivul(punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242", token: `${altaFisa}.${expira}.${mac}`, plan: PLAN_GOL,
  })), "semnatura");
});

test("⚠ un punct expirat cade pe `expirat`, si primeste ALT mesaj", () => {
  /*
   * Motivul conteaza fiindca mesajul urmeaza cauza: omului caruia i-a expirat alegerea i se spune
   * ca a expirat, nu ca „ceva nu s-a putut confirma". Cu un singur mesaj ar fi crezut ca e stricat
   * si ar fi plecat.
   */
  const v = punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242",
    token: tokenSameday({}, Date.now() - 1000), plan: PLAN_GOL,
  });
  assert.equal(motivul(v), "expirat");
  const vLipsa = punctulDePeComanda({
    businessId: MAGAZIN, curier: "sameday", lockerId: "4242", token: undefined, plan: PLAN_GOL,
  });
  assert.notEqual(v.ok === false && v.mesaj, vLipsa.ok === false && vLipsa.mesaj);
});

test("⚠ fiecare refuz ii spune omului ce sa FACA", () => {
  /*
   * Un mesaj fara indemn e o fundatura: cumparatorul a platit atentie pana aici si nu stie ce sa
   * apese. Amandoua textele trebuie sa-l trimita inapoi la alegerea punctului.
   */
  for (const token of [undefined, "stricat", `${tokenSameday()}.inca-o-bucata`]) {
    const v = punctulDePeComanda({ businessId: MAGAZIN, curier: "sameday", lockerId: "4242", token, plan: PLAN_GOL });
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.mesaj : "", /alege din nou punctul/i);
  }
});

/* ── 4. Cablarea: doua copii peste tot, numarate ──────────────────────────── */

/**
 * Sursa unui fisier, cu CRLF scos.
 *
 * ⚠ `order.actions.ts` e unul din cele DOUASPREZECE fisiere CRLF ale depozitului (fata de 2.119
 * LF). Un tipar scris cu `\n` care trece peste un rand nu l-ar potrivi, iar proba ar cadea pe cod
 * bun fara ca nimeni sa inteleaga de ce.
 */
function sursa(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
}

const COMENZI = "src/lib/actions/order.actions.ts";
const SELECTOR = "src/components/ministore/CourierSelector.tsx";
const CHECKOUTURI = [
  "src/components/ministore/OrderModal.tsx",
  "src/components/storefront/sections/checkout/checkout-core.ts",
];

test("⚠⚠ tokenul calatoreste pe AMANDOUA checkout-urile, nu doar pe unul", () => {
  /*
   * Incarcatura se construieste in DOUA fisiere aproape identice, fara niciun tip comun care sa le
   * lege: un camp adaugat intr-unul singur compileaza curat si merge pentru jumatate dintre
   * cumparatori. Cealalta jumatate ar fi refuzata la punct, dupa ce a completat tot formularul.
   */
  for (const fisier of CHECKOUTURI) {
    assert.match(sursa(fisier), /locker_token: courierSelection\?\.lockerToken,/,
      `${fisier} NU trimite fisa semnata a punctului: jumatate din cumparatori ar fi refuzati la punct`);
  }

  /*
   * ⚠⚠ SI LOCUL DE UNDE PORNESTE TOKENUL, care lipsea din plasa asta.
   *
   * Cele doua checkout-uri duc mai departe `courierSelection.lockerToken`, dar el intra in selectie
   * intr-un singur loc: la alegerea punctului, in selector. Masurat cu mutant: sters randul acela,
   * campul ramane `undefined`, amandoua checkout-urile trimit `locker_token: undefined` si FIECARE
   * comanda la punct, pe AMANDOUA drumurile, cade cu motivul „lipsa". Si totusi treceau toate cele
   * 18 afirmatii ale fisierului, si toate cele 302 din `src/lib/shipping`.
   *
   * ⚠ Nici `tsc` nu-l apara: `lockerToken` e optional, deci lipsa lui compileaza curat. Conventia
   * exista deja la vecin, unde `punctele-fan-sunt-trei-retele.test.ts` scaneaza selectorul si cere
   * `fanPointType: opt.fanPointType,` tocmai ca sa apere acelasi drum. Tokenul era singurul lasat
   * fara ea.
   */
  assert.match(sursa(SELECTOR), /lockerToken: locker\.token,/,
    "selectorul nu mai pune fisa semnata in selectie: fiecare comanda la punct ar fi refuzata cu „lipsa\"");
});

test("⚠⚠ poarta sta pe AMANDOUA drumurile de plasare, si INAINTEA scrierii", () => {
  /*
   * Se numara, nu se cauta „macar una": o plasa care cere macar o aparitie nu cade cand a doua
   * dispare, iar aici a doua e jumatate din comenzi.
   *
   * ⚠ Si se cere ORDINEA: verificarea inaintea scrierii. Asezata dupa, comanda s-ar fi scris cu
   * punctul din cerere si abia apoi ar fi fost refuzata, adica exact defectul, plus un rand mort.
   */
  const s = sursa(COMENZI);
  const porti = [...s.matchAll(/const punctAles = punctulDePeComanda\(\{/g)].map((m) => m.index ?? -1);
  assert.equal(porti.length, 2, `poarta punctului sta pe ${porti.length} din 2 drumuri de plasare`);

  const scrieri = [...s.matchAll(/\.\.\.\(punctAles\.campuri \?\? \{\}\),/g)].map((m) => m.index ?? -1);
  assert.equal(scrieri.length, 2, `punctul se scrie canonic pe ${scrieri.length} din 2 drumuri`);

  for (let i = 0; i < 2; i++) {
    assert.ok(porti[i] < scrieri[i], `pe drumul ${i + 1} scrierea sta INAINTEA verificarii`);
  }
});

test("⚠⚠ semnarea si verificarea folosesc ACEEASI regula de retea", () => {
  /*
   * ⚠ MUTANTUL TREBUIE PUS PE APELANT, NU PE REGULA. O regula gresita, folosita la fel la
   * amandoua capetele, ar fi trecut orice proba dus-intors: se semneaza si se verifica cu acelasi
   * sir, deci tokenul bate oricum. Ce cade abia atunci e cablarea: un capat care isi scrie singur
   * reteaua, cu o literala sau cu argumentul brut.
   *
   * De aceea aici se cere, pe SURSA, ca fiecare capat sa cheme chiar ajutorul comun.
   */
  assert.match(
    sursa("src/lib/actions/shipping.actions.ts"),
    /retea: reteauaPunctului\(courier, retea\)/,
    "semnarea din getLockers nu mai trece reteaua prin regula comuna: la UPS ar semna judetul cumparatorului",
  );
  assert.match(
    sursa("src/lib/shipping/punctul-de-pe-comanda.ts"),
    /retea: reteauaDinPlan\(/,
    "verificarea nu mai scoate reteaua din planul semnat: ar lua-o din cererea browserului",
  );
});
