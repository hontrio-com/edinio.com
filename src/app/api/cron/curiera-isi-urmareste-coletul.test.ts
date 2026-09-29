import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CURIERA ISI URMARESTE COLETUL                              (29.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cablarea cronului. Regulile (necunoscut, istoric, ce se spune, alarma) sunt probate pe
 * purtare in `src/lib/curiera/urmarire.test.ts`; aici se cere ca ruta chiar sa le cheme, pe
 * drumurile si in ordinea bune.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CRON = "src/app/api/cron/curiera-tracking/route.ts";

/** Blocul care incepe la `inceput`, pana la acolada care il inchide. */
function bloc(s: string, inceput: string): string {
  const i = s.indexOf(inceput);
  assert.notEqual(i, -1, `nu gasesc \`${inceput}\``);
  const deschis = s.indexOf("{", i + inceput.length - 1);
  let adancime = 0;
  for (let j = deschis; j < s.length; j++) {
    if (s[j] === "{") adancime++;
    else if (s[j] === "}" && --adancime === 0) return s.slice(i, j + 1);
  }
  return s.slice(i);
}

test("⚠ cronul exista si e programat la doua ore, pe minutul lui", () => {
  /* Fara rand in `vercel.json`, cronul nu ruleaza niciodata si nimic nu se plange. */
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const al = vercel.crons.filter((c) => c.path === "/api/cron/curiera-tracking");
  assert.equal(al.length, 1, "cronul nu e programat, sau e programat de doua ori");
  assert.equal(al[0].schedule, "31 */2 * * *");
  assert.ok(viu(CRON).length > 3000, "felia nu poate fi goala");
});

test("⚠⚠ poarta e un boolean, pusa INAINTEA clientului cu rol de serviciu", () => {
  const s = viu(CRON);
  const iPoarta = s.indexOf("if (!verificaCron(req)) return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });");
  const iBaza = s.indexOf("createClient<Database>(");
  assert.ok(iPoarta > 0 && iBaza > iPoarta, "poarta lipseste, e pe dos, sau vine dupa deschiderea bazei");
});

test("⚠ bugetul se scrie din `maxDuration` si din asteptarea REALA a clientului", () => {
  /* Un apel (lot sau istoric) merge pe `ASTEPTARE_MS` din client; o copie locala s-ar departa. */
  const s = viu(CRON);
  assert.match(s, /export const maxDuration = 60;/);
  assert.match(s, /const BUGET_MS = maxDuration \* 1000 - ASTEPTARE_MS - MARJA_MS;/);
  assert.match(s, /import \{[^}]*\bASTEPTARE_MS\b[^}]*\} from "@\/lib\/curiera\/client";/);
  assert.doesNotMatch(s, /const ASTEPTARE_MS\b/, "asteptarea s-a copiat local si se poate departa de a clientului");
  assert.match(s, /stariCuriera\(cfg, felie\.map\(\(o\) => o\.curiera_awb_number!\.trim\(\)\), ASTEPTARE_MS\)/);
});

