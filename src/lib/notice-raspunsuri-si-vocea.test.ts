import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import {
  asazaRaspunsurile, asazaApelul, citesteRaspunsurile, randulApelului, stareaVocii, ETICHETA_VOCE,
} from "./notice-raspunsuri";
import { ceruOprirea, numarNormalizat } from "./sms-dezabonare";
import { adresaPublica } from "./adresa-publica";
import { sendNoticeAudio, NOTICE_AUDIO_MAX } from "./notice";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * notice.ro: RASPUNSUL PE CARE NU-L AUZEA NIMENI          (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA, inainte de a deschide codul: 405 SMS-uri in trei luni (28.06 - 17.09),
 * 402 reusite, 3 magazine, trafic si azi dimineata; 399 dintre ele de la UN singur magazin. notice.ro
 * duce TOT traficul real de SMS al platformei; SMSO, cel trecut ieri, avea zero.
 *
 * Si: `notice_inbox` cu ZERO randuri, `sms_optout` cu zero, ZERO apeluri de voce in tot jurnalul.
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 * 1. `getNoticeInboundSms` era scrisa anume pentru `GET /sms-in` si NU O CHEMA NIMENI. E singurul
 *    drum DOCUMENTAT catre ce scrie cumparatorul.
 * 2. Calea de cos abandonat a lui notice.ro n-avea nicio garda de dezabonare, iar ea se incearca
 *    PRIMA, deci garda scrisa ieri la SMSO era ocolita cu totul.
 * 3. Callback-ul apelurilor de voce se pierdea in intregime. Iar documentatia are OPT stari, nu patru,
 *    si una dintre ele (`delivered`) nici nu e un rezultat al apelului.
 * 4. Adresa de callback se compunea pe APEX, care raspunde 308 catre `www`, si la fel adresa pe care
 *    o COPIAZA comerciantul in notice.ro.
 * 5. `POST /audio` intoarce `audio_id`, pe care nu-l citea nimeni: randul apelului ramanea fara id.
 *
 * ═══ SI CE AM GRESIT EU, IN ACEEASI ZI, PRINS INAINTE DE COMMIT ═══
 *
 * 6. ⚠⚠ Indexul unic PARTIAL facea ca FIECARE scriere a cronului sa cada cu 42P10 (masurat pe
 *    productie). Probele de atunci treceau verde: baza lor falsa accepta orice upsert.
 * 7. Am scris in trei comentarii ca notice.ro „nu impinge nimic”. Nedovedit: pagina lor promite
 *    callback-uri, iar magazinul cu 399 de SMS-uri n-a avut niciodata o adresa de webhook.
 */

type Rand = Record<string, unknown>;
type Filtru = ["eq" | "in", string, unknown];

/**
 * O baza falsa care se poarta ca PostgREST acolo unde conteaza pentru regula: filtreaza pe
 * `eq`/`in`, iar un upsert cu `ignoreDuplicates` NU intoarce randul care exista deja.
 *
 * ⚠ Ce NU poate face: sa refuze un `onConflict` pe care Postgres nu-l poate potrivi cu un index. Asta
 * s-a intamplat chiar aici (indexul partial, 42P10), deci forma indexului se probeaza separat, pe
 * schema FOTOGRAFIATA DIN PRODUCTIE, mai jos.
 */
function bazaFalsa(init: Partial<Record<string, Rand[]>> = {}, opt: { citireCade?: boolean; scriereCade?: boolean } = {}) {
  const tabele: Record<string, Rand[]> = {
    notice_sms_log: [...(init.notice_sms_log ?? [])],
    notice_inbox: [...(init.notice_inbox ?? [])],
    sms_optout: [...(init.sms_optout ?? [])],
  };
  const eroare = { message: "baza a picat" };
  const potriveste = (filtre: Filtru[]) => (r: Rand) =>
    filtre.every(([op, col, v]) => (op === "eq" ? r[col] === v : (v as unknown[]).includes(r[col])));
  const scriere = (rez: { data: unknown; error: unknown }) =>
    Object.assign(Promise.resolve(rez), { select: () => Promise.resolve(rez) });

  const admin = {
    from(tabel: string) {
      const randuri = (tabele[tabel] ??= []);
      return {
        select() {
          const filtre: Filtru[] = [];
          const lant = {
            eq(c: string, v: unknown) { filtre.push(["eq", c, v]); return lant; },
            in(c: string, v: unknown[]) { filtre.push(["in", c, v]); return lant; },
            limit() { return lant; },
            then(ok: (x: unknown) => unknown, rau?: (e: unknown) => unknown) {
              const rez = opt.citireCade ? { data: null, error: eroare } : { data: randuri.filter(potriveste(filtre)), error: null };
              return Promise.resolve(rez).then(ok, rau);
            },
          };
          return lant;
        },
        upsert(rand: Rand, o: { onConflict: string; ignoreDuplicates?: boolean }) {
          if (opt.scriereCade) return scriere({ data: null, error: eroare });
          const chei = o.onConflict.split(",");
          /* Ca in Postgres: o cheie NULL nu se ciocneste cu nimic. */
          const exista = randuri.some((r) => chei.every((k) => rand[k] != null && r[k] === rand[k]));
          if (exista) return scriere({ data: [], error: null });
          randuri.push({ ...rand });
          return scriere({ data: [{ id: `r${randuri.length}` }], error: null });
        },
        insert(rand: Rand) {
          if (opt.scriereCade) return scriere({ data: null, error: eroare });
          randuri.push({ ...rand, __insert: true });
          return scriere({ data: [{ id: `r${randuri.length}` }], error: null });
        },
        update(patch: Rand) {
          const filtre: Filtru[] = [];
          const lant = {
            eq(c: string, v: unknown) { filtre.push(["eq", c, v]); return lant; },
            then(ok: (x: unknown) => unknown, rau?: (e: unknown) => unknown) {
              if (opt.scriereCade) return Promise.resolve({ error: eroare }).then(ok, rau);
              for (const r of randuri.filter(potriveste(filtre))) Object.assign(r, patch);
              return Promise.resolve({ error: null }).then(ok, rau);
            },
          };
          return lant;
        },
      };
    },
  };
  return { admin: admin as never, tabele };
}

/** Un magazin care i-a scris prin notice.ro lui 0722334455. */
const SCRIS_LUI = { business_id: "biz-1", provider: "notice", channel: "sms", phone: "0722334455" };

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

async function cuFetch<T>(raspuns: (url: string) => Response, fn: (apeluri: string[]) => Promise<T>): Promise<T> {
  const vechi = globalThis.fetch;
  const apeluri: string[] = [];
  globalThis.fetch = (async (u: string | URL | Request) => { const s = String(u); apeluri.push(s); return raspuns(s); }) as typeof fetch;
  try { return await fn(apeluri); } finally { globalThis.fetch = vechi; }
}
const json = (corp: unknown) => new Response(JSON.stringify(corp), { status: 200, headers: { "content-type": "application/json" } });

describe("Raspunsurile se citesc si «STOP» se tine minte", () => {
  test("⚠⚠ un «STOP» ajunge in ACELASI tabel pe care il citeste si SMSO", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    await asazaRaspunsurile(admin, "biz-1", [
      { id: "1", number: "0722334455", message: "STOP", created_at: null, status: null },
    ]);
    assert.equal(tabele.sms_optout.length, 1, "oprirea nu s-a tinut minte deloc");
    assert.equal(tabele.sms_optout[0].sursa, "raspuns_stop_notice");
  });

  test("⚠⚠ numarul intra in forma SMSO, nu in forma notice", async () => {
    /*
     * ⚠ ASTA E CAPCANA CARE AR FI FACUT TABELUL SA MINTA. notice.ro isi normalizeaza numerele la
     * `07XXXXXXXX`, SMSO la `7XXXXXXXX`. Scrise fiecare cu forma lui, acelasi om ar fi fost DOUA
     * randuri in `sms_optout`, si niciuna dintre garzi n-ar fi gasit randul scris de cealalta.
     */
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    await asazaRaspunsurile(admin, "biz-1", [
      { id: "1", number: "+40722334455", message: "stop", created_at: null, status: null },
    ]);
    assert.equal(tabele.sms_optout[0]?.phone, "722334455", "numarul s-a scris in alta forma decat cea pe care o cauta SMSO");
    assert.equal(tabele.sms_optout[0]?.phone, numarNormalizat("0722334455"));
  });

  test("⚠ oprirea se tine minte SI cand mesajul n-are id", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const b = await asazaRaspunsurile(admin, "biz-1", [
      { id: null, number: "0722334455", message: "Stop.", created_at: null, status: null },
    ]);
    assert.equal(b.opriri, 1, "oprirea s-a pierdut fiindca mesajul n-avea id");
    assert.equal(b.faraId, 1);
    assert.equal(tabele.notice_inbox.length, 0, "la TRAGERE, un rand fara id a intrat in inbox, deci se va dubla la fiecare ora");
  });

  test("⚠⚠ recitirea aceleiasi liste nu dubleaza nimic, si nu se mai numara ca «scrisa»", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const lista = [{ id: "7", number: "0722334455", message: "Multumesc!", created_at: null, status: null }];
    const intai = await asazaRaspunsurile(admin, "biz-1", lista);
    const aDoua = await asazaRaspunsurile(admin, "biz-1", lista);
    assert.equal(tabele.notice_inbox.length, 1, "cronul a dublat raspunsul la a doua trecere");
    assert.equal(tabele.notice_inbox[0].provider_id, "7", "fara id-ul lor, indexul unic n-are pe ce sa lucreze");
    assert.equal(intai.scrise, 1);
    /* ⚠ Prima forma numara fiecare incercare, deci bilantul arata aceleasi raspunsuri „scrise” din ora in ora. */
    assert.equal(aDoua.scrise, 0, "un rand care exista deja s-a numarat ca scris");
  });

  test("un raspuns obisnuit NU dezaboneaza pe nimeni", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const b = await asazaRaspunsurile(admin, "biz-1", [
      { id: "8", number: "0722334455", message: "nu vreau dezabonare, doar o intrebare", created_at: null, status: null },
    ]);
    /* ⚠ TEXTUL E ALES ANUME: CONTINE cuvantul, dar nu INCEPE cu el. */
    assert.equal(b.opriri, 0, "«stop» cautat oriunde in text a dezabonat un om care punea o intrebare");
    assert.equal(tabele.sms_optout.length, 0);
  });

  test("regula «a cerut oprirea» e UNA singura, pentru amandoi furnizorii", () => {
    assert.equal(ceruOprirea("STOP"), true);
    assert.equal(ceruOprirea("stop va rog"), true);
    assert.equal(ceruOprirea("dezabonare"), true);
    assert.equal(ceruOprirea("nu vreau dezabonare, doar o intrebare"), false);
    assert.equal(ceruOprirea("va rog nu stop"), false);
    assert.equal(ceruOprirea(""), false);
    assert.equal(ceruOprirea(null), false);
    const w = viu("src/app/api/smso/webhook/route.ts");
    assert.ok(!/const CUVINTE_DE_OPRIRE/.test(w), "webhook-ul SMSO si-a pastrat a doua copie a regulii");
    assert.match(w, /ceruOprirea/, "webhook-ul SMSO nu mai foloseste regula deloc");
  });
});

