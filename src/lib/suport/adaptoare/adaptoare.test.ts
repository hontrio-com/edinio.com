import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { adaptorIntercom } from "./intercom";
import { adaptorTawk } from "./tawkto";
import { adaptorTidio } from "./tidio";
import { adaptorZendesk } from "./zendesk";
import { incarcaScript, type OptiuniAdaptor } from "./tipuri";
import type { IdentitateSemnata } from "../tipuri-chat";

/*
 * Adaptoarele celor patru furnizori, rulate pe un „browser” fals: un `document` care tine scripturile puse
 * in pagina si lasa proba sa joace rolul furnizorului (ce pune scriptul lui in `window` cand se incarca).
 *
 * Ce se probeaza e CONTRACTUL cu furnizorul, luat din documentatia lui: de la ce adresa se incarca, ce se
 * pune inainte de script, ce comenzi pleaca la deschidere, la inchidere, la identificare si la comanda.
 * Ca furnizorul chiar raspunde asa se vede numai in browser, cu un cont adevarat.
 */

type Ascultator = () => void;
type ScriptFals = {
  src: string;
  async: boolean;
  dataset: Record<string, string>;
  atribute: Record<string, string>;
  ascultatori: Record<string, Ascultator[]>;
  setAttribute: (c: string, v: string) => void;
  addEventListener: (tip: string, f: Ascultator) => void;
  remove: () => void;
  scos: boolean;
};

/** Ce face „furnizorul” cand scriptul lui ajunge in pagina. Intoarce `false` ca scriptul sa cada. */
let laScript: (s: ScriptFals) => boolean | void = () => {};
let scripturi: ScriptFals[] = [];
const g = globalThis as unknown as Record<string, unknown>;

function browserNou() {
  scripturi = [];
  laScript = () => {};
  const ascultatoriDocument: Record<string, Ascultator[]> = {};
  const stocare = new Map<string, string>();
  const document = {
    get scripts() { return scripturi.filter((s) => !s.scos); },
    cookie: "",
    createElement: (): ScriptFals => {
      const s: ScriptFals = {
        src: "", async: false, dataset: {}, atribute: {}, ascultatori: {}, scos: false,
        setAttribute(c, v) { this.atribute[c] = v; },
        addEventListener(tip, f) { (this.ascultatori[tip] ??= []).push(f); },
        remove() { this.scos = true; },
      };
      return s;
    },
    head: {
      appendChild: (s: ScriptFals) => {
        scripturi.push(s);
        setTimeout(() => {
          const ok = laScript(s) !== false;
          for (const f of s.ascultatori[ok ? "load" : "error"] ?? []) f();
        }, 0);
      },
    },
    addEventListener: (tip: string, f: Ascultator) => { (ascultatoriDocument[tip] ??= []).push(f); },
    dispatchEvent: (e: { type: string }) => { for (const f of ascultatoriDocument[e.type] ?? []) f(); return true; },
  };
  g.window = globalThis;
  g.document = document;
  g.sessionStorage = {
    getItem: (c: string) => stocare.get(c) ?? null,
    setItem: (c: string, v: string) => { stocare.set(c, v); },
  };
  g.location = { hostname: "magazin.test" };
  for (const cheie of ["tidioChatApi", "Tawk_API", "Tawk_LoadStart", "Intercom", "zE"]) delete g[cheie];
  return document;
}

type Jurnal = { necitite: number[]; stare: boolean[]; cereriDeIdentitate: number };

function optiuni(peste: Partial<OptiuniAdaptor> = {}): { o: OptiuniAdaptor; jurnal: Jurnal } {
  const jurnal: Jurnal = { necitite: [], stare: [], cereriDeIdentitate: 0 };
  const o: OptiuniAdaptor = {
    ascundeButonulLor: true,
    pozitie: "dreapta",
    acordAnaliza: false,
    laNecitite: (n) => { jurnal.necitite.push(n); },
    laStare: (d) => { jurnal.stare.push(d); },
    cereIdentitatea: async () => { jurnal.cereriDeIdentitate += 1; return { furnizor: "zendesk", jwt: "jwt-nou" }; },
    ...peste,
  };
  return { o, jurnal };
}

