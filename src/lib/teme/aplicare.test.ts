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
  areFurnizorNewsletter,
  CHEIE_TEMA_APLICATA,
  continutIdentitate,
  dateleVersiunilorDeDinainte,
  magazinCuIdentitatea,
  pageContentCuIdentitatea,
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
    pc: { store_bg_color: "#FFFFFF", font_titluri: "sofiasans", font_text: "opensans" },
    magazin: { primary_color: "#215196" },
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
  assert.equal(areFurnizorNewsletter({ mailchimp: false, brevo: false, klaviyo: false }), false);
  assert.equal(areFurnizorNewsletter({ mailchimp: false, brevo: true, klaviyo: false }), true);
});

test("fara furnizor de newsletter, coloana „Newsletter” a temei nu intra; coloanele alese de el raman oricum", () => {
  const fara = designJupiter(ctx, null, undefined, { cuNewsletter: false });
  assert.ok(!coloaneVazute(fara.chrome.footer).some((c) => c.type === "newsletter"));
  assert.ok(coloaneVazute(fara.chrome.footer).some((c) => c.id === "raioane"), "celelalte coloane ale temei raman");
  const cu = designJupiter(ctx, null, undefined, { cuNewsletter: true });
  assert.equal(coloaneVazute(cu.chrome.footer)[0]?.type, "newsletter");
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  const aleLui = parseStoreDesign({ ...d, chrome: { ...d.chrome, footer: { ...d.chrome.footer, blocks: [{ id: "doar_contact", type: "contact", enabled: true, settings: { titlu: "Contact" } }] } } }, ctx);
  assert.deepEqual(designJupiter(ctx, null, aleLui, { cuNewsletter: false }).chrome.footer.blocks?.map((b) => b.id), ["doar_contact"]);
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
  assert.equal(ctx1.primaryColor, "#215196");
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
  assert.match(f, /^export async function aplicaTema\(businessId: string, cheie: string\): Promise<ActionResult> \{\s*const owned = await loadOwnedStore\(businessId\);\s*if \("error" in owned\) return owned;\s*const tema = temaDupaCheie\(cheie\);\s*if \(!tema\) return \{ error: "Tema nu există\." \};/);
  const istoric = f.indexOf("if (!(await pastreazaInainteDeTema(owned, randuri))) {");
  const publicare = f.indexOf("const publicat = await publishDesign(owned.businessId, ciornaCuContinut(design, continut));");
  const semn = f.indexOf("await scrieSemnulTemei(owned.businessId, { cheie: tema.cheie,");
  assert.ok(istoric > 0 && publicare > istoric && semn > publicare, "ordinea: Istoricul, publicarea, semnul");
  assert.match(f, /origine: "tema", publicat_de: owned\.userId, created_at: la\.tema,/);
  assert.match(f, /origine: "ciorna", publicat_de: owned\.userId, created_at: la\.ciorna,/);
  assert.match(f, /const continut = continutIdentitate\(tema\.identitate\);\s*const ctxTema = contextCuCiorna\(owned\.ctx, continut\);/);
  assert.match(f, /cuNewsletter: areFurnizorNewsletter\(integrari\.newsletter\),/);
  assert.match(f, /if \("error" in publicat\) return publicat;/);
});

test("⚠⚠ „Pune la loc”: nu peste o ciorna nepublicata; versiunea `tema` cea mai noua a LUI, publicata; semnul scos", () => {
  const f = functia(cod("src/lib/actions/store-design.actions.ts"), "puneLaLocDesignulDeDinainte");
  const owned = f.indexOf("const owned = await loadOwnedStore(businessId);\n  if (\"error\" in owned) return owned;");
  const ciorna = f.indexOf("if (row?.storefront_design_draft) {");
  const admin = f.indexOf("createAdminClient()");
  assert.ok(owned > 0 && ciorna > owned && admin > ciorna, "proprietarul, apoi ciorna, abia apoi clientul de serviciu");
  assert.match(f, /\.eq\("business_id", owned\.businessId\)\s*\.eq\("origine", "tema"\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(1\)\s*\.maybeSingle\(\);/);
  assert.match(f, /const ciorna = ciornaDinVersiune\(v, \{ pc: owned\.ctx\.pageContent, magazin: owned\.magazin \}, owned\.ctx\);\s*const publicat = await publishDesign\(owned\.businessId, ciornaCuContinut\(ciorna\.design, ciorna\.continut\)\);\s*if \("error" in publicat\) return publicat;\s*await scrieSemnulTemei\(owned\.businessId, null\);/);
});

test("tema exista si are identitatea ei; o cheie necunoscuta nu aplica nimic", () => {
  assert.equal(temaDupaCheie("jupiter")?.identitate, IDENTITATE_JUPITER);
  assert.equal(temaDupaCheie("saturn"), null);
  assert.equal(temaDupaCheie(undefined), null);
});

test("17.4: pagina „Teme”: magazinul LUI, Istoricul intrebat prin actiunea editorului, data in fusul Romaniei; in meniu", () => {
  const p = cod("src/app/(dashboard)/dashboard/editor/teme/page.tsx");
  assert.match(p, /const user = await getCachedUser\(\);\s*if \(!user\) redirect\("\/login"\);/);
  assert.match(p, /\.eq\("user_id", user\.id\)/);
  assert.match(p, /const inainte = await areDesignDeDinainteDeTema\(magazin\.id\);/);
  assert.match(p, /timeZone: "Europe\/Bucharest"/);
  const c = cod("src/components/teme/TemeClient.tsx");
  assert.match(c, /const \[lucreaza, porneste\] = useLucru\(\);/);
  assert.doesNotMatch(c, /useTransition/, "o tranzitie async ar fi tinut pe loc navigarea");
  assert.match(c, /const r = await aplicaTema\(businessId, t\.cheie\);/);
  assert.match(c, /const r = await puneLaLocDesignulDeDinainte\(businessId\);/);
  assert.match(c, /disabled=\{lucreaza \|\| areCiorna\} onClick=\{puneLaLoc\}/, "cu o ciorna nepublicata, „Pune la loc” asteapta");
  assert.match(cod("src/lib/navigatie-panou.ts"), /\{ href: "\/dashboard\/editor\/teme", label: "Teme" \},/);
  const a = functia(cod("src/lib/actions/store-design.actions.ts"), "areDesignDeDinainteDeTema");
  assert.ok(a.indexOf("loadOwnedStore(businessId)") > 0 && a.indexOf("loadOwnedStore(businessId)") < a.indexOf("createAdminClient()"));
  assert.match(a, /return \{ error: "Nu am putut citi Istoricul\." \};/);
});

test("„Aplică” si „Pune la loc” improspateaza chiar pagina „Teme”, de unde sta ea", () => {
  const cale = "src/app/(dashboard)/dashboard/editor/teme/page.tsx";
  assert.ok(readFileSync(cale, "utf8").includes("export default async function TemePage"));
  const s = cod("src/lib/actions/store-design.actions.ts");
  for (const nume of ["aplicaTema", "puneLaLocDesignulDeDinainte"]) {
    assert.match(functia(s, nume), /revalidatePath\("\/dashboard\/editor\/teme"\);/, nume);
  }
  assert.doesNotMatch(s, /revalidatePath\("\/dashboard\/teme"\)/);
});
