import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { signShippingQuote, verificaCotatia, semneazaOptiuni, amprentaPlanului } from "./quote-token";
import { planulPretins } from "./curierul-declarat";

/*
 * ⚠ Cheia proprie a fisierului. `secret()` din `quote-token.ts` ARUNCA fara cheie de pe
 * 15.09.2026, iar incarcatorul probelor nu aduce niciun `.env`. Fiecare fisier si-o pune pe a lui,
 * fiindca `node --test` ruleaza fiecare fisier in alt proces. Motivul intreg, masurat, e scris o
 * singura data, in `quote-token.test.ts`.
 */
process.env.SHIPPING_QUOTE_SECRET = "cheie-de-proba-planul-gol";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PLANUL GOL NU E JOCHER                                        (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Poarta de identitate a serviciului, pusa pe 14.09, se judeca doar cand tokenul PURTA un plan:
 * conditia avea si `ampPurtata !== ""`. Iar cotatiile fara plan nu sunt exceptia, sunt REGULA:
 * tariful fix de zona, curierul care n-a raspuns, plafonul de 25 de secunde si plafonul de cereri
 * produc toate optiuni fara niciun camp de serviciu. Pe fiecare din ele se putea adauga la comanda
 * un singur camp, `shipo_rate_id` sau `ups_service_code`, si trecea.
 *
 * ⚠ SI ACOPEREA TREI DIN CELE PATRU FORME, nu una. Forma de TREI bucati e cea implicita pentru
 * orice cotatie fara serviciu si fara ramburs, iar ramura ei nu citea niciodata planul pretins.
 * Inasprita doar forma de sase, atacatorul lua un token de trei bucati si trecea pe langa poarta.
 *
 * ⚠ DE CE E SIGURA COMPARATIA STRICTA, masurat si nu presupus: zero din 456 de comenzi din
 * productie poarta vreun camp de plan, iar `planulPretins` intoarce mereu un obiect ale carui
 * campuri sunt `undefined` cand browserul n-a primit niciun serviciu. Gol cu gol trece.
 */

const BIZ = "b7a9c3d1-0000-4000-8000-000000000001";
const DEST = { county: "Cluj", city: "Cluj-Napoca" };
const CARGUS = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", ramburs: false };
/** Ora fixa: altfel fiecare rulare ar semna alt token si nimic nu s-ar putea compara. */
const EXPIRA = 4_102_444_800_000;

const PLAN_INJECTAT = { shipoRateId: 205 };

/* ── 1. Forma de TREI bucati, cea implicita si cea mai larg deschisa ──────── */

test("⚠⚠ token de TREI bucati: un serviciu declarat peste o cotatie fara serviciu REFUZA", () => {
  /*
   * ⚠ AFIRMATIA PENTRU CARE EXISTA FISIERUL.
   *
   * Pana pe 15.09 ramura de trei bucati nu citea deloc `planPretins` si nu putea intoarce motivul
   * `plan`. Cum ea e forma implicita a oricarei cotatii fara plan si fara ramburs, gaura statea
   * larg deschisa chiar pe drumul cel mai obisnuit.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA);
  assert.equal(t.split(".").length, 3, "premisa s-a schimbat: forma implicita nu mai are trei bucati");
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN_INJECTAT);
  assert.equal(v.ok, false, "serviciul injectat a trecut pe forma de trei bucati");
  assert.equal(v.ok === false && v.motiv, "plan",
    "a cazut ca `semnatura`, deci comanda ar fi intrat pe tarif in loc sa fie refuzata");
});

test("⚠ si aceeasi comanda, CINSTITA, trece mai departe", () => {
  /* Fara jumatatea asta, reparatia ar fi taiat fiecare comanda simpla la adresa. */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA);
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, {}).ok, true,
    "o comanda fara niciun serviciu declarat a fost refuzata");
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, { shipoRateId: null }).ok, true,
    "browserul care trimite `null` in loc de nimic a fost refuzat");
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS).ok, true,
    "apelantul care NU poate spune planul (recotarea din panou) a fost refuzat");
});

test("⚠ token de DOUA bucati, cel mai vechi, la fel", () => {
  /* Se compune cu semnatura veche, nu prin functia de azi: altfel proba s-ar muta odata cu codul. */
  const amprentaVeche = [
    BIZ, "cluj", "cluj-napoca", "ro", "", "1800", "cargus", "address", "livrare prin cargus", "platit",
  ].join("|");
  const mac = createHmac("sha256", process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    .update(`${amprentaVeche}|${EXPIRA}`)
    .digest("base64url");
  const t = `${EXPIRA}.${mac}`;
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, {}).ok, true,
    "premisa s-a schimbat: tokenul vechi compus de mana nu mai e valid");
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN_INJECTAT);
  assert.equal(v.ok === false && v.motiv, "plan", "forma cea mai veche a ramas jocher");
});

