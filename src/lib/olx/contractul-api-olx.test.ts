import test from "node:test";
import assert from "node:assert/strict";
import {
  addBusinessBanner, addBusinessLogo, addAdvertLogo, getBilling, getBusinessProfile,
  postThreadMessage, setThreadFavourite, suggestLocationByCoords, updateBusinessProfile,
} from "./client";

/* ══════════════════════════════════════════════════════════════════════════
   CONTRACTUL CU OLX: RUTA, PARAMETRII, SI NUMELE CAMPURILOR (01.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Toate probele de pana acum verificau logica noastra. Niciuna nu verifica ce PLEACA pe fir — si
   tocmai acolo s-au gasit patru greseli deodata:

       `POST /threads/{id}/commands/set-favourite`   -> ruta nu exista, butonul dadea 404
       `GET  /users/me/billing?offset=0&limit=30`    -> `offset` nu e parametrul lor
       `PUT  /users-business/me` cu `website`,`phone`,`address: string`
                                                     -> chei pe care ei nu le cunosc
       `GET  /cities?latitude=…`                     -> ruta buna e `/locations`

   ⚠ NICIUNA NU DADEA EROARE LA NOI. O cheie necunoscuta intr-un `PUT` nu se plange: pur si simplu
   nu schimba nimic, iar comerciantul crede ca a salvat. Un parametru ignorat intoarce alt raspuns
   decat cel cerut. Asta e clasa de defect pe care probele de logica n-o pot vedea NICIODATA.

   ⚠ CE DOVEDESTE FISIERUL ASTA, si ce nu. Dovedeste ca trimitem exact ce credem ca trimitem: ruta,
   verbul, parametrii si forma corpului. NU dovedeste ca OLX asteapta chiar aia — n-avem cont de
   probe si nu chemam reteaua. Formele sunt luate din documentatia lor; cand se schimba, aici e
   locul in care se scrie noul adevar, si tot aici pica proba daca cineva le muta pe furis.
*/

/** Ce a plecat pe fir la ultima chemare. */
function prinde() {
  const vechi = globalThis.fetch;
  const cereri: { url: string; metoda: string; corp: unknown }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    cereri.push({
      url: String(url),
      metoda: String(init?.method ?? "GET"),
      corp: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return {
      ok: true, status: 200,
      json: async () => ({ data: {} }),
      text: async () => JSON.stringify({ data: {} }),
      headers: new Headers(),
    };
  }) as unknown as typeof fetch;
  return { cereri, inapoi: () => { globalThis.fetch = vechi; } };
}

const T = "jeton-de-proba";

test("⚠ favorita: comanda merge in CORP, nu in adresa", async () => {
  /*
   * ⚠ Ruta `/threads/{id}/commands/set-favourite` nu exista. Butonul ⭐ raspundea `404` si nu facea
   * nimic — iar ecranul arata steaua aprinsa, fiindca marcam optimist.
   */
  const p = prinde();
  try {
    await setThreadFavourite(T, 123, true);
    assert.equal(p.cereri[0].url, "https://www.olx.ro/api/partner/threads/123/commands");
    assert.equal(p.cereri[0].metoda, "POST");
    assert.deepEqual(p.cereri[0].corp, { command: "set-favourite", is_favourite: true });
  } finally { p.inapoi(); }
});

test("⚠ facturare: `page`, si ea incepe de la UNU", async () => {
  /*
   * ⚠ `offset` nu e un parametru al lor aici. Ignorat, nu da eroare — da alt raspuns decat cel
   * cerut, si asta e mai greu de vazut decat un refuz.
   */
  const p = prinde();
  try {
    await getBilling(T, { page: 1, limit: 30 });
    assert.match(p.cereri[0].url, /\/users\/me\/billing\?page=1&limit=30$/);
    /* ⚠ Si nu se trimite niciodata `page=0`: numerotarea lor porneste de la unu. */
    p.cereri.length = 0;
    await getBilling(T, { page: 0, limit: 10 });
    assert.match(p.cereri[0].url, /page=1/);
  } finally { p.inapoi(); }
});

