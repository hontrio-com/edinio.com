import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { marfaAPlecatFaraBani, mesajulPentruComerciant } from "./marfa-a-plecat-fara-bani";
import { PAYMENT_PROCESSOR_TYPES } from "@/lib/payment-methods";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * MARFA A PLECAT SI BANII NU S-AU CONFIRMAT                  (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Netopia nu are nicio plasa, si ei o spun: `/operation/status` e in specificatia lor cu
 * descrierea „will be available at a future date". Starea unei plati nu se poate interoga, deci o
 * notificare pierduta e o plata pierduta, tacut.
 *
 * ⚠ Masurat, si de asta exista regula: doua comenzi EXPEDIATE si neplatite, cu id de tranzactie
 * Netopia, la `suporti-numar`: `#0104` (105,50 lei, de 32 de zile) si `#0156` (65,00 lei, de 22).
 * Ori clientul a platit si notificarea nu a ajuns, ori marfa a plecat neplatita. Nu se poate
 * lamuri din platforma. Cauza n-o putem repara; paguba TACUTA, da.
 */

const comanda = (p: Partial<Parameters<typeof marfaAPlecatFaraBani>[0]> = {}) => ({
  payment_method: "netopia",
  payment_status: "unpaid",
  status: "shipped",
  ...p,
});

describe("Cand se semnaleaza", () => {
  test("⚠⚠ expediata si neplatita, prin procesator online", () => {
    assert.equal(marfaAPlecatFaraBani(comanda()), true);
  });

  test("⚠ si livrata, nu doar expediata: marfa a plecat la fel", () => {
    assert.equal(marfaAPlecatFaraBani(comanda({ status: "delivered" })), true);
  });

  test("⚠⚠ la TOATE procesatoarele, nu doar la Netopia", () => {
    /*
     * Lista nu se rescrie in regula: e chiar `PAYMENT_PROCESSOR_TYPES`, aceeasi multime folosita
     * de checkout. Scrisa a doua oara, s-ar fi despartit de prima la primul procesator nou.
     */
    for (const m of PAYMENT_PROCESSOR_TYPES) {
      assert.equal(marfaAPlecatFaraBani(comanda({ payment_method: m })), true, m);
    }
  });

  test("⚠ si cand starea platii lipseste cu totul", () => {
    assert.equal(marfaAPlecatFaraBani(comanda({ payment_status: null })), true);
    assert.equal(marfaAPlecatFaraBani(comanda({ payment_status: "" })), true);
  });
});

describe("Cand NU se semnaleaza, si fiecare are motivul ei", () => {
  test("⚠⚠ rambursul: acolo „neplatit” e starea NORMALA a unei comenzi vii", () => {
    /* Marfa pleaca tocmai ca sa fie platita la usa. Semnalat, ar suna la fiecare colet. */
    assert.equal(marfaAPlecatFaraBani(comanda({ payment_method: "cash_on_delivery" })), false);
  });

  test("⚠⚠ comanda restituita: banii AU intrat si au iesit inapoi, deliberat", () => {
    /*
     * `baniiAuIntrat` raspunde corect `false` si pentru o restituire, fiindca acolo intrebarea e
     * „sunt banii la comerciant ACUM". Aici intrebarea e alta: „s-a pierdut ceva?". Fara taietura
     * asta, fiecare retur ar fi sunat o alarma.
     */
    assert.equal(marfaAPlecatFaraBani(comanda({ payment_status: "refunded" })), false);
    assert.equal(marfaAPlecatFaraBani(comanda({ payment_status: "partially_refunded" })), false);
  });

  test("⚠ comanda platita", () => {
    assert.equal(marfaAPlecatFaraBani(comanda({ payment_status: "paid" })), false);
  });

  test("⚠ comanda care n-a plecat inca", () => {
    /* Cat timp marfa e la comerciant, plata neconfirmata nu e o paguba: e o comanda in
       asteptare, si de ea se ocupa maturatoarea de cupoane. */
    for (const s of ["pending", "confirmed", "processing"]) {
      assert.equal(marfaAPlecatFaraBani(comanda({ status: s })), false, s);
    }
  });

  test("⚠ comanda anulata: nu mai e nimic de aparat", () => {
    assert.equal(marfaAPlecatFaraBani(comanda({ status: "cancelled" })), false);
  });

  test("⚠ metoda necunoscuta sau lipsa nu semnaleaza nimic", () => {
    /* Tacerea pe necunoscut: nu inventam o paguba dintr-o metoda pe care n-o stim. */
    for (const m of [null, "", "transfer_bancar", "altceva"]) {
      assert.equal(marfaAPlecatFaraBani(comanda({ payment_method: m })), false, String(m));
    }
  });
});

describe("Mesajul catre comerciant", () => {
  test("⚠ spune numarul, suma SI pasul urmator", () => {
    const m = mesajulPentruComerciant({ orderNumber: "#0104", total: 105.5, metoda: "Card (Netopia)" });
    assert.match(m, /#0104/);
    assert.match(m, /105\.50 lei/);
    assert.match(m, /Card \(Netopia\)/);
    assert.match(m, /Verifica in contul tau de procesator/, "nu i se spune ce sa faca");
  });

  test("⚠ si nu cade pe date lipsa", () => {
    const m = mesajulPentruComerciant({ orderNumber: null, total: null, metoda: "Card" });
    assert.match(m, /fara numar/);
    assert.match(m, /suma necunoscuta/);
  });
});

// ─── Si cronul chiar cheama regula, si chiar spune omului ────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Cronul", () => {
  const s = viu("src/app/api/cron/plati-neconfirmate/route.ts");

  test("⚠⚠ hotararea e a REGULII, nu a interogarii", () => {
    /* Pusa toata in SQL, conditia ar fi trait in doua locuri si s-ar fi despartit de proba. */
    assert.match(s, /\.filter\(marfaAPlecatFaraBani\)/, "cronul nu mai cheama regula");
  });

  test("⚠⚠ si ajunge la OM, nu doar in jurnal", () => {
    /*
     * Lectia din 16.09: cinci cronuri din saptesprezece calculau corect ca ceva merita spus si o
     * scriau intr-un jurnal pe care comerciantul nu-l deschide niciodata.
     */
    assert.match(s, /semnaleazaExpedierea\(/, "se scrie doar in jurnal");
    assert.match(s, /proprietariiMagazinelor\(/, "fara proprietar, notificarea nu se poate scrie");
  });

  test("⚠⚠ o citire picata NU raporteaza „zero de semnalat”", () => {
    assert.match(s, /if \(eComenzi\) \{/, "eroarea citirii nu se verifica");
    assert.match(s, /severity: "critical"/);
    assert.match(s, /status: 503/, "cronul ar raspunde ok pe o baza cazuta");
  });

  test("⚠⚠ poarta de cron e prima din CORPUL rutei, SI e in sensul bun", () => {
    /*
     * ⚠ Prima varianta compara pozitiile in tot fisierul, deci masura cadea pe ordinea
     * IMPORTURILOR, nu pe cod.
     *
     * ⚠⚠ SI TOT NU AJUNGEA. Am scris intai `const refuz = verificaCron(req); if (refuz) return
     * refuz;`, tiparul altor rute. Numai ca `verificaCron` intoarce `boolean`, nu un raspuns: asa
     * scris, cronul ar fi rulat DOAR pentru cine NU e autorizat. Proba de ordine a trecut verde
     * peste varianta aceea; a cazut abia `npm run build`, care verifica tipurile rutelor generate
     * de Next. `tsc --noEmit` trecuse si el.
     *
     * Deci se pinuieste FORMA portii, nu doar locul ei.
     */
    const corp = s.slice(s.indexOf("export async function GET"));
    assert.ok(
      corp.indexOf("verificaCron(req)") < corp.indexOf("createClient"),
      "ruta deschide baza inainte sa verifice cine o cheama",
    );
    assert.match(corp, /if \(!verificaCron\(req\)\) \{/, "poarta e inversata: ar lasa sa intre exact cine nu trebuie");
    assert.match(corp, /status: 401/);
  });

  test("⚠ fereastra tine loc de memorie, si se poate largi cu `?ore=`", () => {
    /* Fara fereastra, aceleasi comenzi ar fi strigate zilnic la nesfarsit. */
    assert.match(s, /gte\("updated_at", de\)/);
    assert.match(s, /searchParams\.get\("ore"\)/);
  });

  test("⚠ si e programat, altfel e cod care nu ruleaza niciodata", () => {
    assert.match(readFileSync("vercel.json", "utf8"), /"\/api\/cron\/plati-neconfirmate"/);
  });
});
