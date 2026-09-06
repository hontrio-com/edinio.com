import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * CRONUL ADEVARAT, CU O BAZA DE PROBA SI UN GOOGLE DE PROBA.
 *
 * ═══ ⚠ DE CE NU AJUNGE PROBA PE MAPPER ═══
 *
 * Mapperul stie sa nu produca o oferta mincinoasa. Dar intrebarea care costa bani e alta: ce se
 * intampla cu ofertele PUBLICATE INAINTE, cand produsul a devenit fototapet abia acum? Alea traiesc
 * la Google pana cand cineva le sterge de acolo, si singurul care poate face asta e cronul.
 *
 * Deci aici se ruleaza CHIAR `GET` din `route.ts`, cu o coada adevarata si cu raspunsuri adevarate.
 * Inlocuite sunt doar capetele: un server HTTP local care vorbeste PostgREST atat cat il intreaba
 * ruta, si un `fetch` care raspunde in locul lui Google — asa se poate citi CE anume i s-a trimis.
 *
 * ⚠ Env-ul se pune INAINTE de a importa ruta: clientul Supabase se face la fiecare cerere din
 * `process.env`, iar adresa bazei de proba se afla abia dupa ce serverul porneste.
 */

const BIZ = "biz-1";
const CONT = "accounts/123";

/** Ce a primit Google: metoda, calea si corpul. Din el se vede ce s-a trimis si ce s-a retras. */
const laGoogle: { metoda: string; cale: string; corp: string }[] = [];

/* ── Baza de proba ───────────────────────────────────────────────────────── */

type RandGmc = { id: string; business_id: string; product_id: string; offer_id: string; status: string; error: string | null };

/** Fototapetul E DEJA PUBLICAT la Google — asta e tot rostul probei. */
let gmcProduse: RandGmc[] = [];
let coada: Record<string, unknown>[] = [];
/** Randurile sterse din coada, ca sa se vada ca lucrarea s-a incheiat, nu s-a reluat la nesfarsit. */
let sterseDinCoada: string[] = [];

const PERSONALIZARE_VECHE = {
  customization: {
    enabled: true,
    fields: [{ id: "nume", type: "text", label: "Nume gravat", required: true, max_length: 20 }],
  },
};

const PERSONALIZARE_PE_M2 = {
  customization: {
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  },
};

function produs(id: string, page_sections: unknown) {
  return {
    id, name: id === "vechi" ? "Cana gravata" : "Fototapet Personalizat",
    slug: id, description: "descriere", price: 89, compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"], category: null, is_active: true, is_bundle: false,
    track_inventory: false, stock_quantity: null, weight_grams: null, page_sections,
  };
}

const PRODUSE: Record<string, unknown> = {
  vechi: produs("vechi", PERSONALIZARE_VECHE),
  fototapet: produs("fototapet", PERSONALIZARE_PE_M2),
};

