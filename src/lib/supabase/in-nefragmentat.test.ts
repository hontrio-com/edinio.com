import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * Proba care ar fi prins defectul VetDepo (21.08).
 *
 * ═══ CE S-A INTAMPLAT ═══
 *
 * Un comerciant a schimbat pretul la 1051 de produse dintr-o actiune in masa.
 * `bulkProductAction` a chemat cum trebuie `enqueueTrendyolSyncMany(businessId,
 * ids)`, dar coada facea `.in("product_id", ids)` cu toate cele 1051 de id-uri
 * intr-o singura cerere.
 *
 * `.in(...)` NU pleaca in corpul cererii, ci in ADRESA. Masurat pe proiectul real
 * (vezi `id-chunks.ts`): peste ~650 de id-uri, marginea respinge cererea cu un
 * 400 in text simplu. Iar `catch {}` de dedesubt a inghitit esecul.
 *
 * Rezultatul: preturile s-au schimbat in magazin, la Trendyol au ramas cele
 * vechi, in panou nu scria nimic, si s-a aflat abia cand a intrebat comerciantul,
 * dupa o zi.
 *
 * ═══ DE CE O PROBA CARE CITESTE FISIERE ═══
 *
 * Fiindca defectul nu se vede nici la citit, nici la rulat. Cu 200 de produse
 * merge; cade abia peste 650, adica exact la magazinele mari, adica exact acolo
 * unde doare. Nicio proba obisnuita nu l-ar fi prins fara sa cheme platforma cu
 * mii de id-uri.
 *
 * ⚠ Se uita DOAR la cozile de sincronizare. Ele primesc, prin constructie, liste
 * de id-uri de marimea catalogului, venite din actiunile in masa. Restul codului
 * cheama `.in()` cu liste marunte si n-are rost sa fie legat de regula asta.
 */

const COZI = "src/lib";

/**
 * Sursa fara comentarii.
 *
 * ⚠ Proba a cazut o data pe propriile ei explicatii: comentariul care descrie
 * defectul contine chiar `.in("product_id", ids)` si `catch {}`, iar tiparele de
 * mai jos le gaseau acolo. O proba care se uita la text trebuie sa se uite la
 * COD, altfel singurul fel de a o trece e sa nu scrii de ce exista.
 */
function faraComentarii(sursa: string): string {
  return sursa.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fisiereDeCoada(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(COZI)) {
    const cale = join(COZI, dir, "queue.ts");
    try {
      if (statSync(cale).isFile()) out.push(cale);
    } catch {
      /* directorul n-are coada */
    }
  }
  return out;
}

test("exista cozile de sincronizare pe care le pazeste proba", () => {
  /* Daca se redenumeste vreodata directorul cozilor, proba de mai jos ar trece
     degeaba, uitandu-se la o lista goala. */
  const cozi = fisiereDeCoada();
  assert.ok(cozi.length >= 3, `am gasit doar ${cozi.length} cozi: ${cozi.join(", ")}`);
});

test("nicio coada nu cheama .in() cu lista intreaga de id-uri", () => {
  for (const cale of fisiereDeCoada()) {
    const sursa = faraComentarii(readFileSync(cale, "utf8"));

    /*
     * Se cauta `.in("ceva", X)` unde X e chiar variabila cu toate id-urile.
     * Formele taiate corect trec o BUCATA, deci numele difera (`bucata`, `lot`).
     */
    const suspecte = [...sursa.matchAll(/\.in\(\s*"[^"]+"\s*,\s*(\w+)\s*\)/g)]
      .map((m) => m[1])
      .filter((v) => ["ids", "productIds", "toate", "idsuri"].includes(v));

    assert.equal(
      suspecte.length,
      0,
      `${cale}: .in(..., ${suspecte.join("/")}) primeste lista intreaga. ` +
        "Taie-o cu `bucatiDeIduri` din `lib/supabase/id-chunks.ts`: peste ~650 de " +
        "id-uri adresa e respinsa la margine, iar esecul nu se vede nicaieri.",
    );
  }
});

test("nicio coada nu inghite un esec fara sa lase urma", () => {
  /*
   * `catch {}` gol e ce a facut defectul invizibil o zi intreaga. Punerea in coada
   * are voie sa NU arunce in apelant, dar nu are voie sa taca: fara o urma in
   * `error_logs`, un esec de sincronizare nu se afla decat de la comerciant.
   */
  for (const cale of fisiereDeCoada()) {
    const sursa = faraComentarii(readFileSync(cale, "utf8"));
    const goale = [...sursa.matchAll(/catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*)*\}/g)];
    assert.equal(
      goale.length,
      0,
      `${cale}: are ${goale.length} \`catch\` care nu lasa nicio urma. ` +
        "Scrie esecul in `error_logs`, altfel o sincronizare cazuta nu se afla " +
        "decat cand intreaba comerciantul de ce nu i s-au dus preturile.",
    );
  }
});