describe("Doar de la numere carora magazinul le-a scris prin notice.ro", () => {
  /*
   * Forma lui `/sms-in` nu e documentata: nu stim daca lista are doar raspunsuri la mesajele noastre
   * sau tot ce a primit contul. Iar pe webhook, adresa nu e semnata: cine ar afla-o ar putea insira
   * numere straine ca sa le blocheze.
   */
  test("⚠⚠ un numar caruia nu i-am scris nu intra nici in inbox, nici in lista de oprire", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const b = await asazaRaspunsurile(admin, "biz-1", [
      { id: "9", number: "0733111222", message: "STOP", created_at: null, status: null },
    ]);
    assert.equal(b.straini, 1);
    assert.equal(tabele.sms_optout.length, 0, "un numar strain a fost pus pe lista de oprire");
    assert.equal(tabele.notice_inbox.length, 0, "mesajul unui strain a intrat in inbox-ul magazinului");
  });

  test("⚠ un numar caruia i-a scris ALT magazin e tot strain", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [{ ...SCRIS_LUI, business_id: "biz-2" }] });
    const b = await asazaRaspunsurile(admin, "biz-1", [
      { id: "9", number: "0722334455", message: "Buna ziua", created_at: null, status: null },
    ]);
    assert.equal(b.straini, 1, "raspunsul clientului altui magazin a ajuns la magazinul asta");
    assert.equal(tabele.notice_inbox.length, 0);
  });

  test("⚠ un numar caruia i s-a scris doar prin SMSO nu raspunde la notice.ro", async () => {
    const { admin } = bazaFalsa({ notice_sms_log: [{ ...SCRIS_LUI, provider: "smso" }] });
    const b = await asazaRaspunsurile(admin, "biz-1", [
      { id: "9", number: "0722334455", message: "Buna ziua", created_at: null, status: null },
    ]);
    assert.equal(b.straini, 1);
  });

  test("⚠⚠ o citire picata ARUNCA, nu socoteste pe toti straini", async () => {
    /* Cu lista goala, fiecare raspuns ar fi parut strain si s-ar fi aruncat, inclusiv un „STOP”. */
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] }, { citireCade: true });
    await assert.rejects(asazaRaspunsurile(admin, "biz-1", [
      { id: "1", number: "0722334455", message: "STOP", created_at: null, status: null },
    ]));
    assert.equal(tabele.sms_optout.length, 0);
  });

  test("⚠ si cronul transforma caderea intr-o eroare raportata, nu intr-o trecere «ok»", async () => {
    const { admin } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] }, { citireCade: true });
    const r = await cuFetch(
      () => json({ data: [{ id: 1, number: "0722334455", message: "STOP" }] }),
      () => citesteRaspunsurile(admin, "biz-1", "tok"),
    );
    assert.ok("error" in r, "o citire picata a trecut drept o lista fara raspunsuri");
  });
});

