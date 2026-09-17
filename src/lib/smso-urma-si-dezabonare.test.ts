import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { trimiteSiLasaUrma, adresaWebhookSmso, stareaLivrarii, type SmsDeTrimis } from "./smso-urma";
import { numarNormalizat, ceruOprirea } from "./sms-dezabonare";
import { smsoOpresteTot, stareaSmsului, SMSO_DEZABONAT, SMSO_FARA_CREDIT } from "./smso";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SMSO: URMA CARE LIPSEA SI DEZABONATII CARE SE UITAU     (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA: 3 magazine cu SMSO pornit, 55 de SMS-uri in 2 campanii (24.08 - 10.09).
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 * API-ul lor are PATRU capete si DOUA webhook-uri. Foloseam trei capete si niciun webhook:
 *
 *   `/senders` ✅ · `/send` ✅ · `/credit-check` ⚠ (implementat, dar nechemat la campanie)
 *   `/status` ❌ · webhook livrare ❌ · webhook raspunsuri ❌
 *
 * `sendSms` primea inapoi `responseToken` (CHEIA cu care se poate interoga `/status`) si il arunca
 * in toate cele SASE cai reale de trimitere; se folosea doar in ruta de test. Deci raportam „trimis"
 * fiindca API-ul ACCEPTASE mesajul, niciodata fiindca AJUNSESE.
 *
 * ⚠⚠ Si nu fiindca era greu: celalalt furnizor de SMS al platformei, notice.ro, avea DEJA tot,
 * inclusiv tabelul si webhook-ul de livrare, la zece fisiere distanta.
 */

/** Baza minima: retine ce s-a scris si ce s-a citit. */
function bazaFalsa(opt: { dezabonat?: boolean; citireCade?: boolean } = {}) {
  const scrieri: { tabel: string; rand?: unknown; fel: string }[] = [];
  const admin = {
    from(tabel: string) {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        limit: () => Promise.resolve(
          opt.citireCade
            ? { data: null, error: { message: "baza a picat" } }
            : { data: tabel === "sms_optout" && opt.dezabonat ? [{ id: "x" }] : [], error: null },
        ),
        insert: (rand: unknown) => { scrieri.push({ tabel, rand, fel: "insert" }); return Promise.resolve({ error: null }); },
        upsert: (rand: unknown) => { scrieri.push({ tabel, rand, fel: "upsert" }); return Promise.resolve({ error: null }); },
      };
      return api;
    },
  };
  return { admin: admin as never, scrieri };
}

const FETCH_VECHI = globalThis.fetch;
function raspunde(corp: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(corp), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}
const MESAJ = {
  businessId: "biz-1", phone: "0722334455", sender: "4",
  body: "Salut", type: "marketing" as const, motiv: "campanie",
};

describe("Numarul se aduce la o forma unica", () => {
  test("⚠ altfel acelasi om ar fi doua randuri si ar primi mesajul oricum", () => {
    /* Lista de dezabonati se cauta dupa numar: scris o data cu `+40` si o data cu `07`, garda n-ar
       mai prinde. */
    for (const forma of ["0722334455", "+40722334455", "0040722334455", "40722334455", "0722 334 455"]) {
      assert.equal(numarNormalizat(forma), "722334455", `forma ${forma}`);
    }
  });
});

