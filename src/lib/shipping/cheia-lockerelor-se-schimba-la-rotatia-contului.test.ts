import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amprentaConfigului, cheiaLockerelor } from "./cheia-lockerelor";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CHEIA CACHE-ULUI DE LOCKERE SE SCHIMBA LA ROTATIA CONTULUI    (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lista de lockere se tine zece minute in memoria instantei. Pana azi cheia nu cuprindea nimic din
 * configul curierului, deci comerciantul care isi schimba contul primea zece minute lista veche,
 * adusa cu creditele contului vechi.
 *
 * ⚠ SI NU EXISTA STERGERE CARE SA-L AJUTE: `CacheScurt` e PER INSTANTA. O golire la salvarea
 * setarilor ar fi curatat o singura instanta din cate sunt calde. De aceea leacul e in CHEIE.
 *
 * Proba are doua jumatati, si amandoua trebuie sa existe:
 *
 *   * REGULA, pura: amprenta intra in cheie si se schimba la ORICE schimbare de config, oricat de
 *     adanca, fara sa duca vreodata secretul in cheie;
 *   * ORDINEA din apelant: curierul necunoscut se refuza inaintea oricarei citiri, setarile se
 *     citesc inaintea cheii, iar plafonul durabil ramane SUB cache. Fara jumatatea asta, cineva ar
 *     putea muta citirea deasupra pazei si nicio proba n-ar cadea.
 */

const CONFIG = {
  sameday_config: { username: "magazin", password: "parola-veche-secreta" },
  ups_config: { clientId: "abc", clientSecret: "taina-ups" },
  fan_courier_config: null,
};

type Argumente = Parameters<typeof cheiaLockerelor>[0];

function cheia(peste: Partial<Argumente> = {}): string {
  return cheiaLockerelor({
    businessId: "biz-1",
    curier: "sameday",
    esteRamburs: false,
    discriminant: "",
    config: CONFIG,
    ...peste,
  });
}

// ─── Regula ──────────────────────────────────────────────────────────────────

test("acelasi config da aceeasi cheie", () => {
  assert.equal(cheia(), cheia(), "cheia nu e stabila, deci cache-ul n-ar nimeri niciodata");
});

test("⚠⚠ o parola rotita ADANC in config schimba cheia", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CARE APARA TOATA REPARATIA.
   *
   * `JSON.stringify(config, Object.keys(config))` arata ca o curatenie inofensiva si pare sa faca
   * acelasi lucru. Dar al doilea argument filtreaza si IN ADANCIME: ar taia chiar `username` si
   * `password` dinauntrul configurilor, amprenta ar iesi identica, si reparatia ar fi decor exact
   * la rotatia pe care trebuie s-o prinda.
   */
  const rotit = {
    ...CONFIG,
    sameday_config: { username: "magazin", password: "parola-NOUA-secreta" },
  };
  assert.notEqual(
    cheia(),
    cheia({ config: rotit }),
    "contul rotit citeste de la aceeasi cheie: zece minute de lista adusa cu creditele contului vechi",
  );
});

test("⚠ un camp de config NOU schimba si el cheia", () => {
  /*
   * Amprenta se ia pe INTREGUL rand, nu pe campul curierului cerut. Afirmatia asta apara alegerea
   * de maine: cine ar inlocui amprenta cu o harta curier -> camp ar face-o sa cada aici. O harta ar
   * fi a doua sursa de adevar langa cele unsprezece ramuri care isi citesc fiecare configul, iar o
   * potrivire gresita ar fi luat amprenta ALTUI curier, tacut.
   */
  const cuAltCurier = { ...CONFIG, dpd_config: { user: "x" } };
  assert.notEqual(cheia(), cheia({ config: cuAltCurier }), "un config adaugat nu se vede in cheie");
});

test("⚠ secretul nu ajunge NICIODATA in cheie", () => {
  /*
   * Cheia sta in memoria instantei si poate ajunge intr-un jurnal de diagnostic. O parola de curier
   * n-are ce cauta acolo. Idiomul casei: sha256 taiat la 16 hex (`aboutyou/client.ts:113`).
   */
  const k = cheia();
  assert.ok(!k.includes("parola-veche-secreta"), "parola Sameday e chiar in cheia de cache");
  assert.ok(!k.includes("taina-ups"), "secretul UPS e chiar in cheia de cache");
});

test("amprenta e sha256 taiat la 16 hex", () => {
  assert.match(amprentaConfigului(CONFIG), /^[0-9a-f]{16}$/);
});