/** Id-urile dintr-un filtru PostgREST: `eq.X`, `in.(a,b)` sau `(product_id.eq.X,offer_id.eq.Y)`. */
function valori(filtru: string): string[] {
  const inauntru = /\((.*)\)/.exec(filtru)?.[1] ?? filtru;
  return inauntru.split(",")
    .map((p) => p.split(".eq.").pop()!.replace(/^n?eq\./, "").replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  const sel = url.searchParams.get("select") ?? "";
  let corp = "";
  req.on("data", (c) => { corp += c; });
  req.on("end", () => {
    const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const json = (cod: number, date: unknown) => {
      res.writeHead(cod, { "content-type": "application/json" });
      res.end(JSON.stringify(date));
    };
    /*
     * ⚠ ORICE GRESEALA A BAZEI DE PROBA IESE CA 500, NU CA TACERE.
     *
     * Prima varianta a probei citea corpul unui `upsert` ca lista, iar el vine ca obiect: handlerul
     * arunca inainte de `res.end()`, cererea ramanea fara raspuns, si proba ATARNA in loc sa pice.
     * Costul n-a fost defectul, ci minutele pierdute cautandu-l in cod bun.
     */
    const gresealaBazei = (e: unknown) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `baza de proba: ${(e as Error).message}` }));
    };
    try {
      raspunde();
    } catch (e) { gresealaBazei(e); }

    function raspunde() {
    /*
     * ⚠ O SCRIERE FARA `select` RASPUNDE 204, FARA CORP — ca PostgREST cu `return=minimal`.
     *
     * Cu un corp pe care clientul nu-l citeste, undici tine socketul ocupat si CEREREA URMATOARE
     * atarna la nesfarsit. Adica proba n-ar fi picat cu o eroare, ci ar fi ramas agatata — cel mai
     * scump fel de a nu afla nimic.
     */
    const scris = (randuri: unknown[]) => {
      if ((req.headers.prefer ?? "").includes("return=representation")) return json(200, randuri);
      res.writeHead(204); res.end();
    };
    const lista = (randuri: unknown[]) => (unul ? json(randuri.length ? 200 : 406, randuri[0] ?? { message: "gol" }) : json(200, randuri));

    if (cale === "rpc/revendica_din_coada") return json(200, coada);

    if (cale === "store_settings") {
      if (req.method === "PATCH") return scris([]);
      return lista([{ google_merchant_config: {
        connected: true, account_id: "123", refresh_token: "rt-de-proba",
        data_source_name: `${CONT}/dataSources/1`, content_language: "ro", feed_label: "RO",
      } }]);
    }

    if (cale === "businesses") {
      return lista([{ slug: "exemplu", custom_domain: null, store_name: "Exemplu", business_name: "Exemplu SRL" }]);
    }

    if (cale === "products") {
      const ids = valori(url.searchParams.get("id") ?? "");
      return json(200, ids.map((i) => PRODUSE[i]).filter(Boolean));
    }

    if (cale === "gmc_products") {
      /*
       * Interogarea de REIMPROSPATARE a statusurilor — alta forma de `select`. Baza de proba
       * respecta filtrul `status=neq.…`, ca proba sa poata vedea daca randul retras de noi chiar e
       * sarit: intrebat la Google, raspunsul lui i-ar sterge motivul.
       */
      if (sel.includes("business_id")) {
        const sarit = valori(url.searchParams.get("status") ?? "").pop();
        return json(200, gmcProduse.filter((r) => r.status !== sarit)
          .map((r) => ({ id: r.id, business_id: r.business_id, offer_id: r.offer_id })));
      }
      if (req.method === "PATCH") {
        const id = valori(url.searchParams.get("id") ?? "").pop();
        const petic = JSON.parse(corp || "{}") as Partial<RandGmc>;
        gmcProduse = gmcProduse.map((r) => (r.id === id ? { ...r, ...petic } : r));
        return scris([]);
      }
      const chei = valori(url.searchParams.get("or") ?? url.searchParams.get("product_id") ?? "");
      const potrivite = gmcProduse.filter((r) => chei.includes(r.product_id) || chei.includes(r.offer_id));
      if (req.method === "DELETE") {
        gmcProduse = gmcProduse.filter((r) => !potrivite.includes(r));
        return scris([]);
      }
      if (req.method === "POST") {
        /* ⚠ Un `upsert` cu un singur rand trimite un OBIECT, nu o lista. */
        const trimis = JSON.parse(corp || "[]") as RandGmc | RandGmc[];
        for (const nou of Array.isArray(trimis) ? trimis : [trimis]) {
          gmcProduse = gmcProduse.filter((r) => r.offer_id !== nou.offer_id);
          gmcProduse.push({ ...nou, id: `g-${nou.offer_id}` });
        }
        return scris([]);
      }
      return json(200, potrivite.map((r) => ({ offer_id: r.offer_id })));
    }

    if (cale === "gmc_sync_queue" && req.method === "DELETE") {
      /* ⚠ Stergerea cu COMPARE-AND-SET, ca in baza adevarata: fara generatia potrivita nu prinde
         nimic, si atunci lucrarea s-ar relua — exact ce trebuie sa se vada daca cineva o strica. */
      const id = valori(url.searchParams.get("id") ?? "").pop() ?? "";
      const gen = valori(url.searchParams.get("generation") ?? "").pop();
      const rand = coada.find((q) => q.id === id && (gen === undefined || String(q.generation) === gen));
      if (!rand) return json(200, []);
      sterseDinCoada.push(id);
      coada = coada.filter((q) => q !== rand);
      return json(200, [{ id }]);
    }

    if (cale === "error_logs") return scris([]);
    return json(200, []);
    }
  });
});

