import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { avertismentSms, scrieSocoteala, socotesteSms } from "./sms-segmente";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Socoteala asta se vede ca un rand mic sub campul de mesaj, dar ea spune cat
  plateste comerciantul. Pana pe 21.09.2026 scria „`length` / 160 SMS", care e
  gresit in doua feluri deodata: 160 e limita GSM-7, iar diacriticele romanesti
  nu sunt in GSM-7. Un text de 150 de caractere scris romaneste nu e 1 SMS, ci 3.

  Probele astea apara pragurile, nu niste cifre alese.
*/

const LINK = " https://magazin.ro/?recover=8f2b1c4a-0000-4000-8000-000000000001";

test("un text simplu ramane GSM-7, cu 160 de locuri pe segment", () => {
  const s = socotesteSms("Salut! Ai uitat ceva in cos.");
  assert.equal(s.codare, "GSM-7");
  assert.equal(s.segmente, 1);
  assert.equal(socotesteSms("a".repeat(160)).segmente, 1);
  assert.equal(socotesteSms("a".repeat(161)).segmente, 2, "peste 160 se rupe in doua");
});

test("⚠ UN SINGUR DIACRITIC MUTA TOT MESAJUL PE UNICODE", () => {
  /*
    Cazul din analiza proprietarului. Acelasi text, o litera diferenta:
    fara diacritice incape intr-un SMS, cu diacritice se face trei.
  */
  const faraDiacritice = "Salut! Ai uitat produse in cosul tau. Finalizeaza comanda si primesti transport gratuit la orice comanda de peste doua sute de lei.";
  const cuDiacritice = "Salut! Ai uitat produse în coșul tău. Finalizează comanda și primești transport gratuit la orice comandă de peste două sute de lei.";

  const a = socotesteSms(faraDiacritice);
  const b = socotesteSms(cuDiacritice);

  assert.equal(a.caractere, b.caractere, "acelasi numar de semne: numai codarea difera");
  assert.equal(a.codare, "GSM-7");
  assert.equal(a.segmente, 1, "131 de semne fara diacritice incap intr-un SMS");
  assert.equal(b.codare, "Unicode");
  assert.equal(b.segmente, 2, "aceleasi 131 de semne, scrise romaneste, se platesc ca doua");

  /* Si cu linkul lipit, textul romanesc trece de trei. */
  assert.equal(socotesteSms(cuDiacritice, LINK).segmente, 3);
  assert.equal(socotesteSms(faraDiacritice, LINK).segmente, 2);
});

test("fiecare diacritic romanesc scoate mesajul din GSM-7", () => {
  for (const litera of ["ă", "â", "î", "ș", "ț", "Ă", "Â", "Î", "Ș", "Ț"]) {
    assert.equal(socotesteSms(`test ${litera}`).codare, "Unicode", litera);
  }
});

test("limitele Unicode sunt 70, apoi 67 pe segment", () => {
  assert.equal(socotesteSms("ă".repeat(70)).segmente, 1);
  assert.equal(socotesteSms("ă".repeat(71)).segmente, 2);
  assert.equal(socotesteSms("ă".repeat(134)).segmente, 2, "2 x 67");
  assert.equal(socotesteSms("ă".repeat(135)).segmente, 3);
});

test("in lant, un segment GSM-7 are 153 de locuri, nu 160", () => {
  /* ⚠ Antetul care leaga segmentele mananca sapte locuri din fiecare. */
  assert.equal(socotesteSms("a".repeat(306)).segmente, 2, "2 x 153");
  assert.equal(socotesteSms("a".repeat(307)).segmente, 3);
});

test("⚠ LINKUL INTRA IN SOCOTEALA, nu sta in paranteza", () => {
  /*
    Linkul se lipeste de mesaj abia la trimitere, deci comerciantul nu-l vede
    cand scrie - dar il plateste. Un text care incape la limita fara link
    trece peste prag cu el.
  */
  const text = "a".repeat(140);
  assert.equal(socotesteSms(text).segmente, 1);
  assert.equal(socotesteSms(text, LINK).segmente, 2, "cu linkul nu mai incape intr-unul");
  assert.ok(socotesteSms(text, LINK).caractere > socotesteSms(text).caractere);
});

