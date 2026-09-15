import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { signShippingQuote, verificaCotatia } from "./quote-token";

/*
 * ⚠ Cheia proprie a fisierului. `secret()` din `quote-token.ts` ARUNCA fara cheie de pe
 * 15.09.2026, iar incarcatorul probelor nu aduce niciun `.env`. Fiecare fisier si-o pune pe a lui,
 * fiindca `node --test` ruleaza fiecare fisier in alt proces. Motivul intreg, masurat, e scris o
 * singura data, in `quote-token.test.ts`.
 */
process.env.SHIPPING_QUOTE_SECRET = "cheie-de-proba-gratuit-verificat";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * GRATUIT NU INSEAMNA NEVERIFICAT                               (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pe drumul livrarii gratuite `autoritativeShipping` taia scurt: `shipping: 0`, INAINTE de orice
 * verificare. Deci planul de expediere (serviciul, contractul, reteaua punctului) nu se judeca
 * deloc.
 *
 * ⚠ SI E O GAURA DE BANI, NU DE IDENTITATE. Cumparatorul plateste zero oricum; dar comerciantul
 * plateste curierului SERVICIUL SCRIS PE COMANDA. Cine primea cotatiile cinstit isi pastra tokenul
 * si schimba un singur camp (`shipo_rate_id`, `ups_service_code`) comanda un serviciu express la
 * pretul celui ieftin. Exact atacul descris in antetul lui `PlanExpedierii`, pe singurul drum unde
 * nimic nu-l oprea.
 *
 * ⚠ DE CE N-A PUTUT FI INCHISA PANA ACUM. Verificarea reface MAC-ul din pret, iar pe drumul asta
 * browserul trimite ZERO: pretul cotat al curierului nu mai exista nicaieri la plasarea comenzii.
 * De aceea tokenul poarta acum pretul in clar, sub semnatura, ca gramele si ca suma rambursului.
 */

const BIZ = "b7a9c3d1-0000-4000-8000-000000000001";
const DEST = { county: "Cluj", city: "Cluj-Napoca" };
const CARGUS = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", ramburs: false };
/** Ora fixa: altfel fiecare rulare ar semna alt token si nimic nu s-ar putea compara. */
const EXPIRA = 4_102_444_800_000;

const PLAN = { shipoRateId: 101 };
const PLAN_ALTUL = { shipoRateId: 205 };

/* ── 1. Regula: pretul purtat face verificarea cu putinta ─────────────────── */

test("⚠⚠ pe drumul GRATUIT, planul schimbat cade cu motivul `plan`", () => {
  /*
   * ⚠ ASTA E AFIRMATIA PENTRU CARE EXISTA TOT LOTUL.
   *
   * Pretul pretins e ZERO, ca in checkout cand pragul de livrare gratuita e atins. Fara pretul
   * purtat in token, MAC-ul nu s-ar fi putut reface si verdictul ar fi fost `semnatura`, adica
   * drumul BLAND, care lasa comanda sa intre. Cu el, falsificarea serviciului iese `plan`, care
   * REFUZA comanda si cere recotare.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN);
  const v = verificaCotatia(BIZ, DEST, 0, t, CARGUS, null, PLAN_ALTUL, "ia-l-pe-cel-purtat");
  assert.equal(v.ok, false, "serviciul schimbat a trecut pe drumul gratuit");
  assert.equal(v.ok === false && v.motiv, "plan",
    "a cazut ca `semnatura`, deci comanda ar fi intrat pe drumul bland in loc sa fie refuzata");
});

test("⚠ si planul NESCHIMBAT trece, tot cu pretul pretins zero", () => {
  /* Cealalta jumatate: fara ea, fiecare comanda gratuita CINSTITA ar fi fost refuzata. */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN);
  assert.equal(verificaCotatia(BIZ, DEST, 0, t, CARGUS, null, PLAN, "ia-l-pe-cel-purtat").ok, true,
    "o comanda gratuita cinstita a fost refuzata");
});