describe("O lista pe care n-o intelegem nu trece drept una goala", () => {
  test("⚠⚠ mesaje fara niciun numar recunoscut se NUMARA", async () => {
    const { admin } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const r = await cuFetch(
      () => json({ data: [{ sms_id: 1, phone_number: "0722334455", sms_text: "STOP" }, { sms_id: 2, phone_number: "0722334455", sms_text: "da" }] }),
      () => citesteRaspunsurile(admin, "biz-1", "tok"),
    );
    assert.ok(!("error" in r));
    assert.equal(r.citite, 2);
    assert.equal(r.faraNumar, 2, "o forma necunoscuta s-a pierdut fara nicio urma");
    /* ⚠ Doar NUMELE campurilor: ajung ca sa reparam citirea, fara sa copiem mesajul cuiva. */
    assert.deepEqual(r.chei, ["sms_id", "phone_number", "sms_text"], "nu stim cum isi numesc ei campurile");
  });

  test("⚠ si cronul spune cand TOATE sunt asa, cu numele campurilor primite", () => {
    const c = viu("src/app/api/cron/notice-raspunsuri/route.ts");
    assert.match(c, /bilant\.citite > 0 && bilant\.faraNumar === bilant\.citite\) \{[\s\S]{0,120}?forma_necunoscuta\+\+;[\s\S]{0,40}?await logError\(/,
      "o forma de raspuns pe care n-o intelegem trece tacut, cu zero scrise");
    assert.match(c, /details: \{ campuri_primite: bilant\.chei \}/, "alarma nu spune ce campuri au venit");
    assert.match(c, /console\.log\("\[cron\/notice-raspunsuri\]", JSON\.stringify\(bilantTrecere\)\)/,
      "trecerea nu lasa nicio urma in jurnal");
  });

  test("webhook-ul pastreaza corpul brut, singura dovada despre ce trimit", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const corp = { from: "0722334455", message: "Ajunge azi?" };
    await asazaRaspunsurile(admin, "biz-1", [
      { id: null, number: "0722334455", message: "Ajunge azi?", created_at: null, status: null },
    ], { sursa: "webhook", brut: corp });
    assert.deepEqual(tabele.notice_inbox[0]?.raw, corp);
  });
});

