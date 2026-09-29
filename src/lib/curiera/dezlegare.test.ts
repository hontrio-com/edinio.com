import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { awbLamuritDupaReferinta, hotarareaDezlegarii } from "./dezlegare";

const AWB = "710915533";
const SEMN_LUNG = String.fromCharCode(0x2014);

describe("dezlegarea: cand se scoate AWB-ul de pe comanda", () => {
  test("anulat, deja anulat sau negasit: se dezleaga, la ei nu mai e nimic viu", () => {
    for (const fel of ["anulat", "deja_anulat", "negasit"] as const) {
      const h = hotarareaDezlegarii(AWB, { fel: "raspuns", rezultat: { fel } });
      assert.equal(h.dezleaga, true, fel);
      assert.ok(h.dezleaga && h.anulatLaCuriera, `${fel}: coletul a incetat sa existe la ei`);
      assert.ok(h.dezleaga && h.despreCurier.includes(AWB), `${fel}: mesajul numeste AWB-ul`);
    }
  });

  test("⚠ refuzat (colet deja ridicat): se dezleaga, dar mesajul spune ca AWB-ul ramane VIU", () => {
    const h = hotarareaDezlegarii(AWB, { fel: "raspuns", rezultat: { fel: "refuzat", stare: "in_curs" } });
    assert.equal(h.dezleaga, true);
    assert.ok(h.dezleaga);
    assert.equal(h.anulatLaCuriera, false, "un colet in drum nu e anulat");
    assert.match(h.despreCurier, /ramane viu/);
    assert.match(h.despreCurier, /in_curs/, "omul trebuie sa vada de ce a refuzat");
  });

  test("⚠⚠ NU STIM: se OPRESTE, numarul ramane pe comanda", () => {
    const h = hotarareaDezlegarii(AWB, { fel: "eroare", verdict: "necunoscut", mesaj: "Curiera cancel: termen depasit." });
    assert.equal(h.dezleaga, false, "o dezlegare pe „nu stim” sterge singura urma a unui colet poate viu");
    assert.ok(!h.dezleaga && /NU a fost scos/.test(h.eroare));
    assert.ok(!h.dezleaga && h.eroare.includes("termen depasit"), "cauza trebuie sa ajunga la om");
  });

  test("eroare dovedita (cheie respinsa, citire picata dupa „forbidden”): se dezleaga, poate viu", () => {
    const h = hotarareaDezlegarii(AWB, { fel: "eroare", verdict: "esuat", mesaj: "Curiera a respins cheia API." });
    assert.equal(h.dezleaga, true);
    assert.ok(h.dezleaga && !h.anulatLaCuriera);
    assert.ok(h.dezleaga && /poate fi inca viu/.test(h.despreCurier));
  });

  test("fara cheie: se dezleaga, cu mesaj ca anularea nu s-a putut cere", () => {
    const h = hotarareaDezlegarii(AWB, { fel: "fara_config" });
    assert.equal(h.dezleaga, true, "un comerciant deconectat trebuie sa poata scoate numarul");
    assert.ok(h.dezleaga && !h.anulatLaCuriera);
    assert.ok(h.dezleaga && /nu s-a putut cere/.test(h.despreCurier));
  });

  test("niciun mesaj nu poarta semnul lung", () => {
    const toate = [
      hotarareaDezlegarii(AWB, { fel: "fara_config" }),
      hotarareaDezlegarii(AWB, { fel: "eroare", verdict: "necunoscut", mesaj: "x" }),
      hotarareaDezlegarii(AWB, { fel: "eroare", verdict: "esuat", mesaj: "x" }),
      hotarareaDezlegarii(AWB, { fel: "raspuns", rezultat: { fel: "refuzat", stare: "livrat" } }),
      ...(["anulat", "deja_anulat", "negasit"] as const)
        .map((fel) => hotarareaDezlegarii(AWB, { fel: "raspuns", rezultat: { fel } })),
    ];
    for (const h of toate) {
      const text = h.dezleaga ? h.despreCurier : h.eroare;
      assert.ok(!text.includes(SEMN_LUNG), text);
    }
  });
});

