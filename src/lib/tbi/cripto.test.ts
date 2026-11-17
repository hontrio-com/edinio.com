import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { cripteazaPentruTbi, descifreazaDeLaTbi, EroareCriptareTbi, normalizeazaBase64 } from "./cripto";
import { citesteVesteaTbi } from "./stari";

/*
 * Criptarea Fusion Pay: AES-256-CTR, cheia = sha256(cheia din email), IV de 16 octeti lipit in fata,
 * base64. Vectorii sunt CHIAR exemplele din documentatia publica tbi („API documentation - RO Fusion
 * Pay", 16.11.2026), cu cheia de TEST publicata langa ele: nu vreo cheie a unui comerciant.
 */
const V = JSON.parse(readFileSync(new URL("./vectori-fusion.test-date.json", import.meta.url), "utf8")) as {
  cheie: string; cerere: string; veste: string;
};

/** Algoritmul lor (`Cryptor.php::encryptString`), scris separat de al nostru, ca proba sa nu se verifice singura. */
function cripteazaCaEi(text: string, cheie: string): string {
  const iv = randomBytes(16);
  const c = createCipheriv("aes-256-ctr", createHash("sha256").update(cheie).digest(), iv);
  return Buffer.concat([iv, c.update(text, "utf8"), c.final()]).toString("base64");
}

describe("⚠⚠ exemplele din documentatia lor", () => {
  test("cererea-exemplu (RegisterApplication) se descifreaza exact in JSON-ul scris langa ea", () => {
    const j = JSON.parse(descifreazaDeLaTbi(V.cerere, V.cheie));
    assert.equal(j.orderid, "1");
    assert.equal(j.firstname, "Jane");
    assert.equal(j.lastname, "Doe");
    assert.equal(j.items.length, 2);
    assert.equal(j.items[1].sku, "MK8E3HC/A");
  });

  test("⚠ vestea-exemplu are pe fir ALTE nume decat JSON-ul din text, si se citeste", () => {
    const text = descifreazaDeLaTbi(V.veste, V.cheie);
    assert.match(text, /"order_id":"2371998"/);
    assert.match(text, /"status":0/);
    const v = citesteVesteaTbi(text);
    assert.ok(!("eroare" in v), "vestea reala nu se poate citi");
    assert.deepEqual(v, { orderId: "2371998", statusId: 0, mesaj: "Comanda anulata TBI", motiv: "", contract: "20266032281" });
  });
});

describe("dus-intors", () => {
  test("texte scurte, lungi si cu diacritice", () => {
    for (const text of ["{}", "a", "Șosete bărbătești, mărimea 42 ă î ș ț â", JSON.stringify({ x: "y".repeat(5000) })]) {
      assert.equal(descifreazaDeLaTbi(cripteazaPentruTbi(text, "cheie-proba"), "cheie-proba"), text);
    }
  });
  test("ce cripteaza ei se descifreaza la noi, si invers (acelasi format: iv || text, base64)", () => {
    assert.equal(descifreazaDeLaTbi(cripteazaCaEi('{"a":"ă"}', V.cheie), V.cheie), '{"a":"ă"}');
    const al_nostru = Buffer.from(cripteazaPentruTbi("salut", V.cheie), "base64");
    assert.equal(al_nostru.length, 16 + 5, "IV-ul de 16 octeti sta in fata textului");
  });
  test("IV-ul e nou la fiecare criptare: acelasi text nu da acelasi sir", () => {
    assert.notEqual(cripteazaPentruTbi("acelasi", "k"), cripteazaPentruTbi("acelasi", "k"));
  });
  test("nimic de criptat si cheia lipsa se refuza", () => {
    assert.throws(() => cripteazaPentruTbi("", "k"), EroareCriptareTbi);
    assert.throws(() => cripteazaPentruTbi("x", ""), EroareCriptareTbi);
  });
});

describe("⚠ descifrarea nu poate spune singura „cheie gresita”", () => {
  test("cu alta cheie iese gunoi: UTF-8 stricat se prinde aici, restul il prinde citirea vestii", () => {
    const criptat = cripteazaPentruTbi(JSON.stringify({ command: "update_status", order_id: "700000001", status: 1, message: "Plata TBI acceptata" }), "cheia-buna");
    let prins = false;
    try {
      const text = descifreazaDeLaTbi(criptat, "cheia-gresita");
      prins = "eroare" in citesteVesteaTbi(text);
    } catch (e) {
      prins = e instanceof EroareCriptareTbi;
    }
    assert.ok(prins, "o veste descifrata cu alta cheie a trecut drept buna");
  });
  test("o veste prea scurta sau care nu e base64 nu trece", () => {
    assert.throws(() => descifreazaDeLaTbi(Buffer.alloc(10).toString("base64"), "k"), EroareCriptareTbi);
    assert.throws(() => descifreazaDeLaTbi("nu e base64!!", "k"), EroareCriptareTbi);
    assert.throws(() => descifreazaDeLaTbi("", "k"), EroareCriptareTbi);
  });
});

test("⚠ un `+` la INCEPUTUL sau la CAPATUL vestii, devenit spatiu, nu se pierde (cadea ~1 din 64)", () => {
  /* Determinist: cazul gasit cand proba de mai jos cadea din cand in cand. */
  assert.equal(normalizeazaBase64(" Pys9M3 wrZh7EhfqLVg7ZQvW8nZFDCh1U0="), "+Pys9M3+wrZh7EhfqLVg7ZQvW8nZFDCh1U0=");
  assert.equal(normalizeazaBase64("abcd ab "), "abcd+ab+");
  /* Si cap la cap: se cauta o veste care incepe cu `+` (la ~1 din 64) si se descifreaza stricata. */
  let gasite = 0;
  for (let i = 0; i < 4000 && gasite < 3; i++) {
    const corect = cripteazaPentruTbi("text cu ă", "k");
    if (!corect.startsWith("+")) continue;
    gasite++;
    assert.equal(descifreazaDeLaTbi(corect.replace(/\+/g, " "), "k"), "text cu ă", corect);
  }
  assert.ok(gasite > 0, "n-am gasit nicio veste care incepe cu `+`: proba n-ar mai apara nimic");
});

test("⚠ base64 venit prin formular: „+” devenit spatiu, varianta URL-safe, randuri noi", () => {
  const corect = cripteazaPentruTbi("text cu ă", "k");
  const stricat = corect.replace(/\+/g, " ");
  assert.equal(descifreazaDeLaTbi(stricat, "k"), "text cu ă");
  assert.equal(normalizeazaBase64(corect.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), corect);
  assert.equal(normalizeazaBase64(`${corect.slice(0, 10)}\n${corect.slice(10)}`), corect);
});