describe("Fiecare SMS lasa urma", () => {
  test("⚠⚠ `responseToken` se PASTREAZA, nu se mai arunca", async () => {
    /* E singura cheie cu care se poate interoga `/status` si cu care se potriveste un raport de
       livrare. Pana azi se folosea doar in ruta de test. */
    raspunde({ status: 200, responseToken: "uuid-123", transaction_cost: 0.04 });
    const { admin, scrieri } = bazaFalsa();
    const r = await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    assert.equal(r.responseToken, "uuid-123");
    const urma = scrieri.find((x) => x.tabel === "notice_sms_log");
    assert.ok(urma, "nu s-a scris nicio urma");
    assert.equal((urma!.rand as { provider_id: string }).provider_id, "uuid-123");
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ urma poarta FURNIZORUL, altfel cele doua webhook-uri se incurca", async () => {
    /* Tabelul e impartit cu notice.ro, iar amandoua webhook-urile de livrare se potrivesc dupa
       `provider_id`. */
    raspunde({ status: 200, responseToken: "uuid-123" });
    const { admin, scrieri } = bazaFalsa();
    await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    assert.equal((scrieri.find((x) => x.tabel === "notice_sms_log")!.rand as { provider: string }).provider, "smso");
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ si urma se scrie SI la esec", async () => {
    /* Un esec fara urma e chiar tacerea din care s-a nascut tot auditul. */
    raspunde({ status: 402, message: "no credit" });
    const { admin, scrieri } = bazaFalsa();
    await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    const urma = scrieri.find((x) => x.tabel === "notice_sms_log");
    assert.ok(urma, "un esec nu lasa urma");
    assert.equal((urma!.rand as { success: boolean }).success, false);
    assert.equal((urma!.rand as { delivery_status: string }).delivery_status, "failed");
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠ „trimis” inseamna ACCEPTAT de ei, nu livrat", async () => {
    /* Livrarea o scrie webhook-ul lor, si abia atunci devine `delivered`. */
    raspunde({ status: 200, responseToken: "u" });
    const { admin, scrieri } = bazaFalsa();
    await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    assert.equal((scrieri.find((x) => x.tabel === "notice_sms_log")!.rand as { delivery_status: string }).delivery_status, "sent");
    globalThis.fetch = FETCH_VECHI;
  });
});

describe("Dezabonatii se tin minte si se respecta", () => {
  test("⚠⚠ codul 405 il trece pe lista", async () => {
    /* Pana azi `405` se numara ca un esec oarecare si se uita, deci aceeasi persoana primea si
       campania urmatoare. E o chestiune de conformitate, nu de eleganta. */
    raspunde({ status: SMSO_DEZABONAT, message: "unsubscribed" });
    const { admin, scrieri } = bazaFalsa();
    await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    const optout = scrieri.find((x) => x.tabel === "sms_optout");
    assert.ok(optout, "dezabonarea nu s-a tinut minte");
    assert.equal((optout!.rand as { phone: string }).phone, "722334455", "numarul nu e normalizat");
    assert.equal((optout!.rand as { sursa: string }).sursa, "smso_405");
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ un dezabonat NU mai primeste marketing, si nu se cheama deloc API-ul", async () => {
    let chemat = false;
    globalThis.fetch = (async () => { chemat = true; return new Response("{}"); }) as typeof fetch;
    const { admin, scrieri } = bazaFalsa({ dezabonat: true });
    const r = await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    assert.equal(r.success, false);
    assert.equal(chemat, false, "s-a cheltuit credit pe un om care a cerut sa nu fie sunat");
    assert.equal(scrieri.filter((x) => x.tabel === "notice_sms_log").length, 0);
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ dar un mesaj TRANZACTIONAL trece, si asta e dinadins", async () => {
    /*
     * Starea unei comenzi pe care omul a platit-o NU e marketing, iar el are dreptul s-o afle chiar
     * daca nu mai vrea reclame. Confundate, ori i-am ascunde comanda, ori i-am trimite reclame.
     */
    raspunde({ status: 200, responseToken: "u" });
    const { admin } = bazaFalsa({ dezabonat: true });
    const r = await trimiteSiLasaUrma(admin, "cheie", { ...MESAJ, type: "transactional", motiv: "stare_comanda" });
    assert.equal(r.success, true, "un mesaj tranzactional a fost oprit de lista de marketing");
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ o citire picata OPRESTE trimiterea, nu o lasa sa treaca", async () => {
    /* Citita pe dos, garda ar suna exact oamenii care au cerut sa nu fie sunati, si tocmai cand baza
       are o problema. */
    let chemat = false;
    globalThis.fetch = (async () => { chemat = true; return new Response("{}"); }) as typeof fetch;
    const { admin } = bazaFalsa({ citireCade: true });
    const r = await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    assert.equal(r.success, false);
    assert.equal(chemat, false, "s-a trimis desi lista de dezabonati n-a putut fi citita");
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠ o cadere de RETEA nu dezaboneaza pe nimeni", async () => {
    /* Nu e un verdict al lor: nu stim ce s-a intamplat de partea cealalta. */
    globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
    const { admin, scrieri } = bazaFalsa();
    const r = await trimiteSiLasaUrma(admin, "cheie", MESAJ);
    assert.equal(r.status, undefined, "o pana de retea a capatat un cod al lor");
    assert.equal(scrieri.filter((x) => x.tabel === "sms_optout").length, 0);
    globalThis.fetch = FETCH_VECHI;
  });
});

