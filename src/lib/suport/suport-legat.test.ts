import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import { GHIDURI_INTEGRARI } from "@/lib/dashboard/ghiduri-integrari";
import { FURNIZORI_SUPORT, SECRETE_SUPORT, SECRETUL_FURNIZORULUI } from "./config";
import { FURNIZORI } from "./furnizori";

/*
 * Chatul de suport e legat peste tot unde trebuie, si NUMAI cum trebuie. Probele de aici citesc sursa:
 * pazesc legaturile care nu se vad din tipuri (cine monteaza butonul, ce citeste vitrina, de unde se
 * incarca scripturile, cine are voie sa ceara o semnatura).
 */

const RADACINA = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const citeste = (f: string) => readFileSync(path.join(RADACINA, f), "utf8").replace(/\r\n/g, "\n");
/** Sursa fara comentarii: o regula scrisa intr-un comentariu nu e o regula care ruleaza. */
const viu = (f: string) => citeste(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ADAPTOARE = "src/lib/suport/adaptoare";
const BUTON = "src/components/storefront/suport/ButonContact.tsx";
const LAYOUT = "src/app/(public)/[slug]/layout.tsx";
const ACTIUNI = "src/lib/actions/suport.actions.ts";
const RUTA = "src/app/api/cont/suport/route.ts";

/** Migratia: in `docs/` cat asteapta productia, in `migrations/` dupa ce a fost aplicata acolo. */
function migratia(): string {
  for (const f of ["docs/suport-clienti/2027-02-10-suport-clienti.sql", "migrations/2027-02-10-suport-clienti.sql"]) {
    if (existsSync(path.join(RADACINA, f))) return citeste(f);
  }
  assert.fail("migratia chatului de suport nu e nici in docs/suport-clienti, nici in migrations");
}

test("secretele sunt aceleasi in cod, in lista de mascare si in migratie", () => {
  assert.deepEqual([...CAMPURI_SECRETE.suport_config], [...SECRETE_SUPORT]);
  const sql = migratia();
  for (const camp of SECRETE_SUPORT) assert.ok(sql.includes(`('suport_config', '${camp}')`), `migratia nu cripteaza ${camp}`);
  assert.equal((sql.match(/\('suport_config', '/g) ?? []).length, SECRETE_SUPORT.length, "migratia cripteaza alte campuri decat cele din cod");
  assert.match(sql, /select privat\.reconstruieste_store_settings\(\);\s*select privat\.reconstruieste_store_settings_upd\(\);/);
  /* Fiecare secret e al unui furnizor care semneaza, si invers. */
  const folosite = FURNIZORI_SUPORT.map((f) => SECRETUL_FURNIZORULUI[f]).filter(Boolean);
  assert.deepEqual([...folosite].sort(), [...SECRETE_SUPORT].sort());
  for (const f of FURNIZORI_SUPORT) assert.equal(FURNIZORI[f].semneaza, SECRETUL_FURNIZORULUI[f] !== null, f);
});

test("⚠ vitrina citeste NUMAI campurile publice ale configurarii, prin cale JSON", () => {
  const s = viu("src/lib/storefront/antet-magazin.ts");
  const selecturi = [...s.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(selecturi.length, 2, "antetul are citirea lui si citirea de rezerva");
  const [principal, rezerva] = selecturi;
  for (const cale of ["sp_activ:suport_config->activ", "sp_furnizor:suport_config->>furnizor", "sp_conturi:suport_config->conturi", "sp_aspect:suport_config->aspect", "sp_date:suport_config->date"]) {
    assert.ok(principal.includes(cale), `lipseste ${cale}`);
  }
  /* Coloana intreaga ar aduce si secretele; nici ele pe nume nu au ce cauta aici. */
  assert.ok(!/(^|[\s,(])suport_config([\s,)]|$)/.test(principal), "antetul cere coloana intreaga");
  for (const camp of SECRETE_SUPORT) assert.ok(!principal.includes(camp), `antetul cere secretul ${camp}`);
  /* Citirea de rezerva e cea care merge si cand coloana lipseste: nu are voie sa o ceara. */
  assert.ok(!rezerva.includes("suport_config"), "citirea de rezerva cere coloana noua");
});

test("⚠ butonul se monteaza numai la magazinele cu chat, in afara contului si in afara editorului", () => {
  const l = viu(LAYOUT);
  const i = l.indexOf("<ButonContact");
  assert.ok(i > 0, "layoutul nu monteaza butonul");
  const inainte = l.slice(0, i);
  assert.ok(inainte.lastIndexOf("{chat && (") > inainte.lastIndexOf("</DoarInAfaraContului>"), "numai cand magazinul are chat");
  assert.ok(inainte.lastIndexOf("<DoarInAfaraContului") > inainte.lastIndexOf("</DoarInAfaraContului>"), "in afara zonei de cont");
  assert.ok(inainte.lastIndexOf("<DoarInMagazinReal>") > inainte.lastIndexOf("</DoarInMagazinReal>"), "nu in editor");
  /* Scriptul furnizorului nu se incarca din layout: niciun adaptor si nicio gazda de furnizor aici. */
  assert.ok(!/suport\/adaptoare|tidio\.co|tawk\.to|intercom\.io|zdassets/.test(l));
  /* Magazinele fara chat nu primesc niciun element in plus: `CuChat` e componenta de server si le da paginile neatinse. */
  assert.match(l, /<CuChat mod=\{chat \? chat\.aspect\.buton : null\}>/);
  assert.match(l, /function CuChat\(\{ mod, children \}[^)]*\) \{\s*return mod \? <ChatInMagazinProvider mod=\{mod\}>\{children\}<\/ChatInMagazinProvider> : <>\{children\}<\/>;\s*\}/);
  assert.ok(!citeste(LAYOUT).startsWith('"use client"'), "layoutul a devenit componenta de client");
  /*
   * ⚠ Codul butonului nu ajunge la magazinele fara chat. Masurat pe build-ul de productie (22.11.2026): importat
   * direct in layout, venea la pachet cu bannerul de cookie-uri, la FIECARE magazin. Layoutul importa numai
   * invelisul, care il aduce printr-un `dynamic()` chemat dintr-o componenta de client (din una de server,
   * Next nu desparte codul).
   */
  assert.ok(!/from "@\/components\/storefront\/suport\/ButonContact"/.test(l), "layoutul importa butonul intreg: codul lui ajunge la toate magazinele");
  assert.match(l, /import \{ ButonContactLaCerere \} from "@\/components\/storefront\/suport\/ButonContactLaCerere";/);
  const invelis = citeste("src/components/storefront/suport/ButonContactLaCerere.tsx");
  assert.ok(invelis.startsWith('"use client"'), "invelisul trebuie sa fie componenta de client: altfel `dynamic` nu desparte codul");
  assert.match(viu("src/components/storefront/suport/ButonContactLaCerere.tsx"), /const ButonContact = dynamic\(\(\) => import\("\.\/ButonContact"\)\.then\(\(m\) => m\.ButonContact\), \{ ssr: false \}\);/);
  assert.match(viu("src/components/storefront/suport/ButonContactLaCerere.tsx"), /import type \{ ButonContact as ButonContactIntreg \} from "\.\/ButonContact";/);
  /* Categoria de acord a chatului intra in banner. */
  assert.match(l, /detectConsentCategories\(mc, gaMeasurementId, tm !== null, chat !== null\)/);
});

test("⚠ scripturile de chat se incarca NUMAI de la gazdele furnizorilor", () => {
  const PERMISE = new Set([
    "code.tidio.co", "embed.tawk.to", "widget.intercom.io", "static.zdassets.com",
    "api-iam.intercom.io", "api-iam.eu.intercom.io", "api-iam.au.intercom.io",
  ]);
  const fisiere = readdirSync(path.join(RADACINA, ADAPTOARE)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.deepEqual(fisiere.sort(), ["index.ts", "intercom.ts", "tawkto.ts", "tidio.ts", "tipuri.ts", "zendesk.ts"]);
  for (const f of fisiere) {
    const s = viu(`${ADAPTOARE}/${f}`);
    for (const m of s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) assert.ok(PERMISE.has(m[1]), `${f}: gazda nepermisa ${m[1]}`);
    assert.ok(!/\beval\(|new Function\(|innerHTML|document\.write/.test(s), `${f}: cod executat din text`);
    assert.ok(!/@\/lib\/suport\/(server|semnaturi|verifica)|server-only/.test(s), `${f}: aduce cod de server`);
  }
  /* Adresa scriptului se compune din gazda fixa si din identificatorul verificat, nu dintr-un text liber. */
  assert.match(viu(`${ADAPTOARE}/tidio.ts`), /incarcaScript\(`https:\/\/code\.tidio\.co\/\$\{cheie\}\.js`\)/);
  assert.match(viu(`${ADAPTOARE}/tawkto.ts`), /incarcaScript\(`https:\/\/embed\.tawk\.to\/\$\{proprietate\}\/\$\{widget\}`/);
  assert.match(viu(`${ADAPTOARE}/intercom.ts`), /incarcaScript\(`https:\/\/widget\.intercom\.io\/widget\/\$\{app\}`\)/);
  assert.match(viu(`${ADAPTOARE}/zendesk.ts`), /incarcaScript\(`https:\/\/static\.zdassets\.com\/ekr\/snippet\.js\?key=\$\{cheie\}`/);
});

test("⚠ butonul nu aduce niciun adaptor odata cu pagina si cere acordul inainte de chat", () => {
  const b = viu(BUTON);
  assert.ok(!/from "@\/lib\/suport\/adaptoare\/(tidio|tawkto|intercom|zendesk)"/.test(b));
  /*
   * Butonul aduce numai indexul adaptoarelor, iar indexul nu aduce niciun adaptor odata cu el: fiecare vine
   * printr-un `import()` al lui. Un `import ... from "./tidio"` in index ar pune codul tuturor in pagina.
   */
  assert.match(b, /import \{ adaptorulPentru, pregatesteChatul, type AdaptorChat \} from "@\/lib\/suport\/adaptoare";/);
  const index = viu("src/lib/suport/adaptoare/index.ts");
  assert.ok(!/^import (?!type )[^\n]*from "\.\/(tidio|tawkto|intercom|zendesk)"/m.test(index), "indexul aduce un adaptor odata cu pagina");
  for (const f of ["tidio", "tawkto", "intercom", "zendesk"]) {
    assert.ok(index.includes(`import("./${f}")`), `adaptorul ${f} nu mai vine la cerere`);
  }
  /* Legatura spre furnizor se deschide din timp numai cu acordul dat: altfel i-ar arata adresa IP a omului. */
  assert.match(b, /const cuLegatura = !pregatit\.legatura && \(!cereAcord \|\| readConsent\(slug\)\?\.functional === true\);/);
  assert.match(index, /if \(!cuLegatura\) return;\s*const \{ href, cors \} = ORIGINEA_SCRIPTULUI\[furnizor\];/);
  /* Fara acordul pentru „functionale”, apasarea deschide cartonasul, nu chatul. */
  assert.match(b, /if \(cereAcord && readConsent\(slug\)\?\.functional !== true\) \{\s*setCartonas\(true\);\s*return;\s*\}/);
  /* Incarcarea automata asteapta acelasi acord si nu porneste pentru roboti. */
  assert.match(b, /chat\.aspect\.incarcare !== "automat" \|\| adaptor \|\| robot\) return;/);
  /* Robotii nu primesc nici butonul. */
  assert.match(b, /const \[robot\] = useState\(\(\) => typeof navigator !== "undefined" && eRobot\(\)\);/);
  assert.match(b, /if \(robot \|\| ascunsLaComanda \|\| ascunsPeTelefon \|\| alLorEInPagina \|\| fereastraChat \|\| paginaBlocata\) return null;/);
  assert.match(b, /if \(cereAcord && readConsent\(slug\)\?\.functional !== true\) return;/);
  /* Identitatea se cere numai pe domeniul propriu si numai cu comutatorul pornit. */
  assert.match(b, /const trimiteIdentitate = chat\.date\.identitate && peDomeniuPropriu;/);
  assert.ok(!/@\/lib\/suport\/(server|semnaturi|verifica)/.test(b), "butonul aduce cod de server");
});

test("⚠ textele butonului din vitrina sunt fara diacritice", () => {
  const b = viu(BUTON);
  const diacritice = b.match(/[ăâîșțĂÂÎȘȚşţ]/g);
  assert.equal(diacritice, null, `diacritice in vitrina: ${diacritice?.join("")}`);
  for (const text of ["Deschide chatul", "Nu acum", "Mesaj nou", "Chatul nu s-a putut deschide. Incearca din nou.", "Ai o intrebare despre comanda?"]) {
    assert.ok(b.includes(text), `lipseste textul: ${text}`);
  }
});

test("fiecare actiune a paginilor de chat incepe cu verificarea proprietarului", () => {
  const s = viu(ACTIUNI);
  assert.ok(s.startsWith('"use server";'));
  const actiuni = [...s.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);
  assert.deepEqual(actiuni.sort(), ["deconecteazaSuport", "salveazaSuport", "verificaSuport"]);
  for (const nume of actiuni) {
    const corp = s.slice(s.indexOf(`export async function ${nume}(`));
    const prima = corp.slice(corp.indexOf("{") + 1).trimStart();
    assert.ok(prima.startsWith("const owned = await requireOwned(businessId);"), `${nume} nu incepe cu requireOwned`);
  }
  /* "use server": nimic altceva nu se exporta ca valoare. */
  assert.equal((s.match(/^export (?!async function|type )/gm) ?? []).length, 0);
});

test("⚠⚠ orice scriere pleaca de la configurarea citita decriptat; o citire cazuta nu scrie nimic", () => {
  const s = viu(ACTIUNI);
  /* Citirea e cu cheia de serviciu (`citesteSuportDinBaza`), scrierea cu clientul omului, prin vedere. */
  assert.match(viu("src/lib/suport/server.ts"), /createAdminClient\(\)\s*\.from\("store_settings"\)\s*\.select\("suport_config"\)/);
  assert.match(s, /supabase\.from\("store_settings"\)\.update\(\{ suport_config: next as never \}\)/);
  for (const nume of ["verificaSuport", "salveazaSuport", "deconecteazaSuport"]) {
    const corp = s.slice(s.indexOf(`export async function ${nume}(`));
    const pana = corp.indexOf("\nexport async function ", 1);
    const al = pana > 0 ? corp.slice(0, pana) : corp;
    assert.match(al, /const citit = await citesteSigur\(businessId\);\s*if \("error" in citit\) return citit;/, `${nume}: citirea cazuta nu opreste`);
  }
  /* Salvarea porneste de la ce era salvat (`...salvata`), deci secretele celorlalti furnizori raman. */
  assert.match(s, /const next: SuportConfig = \{\s*\.\.\.salvata,/);
});

test("⚠⚠ identitatea se semneaza numai pentru omul din sesiune, numai pe domeniul magazinului", () => {
  const r = viu(RUTA);
  const pozitii = [
    r.indexOf("if (!vineDePeMagazin(req))"),
    r.indexOf("magazinulCereriiDeCont(req.headers.get(\"host\"))"),
    r.indexOf("sesiuneCurenta(magazin.id)"),
    r.indexOf("identitateaPentru("),
  ];
  assert.ok(pozitii.every((p) => p > 0), "ruta nu mai trece prin toate portile");
  assert.deepEqual([...pozitii].sort((a, b) => a - b), pozitii, "portile nu mai sunt in ordine");
  /* Nimic din cerere nu hotaraste cine e omul: nici corp, nici parametri. */
  assert.ok(!/req\.json\(|req\.text\(|formData\(|searchParams|nextUrl/.test(r), "ruta citeste ceva din cerere");
  assert.match(r, /identitateaPentru\(config\.furnizor, config, \{ id: sesiune\.contId, nume, email, telefon \}\)/);
  /* Numai emailul confirmat pleaca mai departe. */
  assert.match(r, /c\.fel === "email" && c\.verificat/);
  assert.match(r, /"Cache-Control": "private, no-store"/);
  assert.ok(!/export async function GET/.test(r), "identitatea nu se da la un GET");
});

test("paginile din panou nu aduc in browser module de server", () => {
  const c = viu("src/components/dashboard/SuportChatClient.tsx");
  assert.ok(c.startsWith('"use client";'));
  assert.ok(!/@\/lib\/suport\/(server|semnaturi|verifica)|supabase\/admin|server-only/.test(c));
  /* Secretul nu coboara in browser: pagina il goleste de doua ori (lista comuna si lista chatului). */
  const p = viu("src/components/dashboard/suport/PaginaSuport.tsx");
  assert.match(p, /mascheazaConfig\("suport_config", brut\)/);
  assert.match(p, /for \(const camp of SECRETE_SUPORT\) \{[\s\S]*?delete iesire\[camp\];/);
});

test("cele patru sunt legate in panou: ruta, card, sigla si ghid", () => {
  const hub = viu("src/app/(dashboard)/dashboard/features/page.tsx");
  const sigle = viu("src/components/dashboard/IntegrationHeader.tsx");
  for (const f of FURNIZORI_SUPORT) {
    assert.ok(existsSync(path.join(RADACINA, `src/app/(dashboard)/dashboard/features/${f}/page.tsx`)), `lipseste pagina ${f}`);
    assert.match(citeste(`src/app/(dashboard)/dashboard/features/${f}/page.tsx`), new RegExp(`<PaginaSuport furnizor="${f}" />`));
    assert.ok(hub.includes(`id: "${f}"`), `cardul ${f} nu are id`);
    assert.ok(hub.includes(`"/dashboard/features/${f}"`), `cardul ${f} nu duce nicaieri`);
    assert.match(sigle, new RegExp(`\\b${f}: \\{ src: "/integrations/`), `lipseste sigla ${f}`);
    assert.ok(GHIDURI_INTEGRARI[f], `lipseste ghidul ${f}`);
  }
  /* „Activ” sta pe cel mult un card: un singur furnizor pornit. */
  assert.match(hub, /chatPornit = furnizorPornit\(settings\?\.suport_config\);/);
  assert.match(hub, /\? chatPornit === integration\.id : false;/);
});

test("cu butonul magazinului, stiva veche „Contact rapid” nu se mai deseneaza", () => {
  const m = viu("src/components/ministore/MiniStoreRenderer.tsx");
  assert.match(m, /const chatInMagazin = useChatInMagazin\(\);/);
  assert.match(m, /\{chatInMagazin !== "magazin" && \(\s*<aside aria-label="Contact rapid"/);
  /* Butonul de contact urca deasupra barelor de jos, care isi anunta inaltimea. */
  assert.match(viu("src/components/storefront/LocPesteBaraDeJos.tsx"), /--bara-de-jos:calc\(4\.25rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(viu(BUTON), /bottom: "calc\(1\.25rem \+ max\(var\(--bara-de-jos, 0px\), var\(--banner-cookie, 0px\)\)\)"/);
  assert.match(viu("src/components/storefront/sections/cart/CartPageCompact.tsx"), /\{!preview && <LocPentruButonulDeContact \/>\}/);
});

test("bara de cookie-uri isi anunta inaltimea numai la magazinele cu chat, si o retrage cand se inchide", () => {
  const b = viu("src/components/public/CookieConsent.tsx");
  /* Masurat 22.11.2026: fara asta, la prima vizita butonul ramanea sub bara, cu o fasie de 13 px iesita deasupra. */
  assert.match(b, /const baraDeschisa = mounted && open && hasChoices && position === "bottom-bar" && !showDetails;/);
  assert.match(b, /if \(!furnizorChat \|\| !baraDeschisa\) return;/);
  assert.match(b, /radacina\.style\.setProperty\("--banner-cookie", /);
  assert.match(b, /radacina\.style\.removeProperty\("--banner-cookie"\);/);
  assert.match(b, /<div ref=\{bara\} role="region" aria-label="Cookie-uri" className=\{wrapperClass\}>/);
  /* Un singur loc scrie variabila: bara simpla. Cartonasele si fereastra din centru acopera butonul cu totul. */
  assert.equal(b.split("ref={bara}").length - 1, 1);
});

test("comanda se noteaza pentru chat numai la magazinele care au cerut-o, fara date personale", () => {
  const p = viu("src/app/(public)/[slug]/confirm/page.tsx");
  assert.match(p, /vitrinaSuport\(setarileDin<SetariSuportBrute>\(await incarcaAntetMagazin\(slug\)\)\)\?\.date\.comanda === true/);
  assert.match(p, /\{orderNumber && comandaPentruChat && <ComandaPentruChat slug=\{slug\} numar=\{orderNumber\} total=\{formatPrice\(displayTotal\)\} plata=\{numeleMetodei\(metodaPlata\) \?\? undefined\} \/>\}/);
  const c = viu("src/lib/suport/context-vitrina.ts");
  assert.ok(!/email|telefon|phone|customer|adresa_livrare/i.test(c.replace(/adresa: /g, "").replace(/adresa\b/g, "")), "contextul paginii nu poarta date personale");
});

test("⚠ butonul e o lista obisnuita de contact, in ordinea tastei Tab: intai butonul, apoi ce deschide el", () => {
  const b = viu(BUTON);
  /* Fara rolurile de meniu: ele promit sageti si Home/End, pe care nu le avem. Legaturile raman legaturi. */
  assert.ok(!/role="menu"|role="menuitem"|aria-haspopup/.test(b), "butonul a redevenit un meniu ARIA fara tastele lui");
  assert.match(b, /aria-expanded=\{areMeniu \? meniu : undefined\}/);
  assert.match(b, /aria-controls=\{areMeniu && meniu \? ID_OPTIUNI : undefined\}/);
  /* In sursa, butonul vine INAINTEA listei si a cartonasului; pe ecran ordinea e rasturnata. */
  const iButon = b.indexOf("data-edinio-chat-buton");
  const iLista = b.indexOf("<ul id={ID_OPTIUNI}");
  const iCartonas = b.indexOf('role="dialog"');
  assert.ok(iButon > 0 && iButon < iLista && iLista < iCartonas, "lista sau cartonasul au ajuns inaintea butonului: Tab ar merge inapoi");
  assert.match(b, /flex flex-col-reverse/);
  /* Cat se deschide chatul, butonul isi pastreaza focusul: `aria-disabled`, nu `disabled`. */
  assert.match(b, /aria-disabled=\{seIncarca \|\| undefined\}/);
  assert.ok(!/\bdisabled=\{seIncarca\}/.test(b));
  /* Ascuns din prima clipa pe telefon cand comerciantul l-a oprit acolo, si niciodata pe hartie. */
  assert.match(b, /chat\.aspect\.pe_telefon \? "" : "max-sm:hidden "/);
  assert.match(b, /print:hidden/);
});

test("in editor, butonul magazinului e doar DESENAT: nu se poate apasa si nu incarca nimic", () => {
  const l = viu(LAYOUT);
  assert.match(l, /\{chat && chat\.aspect\.buton === "magazin" && \(\s*<DoarInAfaraContului slug=\{slug\}>\s*<DoarInPrevizualizare>\s*<MartorButonContact/);
  const m = viu("src/components/storefront/suport/MartorButonContact.tsx");
  assert.match(m, /aria-hidden="true"/);
  assert.match(m, /pointer-events-none/);
  assert.ok(!/onClick|onPointer|useEffect|"use client"|<button|<a /.test(m), "desenul din editor a primit ceva care se apasa ori care ruleaza");
  /* Sta unde sta si butonul adevarat. */
  assert.match(m, /bottom: "calc\(1\.25rem \+ var\(--bara-de-jos, 0px\)\)"/);
  /* La hidratare, „nu e previzualizare”: desenul nu ajunge in HTML-ul magazinului real. */
  const w = viu("src/components/public/DoarInMagazinReal.tsx");
  assert.match(w, /const nuLaHidratare = \(\) => false;/);
  assert.match(w, /const inPreview = useSyncExternalStore\(faraAbonare, inPreviewAcum, nuLaHidratare\);\s*if \(!inPreview\) return null;/);
});

test("⚠ locul de deasupra barei lipicioase se masoara numai la magazinele cu chat si se retrage la plecare", () => {
  const c = viu("src/components/storefront/suport/LocPentruButonulDeContact.tsx");
  assert.match(c, /if \(chat === "fara"\) return;/);
  /* Fata de locul elementelor fixe (sonda), nu fata de `innerHeight`. */
  assert.match(c, /sonda\.style\.cssText = "position:fixed;left:0;bottom:0;/);
  assert.ok(!/innerHeight|clientHeight/.test(c), "masuratoarea a trecut pe o inaltime de fereastra, care nu e locul elementelor fixe");
  assert.match(c, /window\.addEventListener\("scroll", cere, \{ passive: true \}\);/);
  for (const linie of ['sonda.remove();', 'radacina.style.removeProperty("--bara-de-jos");', 'radacina.style.removeProperty("--bara-de-jos-durata");', 'window.removeEventListener("scroll", cere);']) {
    assert.ok(c.includes(linie), `la plecare lipseste: ${linie}`);
  }
  /* Regula statica a ramas numai pentru barele fixe. */
  assert.ok(!/LocPentruButonulDeContact/.test(viu("src/components/storefront/LocPesteBaraDeJos.tsx")));
});

test("⚠ Zendesk: numai widgetul de mesagerie, cu pornirea asteptata prin `messenger:get config`", () => {
  const z = viu(`${ADAPTOARE}/zendesk.ts`);
  assert.ok(!/webWidget/.test(z), "au reaparut comenzile widgetului clasic, pe care nu le putem proba");
  assert.match(z, /ze\("messenger:get", "config", \(\) => \{ pornit = true; \}\);\s*await asteapta\(\(\) => pornit, ASTEPTARE_PORNIRE_MS\);/);
  /* Butonul lor se ascunde INAINTE de pornire (comanda sta in coada lor), nu dupa. */
  assert.ok(z.indexOf('if (o.ascundeButonulLor) ze("messenger", "hide");') < z.indexOf('ze("messenger:get", "config"'));
});

test("panoul spune comerciantului ce s-a schimbat: nota din editor si numele furnizorului in setarile bannerului", () => {
  const editor = viu("src/app/(dashboard)/dashboard/editor/page.tsx");
  /* Editorul citeste numai campurile publice, prin cale JSON: secretele nu ajung nici macar pe server aici. */
  assert.match(editor, /sp_activ:suport_config->activ, sp_furnizor:suport_config->>furnizor, sp_conturi:suport_config->conturi, sp_aspect:suport_config->aspect, sp_date:suport_config->date\)"\)/);
  assert.match(editor, /chat: vitrinaSuport\(setari as SetariSuportBrute \| null\)\?\.aspect\.buton \?\? "fara",/);
  const panou = viu("src/components/editor-magazin/setari/PanouriSetari.tsx");
  assert.match(panou, /\{chat === "magazin" && \(/);
  assert.match(viu("src/components/editor-magazin/setari/FilaSetari.tsx"), /<PanouInformatiiGenerale g=\{setari\.generale\} chat=\{setari\.chat\} onInapoi=\{onInapoi\} \/>/);
  const setari = viu("src/app/(dashboard)/dashboard/settings/page.tsx");
  assert.match(setari, /const f = furnizorPornit\(storeSettings\?\.suport_config\);\s*return f \? numeleFurnizorului\(f\) : undefined;/);
});

test("⚠ acordul retras dupa incarcare scoate chatul din pagina pe loc, la toti patru", () => {
  const b = viu(BUTON);
  /* Butonul asculta schimbarea acordului numai la magazinele cu bannerul pornit si o duce adaptorului. */
  assert.match(b, /if \(!cereAcord\) return;\s*const laAcordSchimbat = \(\) => \{/);
  assert.match(b, /if \(adaptor\) adaptor\.acord\(functionale, acord\?\.analytics === true\);/);
  assert.match(b, /window\.addEventListener\(CONSENT_EVENT, laAcordSchimbat\);/);
  /* Cu butonul furnizorului scos din pagina, al nostru revine: de la el se da acordul din nou. */
  assert.match(b, /const alLorEInPagina = !butonulNostru && faza === "gata" && !retras;/);
  /* Fiecare adaptor stie sa se opreasca. */
  for (const f of FURNIZORI_SUPORT) {
    assert.match(viu(`${ADAPTOARE}/${f}.ts`), /\bacord\(functionale(, analiza)?\) \{/, `adaptorul ${f} nu stie de retragerea acordului`);
  }
  assert.match(viu(`${ADAPTOARE}/zendesk.ts`), /ze\("messenger:set", "cookies", "none"\);/);
  assert.match(viu(`${ADAPTOARE}/intercom.ts`), /ic\("shutdown"\);\s*faraSaArunce\(stergeCookieurile\);\s*oprit = true;/);
});

test("legaturile din lista de contact se ating cu Tab si in Safari", () => {
  /* Masurat in WebKit (22.11.2026): fara `tabindex`, Tab se oprea pe „Chat” si sarea peste WhatsApp si Telefon. */
  const b = viu(BUTON);
  assert.match(b, /<a href=\{whatsapp\} target="_blank" rel="noopener noreferrer" tabIndex=\{0\} className=\{clasaOptiune\}>/);
  assert.match(b, /<a href=\{`tel:\$\{telefon\}`\} tabIndex=\{0\} className=\{clasaOptiune\}>/);
});
