import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dupaEsec, candSeReincearca, PAUZE_MINUTE, MAX_INCERCARI } from "./ritm-reincercari";
import { sarcinaGolita } from "./coada-conversii";

const citeste = (p: string) => readFileSync(p, "utf8");
import { sarcinaTikTok, eRefuz, externalId, type SarcinaTikTok } from "./sarcina-tiktok";
import { catreTikTok } from "../adaptor-tiktok";
import type { EvenimentEdinio } from "../evenimente";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  COADA DE CONVERSII — PARTEA CARE SE POATE PROBA FARA RETEA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E ATATA GRIJA PENTRU O FORMA DE MESAJ. Masurat pe 02.09.2026, impotriva
  serverului TikTok adevarat: am trimis dinadins o valoare FARA moneda si am
  primit `{"code": 0, "message": "OK"}`.

  Raspunsul lor dovedeste ca mesajul a AJUNS, nu ca e bun. Greselile de continut
  se vad abia in Events Manager, zile mai tarziu, sau deloc. Dimineata, pixelul
  din browser cel putin striga in consola despre `content_type` invalid; de pe
  server nu striga nimeni.

  Deci singura paza e aici.
*/

const CTX = { ip: "81.196.1.1", userAgent: "Mozilla/5.0", url: "https://www.edinio.com/", referrer: null };
const PIXEL = "DAC0RFJC77UC8FLJHJC0";

const semnatura = (x: SarcinaTikTok) => x.data[0] as Record<string, unknown>;

/* ═══ 1. Ritmul reincercarilor ═══ */

test("pauzele cresc, si dupa ultima se abandoneaza", () => {
  /*
    ⚠ CE APARA. Reincercarea prea deasa ne face limitati de furnizor, si atunci
    pica si ce ar fi mers. Reincercarea la nesfarsit tine un rand stricat in coada
    pentru totdeauna, iar coada nu se mai goleste.
  */
  /*
    ⚠ CUM ARATA O PROBA VERDE CARE APARA DEFECTUL. Aici scria, pana pe
    02.09.2026:

        assert.deepEqual(dupaEsec(1), { ..., pesteMinute: PAUZE_MINUTE[1] });

    Adica OGLINDEA indicele din implementare in loc sa ceara regula din
    comentariul functiei („dupa primul esec se primeste PRIMA pauza"). Cum si
    codul citea `PAUZE_MINUTE[incercari]`, cele doua greseli se potriveau si proba
    era verde. Defectul — pauza de un minut nefolosita niciodata, si cinci
    reincercari in loc de sase — a stat ascuns sub ea.

    Se cere acum SIRUL TRAIT, jucand esecurile unul dupa altul; vezi
    `ritm-reincercari.test.ts`. O proba care joaca nu se poate potrivi cu o
    greseala de indice, fiindca nu stie ce indice foloseste codul.
  */
  const pauze: number[] = [];
  for (let n = 1; ; n++) {
    const h = dupaEsec(n);
    if (h.fel === "abandoneaza") { assert.equal(n, MAX_INCERCARI); break; }
    pauze.push(h.pesteMinute);
    assert.ok(n < 100, "nu se abandoneaza niciodata");
  }
  assert.deepEqual(pauze, [...PAUZE_MINUTE], "sirul trait nu e cel declarat");

  for (let i = 1; i < pauze.length; i++) {
    assert.ok(pauze[i] > pauze[i - 1], `pauza ${i} nu e mai mare decat cea dinainte`);
  }
});

test("un numar de incercari stricat nu opreste coada si nu sare peste pauza", () => {
  /* Zero, negativ sau NaN: se ia prima pauza, nu se abandoneaza si nu se reincearca pe loc. */
  for (const n of [0, -3, Number.NaN]) {
    assert.deepEqual(dupaEsec(n), { fel: "reincearca", pesteMinute: PAUZE_MINUTE[0] }, `pentru ${n}`);
  }
});

test("clipa urmatoarei incercari se socoteste din ceasul dat, nu din cel de sistem", () => {
  const acum = new Date("2026-09-02T12:00:00.000Z");
  assert.equal(candSeReincearca(acum, 20), "2026-09-02T12:20:00.000Z");
});

/* ═══ 2. Forma mesajului ═══ */