/* ── 1b. MATRICEA: toate cele PATRU forme acceptate, nu doar cele emise azi ─ */

/**
 * Compune de mana un token de CINCI bucati, forma pe care `signShippingQuote` nu o mai emite.
 *
 * ⚠ DE CE E NEVOIE DE EL, si de ce lipsa lui a fost o gaura adevarata: `verificaCotatia` accepta
 * patru forme, dar probele acopereau trei. Un audit extern a rulat toate patru si a gasit ca 5
 * accepta planul injectat. Comentariul probei mele spunea „patru forme"; afirmatiile ei spuneau trei.
 */
function tokenDeCinci(ampPlan: string): string {
  const amprentaVeche = [
    BIZ, "cluj", "cluj-napoca", "ro", "", "1800", "cargus", "address", "livrare prin cargus", "platit",
  ].join("|");
  const cheie = process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const mac = createHmac("sha256", cheie)
    .update(`${amprentaVeche}|1000|7700|${ampPlan}|${EXPIRA}`)
    .digest("base64url");
  return `${EXPIRA}.1000.7700.${ampPlan || "-"}.${mac}`;
}

test("⚠⚠ MATRICEA celor patru forme: niciuna nu mai e jocher", () => {
  /*
   * ⚠ AFIRMATIA CARE INCHIDE CONSTATAREA, si care lipsea. Fiecare forma acceptata de validator,
   * cu acelasi plan injectat peste o cotatie fara serviciu. Toate patru trebuie sa refuze cu `plan`.
   */
  const doua = (() => {
    const amprentaVeche = [
      BIZ, "cluj", "cluj-napoca", "ro", "", "1800", "cargus", "address", "livrare prin cargus", "platit",
    ].join("|");
    const cheie = process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const mac = createHmac("sha256", cheie).update(`${amprentaVeche}|${EXPIRA}`).digest("base64url");
    return `${EXPIRA}.${mac}`;
  })();

  const forme: Array<[string, string]> = [
    ["doua bucati", doua],
    ["trei bucati", signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA)],
    ["cinci bucati", tokenDeCinci("")],
    ["sase bucati", signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 7_700)],
  ];

  for (const [nume, t] of forme) {
    const bucati = t.split(".").length;
    /* Intai premisa: tokenul chiar e valid in forma lui, altfel proba ar trece degeaba. */
    assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, {}).ok, true,
      `${nume}: tokenul compus nu e valid, deci afirmatia de dedesubt n-ar dovedi nimic`);

    const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN_INJECTAT);
    assert.equal(v.ok, false, `${nume} (${bucati} bucati): serviciul injectat a trecut`);
    assert.equal(v.ok === false && v.motiv, "plan",
      `${nume} (${bucati} bucati): a cazut pe alt motiv decat \`plan\`, deci comanda nu se refuza`);
  }
});

test("⚠ si forma de cinci bucati care CHIAR a cotat un serviciu se poarta ca celelalte", () => {
  /* Planul potrivit trece, planul schimbat cade: poarta lucreaza, nu refuza la nimereala. */
  const amp = amprentaPlanului({ shipoRateId: 101 });
  const t = tokenDeCinci(amp);
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, { shipoRateId: 101 }).ok, true,
    "cinci bucati: serviciul cotat a fost refuzat");
  const v = verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, { shipoRateId: 205 });
  assert.equal(v.ok === false && v.motiv, "plan", "cinci bucati: serviciul schimbat a trecut");
});

/* ── 2. Usile prin care se ajunge la un token fara plan ───────────────────── */

test("⚠⚠ optiunea de REZERVA de dupa plafonul de timp nu mai e o portita", () => {
  /*
   * ⚠ CE PROBEAZA ASTA, si de ce nu e o repetare.
   *
   * Plasa de siguranta scrisa pe 13.09 fabrica, dupa 25 de secunde, o optiune cu EXACT patru
   * campuri: curier, eticheta, tip si pretul zonei. Niciun camp de serviciu. Semnata asa, ea
   * stingea chiar poarta pusa a doua zi: tokenul iesea cu amprenta de plan goala, deci serviciul
   * pretins nu se mai judeca deloc. O plasa de siguranta care dezarmeaza o poarta.
   *
   * Aici se cere forma EXACTA a optiunii fabricate, semnata prin chiar `semneazaOptiuni`.
   */
  const fabricata = { courier: "shipo", courierLabel: "Livrare prin Shipo", deliveryType: "address", price: 22 };
  const [semnata] = semneazaOptiuni(BIZ, DEST, false, 1000, [fabricata]);
  const optiune = { courier: "shipo", deliveryType: "address", courierLabel: "Livrare prin Shipo", ramburs: false };

  assert.equal(verificaCotatia(BIZ, DEST, 22, semnata.token, optiune, null, {}).ok, true,
    "o comanda cinstita pe optiunea de rezerva a fost refuzata");
  const v = verificaCotatia(BIZ, DEST, 22, semnata.token, optiune, null, PLAN_INJECTAT);
  assert.equal(v.ok === false && v.motiv, "plan",
    "optiunea de rezerva mai poate purta un serviciu injectat");
});