beforeEach(() => { browserNou(); });

/* ═══ Scriptul ═══ */

test("un script cazut se scoate din pagina, iar a doua incercare il pune din nou", async () => {
  laScript = () => false;
  await assert.rejects(incarcaScript("https://code.tidio.co/abc.js"), /nu s-a putut incarca/);
  assert.equal(scripturi.length, 1);
  assert.equal(scripturi[0].scos, true, "scriptul cazut a ramas in pagina");
  laScript = () => true;
  await incarcaScript("https://code.tidio.co/abc.js");
  assert.equal(scripturi.length, 2, "a doua incercare n-a pus un script nou");
  /* Odata incarcat, nu se mai pune a doua oara. */
  await incarcaScript("https://code.tidio.co/abc.js");
  assert.equal(scripturi.length, 2);
});

/* ═══ Tidio ═══ */

function tidioFals() {
  const apeluri: string[] = [];
  const ascultatori: Record<string, ((d?: unknown) => void)[]> = {};
  const api = {
    on: (e: string, f: (d?: unknown) => void) => { (ascultatori[e] ??= []).push(f); if (e === "ready") f(); },
    open: () => { apeluri.push("open"); for (const f of ascultatori.open ?? []) f(); },
    close: () => { apeluri.push("close"); for (const f of ascultatori.close ?? []) f(); },
    show: () => { apeluri.push("show"); },
    hide: () => { apeluri.push("hide"); },
    setVisitorData: (d: Record<string, unknown>) => { apeluri.push(`setVisitorData:${JSON.stringify(d)}`); },
    addVisitorTags: (t: string[]) => { apeluri.push(`tags:${t.join(",")}`); },
    track: (e: string) => { apeluri.push(`track:${e}`); },
    resetVisitor: () => { apeluri.push("resetVisitor"); },
  };
  laScript = () => {
    g.tidioChatApi = api;
    (g.document as { dispatchEvent: (e: { type: string }) => boolean }).dispatchEvent({ type: "tidioChat-ready" });
  };
  return { apeluri, emite: (e: string, d?: unknown) => { for (const f of ascultatori[e] ?? []) f(d); } };
}

test("Tidio: scriptul de la code.tidio.co, limba si identitatea puse INAINTE de el, widgetul ascuns in repaus", async () => {
  const { apeluri, emite } = tidioFals();
  const { o, jurnal } = optiuni();
  const a = adaptorTidio("abcdefghijklmnopqrstuvwxyz012345", o);
  const identitate: IdentitateSemnata = { furnizor: "tidio", id: "cont-1", nume: "Ana Pop", email: "ana@exemplu.ro", telefon: "+40712345678" };
  await a.incarca(identitate);

  assert.equal(scripturi[0].src, "https://code.tidio.co/abcdefghijklmnopqrstuvwxyz012345.js");
  const doc = g.document as { tidioChatLang?: string; tidioIdentify?: Record<string, string> };
  assert.equal(doc.tidioChatLang, "ro");
  assert.deepEqual(doc.tidioIdentify, { distinct_id: "cont-1", email: "ana@exemplu.ro", name: "Ana Pop", phone: "+40712345678" });
  /* Ascuns de DOUA ori, dinadins: de cum exista API-ul (ca butonul lor sa nu apuce sa apara) si din nou la „gata”. */
  assert.deepEqual(apeluri, ["hide", "hide"], "butonul lor nu a fost ascuns dupa incarcare");

  a.deschide();
  assert.deepEqual(apeluri.slice(2), ["show", "open"]);
  assert.deepEqual(jurnal.stare, [true]);

  /* Un mesaj al operatorului cu fereastra deschisa nu e „necitit”. */
  emite("messageFromOperator");
  assert.deepEqual(jurnal.necitite, [0]);
  a.inchide();
  assert.deepEqual(apeluri.slice(-2), ["close", "hide"], "dupa inchidere, widgetul lor se ascunde din nou");
  emite("messageFromOperator");
  emite("messageFromOperator");
  assert.deepEqual(jurnal.necitite, [0, 1, 2]);
});

