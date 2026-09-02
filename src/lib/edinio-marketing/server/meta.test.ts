import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sarcinaMeta, eRefuzMeta, type SarcinaMeta } from "./sarcina-meta";
import { catreMeta } from "../adaptor-meta";
import { externalId } from "./amprenta-om";
import { readFileSync } from "node:fs";

const CTX = { ip: "81.196.1.1", userAgent: "Mozilla/5.0", url: "https://www.edinio.com/", referrer: null };
const PIXEL = "2070597336770282";
const cap = (x: SarcinaMeta) => x.data[0] as Record<string, unknown>;

/*
  ═══════════════════════════════════════════════════════════════════════════════
  MESAJUL CATRE META, CONSTRUIT PE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ MASURAT IMPOTRIVA SERVERULUI LOR pe 02.09.2026: raspunsul brut la un
  `generate_lead` construit de codul asta a fost
  `{"events_received":1,"messages":[],"fbtrace_id":"..."}` — deci forma de mai jos
  nu e presupusa, e primita.
*/

test("⚠ `page_view` NU pleaca de pe server — pixelul lor il trage singur", () => {
  /*
    ⚠ Masurat pe 01.09.2026: pixelul Meta trage `PageView` la fiecare schimbare de
    pagina intr-o aplicatie de o pagina. Trimis si de aici, s-ar numara de doua ori
    — si nimic din rapoarte n-ar arata de ce traficul pare dublu.
  */
  const m = sarcinaMeta(
    { name: "page_view", page_location: "https://www.edinio.com/" },
    CTX, PIXEL, "om-1",
  );
  assert.ok(eRefuzMeta(m), "page_view a plecat catre Meta");
  assert.match(m.motiv, /cartografiere/, "refuzul nu spune de ce");
});

test("⚠ serverul trimite EXACT numele pe care le trimite si browserul", () => {
  /*
    ⚠ CE APARA. Doua tabele de cartografiere ar incepe identic si s-ar desparti la
    prima schimbare. Atunci acelasi eveniment ar pleca sub doua nume, iar
    deduplicarea dintre browser si server n-ar mai avea ce uni: Meta ar numara
    fiecare inscriere de doua ori.
  */
  const evenimente = [
    { name: "sign_up", signup_origin: "email", event_id: "e1" },
    { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "e2" },
    { name: "trial_start", plan_id: "start", event_id: "e3" },
  ] as const;

  for (const ev of evenimente) {
    const dinBrowser = catreMeta(ev);
    const dinServer = sarcinaMeta(ev, CTX, PIXEL, "om-1");
    assert.ok(dinBrowser, `${ev.name}: browserul nu-l mai trimite`);
    assert.ok(!eRefuzMeta(dinServer), `${ev.name}: serverul l-a refuzat`);
    assert.equal(cap(dinServer as SarcinaMeta).event_name, dinBrowser.nume, `${ev.name}: nume deosebite`);
    assert.equal(cap(dinServer as SarcinaMeta).event_id, dinBrowser.eventID, `${ev.name}: event_id deosebit`);
  }
});

test("⚠ `action_source` exista — fara el mesajul e respins", () => {
  const m = sarcinaMeta({ name: "sign_up", signup_origin: "email", event_id: "e1" }, CTX, PIXEL, "om-1");
  assert.ok(!eRefuzMeta(m));
  assert.equal(cap(m as SarcinaMeta).action_source, "website");
});

test("⚠ `user_data` are intotdeauna cel putin amprenta", () => {
  /*
    ⚠ Meta cere cel putin un camp despre om. Fara niciunul, evenimentul e primit
    si aruncat la ei — deci raspunsul ar arata ca a mers.
  */
  const m = sarcinaMeta({ name: "sign_up", signup_origin: "email", event_id: "e1" },
    { ip: null, userAgent: null, url: null, referrer: null }, PIXEL, "om-1");
  assert.ok(!eRefuzMeta(m));
  const u = cap(m as SarcinaMeta).user_data as Record<string, unknown>;
  assert.equal(u.external_id, externalId("om-1"));
  assert.deepEqual(Object.keys(u), ["external_id"], "s-au trimis campuri goale");
});

test("⚠ niciun email pleaca spre Meta, nici cu hash", () => {
  /*
    ⚠ E O HOTARARE, NU O SCAPARE. Un email cu hash ar creste mult potrivirea, dar
    are urmari legale si tine de politica de confidentialitate. Pana la o hotarare
    a proprietarului, campurile lor de identitate raman goale.
  */
  const m = sarcinaMeta(
    { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "e2" },
    CTX, PIXEL, "ion@exemplu.ro",
  );
  assert.ok(!eRefuzMeta(m));
  const text = JSON.stringify(m);
  assert.ok(!text.includes("ion@exemplu.ro"), "emailul a plecat in clar");
  const u = cap(m as SarcinaMeta).user_data as Record<string, unknown>;
  for (const camp of ["em", "ph", "fn", "ln"]) {
    assert.equal(u[camp], undefined, `campul de identitate "${camp}" a fost completat`);
  }
});

test("`event_time` e clipa petrecerii, in secunde", () => {
  const acumTreiOre = new Date(Date.now() - 3 * 3600_000).toISOString();
  const m = sarcinaMeta({ name: "sign_up", signup_origin: "email", event_id: "e1" },
    CTX, PIXEL, "om-1", acumTreiOre);
  assert.ok(!eRefuzMeta(m));
  const t = cap(m as SarcinaMeta).event_time as number;
  assert.ok(Math.abs(t - Math.floor(Date.parse(acumTreiOre) / 1000)) <= 1, "nu urmeaza clipa data");
  assert.ok(t < Math.floor(Date.now() / 1000) - 3600, "a ramas lipit de ceasul trimiterii");
});

