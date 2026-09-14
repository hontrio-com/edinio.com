import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amprentaConfigului, cheiaLockerelor } from "./cheia-lockerelor";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CHEIA CACHE-ULUI DE LOCKERE SE SCHIMBA LA ROTATIA CONTULUI    (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lista de lockere se tine zece minute in memoria instantei. Pana azi cheia nu cuprindea nimic din
 * configul curierului, deci comerciantul care isi schimba contul primea zece minute lista veche,
 * adusa cu creditele contului vechi.
 *
 * ⚠ SI NU EXISTA STERGERE CARE SA-L AJUTE: `CacheScurt` e PER INSTANTA. O golire la salvarea
 * setarilor ar fi curatat o singura instanta din cate sunt calde. De aceea leacul e in CHEIE.
 *
 * Proba are doua jumatati, si amandoua trebuie sa existe:
 *
 *   * REGULA, pura: amprenta intra in cheie si se schimba la ORICE schimbare de config, oricat de
 *     adanca, fara sa duca vreodata secretul in cheie;
 *   * ORDINEA din apelant: curierul necunoscut se refuza inaintea oricarei citiri, setarile se
 *     citesc inaintea cheii, iar plafonul durabil ramane SUB cache. Fara jumatatea asta, cineva ar
 *     putea muta citirea deasupra pazei si nicio proba n-ar cadea.
 */

const CONFIG = {
  sameday_config: { username: "magazin", password: "parola-veche-secreta" },
  ups_config: { clientId: "abc", clientSecret: "taina-ups" },
  fan_courier_config: null,
};

type Argumente = Parameters<typeof cheiaLockerelor>[0];

function cheia(peste: Partial<Argumente> = {}): string {
  return cheiaLockerelor({
    businessId: "biz-1",
    curier: "sameday",
    esteRamburs: false,
    discriminant: "",
    config: CONFIG,
    ...peste,
  });
}

// ─── Regula ──────────────────────────────────────────────────────────────────

test("acelasi config da aceeasi cheie", () => {
  assert.equal(cheia(), cheia(), "cheia nu e stabila, deci cache-ul n-ar nimeri niciodata");
});

test("⚠⚠ o parola rotita ADANC in config schimba cheia", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CARE APARA TOATA REPARATIA.
   *
   * `JSON.stringify(config, Object.keys(config))` arata ca o curatenie inofensiva si pare sa faca
   * acelasi lucru. Dar al doilea argument filtreaza si IN ADANCIME: ar taia chiar `username` si
   * `password` dinauntrul configurilor, amprenta ar iesi identica, si reparatia ar fi decor exact
   * la rotatia pe care trebuie s-o prinda.
   */
  const rotit = {
    ...CONFIG,
    sameday_config: { username: "magazin", password: "parola-NOUA-secreta" },
  };
  assert.notEqual(
    cheia(),
    cheia({ config: rotit }),
    "contul rotit citeste de la aceeasi cheie: zece minute de lista adusa cu creditele contului vechi",
  );
});

test("⚠ un camp de config NOU schimba si el cheia", () => {
  /*
   * Amprenta se ia pe INTREGUL rand, nu pe campul curierului cerut. Afirmatia asta apara alegerea
   * de maine: cine ar inlocui amprenta cu o harta curier -> camp ar face-o sa cada aici. O harta ar
   * fi a doua sursa de adevar langa cele unsprezece ramuri care isi citesc fiecare configul, iar o
   * potrivire gresita ar fi luat amprenta ALTUI curier, tacut.
   */
  const cuAltCurier = { ...CONFIG, dpd_config: { user: "x" } };
  assert.notEqual(cheia(), cheia({ config: cuAltCurier }), "un config adaugat nu se vede in cheie");
});

test("⚠ secretul nu ajunge NICIODATA in cheie", () => {
  /*
   * Cheia sta in memoria instantei si poate ajunge intr-un jurnal de diagnostic. O parola de curier
   * n-are ce cauta acolo. Idiomul casei: sha256 taiat la 16 hex (`aboutyou/client.ts:113`).
   */
  const k = cheia();
  assert.ok(!k.includes("parola-veche-secreta"), "parola Sameday e chiar in cheia de cache");
  assert.ok(!k.includes("taina-ups"), "secretul UPS e chiar in cheia de cache");
});

test("amprenta e sha256 taiat la 16 hex", () => {
  assert.match(amprentaConfigului(CONFIG), /^[0-9a-f]{16}$/);
});

