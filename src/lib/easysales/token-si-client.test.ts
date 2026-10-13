import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { depozitFals, serverFals, timpExpirat, caderePeRetea } from "./fals-easysales";
import { emiteToken, motivulRefuzului, scopeDinIndiciu, tokenulMaiTine } from "./token";
import { cerereEasySales, numaraRevocarea, pauzaDupa429, cheiaDeRitm, type ContextEasySales } from "./client";
import { citesteContul, listaWebsiteuri, salveazaComanda, adaugaMetadate, anuleazaComandaLaEi, aboneaza } from "./api";
import { SCOPURI } from "./constante";
import type { EasySalesConfig } from "./tipuri";

/*
 * Tokenul si clientul, pe serverul fals strict.
 *
 * ⚠ REGULA CARE CONTEAZA CEL MAI MULT: orice emitere pe acelasi client revoca tokenul in uz [A].
 * Deci doua fire concurente trebuie sa faca EXACT o cerere la `/oauth/token`, iar un test de
 * conexiune nu trebuie sa faca niciuna.
 */

const B = "biz-1";

function cfgDeBaza(srv: ReturnType<typeof serverFals>, extra: Partial<EasySalesConfig> = {}): EasySalesConfig {
  return {
    connected: true,
    client_id: srv.optiuni.clientId,
    client_secret: srv.optiuni.clientSecret,
    website_token: srv.optiuni.websiteToken,
    website_nume: srv.optiuni.websiteNume,
    token_versiune: 0,
    ...extra,
  };
}

function context(dep: ReturnType<typeof depozitFals>, cfg: EasySalesConfig, extra: Partial<ContextEasySales> = {}): ContextEasySales {
  return { dep, businessId: B, cfg, ...extra };
}

describe("⚠⚠ emiterea sub zavor", () => {
  test("doua fire concurente fac EXACT o cerere la /oauth/token si primesc acelasi token", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      const cfg = await dep.citesteConfig(B);
      const [a, b] = await Promise.all([emiteToken(dep, B, cfg), emiteToken(dep, B, cfg)]);
      assert.ok(a.ok && b.ok, "unul dintre fire n-a primit token");
      assert.equal(srv.stare.emiteri, 1, `s-au facut ${srv.stare.emiteri} emiteri: a doua l-ar fi revocat pe prima`);
      assert.equal(a.ok && a.token, b.ok && b.token);
    });
    const scris = dep.configuri.get(B)!;
    assert.equal(scris.token_versiune, 1);
    assert.equal(scris.emitere_id, null, "zavorul a ramas luat dupa scriere");
    assert.equal(scris.access_token, srv.stare.tokenViu);
  });

  test("tokenul scris poarta scopurile cerute, scopurile din JWT si `sub` pentru cheia de ritm", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(() => emiteToken(dep, B, dep.configuri.get(B)!));
    const c = dep.configuri.get(B)!;
    assert.deepEqual(c.scopuri_cerute, [...SCOPURI]);
    assert.deepEqual(c.scopuri, [...SCOPURI]);
    assert.equal(c.jwt_sub, "42");
    assert.equal(cheiaDeRitm(c), "easysales:42");
    assert.ok(Date.parse(c.token_expira_la!) > Date.now() + 360 * 86400_000, "expirarea nu e la un an");
  });

  test("cine vede o versiune veche nu emite peste tokenul proaspat al altuia", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      const vechi = { ...dep.configuri.get(B)! };
      await emiteToken(dep, B, vechi);
      const r = await emiteToken(dep, B, vechi); // tot cu versiunea 0
      assert.ok(r.ok);
      assert.equal(srv.stare.emiteri, 1, "a doua emitere ar fi revocat tokenul proaspat");
    });
  });
});

