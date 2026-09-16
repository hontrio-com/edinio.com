import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

import { awbExista, salveazaAwb, unitatiLivrare, type PostaConfig } from "./client";
import { unitatiFaraLocalitate, unitatiIncomplete, unitateLaPunct } from "./unitati";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ⚠⚠ TREI FELURI IN CARE O TACERE ERA CITITA CA DOVADA.
 *
 * Posta Romana e singura integrare scrisa CAP-COADA fara sa fi atins vreodata
 * API-ul lor: nu exista mediu de test si nu exista cont. Sase din sapte
 * endpointuri n-au raspunsul documentat, iar regula pe care e scris tot codul e:
 * unde documentatia TACE, codul NU ghiceste.
 *
 * Auditul de pe 16.09.2026 a gasit trei locuri in care tocmai regula asta se
 * incalca. Toate trei au aceeasi forma: o presupunere plauzibila, ridicata la
 * rang de dovada, intr-un loc unde dovada costa un colet sau o vanzare.
 */

const CONFIG: PostaConfig = { enabled: true, username: "u", password: "p" } as PostaConfig;

function fetchFals(raspuns: (url: string, init?: { method?: string }) => Response) {
  const original = globalThis.fetch;
  const cereri: { url: string; metoda: string }[] = [];
  globalThis.fetch = (async (url: string, init?: { method?: string }) => {
    cereri.push({ url: String(url), metoda: init?.method ?? "GET" });
    return raspuns(String(url), init);
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

const CORP = { codAwb: "LN09100000123", numeDestinatar: "Ion", greutateTrimitere: "1" };

/*
 * ⚠ 1. UN 3xx PE O SCRIERE NU E UN REFUZ DOVEDIT.
 *
 * Comentariul spunea „aproape sigur pagina de login", si asta e adevarat. Dar
 * `eroareRefuz` inseamna pentru registru „dovedit ca nu s-a intamplat nimic acolo,
 * reincercarea e LIBERA". Documentatia lor nu descrie niciun raspuns la
 * `POST /api/awb` si nu pomeneste nicaieri redirectari: un 3xx la emitere e exact
 * cazul in care documentatia tace.
 *
 * Daca cererea a ajuns si trimiterea s-a creat, urmatoarea apasare arde inca un
 * cod din plaja si face al doilea colet REAL, facturat.
 */
describe("Posta: un 3xx la emitere nu mai elibereaza reincercarea", () => {
  test("pe SCRIERE iese necunoscut, si spune ce sa verifice omul", async () => {
    const f = fetchFals(() => new Response("", { status: 302 }));
    try {
      const e = await eroareaDin(() => salveazaAwb(CONFIG, CORP));
      assert.equal(verdictFurnizor(e), "necunoscut", "un 3xx pe scriere trece iar drept refuz dovedit");
      assert.match(e.message, /userul sau parola/);
      assert.match(e.message, /verifica in aplicatia/i);
    } finally {
      f.restaureaza();
    }
  });

  /*
   * ⚠ Pe CITIRE ramane refuz, si e chiar raspunsul bun: o citire reincercata nu
   * strica nimic, iar sfatul („verifica datele de acces") e cel folositor.
   */
  test("pe CITIRE ramane refuz dovedit", async () => {
    const f = fetchFals(() => new Response("", { status: 302 }));
    try {
      const e = await eroareaDin(() => unitatiLivrare(CONFIG));
      assert.equal(verdictFurnizor(e), "esuat");
      assert.match(e.message, /userul sau parola/);
    } finally {
      f.restaureaza();
    }
  });

  test("restul verdictelor raman neatinse", async () => {
    const f = fetchFals(() => new Response("", { status: 500 }));
    try {
      assert.equal(verdictFurnizor(await eroareaDin(() => salveazaAwb(CONFIG, CORP))), "necunoscut");
    } finally {
      f.restaureaza();
    }
    const g = fetchFals(() => new Response("", { status: 400 }));
    try {
      assert.equal(verdictFurnizor(await eroareaDin(() => salveazaAwb(CONFIG, CORP))), "esuat");
    } finally {
      g.restaureaza();
    }
  });
});

/*
 * ⚠ 2. CAND STIM CODUL, O EMITERE NESIGURA SE LAMURESTE CU O CITIRE.
 *
 * In modul plaja numarul il alegem NOI inainte de apel, iar documentatia (2.3) da
 * o citire pura pe chiar acel numar. Planul era scris in comentariul alocarii, si
 * nu se facea: `awbExista` nu era chemata de nicaieri pe drumul emiterii.
 *
 * Ce costa lipsa ei: un timeout la `POST /api/awb` iesea „necunoscut", codul
 * alocat se pierdea odata cu exceptia, comanda ramanea fara AWB, iar la Posta
 * putea sa existe un colet real pe care nimic nu-l mai lega de comanda.
 */
describe("Posta: citirea care lamureste o emitere nesigura", () => {
  test("`awbExista` are TREI raspunsuri, nu doua", async () => {
    const gasit = fetchFals(() => new Response(JSON.stringify({ codAwb: "LN09100000123" }), { status: 200 }));
    try { assert.equal(await awbExista(CONFIG, "LN09100000123"), true); } finally { gasit.restaureaza(); }

    const lipsa = fetchFals(() => new Response("", { status: 404 }));
    try { assert.equal(await awbExista(CONFIG, "LN09100000123"), false); } finally { lipsa.restaureaza(); }

    /* ⚠ 500 nu inseamna „nu exista": inseamna „n-am putut afla". */
    const nuStim = fetchFals(() => new Response("", { status: 500 }));
    try { assert.equal(await awbExista(CONFIG, "LN09100000123"), null); } finally { nuStim.restaureaza(); }
  });

  /*
   * ⚠ MUTANTUL PE APELANT. Citirea poate fi perfecta si tot nefolosita: pana azi
   * chiar asta se intampla. Proba citeste sursa, fiindca actiunea cere Supabase.
   */
  test("emiterea chiar cheama citirea cand raspunsul e nesigur", () => {
    const sursa = readFileSync("src/lib/actions/posta.actions.ts", "utf8").replace(/\r\n/g, "\n");

    const start = sursa.indexOf("rezultat = await salveazaAwb(config, corpFinal);");
    assert.notEqual(start, -1, "nu mai gasesc emiterea");
    const bucata = sursa.slice(start, start + 1800);

    assert.match(bucata, /verdictFurnizor\(e\) !== "necunoscut"/, "nu se mai deosebeste nesigurul de refuz");
    assert.match(bucata, /await awbExista\(config, codAlocat\)/, "citirea promisa in comentariu tot nu se face");
    /* Cele trei ramuri, fiecare cu urmarea ei. */
    assert.match(bucata, /exista === true/);
    assert.match(bucata, /exista === false/);
    assert.match(bucata, /verdictFurnizor: "esuat"/, "„nu exista” nu mai elibereaza reincercarea");
    assert.match(bucata, /Codul alocat a fost \$\{codAlocat\}/, "codul nu mai ajunge in mesaj cand nu stim");
  });
});

/*
 * ⚠ 3. MASURA APARA DENUMIREA, DAR CEA CARE TAIE LISTA E LOCALITATEA.
 *
 * Nomenclatorul de oficii n-are raspuns documentat, deci numele campurilor sunt
 * GHICITE, iar Diagnosticul e singura sonda. El numara insa oficiile fara
 * DENUMIRE, care e tocmai campul cu plasa: cand lipseste, numele se compune din
 * localitate sau din id, si oficiul tot poate fi ales.
 *
 * Localitatea n-are nicio plasa, si ea e cea dupa care checkout-ul filtreaza:
 * `cityMatches` pe un `city` gol face `"".includes(ceva)` pe toate cele trei
 * ramuri, adica FALS pentru orice localitate ceruta. Post-restantul ar fi fost
 * mort pentru toti cumparatorii, iar Diagnosticul ar fi raspuns „toate cu
 * denumire".
 */
describe("Posta: masura apara ce taie lista, nu ce are plasa", () => {
  test("denumirea are plasa, deci lipsa ei nu ascunde oficiul", () => {
    const p = unitateLaPunct({ id: "31793", localitate: "Cluj-Napoca" });
    assert.equal(p?.id, "31793");
    assert.match(p?.name ?? "", /Cluj-Napoca/);
    assert.equal(p?.city, "Cluj-Napoca");
  });

  test("localitatea NU are plasa: ramane goala", () => {
    const p = unitateLaPunct({ id: "31793", denumire: "Oficiul Postal 7" });
    assert.equal(p?.city, "", "daca asta se schimba, se schimba si masura de mai jos");
  });

  test("masura noua numara exact oficiile invizibile in checkout", () => {
    const brute = [
      { id: "1", denumire: "A", localitate: "Cluj-Napoca" },
      { id: "2", denumire: "B" },
      { id: "3", localitate: "Iasi" },
      { denumire: "fara id, nu intra in lista oricum" },
      { id: "5" },
    ];
    assert.equal(unitatiFaraLocalitate(brute), 2);
    /* ⚠ Si cele doua masuri raspund la intrebari DIFERITE. */
    assert.equal(unitatiIncomplete(brute), 2);
    assert.notDeepEqual(
      brute.filter((r) => r.id && !r.localitate).map((r) => r.id),
      brute.filter((r) => r.id && !r.denumire).map((r) => r.id),
    );
  });

  test("zero cand nomenclatorul e intreg, si pe lista goala", () => {
    assert.equal(unitatiFaraLocalitate([{ id: "1", localitate: "Sibiu" }]), 0);
    assert.equal(unitatiFaraLocalitate([]), 0);
  });

  /* ⚠ MUTANTUL PE APELANT: masura trebuie sa ajunga la om, nu doar sa existe. */
  test("numarul ajunge in Diagnostic, si panoul il arata", () => {
    const actiune = readFileSync("src/lib/actions/posta.actions.ts", "utf8");
    assert.match(actiune, /unitatiFaraLocalitate:\s*unitatiFaraLocalitate\(unitati\)/);

    const panou = readFileSync("src/components/dashboard/PostaConfigClient.tsx", "utf8");
    assert.match(panou, /diagnostic\.unitatiFaraLocalitate > 0/);
    assert.match(panou, /NU apar/);
  });
});

/*
 * ⚠⚠ 4. CURSORUL PLAJEI NU SE REScRIE DINTR-O CITIRE VECHE.
 *
 * `posta_aloca_cod()` e un `update ... returning` ATOMIC tocmai ca alocarea sa nu
 * se poata pierde. Dar salvarea configurarii citea `urmator`, apoi il scria inapoi:
 * intre cele doua poate rula un lot de AWB-uri, iar cursorul se intorcea.
 *
 * Urmarea: urmatoarea comanda din lot primeste ACELASI cod. Doua trimiteri reale
 * sub acelasi numar, la un furnizor care n-are metoda de anulare.
 *
 * ⚠ Si o citire PICATA a plajei nu mai trece drept „magazinul n-are plaja": asa,
 * un `Salveaza` apasat pentru altceva stergea randul cu tot cu cursor.
 *
 * Probele citesc sursa: actiunile cer Supabase si proprietarul autentificat.
 */
describe("Posta: cursorul plajei se misca doar de cine il aloca", () => {
  const SURSA = "src/lib/actions/posta.actions.ts";

  function corpul(nume: string): string {
    const text = readFileSync(SURSA, "utf8");
    const start = text.indexOf(`export async function ${nume}(`);
    assert.notEqual(start, -1, `nu gasesc ${nume}`);
    const stop = text.indexOf("\n}\n", start);
    assert.notEqual(stop, -1, `nu gasesc sfarsitul lui ${nume}`);
    return text.slice(start, stop);
  }

  test("pe acelasi interval, `urmator` nu se scrie deloc", () => {
    const corp = corpul("savePostaPlajaAction");
    /* Ramura „acelasi interval" foloseste update, fara coloana cursorului. */
    assert.match(corp, /acelasiInterval[\s\S]*?await admin\.from\("posta_plaja"\)\.update\(comun\)/);
    assert.doesNotMatch(corp, /urmator:\s*veche\.urmator/, "cursorul se rescrie iar dintr-o citire veche");
  });

  test("pe interval NOU, cursorul porneste de la capatul lui", () => {
    assert.match(corpul("savePostaPlajaAction"), /urmator:\s*plaja\.deLa/);
  });

  test("o citire picata a plajei NU trece drept „lipsa plajei”", () => {
    const corp = corpul("getPostaPlajaAction");
    assert.match(corp, /const \{ data, error \}/, "eroarea de citire nu se mai citeste");
    const iErr = corp.indexOf("if (error)");
    const iNull = corp.indexOf("if (!data)");
    assert.ok(iErr > 0 && iNull > iErr, "„n-am putut citi” trebuie deosebit INAINTE de „nu exista”");
  });
});