describe("Webhook-ul si cronul scriu prin ACEEASI regula", () => {
  const w = viu("src/app/api/notice/webhook/route.ts");

  test("⚠⚠ la WEBHOOK un mesaj fara id intra totusi, o singura data", async () => {
    /* Un mesaj impins vine o data; lasat afara, comerciantul nu l-ar vedea niciodata. */
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const b = await asazaRaspunsurile(admin, "biz-1", [
      { id: null, number: "0722334455", message: "Ajunge azi?", created_at: null, status: null },
    ], { sursa: "webhook", canal: "whatsapp" });
    assert.equal(b.scrise, 1, "un raspuns impins fara id s-a pierdut");
    assert.equal(tabele.notice_inbox[0]?.channel, "whatsapp");
  });

  test("⚠⚠ un raspuns venit pe AMBELE drumuri, cu acelasi id, intra o data", async () => {
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [SCRIS_LUI] });
    const m = { id: "42", number: "0722334455", message: "Multumesc", created_at: null, status: null };
    await asazaRaspunsurile(admin, "biz-1", [m], { sursa: "webhook" });
    await asazaRaspunsurile(admin, "biz-1", [m], { sursa: "tragere" });
    assert.equal(tabele.notice_inbox.length, 1, "webhook-ul si cronul au scris acelasi raspuns de doua ori");
  });

  test("⚠ ruta nu mai scrie singura in inbox si trece raspunsul prin regula", () => {
    assert.ok(!/from\("notice_inbox"\)/.test(w), "ruta isi scrie singura raspunsurile, ocolind garda si indexul");
    assert.match(w, /await asazaRaspunsurile\(admin, businessId, \[[\s\S]{0,200}?sursa: "webhook"/);
  });

  test("⚠ un raport de livrare nu atinge randurile SMSO", () => {
    const livrare = w.slice(w.indexOf("const looksDelivery"), w.indexOf("if (text && from)"));
    assert.equal((livrare.match(/\.eq\("provider", "notice"\)/g) ?? []).length, 2,
      "o cautare dupa id sau dupa telefon poate calca randul altui furnizor");
  });
});