describe("⚠⚠ numai refuzurile RECUNOSCUTE cer reconectarea", () => {
  test("secret gresit (invalid_client, 401) -> credentiale, reconectare", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv, { client_secret: "gresit" }) });
    const r = await srv.cuFetch(() => emiteToken(dep, B, dep.configuri.get(B)!));
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.motiv === "credentiale" && r.reconectare);
    assert.equal(dep.configuri.get(B)!.emitere_id, null, "zavorul a ramas luat dupa un refuz");
  });

  test("website token reimprospatat (invalid_grant) -> website_token, reconectare", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv, { website_token: "alt-token" }) });
    const r = await srv.cuFetch(() => emiteToken(dep, B, dep.configuri.get(B)!));
    assert.ok(!r.ok && r.motiv === "website_token" && r.reconectare);
  });

  test("⚠ o pana de retea sau un 5xx NU cer niciodata reconectarea", async () => {
    for (const forta of [caderePeRetea, timpExpirat, () => new Response("{}", { status: 503 })]) {
      const srv = serverFals();
      srv.forteaza((c) => c.cale === "/oauth/token", forta as never);
      const dep = depozitFals({ [B]: cfgDeBaza(srv) });
      const r = await srv.cuFetch(() => emiteToken(dep, B, dep.configuri.get(B)!));
      assert.ok(!r.ok && r.motiv === "trecatoare" && !r.reconectare, `pana ${forta.name} a cerut reconectarea`);
    }
  });

  test("motivulRefuzului pe forme: invalid_request fara indiciu de website e un defect al nostru", () => {
    assert.equal(motivulRefuzului(400, { error: "invalid_request", hint: "Check the `grant_type` parameter" }), "refuz");
    assert.equal(motivulRefuzului(400, { error: "invalid_request", hint: "Check the `website_token` parameter" }), "website_token");
    assert.equal(motivulRefuzului(400, { error: "invalid_request", hint: "Check the `client_id` parameter" }), "credentiale");
    assert.equal(motivulRefuzului(401, null), "credentiale");
    assert.equal(motivulRefuzului(429, null), "trecatoare");
  });
});

describe("scope-urile refuzate de grant", () => {
  test("scope-ul numit in indiciu se scoate si se reincearca, o singura emitere reusita", async () => {
    const srv = serverFals({ scopuriRefuzate: ["read-offers"] });
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    const r = await srv.cuFetch(() => emiteToken(dep, B, dep.configuri.get(B)!));
    assert.ok(r.ok);
    assert.equal(srv.stare.emiteri, 1);
    assert.ok(!dep.configuri.get(B)!.scopuri_cerute!.includes("read-offers"));
    assert.ok(dep.configuri.get(B)!.scopuri_cerute!.includes("manage-webhooks"));
  });

  test("fara indiciu se cade o data pe lista esentiala", async () => {
    const srv = serverFals({ scopuriRefuzate: ["read-offers"], scopuriRefuzateFaraIndiciu: true });
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    const r = await srv.cuFetch(() => emiteToken(dep, B, dep.configuri.get(B)!));
    assert.ok(r.ok);
    assert.ok(!dep.configuri.get(B)!.scopuri_cerute!.includes("read-offers"));
  });

  test("scopeDinIndiciu primeste numai un scope de-al nostru", () => {
    assert.equal(scopeDinIndiciu("Check the `read-offers` scope", [...SCOPURI]), "read-offers");
    assert.equal(scopeDinIndiciu("Check the `drop-database` scope", [...SCOPURI]), null);
    assert.equal(scopeDinIndiciu(undefined, [...SCOPURI]), null);
  });
});