describe("lamurirea unui raspuns pierdut, dupa referinta", () => {
  test("exact un AWB viu NOU: e expedierea comenzii", () => {
    assert.equal(awbLamuritDupaReferinta([AWB], []), AWB);
    assert.equal(awbLamuritDupaReferinta([` ${AWB} `, AWB], []), AWB, "acelasi numar de doua ori e tot unul");
  });

  test("zero sau doua: nu stim, deci nimic", () => {
    assert.equal(awbLamuritDupaReferinta([], []), null);
    assert.equal(awbLamuritDupaReferinta([AWB, "710915548"], []), null);
    assert.equal(awbLamuritDupaReferinta(["", "  "], []), null);
  });

  test("⚠⚠ un AWB pe care comanda l-a mai purtat NU e expedierea noua", () => {
    /* Dezlegat dupa un refuz de anulare, el ramane viu la Curiera cu aceeasi referinta. Luat
       drept cel nou, comanda ar fi primit inapoi un colet deja plecat. */
    assert.equal(awbLamuritDupaReferinta([AWB], [AWB]), null);
    assert.equal(awbLamuritDupaReferinta([AWB, "710915600"], [AWB]), "710915600");
    assert.equal(awbLamuritDupaReferinta([AWB, "710915600"], [` ${AWB}`, ""]), "710915600");
  });

  test("o citire picata inseamna „nu stim”, nu „nimic de exclus”", () => {
    assert.equal(awbLamuritDupaReferinta(null, []), null);
    assert.equal(awbLamuritDupaReferinta([AWB], null), null, "fara lista veche, un AWB vechi ar trece drept nou");
  });
});

/* ═══ Ce scriu actiunile pe comanda ═══
 *
 * ⚠ Coloanele se iau din TIPURILE GENERATE, nu dintr-o lista scrisa aici: o coloana curiera_*
 * adaugata maine pe `orders` si uitata la dezlegare ar descrie un colet care nu mai e al
 * comenzii (o stare finala veche scoate coletul urmator din urmarire). Se verifica pe FIECARE
 * functie in parte, nu pe fisier.
 */

function coloaneleCuriera(): string[] {
  const tipuri = readFileSync("src/types/database.types.ts", "utf8");
  const iOrders = tipuri.indexOf("      orders: {");
  assert.ok(iOrders > 0, "blocul `orders` nu s-a gasit in tipuri");
  const bloc = tipuri.slice(iOrders, tipuri.indexOf("      Insert:", iOrders));
  return [...bloc.matchAll(/^\s+(curiera_\w+):/gm)].map((m) => m[1]);
}

function corpul(functie: string): string {
  const s = readFileSync("src/lib/actions/curiera.actions.ts", "utf8");
  const i = s.indexOf(`export async function ${functie}(`);
  assert.ok(i >= 0, `${functie} nu mai exista`);
  const sfarsit = s.indexOf("\n}", i);
  return s.slice(i, sfarsit === -1 ? s.length : sfarsit);
}

/** Obiectul dat lui `.update(` pe `orders`, din corpul unei functii. */
function scriereaPeComanda(corp: string): string {
  const i = corp.indexOf('from("orders").update({');
  assert.ok(i >= 0, "functia nu mai scrie pe comanda");
  return corp.slice(i, corp.indexOf("})", i));
}

describe("ce scriu actiunile pe comanda", () => {
  test("coloanele Curiera se gasesc in tipuri (proba nu merge pe gol)", () => {
    const c = coloaneleCuriera();
    assert.equal(c.length, 8, `am gasit ${c.length} coloane curiera_* pe orders: ${c.join(", ")}`);
    assert.ok(c.includes("curiera_awb_number"));
  });

  test("⚠ dezlegarea goleste TOATE coloanele coletului si filtreaza pe AWB-ul citit", () => {
    const corp = corpul("dezleagaCurieraAwbAction");
    const scriere = scriereaPeComanda(corp);
    for (const col of coloaneleCuriera()) {
      assert.match(scriere, new RegExp(`\\b${col}: null,`), `dezlegarea nu goleste ${col}`);
    }
    const lant = corp.slice(corp.indexOf('from("orders").update({'));
    assert.match(lant.slice(0, lant.indexOf(".select(")), /\.eq\("curiera_awb_number", /,
      "un AWB nou emis din alta fila ar fi sters de dezlegarea celui vechi");
    assert.ok(!corp.includes("configSiComanda("), "dezlegarea nu are voie sa ceara integrarea completa");
  });

  test("⚠ emiterea scrie numarul, ancora si referinta, si goleste starea coletului vechi", () => {
    const scriere = scriereaPeComanda(corpul("createCurieraAwbAction"));
    const scrise: Record<string, RegExp> = {
      curiera_awb_number: /\bcuriera_awb_number: awb,/,
      curiera_awb_at: /\bcuriera_awb_at: acum,/,
      curiera_reference: /\bcuriera_reference: referinta,/,
    };
    for (const col of coloaneleCuriera()) {
      assert.match(scriere, scrise[col] ?? new RegExp(`\\b${col}: null,`), `emiterea nu trateaza ${col}`);
    }
  });
});