describe("Calea de cos abandonat a lui notice.ro respecta dezabonarea", () => {
  const n = viu("src/lib/notice-notify.ts");

  test("⚠⚠ garda exista, si e INAINTEA trimiterii", () => {
    const garda = n.indexOf("esteDezabonat(db, opts.businessId, opts.phone)");
    const trimite = n.indexOf("await sendNoticeSms(config.api_token");
    assert.ok(garda > 0, "calea de cos abandonat nu intreaba deloc de dezabonati");
    assert.ok(trimite > garda, "mesajul pleaca inainte sa se verifice lista");
  });

  test("⚠⚠ un om oprit intoarce `handled: true`, ca sa NU se incerce si SMSO", () => {
    assert.match(n, /if \(oprit\) \{\s*return \{ handled: true, success: false/,
      "un om dezabonat lasa lantul sa incerce celalalt furnizor");
    assert.match(n, /if \(nesigur\) \{\s*return \{ handled: true, success: false/,
      "o citire picata lasa lantul sa incerce celalalt furnizor");
  });

  test("⚠ si mesajele de STARE A COMENZII trec mai departe, dinadins", () => {
    const expeditor = n.slice(n.indexOf("export async function maybeSendNoticeNotification"),
                              n.indexOf("export async function sendNoticeAbandonedSms"));
    assert.ok(!/esteDezabonat/.test(expeditor),
      "SMS-ul despre o comanda platita a fost oprit de lista de marketing");
  });
});

describe("Rezultatul apelului de voce nu se mai pierde", () => {
  test("⚠⚠ toate cele OPT valori documentate au un inteles", () => {
    assert.equal(stareaVocii("confirmed"), "confirmed");
    assert.equal(stareaVocii("cancelled"), "cancelled");
    assert.equal(stareaVocii("canceled"), "cancelled", "forma americana a lui «cancelled» nu e citita");
    assert.equal(stareaVocii("no_response"), "no_response");
    assert.equal(stareaVocii("no_answer"), "no_response", "«no_answer» (documentat) nu e citit");
    assert.equal(stareaVocii("failed"), "failed");
    assert.equal(stareaVocii("queue_full"), "failed", "«queue_full» (documentat) nu e citit");
    assert.equal(stareaVocii("unknown"), "unknown", "«unknown» (documentat) nu e citit");
    assert.equal(stareaVocii("CONFIRMED "), "confirmed", "starea nu se curata de spatii si majuscule");
    assert.equal(stareaVocii("altceva"), null, "o stare necunoscuta capata un inteles inventat");
    assert.equal(stareaVocii(null), null);
  });

  test("⚠⚠ `delivered` NU e un rezultat al apelului", () => {
    /* La ei: „callback-ul a ajuns la serverul vostru”. Citit ca rezultat, ar suprascrie un „anulat”. */
    assert.equal(stareaVocii("delivered"), null);
  });

  test("⚠⚠ «clientul a anulat» se scrie ca atare, nu ca apel esuat", () => {
    const r = randulApelului("cancelled", "2026-09-17T10:00:00Z");
    assert.equal(r.delivery_status, "cancelled", "anularea clientului s-a pierdut intr-un «failed»");
    assert.equal(r.delivered_at, "2026-09-17T10:00:00Z", "un apel preluat n-are ora la care a ajuns");
    assert.equal(r.error, null, "un apel care a mers perfect e raportat ca eroare");
    assert.equal(ETICHETA_VOCE.cancelled, "clientul a anulat");
  });

  test("⚠ un apel fara raspuns nu are ora de livrare, si spune de ce", () => {
    const r = randulApelului("no_response", "2026-09-17T10:00:00Z");
    assert.equal(r.delivered_at, null, "un apel neraspuns apare livrat");
    assert.match(String(r.error), /nu a raspuns/);
    assert.equal(randulApelului("confirmed", "t").error, null);
  });

  test("⚠⚠ callback-ul se aseaza pe randul de VOCE al apelului, dupa `audio_id`", async () => {
    const sms = { business_id: "biz-1", provider: "notice", channel: "sms", provider_id: "55", delivery_status: "sent" };
    const apel = { business_id: "biz-1", provider: "notice", channel: "voice", provider_id: "55", delivery_status: "sent" };
    const altMagazin = { ...apel, business_id: "biz-2" };
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [sms, apel, altMagazin] });
    const rez = await asazaApelul(admin, "biz-1", { audio_id: "55", status: "cancelled" });
    assert.equal(rez, "scris");
    assert.equal(tabele.notice_sms_log[1].delivery_status, "cancelled", "rezultatul apelului nu a ajuns pe randul lui");
    assert.equal(tabele.notice_sms_log[0].delivery_status, "sent", "rezultatul unui apel a calcat randul unui SMS");
    assert.equal(tabele.notice_sms_log[2].delivery_status, "sent", "rezultatul a calcat apelul altui magazin");
  });

  test("⚠ un `audio_id` numeric se potriveste la fel", async () => {
    const apel = { business_id: "biz-1", provider: "notice", channel: "voice", provider_id: "55", delivery_status: "sent" };
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [apel] });
    await asazaApelul(admin, "biz-1", { audio_id: 55, status: "confirmed" });
    assert.equal(tabele.notice_sms_log[0].delivery_status, "confirmed");
  });

  test("⚠⚠ `delivered` venit DUPA `cancelled` nu schimba nimic", async () => {
    const apel = { business_id: "biz-1", provider: "notice", channel: "voice", provider_id: "55", delivery_status: "sent" };
    const { admin, tabele } = bazaFalsa({ notice_sms_log: [apel] });
    await asazaApelul(admin, "biz-1", { audio_id: "55", status: "cancelled" });
    const rez = await asazaApelul(admin, "biz-1", { audio_id: "55", status: "delivered" });
    assert.equal(rez, "ignorat");
    assert.equal(tabele.notice_sms_log[0].delivery_status, "cancelled", "comanda anulata de client a ajuns sa arate preluata");
  });

  test("⚠⚠ orice corp cu `audio_id` OPRESTE ruta, inaintea ramurii de livrare SMS", () => {
    const w = viu("src/app/api/notice/webhook/route.ts");
    const voce = w.indexOf('await asazaApelul(admin, businessId, payload) !== "nu-e-apel") return ok();');
    const livrare = w.indexOf("const looksDelivery = DELIVERY_KEYWORDS");
    assert.ok(voce > 0, "ruta nu mai trece callback-ul de voce prin regula, sau nu se opreste dupa el");
    assert.ok(voce < livrare, "raportul de livrare SMS inghite callback-ul de voce");
  });

  test("un corp fara `audio_id` nu e un apel", async () => {
    const { admin } = bazaFalsa();
    assert.equal(await asazaApelul(admin, "biz-1", { id: "1", status: "delivered" }), "nu-e-apel");
  });

  test("⚠ ruta nu-si rescrie regula, o imprumuta", () => {
    const w = viu("src/app/api/notice/webhook/route.ts");
    assert.ok(!/STARI_VOCE|stareaVocii|randulApelului/.test(w), "ruta si-a facut a doua copie a regulii apelului");
  });
});