test("Tidio: iesirea din cont sterge identitatea si reseteaza vizitatorul; comanda se spune o singura data", async () => {
  const { apeluri } = tidioFals();
  const a = adaptorTidio("abcdefghijklmnopqrstuvwxyz012345", optiuni({ ascundeButonulLor: false }).o);
  await a.incarca({ furnizor: "tidio", id: "cont-1", nume: "", email: "ana@exemplu.ro", telefon: "" });
  assert.equal(apeluri.length, 0, "cu butonul furnizorului, widgetul nu se ascunde");

  a.identifica(null);
  assert.equal((g.document as { tidioIdentify?: unknown }).tidioIdentify, undefined);
  assert.ok(apeluri.includes("resetVisitor"));

  a.spuneContextul({ titlu: "Produs", adresa: "https://x/produs" }, { numar: "#0281", total: "139 RON" });
  a.spuneContextul(null, { numar: "#0281", total: "139 RON" });
  assert.equal(apeluri.filter((x) => x === "tags:Comanda #0281").length, 1);
  assert.equal(apeluri.filter((x) => x === "track:order_placed").length, 1);
});

/* ═══ tawk.to ═══ */

function tawkFals() {
  const apeluri: string[] = [];
  laScript = () => {
    const api = g.Tawk_API as Record<string, unknown>;
    Object.assign(api, {
      maximize: () => { apeluri.push("maximize"); (api.onChatMaximized as Ascultator)(); },
      minimize: () => { apeluri.push("minimize"); (api.onChatMinimized as Ascultator)(); },
      showWidget: () => { apeluri.push("showWidget"); },
      hideWidget: () => { apeluri.push("hideWidget"); },
      login: (d: Record<string, unknown>) => { apeluri.push(`login:${JSON.stringify(d)}`); },
      logout: () => { apeluri.push("logout"); },
      setAttributes: (at: Record<string, string>) => { apeluri.push(`attr:${JSON.stringify(at)}`); },
      addEvent: (n: string, d: Record<string, string>) => { apeluri.push(`event:${n}:${JSON.stringify(d)}`); },
      setChatInputMessage: (m: string) => { apeluri.push(`mesaj:${m}`); },
    });
    /* Ca widgetul lor: intai `onBeforeLoad` (inainte sa se deseneze), apoi desenarea, apoi `onLoad`. */
    (api.onBeforeLoad as Ascultator | undefined)?.();
    apeluri.push("(desenat)");
    (api.onLoad as Ascultator)();
  };
  return { apeluri };
}

test("tawk.to: scriptul de la embed.tawk.to cu atributele lor, widgetul ascuns si omul autentificat la incarcare", async () => {
  const { apeluri } = tawkFals();
  const { o, jurnal } = optiuni();
  const a = adaptorTawk("0123456789abcdef01234567", "default", o);
  await a.incarca({ furnizor: "tawkto", id: "cont-1", hash: "abc123", nume: "Ana Pop", email: "ana@exemplu.ro", telefon: "" });

  assert.equal(scripturi[0].src, "https://embed.tawk.to/0123456789abcdef01234567/default");
  assert.deepEqual(scripturi[0].atribute, { charset: "UTF-8", crossorigin: "*" });
  assert.ok(g.Tawk_LoadStart instanceof Date);
  /* ⚠ Ascuns INAINTE de desenare (`onBeforeLoad`): altfel butonul lor ar aparea o clipa langa al nostru. */
  assert.deepEqual(apeluri, ["hideWidget", "(desenat)", "hideWidget", 'login:{"hash":"abc123","userId":"cont-1","email":"ana@exemplu.ro","name":"Ana Pop"}']);

  a.deschide("Am o intrebare despre comanda #0281");
  assert.deepEqual(apeluri.slice(4), ["showWidget", "maximize", "mesaj:Am o intrebare despre comanda #0281"]);
  assert.deepEqual(jurnal.stare, [true]);
  a.inchide();
  assert.deepEqual(apeluri.slice(-2), ["minimize", "hideWidget"]);
  assert.deepEqual(jurnal.stare, [true, false]);

  (g.Tawk_API as { onChatMessageAgent: (m: unknown) => void }).onChatMessageAgent("salut");
  assert.deepEqual(jurnal.necitite, [0, 1]);
});

