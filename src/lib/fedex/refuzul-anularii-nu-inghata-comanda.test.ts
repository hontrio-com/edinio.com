import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN REFUZ DOVEDIT AL ANULARII NU INGHEATA COMANDA          (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `deleteFedexAwbAction` scotea AWB-ul de pe comanda DOAR daca FedEx confirma anularea. Dar
 * FedEx refuza anularea din clipa in care coletul a fost preluat — si pe buna dreptate. Din acel
 * moment comanda ramanea cu un AWB de care nu se mai putea desprinde NICIODATA: needitabila,
 * fara drept la alt curier, si fara niciun buton care sa repare ceva.
 *
 * ⚠ Masurat in cod: Colete Online, DHL, FAN, Packeta si Posta au iesirea asta de mult. FedEx era
 * singurul dintre ele fara ea.
 *
 * ⚠⚠ SI DE CE NU SE DEZLEAGA PE „NU STIM": un colet in aer despre care nimeni nu mai stie nimic
 * e mai rau decat o comanda blocata, care macar se vede. Tiparul e copiat de la FAN.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const FEDEX = "src/lib/actions/fedex.actions.ts";

describe("FedEx: anularea refuzata dezleaga comanda, „nu stim” nu", () => {
  const s = viu(FEDEX);

  test("⚠⚠ pe „nu stim” se OPRESTE, si numarul ramane pe comanda", () => {
    assert.match(
      s, /verdictFurnizor\(e\) === "necunoscut"/,
      "nu se mai deosebeste o nesiguranta de un refuz dovedit",
    );
    assert.match(
      s, /Numarul NU a fost scos de pe comanda/,
      "mesajul nu mai spune ca numarul a ramas pe comanda",
    );
  });

  test("⚠ pe refuz DOVEDIT se dezleaga, si i se spune ca expedierea ramane vie", () => {
    assert.match(s, /FedEx a refuzat anularea/, "refuzul dovedit nu mai are propozitia lui");
    assert.match(s, /ramane VIE la ei/, "nu i se mai spune ca merge mai departe");
    assert.match(s, /va aparea pe factura/, "nu i se mai spune ca se si factureaza");
  });

  test("⚠⚠ si scrierea e filtrata pe AWB-ul CITIT", () => {
    /*
     * Intre citirea comenzii si scriere sta un apel la FedEx. Daca in rastimp comanda a primit
     * ALT numar, dintr-o reemitere pornita in alta fila, un update nefiltrat l-ar sterge pe cel
     * NOU, pe care nu l-a anulat nimeni. Lectia e de la FAN.
     */
    assert.match(s, /\.eq\("fedex_awb_number", awb\)/, "update-ul nu mai e legat de AWB-ul citit");
  });

  test("⚠ rezultatul spune ce s-a intamplat de fapt, nu doar „a mers”", () => {
    assert.match(s, /anulatLaFedex/, "apelantul nu mai poate deosebi anularea de dezlegare");
    assert.match(s, /mesaj: despreCurier/, "propozitia nu mai ajunge la apelant");
  });
});

describe("⚠ si niciun curier cu anulare nu ramane fara iesire din fundatura", () => {
  /*
   * Plasa apara REGULA, nu fisierul: orice actiune de curier care scoate AWB-ul de pe comanda
   * dupa ce a chemat furnizorul trebuie sa stie ce face la un refuz DOVEDIT. Un al optsprezecelea
   * curier scris maine cade aici.
   */
  const DIR = join("src", "lib", "actions");

  test("cititorul chiar gaseste actiunile de curier", () => {
    const fisiere = readdirSync(DIR).filter((f) => f.endsWith(".actions.ts"));
    assert.ok(fisiere.length >= 15, `am gasit doar ${fisiere.length} fisiere de actiuni`);
  });

  test("⚠⚠ cine cheama `verdictFurnizor` pe drumul de anulare il si DEOSEBESTE", () => {
    /*
     * ⚠ CAUTAREA E PE CORPUL FUNCTIEI, nu pe fisier, si asta nu e un amanunt.
     *
     * Prima varianta cauta in tot fisierul si raporta ZECE curieri „vinovati”. Erau fals
     * pozitivi: fisierele lor cheama `verdictFurnizor` pe drumul de EMITERE, nu pe cel de
     * anulare. Masurat corect, doar TREI functii de anulare il cheama in corpul lor, si toate
     * trei deosebesc „nu stim”. O plasa care imprumuta de la vecin acuza pe nedrept.
     */
    const MARGINE = "\n}\n";
    const corp = (t: string, start: number) => {
      const j = t.indexOf(MARGINE, start);
      return t.slice(start, j > 0 ? j : t.length);
    };
    const vinovate: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith(".actions.ts"))) {
      const t = viu(join(DIR, f));
      const rx = /export async function (?:delete|dezleaga|cancel)\w*/gi;
      for (let m = rx.exec(t); m; m = rx.exec(t)) {
        const b = corp(t, m.index);
        if (b.includes("verdictFurnizor") && !b.includes('"necunoscut"')) vinovate.push(`${f}:${m[0]}`);
      }
    }
    assert.deepEqual(
      vinovate, [],
      "o anulare cheama verdictul dar nu deosebeste „nu stim” de refuzul dovedit",
    );
  });
});
