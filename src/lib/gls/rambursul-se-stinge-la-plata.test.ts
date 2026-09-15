import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

import { glsGata, modificaRamburs, type GlsConfig } from "./client";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ⚠ CUMPARATORUL PLATEA DE DOUA ORI, SI NIMIC NU SEMNALA ASTA.
 *
 * Comanda pleaca cu plata la livrare, comerciantul emite AWB-ul, si abia dupa
 * aceea clientul plateste online: un link de plata, o reincercare reusita la
 * procesator, o comanda de marketplace incasata mai tarziu. Coletul e deja la GLS
 * cu suma veche pe el, deci curierul mai incaseaza o data la usa.
 *
 * Din toate unghiurile aplicatiei comanda arata platita, iar nimic nu se uita la
 * ce poarta coletul. Defectul iese la iveala abia cand suna clientul.
 *
 * GLS documenteaza metoda EXACT pentru asta (`ModifyCOD`, pagina 29), cu
 * `CODAmount` zero sau pozitiv (Appendix A, codul 8). Pana azi n-o chema nimeni.
 *
 * ═══ CE APARA PROBELE ═══
 *
 *   1. apelul spune ce trebuie: numarul coletului si suma, cu doi zecimali;
 *   2. raspunsul se citeste PE DOS, adica `Successful` trebuie sa fie CHIAR `true`;
 *   3. greselile care se pot numi local nu ard un apel;
 *   4. ⚠ si cineva chiar il cheama: mutantul sta pe `dupaPlata`, singurul loc prin
 *      care trec toate platile online.
 */

const CONFIG: GlsConfig = {
  enabled: true,
  username: "magazin@exemplu.ro",
  password: "parola",
  client_number: 553003603,
  tara: "RO",
  sandbox: false,
  tip_imprimanta: "A4_2x2",
  pozitie_tiparire: 1,
};

/** Un `fetch` fals care raspunde exact in forma lui `ModifyCODResponse`. */
function fetchModifyCod(corp: unknown, status = 200) {
  const original = globalThis.fetch;
  const cereri: { url: string; corp: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    cereri.push({ url: String(url), corp: JSON.parse(init?.body ?? "{}") });
    return new Response(JSON.stringify(corp), { status });
  }) as unknown as typeof fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

async function eroareaDin(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("apelul ar fi trebuit sa arunce");
}

describe("GLS: rambursul de pe un colet emis se poate stinge", () => {
  test("cererea poarta numarul coletului si suma", async () => {
    const f = fetchModifyCod({ Successful: true });
    try {
      await modificaRamburs(CONFIG, "12345678901", 0);
      assert.equal(f.cereri.length, 1);
      assert.match(f.cereri[0].url, /\/ParcelService\.svc\/json\/ModifyCOD$/);
      assert.equal(f.cereri[0].corp.ParcelNumber, 12345678901);
      assert.equal(f.cereri[0].corp.CODAmount, 0);
    } finally {
      f.restaureaza();
    }
  });

  /* ⚠ Numarul pleaca NUMAR, nu sir: `ParcelNumber` e `Long` in documentatia lor. */
  test("numarul coletului pleaca ca numar, nu ca sir", async () => {
    const f = fetchModifyCod({ Successful: true });
    try {
      await modificaRamburs(CONFIG, "12345678901", 0);
      assert.equal(typeof f.cereri[0].corp.ParcelNumber, "number");
    } finally {
      f.restaureaza();
    }
  });

  test("suma se rotunjeste la doi zecimali", async () => {
    const f = fetchModifyCod({ Successful: true });
    try {
      await modificaRamburs(CONFIG, 12345678901, 12.340000000000002);
      assert.equal(f.cereri[0].corp.CODAmount, 12.34);
    } finally {
      f.restaureaza();
    }
  });

  /*
   * ⚠ CITIREA PE DOS. Un `false` cu lista de erori goala nu e succes, e o tacere:
   * nu stim daca suma s-a schimbat. Citit ca reusita, am fi raportat „rambursul e
   * stins" pentru un colet care pleaca mai departe cu suma veche, iar nimeni n-ar
   * mai fi verificat. Aceeasi regula ca la `cancelCOOrder` de la Colete Online.
   */
  test("un `Successful` care nu e CHIAR `true` nu trece drept reusita", async () => {
    for (const raspuns of [{ Successful: false }, {}, { Successful: "true" }, { Successful: 1 }]) {
      const f = fetchModifyCod(raspuns);
      try {
        const e = await eroareaDin(() => modificaRamburs(CONFIG, 12345678901, 0));
        assert.match(e.message, /n-a confirmat/);
        /* ⚠ Si ramane NECUNOSCUT: nu stim daca suma s-a schimbat sau nu. */
        assert.equal(verdictFurnizor(e), "necunoscut");
      } finally {
        f.restaureaza();
      }
    }
  });

  test("erorile lor ajung intregi la om, cu codul cu tot", async () => {
    const f = fetchModifyCod({
      Successful: false,
      ModifyCODError: [{ ErrorCode: 9, ErrorDescription: "Parcel number not exists" }],
    });
    try {
      const e = await eroareaDin(() => modificaRamburs(CONFIG, 12345678901, 0));
      assert.match(e.message, /Parcel number not exists/);
      assert.match(e.message, /9/);
      /* Un refuz numit e DOVEDIT: GLS s-a uitat si a raspuns. */
      assert.equal(verdictFurnizor(e), "esuat");
    } finally {
      f.restaureaza();
    }
  });

  /*
   * ⚠ Ce se poate numi local nu arde un apel. Appendix A, codul 8: „COD amount has
   * to be >= 0", deci o suma negativa e refuzata oricum, doar ca dupa un drum
   * dus-intors si dupa ce a consumat din plafonul lor.
   */
  test("sumele si numerele imposibile se opresc INAINTE de apel", async () => {
    const f = fetchModifyCod({ Successful: true });
    try {
      for (const [numar, suma] of [[12345678901, -1], [0, 0], ["nu-i numar", 0]] as const) {
        await eroareaDin(() => modificaRamburs(CONFIG, numar, suma));
      }
      assert.equal(f.cereri.length, 0, "niciunul n-avea voie sa ajunga la GLS");
    } finally {
      f.restaureaza();
    }
  });
});