test("tawk.to: produsul si cosul pleaca drept atribute cu chei permise, comanda drept eveniment, o data", async () => {
  const { apeluri } = tawkFals();
  const a = adaptorTawk("0123456789abcdef01234567", "default", optiuni().o);
  await a.incarca(null);
  const pagina = { titlu: "Inel", adresa: "https://x/inel", produs: { nume: "Inel argint", cod: "IN-1", pret: "139 RON" }, cos: { produse: 2, valoare: "278 RON" } };
  a.spuneContextul(pagina, { numar: "#0281", total: "278 RON" });
  a.spuneContextul(pagina, { numar: "#0281", total: "278 RON" });

  const atribute = apeluri.filter((x) => x.startsWith("attr:")).map((x) => JSON.parse(x.slice(5)) as Record<string, string>);
  assert.deepEqual(atribute[0], { produs: "Inel argint", "pret-produs": "139 RON", "cod-produs": "IN-1", cos: "2 produse, 278 RON" });
  /* tawk.to primeste doar chei din litere, cifre si liniuta. */
  for (const at of atribute) for (const cheie of Object.keys(at)) assert.match(cheie, /^[a-z0-9-]+$/);
  assert.equal(apeluri.filter((x) => x.startsWith("event:comanda-plasata:")).length, 1);
  assert.ok(apeluri.includes('event:comanda-plasata:{"numar":"#0281","total":"278 RON"}'));

  a.identifica(null);
  assert.equal(apeluri.at(-1), "logout");
});

/* ═══ Intercom ═══ */

function intercomFals(porneste = true) {
  const apeluri: unknown[][] = [];
  const ascultatori: Record<string, (v?: unknown) => void> = {};
  laScript = () => {
    const coada = (g.Intercom as { q: unknown[][] }).q;
    const real = (...args: unknown[]) => {
      apeluri.push(args);
      const [comanda, f] = args;
      if (typeof comanda === "string" && typeof f === "function") {
        ascultatori[comanda] = f as (v?: unknown) => void;
        if (comanda === "ready" && porneste) (f as () => void)();
      }
      if (comanda === "show" || comanda === "showNewMessage") ascultatori.onShow?.();
      if (comanda === "hide") ascultatori.onHide?.();
    };
    g.Intercom = real;
    for (const args of coada) real(...args);
  };
  return { apeluri, emite: (e: string, v?: unknown) => ascultatori[e]?.(v) };
}

