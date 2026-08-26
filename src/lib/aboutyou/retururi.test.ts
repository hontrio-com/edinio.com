import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   A TREIA SI ULTIMA INTEGRARE CU ACEEASI SCAPARE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Statusul „returned" de la ei punea AUTOMAT toata comanda inapoi pe raft, fiindca
   `tranzitieComandaMarketplace` era chemata fara `elibereazaStoc`, iar implicitul din baza e
   `true`. Marfa intoarsa vine insa desfacuta, zgariata, incompleta, sau pur si simplu alta —
   iar stocul umflat se vinde, si se vinde ce nu exista.

   La eMAG s-a taiat pe 25.08, la Trendyol pe 26.08. Aici a ramas o zi in urma, dinadins: taiata
   FARA inlocuitor, marfa intoarsa n-ar mai fi ajuns niciodata inapoi in stoc — o paguba mai
   mare decat cea reparata. De-aia probele de mai jos leaga cele doua jumatati una de alta.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const mod = viu("src/lib/aboutyou/orders.ts");
const act = viu("src/lib/actions/aboutyou-retururi.actions.ts");
const ui = viu("src/components/dashboard/AboutYouReturns.tsx");
const mig = readFileSync("migrations/2026-11-02-aboutyou-retururi.sql", "utf8");

test("⚠ returul NU mai pune marfa inapoi pe raft singur", () => {
  assert.match(mod, /elibereazaStoc: stareNoua !== "refunded"/);
});

test("⚠ dar ANULAREA elibereaza mai departe, si e o deosebire de fond", () => {
  /* La o anulare marfa n-a plecat nicaieri, deci e chiar pe raft. La un retur a fost la client
     si s-a intors — si nu se stie in ce stare. */
  const i = mod.indexOf("function edinioStatusFor(");
  const f = mod.slice(i, mod.indexOf("}", mod.indexOf("return \"pending\"", i)));
  assert.match(f, /ayStatus === "cancelled"\) return "cancelled"/);
  assert.match(f, /ayStatus === "returned"\) return "refunded"/);
});

test("⚠ oprirea vine CU inlocuitor: liniile intoarse se tin minte", () => {
  /*
   * Cea mai importanta pereche din fisier. Fara randurile astea, comerciantul n-are pe ce
   * apasa, iar marfa intoarsa dispare din stoc pentru totdeauna.
   *
   * ⚠ Statusul returului sta pe LINIE la About You (n-au un serviciu de retururi ca Trendyol),
   * deci se citeste chiar din ingest.
   */
  assert.match(mod, /\.filter\(\(it\) => it\.status === "returned"\)/);
  assert.match(mod, /await scrieRetururile\(admin, ctx, ayNumber, ex\.order_id, intoarse\)/);
});

test("⚠ o recitire a comenzii NU sterge marcajul de repunere", () => {
  /*
   * `ignoreDuplicates`, nu un upsert care rescrie: `repus_in_stoc_la` sta pe randul asta. Un
   * upsert obisnuit l-ar fi sters la fiecare recitire a comenzii de la ei, iar marfa ar fi
   * intrat in stoc a doua oara la urmatoarea apasare.
   */
  assert.match(mod, /ignoreDuplicates: true/);
});

test("⚠ repunerea e o SINGURA tranzactie, cu randul blocat", () => {
  /* Citit-adunat-marcat, doua apasari repezi ar trece amandoua de citire cu marcajul gol si ar
     aduna amandoua. Aceeasi forma ca la Trendyol, si din acelasi motiv. */
  assert.match(mig, /for update;/);
  const iSelect = mig.indexOf("for update;");
  const iMarcaj = mig.indexOf("if v_r.repus_in_stoc_la is not null then");
  const iStoc = mig.indexOf("elibereaza_stoc_complet");
  assert.ok(iSelect > 0 && iMarcaj > iSelect && iStoc > iMarcaj, "blocare, marcaj, stoc");
  assert.match(act, /admin\.rpc\("aboutyou_repune_stoc_retur"/);
});

test("⚠ se pune inapoi prin functia casei, si variantele pe TITLU", () => {
  /* `elibereaza_stoc_complet` e chiar cea prin care se intoarce stocul la anulari. Iar indicii
     se muta cand comerciantul rearanjeaza combinatiile; titlurile nu. */
  assert.match(mig, /perform public\.elibereaza_stoc_complet\(/);
  assert.match(mig, /'variant_title', v_r\.variant_title/);
  assert.match(mig, /'quantity', v_r\.quantity/);
});

test("⚠ usa functiei e inchisa, si tabela are RLS", () => {
  assert.match(
    mig,
    /revoke execute on function public\.aboutyou_repune_stoc_retur\(uuid, uuid\) from public, anon, authenticated;/,
  );
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /alter table public\.aboutyou_retururi enable row level security;/);
  assert.match(baseline, /owner_select_aboutyou_retururi/);
});

test("⚠ fiecare actiune isi verifica magazinul", () => {
  /* Actiunile de server se pot chema cu orice argumente, printr-un POST direct. */
  assert.equal((act.match(/const g = await guard\(businessId\);/g) ?? []).length, 3);
  /* ⚠ Si o citire picata nu se citeste ca „nu e magazinul lui". */
  assert.match(act, /if \(error\) return \{ error: "Nu am putut verifica magazinul/);
});

test("⚠ ecranul spune DE CE nu intra singura in stoc", () => {
  /* Un buton fara motiv pare o piedica. Cu motivul scris, e o hotarare pe care omul o ia in
     cunostinta de cauza. */
  assert.match(ui, /Am primit marfa și e bună/);
  assert.match(ui, /nu intră singură în stoc/);
  assert.match(ui, /pusă în stoc/, "si se vede cand s-a facut deja");
});
