import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { contextCuCiorna, jsonCanonic, pcCuCiorna } from "@/lib/storefront/design/continut-ciorna";
import { coloaneVazute } from "@/lib/storefront/design/subsol";
import { ciornaDinVersiune, instantaneuContinut } from "@/lib/editor-magazin/versiuni";
import type { DesignContext } from "@/lib/storefront/design/types";
import {
  CHEIE_TEMA_APLICATA,
  continutIdentitate,
  dateleVersiunilorDeDinainte,
  magazinCuIdentitatea,
  pageContentCuIdentitatea,
  radacinaCatalogTemei,
  temaAplicataDin,
} from "./aplicare";
import { designJupiter, IDENTITATE_JUPITER } from "./jupiter/design";
import { temaDupaCheie } from "./teme";

/*
 * Etapa 17.3 din `docs/editor-magazin/PLAN.md`: „Aplică tema” si „Pune la loc designul de dinainte”. Actiunile vorbesc
 * cu baza, deci ordinea lor se probeaza pe sursa; ce se scrie si ce se readuce, pe bucatile pure.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

test("identitatea ca un continut de ciorna: cheile „Stil” (fundalul, fonturile) si culoarea, nimic altceva", () => {
  const c = continutIdentitate(IDENTITATE_JUPITER);
  assert.deepEqual(c, {
    pc: { store_bg_color: "#FFFFFF", font_titluri: "jakarta", font_text: "inter" },
    magazin: { primary_color: "#0B3D7A" },
  });
  assert.deepEqual(pageContentCuIdentitatea({ hero_banners: ["a"] }, IDENTITATE_JUPITER), { hero_banners: ["a"], ...c.pc });
  assert.deepEqual(magazinCuIdentitatea(IDENTITATE_JUPITER), c.magazin);
});

test("semnul temei aplicate: citit doar intreg; datele versiunilor de dinainte, in ordine", () => {
  assert.deepEqual(temaAplicataDin({ [CHEIE_TEMA_APLICATA]: { cheie: "jupiter", la: "2026-10-29T10:00:00.000Z" } }), { cheie: "jupiter", la: "2026-10-29T10:00:00.000Z" });
  for (const rau of [{}, null, { [CHEIE_TEMA_APLICATA]: "jupiter" }, { [CHEIE_TEMA_APLICATA]: { cheie: "jupiter", la: "ieri" } }]) {
    assert.equal(temaAplicataDin(rau), null);
  }
  const la = dateleVersiunilorDeDinainte(Date.parse("2026-10-29T10:00:00.000Z"));
  assert.ok(Date.parse(la.tema) < Date.parse(la.ciorna) && Date.parse(la.ciorna) < Date.parse("2026-10-29T10:00:00.000Z"));
});

test("subsolul primeste coloanele temei; coloanele alese de el raman", () => {
  assert.ok(coloaneVazute(designJupiter(ctx, null).chrome.footer).some((c) => c.id === "raioane"));
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  const aleLui = parseStoreDesign({ ...d, chrome: { ...d.chrome, footer: { ...d.chrome.footer, blocks: [{ id: "doar_contact", type: "contact", enabled: true, settings: { titlu: "Contact" } }] } } }, ctx);
  assert.deepEqual(designJupiter(ctx, null, aleLui).chrome.footer.blocks?.map((b) => b.id), ["doar_contact"]);
});

test("⚠⚠ „Aplică”, apoi „Pune la loc”: identitatea, continutul si designul revin EXACT cum erau", () => {
  // Inainte: un magazin cu bannerele lui, fara fundal si fonturi alese, verde.
  const pc0: Record<string, unknown> = { hero_banners: ["https://x/banner.jpg"], announcement_bar: { text: "Livrare gratuita" } };
  const magazin0 = { logo_url: null, cover_url: null, primary_color: "#07c527", gallery: [] as string[] };
  const ctx0: DesignContext = { ...ctx, pageContent: pc0, primaryColor: magazin0.primary_color };
  const design0 = parseStoreDesign(buildClassicDesign(ctx0), ctx0);
  const versiuneTema = { design: JSON.parse(JSON.stringify(design0)), continut: JSON.parse(JSON.stringify(instantaneuContinut(pc0, magazin0))) };

  // „Aplică”: identitatea ca un continut, publicata (cum scrie `publishDesign`).
  const continut = continutIdentitate(IDENTITATE_JUPITER);
  const pc1 = pcCuCiorna(pc0, continut);
  const magazin1 = { ...magazin0, ...continut.magazin };
  const ctx1 = contextCuCiorna(ctx0, continut);
  assert.equal(ctx1.primaryColor, "#0B3D7A");
  assert.equal(designJupiter(ctx1, null, design0).chrome.header.variant, "hipermarket");

  // „Pune la loc”: versiunea `tema`, ca o ciorna fata de ce e publicat acum, apoi publicata.
  const ciorna = ciornaDinVersiune(versiuneTema, { pc: pc1, magazin: magazin1 }, ctx1);
  const pc2 = pcCuCiorna(pc1, ciorna.continut);
  const magazin2 = { ...magazin1, ...ciorna.continut.magazin };
  assert.equal(jsonCanonic(pc2), jsonCanonic(pc0), "fundalul si fonturile temei ies, ale lui raman");
  assert.equal(magazin2.primary_color, "#07c527");
  assert.equal(jsonCanonic(ciorna.design), jsonCanonic(design0));
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function functia(s: string, nume: string): string {
  const i = s.indexOf(`export async function ${nume}(`);
  assert.ok(i >= 0, `lipseste ${nume}`);
  return s.slice(i, s.indexOf("\n}\n", i) + 2);
}

test("⚠⚠ aplicarea: proprietarul intai; ce era intra in Istoric INAINTE de publicare, iar o cadere acolo o opreste", () => {
  const f = functia(cod("src/lib/actions/store-design.actions.ts"), "aplicaTema");
  // Etapa 18.2: al treilea argument, „Importă și datele demo”; doar un `true` adevarat il porneste (vine din browser).
  // Etapa 25.28: dupa proprietar, limita de frecventa (actiunea sterge si importa produse).
  assert.match(f, /^export async function aplicaTema\(businessId: string, cheie: string, cuDateDemo\?: boolean\): Promise<ActionResult> \{\s*const owned = await loadOwnedStore\(businessId\);\s*if \("error" in owned\) return owned;\s*if \(prea_des\(owned\.userId\)\) return \{ error: PREA_DES_TEME \};\s*const tema = temaDupaCheie\(cheie\);\s*if \(!tema\) return \{ error: "Tema nu există\." \};\s*const cuDate = cuDateDemo === true;/);
  const istoric = f.indexOf("if (!(await pastreazaInainteDeTema(owned, randuri))) {");
  const publicare = f.indexOf("const publicat = await publishDesign(owned.businessId, ciornaCuContinut(design, continut));");
  const semn = f.indexOf("await scrieSemnulTemei(owned.businessId, { cheie: tema.cheie,");
  assert.ok(istoric > 0 && publicare > istoric && semn > publicare, "ordinea: Istoricul, publicarea, semnul");
  assert.match(f, /origine: "tema", publicat_de: owned\.userId, created_at: la\.tema,/);
  assert.match(f, /origine: "ciorna", publicat_de: owned\.userId, created_at: la\.ciorna,/);
  // Etapa 18.3: contextul e al magazinului de DUPA import (randurile si bannerele demo intra in designul temei).
  assert.match(f, /const continut = continutIdentitate\(tema\.identitate\);\s*const ctxTema = contextCuCiorna\(ctxMagazin, continut\);/);
  // Etapa 25.3: peste designul publicat FARA textele puse de o tema (altfel tema noua le pastra drept ale lui).
  assert.match(f, /const baza = faraTexteleTemelor\(parseStoreDesign\(row\?\.storefront_design \?\? \{\}, ctxTema\), \{ siTexteleTemei: true \}\)\.design;\s*const design = tema\.design\(ctxTema, cuDate \? tema\.date : null, baza, \{ radacinaCatalog \}\);/);
  // Si starea de atunci in versiunea `tema` (tema aplicata, datele demo), pentru „Pune la loc”.
  assert.match(f, /continut: \{ \.\.\.instantaneuContinut\(owned\.ctx\.pageContent, owned\.magazin\), stare: stareaMagazinului\(owned\.ctx\.pageContent\) \}/);
  assert.match(f, /if \("error" in publicat\) \{/);
});

test("⚠⚠ 18.2-18.3: cu datele demo, limita planului INAINTEA oricarei scrieri, importul dupa Istoric si inaintea temei", () => {
  const f = functia(cod("src/lib/actions/store-design.actions.ts"), "aplicaTema");
  const limita = f.indexOf("const loc = await citesteLoculPentruDemo(supabase, owned.userId, owned.businessId, tema.cheie, tema.date);");
  const istoric = f.indexOf("if (!(await pastreazaInainteDeTema(owned, randuri))) {");
  // Etapa 25.3: datele demo ale celorlalte teme pleaca dupa Istoric (care le tine minte) si inaintea importului.
  const scoase = f.indexOf("const scos = await scoateDateleDemo(owned, tema.cheie);");
  const importul = f.indexOf("await importaDateleDemo(createAdminClient(), owned.businessId, tema.cheie, tema.date, radacinaCatalog);");
  const reluat = f.indexOf("const dupaImport = await loadOwnedStore(owned.businessId);");
  const publicare = f.indexOf("const publicat = await publishDesign(");
  assert.ok(limita > 0 && istoric > limita && scoase > istoric && importul > scoase && reluat > importul && publicare > reluat,
    "ordinea: limita, Istoricul, datele demo de dinainte scoase, importul, magazinul recitit, publicarea");
  assert.match(f, /if \(cuDate\) \{\s*const scos = await scoateDateleDemo\(owned, tema\.cheie\);\s*if \(scos\) \{\s*logError\(\{[^}]*\}\);\s*return \{ error: "Datele demo de dinainte nu s-au putut scoate, deci tema nu s-a aplicat\. Încearcă din nou\." \};/);
  assert.match(f, /if \(!loc\.incap\) return \{ error: `\$\{motivulLimitei\(loc\)\} Aplică tema fără datele demo\.` \};/);
  // Un plan necitit opreste aplicarea cu date, nu o lasa sa treaca.
  assert.match(f, /if \("error" in loc\) \{\s*logError\(\{[^}]*\}\);\s*return \{ error: "Nu am putut verifica limita de produse a planului, deci tema nu s-a aplicat\. Încearcă din nou\." \};/);
  // Importul cazut opreste tema; textele demo intra in design doar cu bifa.
  assert.match(f, /\} catch \(e\) \{\s*logError\(\{[^}]*\}\);\s*return \{ error: "Datele demo nu s-au putut adăuga, deci tema nu s-a aplicat\. Încearcă din nou\." \};/);
  assert.match(f, /const design = tema\.design\(ctxTema, cuDate \? tema\.date : null, baza, \{ radacinaCatalog \}\);/);
  assert.match(f, /const radacinaCatalog = radacinaCatalogTemei\(owned\.ctx\.pageContent\);/);
});

test("radacina catalogului dupa tema: prefixul din Setări > Permalink-uri, implicit /magazin", () => {
  assert.equal(radacinaCatalogTemei({}), "/magazin");
  assert.equal(radacinaCatalogTemei({ permalinks: { magazin: "produse" } }), "/produse");
  // O valoare stricata cade pe implicit, nu pe o adresa rupta (`permalinkuriDin`).
  assert.equal(radacinaCatalogTemei({ permalinks: { magazin: "Cos Nou!" } }), "/magazin");
});

test("⚠⚠ cheile temelor din `page_content` nu se scriu peste o citire cazuta (ar fi inlocuit tot `page_content`)", () => {
  const s = cod("src/lib/actions/store-design.actions.ts");
  const i = s.indexOf("async function scrieCheiaTemei(");
  const f = s.slice(i, s.indexOf("\n}\n", i));
  const garda = f.indexOf("if (error || !data) {");
  const scrierea = f.indexOf("await writeSettings(");
  assert.ok(garda > 0 && scrierea > garda, "garda inaintea scrierii");
  assert.match(f.slice(garda, scrierea), /return;/);
  assert.match(s, /async function scrieSemnulTemei\(businessId: string, semn: TemaAplicata \| null\): Promise<void> \{\s*await scrieCheiaTemei\(businessId, CHEIE_TEMA_APLICATA, semn, "tema\.semn"\);/);
});

test("⚠⚠ „Pune la loc”: nu peste o ciorna nepublicata; versiunea aleasa peste temele doar incercate, publicata; semnul de atunci", () => {
  const f = functia(cod("src/lib/actions/store-design.actions.ts"), "puneLaLocDesignulDeDinainte");
  const owned = f.indexOf("const owned = await loadOwnedStore(businessId);\n  if (\"error\" in owned) return owned;");
  const ciorna = f.indexOf("if (row?.storefront_design_draft) {");
  const istoric = f.indexOf("const v = await designulDeDinainteDeTema(owned);");
  assert.ok(owned > 0 && ciorna > owned && istoric > ciorna, "proprietarul, apoi ciorna, abia apoi Istoricul (clientul de serviciu)");
  assert.ok(f.indexOf("createAdminClient()") > istoric, "clientul de serviciu, abia dupa ciorna");
  // 14.11.2026: nu mai e „cea mai noua versiune `tema`” (MNY AROMA: dupa trei teme la rand, readucea tot tema a doua).
  assert.doesNotMatch(f, /\.eq\("origine", "tema"\)/);
  // O citire cazuta e o eroare, nu „nimic de pus la loc”.
  assert.match(f, /if \(v && "error" in v\) \{\s*logError\(\{[^}]*\}\);\s*return \{ error: "Nu am putut citi Istoricul\. Încearcă din nou\." \};\s*\}\s*if \(!v\) return \{ error: "Nu există în Istoric un design de dinainte de temă\." \};/);
  // Etapa 25.3/25.7: magazinul de dupa readucerea datelor demo de atunci, apoi semnul TEMEI DE ATUNCI (nu „niciuna”).
  assert.match(f, /const ciorna = ciornaDinVersiune\(\{ design: v\.design, continut \}, \{ pc: ctx\.pageContent, magazin: owned\.magazin \}, ctx\);\s*const publicat = await publishDesign\(owned\.businessId, ciornaCuContinut\(ciorna\.design, ciorna\.continut\)\);\s*if \("error" in publicat\) return publicat;[\s\S]*?await scrieSemnulTemei\(owned\.businessId, stare\?\.tema \?\? null\);/);
  // Datele demo de acum pleaca INAINTE de reimport, iar randurile versiunii iau produsele reimportate.
  const scoase = f.indexOf("const scos = await scoateDateleDemo(owned, demoInainte);");
  const reimport = f.indexOf("await importaDateleDemo(createAdminClient(), owned.businessId, temaInainte.cheie, temaInainte.date,");
  const randuri = f.indexOf("continut = continutCuRandurileDemoDeAcum(v.continut, dupa.ctx.pageContent);");
  const publicare = f.indexOf("const publicat = await publishDesign(");
  assert.ok(scoase > 0 && reimport > scoase && randuri > reimport && publicare > randuri, "scoase, reimport, randurile, publicarea");
  // Plan plin: designul revine fara datele de atunci, si omul afla.
  assert.match(f, /if \("error" in loc \|\| !loc\.incap\) \{\s*nota = `Datele demo ale temei \$\{temaInainte\.nume\} nu mai încap în planul tău, deci designul a revenit fără ele\.`;/);
});

test("⚠⚠ 14.11.2026: versiunea de pus la loc se alege intr-un SINGUR loc, cu regula din `pune-la-loc.ts`, pentru buton si fereastra", () => {
  const s = cod("src/lib/actions/store-design.actions.ts");
  const i = s.indexOf("async function designulDeDinainteDeTema(");
  assert.ok(i >= 0, "lipseste designulDeDinainteDeTema");
  // Nu e un capat public: „use server” ar fi expus orice export.
  assert.doesNotMatch(s, /export async function designulDeDinainteDeTema/);
  const h = s.slice(i, s.indexOf("\n}\n", i) + 2);
  // Lista cu starea fiecarei versiuni (mica), drumul dupa semnul din magazin, apoi intregi DOAR versiunile de pe drum.
  assert.match(h, /\.from\("storefront_design_versions"\)\s*\.select\("id, origine, created_at, stare:continut->stare"\)\s*\.eq\("business_id", owned\.businessId\)/);
  assert.match(h, /const drum = drumulInapoi\(lista \?\? \[\], temaAplicataDin\(owned\.ctx\.pageContent\)\);\s*if \(!drum\) return null;/);
  assert.match(h, /\.from\("storefront_design_versions"\)\s*\.select\("id, design, continut"\)\s*\.eq\("business_id", owned\.businessId\)\s*\.in\("id", versiuniDeCitit\(drum\)\);/);
  assert.match(h, /const ales = versiuneaDePusLaLoc\(drum, versiuni\);/);
  // Citirile cazute si versiunea aleasa lipsa sunt erori, nu „nimic de pus la loc”.
  assert.match(h, /if \(error\) return \{ error: error\.message \};/);
  assert.match(h, /if \(eIntregi\) return \{ error: eIntregi\.message \};/);
  assert.match(h, /if \(!ales \|\| !v\) return \{ error:/);
  // Chemata numai de buton si de intrebarea paginii „Teme”, cu magazinul verificat.
  assert.deepEqual([...s.matchAll(/designulDeDinainteDeTema\((\w+)\)/g)].map((m) => m[1]), ["owned", "owned"]);
  for (const nume of ["puneLaLocDesignulDeDinainte", "areDesignDeDinainteDeTema"]) {
    const f = functia(s, nume);
    const owned = f.indexOf("const owned = await loadOwnedStore(businessId);");
    assert.ok(owned > 0 && f.indexOf("await designulDeDinainteDeTema(owned)") > owned, nume);
  }
  // Fereastra numeste tema dinaintea careia revine designul (`temaDupa`), din aceeasi alegere.
  assert.match(functia(s, "areDesignDeDinainteDeTema"), /temaDupa: v\.temaDupa/);
});

test("tema exista si are identitatea ei; o cheie necunoscuta nu aplica nimic", () => {
  assert.equal(temaDupaCheie("jupiter")?.identitate, IDENTITATE_JUPITER);
  assert.equal(temaDupaCheie("pluton"), null);
  assert.equal(temaDupaCheie(undefined), null);
});

test("17.4: pagina „Teme”: magazinul LUI, Istoricul intrebat prin actiunea editorului, data in fusul Romaniei; in meniu", () => {
  const p = cod("src/app/(dashboard)/dashboard/editor/teme/page.tsx");
  assert.match(p, /const user = await getCachedUser\(\);\s*if \(!user\) redirect\("\/login"\);/);
  assert.match(p, /\.eq\("user_id", user\.id\)/);
  // Istoricul se intreaba doar cat e o tema aplicata: dupa „Pune la loc”, caseta ei dispare (gasit la proba 17.6).
  assert.match(p, /const inainte = aplicata \? await areDesignDeDinainteDeTema\(magazin\.id\) : null;/);
  assert.match(p, /poatePuneLaLoc=\{inainte !== null && \("error" in inainte \|\| inainte\.exista\)\}/);
  assert.match(p, /timeZone: "Europe\/Bucharest"/);
  const c = cod("src/components/teme/TemeClient.tsx");
  assert.match(c, /const \[lucreaza, porneste\] = useLucru\(\);/);
  assert.doesNotMatch(c, /useTransition/, "o tranzitie async ar fi tinut pe loc navigarea");
  // Etapa 18.2: bifa „Importă și datele demo”, trimisa doar cand se poate alege (planul o incape).
  assert.match(c, /const cuDateDemo = cuDate && t\.demo\.motivOprit === null;\s*const r = await aplicaTema\(businessId, t\.cheie, cuDateDemo\);/);
  assert.match(c, /const r = await puneLaLocDesignulDeDinainte\(businessId\);/);
  assert.match(c, /disabled=\{lucreaza \|\| areCiorna\} onClick=\{puneLaLoc\}/, "cu o ciorna nepublicata, „Pune la loc” asteapta");
  assert.match(cod("src/lib/navigatie-panou.ts"), /\{ href: "\/dashboard\/editor\/teme", label: "Teme" \},/);
  const a = functia(cod("src/lib/actions/store-design.actions.ts"), "areDesignDeDinainteDeTema");
  assert.ok(a.indexOf("loadOwnedStore(businessId)") > 0 && a.indexOf("loadOwnedStore(businessId)") < a.indexOf("designulDeDinainteDeTema(owned)"));
  assert.match(a, /return \{ error: "Nu am putut citi Istoricul\." \};/);
  // 14.11.2026: caseta si fereastra spun de dinaintea carei teme revine designul (peste temele doar incercate).
  assert.match(p, /laLocTemaDupa=\{inainte && !\("error" in inainte\) \? inainte\.temaDupa \?\? null : null\}/);
  assert.match(c, /const temaLaLoc = numeTema\(laLocTemaDupa\);\s*const deDinainteDeTema = temaLaLoc \? `de dinainte de tema \$\{temaLaLoc\}` : "de dinainte de temă";/);
  assert.match(c, /Designul \{deDinainteDeTema\} e păstrat în Istoric\./);
  assert.match(c, /Magazinul revine la designul, culoarea și fonturile \{deDinainteDeTema\}\./);
});

test("„Aplică”, „Pune la loc” si „Șterge datele demo” improspateaza chiar pagina „Teme”, de unde sta ea", () => {
  const cale = "src/app/(dashboard)/dashboard/editor/teme/page.tsx";
  assert.ok(readFileSync(cale, "utf8").includes("export default async function TemePage"));
  const s = cod("src/lib/actions/store-design.actions.ts");
  for (const nume of ["aplicaTema", "puneLaLocDesignulDeDinainte", "stergeDateleDemo"]) {
    assert.match(functia(s, nume), /revalidatePath\("\/dashboard\/editor\/teme"\);/, nume);
  }
  assert.doesNotMatch(s, /revalidatePath\("\/dashboard\/teme"\)/);
});

test("18.2/18.4 pe pagina „Teme”: bifa porneste PORNITA doar fara produse proprii (25.5), se opreste cand planul n-o incape; stergerea asteapta ciorna", () => {
  const c = cod("src/components/teme/TemeClient.tsx");
  // La fiecare deschidere a ferestrei, bifa pornita (cerut de el, 08.11.2026), dar din 11.11.2026 (etapa 25.5) doar la un
  // magazin fara produse proprii: la unul care vinde deja, un clic grabit punea produse demo comandabile.
  assert.match(c, /const bifaImplicita = !areProduseProprii;\s*const \[cuDate, setCuDate\] = useState\(bifaImplicita\);/);
  assert.match(c, /const deschideAplicarea = \(t: TemaPeCard\) => \{\s*setCuDate\(bifaImplicita\);\s*setDeAplicat\(t\);\s*\};/);
  const pagina = cod("src/app/(dashboard)/dashboard/editor/teme/page.tsx");
  // Produsele LUI: sursa NULL inclusa (`or`, nu `neq`), iar o citire cazuta conteaza ca „are produse”.
  assert.match(pagina, /\.or\(`source\.is\.null,source\.neq\.\$\{SURSA_DEMO\}`\)/);
  assert.match(pagina, /areProduseProprii=\{produseProprii === null \|\| produseProprii > 0\}/);
  assert.match(c, /disabled=\{lucreaza \|\| deAplicat\.demo\.motivOprit !== null\}/);
  assert.match(c, /checked=\{cuDate && deAplicat\.demo\.motivOprit === null\}/);
  assert.match(c, /const r = await stergeDateleDemo\(businessId\);/);
  assert.match(c, /disabled=\{lucreaza \|\| areCiorna\} onClick=\{stergeDemo\}/, "cu o ciorna nepublicata, stergerea asteapta");
  // Cu magazinul vizibil, fereastra spune ca produsele demo se pot comanda.
  assert.match(c, /\{estePublic && <li>Magazinul e vizibil: clienții văd produsele demo și le pot comanda până le ștergi\.<\/li>\}/);
  const p = cod("src/app/(dashboard)/dashboard/editor/teme/page.tsx");
  assert.match(p, /citesteContextulPentruDemo\(supabase, user\.id, magazin\.id\)/);
  assert.match(p, /loculDinContext\(context, t\.cheie, t\.date\)/);
  assert.match(p, /motivOprit: "error" in loc \|\| loc\.incap \? null : motivulLimitei\(loc\),/);
  // Etapa 25.3: si tema datelor demo (din urma), ca ferestrele sa spuna ale cui pleaca.
  assert.match(p, /dateDemo=\{urma \|\| \(produseDemo \?\? 0\) > 0 \? \{ produse: produseDemo \?\? 0, tema: urma\?\.tema \|\| null \} : null\}/);
});

test("⚠ „Aplică tema”: mesajul spune „cu datele demo” doar cand datele chiar au plecat spre server", () => {
  /*
   * Din 08.11 bifa porneste pornita, iar cand planul n-o incape starea ramane `true` (comutatorul doar se vede oprit).
   * Gasit la recitirea din 09.11: mesajul de succes se lua dupa `cuDate` singur, deci tema aplicata FARA date spunea
   * „cu datele demo”. Regula: in `aplica`, bifa bruta se citeste O SINGURA DATA, ca sa dea valoarea care pleaca; tot ce
   * urmeaza (cererea, mesajul) se ia dupa ea. Orice ramura noua pe `cuDate` singur o rupe.
   */
  const c = cod("src/components/teme/TemeClient.tsx");
  const i = c.indexOf("const aplica = (t: TemaPeCard) => porneste(async () => {");
  assert.ok(i >= 0, "lipseste aplica");
  const f = c.slice(i, c.indexOf("\n  });\n", i));
  assert.equal(f.match(/\bcuDate\b/g)?.length, 1, "bifa bruta se citeste o singura data, in valoarea care pleaca");
  assert.match(f, /const cuDateDemo = cuDate && t\.demo\.motivOprit === null;\s*const r = await aplicaTema\(businessId, t\.cheie, cuDateDemo\);/);
  assert.match(f, /toast\.success\(cuDateDemo\s*\?\s*`Tema \$\{t\.nume\} e în magazin, cu datele demo\./);
});

test("⚠ 25.28: aplicarea, „Pune la loc” si „Șterge datele demo” au limita de frecventa, dupa proprietar", () => {
  const s = cod("src/lib/actions/store-design.actions.ts");
  assert.match(s, /const prea_des = \(userId: string\) => !rateLimit\(`teme:\$\{userId\}`, 10, 60_000\);/);
  for (const nume of ["aplicaTema", "puneLaLocDesignulDeDinainte", "stergeDateleDemo"]) {
    const f = functia(s, nume);
    const owned = f.indexOf("const owned = await loadOwnedStore(businessId);");
    const limita = f.indexOf("if (prea_des(owned.userId)) return { error: PREA_DES_TEME };");
    assert.ok(owned > 0 && limita > owned, `${nume}: limita dupa proprietar`);
    // Inaintea oricarei scrieri: nimic nu se atinge cand e refuzat.
    assert.ok(limita < f.indexOf("createAdminClient()") || f.indexOf("createAdminClient()") < 0, nume);
  }
});