test("Intercom: coada inainte de script, pornirea cu regiunea si fara JWT pentru un anonim", async () => {
  const { apeluri, emite } = intercomFals();
  const { o, jurnal } = optiuni({ pozitie: "stanga" });
  const a = adaptorIntercom("abcd1234", "eu", o);
  await a.incarca(null);

  assert.equal(scripturi[0].src, "https://widget.intercom.io/widget/abcd1234");
  const boot = apeluri.find((x) => x[0] === "boot")?.[1] as Record<string, unknown>;
  assert.deepEqual(boot, {
    api_base: "https://api-iam.eu.intercom.io",
    app_id: "abcd1234",
    hide_default_launcher: true,
    alignment: "left",
    language_override: "ro",
  });
  assert.ok(!("intercom_user_jwt" in boot), "un anonim nu are voie sa plece cu un JWT, nici gol");

  a.deschide();
  assert.deepEqual(apeluri.at(-1), ["show"]);
  a.deschide("Am o intrebare despre comanda #0281");
  assert.deepEqual(apeluri.at(-1), ["showNewMessage", "Am o intrebare despre comanda #0281"]);
  a.inchide();
  assert.deepEqual(jurnal.stare, [true, true, false]);

  emite("onUnreadCountChange", 3);
  emite("onUnreadCountChange", 0);
  emite("onUnreadCountChange", "x");
  assert.deepEqual(jurnal.necitite, [3, 0, 0]);
});

test("Intercom: JWT-ul pleaca la pornire; iesirea din cont inchide sesiunea, sterge cookie-urile si porneste anonim", async () => {
  const { apeluri } = intercomFals();
  const a = adaptorIntercom("abcd1234", "us", optiuni({ ascundeButonulLor: false }).o);
  await a.incarca({ furnizor: "intercom", jwt: "a.b.c" });
  const boot = apeluri.find((x) => x[0] === "boot")?.[1] as Record<string, unknown>;
  assert.equal(boot.intercom_user_jwt, "a.b.c");
  assert.equal(boot.api_base, "https://api-iam.intercom.io");
  assert.equal(boot.hide_default_launcher, false);

  const doc = g.document as { cookie: string };
  const scrise: string[] = [];
  Object.defineProperty(doc, "cookie", {
    configurable: true,
    get: () => "intercom-id-abcd1234=x; alt_cookie=1; intercom-session-abcd1234=y",
    set: (v: string) => { scrise.push(v); },
  });
  const inainte = apeluri.length;
  a.identifica(null);
  const dupa = apeluri.slice(inainte);
  assert.deepEqual(dupa.map((x) => x[0]), ["shutdown", "boot"]);
  assert.ok(!("intercom_user_jwt" in (dupa[1][1] as Record<string, unknown>)));
  assert.ok(scrise.some((c) => c.startsWith("intercom-id-abcd1234=;")) && scrise.some((c) => c.startsWith("intercom-session-abcd1234=;")));
  assert.ok(!scrise.some((c) => c.startsWith("alt_cookie")), "s-a sters un cookie care nu e al Intercom");

  a.spuneContextul({ titlu: "Inel", adresa: "https://x", produs: { nume: "Inel argint", pret: "139 RON" } }, { numar: "#0281", total: "139 RON" });
  assert.deepEqual(apeluri.at(-2), ["update", { produs_privit: "Inel argint (139 RON)" }]);
  assert.deepEqual(apeluri.at(-1), ["trackEvent", "comanda-plasata", { numar: "#0281", total: "139 RON" }]);
});

/* ═══ Zendesk ═══ */

/*
 * Scriptul lor adevarat (citit pe 22.11.2026) lasa in `window.zE` o COADA: aduna comenzile si le reda cand
 * widgetul a pornit. Falsul face la fel: pana la `porneste()`, nimic nu se executa.
 */
function zendeskFals({ porneste = true }: { porneste?: boolean } = {}) {
  const apeluri: unknown[][] = [];
  const ascultatori: Record<string, (v?: unknown) => void> = {};
  const coada: unknown[][] = [];
  const adevarat = (...args: unknown[]) => {
    apeluri.push(args);
    if (args[0] === "messenger:on" && typeof args[2] === "function") ascultatori[String(args[1])] = args[2] as (v?: unknown) => void;
    if (args[0] === "messenger:get" && args[1] === "config" && typeof args[2] === "function") (args[2] as (c: unknown) => void)({ launcherShape: "circle" });
    if (args[0] === "messenger" && args[1] === "open") ascultatori.open?.();
    if (args[0] === "messenger" && args[1] === "close") ascultatori.close?.();
  };
  const pornesteWidgetul = () => {
    g.zE = adevarat;
    for (const args of coada.splice(0)) adevarat(...args);
  };
  laScript = () => {
    g.zE = (...args: unknown[]) => { coada.push(args); };
    if (porneste) setTimeout(pornesteWidgetul, 5);
  };
  return { apeluri, coada, pornesteWidgetul, emite: (e: string, v?: unknown) => ascultatori[e]?.(v) };
}

