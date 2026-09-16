import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O ALARMA CARE NUMESTE CAUZA GRESITA E MAI REA DECAT NICIUNA  (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cronul Postei imparte esecurile pe galeti, ca un magazin sanatos sa nu ascunda unul cazut.
 * Comentariul de deasupra spunea, corect, ca galeata de autentificare e pentru „401/403".
 *
 * Dar codul era `if (status === 404) ... else { g.autentificare++ }`, iar `else` prindea TOT:
 * un timeout, o retea cazuta, un 500 la ei. Trei astfel de esecuri intr-o rulare ridicau o
 * alarma CRITICA prin care comerciantului i se spunea sa-si verifice utilizatorul si parola,
 * cand de fapt Posta era cazuta.
 *
 * ⚠ Omul schimba atunci o parola BUNA, nu se repara nimic, si data viitoare nu mai crede
 * alarma. De aia cauza numita conteaza la fel de mult ca alarma insasi.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CRON = "src/app/api/cron/posta-tracking/route.ts";

describe("Posta: alarma spune ce s-a intamplat de fapt", () => {
  const s = viu(CRON);

  test("⚠⚠ galeata de autentificare aduna DOAR 401 si 403", () => {
    assert.match(
      s, /else if \(status === 401 \|\| status === 403\) \{ g\.autentificare\+\+/,
      "autentificarea aduna iar orice esec care nu e 404",
    );
  });

  test("⚠ si restul are galeata LUI, nu se amesteca", () => {
    assert.match(s, /g\.altele\+\+/, "nu mai exista galeata pentru indisponibilitate");
    assert.match(s, /altele: number;/, "tipul galetii nu mai are campul");
    assert.match(s, /altele: 0/, "galeata noua nu se initializeaza");
  });

  test("⚠⚠ si cele doua alarme spun lucruri DIFERITE", () => {
    /*
     * Una cere verificarea datelor de acces; cealalta spune limpede sa NU le schimbe. Daca
     * amandoua ar da acelasi sfat, despartirea galetilor n-ar folosi la nimic.
     */
    assert.match(s, /Verifica utilizatorul si parola din configurare/, "alarma de credentiale si-a pierdut sfatul");
    assert.match(s, /nu schimba datele de acces/, "alarma de indisponibilitate da acelasi sfat gresit");
    assert.match(s, /NU din cauza autentificarii/, "a doua alarma nu spune ce NU e cauza");
  });

  test("⚠ severitatea difera: o cadere la ei nu e `critical`", () => {
    const iAuth = s.indexOf("g.autentificare >= MIN_ESECURI_ALARMA");
    const iAlt = s.indexOf("g.altele >= MIN_ESECURI_ALARMA");
    assert.ok(iAuth > 0 && iAlt > iAuth, "cele doua ramuri nu mai exista in ordinea asteptata");
    assert.match(s.slice(iAuth, iAlt), /severity: "critical"/, "credentialele respinse nu mai sunt critice");
    assert.match(s.slice(iAlt), /severity: "warning"/, "o cadere la ei a redevenit critica");
  });

  test("⚠ si niciuna nu se ridica daca magazinul a avut si reusite", () => {
    /* Lectia din cronul GLS: un magazin sanatos nu trebuie sa ascunda unul cazut, dar nici
       sa fie alarmat pentru cateva esecuri intre sute de reusite. */
    assert.match(s, /if \(g\.reusite > 0\) continue;/);
  });
});
