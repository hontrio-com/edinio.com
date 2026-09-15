import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/* ══════════════════════════════════════════════════════════════════════════
   TRANZITIA SE LEAGA DE EXPEDIEREA CITITA                       (15.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ JUMATATEA CARE LIPSEA, SI ERA NUMITA PE FATA. `scrieUrmarirea` isi scrie starea sub conditia
   identitatii de la 14.09.2026, iar antetul lui spune negru pe alb ce ramane descoperit:

       „TRANZITIA DE STATUS nu trece pe aici. Ea merge prin `aplica_tranzitia_comenzii`, care nu
        are niciun parametru de AWB. O stare veche `delivered` care ajunge acolo muta comanda si
        declanseaza facturarea automata."

   Masurat pe 15.09.2026: TREISPREZECE cronuri de urmarire chemau tranzitia, si NICIUNUL nu
   verifica daca expedierea mai e a comenzii. Intre citirea lotului si tranzitie sta un apel la
   furnizor, iar o tura are pana la 400 de comenzi.

   ⚠ SI S-A INCHIS FARA MIGRATIE. Planul vechi cerea `shipment_generation_id` pe `orders`, adica o
   migratie pe un tabel viu si o atingere a tuturor celor 17 curieri. Identitatea expedierii e insa
   deja o coloana; tot ce lipsea era sa i se ceara sa mai fie acolo.
*/

/* ── Purtarea ─────────────────────────────────────────────────────────────── */

type Raspuns = { data: { id: string } | null; error: { message: string } | null };