test("⚠ acelasi lucru pentru tariful fix de zona, care e regula la 19 magazine", () => {
  /*
   * Zona pe „Pret fix" si plafonul de cereri produc aceeasi forma de optiune ca rezerva de mai sus:
   * fara niciun camp de serviciu. Deci o singura regula inchide toate trei usile. Se cere aici, ca
   * sa nu ramana un rationament: plafonul de cereri NU s-a atins, si nici nu trebuia.
   */
  const fixa = { courier: "ups", courierLabel: "Livrare prin UPS", deliveryType: "address", price: 35 };
  const [semnata] = semneazaOptiuni(BIZ, DEST, false, 1000, [fixa]);
  const optiune = { courier: "ups", deliveryType: "address", courierLabel: "Livrare prin UPS", ramburs: false };
  const v = verificaCotatia(BIZ, DEST, 35, semnata.token, optiune, null, { upsServiceCode: "07" });
  assert.equal(v.ok === false && v.motiv, "plan", "tariful fix mai poate purta un serviciu injectat");
});

/* ── 3. Premisa pe care sta toata reparatia ───────────────────────────────── */

test("⚠⚠ PREMISA: browserul care n-a primit niciun serviciu pretinde o amprenta GOALA", () => {
  /*
   * ⚠ ASTA E RANDUL DE CARE ATARNA TOT, si e chiar premisa pe care nu am masurat-o cand am scris,
   * pe 14.09, o proba ce apara gaura. Daca `planulPretins` ar intoarce vreodata altceva decat un
   * obiect gol pentru o comanda fara serviciu, comparatia stricta ar incepe sa refuze comenzi
   * CINSTITE, si atunci ar cadea exact acele comenzi pe `max(suma ceruta, tarif implicit)`.
   */
  assert.equal(amprentaPlanului(planulPretins({})), "",
    "o comanda fara niciun camp de serviciu pretinde acum un plan NEVID: comenzile cinstite cad");
  assert.equal(amprentaPlanului(planulPretins({ shipo_rate_id: undefined })), "");
  /* Si invers: cine chiar declara un serviciu produce o amprenta nevida, altfel poarta e oarba. */
  assert.notEqual(amprentaPlanului(planulPretins({ shipo_rate_id: 205 })), "",
    "un serviciu declarat nu mai produce amprenta, deci poarta nu mai are ce compara");
});

test("⚠ si serviciul NESCHIMBAT trece, ca sa nu fi inchis poarta peste comenzile bune", () => {
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, { shipoRateId: 101 });
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, { shipoRateId: 101 }).ok, true,
    "o comanda care declara chiar serviciul cotat a fost refuzata");
  assert.equal(
    verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, { shipoRateId: 205 }).ok === false, true,
    "serviciul schimbat a trecut",
  );
});

/* ── 4. Cusatura: cele doua drumuri de checkout chiar trimit planul ───────── */

test("⚠⚠ amandoua drumurile de checkout trimit planul pretins la verificare", () => {
  /*
   * Regula de mai sus trece verde si daca maine cineva scoate argumentul din chemare: probele
   * isi construiesc singure amandoua capetele. Aici se cere CABLAREA.
   *
   * ⚠ SI NU SE CERE „fiecare chemare", desi asa ar parea mai strans. `order.actions.ts` are TREI
   * chemari, iar a treia, recotarea din panou (`semnaturaBuna`), nu trimite plan DINADINS: acolo
   * planul nu se poate reconstitui, si chiar `verificaCotatia` scrie ca `undefined` inseamna
   * „n-am de unde sti". O afirmatie pe toate trei ar fi cazut pe cod BUN, si atunci tentatia ar fi
   * fost s-o slabesc in loc s-o inteleg.
   */
  const s = readFileSync("src/lib/actions/order.actions.ts", "utf8").replace(/\r\n/g, "\n");

  assert.match(s, /businessId, dest, 0, token, optiune, grameComandate, planPretins, "ia-l-pe-cel-purtat"/,
    "drumul GRATUIT nu mai trimite planul pretins");
  assert.match(s, /verificaCotatia\(businessId, dest, claimed, token, optiune, grameComandate, planPretins\)/,
    "drumul PLATIT nu mai trimite planul pretins");

  /* Si ca planul chiar se aduna din ce sustine browserul, nu se inventeaza pe loc. */
  assert.match(s, /planulPretins\(data\)/, "planul pretins nu mai vine din `planulPretins(data)`");
});
