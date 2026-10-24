import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  dateleMagazinuluiDinRand, imbinaButoanele, imbinaRetelele,
  normalizeazaLinkSocial, pregatesteDateleGenerale,
} from "./datele-magazinului";

/*
 * Setari > General: numele, contactul, adresa, retelele sociale, butoanele
 * flotante si datele firmei. Pana la 24.10.2026 jumatate se editau din
 * „Editeaza magazinul”, iar telefonul si emailul aveau camp in amandoua.
 */

const RADACINA = process.cwd();
/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
const sursa = (f: string) => readFileSync(path.join(RADACINA, f), "utf8").replace(/\r\n/g, "\n");

const BAZA = {
  business_name: "SC Floraria Mirei SRL",
  store_name: "Floraria Mirei",
  tagline: "", description: "", phone: "0722123456", whatsapp: "", email: "",
  store_address: "", store_city: "", store_county: "",
  social: {}, butoane: { whatsapp: true, apel: false },
  cui: "", reg_com: "", address: "", city: "", county: "",
};

/* ─────────────── linkurile sociale ─────────────── */

test("linkul fara schema primeste https://, cel gol dispare", () => {
  assert.deepEqual(normalizeazaLinkSocial("instagram.com/floraria"), { url: "https://instagram.com/floraria" });
  assert.deepEqual(normalizeazaLinkSocial("  https://facebook.com/floraria  "), { url: "https://facebook.com/floraria" });
  assert.deepEqual(normalizeazaLinkSocial(""), { url: null });
  assert.deepEqual(normalizeazaLinkSocial(undefined), { url: null });
});

test("⚠⚠ un link care nu e http(s) se refuza, oricum ar fi scris", () => {
  /* Ajunge ca `href` in subsolul fiecarei pagini a magazinului. */
  for (const rau of ["javascript:alert(1)", "JavaScript:alert(document.cookie)", "data:text/html,<b>x</b>", "vbscript:x", "mailto:a@b.ro"]) {
    assert.ok("eroare" in normalizeazaLinkSocial(rau), rau);
  }
  assert.ok("eroare" in normalizeazaLinkSocial("@floraria"), "un nume de utilizator nu e o adresa");
  assert.ok("eroare" in normalizeazaLinkSocial("https://" + "a".repeat(400) + ".ro"));
});

/* ─────────────── ce pleaca in UPDATE ─────────────── */

test("⚠⚠ in UPDATE intra NUMAI coloanele ecranului, orice ar trimite browserul", () => {
  const r = pregatesteDateleGenerale({
    ...BAZA,
    slug: "alt-magazin", custom_domain: "rau.ro", is_published: true,
    suspended_until: null, user_id: "altcineva", plan: "ultra",
  });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.coloane).sort(), [
    "address", "business_name", "city", "county", "cui", "description", "email", "phone",
    "reg_com", "store_address", "store_city", "store_county", "store_name", "tagline", "whatsapp",
  ]);
});

test("denumirea firmei e obligatorie, si la o intrare care nu e obiect", () => {
  assert.equal(pregatesteDateleGenerale({ ...BAZA, business_name: "   " }).ok, false);
  assert.equal(pregatesteDateleGenerale(null).ok, false);
  assert.equal(pregatesteDateleGenerale("x").ok, false);
});

test("lungimile ecranului se aplica si pe server", () => {
  assert.equal(pregatesteDateleGenerale({ ...BAZA, tagline: "x".repeat(121) }).ok, false);
  assert.equal(pregatesteDateleGenerale({ ...BAZA, tagline: "x".repeat(120) }).ok, true);
  assert.equal(pregatesteDateleGenerale({ ...BAZA, description: "x".repeat(601) }).ok, false);
  assert.equal(pregatesteDateleGenerale({ ...BAZA, store_name: "x".repeat(101) }).ok, false);
});

test("emailul gresit se refuza, cel gol trece", () => {
  assert.equal(pregatesteDateleGenerale({ ...BAZA, email: "comenzi@floraria" }).ok, false);
  assert.equal(pregatesteDateleGenerale({ ...BAZA, email: "comenzi@floraria.ro" }).ok, true);
  assert.equal(pregatesteDateleGenerale({ ...BAZA, email: "" }).ok, true);
});

test("un link social stricat opreste salvarea si spune care retea", () => {
  const r = pregatesteDateleGenerale({ ...BAZA, social: { tiktok: "javascript:alert(1)" } });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.eroare : "", /TikTok/);
});

