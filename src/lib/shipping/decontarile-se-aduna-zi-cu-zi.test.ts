import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dataFanIso } from "@/lib/fancourier";

/**
 * DECONTARILE SE ADUNA ZI CU ZI, SI CURSORUL SE MUTA DOAR PE O ZI INTREAGA.
 *
 * ═══ ⚠ CE S-A DESCHIS (13.09.2026) ═══
 *
 * Platforma calcula de mult CAT ramburs sa incaseze curierul, dar nu stia niciodata daca banii
 * au fost si virati inapoi. Niciunul dintre cei cincisprezece curieri n-avea asa ceva: cele
 * patru croane `*-reconcile` privesc platile ONLINE ale cumparatorului, nu banii intorsi de
 * curier. Comerciantul avea un singur raspuns posibil la „mi-a virat FAN banii pe comanda
 * asta?": extrasul de banca si potrivirea de mana.
 *
 * ═══ ⚠ DE CE E ALTFEL DECAT ORICE ALT CRON DIN PLATFORMA ═══
 *
 * `reports/bank-transfers` cere `date` OBLIGATORIU si raspunde pentru o SINGURA zi. Nu exista
 * interval. Toate celelalte croane rescaneaza o fereastra (`since = acum - N zile`) si sunt
 * idempotente prin constructie; aici trebuie mers zi cu zi SI tinut minte unde s-a ajuns.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: mutand cursorul inaintea garzii de zi intreaga, lasand ziua de
 * azi sa fie consumata, sau scotand intrarea de meniu dintr-una din cele DOUA copii, probele de
 * mai jos cad.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGULA, PE DATE ADEVARATE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ doua formate de data in acelasi endpoint, si cel din raspuns e ZI.LUNA.AN", () => {
  /*
   * ⚠ CAPCANA CENTRALA A INTEGRARII. Cererea pleaca cu `date=2023-03-01`, dar raspunsul intoarce
   * `"transferDate": "01.03.2023"`. Citit ca ISO, „01.03.2023" devine fie „Invalid Date", fie
   * 3 ianuarie, dupa unealta si dupa masina: o zi de virare mutata cu doua luni, exact acolo
   * unde comerciantul compara cifra cu extrasul de banca.
   */
  assert.equal(dataFanIso("27.02.2023"), "2023-02-27");
  assert.equal(dataFanIso("01.03.2023"), "2023-03-01");
  /* Marginile lunii si ale anului, ca sa nu treaca din intamplare. */
  assert.equal(dataFanIso("31.12.2026"), "2026-12-31");
  assert.equal(dataFanIso("01.01.2026"), "2026-01-01");
});

