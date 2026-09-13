import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CAMPURI_SECRETE } from "./secrete";

/* ══════════════════════════════════════════════════════════════════════════
   NICIO CREDENTIALA NU COBOARA IN BROWSER CA PROP (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `settings/page.tsx` citea `smso_config` cu service role, deci DECRIPTAT, si dadea
   `api_key` mai departe ca prop catre `SettingsClient`:

       smsoConfig={{ enabled: ..., api_key: smsoSettings?.api_key as string ?? "", ... }}

   De acolo credentiala ajungea in payloadul RSC al paginii, apoi in starea React. Era
   singurul loc din platforma unde o credentiala de integrare cobora in clar la client.

   ⚠ SI NU ERA NEVOIE DE EA NICI PENTRU CE O JUSTIFICA. Nota de langa citire spunea ca
   „fila SMS din SettingsClient trimite cheia mai departe catre SMSO pentru SMS-ul de
   test". Verificat cu o cautare netaiata: in `SettingsClient` nu exista niciun camp si
   niciun buton de SMS; `saveSmso` si `sendTestSms` erau definite si nu le chema NIMIC.
   Era a doua copie, moarta, a unei integrari care isi are panoul ei viu si corect
   (`SmsoConfigClient`): acolo cheia vine mascata, validarea foloseste `secretulEsteSalvat`
   si proba trimite `businessId`, ca ruta sa ia cheia din baza.

   Justificarea ramasese in urma codului pe care il descria. Asa se nasc scurgerile care
   par intemeiate.

   ⚠ REGULA E DESPRE TIPAR. Se cauta in TOATE paginile, nu doar in cea vinovata: drumul
   corect e `mascheazaConfig`, care goleste campul si trimite doar `_completate`.
*/

const APP = join(process.cwd(), "src", "app");

/** Toate numele de campuri secrete, din singura lista adevarata. */
const SECRETE = [...new Set(Object.values(CAMPURI_SECRETE).flat())];

function paginiServer(dir: string, iesire: string[] = []): string[] {
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) paginiServer(cale, iesire);
    else if (/^(page|layout)\.tsx$/.test(nume)) iesire.push(cale);
  }
  return iesire;
}

