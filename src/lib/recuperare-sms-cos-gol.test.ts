import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { liniiRecuperabile, type AbandonedCartItem, type ProdusCosSalvat } from "./abandoned-cart";

/**
 * Niciun SMS de recuperare nu mai pleaca spre un cos gol.
 *
 * ═══ ⚠ DE CE E O PROBLEMA DE BANI, NU DE DATE ═══
 *
 * Poarta „ce se mai poate recupera" (`cosRecuperabil`) exista de la 2026-08-04, dar linkul de
 * recuperare are CINCI consumatori, iar cei doi de pe SMS n-o chemau: cronul pleca direct cu
 * `recoverUrl`, si actiunea din panou nici macar nu cerea `items` din baza.
 *
 * Pentru un produs care CERE PERSONALIZARE (fototapetul la lei/m2) asta nu e o coincidenta
 * nefericita, ci o certitudine: butonul de cos e ascuns, deci singurul drum de cumparare e
 * formularul de comanda — si tot el captureaza cosul abandonat, cu o singura linie, chiar linia pe
 * care `liniiRecuperabile` o arunca. Deci 100% din SMS-urile de recuperare pentru asemenea cosuri
 * ajungeau la un link care nu restaureaza nimic: vitrina iese pe `items.length === 0` inainte de
 * `restoreCart` si sterge si parametrul `recover` din adresa, asa ca omul aterizeaza pe prima
 * pagina fara cos si fara nicio explicatie — dupa un SMS PLATIT de comerciant. Pe rand se scria
 * totusi `recovery_sms_sent_at` si `recovery_count + 1`, deci si raportul de recuperari iesea
 * umflat: lucrul stricat se si ascundea singur.
 *
 * ⚠ Probele de mai jos citesc SURSA. Nu e o alegere de comoditate: amandoua drumurile cer un client
 * Supabase si un furnizor de SMS, iar ce trebuie aparat nu e o valoare intoarsa, ci ORDINEA —
 * poarta inaintea trimiterii, pe amandoua ramurile. Ultima proba e singura care ruleaza cod, si e
 * acolo ca sa tina premisa: daca linia personalizabila n-ar mai fi aruncata, celelalte trei ar
 * apara un drum care nu mai duce nicaieri.
 */

const RAD = process.cwd();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

const CRON = "src/app/api/cron/abandoned-recovery/route.ts";
const ACTIUNI = "src/lib/actions/abandoned-cart.actions.ts";

