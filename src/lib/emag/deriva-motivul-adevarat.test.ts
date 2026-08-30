import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eRespinsaDeEmag } from "./motive";
import { deCeNuSeVinde } from "./de-ce-nu-se-vinde";

/* ══════════════════════════════════════════════════════════════════════════
   „NU SE LASA REPARATA" NU E UN MOTIV, E O CONSTATARE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Cand deriva renunta, se scria: „oferta 273 nu se lasa reparata dupa toate incercarile".
   Comerciantul afla ca ceva nu merge, si nimic altceva.

   ⚠ MASURAT PE CONTUL REAL: singura oferta ajunsa acolo, 273, are `validation_status = 10` —
   BLOCATA la ei. Aveam motivul in mana, in chiar raspunsul din care masuram deriva, si nu-l
   spuneam. Iar in bazinul derivei (1229 de oferte) mai stau 110 cu documentatia respinsa si 7
   blocate — deci alarma se putea repeta pentru oricare dintre ele.

   ⚠ MOTIVELE LOR SUNT CHIAR BUNE cand ajungi la ele: „you need the following product fields...:
   EAN", „Brand invalid", „imaginea principala nu a putut fi accesata... autorizati IP-ul". Fiecare
   spune exact ce are omul de facut. Le aveam si le aruncam.
*/

const cron = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8");
const viu = cron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ starea se citeste din RASPUNSUL LOR, nu din randul nostru", () => {
  /* `masoaraDeriva` lucreaza pe pagina proaspat adusa; randul nostru poate fi cu o trecere in
     urma. Cand omul se uita in jurnal, vrea starea de la clipa in care s-a renuntat. */
  assert.match(viu, /validation_status: intregDeLaEi\(aLor\.validation_status\)/);
  assert.match(viu, /doc_errors: motiveDeLaEi\(aLor\)/);
  assert.doesNotMatch(viu, /intregDeLaEi\(rand\.validation_status\)/);
});

test("⚠ mesajul spune ce s-a VAZUT, nu ce deducem", () => {
  /*
   * „Nu primeste schimbarea" ar fi o cauzalitate pe care n-o pot proba pentru toate starile: o
   * documentatie respinsa poate fi numai avertismente, iar oferta sa primeasca totusi pretul.
   * Ce STIM e ca s-au epuizat incercarile si ca ei o tin intr-o stare respinsa.
   */
  assert.match(viu, /s-au epuizat incercarile, iar ei o tin \$\{deCe\.eticheta\}/);
  assert.doesNotMatch(viu, /nu primeste schimbarea/);
});

test("⚠ si NU se schimba ce se incearca, doar ce se spune", () => {
  /*
   * Taiate din incercari, cele 110 oferte cu documentatia respinsa ar fi fost inghetate ca sa
   * reparam o alarma — iar unele dintre ele au numai avertismente si chiar primesc pretul.
   * Renuntarea ramane a lui `hotarasteDeriva`, unde era.
   */
  const i = viu.indexOf("if (h.deScrisInJurnal)");
  const inainte = viu.slice(0, i);
  assert.doesNotMatch(inainte.slice(-1200), /eRespinsaDeEmag[\s\S]*continue;/,
    "starea de validare nu are voie sa sara peste masurarea derivei");
});

test("⚠ scurt in mesaj, intreg in `details`", () => {
  /* Motivele lor pot avea cinci sute de caractere de text juridic. Un jurnal din care nu se mai
     vede a doua linie nu mai e un jurnal. */
  assert.match(viu, /deCe\.indrumare\.length > 160/);
  assert.match(viu, /motiveleLor: dinRaspuns\.doc_errors\.slice\(0, 5\)/);
});

test("⚠ si mesajul chiar iese sub 250 de caractere pe motivele lor adevarate", () => {
  /* Textele de mai jos sunt copiate din contul real, nu inventate. */
  const alelor = [
    "Brand invalid · Punem în vedere că pentru moderarea continutului au fost utilizate mijloace semi automatizate iar domeniul teritorial al prezentei decizii este România. În măsura în care doriți să contestați decizia, vă aducem la cunoștință că aveți posibilitatea de a vă exercita dreptul la o cale de atac prin folosirea Mesageriei din cadrul Platformei Marketplace.",
    "The product was saved as a draft, and you need the following product fields to continue documenting and have the product ready for sale: EAN.",
  ];
  for (const motive of alelor) {
    const d = deCeNuSeVinde({
      validation_status: 8, offer_validation_status: 1,
      status_la_ei: 1, stoc_la_ei: 0, doc_errors: [motive],
    });
    const primul = d.indrumare.length > 160 ? `${d.indrumare.slice(0, 157)}…` : d.indrumare;
    const m = `oferta 1000000747: s-au epuizat incercarile, iar ei o tin ${d.eticheta}. ${primul}`;
    assert.ok(m.length < 250, `mesajul are ${m.length} caractere`);
    assert.ok(m.includes(d.eticheta), "starea se vede");
  }
});

test("⚠ `10` (blocat) e printre starile respinse, si e chiar cazul lui 273", () => {
  /* Fara el, oferta pentru care s-a facut toata reparatia ar fi primit tot mesajul vechi. */
  assert.equal(eRespinsaDeEmag(10), true);
  for (const v of [5, 6, 8, 12]) assert.equal(eRespinsaDeEmag(v), true, `${v}`);
  /* ⚠ Si cele in curs de validare NU sunt respinse: acolo chiar nu e nimic de facut, iar un
     mesaj de refuz ar trimite omul sa caute o problema care nu exista. */
  for (const v of [1, 2, 4, 9, 11]) assert.equal(eRespinsaDeEmag(v), false, `${v}`);
});