test("o valoare fara moneda nu pleaca", () => {
  const m = sarcinaMeta(
    { name: "purchase", plan_id: "start", billing_period: "monthly", value: 99, currency: "", event_id: "e9" } as never,
    CTX, PIXEL, "om-1",
  );
  assert.ok(eRefuzMeta(m), "valoarea fara moneda a plecat");
  assert.match(m.motiv, /moneda/);
});

test("fara id de pixel nu se trimite nimic, si se spune de ce", () => {
  const m = sarcinaMeta({ name: "sign_up", signup_origin: "email", event_id: "e1" }, CTX, "", "om-1");
  assert.ok(eRefuzMeta(m));
  assert.match(m.motiv, /pixel/);
});

/* ═══ Potrivirea: cine e omul, si martorii lasati de pixel ═══ */

test("⚠ martorii din browser ajung la Meta sub numele lor", () => {
  /*
    ⚠ DE CE CONTEAZA MAI MULT DECAT AMPRENTA NOASTRA. `_fbc` poarta chiar id-ul
    clicului pe reclama — adica legatura directa intre conversie si campania
    platita. Fara el, Meta stie ca cineva s-a inscris, dar nu de la ce reclama.

    ⚠ Si nu adauga nicio hotarare legala noua: cookie-urile astea exista NUMAI
    daca pixelul a rulat, adica numai dupa ce omul a acordat marketing.
  */
  const m = sarcinaMeta(
    { name: "sign_up", signup_origin: "email", event_id: "e1" },
    CTX, PIXEL, "om-1", undefined,
    { fbp: "fb.1.123.456", fbc: "fb.1.123.AbCd" },
  );
  assert.ok(!eRefuzMeta(m));
  const u = cap(m as SarcinaMeta).user_data as Record<string, unknown>;
  assert.equal(u.fbp, "fb.1.123.456");
  assert.equal(u.fbc, "fb.1.123.AbCd");
});

test("un martor lipsa lipseste, nu pleaca gol", () => {
  const m = sarcinaMeta(
    { name: "sign_up", signup_origin: "email", event_id: "e1" },
    CTX, PIXEL, "om-1", undefined, { fbp: "fb.1.1.1" },
  );
  assert.ok(!eRefuzMeta(m));
  const u = cap(m as SarcinaMeta).user_data as Record<string, unknown>;
  assert.equal(u.fbp, "fb.1.1.1");
  assert.ok(!("fbc" in u), "un camp gol a plecat ca afirmatie despre ce nu stim");
});

test("⚠ amprenta omului NU mai e id-ul evenimentului la formularele de lead", () => {
  /*
    ═══ ⚠ DOUA INTREBARI DEOSEBITE, UN SINGUR NUMAR ═══

    Pana pe 02.09.2026, contactul si migrarea trimiteau `amprentaOmului:
    idConversie` — adica FIX id-ul evenimentului. „Cine e omul" devenea un numar
    nou la fiecare cerere, deci `generate_lead` nu se putea lega NICIODATA de
    `sign_up`-ul aceluiasi om. Doua jumatati de palnie, doi oameni deosebiti.

    Proba citeste sursa, deci arata doar ca legatura e SCRISA. Ce chiar pleaca se
    masoara mai sus, pe mesajul construit.
  */
  for (const f of ["src/lib/actions/contact.actions.ts", "src/lib/actions/migration.actions.ts"]) {
    const cod = readFileSync(f, "utf8");
    const i = cod.indexOf("await puneLaCoada(");
    assert.ok(i > 0, `${f}: nu se mai pune la coada`);
    const bucata = cod.slice(i, i + 900);
    assert.match(bucata, /amprentaOmului: consim\?\.vid \?\? idConversie/,
      `${f}: amprenta omului a redevenit id-ul evenimentului`);
    assert.match(bucata, /martori: await martoriiCererii\(\)/,
      `${f}: martorii din browser nu mai pleaca`);
  }
});

test("⚠ transportul chiar duce martorii mai departe", () => {
  /*
    ⚠ VERIGA PE CARE PROBELE DE MAI SUS N-O VAD. Ele cheama `sarcinaMeta` direct,
    cu martorii dati de mana — deci ar fi ramas verzi si daca `trimiteMeta` uita
    sa-i mai paseze. Confruntata cu chiar mutantul asta, prima forma a trecut.

    Un lant se probeaza pe bucati SI pe imbinari; imbinarile sunt tocmai locul
    unde nimeni nu se uita.
  */
  for (const [f, apel] of [
    ["src/lib/edinio-marketing/server/trimite-meta.ts", "sarcinaMeta("],
    ["src/lib/edinio-marketing/server/trimite-tiktok.ts", "sarcinaTikTok("],
  ] as const) {
    const cod = readFileSync(f, "utf8");
    const i = cod.indexOf(apel);
    assert.ok(i > 0, `${f}: nu mai construieste mesajul`);
    const linie = cod.slice(i, cod.indexOf(";", i));
    assert.match(linie, /s\.martori/, `${f}: martorii se pierd la trimitere`);
    assert.match(linie, /s\.cand/, `${f}: clipa evenimentului se pierde la trimitere`);
  }
});
