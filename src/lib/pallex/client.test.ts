import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  citestePartida,
  creeazaPartida,
  descrieEroarea,
  documentPartidei,
  probaConexiune,
  stergePartida,
  tipuriDeStatus,
  valideazaBorderou,
  type PallExConfig,
  type PartidaPallEx,
} from "./client";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ⚠ NIMIC din Pall-Ex nu se poate proba pe fir fara datele de acces ale
 * comerciantului: TOATE endpointurile raspund 401 fara autentificare, si nu
 * exista niciun mediu de test. Prima verificare adevarata e o partida REALA,
 * facturata.
 *
 * Probele de mai jos inlocuiesc deci `fetch` si verifica CE trimite clientul si
 * CUM citeste raspunsul — adica exact partile in care o greseala nu produce nicio
 * eroare, ci o expediere gresita.
 */

const CONFIG: PallExConfig = {
  enabled: true,
  username: "api@magazin.ro",
  password: "secret",
};

const PARTIDA: PartidaPallEx = {
  type: 3,
  consignor_name: "Depozit", consignor_county: "SB", consignor_locality: "Sibiu",
  consignor_address: "Str. A 1", consignor_postcode: "550321",
  consignee_name: "Ion", consignee_county: "BV", consignee_locality: "Brasov",
  consignee_address: "Str. B 2", consignee_postcode: "500091",
  collection_date: "2026-09-01", collection_open_time: "08:00", collection_close_time: "17:00",
  delivery_date: "2026-09-03", delivery_open_time: "08:00", delivery_close_time: "17:00",
  pallet_count: 1, pallet_weight: 300,
};

type Raspuns = { status: number; corp?: unknown; text?: string; octeti?: Uint8Array };

/**
 * Inlocuieste `fetch` si tine minte fiecare cerere.
 *
 * Nu se atinge reteaua: se verifica antetul de autentificare, metoda, calea si
 * corpul trimis — regulile care altfel s-ar descoperi platind un transport real.
 */