describe("`POST /audio`: id-ul apelului si limita documentata", () => {
  test("⚠⚠ `audio_id` din raspuns e cel care ajunge in jurnal", async () => {
    /*
     * Documentat: „Returns an audio_id”, iar callback-ul poarta „audio_id: the ID from send response”.
     * Fara el, randul apelului ramanea fara id si niciun callback nu-l mai gasea.
     */
    const r = await cuFetch(() => json({ id: 9, audio_id: "a-77" }), () =>
      sendNoticeAudio("tok", { number: "0722334455", text: "Buna ziua" }));
    assert.equal(r.providerId, "a-77", "s-a pastrat id-ul randului lor in locul lui `audio_id`");
    const r2 = await cuFetch(() => json({ data: { audio_id: 55 } }), () =>
      sendNoticeAudio("tok", { number: "0722334455", text: "Buna ziua" }));
    assert.equal(r2.providerId, "55");
  });

  test("⚠ un text peste 900 de caractere se refuza, fara sa plece", async () => {
    const r = await cuFetch(() => json({ audio_id: "x" }), async (apeluri) => {
      const rez = await sendNoticeAudio("tok", { number: "0722334455", text: "a".repeat(NOTICE_AUDIO_MAX + 1) });
      assert.equal(apeluri.length, 0, "cererea a plecat oricum");
      return rez;
    });
    assert.equal(r.success, false);
    assert.equal(NOTICE_AUDIO_MAX, 900);
    const laLimita = await cuFetch(() => json({ audio_id: "x" }), () =>
      sendNoticeAudio("tok", { number: "0722334455", text: "a".repeat(NOTICE_AUDIO_MAX) }));
    assert.equal(laLimita.success, true, "un text de exact 900 de caractere a fost refuzat");
  });
});