test("⚠ in cron poarta sta INAINTEA ramificarii pe canal, deci apara si SMS-ul", () => {
  const s = sursa(CRON);
  const i = s.indexOf("for (const cart of carts ?? [])");
  assert.ok(i > 0, "bucla pe cosuri si-a schimbat forma");
  const corp = s.slice(i);

  /*
   * ⚠ Aici se dovedeste lucrul, nu in ordinea din fisier: ramura de email e scrisa prima, deci
   * pana si versiunea stricata avea `cosRecuperabil` INAINTEA lui `sendSms`. Singura intrebare
   * care conteaza e daca poarta cade in partea COMUNA sau in interiorul unei ramuri.
   */
  const ramificare = corp.indexOf('if (canal.fel === "email") {');
  assert.ok(ramificare > 0, "ramificarea pe canal si-a schimbat forma; verifica singur poarta pe SMS");
  const comun = corp.slice(0, ramificare);
  const trimiteri = corp.slice(ramificare);

  assert.match(
    comun, /const proaspat = await cosRecuperabil\(admin, store\.businessId,/,
    "cosul proaspat nu se mai socoteste inaintea ramificarii: ramura de SMS pleaca fara poarta",
  );
  /* ⚠ Si ca refuzul REVENDICA pasul: fara asta secventa s-ar bloca pe cosul asta la fiecare rulare. */
  assert.match(
    comun, /if \(proaspat\.items\.length === 0\) \{ await revendicaPasul\(admin, cart\.id, cart, now\); continue; \}/,
    "cosul gol nu mai opreste trimiterea, sau opreste fara sa avanseze secventa",
  );

  for (const chemare of ["sendAbandonedCartRecovery(", "sendSms(", "sendNoticeAbandonedSms("]) {
    assert.ok(trimiteri.includes(chemare), `${chemare} nu mai e in partea aparata de poarta`);
    assert.equal(comun.includes(chemare), false, `${chemare} pleaca INAINTE de poarta`);
  }

  /* Un singur raspuns: doua socoteli inseamna doua drumuri la baza si doua adevaruri care pot diverge. */
  assert.equal(
    (corp.match(/cosRecuperabil\(/g) ?? []).length, 1,
    "cosul proaspat se socoteste de mai multe ori pe acelasi cos",
  );
});

test("⚠ orele linistite AMANA SMS-ul, nu-i ard pasul", () => {
  /*
   * ⚠ CE COSTA: cronul ruleaza la fiecare sfert de ora, iar orele linistite tin de obicei
   * noaptea intreaga. Daca amanarea ar revendica pasul — sau daca ar cadea dupa revendicare —
   * fiecare cos cu pas de SMS si-ar consuma tacut, in somn, toata secventa: pasul avanseaza,
   * `marcheazaTrimis` nu se cheama niciodata, si dimineata nu se vede nimic in rapoarte, fiindca
   * un pas ars arata exact ca unul dus la capat. Poarta de cos gol pe care o apara probele de mai
   * sus ar ramane atunci fara ce sa apere: nu mai pleaca niciun SMS, bun sau rau.
   *
   * Linia asta tocmai s-a mutat din ramura de SMS in partea comuna, deci merita tinuta cu mana.
   */
  const s = sursa(CRON);
  const i = s.indexOf("for (const cart of carts ?? [])");
  assert.ok(i > 0, "bucla pe cosuri si-a schimbat forma");
  const corp = s.slice(i);

  const linisteIdx = corp.indexOf("isQuietHour(");
  assert.ok(linisteIdx > 0, "orele linistite nu mai sunt verificate deloc: SMS-ul poate pleca noaptea");

  /* Amanarea nu are voie sa revendice: cosul trebuie sa revina la urmatoarea rulare. */
  const linia = corp.split("\n").find((l) => l.includes("isQuietHour(")) ?? "";
  assert.equal(
    linia.includes("revendicaPasul"), false,
    "amanarea pe ore linistite revendica pasul: secventa se arde in somn, fara sa plece niciun SMS",
  );

  const revendicare = corp.indexOf("if (!(await revendicaPasul(");
  assert.ok(revendicare > 0, "revendicarea inaintea trimiterii si-a schimbat forma");
  assert.ok(
    linisteIdx < revendicare,
    "orele linistite se verifica DUPA revendicarea pasului: cosul pleaca cu pasul consumat si fara mesaj",
  );
});

test("⚠ trimiterea manuala de SMS din panou trece prin aceeasi poarta", () => {
  const s = sursa(ACTIUNI);
  const i = s.indexOf("export async function sendAbandonedCartSms(");
  assert.ok(i > 0, "actiunea de SMS nu mai exista");
  const corp = s.slice(i, s.indexOf("export async function deleteAbandonedCart", i));

  /*
   * ⚠ Fara `items` in select, poarta ar primi mereu o lista goala si ar refuza TOATE cosurile.
   * Ordinea coloanelor nu se ingheata aici: ar face sa pice si o rescriere care nu strica nimic.
   */
  assert.match(
    corp, /\.from\("abandoned_carts"\)\.select\("[^"]*\bitems\b[^"]*"\)/,
    "cosul se citeste fara `items`, deci poarta n-are ce sa judece",
  );

  const poarta = corp.indexOf("cosRecuperabil(");
  const refuz = corp.indexOf("if (proaspat.items.length === 0)");
  assert.ok(poarta > 0, "actiunea de SMS nu socoteste cosul proaspat");
  assert.ok(refuz > poarta, "cosul se socoteste, dar nimic nu se refuza");
  for (const chemare of ["sendSms(", "sendNoticeAbandonedSms("]) {
    const trimite = corp.indexOf(chemare);
    assert.ok(trimite > 0 && trimite > refuz, `${chemare} pleaca inainte de refuz`);
  }
});

test("⚠ mesajul catre comerciant numeste si personalizarea", () => {
  /*
   * Comerciantul nu vede cosul repretuit, ci doar textul asta. Cat timp spunea „nu mai sunt in
   * catalog / sunt dezactivate / au variante", pentru un fototapet activ si fara variante el se
   * uita la un produs sanatos si nu avea de unde sa afle ce i se cere.
   */
  const s = sursa(ACTIUNI);
  const m = /const COS_NERECUPERABIL =\n\s*"([^"]+)";/.exec(s);
  assert.ok(m, "textul refuzului nu mai sta intr-un singur loc");
  for (const motiv of ["nu mai sunt in catalog", "dezactivate", "variante", "cer personalizare"]) {
    assert.ok(m![1]!.includes(motiv), `refuzul nu pomeneste „${motiv}"`);
  }
  /* Acelasi text pe amandoua canalele: doua texte diverg, si unul ramane in urma. */
  assert.equal(
    (s.match(/return \{ error: COS_NERECUPERABIL \};/g) ?? []).length, 2,
    "email si SMS nu mai raspund la fel",
  );
});

test("⚠ premisa: linia venita din formularul de comanda e chiar cea pe care poarta o arunca", () => {
  const fototapet: ProdusCosSalvat = {
    id: "fototapet",
    name: "Fototapet personalizat",
    price: 89,
    images: [],
    is_active: true,
    page_sections: {
      customization: {
        enabled: true,
        fields: [{
          id: "d", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
        }],
      },
    },
  };
  /* Cosul capturat de OrderModal (`source: "buy_now"`) are exact o linie. */
  const salvat: AbandonedCartItem[] = [
    { product_id: "fototapet", name: "Fototapet personalizat", price: 910, quantity: 1, image_url: null },
  ];
  assert.equal(
    liniiRecuperabile(salvat, new Map([[fototapet.id, fototapet]])).length, 0,
    "linia personalizabila nu mai e aruncata, deci premisa probelor de mai sus a cazut",
  );
});