test("⚠ o valoare FARA moneda nu pleaca, desi TikTok ar raspunde OK", () => {
  /*
    Probat impotriva serverului lor: `{"value": 249}` fara `currency` intoarce
    `code: 0`. In rapoartele lor devine venit fara unitate — o cifra care arata a
    masuratoare si nu se poate aduna cu nimic.
  */
  const stricat = {
    name: "purchase", plan_id: "premium", billing_period: "monthly",
    value: 249, currency: undefined as unknown as "RON", event_id: "x1",
  } as unknown as EvenimentEdinio;

  const r = sarcinaTikTok(stricat, CTX, PIXEL, "cont-1");
  assert.ok(eRefuz(r), "a plecat o valoare fara moneda");
  assert.match(r.motiv, /moneda/);
});

test("⚠ un eveniment fara `event_id` nu pleaca — n-ar avea ce deduplica", () => {
  /*
    Rostul intregii cozi e ca acelasi eveniment sa ajunga si din browser, si de pe
    server, si sa fie unit. Fara id, ar fi doua conversii pentru un singur om — si
    costul pe achizitie raportat s-ar injumatati, in favoarea noastra.
  */
  const r = sarcinaTikTok({ name: "begin_checkout", billing_period: "monthly", value: 249, currency: "RON" }, CTX, PIXEL, "cont-1");
  assert.ok(eRefuz(r));
  assert.match(r.motiv, /event_id/);
});

test("un eveniment fara cartografiere spre TikTok e refuzat CU MOTIV, nu ignorat", () => {
  /*
    ⚠ NU `null` TACUT. Un refuz fara motiv ar fi facut coada sa para golita cand
    de fapt evenimentele erau aruncate — exact felul de zero care m-a pacalit de
    trei ori azi.
  */
  const r = sarcinaTikTok({ name: "scroll_depth", percent: 50 }, CTX, PIXEL, "cont-1");
  assert.ok(eRefuz(r));
  assert.match(r.motiv, /cartografiere/);
});

test("fara id de pixel nu se trimite nimic", () => {
  const r = sarcinaTikTok({ name: "sign_up", signup_origin: "email", event_id: "x" }, CTX, "", "cont-1");
  assert.ok(eRefuz(r));
  assert.match(r.motiv, /pixel/);
});

/* ═══ 3. Aceeasi cartografiere ca in browser ═══ */

test("⚠ serverul trimite EXACT numele si continutul pe care le trimite si browserul", () => {
  /*
    ═══ ASTA E CONDITIA CA DEDUPLICAREA SA AIBA CE UNI ═══

    Daca serverul ar avea tabelul lui de cartografiere, ar incepe identic si s-ar
    desparti la prima schimbare. Atunci acelasi eveniment ar pleca sub doua nume,
    iar TikTok ar vedea doua conversii deosebite cu acelasi `event_id` — sau, mai
    rau, nu le-ar mai lega deloc.

    Proba cere ca ce iese din `sarcinaTikTok` sa fie ce da `catreTikTok`.
  */
  const ev: EvenimentEdinio = {
    name: "purchase", plan_id: "ultra", billing_period: "annual",
    value: 999, currency: "RON", event_id: "amprenta-magazin",
  };

  const dinBrowser = catreTikTok(ev)!;
  const r = sarcinaTikTok(ev, CTX, PIXEL, "cont-1");
  assert.ok(!eRefuz(r), "mesajul a fost refuzat pe nedrept");

  const d = semnatura(r);
  assert.equal(d.event, dinBrowser.nume, "numele evenimentului difera intre browser si server");
  assert.equal(d.event_id, dinBrowser.eventId, "id-ul difera — nu se pot uni");
  assert.deepEqual(d.properties, dinBrowser.date, "continutul difera intre cele doua drumuri");
});

/* ═══ 4. Ce se pune si ce NU se pune in mesaj ═══ */

test("⚠ nu se trimit campuri goale: ce nu stim lipseste, nu e gol", () => {
  /*
    Un `ip: ""` sau `referrer: null` trimis e o afirmatie despre ceva ce n-am
    masurat. Aceeasi regula ca la `country` in analitica magazinelor.
  */
  const r = sarcinaTikTok(
    { name: "sign_up", signup_origin: "google", event_id: "x" },
    { ip: null, userAgent: null, url: null, referrer: null },
    PIXEL, "cont-1",
  );
  assert.ok(!eRefuz(r));
  const d = semnatura(r);
  const user = d.user as Record<string, unknown>;
  assert.deepEqual(Object.keys(user), ["external_id"], "s-au trimis campuri pe care nu le stim");
  assert.ok(!("page" in d), "s-a trimis o pagina goala");
});

