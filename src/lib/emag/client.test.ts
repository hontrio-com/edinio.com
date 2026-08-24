import test from "node:test";
import assert from "node:assert/strict";


/* ── Limita: ce spun EI bate socoteala noastra (24.08.2026) ────────────────── */

test("antetul de limita se citeste, si 429 franeaza", async () => {
  /*
   * ═══ SINGURA SURSA CARE STIE CU ADEVARAT CAT MAI AVEM ERA ARUNCATA ═══
   *
   * Galeata de jetoane numara ce am trimis DIN INSTANTA ASTA. Dar aceeasi cheie de
   * magazin se foloseste din mai multe locuri deodata — cronul, importul, un buton apasat
   * de om — si fiecare crede ca are 3 cereri pe secunda intregi.
   *
   * `X-RateLimit-Remaining-3second` nu se citea NICAIERI: `headers.get` aparea o singura
   * data in tot dosarul `emag/`, si aceea pe `content-type`. Iar documentatia lor spune
   * ca si cererile invalide se numara — deci depasirea se plateste cu bugetul prin care
   * trebuie sa plece miscarile de stoc.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/emag/client.ts", "utf8");

  assert.ok(
    sursa.includes("x-ratelimit-remaining-3second"),
    "nu se citeste antetul prin care ei spun cat a mai ramas",
  );
  assert.ok(sursa.includes("retry-after"), "un 429 fara `Retry-After` citit e o pauza ghicita");
  assert.ok(
    sursa.includes("pauzePeGaleata"),
    "franarea trebuie tinuta pe galeata, ca s-o vada TOATE cererile, nu doar cea care a primit antetul",
  );

  /* ⚠ Franarea se citeste INAINTE de socoteala noastra: altfel am trimite cele 3 cereri
     ale ferestrei si abia apoi ne-am opri. */
  const i = sursa.indexOf("async function asteaptaJeton(");
  const corp = sursa.slice(i, sursa.indexOf(String.fromCharCode(10) + "}", i));
  assert.ok(
    corp.indexOf("pauzePeGaleata") < corp.indexOf("recente.length >= perSecunda"),
    "pauza ceruta de ei trebuie verificata inaintea galetii noastre",
  );
});