test("⚠⚠ NICIO pagina nu trece un camp secret ca prop catre o componenta de client", () => {
  const pagini = paginiServer(APP);
  /* ⚠ Prag masurat: o cautare stricata care nu mai gaseste pagini ar trece verde. */
  assert.ok(pagini.length >= 40, `am gasit doar ${pagini.length} pagini`);
  /* ⚠ 13 e numarul MASURAT pe 14.09.2026, nu unul din cap: prima forma a probei cerea 15,
     si a cazut pe cod bun. Pragul exista ca sa prinda o cautare stricata, nu ca sa ghiceasca. */
  assert.ok(SECRETE.length >= 13, `lista de campuri secrete s-a subtiat: ${SECRETE.length}`);

  /*
   * ⚠ TIPARUL CAUTAT e chiar forma scurgerii: un prop care poarta numele unui camp secret
   * si e alimentat din CHIAR acel camp al unei configuratii citite pe server.
   *
   *     api_key: smsoSettings?.api_key as string ?? ""
   *
   * Nu se cauta doar numele campului: `api_key` apare legitim in tipuri, in comentarii si
   * in obiecte trimise catre server. Ce nu are voie sa existe e curgerea lui INTR-UN PROP.
   */
  const vinovate: string[] = [];
  for (const cale of pagini) {
    const sursa = readFileSync(cale, "utf8");

    /*
     * ⚠ O PAGINA CARE MASCHEAZA E IN REGULA PRIN CONSTRUCTIE.
     *
     * `mascheazaConfig` goleste chiar campurile secrete, deci ce pleaca mai departe e sirul
     * gol plus `_completate`. Prima forma a probei nu stia asta si a raportat
     * `features/revolut/page.tsx`, care face EXACT ce trebuie:
     *     const full = mascheazaConfig("revolut_config", settings?.revolut_config);
     *     ... { secret_key: full.secret_key }      // adica ""
     */
    if (sursa.includes("mascheazaConfig(")) continue;

    for (const camp of SECRETE) {
      const tipar = new RegExp(`\\b${camp}\\s*:\\s*(\\w+)\\s*\\??\\.\\s*${camp}\\b`);
      const m = tipar.exec(sursa);
      if (!m) continue;

      /*
       * ⚠ SI NUMAI CAND SURSA E O CONFIGURATIE CITITA DIN BAZA.
       *
       * Regula e despre o credentiala STOCATA care ajunge in browser. Prima forma raporta si
       * `register/page.tsx`, unde randul e `password: data.password`: acolo `data` e
       * formularul react-hook-form, adica omul isi tasteaza propria parola si o trimite
       * CATRE server. Sensul e invers fata de scurgere, si campul se cheama „password" doar
       * fiindca asa se cheama si parolele de curier din `CAMPURI_SECRETE`.
       *
       * O alarma care suna pe cod bun te invata s-o ignori, iar asta e a treia oara intr-o
       * zi cand mi se intampla. Sursa trebuie sa arate a rand de setari.
       */
      if (!/settings|config|cfg|row|store/i.test(m[1])) continue;

      vinovate.push(`${cale.replace(process.cwd(), "").replace(/\\/g, "/")}: ${camp} (din \`${m[1]}\`)`);
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "o credentiala decriptata pleaca in payloadul RSC catre browser; foloseste "
      + "`mascheazaConfig`, care goleste campul si trimite doar `_completate`",
  );
});

test("⚠ pagina de setari nu mai citeste deloc cheia SMSO", () => {
  /*
   * A doua jumatate: mascarea ar fi fost de ajuns ca sa nu plece cheia, dar aici citirea
   * insasi nu mai are niciun rost, fiindca nimeni nu mai foloseste valoarea. O citire cu
   * service role pastrata „pentru orice eventualitate" e chiar felul in care scurgerea s-a
   * nascut prima oara.
   */
  const pagina = readFileSync(join(APP, "(dashboard)", "dashboard", "settings", "page.tsx"), "utf8");
  assert.doesNotMatch(pagina, /select\("smso_config"\)/, "pagina inca citeste cheia SMSO");
  assert.doesNotMatch(pagina, /smsoConfig=\{/, "pagina inca trimite configul SMSO in browser");
});

test("⚠ si copia MOARTA din SettingsClient a fost scoasa, nu doar golita", () => {
  /*
   * Lasata pe loc cu propul golit, prima persoana care ar fi vrut „fila SMS inapoi" ar fi
   * recablat-o exact cum era, cu cheia in browser. Panoul viu e `SmsoConfigClient`.
   */
  const ui = readFileSync(
    join(process.cwd(), "src", "components", "dashboard", "SettingsClient.tsx"), "utf8",
  );
  const faraComentarii = ui.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const urma of ["smsoConfig", "sendTestSms", "saveSmso", "updateSmsoConfig", "smso.api_key"]) {
    assert.ok(!faraComentarii.includes(urma), `a ramas \`${urma}\` in SettingsClient`);
  }
});

test("⚠ panoul VIU al SMSO ramane cel corect, altfel reparatia ar fi mutat gaura", () => {
  /* Daca `SmsoConfigClient` si-ar pierde masca sau `businessId`-ul, scurgerea ar reaparea
     acolo, iar probele de mai sus ar ramane verzi. */
  const panou = readFileSync(
    join(process.cwd(), "src", "components", "dashboard", "SmsoConfigClient.tsx"), "utf8",
  );
  assert.match(panou, /secretulEsteSalvat\(initialConfig, "api_key"\)/, "validarea nu mai accepta cheia mascata");
  assert.match(panou, /businessId,\s*api_key: smso\.api_key/, "proba nu mai trimite businessId, deci nu mai poate cadea pe cheia salvata");
});