function fetchFals(raspunsuri: Raspuns[]) {
  const cereri: { url: string; metoda: string; antete: Record<string, string>; corp: unknown }[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    cereri.push({
      url: String(url),
      metoda: String(init?.method ?? "GET"),
      antete: (init?.headers ?? {}) as Record<string, string>,
      corp: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    if (r.octeti) return new Response(r.octeti.buffer as ArrayBuffer, { status: r.status });
    const text = r.text !== undefined ? r.text : JSON.stringify(r.corp ?? null);
    return new Response(r.status === 204 ? null : text, { status: r.status });
  }) as unknown as typeof fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

async function cu<T>(raspunsuri: Raspuns[], treaba: () => Promise<T>) {
  const f = fetchFals(raspunsuri);
  try {
    return { rod: await treaba(), cereri: f.cereri };
  } finally {
    f.restaureaza();
  }
}

/**
 * Eroarea aruncata de o functie care TREBUIE sa arunce.
 *
 * ⚠ Paza sta IN AFARA lui `try`, si nu e un detaliu de stil.
 *
 * Prima forma facea `throw new Error("ar fi trebuit sa arunce")` chiar in `try`,
 * deci propriul `catch` o inghitea si o intorcea ca si cum ar fi fost eroarea
 * furnizorului. Iar `verdictFurnizor` raspunde „necunoscut" pentru orice eroare
 * care n-a trecut prin `eroareRefuz` — adica TOATE probele care verificau
 * „nu stim" treceau si cand functia nu arunca deloc. Erau patru, si acopereau
 * exact verdictul care opreste registrul sa deblocheze o reincercare, adica sa
 * creeze a doua partida reala si facturata.
 *
 * Dovada ca acum chiar prind: cu `tipuriDeStatus` intors la `return []`, proba
 * „o lista de alta forma NU e o lista goala" trebuie sa CADA.
 */
async function eroareaDin(raspunsuri: Raspuns[], treaba: () => Promise<unknown>): Promise<Error> {
  const f = fetchFals(raspunsuri);
  let prinsa: Error | null = null;
  try {
    await treaba();
  } catch (e) {
    prinsa = e as Error;
  } finally {
    f.restaureaza();
  }
  if (!prinsa) throw new Error("ar fi trebuit sa arunce");
  return prinsa;
}

// ─── Cererea ──────────────────────────────────────────────────────────────────

test("autentificarea e HTTP Basic, pe fiecare cerere", () => {
  const asteptat = `Basic ${Buffer.from("api@magazin.ro:secret").toString("base64")}`;
  return cu([{ status: 201, corp: [{ id: 5, bordereau_id: 9 }] }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  ).then(({ cereri }) => {
    assert.equal(cereri[0].antete.Authorization, asteptat);
  });
});

test("crearea merge pe POST /consignments, cu partida in corp", async () => {
  const { cereri } = await cu([{ status: 201, corp: [{ id: 5, bordereau_id: 9 }] }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.equal(cereri[0].metoda, "POST");
  assert.equal(cereri[0].url, "https://clientplus.pallex.ro/api/v1/consignments");
  assert.deepEqual(cereri[0].corp, PARTIDA);
});

test("⚠ datele de acces nu ajung niciodata in corpul cererii", () => {
  /* Sunt in antet, si numai acolo — altfel ar intra in logurile furnizorului. */
  return cu([{ status: 201, corp: [{ id: 5 }] }], () => creeazaPartida(CONFIG, PARTIDA))
    .then(({ cereri }) => {
      const corp = JSON.stringify(cereri[0].corp);
      assert.ok(!corp.includes("secret"), corp);
      assert.ok(!corp.includes("api@magazin.ro"), corp);
    });
});

// ─── Raspunsul crearii ────────────────────────────────────────────────────────

test("⚠ raspunsul crearii e un TABLOU, nu un obiect", async () => {
  /*
   * Exemplul din specificatie e `- id: 1234567 / bordereau_id: …`, adica un
   * tablou cu o intrare. Citit ca obiect, `raspuns.id` ar fi fost `undefined` la
   * FIECARE apel — fara nicio eroare, si cu partida deja creata la ei.
   */
  const { rod } = await cu([{ status: 201, corp: [{ id: 1234567, bordereau_id: 100000 }] }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.deepEqual(rod, { id: 1234567, bordereau_id: 100000 });
});

test("si un obiect simplu e citit, daca vreodata se schimba forma", async () => {
  const { rod } = await cu([{ status: 201, corp: { id: 77, bordereau_id: 88 } }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.deepEqual(rod, { id: 77, bordereau_id: 88 });
});

test("⚠ borderoul lipsa NU face crearea sa esueze", async () => {
  /*
   * Partida exista; doar nu stim in ce borderou a intrat, si se afla dintr-o
   * citire. O verificare stricta aici ar fi aruncat pe o partida VIE, iar
   * apelantul ar fi reincercat si ar fi facut a doua.
   */
  const { rod } = await cu([{ status: 201, corp: [{ id: 42 }] }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.deepEqual(rod, { id: 42, bordereau_id: null });
});

test("⚠ un 201 FARA id e „nu stim”, nu „a esuat”", async () => {
  /*
   * Cel mai prost caz: partida probabil exista, dar n-avem cu ce sa o mai atingem.
   * Verdictul trebuie sa ramana nesigur, ca registrul sa blocheze si sa scoata
   * cazul la om — un „esuat" ar debloca reincercarea, adica a doua expediere.
   */
  const e = await eroareaDin([{ status: 201, corp: [{}] }], () => creeazaPartida(CONFIG, PARTIDA));
  assert.equal(verdictFurnizor(e), "necunoscut");
});

// ─── Verdictele ───────────────────────────────────────────────────────────────

test("⚠ 401 si 403 sunt refuzuri DOVEDITE, cu mesaj pe intelesul omului", async () => {
  const e401 = await eroareaDin([{ status: 401, corp: { status: 0, error: "Not Authorized" } }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.equal(verdictFurnizor(e401), "esuat");
  assert.ok(/utilizatorul si parola/i.test(e401.message), e401.message);

  const e403 = await eroareaDin([{ status: 403, corp: { status: 0, error: "Forbidden" } }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.equal(verdictFurnizor(e403), "esuat");
});

test("⚠ 422 spune CARE campuri, in romana", async () => {
  /*
   * Forma reala din specificatie: `{"status": 422, "meta": ["collection_date",
   * "delivery_date"]}` — fara niciun text. Netradusa, comerciantul primea „eroare
   * 422" sec si nu afla niciodata ca problema e data de ridicare.
   */
  const e = await eroareaDin(
    [{ status: 422, corp: { status: 422, meta: ["collection_date", "consignee_postcode"] } }],
    () => creeazaPartida(CONFIG, PARTIDA),
  );
  assert.equal(verdictFurnizor(e), "esuat", "un refuz de validare nu blocheaza comanda");
  assert.ok(e.message.includes("data de ridicare"), e.message);
  assert.ok(e.message.includes("codul postal al destinatarului"), e.message);
});

test("⚠ 500 ramane NESIGUR: partida poate sa fi fost creata", async () => {
  const e = await eroareaDin([{ status: 500, text: "Internal Server Error" }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.equal(verdictFurnizor(e), "necunoscut");
});

test("⚠ un 2xx cu corp necitibil nu e succes", async () => {
  /*
   * O pagina de eroare a unui intermediar, servita cu 200. Citita ca succes, am
   * fi raportat o partida inexistenta; citita ca esec dovedit, am fi deblocat
   * reincercarea. Amandoua sunt gresite: verdictul e „nu stim".
   */
  const e = await eroareaDin([{ status: 200, text: "<html>gateway timeout</html>" }], () =>
    creeazaPartida(CONFIG, PARTIDA),
  );
  assert.equal(verdictFurnizor(e), "necunoscut");
});

test("reteaua cazuta e nesigura, nu un refuz", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
  try {
    await creeazaPartida(CONFIG, PARTIDA);
    assert.fail("ar fi trebuit sa arunce");
  } catch (e) {
    assert.equal(verdictFurnizor(e), "necunoscut");
  } finally {
    globalThis.fetch = original;
  }
});

test("mesajul de eroare cade pe corpul brut cand nu intelege nimic", () => {
  assert.equal(descrieEroarea({ error: "Not Authorized" }, ""), "Not Authorized");
  assert.equal(descrieEroarea({ message: "ceva" }, ""), "ceva");
  assert.equal(descrieEroarea(null, "  boom  "), "boom");
  assert.equal(descrieEroarea(null, ""), "raspuns gol");
  /* Campurile necunoscute pleaca asa cum au venit, nu se inghit. */
  assert.ok(descrieEroarea({ status: 422, meta: ["camp_nou"] }, "").includes("camp_nou"));
});

// ─── Citirea si stergerea ─────────────────────────────────────────────────────

test("citirea partidei ia prima intrare din tablou", async () => {
  const { rod, cereri } = await cu(
    [{ status: 200, corp: [{ id: 5, pallex_id: "C202012345678", status_type_id: 12 }] }],
    () => citestePartida(CONFIG, 5),
  );
  assert.equal(cereri[0].metoda, "GET");
  assert.equal(cereri[0].url, "https://clientplus.pallex.ro/api/v1/consignments/5");
  assert.equal(rod?.pallex_id, "C202012345678");
  assert.equal(rod?.status_type_id, 12);
});

test("stergerea pe 204 e o stergere", async () => {
  const { rod, cereri } = await cu([{ status: 204 }], () => stergePartida(CONFIG, 5));
  assert.equal(cereri[0].metoda, "DELETE");
  assert.deepEqual(rod, { sters: true });
});

test("⚠ 404 la stergere inseamna tot „nu mai exista acolo”", async () => {
  /*
   * Cazul din care s-a nascut ramura: `DELETE` intra in timeout DUPA ce Pall-Ex
   * apucase sa stearga. Verdictul e „nu stim", deci comerciantul incearca din nou
   * si primeste 404. Tratat ca esec, comanda ar fi ramas cu o partida pe care
   * nimeni n-o mai putea scoate: nici anulata (nu mai exista), nici reemisa
   * (registrul o tinea ocupata).
   *
   * ⚠ Corpul e GOL, adica forma pe care o declara chiar specificatia pentru 404
   * la `DELETE`. Prima varianta a probei trimitea „Not Found" in corp — si atunci
   * trecea printr-o cu totul alta ramura (o potrivire pe text), iar recunoasterea
   * codului 404 nu era atinsa niciodata. O proba care confirma altceva decat crezi
   * e mai rea decat lipsa ei.
   */
  const { rod } = await cu([{ status: 404, text: "" }], () => stergePartida(CONFIG, 5));
  assert.deepEqual(rod, { sters: true });
});

test("⚠ 404 se recunoaste si cand furnizorul raspunde in romana", async () => {
  /* Decizia nu are voie sa atarne de limba mesajului. */
  const { rod } = await cu(
    [{ status: 404, corp: { status: 0, error: "Partida nu a fost gasita" } }],
    () => stergePartida(CONFIG, 5),
  );
  assert.deepEqual(rod, { sters: true });
});

test("⚠ „Not Found” intr-un raspuns care NU e 404 nu sterge nimic", async () => {
  /*
   * Cealalta directie a aceleiasi greseli, si cea scumpa: o pagina de eroare a
   * unui intermediar, servita cu 500, care contine cuvintele „404 Not Found".
   * Citita ca stergere, ar fi golit coloanele pe o partida VIE — transport real,
   * pe drum, pe care nu-l mai stie nimeni, si comanda liberata sa emita a doua.
   */
  const { rod } = await cu(
    [{ status: 500, text: "<html><title>404 Not Found</title></html>" }],
    () => stergePartida(CONFIG, 5),
  );
  assert.equal(rod.sters, false);
});

test("⚠ o stergere refuzata dupa validare NU se raporteaza ca reusita", async () => {
  /*
   * `DELETE` merge doar „if not yet validated". Dupa validare marfa chiar pleaca,
   * si AWB-ul nu are voie sa dispara de pe comanda.
   */
  const { rod } = await cu(
    [{ status: 403, corp: { status: 0, error: "Consignment already validated" } }],
    () => stergePartida(CONFIG, 5),
  );
  assert.equal(rod.sters, false);
  assert.ok("motiv" in rod && rod.motiv.length > 0);
});

test("validarea borderoului merge pe POST /bordereaux/{id}/validated", async () => {
  const { cereri } = await cu([{ status: 200, corp: {} }], () => valideazaBorderou(CONFIG, 77));
  assert.equal(cereri[0].metoda, "POST");
  assert.equal(cereri[0].url, "https://clientplus.pallex.ro/api/v1/bordereaux/77/validated");
});

// ─── Documente ────────────────────────────────────────────────────────────────

test("documentele se cer pe caile lor, si vin ca octeti", async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // „%PDF"
  const { rod, cereri } = await cu([{ status: 200, octeti: pdf }], () =>
    documentPartidei(CONFIG, 5, "label"),
  );
  assert.equal(cereri[0].url, "https://clientplus.pallex.ro/api/v1/consignments/5/label");
  assert.ok(rod && rod.length === 4);

  const { cereri: c2 } = await cu([{ status: 200, octeti: pdf }], () =>
    documentPartidei(CONFIG, 5, "note"),
  );
  assert.equal(c2[0].url, "https://clientplus.pallex.ro/api/v1/consignments/5/note");
});

test("⚠ documentul inca inexistent da null, nu eroare", async () => {
  /* Eticheta si avizul apar de obicei abia dupa validarea borderoului. */
  const { rod } = await cu([{ status: 404, text: "" }], () => documentPartidei(CONFIG, 5, "label"));
  assert.equal(rod, null);
});

test("⚠ un 200 cu zero octeti nu e un PDF", async () => {
  /*
   * Intors ca atare, s-ar fi salvat in CDN un fisier gol — si de atunci incolo
   * descarcarea ar fi servit instantaneu nimic, fara sa mai intrebe Pall-Ex.
   */
  const { rod } = await cu([{ status: 200, octeti: new Uint8Array(0) }], () =>
    documentPartidei(CONFIG, 5, "label"),
  );
  assert.equal(rod, null);
});

// ─── Statusuri si proba de conexiune ──────────────────────────────────────────

test("⚠ o lista de statusuri de alta forma NU e o lista goala", async () => {
  /*
   * Cronul deosebeste „magazinul chiar n-are statusuri" de „nu am putut afla":
   * pe al doilea nu misca nicio comanda si nu inainteaza memoria. Intors ca
   * tablou gol, i-am fi spus prima varianta cand era a doua.
   */
  const e = await eroareaDin([{ status: 200, corp: { mesaj: "altceva" } }], () =>
    tipuriDeStatus(CONFIG),
  );
  assert.equal(verdictFurnizor(e), "necunoscut");
});

test("lista de statusuri se curata de intrarile stricate", async () => {
  const { rod } = await cu(
    [{ status: 200, corp: [{ id: 12, name: "In hub" }, { id: "x", name: "Aiurea" }, { name: "Fara id" }] }],
    () => tipuriDeStatus(CONFIG),
  );
  assert.deepEqual(rod, [{ id: 12, name: "In hub" }]);
});

test("⚠ proba de conexiune e o CITIRE, nu o creare", async () => {
  /*
   * Butonul „Testeaza conexiunea" se apasa de zece ori pana ies datele bune. Daca
   * ar crea o partida, ar produce zece transporturi reale.
   */
  const { rod, cereri } = await cu([{ status: 200, corp: [{ id: 12, name: "In hub" }] }], () =>
    probaConexiune(CONFIG),
  );
  assert.equal(cereri.length, 1);
  assert.equal(cereri[0].metoda, "GET");
  assert.ok(cereri[0].url.endsWith("/consignment_status_types"));
  assert.deepEqual(rod, { ok: true, statusuri: 1 });
});

test("proba de conexiune cu parola gresita iese ROSU, cu mesajul ei", async () => {
  const { rod } = await cu([{ status: 401, corp: { status: 0, error: "Not Authorized" } }], () =>
    probaConexiune(CONFIG),
  );
  assert.equal(rod.ok, false);
  assert.ok("eroare" in rod && /parola/i.test(rod.eroare), JSON.stringify(rod));
});