test("acoladele din sablon costa doua locuri fiecare", () => {
  /*
    ⚠ `{` si `}` stau in tabela de extensie GSM-7 si se trimit ca doua
    caractere. `{nume}` pare sase semne si consuma opt.
  */
  const s = socotesteSms("{nume}");
  assert.equal(s.codare, "GSM-7", "acoladele NU scot mesajul din GSM-7");
  assert.equal(s.caractere, 6);
  assert.equal(s.locuri, 8, "doua acolade x doua locuri");
});

test("un mesaj gol nu costa niciun SMS", () => {
  const s = socotesteSms("");
  assert.equal(s.segmente, 0);
  assert.equal(s.caractere, 0);
});

test("un emoji ocupa doua locuri, desi omul vede un semn", () => {
  const s = socotesteSms("🎉");
  assert.equal(s.codare, "Unicode");
  assert.equal(s.caractere, 1, "omul vede un singur semn");
  assert.equal(s.locuri, 2, "dar se trimit doua unitati");
});

test("randul de sub camp spune codarea si numarul de mesaje", () => {
  const cu = scrieSocoteala(socotesteSms("Salut ă", LINK), true);
  assert.match(cu, /caractere \(cu link\)/);
  assert.match(cu, /Unicode/);
  assert.match(cu, /SMS/);

  const fara = scrieSocoteala(socotesteSms("Salut"), false);
  assert.doesNotMatch(fara, /cu link/);
  assert.match(fara, /GSM-7 · 1 SMS$/);
});

test("avertismentul apare doar cand e ceva de spus", () => {
  assert.equal(avertismentSms(socotesteSms("Salut!")), null, "un mesaj scurt curat n-are nevoie de vorbe");

  const cuDiacritice = avertismentSms(socotesteSms("Salut! Ai uitat ceva în coșul tău."));
  assert.ok(cuDiacritice, "diacriticele trebuie semnalate");
  assert.match(cuDiacritice!, /70/);

  const lung = avertismentSms(socotesteSms("ă".repeat(300)));
  assert.match(lung!, /Scurteaza/i);
});

test("⚠ SOCOTEALA E CHEMATA DE ECRAN, nu doar scrisa in fisier", () => {
  /*
    ⚠ Capcana pe care o pazeste proba asta: un modul scris anume, probat pe
    toate pragurile, si NECHEMAT de nicaieri. Probele de mai sus ar fi trecut
    toate cu vechiul `message.length / 160` inca pe ecran.

    Se masoara si ca vechea impartire la 160 a disparut din fereastra de
    trimitere - altfel raman doua socoteli, si se arata cea gresita.
  */
  const cale = new URL(
    "../../components/dashboard/AbandonedCartsClient.tsx", import.meta.url,
  );
  const sursa = readFileSync(cale, "utf8");

  assert.match(sursa, /from "@\/lib\/abandoned\/sms-segmente"/, "ecranul nu importa socoteala");
  for (const chemare of ["socotesteSms(", "scrieSocoteala(", "avertismentSms("]) {
    assert.ok(sursa.includes(chemare), `${chemare} nu e chemata in ecran`);
  }
  assert.doesNotMatch(sursa, /\/\s*160\)/, "a ramas vechea impartire la 160");

  /*
    ⚠ Si ca textul numarat e cel CARE PLEACA: cu `{nume}` inlocuit si cu linkul
    lipit. Un `socotesteSms(message)` gol ar trece testul de mai sus si ar minti
    exact ca inainte.
  */
  assert.match(sursa, /socotesteSms\(text, ` \$\{link\}`\)/, "linkul nu intra in socoteala");
  assert.match(sursa, /interpolateRecoveryMessage\(scris, \{/, "se numara sablonul, nu textul trimis");
});