test("`event_time` e in SECUNDE, nu in milisecunde", () => {
  /*
    ⚠ Trimis in milisecunde, evenimentul cade in anul 57.000 — iar furnizorii
    resping tacut ce e in viitor. Un `Date.now()` uitat neimpartit e cea mai
    obisnuita forma a defectului asta.
  */
  const r = sarcinaTikTok({ name: "sign_up", signup_origin: "email", event_id: "x" }, CTX, PIXEL, "c");
  assert.ok(!eRefuz(r));
  const t = semnatura(r).event_time as number;
  const acum = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(t - acum) < 5, `event_time=${t} nu arata a secunde de acum`);
});

test("⚠ `external_id` e alt lucru decat `event_id`, si are 64 de caractere", () => {
  /*
    `event_id` raspunde la „care eveniment", `external_id` la „care om". Folosite
    unul in locul altuia, deduplicarea si potrivirea audientei ar depinde una de
    alta fara motiv. Iar TikTok asteapta un hash intreg, nu amprenta noastra
    scurta de 32 de caractere.
  */
  const a = externalId("cont-1");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, externalId("cont-1"), "acelasi om da alt id");
  assert.notEqual(a, externalId("cont-2"), "doi oameni deosebiti au acelasi id");

  const r = sarcinaTikTok({ name: "sign_up", signup_origin: "email", event_id: "amprenta-eveniment" }, CTX, PIXEL, "cont-1");
  assert.ok(!eRefuz(r));
  const d = semnatura(r);
  assert.notEqual((d.user as Record<string, unknown>).external_id, d.event_id, "cele doua id-uri s-au amestecat");
});

/* ═══ Clipa petrecerii, nu a trimiterii ═══ */

test("⚠ `event_time` e clipa cand s-a petrecut, nu cea cand se trimite", () => {
  /*
    ⚠ CE APARA, SI DE CE NU SE VEDEA. Pana pe 02.09.2026 clipa se lua cu
    `Date.now()` chiar la construirea mesajului. Pe drumul obisnuit — punere la
    coada, cron peste cel mult un minut — diferenta era de secunde, deci nimic
    n-ar fi aratat vreodata ca e gresit.

    Se vedea abia la o REINCERCARE: un rand esuat asteapta pana la 12 ore inainte
    de ultima incercare. Furnizorii atribuie conversia dupa `event_time`, deci
    inscrierea de marti seara ar fi cazut miercuri dimineata, pe alta campanie.
  */
  const acumSecunde = Math.floor(Date.now() / 1000);
  const acumSaptePreOre = new Date(Date.now() - 7 * 3600_000).toISOString();

  const m = sarcinaTikTok(
    { name: "sign_up", signup_origin: "email", event_id: "abc123" },
    CTX, PIXEL, "om-1", acumSaptePreOre,
  );
  assert.ok(!eRefuz(m));
  const t = semnatura(m as SarcinaTikTok).event_time as number;

  assert.ok(
    Math.abs(t - Math.floor(Date.parse(acumSaptePreOre) / 1000)) <= 1,
    `event_time ${t} nu e clipa data, ci ${acumSecunde - t} secunde mai tarziu`,
  );
  assert.ok(t < acumSecunde - 3600, "event_time a ramas lipit de ceasul trimiterii");
});

test("o clipa lipsa sau stricata cade inapoi pe acum, nu pe NaN", () => {
  /* ⚠ Un `NaN` trimis ca `event_time` ar fi respins tacut de ei. */
  for (const rea of [undefined, "", "nu e o data", "2026-13-45"]) {
    const m = sarcinaTikTok(
      { name: "sign_up", signup_origin: "email", event_id: "abc123" },
      CTX, PIXEL, "om-1", rea as string | undefined,
    );
    assert.ok(!eRefuz(m), `refuzat pentru ${JSON.stringify(rea)}`);
    const t = semnatura(m as SarcinaTikTok).event_time as number;
    assert.ok(Number.isFinite(t), `event_time nefinit pentru ${JSON.stringify(rea)}`);
    assert.ok(Math.abs(t - Math.floor(Date.now() / 1000)) <= 5, `nu a cazut pe acum pentru ${JSON.stringify(rea)}`);
  }
});

