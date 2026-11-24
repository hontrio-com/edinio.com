import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import { SECRETE_THEMARKETER } from "./config";
import { FISIERE_PUSH_THEMARKETER } from "@/lib/segmente-rezervate";
import { ETICHETA_SUPRIMARE } from "@/lib/abandoned/suprimare";

/*
 * theMarketer, legat peste tot: probe pe SURSA, pentru legaturile care nu se vad intr-o proba de functie.
 * Fiecare apara o regula care, rupta, n-ar da nicio eroare: un secret necriptat, un script fara acord,
 * date personale in HTML, o actiune fara verificarea proprietarului.
 */

const citeste = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** Codul viu, fara comentarii: o regula scrisa intr-un comentariu nu e o regula. */
const viu = (p: string) => citeste(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const MIGRATIA = "migrations/2027-02-07-themarketer.sql";

test("secretele sunt aceleasi in cod, in lista de criptare si in migratie", () => {
  assert.deepEqual([...CAMPURI_SECRETE.themarketer_config].sort(), [...SECRETE_THEMARKETER].sort());
  const sql = citeste(MIGRATIA);
  for (const camp of SECRETE_THEMARKETER) {
    assert.match(sql, new RegExp(`\\('themarketer_config', '${camp}'\\)`), camp);
  }
  assert.match(sql, /select privat\.reconstruieste_store_settings\(\);\s*select privat\.reconstruieste_store_settings_upd\(\);/);
});

test("migratia: theMarketer in coada, functiile noi numai pentru server, tabelele fara acces din browser", () => {
  const sql = citeste(MIGRATIA);
  assert.match(sql, /check \(furnizor in \('mailchimp', 'brevo', 'klaviyo', 'themarketer'\)\)/);
  assert.match(sql, /coalesce\(v_tm ->> 'enabled', ''\) = 'true' and coalesce\(v_tm ->> 'comenzi', 'true'\) = 'true'/);
  assert.match(sql, /and \(d\.generat_de is null or c\.q <> ''\)/);
  for (const f of ["themarketer_dezaboneaza(uuid, text[], text)", "themarketer_emailurile_clientilor(uuid, text[])"]) {
    assert.ok(sql.includes(`revoke all on function public.${f} from public, anon, authenticated;`), f);
    assert.ok(sql.includes(`grant execute on function public.${f} to service_role;`), f);
  }
  for (const t of ["themarketer_chei", "themarketer_stare", "recenzii_produse"]) {
    assert.ok(sql.includes(`alter table public.${t} enable row level security;`), t);
    assert.ok(sql.includes(`revoke all on table public.${t} from anon, authenticated;`), t);
  }
  /* Motivele de dezabonare sunt cele pe care panoul stie sa le scrie omului. */
  const motive = /p_motiv not in \(([^)]*)\)/.exec(sql)![1].split(",").map((s) => s.trim().replace(/'/g, ""));
  for (const m of motive) assert.ok(m in ETICHETA_SUPRIMARE, `motiv necunoscut panoului: ${m}`);
  /* Aplicata in productie pe 18.11.2026: nu mai e „in asteptare”, deci schema de referinta o cuprinde. */
  assert.ok(!citeste("scripts/verifica-tipuri-db.mjs").includes("2027-02-07-themarketer"));
  assert.match(citeste("migrations/000-schema-baseline.sql"), /themarketer_config/);
});

test("coada de email marketing trimite si la theMarketer", () => {
  assert.match(viu("src/lib/email-marketing/coada.ts"), /export type Furnizor = "mailchimp" \| "brevo" \| "klaviyo" \| "themarketer";/);
  assert.match(viu("src/lib/email-marketing/comanda.ts"), /case "themarketer": return evenimentTheMarketer\(orderId, fel\);/);
});

test("abonarea pleaca din ambele checkout-uri si din formulare, dupa raspuns", () => {
  const comenzi = viu("src/lib/actions/order.actions.ts");
  assert.equal(comenzi.split("dupaRaspuns(() => maybeSyncTheMarketerSubscriber({").length - 1, 2);
  const pagini = viu("src/lib/actions/page.actions.ts");
  assert.match(pagini, /if \(theMarketerEnabled\) \{/);
  assert.match(pagini, /dupaRaspuns\(\(\) => maybeSyncTheMarketerSubscriber\(comun\)/);
});

test("⚠ scriptul theMarketer: numai sub acordul pentru marketing, numai in magazinul real si in afara contului", () => {
  const l = viu("src/app/(public)/[slug]/layout.tsx");
  const i = l.indexOf("<TheMarketerTracking");
  assert.ok(i > 0);
  const inainte = l.slice(0, i);
  assert.match(inainte.slice(inainte.lastIndexOf("<ConsentGate")), /^<ConsentGate slug=\{slug\} category="marketing" bypass=\{!requireConsent\}>/);
  assert.ok(inainte.lastIndexOf("<DoarInAfaraContului") > inainte.lastIndexOf("</DoarInAfaraContului>"), "in afara zonei de cont");
  assert.ok(inainte.lastIndexOf("<DoarInMagazinReal>") > inainte.lastIndexOf("</DoarInMagazinReal>"), "nu in editor");
  /* Al patrulea argument (22.11.2026) e chatul de suport, cu categoria lui; al treilea ramane theMarketer. */
  assert.match(l, /detectConsentCategories\(mc, gaMeasurementId, tm !== null, chat !== null\)/);
});

test("⚠ vitrina citeste NUMAI campurile publice ale configurarii", () => {
  for (const f of ["src/lib/storefront/antet-magazin.ts", "src/app/(public)/[slug]/confirm/page.tsx", "src/app/(public)/[slug]/_rute/pagina-produs.tsx", "src/lib/themarketer/push.ts"]) {
    const s = viu(f);
    assert.ok(!/themarketer_config\s*[,)"]/.test(s), `${f} cere configurarea intreaga`);
    assert.ok(!/rest_key|cheie_feed/.test(s), `${f} atinge un secret`);
    assert.match(s, /tm_[a-z]+:themarketer_config->/, f);
  }
});

test("⚠ pagina de multumire nu pune date personale in HTML pentru theMarketer", () => {
  const s = viu("src/app/(public)/[slug]/confirm/page.tsx");
  assert.match(s, /corpTheMarketer = corpComandaFaraPersoana\(\{/);
  const bloc = s.slice(s.indexOf("corpTheMarketer = corpComandaFaraPersoana({"), s.indexOf("}, liniiTM(orderItems, produse));"));
  assert.ok(!/customerEmail|customerPhone|customerName|adresaLivrare/.test(bloc));
  assert.match(s, /<ComandaTheMarketer orderId=\{orderId\} corp=\{corpTheMarketer\} \/>/);
  /* Datele omului vin din tabul lui, pastrate la checkout NUMAI cu scriptul incarcat. */
  const b = viu("src/lib/themarketer/comanda-browser.ts");
  assert.match(b, /if \(!orderId \|\| !scriptulEIncarcat\(\)\) return;/);
  for (const f of ["src/components/storefront/sections/checkout/checkout-core.ts", "src/components/ministore/OrderModal.tsx"]) {
    assert.match(viu(f), /pastreazaPentruTheMarketer\(orderId, \{/, f);
  }
});

test("proxy-ul lasa la rescriere EXACT cele doua fisiere push, nimic pe prefix", () => {
  assert.deepEqual([...FISIERE_PUSH_THEMARKETER].sort(), ["/firebase-config.js", "/firebase-messaging-sw.js"]);
  assert.match(viu("src/proxy.ts"), /&& !FISIERE_PUSH_THEMARKETER\.has\(request\.nextUrl\.pathname\)/);
});

test("fiecare actiune a paginii incepe cu verificarea proprietarului", () => {
  const s = viu("src/lib/actions/themarketer.actions.ts");
  const exporturi = [...s.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  assert.ok(exporturi.length >= 6);
  for (const nume of exporturi) {
    const corp = s.slice(s.indexOf(`export async function ${nume}(`));
    const prima = corp.slice(corp.indexOf("{") + 1, corp.indexOf("\n  if (\"error\" in owned)"));
    assert.match(prima, /const owned = await requireOwned\(businessId\);/, nume);
  }
  /* "use server" expune orice export: nimic altceva in afara de actiuni. */
  assert.deepEqual([...s.matchAll(/^export (?!async function|type)/gm)].length, 0);
});

test("rutele: fiecare feed cu felul lui; codul se genereaza numai dupa cheia REST", () => {
  for (const fel of ["produse", "categorii", "branduri", "comenzi"]) {
    const ext = fel === "comenzi" ? "json" : "xml";
    const s = viu(`src/app/api/themarketer/[cheie]/${fel}.${ext}/route.ts`);
    assert.equal(s.split(`raspundeCuFeed(req, cheie, "${fel}")`).length - 1, 2, fel);
  }
  const cod = viu("src/app/api/themarketer/[cheie]/cod-reducere/route.ts");
  assert.ok(cod.indexOf("egaleInTimpConstant(") < cod.indexOf('.from("discounts").insert('));
  assert.match(cod, /generat_de: "themarketer"/);
  assert.match(cod, /max_uses: 1,/);
});

test("cronul e programat, iar pagina din panou e legata de ghid si de catalog", () => {
  const vercel = JSON.parse(citeste("vercel.json")) as { crons: { path: string }[] };
  assert.ok(vercel.crons.some((c) => c.path === "/api/cron/themarketer"));
  assert.match(viu("src/app/(dashboard)/dashboard/features/page.tsx"), /\{ name: "TheMarketer", logo: "\/integrations\/themarketer\.svg", id: "themarketer" \}/);
  assert.match(viu("src/lib/dashboard/ghiduri-integrari.ts"), /themarketer: \["marketing-si-clienti", "cum-conectezi-themarketer"\]/);
});

test("pagina din panou nu aduce in browser module de server", () => {
  const s = viu("src/components/dashboard/TheMarketerClient.tsx");
  for (const m of ["@/lib/themarketer/server", "@/lib/themarketer/client", "@/lib/themarketer/sync", "@/lib/themarketer/chei", "@/lib/supabase/admin"]) {
    assert.ok(!s.includes(`"${m}"`), m);
  }
  assert.match(s, /^"use client";/);
});

test("scriptul din vitrina e cel din documentatia lor, cu cheia pusa prin JSON", () => {
  const s = viu("src/components/public/TheMarketerTracking.tsx");
  assert.match(s, /https:\/\/t\.themarketer\.com\/t\/j\//);
  assert.match(s, /window\.mktr_key=\$\{k\}/);
  assert.match(s, /if \(!cheieUrmarireValida\(cheie\)\) return null;/);
  assert.match(s, /window\.__edinioFlushQueue\('mk'\)/);
});

test("⚠⚠ orice scriere duce cheile salvate, iar deconectarea sterge tot: vederea NU pazeste secretele", () => {
  /*
   * Masurat in productie pe 18.11.2026: o scriere prin vederea `store_settings` cu `rest_key: ""` goleste
   * cheia. Declansatorul vederii doar cripteaza; paza traieste numai in `jsonb_merge_config`. Deci o
   * scriere care ar uita cheile le-ar sterge, in tacere.
   */
  const s = viu("src/lib/actions/themarketer.actions.ts");
  const corp = (nume: string) => {
    const i = s.indexOf(`export async function ${nume}(`);
    assert.ok(i > 0, nume);
    return s.slice(i, s.indexOf("\n}\n", i));
  };
  /* Legarea: pleaca de la configurarea salvata si pune cheile in clar (se cripteaza la scriere). */
  assert.match(corp("conecteazaTheMarketer"), /\.\.\.\(salvata \?\? \{\}\),[\s\S]*rest_key: c\.rest_key,\s*cheie_feed: cheieFeed,/);
  /* Modulele si rotirea: configurarea salvata, intreaga, cu ce se schimba peste ea. */
  assert.match(corp("salveazaModuleleTheMarketer"), /const next: TheMarketerConfig = \{ \.\.\.salvata, \.\.\.curate, abonati \};/);
  assert.match(corp("rotesteCheiaTheMarketer"), /scrie\(owned\.supabase, businessId, \{ \.\.\.salvata, cheie_feed: cheie \}\)/);
  /* Configurarea salvata vine decriptat (cheia de serviciu), nu `enc.v1.` de pe clientul omului. */
  assert.match(viu("src/lib/themarketer/server.ts"), /createAdminClient\(\)/);
  /* Deconectarea: `null`, adica fara nicio cheie ramasa. */
  const d = corp("deconecteazaTheMarketer");
  assert.match(d.slice(0, d.indexOf("revalideaza();")), /await scrie\(owned\.supabase, businessId, null\)/);
  assert.match(d, /stingeCheileVechi\(createAdminClient\(\), businessId, null\)/);
});

test("⚠ codurile generate (pot fi mii) nu umplu nicio lista si nu taie codurile comerciantului", () => {
  const sql = citeste(MIGRATIA);
  /* Lista, cifrele de langa filtre si numarul codurilor din cap: aceeasi multime. */
  const corp = (f: string) => {
    const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
    assert.ok(i > 0, f);
    return sql.slice(i, sql.indexOf("$function$\n;", i));
  };
  assert.match(corp("discounts_page"), /and \(d\.generat_de is null or c\.q <> ''\)/);
  assert.match(corp("discount_state_counts"), /and \(d\.generat_de is null or c\.q <> ''\)/);
  assert.match(corp("discount_totaluri"), /count\(\*\) filter \(where d\.generat_de is null\),\s+count\(\*\) filter \(where d\.generat_de is null and public\.discount_state\(/);
  /* Alegerea codului la cosul abandonat si verificarea lui din cron: fara codurile de o singura folosire. */
  assert.match(viu("src/lib/actions/abandoned-cart.actions.ts"), /\.eq\("is_active", true\)\.is\("generat_de", null\)\.order\("code"\)/);
  assert.match(viu("src/app/api/cron/abandoned-recovery/route.ts"), /\.eq\("is_active", true\)\s*\.is\("generat_de", null\);/);
  /* Pagina spune unde sunt, si lasa cautarea la indemana. */
  assert.match(viu("src/app/(dashboard)/dashboard/discounts/page.tsx"), /codurileTheMarketer=\{tm\?\.tm_activ === true && tm\?\.tm_coduri !== false\}/);
  const client = viu("src/components/dashboard/DiscountsClient.tsx");
  assert.match(client, /onClick=\{\(\) => scrieCautarea\("MKTR-"\)\}/);
  assert.match(client, /\{totaluri\.coduri === 0 && !cautareDinAdresa \? \(/);
  assert.match(client, /\(totaluri\.coduri >= 4 \|\| cautareDinAdresa !== "" \|\| codurileTheMarketer\)/);
});

test("⚠⚠ panoul spune domeniul de trecut in theMarketer: scriptul lor merge NUMAI pe domeniile contului", () => {
  const pagina = viu("src/app/(dashboard)/dashboard/features/themarketer/page.tsx");
  assert.match(pagina, /gazdaMagazinului=\{domeniu \|\| new URL\(PLATFORM_ORIGIN\)\.host\}/);
  const client = viu("src/components/dashboard/TheMarketerClient.tsx");
  assert.match(client, /\{gazdaMagazinului\}<\/span>: dacă în theMarketer ai alt domeniu/);
  assert.match(client, /Extra domains/);
});

test("panoul spune CARE produse lipsesc din feed, cu aceeasi regula ca feedul", () => {
  /* Feedul le lasa afara prin `motivulLipseiDinCatalog`; randul din panou citeste aceeasi hotarare. */
  assert.match(viu("src/lib/themarketer/feed-produse.ts"), /if \(motivulLipseiDinCatalog\(\{ price: p\.price, page_sections: p\.page_sections, images: p\.images \}\)\) return "";/);
  const s = viu("src/components/dashboard/TheMarketerClient.tsx");
  assert.match(s, /import \{ LasateAfara \} from "@\/components\/dashboard\/FacebookCatalogClient";/);
  assert.match(s, /<LasateAfara explicatii=\{\{\s*"fara-imagine": "theMarketer cere o imagine/);
});
