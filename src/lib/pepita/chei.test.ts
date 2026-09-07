import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { adresaComenzi, adresaFeedProduse, adresaFeedStoc, amprentaCheii, cheieNoua, magazinulCheii } from "./chei";

const BID = "99999999-8888-7777-6666-555555555555";

/**
 * O baza care tine minte CE a fost intrebata.
 *
 * ⚠ Asta e chiar ce se probeaza la plafon: nu doar ca raspunsul e „nu", ci ca intrebarea
 * nici nu s-a pus. Un sir din adresa care ajunge pana la baza inseamna ca o rafala ieftina
 * devine trafic in baza de date.
 */
function faceBaza(randuri: { amprenta: string; fel: string; business_id: string }[]) {
  const intrebari: { filtre: [string, unknown][] }[] = [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = () => {
    const filtre: [string, unknown][] = [];
    const c = { filtre };
    intrebari.push(c);
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      is: () => b,
      maybeSingle: () => {
        const amprenta = filtre.find((x) => x[0] === "amprenta")?.[1];
        const fel = filtre.find((x) => x[0] === "fel")?.[1];
        const gasit = randuri.find((r) => r.amprenta === amprenta && r.fel === fel);
        return Promise.resolve({ data: gasit ?? null, error: null });
      },
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { db: { from: () => builder() } as unknown as SupabaseClient<Database>, intrebari };
}

test("cheia noua e lunga, imprevizibila si sigura intr-o adresa", () => {
  const a = cheieNoua();
  const b = cheieNoua();
  assert.notEqual(a, b);
  /* 32 de octeti in base64url: 43 de caractere, fara `+`, `/` sau `=`. */
  assert.equal(a.length, 43);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.equal(encodeURIComponent(a), a, "nu are ce sa se strice la codarea adresei");
});

test("⚠ amprenta nu se poate intoarce la cheie, si e stabila", () => {
  const c = cheieNoua();
  assert.equal(amprentaCheii(c), amprentaCheii(c));
  assert.match(amprentaCheii(c), /^[0-9a-f]{64}$/);
  assert.ok(!amprentaCheii(c).includes(c.slice(0, 8)), "nimic din cheie nu se vede in amprenta");
});

test("cheia buna deschide felul ei", async () => {
  const cheie = cheieNoua();
  const { db } = faceBaza([{ amprenta: amprentaCheii(cheie), fel: "feed", business_id: BID }]);
  assert.deepEqual(await magazinulCheii(db, "feed", cheie), { businessId: BID, fel: "feed" });
});

test("⚠ cheia de FEED nu deschide adresa de COMENZI", async () => {
  /*
   * Cheia de feed ajunge in mesaje catre Pepita si se afiseaza pe ecran. Daca ar deschide si
   * adresa care CREEAZA comenzi, orice copie a mesajului aceluia ar fi o cale de a inventa
   * comenzi si de a scadea stocul altcuiva.
   */
  const cheie = cheieNoua();
  const { db } = faceBaza([{ amprenta: amprentaCheii(cheie), fel: "feed", business_id: BID }]);
  assert.equal(await magazinulCheii(db, "comenzi", cheie), null);
});

test("cheia necunoscuta nu deschide nimic", async () => {
  const { db } = faceBaza([{ amprenta: amprentaCheii(cheieNoua()), fel: "feed", business_id: BID }]);
  assert.equal(await magazinulCheii(db, "feed", cheieNoua()), null);
});

test("⚠ un sir care nu are forma unei chei nu ajunge niciodata la baza", async () => {
  /*
   * Fara verificarea de forma, orice gunoi din adresa ar porni o interogare. Adresele astea
   * sunt publice prin definitie (Pepita nu se poate autentifica altfel), deci o rafala pe
   * chei inventate ar deveni trafic in baza de date, platit de noi.
   */
  const { db, intrebari } = faceBaza([]);
  for (const rau of ["", "   ", "abc", "../../etc/passwd", "a".repeat(200), "cheie cu spatii", "chei+cu/semne="]) {
    assert.equal(await magazinulCheii(db, "feed", rau), null, `pentru „${rau}”`);
  }
  assert.equal(intrebari.length, 0, "niciuna dintre ele n-a ajuns la baza");
});

test("⚠ o citire cazuta ARUNCA, ca ruta sa poata raspunde 503 in loc de 404", async () => {
  /*
   * 404 i-ar spune lui Pepita „feedul asta nu exista", si ar putea scoate catalogul de la
   * vanzare pentru o pana de doua secunde. 503 inseamna „mai incearca".
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const b: any = {
    select: () => b, eq: () => b, is: () => b,
    maybeSingle: () => Promise.resolve({ data: null, error: { message: "conexiune pierduta" } }),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const db = { from: () => b } as unknown as SupabaseClient<Database>;
  await assert.rejects(() => magazinulCheii(db, "feed", cheieNoua()));
});

test("⚠ toate cele trei adrese stau pe domeniul platformei, nu pe al magazinului", () => {
  /*
   * Un comerciant isi poate schimba sau pierde domeniul propriu, iar adresele date odata
   * catre Pepita ar muri atunci in tacere: comenzile ar inceta sa mai ajunga si nimeni n-ar
   * apasa nimic.
   */
  const c = cheieNoua();
  for (const a of [adresaFeedProduse(c), adresaFeedStoc(c), adresaComenzi(c)]) {
    assert.match(a, /^https:\/\/www\.edinio\.com\/api\/pepita\//);
    assert.ok(a.includes(c), "cheia e in cale");
    assert.ok(!a.includes("?"), "si nu in sirul de interogare");
  }
  assert.match(adresaFeedProduse(c), /\.xml$/);
  assert.match(adresaFeedStoc(c), /\.xml$/);
});