test("⚠ profil de firma: `website_url`, `phones[]`, adresa desfacuta", async () => {
  /*
   * ⚠ Erau `website`, `phone` si `address: string` — nume firesti, si niciunul al lor. Un `PUT` cu
   * chei necunoscute nu se plange: nu schimba nimic, si omul crede ca a salvat.
   */
  const p = prinde();
  try {
    await updateBusinessProfile(T, {
      name: "Firma SRL",
      website_url: "https://firma.ro",
      phones: ["0700000000", "0711111111"],
      address: { street: "Uzinei", number: "1", postcode: "400001", city: "Cluj-Napoca" },
    });
    const corp = p.cereri[0].corp as Record<string, unknown>;
    assert.equal(p.cereri[0].metoda, "PUT");
    assert.equal(p.cereri[0].url, "https://www.olx.ro/api/partner/users-business/me");
    assert.ok("website_url" in corp && !("website" in corp), "adresa web are numele LOR");
    assert.ok(Array.isArray(corp.phones), "telefoanele sunt o lista");
    assert.deepEqual(corp.address, { street: "Uzinei", number: "1", postcode: "400001", city: "Cluj-Napoca" });
    p.cereri.length = 0;
    await getBusinessProfile(T);
    assert.equal(p.cereri[0].url, "https://www.olx.ro/api/partner/users-business/me");
  } finally { p.inapoi(); }
});

test("⚠ localitate dupa coordonate: `/locations`, nu `/cities`", async () => {
  const p = prinde();
  try {
    await suggestLocationByCoords(T, 46.77, 23.59);
    assert.match(p.cereri[0].url, /\/locations\?latitude=46\.77&longitude=23\.59$/);
    assert.doesNotMatch(p.cereri[0].url, /\/cities/);
  } finally { p.inapoi(); }
});

test("⚠ logo si banner: rutele exista, si primesc o ADRESA", async () => {
  /*
   * ⚠ Ecranul spunea comerciantului ca „se schimba din contul tau de pe olx.ro" — o afirmatie
   * despre API-ul LOR, scrisa de noi, si falsa. E cel mai insidios fel de neadevar: nu se strica
   * nimic, si cine citeste mai tarziu il ia drept fapt.
   */
  const p = prinde();
  try {
    await addBusinessLogo(T, "https://cdn.edinio.com/logo.png");
    assert.equal(p.cereri[0].url, "https://www.olx.ro/api/partner/users-business/me/logos");
    assert.deepEqual(p.cereri[0].corp, { url: "https://cdn.edinio.com/logo.png" });
    p.cereri.length = 0;
    await addBusinessBanner(T, "https://cdn.edinio.com/banner.png");
    assert.equal(p.cereri[0].url, "https://www.olx.ro/api/partner/users-business/me/banners");
    p.cereri.length = 0;
    await addAdvertLogo(T, 77, "https://cdn.edinio.com/logo.png");
    assert.equal(p.cereri[0].url, "https://www.olx.ro/api/partner/adverts/77/logos");
  } finally { p.inapoi(); }
});

test("⚠ mesaj cu atasamente: `attachments: [{ url }]`, si numai `https`", async () => {
  const p = prinde();
  try {
    await postThreadMessage(T, 5, "Bună", ["https://cdn.edinio.com/a.jpg"]);
    assert.deepEqual(p.cereri[0].corp, {
      text: "Bună",
      attachments: [{ url: "https://cdn.edinio.com/a.jpg" }],
    });
    /*
     * ⚠ Cheia LIPSESTE cand n-avem ce trimite. Un `attachments: []` inseamna „am declarat o lista,
     * si e goala" — alt lucru decat „n-am declarat nimic", si nu stim ce fac ei cu deosebirea.
     */
    p.cereri.length = 0;
    await postThreadMessage(T, 5, "Doar text");
    assert.deepEqual(p.cereri[0].corp, { text: "Doar text" });
    /* ⚠ Si o adresa care nu e `https` nu pleaca: OLX vine s-o ia, deci trebuie sa fie publica. */
    p.cereri.length = 0;
    await postThreadMessage(T, 5, "x", ["javascript:alert(1)", "http://nesigur/a.jpg"]);
    assert.deepEqual(p.cereri[0].corp, { text: "x" });
  } finally { p.inapoi(); }
});

test("⚠ toate cererile poarta jetonul si versiunea ceruta de ei", async () => {
  /* ⚠ Fara `Version: 2.0` raspunsurile lor au alta forma, si nimic din ce citim n-ar mai fi acolo. */
  const vechi = globalThis.fetch;
  let antete: Record<string, string> = {};
  globalThis.fetch = (async (_u: string, init?: RequestInit) => {
    antete = (init?.headers ?? {}) as Record<string, string>;
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}", headers: new Headers() };
  }) as unknown as typeof fetch;
  try {
    await getBusinessProfile(T);
    assert.equal(antete.Authorization, `Bearer ${T}`);
    assert.equal(antete.Version, "2.0");
  } finally { globalThis.fetch = vechi; }
});
