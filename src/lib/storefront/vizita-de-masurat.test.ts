import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { esteRobot, seMasoaraVizita, UA_SANTINELA } from "./vizita-de-masurat";

/*
 * Cine intra in „Surse de trafic". Regula se ruleaza aici; cablarea din cele doua pagini
 * care scriu vizite se verifica pe sursa, fiindca sunt fisiere `.tsx` (vezi
 * `scripts/tests/ts-resolve.mjs`) si nu se pot rula in probe.
 */

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

test("un vizitator oarecare, pe domeniul magazinului sau pe platforma: se masoara", () => {
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "caian-textile.ro", userAgent: CHROME }), true);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "www.edinio.com", userAgent: CHROME }), true);
});

test("⚠ o cerere FARA user-agent nu e o vizita (schimbat 28.10.2026, etapa 12)", () => {
  /*
   * Pana la etapa 12 se numara. Niciun browser nu pleaca fara user-agent, deci e un program; iar
   * hotararea lui pentru contorul masurat a fost ca robotii sa iasa „Și din Statistici”.
   */
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "www.edinio.com", userAgent: null }), false);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "www.edinio.com", userAgent: "" }), false);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "www.edinio.com", userAgent: "   " }), false);
});

/*
 * User-agenti reali. Robotii: motoarele de cautare, crawlerele de SEO si de inteligenta artificiala,
 * previzualizarile de linkuri din aplicatii, uneltele si programele de proba. Oamenii: browserele de pe
 * telefon si calculator, si browserele DIN aplicatii (Facebook, Instagram, TikTok, Google), care sunt
 * cumparatori adevarati, nu programe.
 */
const ROBOTI: string[] = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.69 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mediapartners-Google",
  "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
  "GoogleOther",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
  "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "WhatsApp/2.23.20.0",
  "Twitterbot/1.0",
  "TelegramBot (like TwitterBot)",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Chrome-Lighthouse",
  "curl/8.4.0",
  "python-requests/2.31.0",
  "Go-http-client/2.0",
  "Wget/1.21.4",
  "okhttp/4.12.0",
  "axios/1.6.0",
  "PostmanRuntime/7.36.0",
];

const OAMENI: string[] = [
  CHROME,
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBLC/ro_RO]",
  "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 Instagram 352.0.0.39.89 Android (33/13; 450dpi; 1080x2177; samsung; SM-A536B; a53x; s5e8825; ro_RO; 649163574)",
  "Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 musical_ly_2023601040 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/36.1.4 ByteLocale/ro BytedanceWebview/d8a21c6",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.664813234 Mobile/15E148 Safari/604.1",
  // ⚠ CUBOT e o marca de telefoane, nu un robot: „bot” fara „cu” in fata.
  "Mozilla/5.0 (Linux; Android 11; CUBOT_X30 Build/RP1A.200720.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Cubot KingKong Power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; HarmonyOS; ALN-AL80) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36",
];

test("⚠ robotii nu sunt vizite (etapa 12: jumatate din vederile de produs erau ale lor)", () => {
  for (const ua of ROBOTI) {
    assert.equal(esteRobot(ua), true, `ar trebui recunoscut ca robot: ${ua}`);
    assert.equal(seMasoaraVizita({ esteProprietar: false, host: "caian-textile.ro", userAgent: ua }), false, ua);
  }
});

test("oamenii raman vizite, si cei din browserele aplicatiilor (Facebook, Instagram, TikTok, Google)", () => {
  for (const ua of OAMENI) {
    assert.equal(esteRobot(ua), false, `om luat drept robot: ${ua}`);
    assert.equal(seMasoaraVizita({ esteProprietar: false, host: "caian-textile.ro", userAgent: ua }), true, ua);
  }
});

test("⚠ santinela nu e o vizita", () => {
  assert.equal(UA_SANTINELA, "edinio-santinela");
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "vetdepo.ro", userAgent: UA_SANTINELA }), false);
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "vetdepo.ro", userAgent: ` ${UA_SANTINELA} ` }), false);
  // Egalitate exacta: un user-agent care doar o pomeneste e al altcuiva.
  assert.equal(seMasoaraVizita({ esteProprietar: false, host: "vetdepo.ro", userAgent: `${CHROME} ${UA_SANTINELA}` }), true);
});