test("⚠ fereastra se ancoreaza pe EMITERE, cu doi termeni simpli si perechea in memorie", () => {
  const s = viu(CRON);
  assert.match(s, /\.or\(`curiera_awb_at\.gte\.\$\{since\},curiera_awb_at\.is\.null`\)/);
  assert.match(s, /o\.curiera_awb_at !== null \|\| \(o\.created_at \?\? ""\) >= since/);
  assert.ok(!/\.or\([^)]*and\(/.test(s), "`and(...)` in `or(...)` a costat deja o data");
  assert.match(s, /\.order\("curiera_status_checked_at", \{ ascending: true, nullsFirst: true \}\)/,
    "rotatia nu mai pune neintrebatele in fata");
  assert.match(s, /\.in\("status", \["pending", "confirmed", "processing", "shipped"\]\)/);
});

test("⚠ ancora chiar se scrie la emitere si se goleste la dezlegare", () => {
  /* Nescrisa, fereastra de mai sus n-ar avea ce citi; nestearsa, un AWB nou ar mosteni-o. */
  const actiuni = viu("src/lib/actions/curiera.actions.ts");
  /* Clipa se poate scrie direct sau printr-o constanta a emiterii; se cere clipa, nu forma. */
  const scrise = [...actiuni.matchAll(/curiera_awb_at: ([^,\n]+),/g)].map((m) => m[1].trim());
  const ancora = scrise.find((v) => v !== "null");
  assert.ok(ancora, "ancora nu se scrie la emitere");
  if (ancora !== "new Date().toISOString()") {
    assert.match(ancora, /^\w+$/, `ancora se scrie din \`${ancora}\`, nu din clipa emiterii`);
    assert.match(actiuni, new RegExp(`const ${ancora} = new Date\\(\\)\\.toISOString\\(\\);`),
      `\`${ancora}\` nu e clipa emiterii`);
  }
  assert.ok(scrise.includes("null"), "ancora nu se sterge la dezlegare");
});

test("⚠ o citire picata NU raporteaza „zero de verificat”", () => {
  const s = viu(CRON);
  for (const inceput of ["if (eComenzi) {", "if (eCfg) {"]) {
    const b = bloc(s, inceput);
    assert.match(b, /severity: "critical"/, `${inceput} nu striga`);
    assert.match(b, /status: 503/, `${inceput} iese cu un ok`);
  }
});

test("⚠⚠ marcajul se scrie pentru TOATE cele cerute, pe fiecare drum", () => {
  /*
   * Fara config, incheiate, lot picat, lot reusit (si cele pe care ei nu le recunosc). Sarit pe
   * vreunul, randurile acelea raman in capul cozii la fiecare rulare (lectia DPD: `continue` fara
   * marcaj la magazinele fara configurare).
   */
  const s = viu(CRON);
  assert.match(bloc(s, "if (!curieraGata(cfg)) {"), /marcheazaLotul\(admin, \{\s*ids: lista\.map\(\(o\) => o\.id\)/);
  assert.match(bloc(s, "if (incheiateAici.length > 0) {"), /marcheazaLotul\(admin, \{\s*ids: incheiateAici\.map/);
  const esec = bloc(s, "} catch (e) {");
  assert.match(esec, /marcheazaLotul\(admin, \{\s*ids, businessId/, "lotul picat nu se marcheaza");
  assert.match(esec, /continue;/);

  const iEsec = s.indexOf(esec);
  const iDupa = s.indexOf("marcheazaLotul(admin, {", iEsec + esec.length);
  const iPotrivire = s.indexOf("const dupaCerere");
  assert.ok(iDupa > 0 && iDupa < iPotrivire, "lotul reusit nu se marcheaza INAINTE de potrivire");
  assert.match(s.slice(iDupa, iPotrivire), /ids, businessId/, "marcajul lotului reusit nu mai cuprinde toate cele cerute");
  assert.equal((s.match(/marcheazaLotul\(admin, \{/g) ?? []).length, 4);
});

test("⚠⚠ galeata erorii se alege dupa FELUL ei, nu dupa statusul HTTP", () => {
  /* BAD_LOGIN vine pe HTTP 200 la ei: o impartire pe coduri HTTP n-ar porni niciodata. */
  const s = viu(CRON);
  assert.match(s, /const fel = felulEroriiCuriera\(e\);\s*g\[fel\] \+= felie\.length;/);
  assert.doesNotMatch(s, /status === 40[13]/, "galetile pe coduri HTTP nu vad BAD_LOGIN");
});

test("⚠⚠ potrivirea se face pe numarul CERUT, iar necunoscutul nu se scrie", () => {
  const s = viu(CRON);
  assert.match(s, /const dupaCerere = new Map\(stari\.map\(\(s\) => \[s\.cerut, s\]\)\);/);
  /* ⚠ Cu clipa salvata: aceeasi cheie la alta clipa (a doua livrare esuata) cere istoricul. */
  assert.match(s, /citesteStarea\(dupaCerere\.get\(awb\), o\.curiera_status_code, o\.curiera_status_at\)/);
  assert.match(s, /curiera_status_code, curiera_status_at, curiera_status_checked_at/,
    "clipa salvata trebuie ceruta in select, altfel vine mereu `undefined`");
  const necunoscut = bloc(s, "if (c.fel === \"necunoscut\") {");
  assert.match(necunoscut, /necunoscute\+\+/);
  assert.match(necunoscut, /continue;/);
  assert.doesNotMatch(necunoscut, /scrieUrmarirea|verificate/, "tacerea lor s-a scris ca stare");
});

test("⚠⚠ istoricul se citeste doar la schimbare, si trece prin memoria de pe comanda", () => {
  const s = viu(CRON);
  const ist = bloc(s, "if (c.cereIstoric) {");
  assert.match(ist, /istoricCuriera\(cfg, awb\)/);
  assert.match(ist, /evenimenteDeSemnalat\(istoric, o\.curiera_evenimente_semnalate\)/);
  assert.match(ist, /if \(Date\.now\(\) >= termen\) \{ sarite\+\+; continue; \}/,
    "fara timp, comanda trebuie lasata neatinsa, ca tura urmatoare s-o reia cu istoric");
  assert.match(s, /curiera_evenimente_semnalate/);
  assert.match(s, /\.\.\.\(memorie !== null \? \{ curiera_evenimente_semnalate: memorie \} : \{\}\)/,
    "memoria noua nu se scrie cu starea");
});

test("⚠⚠ termenul se verifica inaintea FIECAREI comenzi, nu doar a fiecarei felii", () => {
  /* O felie de AWB-uri proaspete costa tranzitii si facturi (2-5 s fiecare): fara verificare pe
     comanda, cronul trecea de `maxDuration` si era ucis in mijlocul unei facturi. */
  const s = viu(CRON);
  const i = s.indexOf("for (const o of felie) {");
  assert.notEqual(i, -1);
  assert.match(s.slice(i, i + 200), /for \(const o of felie\) \{\s*if \(Date\.now\(\) >= termen\) \{ sarite\+\+; continue; \}/);
});

test("⚠⚠ ordinea: tranzitie, apoi semnalare, apoi starea", () => {
  /*
   * Starea scrisa inaintea semnalarii: o cadere intre ele lasa cheia noua fara notificare, iar
   * `stareaSaSchimbat` n-o mai vede niciodata. Starea scrisa inaintea tranzitiei: o finala ar
   * scoate coletul din urmarire cu comanda nemutata.
   */
  const s = viu(CRON);
  const iTranzitie = s.indexOf("tranzitieComandaMarketplace(admin, {");
  const iSemnal = s.indexOf("semnaleazaExpedierea(admin, {");
  const iStare = s.indexOf("scrieUrmarirea(admin, {");
  assert.ok(iTranzitie > 0 && iTranzitie < iSemnal && iSemnal < iStare);
  assert.match(s, /prelucrat = rez !== "reincearca";/);
  assert.match(s, /if \(prelucrat && !amanaStarea && \(c\.schimbata \|\| memorie !== null\)\) \{\s*await scrieUrmarirea\(admin, \{/);
  /* ⚠ Istoricul picat nu scrie cheia cand starea nu cere atentie: tura urmatoare il reia. */
  assert.match(s, /const amanaStarea = istoricPicatAici && !trebuieSemnalat\(c\.cheie\) && !eStareFinala\(c\.cheie\);/,
    "o stare finala amanata nu s-ar mai scrie niciodata: comanda iese din coada");
});

test("⚠ semnalarea ajunge la om, o data, cu tipul curierului", () => {
  const s = viu(CRON);
  const b = bloc(s, "if (trebuieSpus(c, evenimente)) {");
  assert.match(b, /semnalate\+\+/);
  assert.match(b, /semnaleazaExpedierea\(admin, \{/);
  assert.match(b, /tip: "curiera"/);
  assert.equal((s.match(/semnaleazaExpedierea\(admin, \{/g) ?? []).length, 1, "o singura semnalare pe comanda si trecere");
});

test("⚠ starea si tranzitia se leaga de EXPEDIEREA CITITA", () => {
  const s = viu(CRON);
  assert.match(s, /identitate: \{ coloana: "curiera_awb_number", valoare: o\.curiera_awb_number \}/);
  assert.match(s, /expediere: \{ coloana: "curiera_awb_number", valoare: o\.curiera_awb_number \}/);
  assert.match(s, /sursa: "curiera"/);
});

test("⚠⚠ facturarea automata se ASTEAPTA, in try, si nu doar la livrat", () => {
  const s = viu(CRON);
  assert.match(s, /if \(rez === "ok"\) \{/, "verdictul tranzitiei e un SIR, nu un obiect cu `.ok`");
  assert.doesNotMatch(s, /void maybeAutoInvoice/, "`void` nu apuca sa ruleze in serverless");
  assert.doesNotMatch(s, /tinta === "delivered"/, "triggerul magazinului poate fi si processing/shipped");
  const i = s.indexOf("await maybeAutoInvoice(");
  assert.notEqual(i, -1);
  const fereastra = s.slice(Math.max(0, i - 120), i + 700);
  assert.match(fereastra, /try \{/, "chemarea trebuie prinsa");
  assert.match(fereastra, /severity: "warning"/, "si esecul strigat, nu inghitit");
});

test("⚠ alarmele se ridica PE MAGAZIN, plus alarma de coada", () => {
  const s = viu(CRON);
  const b = bloc(s, "for (const [bizId, g] of galeti) {");
  assert.match(b, /alarmaMagazinului\(g, \{\s*autentificare: MIN_AUTENTIFICARE_ALARMA, refuz: MIN_REFUZ_ALARMA, esecuri: MIN_ESECURI_ALARMA,\s*necunoscute: MIN_NECUNOSCUTE_ALARMA,\s*\}\)/);
  assert.match(s, /const MIN_REFUZ_ALARMA = 1;/);
  /* ⚠ Deterministe la Curiera, deci de la PRIMUL: altfel un magazin mic tacea pentru totdeauna. */
  assert.match(s, /const MIN_AUTENTIFICARE_ALARMA = 1;/);
  assert.match(s, /const MIN_NECUNOSCUTE_ALARMA = 1;/);
  assert.match(b, /businessId: bizId/);
  assert.match(b, /severity: alarma\.severity/);
  assert.match(s, /if \(ramase \+ sarite > MAX_COMENZI \/ 3\) \{/);
});

test("⚠ starile necunoscute se strang pe nume, ca harta sa creasca din trafic", () => {
  const s = viu(CRON);
  assert.match(s, /if \(c\.status === null\) stariNoi\.add\(c\.brut\);/);
  assert.match(s, /stariNoi: \[\.\.\.stariNoi\]/);
});