/* ═══ Ce ramane dupa ce conversia a plecat ═══ */

test("⚠ dupa trimitere nu mai ramane nimic despre OM", () => {
  /*
    ═══ ⚠ DE CE SE GOLESTE LA TRIMITERE, SI NU PESTE 30 DE ZILE ═══

    `sarcina` poarta ip-ul omului, browserul lui, si martorii lasati de pixeli
    (`_fbp`, `_fbc`, `_ttp`). Toate exista dintr-un singur motiv: sa se poata
    cladi mesajul catre furnizor.

    In clipa in care mesajul a plecat, motivul s-a stins. Ce ramane nu mai e o
    unealta, e un risc care se aduna — randurile astea n-aveau nicio stergere,
    deci ip-ul ar fi stat acolo la nesfarsit.

    ⚠ Masurat inainte de reparatie: doua randuri in productie, amandoua cu ip.
  */
  const intreaga = {
    ev: { name: "sign_up", signup_origin: "email", event_id: "e1" },
    cand: "2026-09-02T21:00:00.000Z",
    ctx: { ip: "81.196.9.9", userAgent: "Mozilla/5.0", referrer: "https://google.com/" },
    amprentaOmului: "f".repeat(32),
    martori: { fbp: "fb.1.1.1", fbc: "fb.1.1.CLICKID", ttp: "tt.1" },
  } as never;

  const ramas = JSON.stringify(sarcinaGolita(intreaga));

  for (const urma of ["81.196.9.9", "Mozilla", "google.com", "CLICKID", "fb.1.1.1", "tt.1", "f".repeat(32)]) {
    assert.ok(!ramas.includes(urma), `a ramas o urma despre om: "${urma}"`);
  }

  /* ⚠ Si ce TREBUIE sa ramana: destul cat sa se stie ce s-a trimis si cand. */
  const obj = sarcinaGolita(intreaga) as { ev: { name: string }; cand?: string };
  assert.equal(obj.ev.name, "sign_up", "s-a pierdut si numele evenimentului");
  assert.equal(obj.cand, "2026-09-02T21:00:00.000Z", "s-a pierdut clipa");
});

test("⚠ la ESEC sarcina ramane intreaga — altfel reincercarea n-are din ce", () => {
  /*
    ⚠ CE APARA. Golirea sta in `marcheazaTrimis`, nu in `marcheazaEsuat`, si
    deosebirea nu e de stil: un rand esuat se reincearca de sase ori, iar mesajul
    se cladeste de fiecare data din sarcina. Golit la primul esec, randul ar fi
    fost reincercat de cinci ori cu o sarcina fara nimic in ea — si ar fi esuat
    de cinci ori, fara ca nimic sa spuna de ce.
  */
  const cod = citeste("src/lib/edinio-marketing/server/coada-conversii.ts");
  const iEsuat = cod.indexOf("export async function marcheazaEsuat");
  assert.ok(iEsuat > 0, "nu mai exista marcarea esecului");
  assert.ok(
    !cod.slice(iEsuat).includes("sarcinaGolita"),
    "esecul goleste sarcina — reincercarea ar ramane fara ce sa trimita",
  );

  const iTrimis = cod.indexOf("export async function marcheazaTrimis");
  assert.ok(cod.slice(iTrimis, iEsuat > iTrimis ? iEsuat : cod.length).includes("sarcinaGolita"),
    "izbanda nu mai goleste sarcina");
});

test("⚠ cronul chiar ii DA sarcina, altfel golirea nu se intampla", () => {
  /*
    ⚠ `marcheazaTrimis(id)` fara al doilea argument lasa sarcina neatinsa — o
    cadere inapoi blanda, care ar fi facut golirea sa para pusa si sa nu fie.
  */
  const cron = citeste("src/app/api/cron/conversii/route.ts");
  assert.match(cron, /marcheazaTrimis\(r\.id, r\.sarcina\)/,
    "cronul cheama marcheazaTrimis fara sarcina — nimic nu se goleste");
});
