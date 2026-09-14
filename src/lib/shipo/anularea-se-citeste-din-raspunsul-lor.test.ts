import test from "node:test";
import assert from "node:assert/strict";
import { anuleaza, type ShipoConfig } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ANULAREA SE CITESTE DIN RASPUNSUL LOR, NU DIN TEXT BRUT       (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `anuleaza` cauta „not found" in mesajul ORICAREI erori si il citea drept „expedierea nu mai e
 * acolo, deci e ca si anulata". Dar mesajul nu vine intotdeauna de la Shipo: cand corpul nu se
 * poate parsa, `descrieEroarea` cade pe textul BRUT. O pagina de eroare a unui intermediar,
 * servita cu 500 si cu „404 Not Found" in titlu, stergea astfel AWB-ul de pe o expediere VIE,
 * aflata pe drum, iar comanda ramanea libera sa emita a doua.
 *
 * ⚠ ACELASI DEFECT A FOST TRAIT SI REPARAT LA PALL-EX, unde a ramas si proba care il prinde
 * (`pallex/client.test.ts`). Aici era inca deschis.
 *
 * ⚠ SI DE CE NU S-A REPARAT COPIIND FORMA DE ACOLO. La Pall-Ex hotararea se ia pe STATUS (404).
 * La Shipo statusul minte in amandoua sensurile: un „Shipment not found" adevarat soseste cu HTTP
 * 200 si `success:false`, iar un 404 cu HTML de intermediar e tot 404. Si nici verdictul furnizorului
 * nu ajunge: acel 200 fara lista de erori e clasificat `necunoscut` pe o scriere, deci cerand
 * `esuat` s-ar fi refuzat tocmai cazul cinstit, si comerciantul ar fi ramas cu un AWB mort pe
 * comanda si fara niciun buton care sa-l scoata. (Defectul acela a fost trait la Packeta.)
 *
 * Ce desparte cu adevarat cele doua cazuri e DACA TEXTUL VINE DIN JSON-UL LOR. Fiecare pereche de
 * mai jos tine statusul fix si schimba doar felul corpului, ca afirmatia sa nu poata fi trecuta
 * din intamplare de o regula pe status.
 */

const CFG = { enabled: true, api_key: "cheie-de-proba" } as unknown as ShipoConfig;

/** `fetch` inlocuit, ca in `ciorna-de-la-credit-se-reia.test.ts`. */
function fetchFals(raspuns: { status: number; corp: string; tip?: string }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (intrare: unknown) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    /* Autentificarea sta in fata oricarei cereri; ii raspundem ca sa ajungem la cea care conteaza. */
    if (url.includes("/auth")) {
      return new Response(JSON.stringify({ access_token: "jeton-de-proba" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(raspuns.corp, {
      status: raspuns.status,
      headers: { "Content-Type": raspuns.tip ?? "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

async function anulareaCu(raspuns: { status: number; corp: string; tip?: string }) {
  const inapoi = fetchFals(raspuns);
  try {
    return { rod: await anuleaza(CFG, "AWB123"), aruncat: null as unknown };
  } catch (e) {
    return { rod: null, aruncat: e };
  } finally {
    inapoi();
  }
}

const HTML_404 = '<html><head><title>404 Not Found</title></head><body>nginx</body></html>';

/* ── 1. Perechea care tine statusul fix si schimba doar corpul ────────────── */

test("⚠⚠ 500 cu pagina HTML care contine „404 Not Found” NU sterge AWB-ul", () => {
  /*
   * ⚠ AFIRMATIA PENTRU CARE EXISTA FISIERUL. Citit ca anulare, coletul ramane pe drum si nimeni
   * nu mai stie pe ce AWB, iar comanda poate emite al doilea.
   */
  return anulareaCu({ status: 500, corp: HTML_404, tip: "text/html" }).then(({ rod, aruncat }) => {
    assert.equal(rod, null, "o pagina de eroare a fost citita drept anulare reusita");
    assert.ok(aruncat instanceof Error);
  });
});

test("⚠⚠ si 404 cu pagina HTML, la fel: statusul singur nu e dovada", () => {
  /*
   * Perechea celei de mai jos. Acelasi 404, alt fel de corp. Daca reparatia s-ar fi facut pe
   * status, cum e la Pall-Ex, cazul asta ar fi trecut drept anulare.
   */
  return anulareaCu({ status: 404, corp: HTML_404, tip: "text/html" }).then(({ rod, aruncat }) => {
    assert.equal(rod, null, "un 404 de la un intermediar a fost citit drept anulare reusita");
    assert.ok(aruncat instanceof Error);
  });
});

test("⚠⚠ 502 cu JSON VALID care spune „shipment not found” NU sterge AWB-ul", () => {
  /*
   * ⚠ EXEMPLUL UNUI AUDIT EXTERN, SI PRIMA MEA REPARATIE IL LASA SA TREACA.
   *
   * Marcajul „corpul a fost JSON" deosebea raspunsul lor de o pagina HTML, dar un gateway, un WAF
   * sau un balansor pot raspunde JSON. Parsarea reusita nu dovedeste nici originea, nici forma.
   * De aceea se cere acum si statusul 200.
   */
  return anulareaCu({
    status: 502,
    corp: JSON.stringify({ success: false, message: "502 Bad Gateway: shipment not found" }),
  }).then(({ rod, aruncat }) => {
    assert.equal(rod, null, "un 502 cu corp JSON a fost citit drept anulare reusita");
    assert.ok(aruncat instanceof Error);
  });
});

test("⚠ 404 cu JSON NU mai inseamna anulata, si asta e o retragere a mea", () => {
  /*
   * ⚠ PROBA ASTA CEREA, PANA ACUM, EXACT PE DOS.
   *
   * Scrisesem ca un 404 cu corpul lor in JSON inseamna „nu mai e acolo, deci anulata". Am adaugat
   * cazul pe rationamentul meu, nu pe documentatie, si asa am LARGIT contractul dincolo de ce pot
   * dovedi. Documentatia lor arata raspunsurile de afaceri ale anularii ca HTTP 200.
   *
   * Directia contează: refuzand, ramane un AWB pe comanda si omul mai apasa o data. Acceptand
   * gresit, se detaseaza AWB-ul unei expedieri VII, aflate pe drum, si comanda poate emite a doua.
   */
  return anulareaCu({
    status: 404,
    corp: JSON.stringify({ success: false, message: "Shipment not found" }),
  }).then(({ rod, aruncat }) => {
    assert.equal(rod, null, "un 404 a fost citit drept anulare reusita");
    assert.ok(aruncat instanceof Error);
  });
});

/* ── 2. Cazul cinstit care ar fi cazut sub o regula pe verdict ────────────── */

test("⚠⚠ 200 cu `success:false` si „Shipment not found” inseamna ANULATA", () => {
  /*
   * ⚠ ASTA E JUMATATEA CARE APARA COMERCIANTUL. Raspunsul asta e clasificat `necunoscut` pe o
   * scriere, fiindca n-are lista de erori. Daca reparatia ar fi cerut un refuz DOVEDIT, aici ar fi
   * aruncat, iar omul ar fi ramas cu un AWB mort pe comanda si fara niciun buton care sa-l scoata.
   */
  return anulareaCu({
    status: 200,
    corp: JSON.stringify({ success: false, message: "Shipment not found" }),
  }).then(({ rod }) => {
    assert.deepEqual(rod, { anulat: true, eraDejaAnulat: true });
  });
});

test("⚠⚠ 200 cu corp NECITIBIL care spune „not found” tot NU sterge AWB-ul", () => {
  /*
   * ⚠ PLASA CARE TINE MARCAJUL VIU.
   *
   * Masurat cu mutanti: de cand se cere statusul 200, marcajul „corpul a fost JSON" nu mai are ce
   * omori pe drumurile de azi, fiindca 200 se ataseaza numai acolo unde corpul E parsat. Dar daca
   * cineva ataseaza vreodata un status si pe aruncarea cu corp necitibil, o pagina de intermediar
   * servita cu 200 ar intra drept „deja anulata". Afirmatia asta cade in clipa aia.
   */
  return anulareaCu({ status: 200, corp: "<html>shipment not found</html>", tip: "text/html" })
    .then(({ rod, aruncat }) => {
      assert.equal(rod, null, "un corp necitibil servit cu 200 a fost citit drept anulare reusita");
      assert.ok(aruncat instanceof Error);
    });
});

test("⚠ anularea care chiar reuseste ramane o anulare, nu o «era deja»", () => {
  return anulareaCu({ status: 200, corp: JSON.stringify({ success: true }) }).then(({ rod }) => {
    assert.deepEqual(rod, { anulat: true, eraDejaAnulat: false });
  });
});

/* ── 3. Controlul negativ: JSON-ul lor, dar fara „not found" ──────────────── */

test("⚠ un esec adevarat al lor NU devine anulare doar fiindca vine in JSON", () => {
  /*
   * Fara randul asta, marcajul „corpul a fost JSON" ar fi putut fi citit gresit drept „orice vine
   * in JSON e o anulare". El nu inlocuieste tiparul, doar il face de incredere.
   */
  return anulareaCu({
    status: 500,
    corp: JSON.stringify({ success: false, message: "Internal server error" }),
  }).then(({ rod, aruncat }) => {
    assert.equal(rod, null, "un 500 al lor a fost citit drept anulare reusita");
    assert.ok(aruncat instanceof Error);
  });
});