/*
 * ⚠ MUTANTUL PE APELANT.
 *
 * `modificaRamburs` poate fi perfecta si tot inutila daca n-o cheama nimeni.
 * `dupaPlata` din `finalizare-plata.ts` e singurul loc prin care trec toate
 * platile online (Netopia, Stripe, Revolut, Klarna, iPay), si se aprinde exact o
 * data, pe drumul „platita-acum".
 *
 * ⚠ Proba citeste SURSA fiindca functia are nevoie de Supabase si de un webhook
 * adevarat ca sa se poata rula. Aceeasi unealta ca la
 * `scrierile-din-actiuni-poarta-magazinul`.
 */
describe("GLS: plata online chiar cheama stingerea rambursului", () => {
  const SURSA = "src/lib/orders/finalizare-plata.ts";

  test("`dupaPlata` stinge rambursul, langa celelalte efecte ale platii", () => {
    const text = readFileSync(SURSA, "utf8").replace(/\r\n/g, "\n");

    const start = text.indexOf("function dupaPlata(");
    assert.notEqual(start, -1, `nu gasesc dupaPlata in ${SURSA}`);
    const corp = text.slice(start, text.indexOf("\n}\n", start));

    assert.match(corp, /stingeRambursulGlsDupaPlata\(comanda\.businessId, comanda\.id\)/);
    /* ⚠ Si e chemata pe drumul care se aprinde O SINGURA data, nu pe „deja-platita". */
    assert.match(corp, /return \{ fel: "platita-acum" \};/);
  });

  /*
   * ⚠ Nu intr-un fisier „use server".
   *
   * Acolo fiecare export devine endpoint apelabil din browser, iar functia asta
   * nu poate cere o sesiune: se cheama dintr-un webhook de plata. Pusa acolo, ar
   * fi fost o cale publica de a stinge rambursul oricarei comenzi al carei id il
   * ghicesti. Vezi [[use-server-expune-fiecare-export]].
   */
  test("nu sta intr-un modul „use server”", () => {
    const sursa = readFileSync("src/lib/gls/rambursul-se-stinge-la-plata.ts", "utf8");
    assert.doesNotMatch(sursa, /^\s*["']use server["']/m);
  });
});

/*
 * ⚠ REGULA DE „CONFIGURAT COMPLET" TRAIA IN PATRU COPII.
 *
 * `gls.actions.ts`, cronul de urmarire (care scria chiar deasupra ei „aceeasi
 * regula ca in gls.actions.ts"), lotul de comenzi, si acum stingerea rambursului.
 * Patru copii ale aceleiasi propozitii inseamna ca un camp nou devenit obligatoriu
 * se adauga in trei din patru, iar a patra cale cheama GLS cu o configurare
 * incompleta si primeste un refuz pe care nimeni nu-l leaga de cauza.
 */
describe("GLS: „configurat complet” se scrie o singura data", () => {
  test("regula raspunde la toate cele patru campuri", () => {
    const plin = { ...CONFIG };
    assert.equal(glsGata(plin), true);
    assert.equal(glsGata(null), false);
    assert.equal(glsGata(undefined), false);
    assert.equal(glsGata({ ...plin, enabled: false }), false);
    assert.equal(glsGata({ ...plin, username: "" }), false);
    assert.equal(glsGata({ ...plin, password: "" }), false);
    assert.equal(glsGata({ ...plin, client_number: 0 }), false);
  });

  test("niciun apelant nu-si mai scrie propria copie", () => {
    const APELANTI = [
      "src/lib/actions/gls.actions.ts",
      "src/app/api/cron/gls-tracking/route.ts",
      "src/lib/actions/bulk-orders.actions.ts",
      "src/lib/gls/rambursul-se-stinge-la-plata.ts",
    ];
    for (const f of APELANTI) {
      const sursa = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      assert.match(sursa, /glsGata\(/, `${f} nu foloseste regula comuna`);
      /*
       * ⚠ Tiparul cauta insiruirea de campuri, nu numele functiei: cine rescrie
       * regula o face tocmai fiindca nu stie de `glsGata`, deci ar scrie-o pe
       * litere.
       */
      assert.doesNotMatch(
        sursa,
        /username\s*&&[^\n]*password\s*&&[^\n]*client_number/,
        `${f} si-a scris din nou regula de configurare, in loc s-o cheme pe cea comuna`,
      );
    }
  });
});
