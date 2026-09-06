import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { planulRedenumirii, type LegaturaRand } from "./redenumire";

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(): string {
  return readFileSync(
    path.resolve(process.cwd(), "src/lib/configurators/redenumire.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

const l = (id: string, configurator_id: string, categorie: string): LegaturaRand =>
  ({ id, configurator_id, categorie });

test("redenumirea MUTA legatura pe numele nou", () => {
  const plan = planulRedenumirii([l("r1", "cfg", "Rochii")], "Rochii", "Rochii de seara");
  assert.deepEqual(plan, { deMutat: ["r1"], deSters: [] });
});

test("legaturile altor categorii nu se ating", () => {
  const legaturi = [l("r1", "cfg", "Rochii"), l("r2", "cfg", "Fuste"), l("r3", "alt", "Camasi")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Rochii de seara");
  assert.deepEqual(plan, { deMutat: ["r1"], deSters: [] });
});

test("mai multe configuratoare pe acelasi nume se muta toate", () => {
  const legaturi = [l("r1", "cfgA", "Rochii"), l("r2", "cfgB", "Rochii")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Rochii lungi");
  assert.deepEqual(plan, { deMutat: ["r1", "r2"], deSters: [] });
});

test("CIOCNIREA se rezolva stergand, nu mutand", () => {
  /*
   * Acelasi configurator legat si de „Rochii" si de „Femei", iar „Rochii" se redenumeste in
   * „Femei". Mutat, randul ar fi calcat unicitatea si scrierea ar fi picat CU TOTUL — adica si
   * mutarile bune din acelasi lot. Perechea catre care s-ar fi mutat exista deja si acopera
   * exact acelasi lucru.
   */
  const legaturi = [l("r1", "cfg", "Rochii"), l("r2", "cfg", "Femei")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Femei");
  assert.deepEqual(plan, { deMutat: [], deSters: ["r1"] });
});

test("ciocnirea e pe CONFIGURATOR, nu pe magazin", () => {
  // Alt configurator legat de „Femei" nu impiedica mutarea legaturii primului.
  const legaturi = [l("r1", "cfgA", "Rochii"), l("r2", "cfgB", "Femei")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Femei");
  assert.deepEqual(plan, { deMutat: ["r1"], deSters: [] });
});

test("STERGEREA categoriei sterge legatura, NU o urca la parinte", () => {
  /*
   * ⚠ Produsele urca la parinte cand categoria lor se sterge. Legatura NU urca odata cu ele:
   * mutata pe parinte, configuratorul s-ar fi intins peste toti fratii, si produse care nu l-au
   * avut niciodata ar fi devenit deodata configurabile, cu alt pret.
   */
  const plan = planulRedenumirii([l("r1", "cfg", "Rochii")], "Rochii", null);
  assert.deepEqual(plan, { deMutat: [], deSters: ["r1"] });
});

test("un nume redenumit in el insusi nu misca nimic", () => {
  assert.deepEqual(planulRedenumirii([l("r1", "cfg", "Rochii")], "Rochii", "Rochii"),
    { deMutat: [], deSters: [] });
});

test("fara nume vechi nu se atinge nimic", () => {
  // ⚠ Cu un nume vechi gol, un plan lacom ar fi maturat legaturile fara categorie din baza.
  assert.deepEqual(planulRedenumirii([l("r1", "cfg", "")], "", "Ceva"), { deMutat: [], deSters: [] });
});

test("liste goale sau lipsa nu arunca", () => {
  assert.deepEqual(planulRedenumirii([], "Rochii", "Fuste"), { deMutat: [], deSters: [] });
});

test("un nume care nu apare in legaturi nu produce nimic de scris", () => {
  const plan = planulRedenumirii([l("r1", "cfg", "Camasi")], "Rochii", "Fuste");
  assert.deepEqual(plan, { deMutat: [], deSters: [] });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Stergerea unei ramuri: un lot, nu o bucla
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Probele de mai sus tin PLANUL, care e curat. Cele de aici tin DRUMUL catre baza, si el nu se
 * poate rula fara baza — deci se citeste sursa. Ce apara sunt trei feluri in care drumul asta a
 * fost sau ar redeveni gresit, si niciunul nu s-ar vedea din plan.
 */

test("⚠ stergerea ramurii NU mai cheama functia de redenumire pe rand", () => {
  /*
   * ⚠ Asa era: o chemare pe nume, fiecare cu clientul ei, o citire si pana la doua scrieri. Pe
   * cel mai mare magazin de azi (145 de categorii) ieseau pana la 435 de dus-intorsuri intr-o
   * singura apasare, in cererea actiunii — adica exact forma care cade pe timeout, cu categoria
   * deja stearsa si legaturile ramase pe nume moarte.
   */
  const s = sursa();
  const i = s.indexOf("export async function legaturileUitaCategoriile");
  assert.ok(i > 0, "functia lipseste");
  const corp = s.slice(i);
  assert.equal(
    corp.includes("legaturileUrmeazaCategoria("),
    false,
    "stergerea ramurii s-a intors la o chemare pe fiecare nume",
  );
  assert.match(corp, /for \(let i = 0; i < nume\.length; i \+= NUME_PE_LOT\)/, "nu se mai lucreaza pe loturi");
});

test("⚠ stergerea CARA amandoua filtrele", () => {
  /*
   * ⚠ ASTA E CEA MAI SCUMPA DIN FISIER. `.delete()` fara `business_id` sterge legaturile TUTUROR
   * magazinelor care au o categorie cu acelasi nume — si „Accesorii" sau „Diverse" se poarta pe
   * zeci de magazine. Cheia de aici e a panoului si trece prin RLS, deci paguba s-ar opri la
   * magazinul curent; dar RLS-ul e a doua incuietoare, nu prima, si proiectul are deja un
   * incident cu un `delete` fara `where` cazut tacut dintr-un cron.
   */
  const s = sursa();
  const i = s.indexOf("export async function legaturileUitaCategoriile");
  const corp = s.slice(i);
  assert.match(
    corp,
    /\.delete\(\)\s*\n\s*\.eq\("business_id", businessId\)\s*\n\s*\.in\("categorie", lot\)/,
    "stergerea nu mai e ingradita si de magazin, si de numele cerute",
  );
});

test("⚠ lista NU se mai taie in tacere", () => {
  /*
   * ⚠ Vechiul `.slice(0, 500)` nu era o limita a bazei, ci un plafon impotriva timeout-ului. Peste
   * el, legaturile ramaneau pe nume moarte fara ca cineva sa afle — chiar paguba pe care fisierul
   * asta o repara. Loturile il fac de prisos: 500 de nume sunt cinci cereri.
   */
  const s = sursa();
  const i = s.indexOf("export async function legaturileUitaCategoriile");
  const corp = s.slice(i);
  assert.equal(/\.slice\(0, \d+\)/.test(corp), false, "lista disparutelor se taie iar in tacere");
  /* Si ca lotul e mai mic decat cele 200 de id-uri obisnuite: aici valorile sunt nume, nu uuid-uri. */
  assert.match(s, /const NUME_PE_LOT = (\d{1,3});/, "marimea lotului nu mai e numita");
  const marime = Number(/const NUME_PE_LOT = (\d{1,3});/.exec(s)![1]);
  assert.ok(marime > 0 && marime <= 200, `lot de ${marime} nume; filtrul pleaca in ADRESA`);
});

test("⚠ se spune CATE legaturi s-au sters", () => {
  /*
   * ⚠ Fara `.select("id")` pe stergere, PostgREST nu intoarce randurile si jurnalul n-ar avea ce
   * numara. Iar jurnalul e singurul loc din care comerciantul poate afla ca un configurator nu se
   * mai aplica: pe ecran, stergerea categoriei arata la fel oricum.
   */
  const s = sursa();
  const i = s.indexOf("export async function legaturileUitaCategoriile");
  const corp = s.slice(i);
  assert.match(corp, /\.select\("id"\);/, "stergerea nu mai cere inapoi ce a sters");
  assert.match(corp, /sterse \+= \(data \?\? \[\]\)\.length;/);
  assert.match(corp, /action: "configurator\.redenumire\.legaturiSterse"/, "nu se mai jurnalizeaza");
});