test("⚠ magazinul, curierul, rambursul si discriminantul raman fiecare in cheie", () => {
  /*
   * Egalitate pe numarul de chei distincte, nu „macar doua diferite": daca amprenta ar inghiti
   * vreuna dintre ele, doua cereri diferite ar imparti o intrare si cumparatorul ar primi lista
   * altcuiva. Cinci variante, cinci chei.
   */
  const distincte = new Set([
    cheia(),
    cheia({ businessId: "biz-2" }),
    cheia({ curier: "fan-courier" }),
    cheia({ esteRamburs: true }),
    cheia({ discriminant: ":fanbox" }),
  ]);
  assert.equal(distincte.size, 5, "doua cereri diferite impart o intrare de cache");
});

// ─── Ordinea din apelant ─────────────────────────────────────────────────────

const COTARE = "src/lib/actions/shipping.actions.ts";

/*
 * ⚠ CRLF SCOS, COMENTARIILE TAIATE SI CORPUL FELIAT. Toate trei obligatorii, dar nu din motivele
 * scrise aici pana azi.
 *
 * ⚠ INDREPTARE (15.09.2026): randul de aici spunea „depozitul e 100% CRLF". E FALS, si era fals si
 * cand s-a scris. Numarat pe octeti: 2.119 fisiere LF fata de 12 CRLF in `src/**\/*.ts(x)`, iar
 * `shipping.actions.ts`, chiar fisierul feliat mai jos, e LF curat. Scoaterea CRLF-ului nu apara
 * nimic AZI, fiindca niciun tipar de mai jos nu trece peste un rand. Ramane totusi, fiindca nu costa
 * nimic si fiindca `order.actions.ts` chiar E unul din cele 12: primul tipar pe doua randuri scris
 * de cineva care copiaza de aici ar fi cazut tacut. Vezi lectia despre numerele din comentarii, care
 * raman in urma muncii.
 *
 * `CURIERI_CU_LOCKERE` apare in TREI comentarii din alte functii, deci fara taiere ordinea s-ar
 * masura pe proza. Iar `consumaLimita` apare de trei ori INAINTEA lui `getLockers`, in alte functii:
 * fara feliere, `indexOf` l-ar gasi pe cel al vecinului si afirmatia ar cadea pe cod bun.
 */
/**
 * Corpul functiei care CHIAR aduna punctele.
 *
 * ⚠ ANCORA S-A MUTAT DE PE `getLockers` PE `puncteleDeLaCurier`, pe 15.09.2026, si nu de stil.
 * `getLockers` a devenit un invelis de cateva randuri care semneaza lista la iesire; toata ordinea
 * aparata mai jos (paza inaintea citirii, setarile inaintea cheii, cache-ul inaintea plafonului) a
 * ramas in miez. Lasata pe invelis, felia n-ar mai fi cuprins nicio ancora si toate cele cinci
 * afirmatii ar fi cazut deodata pe cod bun.
 */