/** Un client cat sa treaca exact prin drumul cerut, cu jurnal de ce a fost intrebat. */
function baza(identitate: Raspuns) {
  const cerute: [string, unknown][] = [];
  const rpcuri: string[] = [];
  const client = {
    from() {
      const b = {
        select: () => b,
        eq: (col: string, val: unknown) => { cerute.push([col, val]); return b; },
        maybeSingle: () => Promise.resolve(identitate),
      };
      return b;
    },
    rpc: (nume: string) => {
      rpcuri.push(nume);
      return Promise.resolve({ data: { gasit: true }, error: null });
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, cerute, rpcuri };
}

const COMANDA = { orderId: "o-1", businessId: "b-1", status: "delivered", sursa: "sameday" };

test("⚠⚠ expedierea s-a schimbat sub noi: NU se muta comanda si NU se factureaza", async () => {
  /*
   * ⚠ CEA MAI SCUMPA. Comerciantul a detasat AWB-ul si a emis din nou cat timp cronul intreba
   * furnizorul; starea citita e a expedierii MOARTE. Aplicata, muta comanda pe „Livrat" si
   * declanseaza facturarea automata, pe un colet care n-a ajuns nicaieri.
   */
  const b = baza({ data: null, error: null });
  const r = await tranzitieComandaMarketplace(b.client, {
    ...COMANDA,
    expediere: { coloana: "sameday_awb_number", valoare: "AWB-VECHI" },
  });

  assert.equal(r, "definitiv", "expedierea schimbata trebuie sa opreasca tranzitia DEFINITIV");
  assert.deepEqual(b.rpcuri, [], "s-a chemat totusi `aplica_tranzitia_comenzii` pe o expediere moarta");
  assert.deepEqual(
    b.cerute,
    [["id", "o-1"], ["business_id", "b-1"], ["sameday_awb_number", "AWB-VECHI"]],
    "confruntarea nu cere chiar comanda, magazinul si expedierea",
  );
});

test("⚠ o citire PICATA nu inseamna „e in regula”: se reincearca", async () => {
  /*
   * ⚠ Dincolo de randul asta stau mutarea comenzii si factura. O citire cazuta nu dovedeste ca
   * expedierea mai e a noastra, iar reincercarea e ieftina: tura urmatoare o ia de la capat.
   */
  const b = baza({ data: null, error: { message: "timeout" } });
  const r = await tranzitieComandaMarketplace(b.client, {
    ...COMANDA,
    expediere: { coloana: "sameday_awb_number", valoare: "AWB" },
  });
  assert.equal(r, "reincearca");
  assert.deepEqual(b.rpcuri, [], "s-a aplicat tranzitia desi nu se stia pe ce expediere");
});

test("iar cand expedierea E tot a comenzii, tranzitia merge mai departe", async () => {
  const b = baza({ data: { id: "o-1" }, error: null });
  const r = await tranzitieComandaMarketplace(b.client, {
    ...COMANDA,
    expediere: { coloana: "sameday_awb_number", valoare: "AWB" },
  });
  assert.equal(r, "ok");
  assert.deepEqual(b.rpcuri, ["aplica_tranzitia_comenzii"]);
});

test("⚠ marketplace-urile NU sunt atinse: fara expediere, nu se confrunta nimic", async () => {
  /*
   * eMAG, Trendyol si About You n-au expediere de confruntat. O verificare impusa lor ar fi oprit
   * fiecare tranzitie de marketplace din platforma.
   */
  const b = baza({ data: null, error: null });
  const r = await tranzitieComandaMarketplace(b.client, COMANDA);
  assert.equal(r, "ok");
  assert.deepEqual(b.cerute, [], "s-a cerut o identitate care nici nu exista pe drumul asta");
  assert.deepEqual(b.rpcuri, ["aplica_tranzitia_comenzii"]);
});

test("⚠ si o identitate GOALA nu se confrunta: `.eq` pe gol n-ar potrivi nimic", async () => {
  /* Un `null` sau un sir gol pus in conditie n-ar potrivi niciun rand in PostgREST, deci fiecare
     tranzitie ar fi iesit „definitiv" pe o comanda perfect sanatoasa. */
  for (const valoare of [null, ""]) {
    const b = baza({ data: null, error: null });
    const r = await tranzitieComandaMarketplace(b.client, {
      ...COMANDA,
      expediere: { coloana: "sameday_awb_number", valoare },
    });
    assert.equal(r, "ok", `identitatea ${JSON.stringify(valoare)} a oprit o tranzitie buna`);
    assert.deepEqual(b.cerute, []);
  }
});

/* ── ⚠ Si toate cronurile, fiindca regula singura n-apara nimic ──────────── */

const RADACINA = "src/app/api/cron";

const faraComentarii = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

function ruteDeUrmarire(): string[] {
  return readdirSync(RADACINA, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-tracking"))
    .map((d) => `${RADACINA}/${d.name}/route.ts`);
}

test("⚠⚠ fiecare tranzitie dintr-un cron de urmarire poarta expedierea CITITA", () => {
  /*
   * ⚠ SE CERE ACEEASI COLOANA CA LA `scrieUrmarirea`, nu doar prezenta campului. Un tipar copiat
   * mecanic ar fi pus `*_awb_number` peste tot, iar la Packeta, Pall-Ex si Woot aceea e alta
   * coloana decat identitatea adevarata: conditia ar fi fost mereu falsa, adica fiecare tranzitie
   * ar fi iesit „definitiv" si nicio comanda nu s-ar mai fi mutat vreodata.
   */
  const fara: string[] = [];
  for (const cale of [...ruteDeUrmarire(), "src/lib/innoship/aplica-urmarire.ts"]) {
    const s = faraComentarii(cale);
    if (!s.includes("tranzitieComandaMarketplace(admin, {")) continue;

    const identitati = [...s.matchAll(/identitate: \{ coloana: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(identitati.length > 0, `${cale} muta comanda dar nu citeste nicio identitate`);

    const expedieri = [...s.matchAll(/expediere: \{ coloana: "(\w+)"/g)].map((m) => m[1]);
    const tranzitii = (s.match(/tranzitieComandaMarketplace\(admin, \{/g) ?? []).length;

    if (expedieri.length !== tranzitii) { fara.push(`${cale} (${expedieri.length}/${tranzitii})`); continue; }
    for (const col of expedieri) {
      assert.ok(
        identitati.includes(col),
        `${cale} leaga tranzitia de \`${col}\`, dar starea o citeste pe \`${identitati.join(", ")}\``,
      );
    }
  }
  assert.deepEqual(
    fara, [],
    "cronurile de mai sus muta comanda fara sa confrunte expedierea; o stare veche ar emite factura",
  );
});
