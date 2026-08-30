import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/* ══════════════════════════════════════════════════════════════════════════
   COD DE SERVER AJUNS IN BUNDLE-UL DE CLIENT (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INTAMPLAT. `dupaRaspuns` importa `after` din `next/server`. Iar
   `stock-feed/committer.ts` — un modul de server — era importat de `StockFeedWizard.tsx`,
   care e component CLIENT, pentru O SINGURA CONSTANTA de afisare.

   Importul tragea TOT committer-ul in bundle-ul de browser, cu tot ce aduce el dupa. In
   ziua in care a intrat si `next/server`, build-ul a picat:

     Ecmascript file had an error
     #4 [Client Component Browser]:
       ./src/lib/marketplace/dupa-raspuns.ts
       ./src/lib/import/stock-feed/committer.ts
       ./src/components/dashboard/import/StockFeedWizard.tsx

   ⚠ DEFECTUL NU ERA IN `after()`. Era intr-o linie veche: o constanta de afisare locuia
   intr-un modul de server. `after` doar a facut-o vizibila.

   ⚠ SI DE CE N-AM PRINS-O: rulasem typecheck, teste si lint — toate verzi — dar NU
   `npm run build`. Doar build-ul stie granita server/client, fiindca doar el o traseaza.
   Probele de mai jos sunt ieftine si merg in `npm test`; build-ul ramane arbitrul.
*/

/** Module care n-au ce cauta niciodata intr-un bundle de browser. */
const NUMAI_SERVER = [
  "next/server",
  "@/lib/supabase/admin",
  "next/headers",
] as const;

/** Fisierele marcate `"use client"`, si tot ce importa ele, direct. */
function importuriDinClient(): { fisier: string; import: string }[] {
  const clienti = execSync(
    'grep -rl "^\\"use client\\"" src --include=*.tsx --include=*.ts || true',
    { encoding: "utf8" },
  ).split(String.fromCharCode(10)).filter((x) => x.trim() !== "");

  const out: { fisier: string; import: string }[] = [];
  for (const f of clienti) {
    const sursa = readFileSync(f, "utf8");
    for (const m of sursa.matchAll(/from\s+"([^"]+)"/g)) out.push({ fisier: f, import: m[1] });
  }
  return out;
}

test("niciun component client nu importa direct un modul numai-de-server", () => {
  /*
   * ⚠ Verificare de suprafata, si o spun: prinde importul DIRECT, nu lantul intreg. Lantul
   * il stie doar build-ul, care are graful complet. Asta e plasa ieftina care ruleaza la
   * fiecare `npm test`, nu inlocuitorul build-ului.
   */
  const rele = importuriDinClient().filter((x) =>
    NUMAI_SERVER.some((m) => x.import === m || x.import.startsWith(`${m}/`)),
  );
  assert.deepEqual(
    rele.map((x) => `${x.fisier} -> ${x.import}`), [],
    "un component client importa cod care ruleaza doar pe server",
  );
});

test("vrajitorul de stoc nu mai atinge committer-ul", () => {
  /*
   * ⚠ Cazul care a picat build-ul, pastrat ca proba anume. `EMPTY_STOCK_TOTALS` s-a mutat
   * in `types.ts` — acolo ii era locul: e o valoare de afisare, nu logica de scriere.
   */
  const sursa = readFileSync("src/components/dashboard/import/StockFeedWizard.tsx", "utf8");
  assert.ok(
    !sursa.includes("stock-feed/committer"),
    "vrajitorul trage din nou tot committer-ul in bundle-ul de browser",
  );
});

test("`dupaRaspuns` sta intr-un fisier pe care clientii nu-l pot atinge direct", () => {
  const rele = importuriDinClient().filter((x) => x.import.includes("marketplace/dupa-raspuns"));
  assert.deepEqual(
    rele.map((x) => x.fisier), [],
    "`dupaRaspuns` importa `next/server`; un client care il atinge rupe build-ul",
  );
});