function corpulAdunariiPunctelor(): string {
  const s = readFileSync(COTARE, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const start = s.indexOf("async function puncteleDeLaCurier(");
  assert.ok(start > 0, "nu mai gasesc adunarea punctelor in cotare");
  /*
   * ⚠ FELIA SE TAIE PE ACOLADA DE LA MARGINE, NU PANA LA URMATORUL `export`.
   *
   * Pana azi felia mergea de la antet pana la urmatorul `export `, iar functia era ULTIMA din
   * fisier: `indexOf` intorcea -1 si felia se intindea pana la capatul fisierului. Coincidenta
   * tinea doar cat timp nimeni nu scria nimic dedesubt. Masurat cu un ajutor cinstit lipit sub
   * functie: afirmatia „cheia se compune INTR-UN SINGUR loc" cadea pe cod bun.
   *
   * Acolada de la marginea randului inchide exact functia: tot ce e inauntru sta indentat. Asa,
   * felia ramane corpul ei oricine ar scrie mai jos. Aceeasi familie cu „slice-ul de corp imprumuta
   * de la vecin", numai ca aici vecinul era tot restul fisierului.
   */
  const sfarsit = s.indexOf("\n}", start);
  assert.ok(
    sfarsit > start,
    "adunarea punctelor nu se mai inchide cu o acolada la marginea randului: felia ar inghiti tot ce urmeaza",
  );
  return s.slice(start, sfarsit + 2);
}

test("⚠ curierul necunoscut se refuza INAINTEA citirii setarilor", () => {
  /*
   * `courier` vine de la client si e liber. Citirea urcata deasupra pazei ar fi insemnat ca un nume
   * inventat costa o interogare in baza, la nesfarsit, pe un drum unde plafonul durabil sta mai jos
   * dinadins: o amplificare fara plafon pe baza noastra, platita ca sa reparam altceva.
   */
  const c = corpulAdunariiPunctelor();
  const iPaza = c.indexOf("CURIERI_CU_LOCKERE.has(courier)");
  const iSetari = c.indexOf("CACHE_SETARI_LOCKERE.iaSau");
  assert.ok(iPaza > 0, "paza de curier necunoscut a disparut din getLockers");
  assert.ok(iSetari > 0, "nu mai gasesc citirea setarilor");
  assert.ok(iPaza < iSetari, "un curier inventat costa acum o citire in baza, fara niciun plafon");
});

test("⚠ setarile se citesc INAINTEA compunerii cheii", () => {
  const c = corpulAdunariiPunctelor();
  const iSetari = c.indexOf("CACHE_SETARI_LOCKERE.iaSau");
  const iCheie = c.indexOf("cheiaLockerelor({");
  assert.ok(iCheie > 0, "cheia nu se mai compune prin regula probata aici");
  /*
   * ⚠ ANCORA A DOUA SE PAZESTE SI EA, SI ASTA LIPSEA.
   *
   * `indexOf` intoarce -1 cand nu gaseste, iar `-1 < iCheie` e ADEVARAT. Cu citirea setarilor
   * scoasa cu totul (adica exact regresia pe care afirmatia o apara), comparatia de ordine ramanea
   * verde. Masurat: scos `CACHE_SETARI_LOCKERE`, afirmatia a trecut. Nu se vedea doar fiindca
   * vecina de deasupra pazeste aceeasi ancora; stearsa ea, aici n-ar mai fi observat nimeni.
   * „Ancora negasita nu da eroare".
   */
  assert.ok(iSetari > 0, "nu mai gasesc citirea setarilor: proba n-are fata de ce compara ordinea");
  assert.ok(iSetari < iCheie, "cheia se compune inainte sa existe configul din care isi ia amprenta");
});

test("⚠⚠ cache-ul de lockere se atinge DOAR cu cheia care poarta amprenta", () => {
  /*
   * ⚠ REFACUTA 15.09.2026. Pana azi afirmatia numara aparitiile lui `cheiaLockerelor({` si cerea
   * EXACT una. Suna a „o singura compunere", dar masura cu totul altceva, si gresea in amandoua
   * directiile. Amandoua masurate, cu mutanti rulati peste o copie in memorie a sursei:
   *
   *   ⚠ TRECEA DEGEABA pe chiar amenintarea scrisa in vechiul ei comentariu. O cheie compusa DE
   *     MANA nu contine textul `cheiaLockerelor({`: lipita ca `${businessId}:${courier}:...` si
   *     data lui `CACHE_LOCKERE.get`, numaratoarea a ramas 1 si afirmatia a ramas verde, cu
   *     amprenta sarita si citirile pe cheia veche. Numararea apelurilor la ajutorul SIGUR nu
   *     poate detecta decat siguranta repetata.
   *
   *   ⚠ CADEA PE COD BUN la orice a doua compunere cinstita, de pilda un ajutor nou care ar cere
   *     tot prin `cheiaLockerelor({`. Egalitatea pe numar transforma o adaugare corecta in rosu.
   *
   * Regula adevarata nu e „se compune o data", ci „nicio citire si nicio scriere din cache nu se
   * face cu alta cheie decat cea care poarta amprenta configului". Aia se si masoara acum: se
   * strang TOATE atingerile cache-ului si se cere ca fiecare sa primeasca `cheieCache`. Asa, cheia
   * scrisa de mana cade (e alta variabila la apel), iar a doua compunere cinstita trece.
   */
  const c = corpulAdunariiPunctelor();

  /*
   * ⚠ DOUA AFIRMATII, SI A DOUA A FOST ADAUGATA DUPA CE UN MUTANT A TRECUT DE PRIMA.
   *
   * Nu ajunge ca `cheiaLockerelor` sa fie chemata undeva in functie: mutantul care pastreaza
   * chemarea, ii da rezultatul unei variabile NEFOLOSITE, si compune `cheieCache` de mana din
   * `businessId` si `courier` trece si de existenta, si de numaratoarea de mai jos (numele e tot
   * `cheieCache`), si de afirmatia vecina despre `config: settings`. Amprenta configului n-ar mai
   * ajunge NICIODATA in cache, adica exact regresia pe care tot fisierul o apara.
   *
   * Se cere deci LEGATURA: variabila care ajunge la cache sa fie CHIAR cea produsa de ajutor.
   */
  assert.match(
    c,
    /const cheieCache = cheiaLockerelor\(\{/,
    "cheia de cache nu mai iese din ajutorul cu amprenta: compusa de mana, rotatia contului n-ar mai schimba nimic",
  );

  /*
   * ⚠ TIPARUL PRINDE ORICE, NU DOAR UN IDENTIFICATOR, si asta a fost tot o indreptare dupa mutant.
   *
   * Scris `([A-Za-z_$][\w$]*)`, o cheie compusa INLINE ca sablon nu era nici macar STRANSA ca
   * atingere: nu se potrivea, deci nu intra in lista, iar celelalte atingeri cinstite tineau
   * numaratoarea peste zero si lista de gresite goala. Adica mutantul scris chiar in comentariul
   * afirmatiei trecea. Acum se strange ce e intre paranteze ORICE ar fi, si un sablon cade.
   */
  const atingeri = c.match(/CACHE_LOCKERE\.(?:get|iaSau)\(\s*([^,\s)]+)/g) ?? [];
  /* ⚠ Fara asta, o stergere a cache-ului ar lasa lista goala si afirmatia verde. */
  assert.ok(atingeri.length > 0, "nu mai gasesc nicio atingere a cache-ului de lockere: proba n-are ce apara");
  const gresite = atingeri
    .filter((a) => !/\bcheieCache$/.test(a))
    .map((a) => a.replace(/\s+/g, " "));
  assert.deepEqual(
    gresite,
    [],
    `cache-ul de lockere se atinge cu alta cheie decat cea cu amprenta: ${gresite.join(" | ")}`,
  );
});

test("⚠ cheia primeste configul ADEVARAT, nu un obiect gol", () => {
  /*
   * ⚠ REFACUTA 15.09.2026. Pana azi afirmatia cerea subsirul `config: settings,` ORIUNDE in felia
   * de douasprezece mii de caractere. Doua masuratori au aratat ca nu apara regula:
   *
   *   ⚠ TRECEA DEGEABA: pus `config: {}` CHIAR in apelul lui `cheiaLockerelor`, si lasat sirul
   *     `config: settings,` intr-un obiect fara nicio legatura din aceeasi functie, afirmatia a
   *     ramas verde cu reparatia moarta. „Proba pe FISIER trece, proba pe ELEMENT prinde".
   *
   *   ⚠ CADEA PE COD BUN la doua refactorizari fara nicio schimbare de purtare: redenumirea
   *     variabilei locale `settings`, si scoaterea virgulei de la coada daca `config` ajunge
   *     ultimul camp al obiectului. Adica proba cerea o VIRGULA DE FORMATARE.
   *
   * Acum se taie chiar APELUL, si nu se mai cere un nume scris de mana: se citeste din sursa in ce
   * variabila intra setarile, si se cere ca TOCMAI EA sa ajunga la `config`. O redenumire cinstita
   * muta amandoua capetele deodata si trece; un obiect gol, sau alta variabila, cade.
   */
  const c = corpulAdunariiPunctelor();

  const numeSetari = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+CACHE_SETARI_LOCKERE\.iaSau/.exec(c)?.[1];
  assert.ok(numeSetari, "nu mai gasesc variabila in care intra setarile citite: proba n-are ce urmari");

  const i = c.indexOf("cheiaLockerelor({");
  assert.ok(i > 0, "cheia nu se mai compune prin regula probata aici");
  const j = c.indexOf("});", i);
  assert.ok(j > i, "apelul lui cheiaLockerelor nu se mai inchide: felia de apel ar inghiti restul functiei");
  const apel = c.slice(i, j + 3);

  assert.doesNotMatch(apel, /config:\s*\{\s*\}/, "amprenta se ia pe un obiect GOL: rotatia contului n-ar mai schimba cheia");
  assert.match(
    apel,
    new RegExp(`config:\\s*${numeSetari.replace(/\$/g, "\\$")}\\b`),
    `amprenta se ia pe altceva decat setarile citite (asteptam config: ${numeSetari}): rotatia contului n-ar mai schimba cheia`,
  );
});

test("⚠⚠ plafonul durabil ramane SUB cache", () => {
  /*
   * Proprietatea asta exista de dinainte si NU are voie sa se piarda la mutarea mea. Cache-ul se
   * consulta inaintea plafonului fiindca un raspuns care nu costa niciun apel platit n-are ce buget
   * sa consume; altfel cumparatorii cinstiti epuizeaza chiar ei contorul care apara apelul, si apoi
   * raman fara niciun locker de ales, tacut.
   */
  const c = corpulAdunariiPunctelor();
  const iCache = c.indexOf("CACHE_LOCKERE.get(cheieCache)");
  const iPlafon = c.indexOf("consumaLimita(");
  assert.ok(iCache > 0, "cache-ul nu mai e consultat in getLockers");
  assert.ok(iPlafon > 0, "nu mai gasesc plafonul durabil: proba n-are fata de ce compara");
  assert.ok(iCache < iPlafon, "plafonul a urcat deasupra cache-ului: traficul cinstit isi arde singur bugetul");
});
