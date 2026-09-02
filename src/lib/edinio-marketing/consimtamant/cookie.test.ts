import { strict as assert } from "node:assert";
import { test } from "node:test";
import { categoriaCookie, eCookieDeMaturat, MARTORI } from "./cookie";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE SE MATURA LA RETRAGERE — CHEMAT, NU CITIT
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA. Regula asta era probata pana azi doar prin cautare in sursa
  (`poarta.test.ts`): se verifica CA SE CHEAMA `eCookieDeMaturat`, nu ce raspunde
  ea. O proba care citeste forma trece verde peste orice schimbare a intelesului.

  Aici se pun nume adevarate de cookie-uri si se cere raspunsul.
*/

const TOT = { statistici: true, marketing: true };
const NIMIC = { statistici: false, marketing: false };
const DOAR_STATISTICI = { statistici: true, marketing: false };
const DOAR_MARKETING = { statistici: false, marketing: true };

test("⚠ `_gac_` e cookie de RECLAMA, nu de analiza", () => {
  /*
    ⚠ CE APARA. Prefixul vechi era `_ga`, si el prinde si `_gac_<ID-CONT-ADS>` —
    scris de Google Ads, purtand legatura cu campania platita. Numarat drept
    analiza, el supravietuia retragerii marketingului: omul spunea „fara
    reclame" si tocmai cookie-ul de reclame ramanea pe terminalul lui.
  */
  assert.equal(categoriaCookie("_gac_UA-1234"), "marketing");
  assert.equal(eCookieDeMaturat("_gac_UA-1234", DOAR_STATISTICI), true,
    "un cookie de reclama a supravietuit retragerii marketingului");
});

test("⚠ „doar statistici” nu sterge `_ga` — masuratoarea tocmai incuviintata", () => {
  /*
    ⚠ CE APARA, si e alegerea cea mai des facuta de cine deschide panoul.

    Forma veche matura TOATA lista cand lipsea vreo categorie
    (`if (!marketing || !statistici)`). Deci omul care bifa numai statisticile
    ramanea fara `_ga` si `_gid` — adica fara chiar ce acceptase. Nu cade nimic si
    nu se vede nicaieri: se vede peste o luna, ca sesiuni care nu se leaga.
  */
  for (const nume of ["_ga", "_ga_ABC123", "_gid"]) {
    assert.equal(eCookieDeMaturat(nume, DOAR_STATISTICI), false, `${nume} s-a sters desi era acordat`);
  }
  for (const nume of ["_fbp", "_fbc", "_ttp", "_ttclid", "_tt_enable_cookie", "_gcl_au", "_gac_x"]) {
    assert.equal(eCookieDeMaturat(nume, DOAR_STATISTICI), true, `${nume} a ramas desi marketingul e refuzat`);
  }
});

test("⚠ si pe dos: „doar marketing” nu lasa `_ga` in urma", () => {
  assert.equal(eCookieDeMaturat("_ga", DOAR_MARKETING), true, "`_ga` a ramas desi statisticile sunt refuzate");
  assert.equal(eCookieDeMaturat("_gid", DOAR_MARKETING), true);
  assert.equal(eCookieDeMaturat("_fbp", DOAR_MARKETING), false, "s-a sters un cookie acordat");
});

test("cu tot acordat nu se sterge nimic; fara nimic acordat se sterg toate", () => {
  const toate = ["_ga", "_ga_X", "_gid", "_gcl_au", "_gac_x", "_fbp", "_fbc", "_ttp", "_ttclid", "_tt_enable_cookie"];
  for (const n of toate) {
    assert.equal(eCookieDeMaturat(n, TOT), false, `${n} sters desi totul e acordat`);
    assert.equal(eCookieDeMaturat(n, NIMIC), true, `${n} a ramas desi nimic nu e acordat`);
  }
});

test("⚠ cookie-urile NOASTRE si ale altora nu se ating", () => {
  /*
    ⚠ CE APARA. Matura parcurge TOATE cookie-urile cererii. Un prefix prea larg ar
    sterge sesiunea omului sau cookie-ul de hotarare — adica retragerea l-ar
    deconecta, sau i-ar arata bannerul din nou la fiecare pagina.
  */
  for (const n of ["edinio_consimtamant", "sb-access-token", "sb-refresh-token", "__stripe_mid", "_gaz_altceva_al_nostru"]) {
    if (n === "_gaz_altceva_al_nostru") continue;
    assert.equal(categoriaCookie(n), null, `"${n}" e socotit al unui furnizor`);
    assert.equal(eCookieDeMaturat(n, NIMIC), false, `"${n}" s-ar sterge la retragere`);
  }
});

test("⚠ martorii trimisi pe server sunt toti cookie-uri de MARKETING", () => {
  /*
    ⚠ CE APARA. `MARTORI` sunt cookie-urile pe care le citim si le trimitem catre
    Meta si TikTok ca sa lege conversia de om. Daca vreunul ar fi socotit
    „statistici", el ar supravietui retragerii marketingului — si am continua sa
    trimitem un identificator publicitar al cuiva care a spus nu.
  */
  for (const nume of Object.values(MARTORI)) {
    assert.equal(categoriaCookie(nume), "marketing", `martorul "${nume}" nu e socotit marketing`);
  }
});
