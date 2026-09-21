import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CLIENT_GOL, DE_CE_NU_SE_STERGE, MESAJUL_ADAUGARII, STARI_ADAUGARE, aIntrat,
  intrebareaStergerii, sePoateSterge, sePoateTrimite, stareAdaugareValida,
} from "./gestionare";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CUMPARATOR NU SE STERGE NICIODATA                          (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ ASTA E REGULA CARE APARA CEL MAI MULT din tot ce s-a scris la etapa G. Un
 * om cu comenzi are in spate facturi fiscale, AWB-uri si bani incasati. Sters,
 * ar ramane comenzi fara nume si facturi care arata catre nimeni — iar facturile
 * nu se pot reface, fiindca au plecat deja la SmartBill si la client.
 *
 * ⚠ Regula e scrisa in DOUA locuri, si asta e dinadins:
 *   - in SQL, in CHIAR instructiunea care sterge (`not exists`), fiindca acolo e
 *     adevarul si fiindca intre o citire separata si stergere incape o comanda;
 *   - in TypeScript, ca sa nu se arate un buton care oricum ar fi refuzat.
 * Proba asta le tine pe amandoua.
 */

/*
  ⚠⚠ `000-schema-baseline.sql` NU E O MIGRATIE, e o FOTOGRAFIE generata din
  productie cu `pg_dump`. Citita ca migratie, probele de aici ar fi masurat textul
  masinii in loc de textul scris de om — si, fiind prima alfabetic, ar fi fost si
  cea gasita prima.

  S-a intamplat chiar asa, pe 21.09.2026: dupa regenerarea liniei de baza, doua
  probe au picat deodata, spunand „bucata gasita are 0 semne". Nu se stricase
  nimic: se schimbase ce citeau ele.
*/
const DOSAR = "migrations";
const MIGRATII = readdirSync(DOSAR)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-")).sort()
  .map((f) => ({ f, text: readFileSync(join(DOSAR, f), "utf8") }));

const M = MIGRATII.find((m) => m.text.includes("create or replace function public.customer_delete_contact"));

test("⚠ migratia chiar a fost gasita, altfel proba n-are ce citi", () => {
  assert.ok(M, "nicio migratie nu defineste `customer_delete_contact`");
});

test("⚠⚠ paza stergerii e in CHIAR instructiunea care sterge, nu inaintea ei", () => {
  /*
   * Defectul de care ne aparam: cineva „simplifica" mutand verificarea intr-un
   * `select` de dinainte. Atunci, intre citire si `delete`, incape exact comanda
   * omului pe care tocmai il stergem — plasata in secunda aceea. Nu e o
   * inchipuire: e o comanda telefonica luata in timp ce cineva face curat in
   * lista de contacte.
   */
  const corp = M!.text.slice(
    M!.text.indexOf("create or replace function public.customer_delete_contact"),
    M!.text.indexOf("revoke all on function public.customer_delete_contact"),
  );
  assert.ok(corp.length > 300, `bucata gasita are ${corp.length} semne`);

  const de = corp.indexOf("delete from public.customers");
  const pana = corp.indexOf("get diagnostics");
  assert.ok(de > -1 && pana > de, "nu mai gasesc stergerea");

  const instructiunea = corp.slice(de, pana);
  assert.match(instructiunea, /not exists/, "stergerea nu mai are paza in ea");
  assert.match(instructiunea, /public\.orders/, "paza nu se mai uita la comenzi");
  assert.match(instructiunea, /order_customer_key/, "paza nu mai foloseste cheia clientului");
  assert.match(instructiunea, /c\.business_id = bid/, "stergerea nu mai e margina la magazin");
});

test("⚠ si partea de ecran refuza acelasi lucru", () => {
  assert.equal(sePoateSterge({ orderCount: 0 }), true);
  assert.equal(sePoateSterge({ orderCount: 1 }), false);
  /* ⚠ Si comenzile anulate tin: `orderCount` e TOTALUL, nu cele valide. O
     comanda anulata are tot factura ei storno si tot AWB-ul ei. */
  assert.equal(sePoateSterge({ orderCount: 12 }), false);
});

test("⚠ refuzul SPUNE de ce, nu doar ca nu se poate", () => {
  assert.ok(DE_CE_NU_SE_STERGE.length > 60);
  assert.match(DE_CE_NU_SE_STERGE, /comenzi/);
  assert.match(DE_CE_NU_SE_STERGE, /factur/i);
});

test("⚠ intrebarea de confirmare spune ca nu se poate lua inapoi", () => {
  const i = intrebareaStergerii("Ana Popescu");
  assert.match(i, /Ana Popescu/);
  assert.match(i, /nu se poate aduce înapoi/);
  /* Si spune despre CE contact e vorba, ca sa nu para ca sterge un cumparator. */
  assert.match(i, /fără nicio comandă/);
});

/* ── Cele patru stari ale adaugarii ─────────────────────────────────────── */

test("⚠⚠ „exista” si „are-comenzi” au mesaje DEOSEBITE", () => {
  /*
   * Topite intr-unul singur, al doilea l-ar trimite pe comerciant sa caute in
   * „Contacte importate" un rand care nu e acolo: un cumparator NU are rand in
   * `customers`, e o grupare peste comenzile lui.
   */
  assert.notEqual(MESAJUL_ADAUGARII["exista"], MESAJUL_ADAUGARII["are-comenzi"]);
  assert.match(MESAJUL_ADAUGARII["are-comenzi"], /a comandat deja/);
  assert.match(MESAJUL_ADAUGARII["exista"], /contact/);
});

test("fiecare stare are un mesaj intreg, nu o eticheta", () => {
  assert.equal(Object.keys(MESAJUL_ADAUGARII).length, STARI_ADAUGARE.length);
  for (const s of STARI_ADAUGARE) {
    const m = MESAJUL_ADAUGARII[s];
    assert.ok(m.length > 20, `${s}: mesajul e prea scurt ca sa spuna ceva`);
    assert.ok(/[.!]$/.test(m.trim()), `${s}: mesajul nu e o propozitie incheiata`);
  }
});

test("⚠ o stare necunoscuta din baza nu se da drept izbanda", () => {
  /*
   * Daca functia SQL capata maine o a cincea stare, ecranul n-are voie s-o
   * citeasca drept „adaugat" si sa inchida formularul peste un client neintrat.
   */
  assert.equal(stareAdaugareValida("adaugat"), "adaugat");
  assert.equal(stareAdaugareValida("altceva"), null);
  assert.equal(stareAdaugareValida(null), null);
  assert.equal(stareAdaugareValida(7), null);
  assert.equal(aIntrat("exista"), false);
  assert.equal(aIntrat("adaugat"), true);
});

test("⚠ lista de stari din TypeScript e ACEEASI cu cea din SQL", () => {
  /*
   * O stare adaugata numai in SQL ar fi ajuns pe ecran ca „nu s-a putut", fara
   * sa spuna de ce; una adaugata numai aici ar fi un mesaj care nu apare nicicand.
   */
  const m = MIGRATII.find((x) => x.text.includes("create or replace function public.customer_add_manual"));
  assert.ok(m, "nu gasesc migratia adaugarii");
  const corp = m.text.slice(
    m.text.indexOf("create or replace function public.customer_add_manual"),
    m.text.indexOf("revoke all on function public.customer_add_manual"),
  );
  assert.ok(corp.length > 400, `bucata gasita are ${corp.length} semne`);

  const dinSql = [...corp.matchAll(/select '([a-z-]+)'::text/g)].map((x) => x[1]);
  assert.deepEqual([...dinSql].sort(), [...STARI_ADAUGARE].sort());
});

/* ── Formularul ─────────────────────────────────────────────────────────── */

test("⚠ butonul e stins pana cand exista macar un fel de a-l gasi pe om", () => {
  /*
   * Aceeasi conditie ca „fara-contact" din baza. Fara ea, formularul s-ar trimite
   * si s-ar intoarce cu o eroare previzibila, iar omul ar crede ca a gresit
   * altceva — numele, poate.
   */
  assert.equal(sePoateTrimite(CLIENT_GOL), false);
  assert.equal(sePoateTrimite({ ...CLIENT_GOL, name: "Ana" }), false);
  assert.equal(sePoateTrimite({ ...CLIENT_GOL, phone: "  " }), false);
  assert.equal(sePoateTrimite({ ...CLIENT_GOL, phone: "0722 111 999" }), true);
  assert.equal(sePoateTrimite({ ...CLIENT_GOL, email: "a@b.ro" }), true);
});