test("⚠⚠ PRETUL PURTAT E SUB SEMNATURA: rescris de mana, tokenul cade", () => {
  /*
   * Ca la grame si ca la suma: numarul calatoreste in clar ca verificarea sa aiba de unde-l lua,
   * dar e in MAC. Neacoperit, cine vrea sa scape de verificare ar rescrie pur si simplu cifra.
   *
   * ⚠ SI STIU EXACT CE ANUME IL LEAGA, fiindca am masurat: nu coada MAC-ului, ci `amprenta()`.
   * Scoasa coada la amandoua capetele, afirmatia asta a ramas VERDE: singurul mutant scapat din
   * zece. Nu e o gaura, e o a doua legare a aceluiasi numar; motivul pentru care coada ramane
   * totusi e scris in `quote-token.ts`, langa `pretBani`. Aici se noteaza ca sa nu para ca
   * afirmatia apara coada: ea apara PROPRIETATEA, si proprietatea chiar tine.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN);
  const [exp, g, bani, amp, , mac] = t.split(".");
  const rescris = `${exp}.${g}.${bani}.${amp}.1.${mac}`;
  const v = verificaCotatia(BIZ, DEST, 0, rescris, CARGUS, null, PLAN, "ia-l-pe-cel-purtat");
  assert.equal(v.ok, false, "un pret rescris de mana a trecut");
  assert.equal(v.ok === false && v.motiv, "semnatura");
});

test("⚠⚠ modul permisiv NU se poate capata din uitare", () => {
  /*
   * ⚠ DE CE E UN SIR, SI NU O CADERE PE `price === 0`.
   *
   * Daca verificarea ar fi luat pretul purtat ori de cate ori i se da zero, atunci oricine ar fi
   * trimis `shipping_cost: 0` pe drumul PLATIT ar fi ocolit verificarea pretului cu totul. Aici se
   * cere acelasi lucru, pe drumul strict: cu pretul pretins zero si FARA modul explicit, tokenul
   * cade pe semnatura.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA, 0, PLAN);
  const v = verificaCotatia(BIZ, DEST, 0, t, CARGUS, null, PLAN);
  assert.equal(v.ok, false, "pretul zero a trecut fara sa se ceara modul purtat");
  assert.equal(v.ok === false && v.motiv, "semnatura");
  /* Iar cu pretul ADEVARAT, aceeasi cotatie trece pe drumul strict, ca pana acum. */
  assert.equal(verificaCotatia(BIZ, DEST, 18, t, CARGUS, null, PLAN).ok, true);
});

test("⚠⚠ un token de forma VECHE nu refuza comanda gratuita", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA COMENZILE IN CURS.
   *
   * Un token traieste 24 de ore. In clipa desfasurarii, fiecare pagina de finalizare deschisa
   * poarta unul de forma veche, FARA pretul purtat. Pe el, verificarea pe drumul gratuit nu poate
   * bate. Daca apelantul ar refuza atunci comanda, ar cadea fiecare comanda gratuita aflata in
   * curs, la zece din cincisprezece magazine cu prag.
   *
   * Regula, scrisa si in apelant: se refuza DOAR pe `plan`. Aici se dovedeste ca forma veche
   * produce `semnatura`, nu `plan`, deci trece prin filtrul acela.
   */
  const t = signShippingQuote(BIZ, DEST, 18, CARGUS, 1000, EXPIRA);
  assert.equal(t.split(".").length, 3, "premisa s-a schimbat: forma veche nu mai are trei bucati");
  const v = verificaCotatia(BIZ, DEST, 0, t, CARGUS, null, PLAN, "ia-l-pe-cel-purtat");
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.motiv, "semnatura",
    "forma veche nu mai cade pe `semnatura`, deci comenzile gratuite in curs risca sa fie refuzate");
});