describe("clientul", () => {
  test("⚠⚠ `website_token` merge la radacina NUMAI pe scrierile care il au in colectie", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      const ctx = context(dep, dep.configuri.get(B)!);
      const s = await salveazaComanda(ctx, { order_id: 1000000001, status: 1 });
      assert.ok(s.ok, s.mesaj);
      const internalId = String((s.date as Record<string, unknown>).internal_id);
      await adaugaMetadate(ctx, internalId, [{ key: "edinio_order_id", value: "u" }]);
      await anuleazaComandaLaEi(ctx, internalId, "test");
      await aboneaza(ctx, "order-updated", "https://www.edinio.com/api/easysales/webhook?businessId=x&t=y", "s".repeat(48), "secret");
    });
    const scrieri = srv.stare.cereri.filter((c) => c.cale.startsWith("/api/v2/"));
    const cu = scrieri.filter((c) => (c.corp as Record<string, unknown> | null)?.website_token !== undefined).map((c) => c.cale);
    assert.deepEqual(cu, ["/api/v2/orders/save"], "website_token a plecat si pe rute care nu-l au in colectie");
  });

  test("antetele: Bearer, Accept si Content-Type JSON pe fiecare cerere", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(() => listaWebsiteuri(context(dep, dep.configuri.get(B)!)));
    const c = srv.stare.cereri.find((x) => x.cale === "/api/v2/websites/list")!;
    assert.match(c.antete.authorization, /^Bearer ey/);
    assert.equal(c.antete.accept, "application/json");
    assert.equal(c.antete["content-type"], "application/json");
  });

  test("⚠⚠ testul de conexiune (`faraEmitere`) nu emite NICIODATA, nici la 401", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv, { access_token: "token-vechi-revocat", token_versiune: 3 }) });
    const r = await srv.cuFetch(() => citesteContul(context(dep, dep.configuri.get(B)!, { faraEmitere: true })));
    assert.equal(r.verdict, "neautorizat");
    assert.equal(srv.stare.emiteri, 0, "testul de conexiune a emis un token, deci l-a revocat pe cel in uz");
    assert.equal(dep.scrieri.length, 0, "testul de conexiune a scris in configurare");
  });

  test("401 pe un token mai vechi decat cel din baza: se reia cu cel nou, FARA emitere", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      const vazut = { ...dep.configuri.get(B)! };
      const primul = await emiteToken(dep, B, vazut); // tokenul 1, versiunea 1
      assert.ok(primul.ok);
      const ctxVechi = context(dep, { ...vazut, access_token: "ey.vechi.x", token_versiune: 0, token_expira_la: new Date(Date.now() + 1e10).toISOString() });
      const r = await listaWebsiteuri(ctxVechi);
      assert.ok(r.ok, r.mesaj);
      assert.equal(srv.stare.emiteri, 1, "s-a emis inca un token desi exista deja unul mai nou");
      assert.equal(ctxVechi.cfg.token_versiune, 1);
    });
  });

  test("401 pe tokenul cel mai nou: o singura reemitere, o singura reluare, revocarea se numara", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      await emiteToken(dep, B, { ...dep.configuri.get(B)! });
      /* Altcineva emite pe acelasi client si il revoca pe al nostru. */
      await fetch("https://easy-sales.com/oauth/token", { method: "POST", body: JSON.stringify({
        grant_type: "website", client_id: srv.optiuni.clientId, client_secret: srv.optiuni.clientSecret,
        website_token: srv.optiuni.websiteToken, scope: "read-orders",
      }) });
      /* Emiterea noastra e „veche" de 11 minute: revocarea nu ne apartine. */
      const c = dep.configuri.get(B)!;
      dep.configuri.set(B, { ...c, emitere_incercata_la: new Date(Date.now() - 11 * 60_000).toISOString() });
      const ctx = context(dep, dep.configuri.get(B)!);
      const r = await listaWebsiteuri(ctx);
      assert.ok(r.ok, r.mesaj);
      assert.equal(srv.stare.emiteri, 3, "trebuia exact o reemitere a noastra dupa revocare");
    });
    const c = dep.configuri.get(B)!;
    assert.equal(c.revocari_neexplicate?.length, 1);
    assert.notEqual(c.needs_reconnect, true, "o singura revocare nu cere reconectarea");
  });

  test("a doua revocare neexplicata in 24 de ore cere reconectarea, cu mesajul despre clientul impartit", () => {
    const acum = Date.parse("2026-10-13T10:00:00Z");
    const r1 = numaraRevocarea({ revocari_neexplicate: [] }, acum);
    assert.equal(r1.reconectare, false);
    const r2 = numaraRevocarea({ revocari_neexplicate: r1.lista }, acum + 3600_000);
    assert.equal(r2.reconectare, true);
    const r3 = numaraRevocarea({ revocari_neexplicate: ["2026-10-11T10:00:00Z"] }, acum);
    assert.equal(r3.reconectare, false, "o revocare de acum doua zile nu se mai numara");
  });

  test("⚠ cel mult o reemitere la 10 minute: al doilea 401 nu mai emite", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv, {
      access_token: "ey.mort.x", token_versiune: 5, token_expira_la: new Date(Date.now() + 1e10).toISOString(),
      reemitere_401_la: new Date(Date.now() - 60_000).toISOString(),
      emitere_incercata_la: new Date(Date.now() - 60_000).toISOString(),
    }) });
    const r = await srv.cuFetch(() => listaWebsiteuri(context(dep, dep.configuri.get(B)!)));
    assert.equal(r.verdict, "neautorizat");
    assert.equal(srv.stare.emiteri, 0);
  });

  test("⚠⚠ o cadere de retea la SCRIERE iese `necunoscut`; la citire, trecatoare", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      const ctx = context(dep, dep.configuri.get(B)!);
      srv.forteaza((c) => c.cale === "/api/v2/orders/save", timpExpirat as never);
      const s = await salveazaComanda(ctx, { order_id: 1 });
      assert.equal(s.verdict, "necunoscut");
      assert.equal(s.ok, false);
      srv.forteaza((c) => c.cale === "/api/v2/websites/list", caderePeRetea as never);
      const l = await listaWebsiteuri(ctx);
      assert.equal(l.verdict, "trecatoare");
    });
  });

  test("⚠ jurnalul: scrierile si esecurile, fara corpuri; citirile reusite nu", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: cfgDeBaza(srv) });
    await srv.cuFetch(async () => {
      const ctx = context(dep, dep.configuri.get(B)!);
      await listaWebsiteuri(ctx);
      await salveazaComanda(ctx, { order_id: 7, customer: { name: "Ion Popescu", phone: "0722000000" } });
    });
    assert.deepEqual(dep.jurnal.map((r) => `${r.metoda} ${r.cale} ${r.verdict}`), ["POST /orders/save reusit"]);
    const text = JSON.stringify(dep.jurnal);
    assert.doesNotMatch(text, /Ion Popescu|0722000000|website_token|wt-x/, "in jurnal a ajuns un corp");
  });

  test("429: pauza ceruta de antete; fara antete, 60 s", () => {
    assert.equal(pauzaDupa429(new Headers({ "retry-after": "30" })), 30_000);
    const acum = 1_760_000_000_000;
    assert.equal(pauzaDupa429(new Headers({ "x-ratelimit-reset": String(acum / 1000 + 45) }), acum), 45_000);
    assert.equal(pauzaDupa429(new Headers({})), 60_000);
  });

  test("tokenulMaiTine: fara token nu; cu mai putin de o zi nu; fara data, da", () => {
    assert.equal(tokenulMaiTine({}), false);
    assert.equal(tokenulMaiTine({ access_token: "x", token_expira_la: new Date(Date.now() + 3600_000).toISOString() }), false);
    assert.equal(tokenulMaiTine({ access_token: "x", token_expira_la: new Date(Date.now() + 5 * 86400_000).toISOString() }), true);
    assert.equal(tokenulMaiTine({ access_token: "x" }), true);
  });

  test("o cerere fara token si fara date de conectare nu pleaca deloc", async () => {
    const srv = serverFals();
    const dep = depozitFals({ [B]: {} });
    const r = await srv.cuFetch(() => cerereEasySales(context(dep, {}), { metoda: "GET", cale: "/websites/list" }));
    assert.equal(r.ok, false);
    assert.equal(srv.stare.cereri.length, 0);
  });
});