let GET: (req: unknown) => Promise<Response>;
let NextRequest: (typeof import("next/server"))["NextRequest"];
const fetchAdevarat = globalThis.fetch;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.CRON_SECRET = "secret-de-proba";

  /* Google de proba: raspunde „bine" la orice, si tine minte ce i s-a cerut. */
  globalThis.fetch = (async (intrare: unknown, optiuni?: { method?: string; body?: unknown }) => {
    const adresa = String(typeof intrare === "object" && intrare && "url" in intrare ? (intrare as { url: string }).url : intrare);
    if (adresa.startsWith("https://oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "jeton-de-proba", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (adresa.startsWith("https://merchantapi.googleapis.com")) {
      laGoogle.push({
        metoda: optiuni?.method ?? "GET",
        cale: new URL(adresa).pathname,
        corp: String(optiuni?.body ?? ""),
      });
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }
    return fetchAdevarat(intrare as string, optiuni as RequestInit);
  }) as typeof fetch;

  ({ GET } = (await import("@/app/api/cron/gmc-sync/route")) as unknown as { GET: (req: unknown) => Promise<Response> });
  ({ NextRequest } = await import("next/server"));
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

function cerere() {
  return new NextRequest("https://www.edinio.com/api/cron/gmc-sync", {
    headers: { authorization: "Bearer secret-de-proba" },
  });
}

test("⚠ oferta deja publicata a fototapetului e RETRASA, iar comerciantul afla de ce", async () => {
  /*
   * Starea de plecare e cea reala si cea mai scumpa: fototapetul a fost publicat cand pretul lui de
   * catalog inca insemna ceva, iar acum se vinde la metru patrat. Cana gravata sta langa el ca sa se
   * vada ca poarta nu inchide tot: ea are personalizare, dar fara pret, si trebuie sa plece la
   * Google exact ca pana acum.
   */
  gmcProduse = [
    { id: "g1", business_id: BIZ, product_id: "fototapet", offer_id: "fototapet", status: "active", error: null },
  ];
  coada = [
    { id: "q1", business_id: BIZ, product_id: "vechi", offer_id: "vechi", op: "upsert", attempts: 0, generation: 1 },
    { id: "q2", business_id: BIZ, product_id: "fototapet", offer_id: "fototapet", op: "upsert", attempts: 0, generation: 1 },
  ];
  sterseDinCoada = [];
  laGoogle.length = 0;

  const raspuns = await GET(cerere());
  assert.equal(raspuns.status, 200);
  const rezultat = await raspuns.json() as { ok: boolean; synced: number; deleted: number; failed: number };
  assert.equal(rezultat.failed, 0, "ceva a picat pe drum");
  assert.equal(rezultat.deleted, 1, "fototapetul nu a fost tratat ca o retragere");
  assert.equal(rezultat.synced, 1, "cana gravata nu a mai ajuns la Google");

  /* ⚠ Retragerea trebuie sa fi AJUNS la Google, nu doar sa fi fost hotarata la noi. */
  const stersLaGoogle = laGoogle.filter((c) => c.metoda === "DELETE");
  assert.equal(stersLaGoogle.length, 1, "nu s-a sters nicio oferta de la Google");
  assert.match(stersLaGoogle[0].cale, /ro~RO~fototapet$/, "s-a sters alta oferta decat fototapetul");

  /* ⚠ Si NIMIC despre fototapet nu s-a trimis spre publicare. */
  const trimise = laGoogle.filter((c) => c.metoda === "POST");
  assert.equal(trimise.length, 1, "s-au trimis alte oferte decat cana");
  assert.ok(trimise[0].corp.includes('"offerId":"vechi"'), "nu cana gravata a plecat la Google");
  assert.ok(!trimise.some((c) => c.corp.includes("fototapet")), "fototapetul a plecat totusi la Google");

  /* ⚠ SEMNUL PENTRU COMERCIANT. Fara el, produsul ar disparea din lista fara o vorba. */
  const rand = gmcProduse.find((r) => r.product_id === "fototapet");
  assert.ok(rand, "randul fototapetului a disparut cu totul: comerciantul nu afla nimic");
  assert.equal(rand.status, "exclus");
  assert.match(String(rand.error), /personalizarea schimbă suma/i, "motivul nu-i spune ce s-a intamplat");

  /* Cana ramane sincronizata, cu statusul obisnuit. */
  assert.equal(gmcProduse.find((r) => r.product_id === "vechi")?.status, "pending");

  /* Amandoua randurile de coada s-au incheiat: nimic nu se reia la nesfarsit. */
  assert.deepEqual(sterseDinCoada.sort(), ["q1", "q2"]);
});

test("⚠ un fototapet care nu fusese niciodata publicat nu ajunge in Google, si tot se explica", async () => {
  /*
   * Aici nu exista nimic de retras — dar comerciantul care apasa „Sincronizeaza acum" trebuie sa
   * inteleaga de ce produsul lui nu apare. Tacerea l-ar trimite sa caute defectul in Google.
   */
  gmcProduse = [];
  coada = [{ id: "q3", business_id: BIZ, product_id: "fototapet", offer_id: "fototapet", op: "upsert", attempts: 0, generation: 1 }];
  sterseDinCoada = [];
  laGoogle.length = 0;

  const rezultat = await (await GET(cerere())).json() as { synced: number; deleted: number; failed: number };
  assert.equal(rezultat.synced, 0, "fototapetul a plecat la Google");
  assert.equal(rezultat.failed, 0);
  assert.equal(gmcProduse.find((r) => r.product_id === "fototapet")?.status, "exclus");
  assert.equal(laGoogle.filter((c) => c.metoda === "POST").length, 0, "s-a trimis o oferta");
});

test("⚠ trecerea urmatoare NU sterge motivul: randul retras nu se mai intreaba la Google", async () => {
  /*
   * ⚠ A DOUA JUMATATE A SEMNULUI, si cea care se pierde usor.
   *
   * Cronul reimprospateaza din jumatate in jumatate de ora statusurile din `gmc_products`, cu ce
   * spune Google despre fiecare oferta. Randul nostru retras n-are oferta acolo, deci raspunsul e
   * gol — si un raspuns gol inseamna „In asteptare". Fara filtrul care il sare, motivul ar fi trait
   * cel mult treizeci de minute, iar comerciantul ar fi ramas cu un produs care asteapta pe veci o
   * aprobare care nu vine.
   */
  gmcProduse = [
    { id: "g-fototapet", business_id: BIZ, product_id: "fototapet", offer_id: "fototapet", status: "exclus", error: "motivul scris la retragere" },
    { id: "g-vechi", business_id: BIZ, product_id: "vechi", offer_id: "vechi", status: "pending", error: null },
  ];
  coada = [];
  laGoogle.length = 0;

  await GET(cerere());

  const rand = gmcProduse.find((r) => r.product_id === "fototapet");
  assert.equal(rand?.status, "exclus", "raspunsul lui Google a sters motivul retragerii");
  assert.equal(rand?.error, "motivul scris la retragere");
  assert.ok(
    !laGoogle.some((c) => c.cale.includes("fototapet")),
    "s-a cerut lui Google statusul unei oferte pe care tot noi am retras-o",
  );
  /* Perechea: randul obisnuit CHIAR se intreaba, altfel proba de mai sus ar trece si cu totul oprit. */
  assert.ok(laGoogle.some((c) => c.cale.includes("vechi")), "nu s-a mai reimprospatat nimic");
});