test("⚠ magazinul, curierul, rambursul si discriminantul raman fiecare in cheie", () => {
  /*
   * Egalitate pe numarul de chei distincte, nu „macar doua diferite": daca amprenta ar inghiti
   * vreuna dintre ele, doua cereri diferite ar imparti o intrare si cumparatorul ar primi lista
   * altcuiva. Cinci variante, cinci chei.
   */
  const distincte = new Set([
    cheia(),
    cheia({ businessId: "biz-2" }),
    cheia({ curier: "fan-courier" }),
    cheia({ esteRamburs: true }),
    cheia({ discriminant: ":fanbox" }),
  ]);
  assert.equal(distincte.size, 5, "doua cereri diferite impart o intrare de cache");
});

// ─── Ordinea din apelant ─────────────────────────────────────────────────────

const COTARE = "src/lib/actions/shipping.actions.ts";

/*
 * ⚠ CRLF SCOS, COMENTARIILE TAIATE SI CORPUL FELIAT. Toate trei obligatorii, masurate pe fisier.
 *
 * Depozitul e 100% CRLF, deci un tipar pe mai multe randuri scris cu `\n` nu potriveste.
 * `CURIERI_CU_LOCKERE` apare in TREI comentarii din alte functii, deci fara taiere ordinea s-ar
 * masura pe proza. Iar `consumaLimita` apare de trei ori INAINTEA lui `getLockers`, in alte functii:
 * fara feliere, `indexOf` l-ar gasi pe cel al vecinului si afirmatia ar cadea pe cod bun.
 */
function corpulLuiGetLockers(): string {
  const s = readFileSync(COTARE, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const start = s.indexOf("export async function getLockers(");
  assert.ok(start > 0, "nu mai gasesc getLockers in cotare");
  const dupa = s.indexOf("\nexport ", start + 1);
  return s.slice(start, dupa === -1 ? s.length : dupa);
}

test("⚠ curierul necunoscut se refuza INAINTEA citirii setarilor", () => {
  /*
   * `courier` vine de la client si e liber. Citirea urcata deasupra pazei ar fi insemnat ca un nume
   * inventat costa o interogare in baza, la nesfarsit, pe un drum unde plafonul durabil sta mai jos
   * dinadins: o amplificare fara plafon pe baza noastra, platita ca sa reparam altceva.
   */
  const c = corpulLuiGetLockers();
  const iPaza = c.indexOf("CURIERI_CU_LOCKERE.has(courier)");
  const iSetari = c.indexOf("CACHE_SETARI_LOCKERE.iaSau");
  assert.ok(iPaza > 0, "paza de curier necunoscut a disparut din getLockers");
  assert.ok(iSetari > 0, "nu mai gasesc citirea setarilor");
  assert.ok(iPaza < iSetari, "un curier inventat costa acum o citire in baza, fara niciun plafon");
});

test("⚠ setarile se citesc INAINTEA compunerii cheii", () => {
  const c = corpulLuiGetLockers();
  const iSetari = c.indexOf("CACHE_SETARI_LOCKERE.iaSau");
  const iCheie = c.indexOf("cheiaLockerelor({");
  assert.ok(iCheie > 0, "cheia nu se mai compune prin regula probata aici");
  assert.ok(iSetari < iCheie, "cheia se compune inainte sa existe configul din care isi ia amprenta");
});

test("⚠ cheia se compune INTR-UN SINGUR loc", () => {
  /*
   * Egalitate, nu „macar unul". O a doua compunere scrisa de mana ar fi putut sari amprenta, si
   * atunci o parte din citiri ar fi ramas pe cheia veche fara ca nimic sa cada.
   */
  const cate = (corpulLuiGetLockers().match(/cheiaLockerelor\(\{/g) ?? []).length;
  assert.equal(cate, 1, `cheia se compune in ${cate} locuri`);
});

test("⚠ cheia primeste configul ADEVARAT, nu un obiect gol", () => {
  const c = corpulLuiGetLockers();
  assert.match(
    c,
    /config: settings,/,
    "amprenta se ia pe altceva decat setarile citite: rotatia contului n-ar mai schimba cheia",
  );
});

test("⚠⚠ plafonul durabil ramane SUB cache", () => {
  /*
   * Proprietatea asta exista de dinainte si NU are voie sa se piarda la mutarea mea. Cache-ul se
   * consulta inaintea plafonului fiindca un raspuns care nu costa niciun apel platit n-are ce buget
   * sa consume; altfel cumparatorii cinstiti epuizeaza chiar ei contorul care apara apelul, si apoi
   * raman fara niciun locker de ales, tacut.
   */
  const c = corpulLuiGetLockers();
  const iCache = c.indexOf("CACHE_LOCKERE.get(cheieCache)");
  const iPlafon = c.indexOf("consumaLimita(");
  assert.ok(iCache > 0, "cache-ul nu mai e consultat in getLockers");
  assert.ok(iPlafon > 0, "nu mai gasesc plafonul durabil: proba n-are fata de ce compara");
  assert.ok(iCache < iPlafon, "plafonul a urcat deasupra cache-ului: traficul cinstit isi arde singur bugetul");
});