test("proprietarul si gazdele de test raman afara, ca pana acum", () => {
  assert.equal(seMasoaraVizita({ esteProprietar: true, host: "caian-textile.ro", userAgent: CHROME }), false);
  for (const host of ["localhost", "127.0.0.1", "edinio-git-lucru.vercel.app"]) {
    assert.equal(seMasoaraVizita({ esteProprietar: false, host, userAgent: CHROME }), false, host);
  }
});

/** ⚠ Terminatiile se normalizeaza, iar comentariile se scot: un apel dintr-un comentariu nu e un apel. */
function cod(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Corpul `{...}` al lui `if (...)` care incepe la `start`, cu parantezele si acoladele echilibrate. */
function corpulLui(text: string, start: number): string {
  let i = text.indexOf("(", start);
  for (let adancime = 0; i < text.length; i++) {
    if (text[i] === "(") adancime++;
    else if (text[i] === ")" && --adancime === 0) break;
  }
  const deschis = text.indexOf("{", i);
  for (let j = deschis, adancime = 0; j < text.length; j++) {
    if (text[j] === "{") adancime++;
    else if (text[j] === "}" && --adancime === 0) return text.slice(deschis, j + 1);
  }
  throw new Error("bloc neinchis");
}

test("⚠ AMBELE locuri care scriu vizite trec prin aceeasi regula, cu user-agentul cererii", () => {
  /*
   * Scrisa doar intr-unul, jumatate din vizitele santinelei ar fi ramas in statistici,
   * iar nicio cifra n-ar fi aratat care jumatate.
   */
  for (const cale of ["src/lib/storefront/catalog/pagina-magazin.tsx", "src/app/(public)/[slug]/page.tsx"]) {
    const c = cod(cale);
    /*
     * ⚠ SCRIEREA S-A MUTAT (20.09.2026) in `@/lib/analitice/scrie`, fiindca cele doua
     * locuri repetau acelasi `insert` cu aceleasi comentarii, iar campurile noi (sesiune,
     * vizitator) ar fi trebuit adaugate in amandoua. Proba intreaba acum acelasi lucru pe
     * forma noua: fiecare pagina trece prin regula comuna si cheama scriitorul comun.
     */
    assert.equal([...c.matchAll(/scrieEvenimentAnalitic\(/g)].length, 1, `${cale}: un singur loc scrie vizita`);
    assert.doesNotMatch(c, /\.from\("site_analytics"\)/, `${cale}: scrie de-a dreptul in tabela, pe langa scriitorul comun`);
    const unde = c.indexOf("if (seMasoaraVizita(");
    assert.ok(unde >= 0, `${cale}: vizita se scrie fara regula comuna`);
    assert.match(c.slice(unde), /^if \(seMasoaraVizita\(\{ esteProprietar: isOwner, host, userAgent: ua \}\)\)/, `${cale}: regula trebuie sa primeasca proprietarul, gazda si user-agentul`);
    assert.match(corpulLui(c, unde), /scrieEvenimentAnalitic\(/, `${cale}: scrierea e in afara regulii`);
    assert.match(c, /const ua = \w+\.get\("user-agent"\) \?\? "";/, `${cale}: user-agentul trebuie sa fie al cererii`);
    assert.doesNotMatch(c, /isNonProductionHost\(/, `${cale}: o conditie scrisa de mana s-ar desparti de regula`);
  }
});

test("santinela trimite chiar user-agentul pe care il recunosc paginile", () => {
  const c = cod("src/app/api/cron/santinela/route.ts");
  assert.match(c, /import \{ UA_SANTINELA \} from "@\/lib\/storefront\/vizita-de-masurat";/);
  assert.match(c, /const ANTET = \{ "user-agent": UA_SANTINELA \} as const;/);
  assert.doesNotMatch(c, /"edinio-santinela"/, "scris de mana, s-ar desparti de constanta");
});