test("⚠ si tokenul de DOUA bucati, cel mai vechi, la fel", () => {
  /* Se compune cu semnatura veche, nu prin functia de azi: altfel proba s-ar muta odata cu codul. */
  const amprentaVeche = [
    BIZ, "cluj", "cluj-napoca", "ro", "", "1800", "cargus", "address", "livrare prin cargus", "platit",
  ].join("|");
  const mac = createHmac("sha256", process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    .update(`${amprentaVeche}|${EXPIRA}`)
    .digest("base64url");
  const v = verificaCotatia(BIZ, DEST, 0, `${EXPIRA}.${mac}`, CARGUS, null, PLAN, "ia-l-pe-cel-purtat");
  assert.equal(v.ok === false && v.motiv, "semnatura", "forma cea mai veche ar refuza comenzi gratuite");
});

/* ── 2. Cusatura: apelantul chiar judeca, si refuza DOAR pe plan ──────────── */

/*
 * ⚠ DE CE APELANTUL SE JUDECA PE SURSA, SI NU CHEMANDU-L.
 *
 * `autoritativeShipping` nu e exportata, iar fisierul ei e `"use server"`, unde un export de
 * VALOARE trebuie sa fie o functie async. Exportata ca s-o pot chema de aici, ar fi devenit o
 * actiune de server chemabila din browser: o poarta noua, deschisa ca sa poata fi probata poarta
 * veche. Nu merita.
 *
 * Deci regula se judeca pe purtare (partea 1, unde totul e chemabil), iar CABLAREA pe text. Atat
 * se poate masura de aici, si se masoara pe fata.
 */
const sursa = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * Ramura gratuita, de la `if` pana la PRIMA intoarcere cu transport zero.
 *
 * ⚠ TAIEREA PANA LA PRIMA E CHIAR PAZA. Mutantul de care ma tem nu e stergerea verificarii, ci un
 * `return { shipping: 0 }` strecurat INAINTEA ei, cu chemarea lasata dedesubt ca sa pareasca vie.
 * Exact forma prin care mi-a scapat un mutant la urmarire: afirmatia masura PREZENTA UNUI SIR in
 * fisier, nu un DRUM. Taiata la prima intoarcere, ramura aia iese goala si afirmatiile cad.
 */
function ramuraGratuita(): string {
  const s = sursa("src/lib/actions/order.actions.ts");
  const bucati = s.split("if (esteGratuit) {");
  assert.equal(bucati.length, 2, "nu mai e exact o singura ramura gratuita in fisier");
  const rest = bucati[1];
  const j = rest.indexOf("return { shipping: 0, rambursBaniSemnat: null };");
  assert.ok(j > 0, "ramura gratuita nu mai are intoarcerea cu transport zero");
  return rest.slice(0, j);
}

test("⚠⚠ ramura gratuita nu mai taie scurt", () => {
  /*
   * Regula pura de mai sus trece verde si daca `autoritativeShipping` s-ar intoarce maine la
   * `return { shipping: 0 }`: ea isi construieste singura amandoua capetele. Aici se cere CABLAREA.
   */
  assert.match(ramuraGratuita(),
    /verificaCotatia\(\s*businessId, dest, 0, token, optiune, grameComandate, planPretins, "ia-l-pe-cel-purtat",\s*\)/,
    "ramura gratuita nu cheama verificarea cu pretul purtat INAINTE de a se intoarce cu zero");
});

test("⚠⚠ si refuza DOAR pe `plan`, nimic altceva", () => {
  /*
   * ⚠ DIRECTIA E TOATA REGULA. Un refuz pe `semnatura` ar taia fiecare comanda gratuita aflata in
   * curs, fiindca tokenele vechi nu poarta pretul. Un refuz pe `greutate` ar fi si el gresit aici:
   * pe drumul gratuit transportul e zero oricum, deci nu se apara niciun ban.
   */
  const bloc = ramuraGratuita();
  assert.match(bloc, /verdictGratuit\.motiv === "plan"/, "refuzul nu mai e legat de motivul `plan`");
  assert.doesNotMatch(bloc, /motiv === "semnatura"|motiv === "greutate"/,
    "refuza si pe alt motiv: comenzile gratuite in curs ar cadea");
  /*
   * ⚠ SI NICIO PAZA STINSA CU O CONSTANTA.
   *
   * `if (false && verdictGratuit.ok === false && ...)` lasa tot textul cerut mai sus in fisier, deci
   * afirmatiile de dinainte trec toate, in timp ce refuzul e mort. Exact mutantul care mi-a scapat
   * odata la urmarire, si din aceeasi pricina: masurasem un SIR, nu un DRUM.
   */
  assert.doesNotMatch(bloc, /if \(\s*(?:false|true)\b/,
    "paza de pe drumul gratuit e stinsa cu o constanta, deci refuzul e cod mort");
});