test("⚠ o data pe care nu o intelegem intoarce `null`, nu o ghicitura", () => {
  /*
   * Ziua virarii e parte din cheia de deduplicare a randului. O valoare inventata acolo ar
   * sparge idempotenta: aceeasi virare ar intra de doua ori, cu doua zile diferite, si
   * comerciantul ar vedea banii dublati.
   */
  for (const gunoi of ["2023-02-27", "27/02/2023", "1.3.2023", "32.01.2026", "01.13.2026",
                       "27.02.1999", "", "  ", "azi", null, undefined, 42, {}]) {
    assert.equal(dataFanIso(gunoi), null, `„${String(gunoi)}" nu are voie sa treaca drept data`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CABLAREA: cronul, meniul, inregistrarea
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const CRON = "src/app/api/cron/fancourier-settlements/route.ts";
/** ⚠ DOUA copii ale meniului, si nu sunt identice. Vezi proba de mai jos. */
const MENIURI = [
  "src/components/dashboard/Sidebar.tsx",
  "src/components/dashboard/DashboardTopbar.tsx",
];

test("⚠⚠ cursorul se muta DOAR dupa o zi consumata intreaga", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT.
   *
   * Mutat inaintea garzii, o zi cazuta la jumatate (o eroare de retea, un plafon de pagini
   * atins) ar fi fost socotita terminata si NU s-ar mai fi cerut niciodata. Banii ei ar fi
   * disparut tacut din evidenta, si nimic nu i-ar mai fi adus inapoi: cronul merge doar inainte.
   */
  const s = sursa(CRON);

  const garda = s.indexOf("if (!ziuaEIntreaga) break;");
  const cursor = s.indexOf("jsonb_merge_config");
  assert.ok(garda > 0, "nu mai exista garda de zi intreaga: reciteste de ce exista");
  assert.ok(cursor > 0, "cursorul nu se mai scrie prin `jsonb_merge_config`");
  assert.ok(garda < cursor,
    "cursorul se muta INAINTEA garzii: o zi cazuta la jumatate ar fi socotita terminata");

  /* Si se scrie chiar ziua tocmai consumata, nu alta. */
  assert.match(s, /p_patch: \{ last_settlement_date: zi \} as never,/);
});

test("⚠ ziua de AZI nu se consuma niciodata", () => {
  /*
   * Virarile se posteaza peste noapte. O zi inca deschisa, memorata drept completa, ar ingropa
   * definitiv ce soseste mai tarziu in aceeasi zi.
   */
  const s = sursa(CRON);
  assert.match(s, /const pana = ieri\(\);/, "cronul nu mai are o margine de zi");
  assert.match(s, /while \(zi <= pana &&/, "bucla nu se mai opreste la ieri");
  assert.match(s, /function ieri\(\)/, "nu mai exista socoteala pentru ieri");
});

test("⚠ prima rulare recupereaza 30 de zile, nu zero si nu tot istoricul", () => {
  /*
   * Hotarat cu proprietarul pe 13.09.2026. Doar „de azi inainte" ar fi pierdut definitiv zilele
   * in care cronul a fost oprit; tot istoricul ar fi insemnat sute de cereri pentru zile in care
   * magazinul nici n-avea FAN.
   */
  const s = sursa(CRON);
  assert.match(s, /const ZILE_LA_PRIMA_RULARE = 30;/, "fereastra primei rulari s-a schimbat");
  assert.match(s, /ZILE_LA_PRIMA_RULARE \* 86400000/, "fereastra nu mai e folosita la pornire");
});

test("⚠ toate paginile unei zile se consuma inainte de a trece mai departe", () => {
  /*
   * `perPage`/`page` sunt paginare obisnuita, iar plicul poarta `total`. Oprit la prima pagina,
   * cronul ar fi mutat cursorul dupa 100 de virari si ar fi lasat restul zilei necerute pentru
   * totdeauna, exact la magazinele mari.
   */
  const s = sursa(CRON);
  assert.match(s, /adunate >= total\) break;/, "nu se mai verifica daca ziua mai are pagini");
  assert.match(s, /pagina\+\+;/, "nu se mai cere pagina urmatoare");
});

test("⚠ scrierea e IDEMPOTENTA, pe cheia naturala a virarii", () => {
  /* Aceeasi zi se reia ori de cate ori e nevoie; un `insert` ar fi dublat randurile. */
  const s = sursa(CRON);
  assert.match(s, /\.upsert\(randuri, \{ onConflict: "business_id,courier,awb_number,transfer_date" \}\)/,
    "virarile nu se mai scriu idempotent");
  /* Tabelul e generic: curierul e o VALOARE, nu un nume de tabel. */
  assert.match(s, /courier: "fancourier",/);
});

test("⚠ cronul isi verifica secretul si e INREGISTRAT", () => {
  /*
   * Un cron fara secret e un endpoint public care scrie randuri de bani. Unul neinregistrat e
   * cel mai tacut fel de a nu face nimic: fisierul exista, probele trec, si nimeni nu-l cheama.
   */
  assert.match(sursa(CRON), /if \(!verificaCron\(req\)\)/, "cronul nu-si mai verifica secretul");
  const vercel = readFileSync(path.join(RAD, "vercel.json"), "utf8");
  assert.match(vercel, /"\/api\/cron\/fancourier-settlements"/,
    "cronul decontarilor nu e in `vercel.json`: nu-l cheama nimeni");
});

test("⚠⚠ pagina e in AMANDOUA copiile meniului, nu doar in una", () => {
  /*
   * ⚠ A TREIA OARA IN ACEEASI ZI CAND UN LUCRU TRAIESTE IN DOUA COPII care nu se cunosc intre
   * ele: doua checkout-uri care compun incarcatura, doua scrieri in `shipping_address`, si acum
   * `Sidebar` (desktop) plus `DashboardTopbar` (mobil). Pusa intr-una singura, pagina ar fi
   * existat doar pe jumatate din ecrane, si nimic n-ar fi semnalat-o.
   */
  for (const fisier of MENIURI) {
    const s = sursa(fisier);
    assert.match(s, /href: "\/dashboard\/settlements"/,
      `${fisier} nu are intrarea „Decontari": pagina lipseste de pe ecranele servite de el`);
    assert.match(s, /label: "Decontari"/, `${fisier} nu numeste intrarea`);
    /* Ancora: daca meniul nu mai contine nimic cunoscut, potrivirile de sus n-ar insemna nimic. */
    assert.match(s, /href: "\/dashboard\/orders"/, `${fisier} nu mai pare a fi un meniu`);
  }
});