describe("Adresa pe care o dam altora ca sa ne cheme inapoi", () => {
  const VECHI = { app: process.env.NEXT_PUBLIC_APP_URL, site: process.env.NEXT_PUBLIC_SITE_URL };
  function cu(app: string | undefined, site: string | undefined) {
    if (app === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = app;
    if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = site;
    try { return adresaPublica(); } finally {
      if (VECHI.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = VECHI.app;
      if (VECHI.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = VECHI.site;
    }
  }

  test("⚠⚠ apexul se ridica la `www`, fiindca apexul raspunde 308", () => {
    assert.equal(cu(undefined, "https://edinio.com"), "https://www.edinio.com");
    assert.equal(cu("https://edinio.com", undefined), "https://www.edinio.com");
  });

  test("⚠⚠ SIRUL GOL cade pe implicit, si `??` nu facea asta", () => {
    assert.equal(cu(undefined, ""), "https://www.edinio.com");
    assert.equal(cu("", ""), "https://www.edinio.com");
    assert.equal(cu("", "https://edinio-preview.vercel.app"), "https://edinio-preview.vercel.app",
      "o variabila goala a acoperit una buna");
    assert.equal(cu("   ", undefined), "https://www.edinio.com");
  });

  test("o valoare stricata nu da mai departe o adresa stricata", () => {
    assert.equal(cu(undefined, "nu-e-o-adresa"), "https://www.edinio.com");
  });

  test("o gazda adevarata, alta decat a noastra, se pastreaza", () => {
    assert.equal(cu("https://edinio-preview.vercel.app", undefined), "https://edinio-preview.vercel.app");
    assert.equal(cu(undefined, "https://www.edinio.com/"), "https://www.edinio.com");
  });

  test("⚠ amandoi furnizorii folosesc acelasi loc, nu fiecare al lui", () => {
    for (const f of ["src/lib/notice-notify.ts", "src/lib/smso-urma.ts"]) {
      assert.match(viu(f), /adresaPublica\(\)/, `${f} isi compune singur adresa`);
      assert.ok(!/NEXT_PUBLIC_(SITE|APP)_URL/.test(viu(f)), `${f} citeste inca variabila de mediu direct`);
    }
  });

  test("⚠⚠ si adresa pe care o COPIAZA comerciantul in notice.ro", () => {
    /*
     * Prima reparatie a atins doar adresa din `noticeWebhookUrl`, pe care n-o vede nimeni. Cea din
     * panou, pe care omul o lipeste in contul lui, ramasese pe apex.
     */
    const ui = viu("src/components/dashboard/NoticeConfigClient.tsx");
    assert.match(ui, /const webhookUrl = config\.webhook_secret\s*\?\s*`\$\{adresaPublica\(\)\}\/api\/notice\/webhook/,
      "adresa afisata comerciantului nu trece prin `adresaPublica`");
    assert.ok(!/NEXT_PUBLIC_(SITE|APP)_URL/.test(ui), "panoul isi compune inca singur adresa");
  });

  test("⚠ la fel si adresa de urmarire pe care o lipeste comerciantul in Innoship", () => {
    /* Singurul alt loc din platforma care dadea UNUI SERVER STRAIN o adresa compusa pe apex. */
    const p = viu("src/app/(dashboard)/dashboard/features/innoship/page.tsx");
    assert.match(p, /baseUrl=\{adresaPublica\(\)\}/, "Innoship primeste inca adresa de pe apex");
    assert.ok(!/NEXT_PUBLIC_(SITE|APP)_URL/.test(p));
  });
});

describe("Cronul chiar ruleaza, si chiar poate scrie", () => {
  test("⚠ e legat in vercel.json", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
    assert.ok(v.crons.some((c) => c.path === "/api/cron/notice-raspunsuri"),
      "cronul care citeste raspunsurile nu e programat sa porneasca niciodata");
  });

  test("⚠ un magazin picat nu opreste restul", () => {
    const c = viu("src/app/api/cron/notice-raspunsuri/route.ts");
    assert.match(c, /if \("error" in bilant\) \{[\s\S]{0,400}?continue;/,
      "un magazin cu token expirat opreste toata trecerea");
  });

  test("⚠⚠ indexul pe care se sprijina `onConflict` NU e partial, in PRODUCTIE", () => {
    /*
     * PostgREST scrie `ON CONFLICT (business_id, provider_id)` fara predicat, iar Postgres nu poate
     * folosi un index partial fara predicatul lui: eroarea 42P10, la FIECARE rand. Masurat pe productie
     * pe 17.09.2026, cu indexul din prima migratie. Baza falsa de mai sus nu poate prinde asta, deci se
     * citeste schema fotografiata din productie (`scripts/schema-baseline.sh --refresh`).
     */
    const schema = readFileSync("migrations/000-schema-baseline.sql", "utf8");
    const rand = schema.split("\n").find((l) => l.includes("INDEX notice_inbox_furnizor_unic_idx"));
    assert.ok(rand, "indexul unic pe (magazin, id-ul lor) lipseste din productie");
    assert.match(rand!, /UNIQUE INDEX notice_inbox_furnizor_unic_idx ON public\.notice_inbox USING btree \(business_id, provider_id\);/);
    assert.ok(!/WHERE/i.test(rand!), "indexul e partial: fiecare upsert al cronului cade cu 42P10");
  });

  test("⚠ si scrierea din cod cere exact coloanele indexului", () => {
    const r = viu("src/lib/notice-raspunsuri.ts");
    assert.match(r, /onConflict: "business_id,provider_id", ignoreDuplicates: true/);
  });

  test("migratia de corectura e in depozit, dupa cea gresita", () => {
    const m = readdirSync("migrations").filter((f) => /notice/.test(f)).sort();
    const gresita = m.indexOf("2027-01-23-notice-raspunsurile-se-citesc-o-singura-data.sql");
    const buna = m.indexOf("2027-01-24-notice-indexul-unic-fara-predicat.sql");
    assert.ok(gresita >= 0 && buna > gresita, "corectura indexului nu vine dupa migratia care l-a stricat");
  });
});