test("Zendesk: scriptul cu id-ul lor, limba, treapta de cookie-uri dupa acord, widgetul ascuns in repaus", async () => {
  const { apeluri, emite } = zendeskFals();
  const { o, jurnal } = optiuni();
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", o);
  await a.incarca(null);

  assert.equal(scripturi[0].src, "https://static.zdassets.com/ekr/snippet.js?key=00000000-1111-4222-8333-444444444444");
  assert.equal(scripturi[0].atribute.id, "ze-snippet");
  /* Date INAINTE ca widgetul sa porneasca, deci redate primele: butonul lor nu apuca sa apara. */
  assert.deepEqual(apeluri.slice(0, 3), [["messenger:set", "locale", "ro"], ["messenger:set", "cookies", "functional"], ["messenger", "hide"]]);
  assert.ok(!apeluri.some((x) => x[1] === "loginUser"), "un anonim nu se autentifica");

  a.deschide();
  assert.deepEqual(apeluri.slice(-2), [["messenger", "show"], ["messenger", "open"]]);
  assert.deepEqual(jurnal.stare, [true]);
  a.inchide();
  assert.deepEqual(apeluri.slice(-2), [["messenger", "close"], ["messenger", "hide"]]);
  emite("unreadMessages", 2);
  assert.deepEqual(jurnal.necitite, [0, 2]);
});

test("⚠ Zendesk: „exista zE” nu inseamna „a pornit”. Incarcarea asteapta configurarea widgetului (`messenger:get config`)", async () => {
  const { coada, apeluri, pornesteWidgetul } = zendeskFals({ porneste: false });
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", optiuni().o);
  let gata = false;
  const incarcare = a.incarca(null).then(() => { gata = true; });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(gata, false, "incarcarea s-a declarat gata cu widgetul inca nepornit: butonul ar fi ramas mort");
  assert.equal(apeluri.length, 0);
  assert.ok(coada.some((x) => x[0] === "messenger:get" && x[1] === "config"), "nu s-a cerut configurarea widgetului");
  pornesteWidgetul();
  await incarcare;
  assert.equal(gata, true);
});

test("⚠ Zendesk: un widget care nu porneste (cheie stearsa, widget clasic) e un ESEC spus, nu un buton mort", async (t) => {
  /* Termenul adevarat e de 12 secunde: ceasul se da inainte, ca proba sa nu astepte. */
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  zendeskFals({ porneste: false });
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", optiuni().o);
  const incarcare = a.incarca(null);
  const cazut = assert.rejects(incarcare, /nu a raspuns la timp/);
  for (let i = 0; i < 300; i++) { t.mock.timers.tick(100); await Promise.resolve(); }
  await cazut;
});

