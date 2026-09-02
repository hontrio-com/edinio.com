import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ORDINEA DIN CRON: INTAI SE INTREABA, ABIA APOI SE TRIMITE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E O PROBA PE SURSA, si spun limpede ce nu dovedeste. Bucla cronului nu
  se poate executa fara o baza si fara doi furnizori; purtarea celor doua functii
  pe care le cheama e probata prin EXECUTIE in `esecuri-tacute.test.ts`. Ce ramane
  de aparat aici e ORDINEA lor in fisier — si aia chiar e o insusire a textului.

  ⚠ CE NU DOVEDESTE: ca ramura chiar se executa. Un `if (false && …)` ar trece de
  proba asta. Lectia e veche si e scrisa aici ca sa n-o creada nimeni mai mult
  decat merita.
*/

const COD = readFileSync("src/app/api/cron/conversii/route.ts", "utf8");

/** Bucla care trimite: de la `for (const r of randuri)` pana la capatul functiei. */
function bucla(): string {
  const i = COD.indexOf("for (const r of randuri)");
  assert.ok(i > 0, "nu mai gasesc bucla care trimite");
  return COD.slice(i);
}

test("⚠ verificarea finala a acordului sta INAINTEA cererii catre furnizor", () => {
  /*
    ⚠ FEREASTRA PE CARE O INCHIDE:
        12:00:00  se intreaba pentru tot lotul — ABC n-a retras
        12:00:02  ABC apasa „retrage"
        12:00:07  se ajunge la randul lui ABC
    Interogarea pe lot ramane, fiindca opreste randurile stiute retrase fara sa
    deschida nicio cerere. Dar ea singura lasa deschisa fereastra de mai sus.
  */
  const b = bucla();
  const iIntrebare = b.indexOf("aRetras(");
  const iMeta = b.indexOf("trimiteMeta(");
  const iTikTok = b.indexOf("trimiteTikTok(");

  assert.ok(iIntrebare > 0, "nu se mai face verificarea finala a acordului inainte de trimitere");
  assert.ok(iMeta > 0 && iTikTok > 0, "nu mai gasesc trimiterile — cautarea s-a stricat?");
  assert.ok(iIntrebare < iMeta, "se cheama Meta INAINTE de ultima verificare a acordului");
  assert.ok(iIntrebare < iTikTok, "se cheama TikTok INAINTE de ultima verificare a acordului");
});

test("⚠ «nu stiu» opreste randul, nu-l lasa sa treaca", () => {
  /*
    ⚠ CE APARA. Daca verificarea finala nu raspunde, singura purtare sigura e sa
    NU pleci. `aRetras` intoarce `null` atunci — iar `null` trebuie citit ca „nu
    trimite", nu ca „n-a retras". Scris `if (acumRetras)`, `null` ar fi cazut pe
    ramura falsa si randul ar fi plecat.
  */
  const b = bucla();
  const i = b.indexOf("aRetras(");
  const dupa = b.slice(i, i + 400);
  assert.match(dupa, /=== null/,
    "verdictul „nu stiu\" nu e deosebit de „n-a retras\" — randul ar pleca la o baza care clipeste");
});

test("⚠ daca nu se poate afla cine a retras, nu pleaca NIMIC din lot", () => {
  /*
    ⚠ SI SE IESE INAINTE DE BUCLA. Verificat aici, nu in bucla: o iesire de dupa
    prima trimitere ar fi aparat douazeci si patru de randuri din douazeci si cinci.
  */
  const iVerificare = COD.indexOf("retrasi === null");
  const iBucla = COD.indexOf("for (const r of randuri)");
  assert.ok(iVerificare > 0, "esecul verificarii pe lot nu mai e deosebit de «nimeni n-a retras»");
  assert.ok(iVerificare < iBucla, "se intra in bucla si abia apoi se vede ca verificarea a cazut");
});

test("⚠ cronul isi declara marginea de timp, si e sub arenda", () => {
  assert.match(COD, /export const maxDuration = 60/, "cronul si-a pierdut marginea de timp");
  assert.match(COD, /BUGET_MS = ARENDA_MS - MS_CERERE_FURNIZOR/,
    "bugetul buclei nu mai e legat de arenda — o rulare lunga ar lasa alta sa revendice aceleasi randuri");
});
