import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CODUL VECHI NU INVIE PESTE O EXPEDIERE NOUA               (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fiecare cron de urmarire are un `marcheazaVerificat` care scrie marcajul de rotatie chiar si
 * pe drumurile care n-au aflat nimic (fara configurare, apel picat, fara stare). Fara marcaj,
 * o expediere care pica mereu ar ramane cu `*_status_checked_at` NULL si ar iesi PRIMA la
 * fiecare rulare, la nesfarsit — deci marcajul necondiționat e corect si ramane.
 *
 * ⚠⚠ Dar randul scria SI starea: `X_status_code: codNou ?? o.X_status_code`. Adica, fara cod
 * nou, se scria inapoi codul CITIT la inceputul rularii.
 *
 * Intre citire si scriere sta un apel extern, iar tura are zeci de comenzi. Daca in rastimp
 * comerciantul a dezlegat AWB-ul si a emis altul, coloana fusese GOLITA — si randul acela o
 * invia. Un cod FINAL inviat astfel (livrat, returnat, anulat) scoate expedierea NOUA din
 * urmarire pentru totdeauna, tacut.
 *
 * ⚠ Masurat: tiparul era in NOUA locuri, la OPT cronuri. Un defect copiat de opt ori nu se
 * repara intr-un fisier.
 *
 * ⚠ Nu se pierde nimic: valoarea scrisa era oricum aceeasi cu cea din baza, in afara de exact
 * cazul in care nu mai trebuia scrisa deloc.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CRONURI = join("src", "app", "api", "cron");

function deUrmarire(): { nume: string; cale: string }[] {
  return readdirSync(CRONURI, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-tracking"))
    .map((d) => ({ nume: d.name, cale: join(CRONURI, d.name, "route.ts") }))
    .sort((a, b) => a.nume.localeCompare(b.nume));
}

describe("Marcajul de rotatie nu resuscita starea veche", () => {
  test("cititorul chiar gaseste cronurile", () => {
    assert.ok(deUrmarire().length >= 17, "lista de cronuri s-a rupt");
  });

  test("⚠⚠ niciun cron nu mai scrie `status_code: codNou ?? o.…` in marcaj", () => {
    /*
     * ⚠ Se cauta DOAR in `marcheazaVerificat`, nu in tot fisierul: `scrieUrmarirea` foloseste
     * acelasi tipar, dar acolo e SIGUR — scrierea e filtrata pe identitatea expedierii citite,
     * deci nu poate ateriza pe alta. O cautare pe fisier ar fi acuzat pe nedrept, exact cum
     * mi s-a intamplat azi cu censul de anulari.
     */
    const vinovate: string[] = [];
    for (const { nume, cale } of deUrmarire()) {
      const s = viu(cale);
      const i = s.indexOf("marcheazaVerificat");
      if (i < 0) continue;
      /* Corpul functiei: pana la prima inchidere de la marginea ei. */
      const capat = s.indexOf("\n  };", i);
      const corp = s.slice(i, capat > 0 ? capat : Math.min(s.length, i + 2000));
      if (/_status_(?:code|type): (?:codNou|tipNou) \?\? o\./.test(corp)) vinovate.push(nume);
    }
    assert.deepEqual(
      vinovate, [],
      "marcajul rescrie codul citit: pe o expediere reemisa intre timp, il INVIE",
    );
  });

  test("⚠ si cele opt care aveau defectul scriu acum starea DOAR cand exista", () => {
    const CU_DEFECT = [
      "dhl-tracking", "fedex-tracking", "gls-tracking", "packeta-tracking",
      "posta-tracking", "shipo-tracking", "smartship-tracking", "ups-tracking",
    ];
    for (const nume of CU_DEFECT) {
      const s = viu(join(CRONURI, nume, "route.ts"));
      assert.match(
        s, /\.\.\.\((?:codNou|tipNou) !== null \? \{/,
        `${nume} nu mai scrie starea conditionat`,
      );
    }
  });

  test("⚠ dar marcajul de rotatie ramane NECONDITIONAT", () => {
    /*
     * Daca reparatia ar fi sarit si marcajul, o expediere care pica mereu ar ramane in capul
     * cozii la fiecare rulare si ar infometa restul platformei. Boala ar fi fost mai rea.
     */
    for (const { nume, cale } of deUrmarire()) {
      const s = viu(cale);
      if (!s.includes("marcheazaVerificat")) continue;
      assert.match(
        s, /_status_checked_at: new Date\(\)\.toISOString\(\)/,
        `${nume} nu mai scrie marcajul de rotatie`,
      );
    }
  });
});
