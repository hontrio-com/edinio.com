import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CALEA AUTOMATA NU MAI INGHITE DEFECTELE NOASTRE, LA NICIO CASA (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `maybeAutoGenerateInvoice` exista in TREI copii, una per casa de facturare, si e singura cale
 * de facturare FARA niciun om in fata. Pe celelalte, o eroare ajunge in interfata si comerciantul
 * apasa din nou; aici, comanda isi vede de drum si factura pur si simplu nu apare.
 *
 * ⚠⚠ Toate trei se incheiau cu `catch { return false; }`. `return false` e CORECT si ramane:
 * facturarea n-are voie sa rupa actualizarea comenzii. Ce lipsea era urma. Un `catch` fara corp
 * inghite si defectele NOASTRE (o coloana lipsa, un tip gresit, un `undefined` dereferentiat),
 * iar simptomul e identic cu al unui magazin care n-are facturare automata pornita: nimic.
 *
 * ⚠ Masurat pe 16.09.2026, si de asta stim ca nu e o grija teoretica: `error_logs` avea 2.071 de
 * randuri de la 45 de actiuni, si ZERO de la oricare dintre cele trei case, desi SmartBill emisese
 * 240 de facturi si avea un esec inregistrat in registru cu o zi inainte.
 *
 * ⚠ Proba e UNA SINGURA, peste toate trei, si nu in dosarul vreuneia: o regula care se aplica la
 * trei furnizori n-are ce cauta in fisierul unuia. Cade si daca apare a patra casa scrisa la fel.
 */

const CASE = [
  { nume: "SmartBill", cale: "src/lib/actions/smartbill.actions.ts" },
  { nume: "Oblio", cale: "src/lib/actions/oblio.actions.ts" },
  { nume: "fGO", cale: "src/lib/actions/fgo.actions.ts" },
] as const;

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Corpul lui `maybeAutoGenerateInvoice`, ca sa nu masuram pazele celorlalte cai. */
function caleaAutomata(cale: string): string {
  const s = viu(cale);
  const i = s.indexOf("export async function maybeAutoGenerateInvoice");
  assert.ok(i > 0, `${cale}: functia a disparut sau s-a redenumit`);
  const rest = s.slice(i);
  const j = rest.indexOf("\nexport ", 1);
  return j > 0 ? rest.slice(0, j) : rest;
}

describe("Toate cele trei case isi spun caderile", () => {
  test("⚠ cititorul chiar gaseste cele trei cai automate", () => {
    /* Fara garda asta, o redenumire ar face toate probele de mai jos sa treaca peste nimic. */
    for (const c of CASE) {
      assert.ok(caleaAutomata(c.cale).length > 200, `${c.nume}: calea automata e suspect de scurta`);
    }
  });

  for (const c of CASE) {
    test(`⚠⚠ ${c.nume}: niciun \`catch\` fara corp pe calea automata`, () => {
      const corp = caleaAutomata(c.cale);
      assert.ok(
        !/\}\s*catch\s*\{\s*return false;\s*\}/.test(corp),
        `${c.nume} inghite din nou defectele noastre`,
      );
      assert.match(corp, /\} catch \(e\) \{/, `${c.nume}: capatul nu mai prinde eroarea`);
    });

    test(`⚠ ${c.nume}: caderea se scrie, cu comanda in mesaj`, () => {
      const corp = caleaAutomata(c.cale);
      assert.match(corp, /action: "\w+\.(?:facturaAutomataCazuta|autoInvoiceCazut)"/, `${c.nume}: fara actiune`);
      assert.match(corp, /severity: "critical"/, `${c.nume}: o casa care nu mai factureaza nu e un avertisment`);
      assert.match(corp, /\$\{orderId\}/, `${c.nume}: mesajul nu spune despre ce comanda e vorba`);
    });

    test(`⚠⚠ ${c.nume}: dar comanda tot merge mai departe`, () => {
      /*
       * Jumatatea cealalta, si e la fel de importanta: o aruncare de aici ar rupe actualizarea
       * starii comenzii, adica facturarea ar putea bloca livrarea.
       */
      const corp = caleaAutomata(c.cale);
      const ramura = /\} catch \(e\) \{[\s\S]*$/.exec(corp)?.[0] ?? "";
      assert.match(ramura, /return false;/, `${c.nume}: capatul nu mai intoarce fals`);
      assert.ok(!/\bthrow\b/.test(ramura), `${c.nume}: s-a strecurat o aruncare in capat`);
    });

    test(`⚠ ${c.nume}: si scrierea alarmei nu poate ea insasi sa arunce`, () => {
      /*
       * `logError` face o scriere in baza. Picata, dintr-un `catch`, ar arunca mai departe exact
       * din locul care exista ca sa nu arunce niciodata.
       */
      const corp = caleaAutomata(c.cale);
      const ramura = /\} catch \(e\) \{[\s\S]*$/.exec(corp)?.[0] ?? "";
      assert.match(ramura, /\}\)\.catch\(\(\) => \{\}\);/, `${c.nume}: logError din catch poate arunca`);
    });
  }

  test("⚠⚠ si eroarea VENITA DE LA FURNIZOR ramane strigata la toate trei", () => {
    /*
     * Capatul prins mai sus e pentru defectele NOASTRE. Refuzul lor (token gresit, serie
     * inexistenta, plafon de abonament) e altceva, si e chiar cel pe care comerciantul il poate
     * repara. La SmartBill lipsea pana azi; la Oblio si fGO exista de mai demult.
     */
    for (const c of CASE) {
      const corp = caleaAutomata(c.cale);
      assert.match(
        corp, /if \("error" in (?:result|params)\) \{[\s\S]{0,400}?logError\(/,
        `${c.nume}: refuzul furnizorului se intoarce tacut`,
      );
    }
  });
});