describe("Unele esecuri inseamna «opreste-te»", () => {
  test("⚠⚠ creditul epuizat si cheia gresita opresc campania", () => {
    /* Fara asta, o campanie fara credit ardea toata lista esuand mesaj cu mesaj: sute de apeluri
       catre ei pentru un rezultat cunoscut de la primul. */
    assert.equal(smsoOpresteTot(SMSO_FARA_CREDIT), true);
    assert.equal(smsoOpresteTot(401), true);
  });

  test("⚠ dar limita de trimitere NU opreste: aceea trece de la sine", () => {
    assert.equal(smsoOpresteTot(409), false);
    assert.equal(smsoOpresteTot(SMSO_DEZABONAT), false, "un singur dezabonat ar opri toata campania");
    assert.equal(smsoOpresteTot(undefined), false, "o pana de retea ar opri toata campania");
  });
});

// ─── Si legaturile chiar exista ──────────────────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Adresa de raportare pleaca CU fiecare mesaj", () => {
  /*
   * ═══ ⚠⚠ DE CE E ASTA CEA MAI IMPORTANTA PROBA DIN FISIER ═══
   *
   * Documentatia lor spune ca webhook-urile se pot pune „in your team's account or per message
   * sent". Daca ne-am fi bazat pe prima forma, rapoartele de livrare ar fi functionat doar pentru
   * comerciantii care intra la SMSO si lipesc o adresa, adica, realist, pentru niciunul.
   *
   * ⚠ Si secretul: `semnaturaCheii` ARUNCA fara variabila de mediu, iar incarcatorul de probe nu
   * aduce niciun `.env`. Deci proba si-l pune singura; altfel ar fi trecut verde masurand tacerea.
   * Vezi `probele-semneaza-cu-cheia-goala`.
   */
  const SECRET_VECHI = process.env.SHIPPING_QUOTE_SECRET;

  /** Trimite un mesaj si intoarce campurile chiar asa cum au plecat catre ei. */
  async function campurileTrimise(mesaj: Partial<SmsDeTrimis> = {}) {
    let corp = "";
    globalThis.fetch = (async (_u: unknown, init: { body?: string }) => {
      corp = init?.body ?? "";
      return new Response(JSON.stringify({ status: 200, responseToken: "tok" }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const { admin } = bazaFalsa();
    await trimiteSiLasaUrma(admin, "cheie", { ...MESAJ, ...mesaj });
    globalThis.fetch = FETCH_VECHI;
    return new URLSearchParams(corp);
  }

  test("⚠⚠ ambele adrese pleaca, si sunt CHIAR cea compusa pentru magazinul asta", async () => {
    process.env.SHIPPING_QUOTE_SECRET = "secret-de-proba";
    try {
      const c = await campurileTrimise();
      const asteptata = adresaWebhookSmso(MESAJ.businessId);
      assert.ok(asteptata, "adresa nu s-a compus, desi secretul exista");
      assert.equal(c.get("webhook_status"), asteptata,
        "rapoartele de livrare nu au unde sa vina");
      assert.equal(c.get("webhook_responses"), asteptata,
        "raspunsurile STOP nu au unde sa vina");
      /* Si ca adresa chiar poarta magazinul si o semnatura, nu e o constanta a platformei. */
      assert.match(asteptata, /[?&]b=biz-1(&|$)/, "adresa nu poarta magazinul");
      assert.match(asteptata, /[?&]s=[0-9a-f]{24}/, "adresa nu poarta semnatura");
    } finally {
      process.env.SHIPPING_QUOTE_SECRET = SECRET_VECHI;
    }
  });

  test("⚠ fara secret, mesajul pleaca TOTUSI, doar fara raportare", async () => {
    /*
     * Un SMS catre cumparator conteaza mai mult decat statistica noastra de livrari. Daca
     * `adresaWebhookSmso` ar arunca in loc sa intoarca `null`, o variabila lipsa de pe server ar
     * opri toate SMS-urile platformei.
     */
    const cheiVechi = [process.env.SHIPPING_QUOTE_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY];
    delete process.env.SHIPPING_QUOTE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const c = await campurileTrimise();
      assert.equal(adresaWebhookSmso("biz-1"), null, "adresa s-a compus fara secret");
      assert.equal(c.get("to"), "0722334455", "mesajul nu mai pleaca deloc fara secret");
      assert.equal(c.get("webhook_status"), null, "s-a trimis o adresa nesemnata");
    } finally {
      if (cheiVechi[0]) process.env.SHIPPING_QUOTE_SECRET = cheiVechi[0];
      if (cheiVechi[1]) process.env.SUPABASE_SERVICE_ROLE_KEY = cheiVechi[1];
    }
  });

  test("ne spunem numele la fiecare mesaj (`source_app`)", async () => {
    const c = await campurileTrimise();
    assert.match(String(c.get("source_app")), /^Edinio\//, "mesajele pleaca anonim");
  });

  test("⚠ eticheta de dezabonare se cere DOAR la marketing", async () => {
    /*
     * Ei o iau in seama doar la marketing. Ceruta pe un mesaj tranzactional ar fi, in cel mai bun
     * caz, ignorata; dar a o trimite oricum ar spune ca n-am citit ce inseamna.
     */
    const marketing = await campurileTrimise({ type: "marketing" });
    assert.equal(marketing.get("generate_unsubscribe_link"), "1",
      "campaniile nu pot folosi eticheta [unsubscribe]");
    const tranzactional = await campurileTrimise({ type: "transactional" });
    assert.equal(tranzactional.get("generate_unsubscribe_link"), null,
      "s-a cerut dezabonare pe un mesaj despre o comanda platita");
  });

  test("⚠ adresa se compune INTR-UN SINGUR loc", () => {
    /*
     * Doua compuneri separate ar insemna ca intr-o zi una se schimba si cealalta nu, iar rapoartele
     * ar veni la o adresa care nu mai trece de garda webhook-ului. Deci actiunea din panou nu are
     * voie sa-si semneze singura adresa.
     */
    const a = viu("src/lib/actions/sms.actions.ts");
    assert.ok(!/semnaturaCheii\(/.test(a), "panoul isi compune singur adresa, a doua oara");
    assert.match(a, /adresaWebhookSmso\(businessId\)/, "panoul nu foloseste locul comun");
  });

  test("⚠ si adresa, si dezabonatii, ajung CHIAR pe ecran", () => {
    /*
     * ⚠ O unealta scrisa anume si nechemata de nimeni nu repara nimic: prima forma a acestei treceri
     * a lasat amandoua actiunile scrise si zero apeluri in `src/`. O adresa pe care comerciantul nu
     * o vede si o lista de oameni ascunsa sunt exact cat ar fi fost fara ele.
     */
    const pagina = viu("src/app/(dashboard)/dashboard/features/smso/page.tsx");
    assert.match(pagina, /getSmsoWebhookUrl\(business\.id\)/, "adresa nu se cere nicaieri");
    assert.match(pagina, /getSmsDezabonati\(business\.id\)/, "lista nu se cere nicaieri");
    assert.match(pagina, /webhookUrl=/, "adresa nu ajunge la panou");
    assert.match(pagina, /dezabonati=/, "lista nu ajunge la panou");

    const panou = viu("src/components/dashboard/SmsoConfigClient.tsx");
    assert.match(panou, /\{webhookUrl\}/, "panoul primeste adresa si n-o afiseaza");
    assert.match(panou, /dezabonati\.map\(/, "panoul primeste lista si n-o afiseaza");
  });
});

describe("Al patrulea capat: mesajul ramas fara raport se intreaba", () => {
  test("cele sase stari ale lor se citesc la fel pe amandoua drumurile", () => {
    /*
     * ⚠ SE PROBEAZA CE INSEAMNA FIECARE, nu ca functia exista. `dispatched` si `sent` nu sunt
     * livrare: inseamna „a plecat catre retea", adica exact ce stiam cand am scris randul. Intoarse
     * ca `delivered`, ar fi transformat statistica de livrari intr-una de trimiteri.
     */
    assert.equal(stareaLivrarii("delivered"), "delivered");
    assert.equal(stareaLivrarii("undelivered"), "failed");
    assert.equal(stareaLivrarii("expired"), "failed");
    assert.equal(stareaLivrarii("error"), "failed");
    assert.equal(stareaLivrarii("sent"), "sent");
    assert.equal(stareaLivrarii("dispatched"), "sent");
    /* O stare pe care n-o cunoastem ramane necunoscuta, nu devine esec. */
    assert.equal(stareaLivrarii("ceva-nou-de-la-ei"), null);
    assert.equal(stareaLivrarii(null), null);
  });

  test("⚠ regula sta INTR-UN loc: webhook-ul si cronul o imprumuta, nu si-o rescriu", () => {
    /*
     * Scrisa de doua ori, ar fi ajuns intr-o zi sa spuna doua lucruri, iar `expired` ar fi fost esec
     * pe un drum si necunoscut pe celalalt. Acelasi tipar ca la `netopia-aplica-statusul`.
     */
    for (const f of ["src/app/api/smso/webhook/route.ts", "src/app/api/cron/smso-livrari/route.ts"]) {
      assert.ok(!/function stareaLivrarii\(/.test(viu(f)), `${f} si-a scris a doua copie a regulii`);
      assert.match(viu(f), /stareaLivrarii/, `${f} nu foloseste regula deloc`);
    }
  });

  test("⚠ cronul nu scrie inapoi ce stia deja, si nu inventeaza un esec", () => {
    const c = viu("src/app/api/cron/smso-livrari/route.ts");
    assert.match(c, /if \(!stare \|\| stare === "sent"\) \{/,
      "un `sent` intors, sau o stare necunoscuta, ajunge scris ca rezultat");
    /*
     * ⚠ Si rescrierea e conditionata: intre citire si scriere putea sosi chiar webhook-ul lor, si o
     * scriere neconditionata l-ar fi calcat.
     *
     * ⚠ SE ANCOREAZA PE LANTUL DE SCRIERE, nu pe sirul singur: prima forma a probei cauta doar
     * `.eq("delivery_status", "sent")` si se potrivea pe INTEROGAREA DE CITIRE de mai sus, care are
     * exact aceeasi forma. Mutantul care taia garda de scriere trecea verde.
     */
    assert.match(c, /\.eq\("id", r\.id\)\s*\.eq\("delivery_status", "sent"\)/,
      "cronul rescrie randul chiar daca webhook-ul l-a lamurit intre timp");
  });

  test("⚠ cronul chiar RULEAZA: e legat in vercel.json", () => {
    /*
     * ⚠ Un cron scris si neinregistrat nu ruleaza niciodata, si nimic din cod n-ar spune-o. Aceeasi
     * capcana ca `unealta-scrisa-anume-si-nechemata`, doar ca in alt fisier.
     */
    const v = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
    assert.ok(v.crons.some((c) => c.path === "/api/cron/smso-livrari"),
      "cronul de reconciliere a livrarilor nu e programat sa porneasca niciodata");
  });

  test("capatul de stare se cheama FARA cheia API, asa cum cer ei", async () => {
    /*
     * „No authentifications is required for checking the status". De aceea cronul poate intreba
     * pentru orice magazin fara sa decripteze nicio credentiala. Daca intr-o zi cineva adauga
     * antetul, proba cade si se pune intrebarea daca mai are rost sa fie fara chei.
     */
    let antete: Record<string, string> | undefined;
    let adresa = "";
    globalThis.fetch = (async (u: string, init?: { headers?: Record<string, string> }) => {
      adresa = String(u); antete = init?.headers;
      return new Response(JSON.stringify({ status: 200, data: { status: "delivered", delivered_at: "2026-09-17 10:00:00" } }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const r = await stareaSmsului("tok-1");
    globalThis.fetch = FETCH_VECHI;

    assert.ok(!antete || !("X-Authorization" in antete), "se trimite o cheie API unde nu e ceruta");
    assert.match(adresa, /\/status\?responseToken=tok-1$/, "tokenul nu ajunge la ei");
    assert.deepEqual(r, { status: "delivered", delivered_at: "2026-09-17 10:00:00" });
  });
});

describe("Toate caile de trimitere trec prin locul care lasa urma", () => {
  test("⚠⚠ nicio cale reala nu mai cheama `sendSms` direct", () => {
    /*
     * Un drum care ocoleste `trimiteSiLasaUrma` nu lasa urma, nu pastreaza tokenul si nu respecta
     * lista de dezabonati. Recensamantul e aici ca sa cada a sasea cale, cand va fi scrisa.
     */
    const cai = [
      "src/lib/actions/sms.actions.ts",
      "src/lib/actions/order.actions.ts",
      "src/lib/actions/abandoned-cart.actions.ts",
      "src/app/api/cron/abandoned-recovery/route.ts",
    ];
    for (const f of cai) {
      assert.ok(!/\bsendSms\(/.test(viu(f)), `${f} cheama sendSms direct, deci nu lasa urma`);
      assert.match(viu(f), /trimiteSiLasaUrma\(/, `${f} nu trimite prin locul comun`);
    }
  });

  test("⚠ si SMS-ul de TEST lasa urma, dar numai pe un magazin dovedit al omului", () => {
    /*
     * ⚠ SMS-ul de test e un SMS REAL, platit din creditul comerciantului, deci merita randul lui in
     * jurnal. Dar `business_id` ar veni din browser, iar un rand scris pe magazinul altcuiva ar fi
     * mai rau decat niciun rand: ar murdari jurnalul unui strain.
     *
     * Deci se probeaza CE se scrie in rand, nu ca exista un apel: identificatorul trebuie sa fie cel
     * confirmat cu `user_id`, nu cel primit. Ramane si calea fara jurnal, pentru cheia inca nesalvata.
     */
    const t = viu("src/app/api/sms/test/route.ts");

    /*
     * ⚠ NU `match(/trimiteSiLasaUrma\(/)`. Prima forma a probei facea exact asta si DOUA mutatii
     * i-au scapat: ramura ramanea scrisa in fisier, doar nu se mai alegea niciodata. Se pinuieste
     * forma ramificarii, nu prezenta numelui.
     */
    assert.match(t, /const result = magazinVerificat\s*\n\s*\? await trimiteSiLasaUrma\(/,
      "SMS-ul de test nu mai pleaca prin locul care lasa urma");
    assert.match(t, /businessId: magazinVerificat,/,
      "urma se scrie pe id-ul venit din browser, nu pe cel confirmat");

    /* ⚠ Si aici forma GARZII, nu ordinea: „intai verifica, apoi atribuie" trece si cand `if`-ul a disparut. */
    assert.match(t, /if \(alLui\) magazinVerificat = businessId;/,
      "magazinul e socotit al omului fara sa se fi confirmat ca e al lui");
    const confirmare = t.indexOf(`.eq("user_id", user.id)`);
    const atribuire = t.indexOf("if (alLui) magazinVerificat");
    assert.ok(confirmare > 0, "proprietatea magazinului nu se mai confirma deloc");
    assert.ok(atribuire > confirmare, "magazinul e socotit al omului inainte de a fi verificat");
  });
});

describe("Campania", () => {
  const a = viu("src/lib/actions/sms.actions.ts");

  test("⚠⚠ intreaba CREDITUL inainte, nu afla mesaj cu mesaj", () => {
    assert.match(a, /const credit = await checkCredit\(config\.api_key\);/, "creditul nu se mai verifica din start");
    assert.ok(
      a.indexOf("await checkCredit(config.api_key)") < a.indexOf("trimiteSiLasaUrma("),
      "creditul se verifica dupa ce au plecat mesaje",
    );
  });

  test("⚠⚠ si se OPRESTE pe codurile fatale", () => {
    assert.match(a, /if \(smsoOpresteTot\(result\.status\)\) \{/, "campania arde iar toata lista");
    assert.match(a, /break;/);
  });

  test("⚠⚠ dezabonatii se scot INAINTE de a cheltui vreun credit", () => {
    assert.match(a, /opriti = await dezabonatii\(admin, businessId\);/);
    assert.ok(
      a.indexOf("await dezabonatii(admin, businessId)") < a.indexOf("trimiteSiLasaUrma("),
      "lista se citeste dupa ce au plecat mesaje",
    );
  });

  test("⚠⚠ iar daca lista nu se poate citi, NU se trimite nimic", () => {
    /* Cu lista goala am fi sunat exact oamenii care au cerut sa nu mai fie sunati. */
    assert.match(a, /Nu am putut citi lista de dezabonati, deci nu am trimis nimic/);
  });
});

describe("Webhook-ul de livrare", () => {
  const w = viu("src/app/api/smso/webhook/route.ts");

  test("⚠⚠ adresa e singura paza, fiindca EI nu semneaza nimic", () => {
    /* Documentatia lor: „No authentifications is required". Niciun antet, niciun secret comun. */
    assert.match(w, /semnaturaCheii\(`smso-webhook:\$\{businessId\}`\)/, "adresa a devenit ghicibila");
    assert.match(w, /if \(semnatura !== asteptat\)/, "semnatura din adresa nu se mai verifica");
  });

  test("⚠⚠ un raport se potriveste pe (magazin, FURNIZOR, id-ul lor)", () => {
    /* Un `uuid` inventat nu se potriveste cu niciun rand, deci nu schimba nimic. */
    assert.match(w, /\.eq\("business_id", businessId\)/);
    assert.match(w, /\.eq\("provider", "smso"\)/, "s-ar putea atinge randurile celuilalt furnizor");
    assert.match(w, /\.eq\("provider_id", uuid\)/);
  });

  test("⚠⚠ un STOP falsificat nu poate dezabona numere straine", () => {
    /*
     * ═══ GARDA CARE CONTEAZA CEL MAI MULT ═══
     *
     * Chiar cu adresa neghicibila, o dezabonare e o scriere cu efect de durata pornita de o cerere
     * NESEMNATA. Cine ar afla adresa ar putea insira numerele clientilor unui magazin si i-ar bloca
     * pe toti. De aceea se cere ca numarul sa fie unul caruia magazinul CHIAR i-a scris.
     */
    /*
     * ⚠ SE PRINDE GARDA, NU NUMELE. Prima forma cerea doar ca sirul `trimisVreodata` sa apara in
     * fisier, iar mutantul care inlocuia conditia cu `if (false)` a TRECUT: numele ramanea mai sus,
     * in interogare. A patra oara azi cand masor prezenta in loc de fapta.
     */
    assert.match(
      w,
      /if \(!trimisVreodata \|\| trimisVreodata\.length === 0\) \{/,
      "oricine ar putea dezabona orice numar",
    );
    /*
     * ⚠ SE COMPARA APELUL, NU NUMELE. Prima forma folosea `indexOf("tineMinteDezabonarea")`, care
     * nimereste IMPORTUL din capul fisierului, deci masura ordinea importurilor si cadea pe cod bun.
     * A treia oara azi cand fac greseala asta.
     */
    assert.ok(
      w.indexOf("trimisVreodata") < w.indexOf("await tineMinteDezabonarea(admin"),
      "se dezaboneaza inainte de a verifica daca numarul e al nostru",
    );
  });

  test("⚠ „STOP” se cauta ca PRIM cuvant, nu oriunde in text", () => {
    /*
     * ⚠ REGULA S-A MUTAT PE 17.09.2026, PROPRIETATEA NU. „” sta acum in
     * `sms-dezabonare`, fiindca o imparte cu notice.ro: omul scrie acelasi „” indiferent prin ce
     * furnizor i-a venit mesajul. Proba nu mai cauta forma ei in fisierul rutei, ci O CHEAMA,
     * ceea ce e si mai bine, fiindca o afirmatie pe sursa trecea verde daca regula se muta.
     */
    assert.equal(ceruOprirea("STOP"), true);
    /* CONTINE cuvantul, dar nu incepe cu el: singura forma care deosebeste regula de una stricata. */
    assert.equal(ceruOprirea("nu vreau dezabonare, doar o intrebare"), false);
    assert.match(w, /ceruOprirea\(/, "webhook-ul nu mai intreaba deloc daca s-a cerut oprirea");
    assert.ok(!/const CUVINTE_DE_OPRIRE/.test(w), "webhook-ul si-a pastrat a doua copie a regulii");
  });
});