test("Zendesk: cu acordul pentru analiza treapta e „all”; clientul cu cont primeste un JWT proaspat la fiecare cerere a widgetului", async () => {
  const { apeluri } = zendeskFals();
  const { o, jurnal } = optiuni({ acordAnaliza: true });
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", o);
  await a.incarca({ furnizor: "zendesk", jwt: "vechi" });
  assert.deepEqual(apeluri[1], ["messenger:set", "cookies", "all"]);

  const login = apeluri.find((x) => x[1] === "loginUser")!;
  const primite: string[] = [];
  (login[2] as (r: (jwt: string) => void) => void)((jwt) => primite.push(jwt));
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(primite, ["jwt-nou"], "widgetul trebuie sa primeasca tokenul cerut ACUM de la server, nu pe cel vechi");
  assert.equal(jurnal.cereriDeIdentitate, 1);

  a.identifica(null);
  assert.deepEqual(apeluri.at(-1), ["messenger", "logoutUser"]);

  a.spuneContextul({ titlu: "Inel", adresa: "https://x", produs: { nume: "Inel argint", pret: "139 RON" }, cos: { produse: 1, valoare: "139 RON" } }, { numar: "#0281", total: "139 RON", plata: "Ramburs la livrare" });
  assert.deepEqual(apeluri.at(-2), ["messenger:set", "conversationMetadata", {
    pagina: "Inel", produs: "Inel argint", pret_produs: "139 RON", cos: "1 produse, 139 RON", comanda: "#0281", total_comanda: "139 RON", plata_comanda: "Ramburs la livrare",
  }]);
  assert.deepEqual(apeluri.at(-1), ["messenger:set", "conversationTags", ["comanda-plasata"]]);
});

test("Zendesk: nu se trimite nicio comanda a widgetului clasic", async () => {
  const { apeluri } = zendeskFals();
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", optiuni().o);
  await a.incarca(null);
  a.deschide(); a.inchide(); a.identifica(null); a.spuneContextul({ titlu: "t", adresa: "a" }, { numar: "#1", total: "" });
  assert.ok(!apeluri.some((x) => String(x[0]).startsWith("webWidget")), "comenzile clasicului nu au ce cauta in widgetul de mesagerie");
});

test("un furnizor care arunca nu strica pagina magazinului", async () => {
  laScript = () => {
    g.zE = (...args: unknown[]) => {
      /* Raspunde doar la intrebarea de pornire; orice altceva arunca. */
      if (args[0] === "messenger:get" && typeof args[2] === "function") { (args[2] as (c: unknown) => void)({}); return; }
      throw new Error("stricat");
    };
  };
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", optiuni().o);
  await a.incarca(null);
  assert.doesNotThrow(() => { a.deschide(); a.inchide(); a.identifica(null); a.spuneContextul({ titlu: "t", adresa: "a" }, null); });
});

/* ═══ Acordul retras dupa incarcare ═══
 *
 * Omul redeschide „Setari cookie-uri” si opreste categoria „Functionale” cu chatul deja incarcat. Scriptul
 * furnizorului nu se mai poate scoate din pagina, dar widgetul trebuie sa iasa din ea pe loc si, unde furnizorul
 * are o comanda pentru asta, sa-si stearga ce a pus in browser.
 */

test("⚠ acord retras, Tidio si tawk.to: fereastra se inchide si widgetul iese din pagina; dat din nou cu butonul lor, revine", async () => {
  const tidio = tidioFals();
  const a = adaptorTidio("abcdefghijklmnopqrstuvwxyz012345", optiuni({ ascundeButonulLor: false }).o);
  await a.incarca(null);
  a.acord(false, false);
  assert.deepEqual(tidio.apeluri.slice(-2), ["close", "hide"]);
  a.acord(true, false);
  assert.equal(tidio.apeluri.at(-1), "show", "cu butonul furnizorului, widgetul trebuie sa revina odata cu acordul");

  browserNou();
  const tawk = tawkFals();
  const b = adaptorTawk("0123456789abcdef01234567", "default", optiuni({ ascundeButonulLor: false }).o);
  await b.incarca(null);
  b.acord(false, false);
  assert.deepEqual(tawk.apeluri.slice(-2), ["minimize", "hideWidget"]);
  b.acord(true, false);
  assert.equal(tawk.apeluri.at(-1), "showWidget");
});

test("acord dat din nou, cu butonul magazinului: widgetul lor NU revine singur, il arata abia deschiderea", async () => {
  const tidio = tidioFals();
  const a = adaptorTidio("abcdefghijklmnopqrstuvwxyz012345", optiuni().o);
  await a.incarca(null);
  a.acord(false, false);
  const inainte = tidio.apeluri.length;
  a.acord(true, false);
  assert.equal(tidio.apeluri.length, inainte, "cu butonul magazinului, acordul nu are voie sa arate butonul furnizorului");
  a.deschide();
  assert.deepEqual(tidio.apeluri.slice(-2), ["show", "open"]);
});

