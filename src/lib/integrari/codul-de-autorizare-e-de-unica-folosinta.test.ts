import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   CODUL DE AUTORIZARE E DE UNICA FOLOSINTA (29.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   Toate cele trei callback-uri OAuth — OLX, Google Merchant, Google Analytics — scriau
   configuratia OARBA si trimiteau omul inapoi cu „conectat", orice s-ar fi intamplat.

   Numai ca `exchangeCode` a consumat DEJA codul de autorizare: nu se mai poate schimba a doua
   oara. Deci o pana de o clipa la baza lasa starea cea mai proasta cu putinta:

       tokenul e emis la furnizor, dar la noi nu scrie nimic
       ecranul spune „conectat", fiindca redirectarea nu se uita la nimic
       comerciantul crede ca a terminat, si nimic nu merge
       iar reluarea cere alt cod, deci trebuie sa reia TOT dansul de autorizare

   ⚠ SI NU EXISTA NICIO PLASA: nu se scria nicaieri ce s-a pierdut, deci nici din jurnal nu se
   putea afla ca tokenul exista la ei si nu la noi.

   ⚠ Iar mesajul nou nu spune „conectarea a eșuat" — ar fi un neadevar, autorizarea chiar a mers.
   Spune ce s-a intamplat si ce are de facut, fiindca de data asta chiar trebuie s-o ia de la
   capat.
*/

const CAZURI = [
  {
    nume: "OLX",
    ruta: "src/app/api/olx/oauth/callback/route.ts",
    ecran: "src/components/dashboard/OlxClient.tsx",
    camp: "olx_config",
    prefix: "olx",
  },
  {
    nume: "Google Merchant",
    ruta: "src/app/api/google-merchant/oauth/callback/route.ts",
    ecran: "src/components/dashboard/GoogleMerchantClient.tsx",
    camp: "google_merchant_config",
    prefix: "gmc",
  },
  {
    nume: "Google Analytics",
    ruta: "src/app/api/google-analytics/oauth/callback/route.ts",
    ecran: "src/components/dashboard/GoogleAnalyticsClient.tsx",
    camp: "google_analytics_config",
    prefix: "ga",
  },
];

for (const c of CAZURI) {
  test(`⚠ ${c.nume}: scrierea conexiunii isi citeste raspunsul`, () => {
    const ruta = readFileSync(c.ruta, "utf8");
    /*
     * ⚠ Ancora cerea `const { error: eScris } = ss?.id ?`. De cand OLX scrie un PETIC ATOMIC prin
     * `jsonb_merge_config` — ca sa nu mai calce un token reimprospatat intre timp — ramura de
     * actualizare nu mai e o cerere PostgREST, ci un apel care arunca. Regula n-a schimbat-o nimic:
     * rezultatul se citeste si o scriere picata NU se raporteaza drept conectare.
     */
    assert.match(ruta, /const eScris = ss\?\.id|const \{ error: eScris \} = ss\?\.id/,
      "scrierea trebuie sa-si prinda eroarea, in amandoua ramurile");
    /* ⚠ Si o scriere picata NU se raporteaza drept conectare reusita. */
    assert.match(ruta, new RegExp(`if \\(eScris\\) \\{[\\s\\S]{0,220}?back\\(req, "${c.prefix}=save_failed"\\)`));
  });

  test(`⚠ ${c.nume}: nicio scriere de config nu mai merge oarba`, () => {
    /*
     * ⚠ Prima ancora cauta orice `await supabase.from("store_settings").update(...)` — si prindea
     * chiar codul REPARAT, fiindca ramurile ternarului arata la fel. Ce deosebeste o scriere pazita
     * de una oarba nu e forma cererii, ci ce se face cu raspunsul ei. Deci se cere ca FIECARE
     * scriere sa fie o ramura a atribuirii care prinde eroarea.
     */
    const ruta = readFileSync(c.ruta, "utf8");
    const scrieri = [...ruta.matchAll(/await supabase\s*\n?\s*\.?from\("store_settings"\)/g)];
    for (const m of scrieri) {
      const inainte = ruta.slice(Math.max(0, (m.index ?? 0) - 4), m.index);
      assert.match(inainte, /[?:(] $|[?:(]$/,
        `o scriere de config nu e ramura atribuirii care ii citeste eroarea: …${ruta.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 40)}`);
    }
    /*
     * ⚠ Si daca vreo ramura a trecut pe un petic atomic, tot trebuie sa-si citeasca rezultatul:
     * `patchOlxConfig` ARUNCA, deci se cere prins si transformat in acelasi `eScris`.
     */
    if (/patchOlxConfig\(/.test(ruta)) {
      assert.match(ruta, /catch \(e\) \{ return e as Error; \}/,
        "peticul atomic trebuie sa-si prinda aruncarea, nu s-o lase sa treaca");
    }
  });

  test(`⚠ ${c.nume}: omul afla ce s-a intamplat, si ca trebuie s-o ia de la capat`, () => {
    const ecran = readFileSync(c.ecran, "utf8");
    assert.match(ecran, /p === "save_failed"/, "ecranul trebuie sa cunoasca starea noua");
    /* ⚠ Si textul nu minte: autorizarea CHIAR a mers, ce n-a mers e salvarea. */
    assert.match(ecran, /Autorizarea la \w+ a mers, dar nu am putut salva conexiunea/);
    assert.match(ecran, /Apasă din nou pe conectare/);
  });
}