test("campurile goale devin NULL, ca in editorul vechi", () => {
  const r = pregatesteDateleGenerale({ ...BAZA, tagline: "   ", email: " ", store_city: "" });
  assert.ok(r.ok);
  assert.equal(r.coloane.tagline, null);
  assert.equal(r.coloane.email, null);
  assert.equal(r.coloane.store_city, null);
  assert.equal(r.coloane.store_name, "Floraria Mirei");
});

test("butoanele se aprind doar cu `true`, nu cu ceva care seamana", () => {
  const r = pregatesteDateleGenerale({ ...BAZA, butoane: { whatsapp: "true", apel: 1 } });
  assert.ok(r.ok);
  assert.deepEqual(r.butoane, { floating_whatsapp: false, floating_call: false });
});

/* ─────────────── imbinarea peste randul din baza ─────────────── */

test("retelele: cheile pe care ecranul nu le are raman, reteaua golita dispare", () => {
  const existent = { website: "https://floraria.ro", instagram: "https://instagram.com/vechi", youtube: "https://youtube.com/x" };
  const out = imbinaRetelele(existent, { instagram: "https://instagram.com/nou", facebook: null, tiktok: null, youtube: null });
  assert.deepEqual(out, { website: "https://floraria.ro", instagram: "https://instagram.com/nou" });
});

test("⚠ butoanele: restul cheilor din `features` (citite de designul magazinului) raman neatinse", () => {
  const out = imbinaButoanele({ show_gallery: false, show_contact: true, floating_call: true }, { floating_whatsapp: true, floating_call: false });
  assert.deepEqual(out, { show_gallery: false, show_contact: true, floating_whatsapp: true, floating_call: false });
});

/* ─────────────── ecranul arata ce vede clientul ─────────────── */

test("⚠⚠ butoanele flotante se citesc la fel ca in magazin", () => {
  assert.deepEqual(dateleMagazinuluiDinRand({ features: {} }).butoane, { whatsapp: true, apel: false });
  assert.deepEqual(dateleMagazinuluiDinRand({ features: { floating_whatsapp: false, floating_call: true } }).butoane, { whatsapp: false, apel: true });
  assert.deepEqual(dateleMagazinuluiDinRand(null).butoane, { whatsapp: true, apel: false });
  /*
   * Perechea: regula de citire a magazinului. Daca se schimba acolo, ecranul ar arata
   * alta stare decat vad clientii, iar prima salvare ar schimba magazinul pe tacute.
   */
  const magazin = sursa("src/components/storefront/sections/_shared/header-settings.ts");
  assert.match(magazin, /features\.floating_call === true/);
  assert.match(magazin, /features\.floating_whatsapp !== false/);
});

test("valorile lipsa din rand devin text gol, iar retelele necunoscute nu intra", () => {
  const d = dateleMagazinuluiDinRand({ social: { instagram: "https://instagram.com/x", website: "https://x.ro", tiktok: 5 } });
  assert.deepEqual(d.social, { instagram: "https://instagram.com/x" });
  assert.equal(d.store_name, "");
  assert.equal(d.whatsapp, "");
});

/* ─────────────── cusatura: actiunea de server ─────────────── */

/** Corpul unei functii exportate, pana la urmatorul `export`. */
function corpul(fisier: string, nume: string): string {
  const s = sursa(fisier);
  const start = s.indexOf(`export async function ${nume}(`);
  assert.ok(start >= 0, `${nume} nu exista in ${fisier}`);
  const urmator = s.indexOf("\nexport ", start + 10);
  return s.slice(start, urmator < 0 ? undefined : urmator);
}

test("⚠⚠ updateGeneralSettings scrie in baza ce a iesit din `pregatesteDateleGenerale`, nu ce a trimis browserul", () => {
  const corp = corpul("src/lib/actions/store.actions.ts", "updateGeneralSettings");
  assert.match(corp, /const pregatite = pregatesteDateleGenerale\(date\)/);
  assert.match(corp, /if \(!pregatite\.ok\) return \{ error: pregatite\.eroare \}/);
  // Provenienta: `date` nu se mai foloseste nicaieri dupa pregatire.
  const dupa = corp.slice(corp.indexOf("pregatesteDateleGenerale(date)") + 30);
  assert.doesNotMatch(dupa, /\bdate\b/, "`date` din browser apare dupa pregatire");
  const update = corp.slice(corp.indexOf('.from("businesses").update('));
  assert.match(update, /\.\.\.pregatite\.coloane/);
  // `features` si `social` se imbina peste randul CITIT din baza, nu peste o copie din browser.
  assert.match(corp, /\.select\("id, slug, features, social"\)/);
  assert.match(update, /social: imbinaRetelele\(biz\.social, pregatite\.retele\)/);
  assert.match(update, /features: imbinaButoanele\(biz\.features, pregatite\.butoane\)/);
});