test("⚠ acord retras, Intercom: Messengerul se opreste, cookie-urile lui se sterg si NU reporneste pana la acord", async () => {
  const { apeluri } = intercomFals();
  const a = adaptorIntercom("abcd1234", "eu", optiuni().o);
  await a.incarca({ furnizor: "intercom", jwt: "jwt-vechi" });
  const doc = g.document as { cookie: string };
  const scrise: string[] = [];
  Object.defineProperty(doc, "cookie", {
    configurable: true,
    get: () => "intercom-id-abcd1234=x; intercom-session-abcd1234=y; cos=1",
    set: (v: string) => { scrise.push(v); },
  });

  const inainte = apeluri.length;
  a.acord(false, false);
  assert.deepEqual(apeluri.slice(inainte).map((x) => x[0]), ["shutdown"], "dupa retragere nu are voie sa urmeze o pornire");
  assert.ok(scrise.some((c) => c.startsWith("intercom-id-abcd1234=;")) && scrise.some((c) => c.startsWith("intercom-session-abcd1234=;")));
  assert.ok(!scrise.some((c) => c.startsWith("cos=")), "s-a sters un cookie al magazinului");

  /* Acordul revine: porneste anonim (cine e omul se spune din nou la deschidere), o singura data. */
  a.acord(true, false);
  const boot = apeluri.at(-1)!;
  assert.equal(boot[0], "boot");
  assert.ok(!("intercom_user_jwt" in (boot[1] as Record<string, unknown>)), "repornirea de dupa acord trebuie sa fie anonima");
  a.deschide();
  assert.deepEqual(apeluri.slice(-1), [["show"]], "deschiderea a pornit Messengerul a doua oara");
});

test("Intercom: deschis cu acordul dat la buton dupa o retragere, porneste intai si abia apoi arata fereastra", async () => {
  const { apeluri } = intercomFals();
  const a = adaptorIntercom("abcd1234", "us", optiuni().o);
  await a.incarca(null);
  a.acord(false, false);
  a.deschide("Am o intrebare despre comanda #0281");
  assert.deepEqual(apeluri.slice(-2).map((x) => x[0]), ["boot", "showNewMessage"]);
});

test("⚠ acord retras, Zendesk: treapta „none” (widgetul isi sterge stocarea); la intoarcere, treapta dupa acordul de analiza", async () => {
  const { apeluri } = zendeskFals();
  const a = adaptorZendesk("00000000-1111-4222-8333-444444444444", optiuni().o);
  await a.incarca(null);
  a.acord(false, false);
  /* Inchiderea ascunde si butonul lor (ascultatorul nostru de `close`), apoi vine treapta „none”. */
  assert.deepEqual(apeluri.slice(-3), [["messenger", "close"], ["messenger", "hide"], ["messenger:set", "cookies", "none"]]);
  a.acord(true, true);
  assert.deepEqual(apeluri.slice(-2), [["messenger:set", "cookies", "all"], ["messenger", "hide"]]);
  a.acord(true, false);
  assert.deepEqual(apeluri.slice(-2), [["messenger:set", "cookies", "functional"], ["messenger", "hide"]]);

  browserNou();
  const cuAlLor = zendeskFals();
  const b = adaptorZendesk("00000000-1111-4222-8333-444444444444", optiuni({ ascundeButonulLor: false }).o);
  await b.incarca(null);
  b.acord(false, false);
  b.acord(true, false);
  assert.deepEqual(cuAlLor.apeluri.at(-1), ["messenger", "show"], "cu butonul furnizorului, widgetul trebuie aratat din nou dupa „none”");
});
