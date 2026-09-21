import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PAZA CUPONULUI STA IN CHIAR INSTRUCTIUNEA CARE SCRIE            (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ PANA AZI, `claim_discount_use` NU AVEA NICIO PROBA. Atomicitatea ei —
 * verificarea si incrementul in ACELASI `update ... where` — nu era aparata de
 * nimic. Desfacuta intr-un `select` urmat de un `update`, toata suita ramanea
 * verde, iar o campanie de 100 ar fi servit 130 fara ca cineva sa afle: intre
 * citire si scriere incap oricate checkouturi paralele.
 *
 * ⚠ Acelasi tipar ca `src/lib/customers/gestionarea-clientilor.test.ts`, unde
 * paza stergerii unui client se cere tot INAUNTRUL lui `delete`.
 *
 * ⚠⚠ SI E SINGURUL LOC CARE CHIAR REFUZA. `validateDiscount` se uita la aceleasi
 * reguli, dar el e o CITIRE facuta cu cateva sute de milisecunde mai devreme:
 * intre ea si revendicare incap comerciantul care stinge codul, data care trece
 * si campania care porneste. Regula din TypeScript e politete; asta e poarta.
 */

/*
  ⚠⚠ `000-schema-baseline.sql` NU E O MIGRATIE, e o FOTOGRAFIE generata din
  productie. Citita ca migratie, proba ar fi masurat textul masinii in loc de
  textul scris de om — si, fiind prima alfabetic, ar fi fost si cea gasita
  prima. S-a intamplat chiar asa pe 21.09.2026, la alte doua probe.
*/
const DOSAR = "migrations";
const MIGRATII = readdirSync(DOSAR)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-")).sort()
  .map((f) => ({ f, text: readFileSync(join(DOSAR, f), "utf8") }));

/**
 * ⚠ ULTIMA care o defineste, nu prima.
 *
 * O functie se rescrie de mai multe ori de-a lungul dosarului; cea care ramane
 * in baza e ultima aplicata. Luata prima, proba ar fi masurat o forma deja
 * inlocuita — si ar fi trecut verde peste o regula scoasa ieri.
 */
function undeSeScrie(semnatura: string) {
  return MIGRATII.filter((m) => m.text.includes(semnatura)).at(-1);
}

/** Corpul unei functii, taiat pana la `$function$;`, ca sa nu imprumute de la vecin. */
function corpul(text: string, semnatura: string): string {
  const de = text.indexOf(semnatura);
  assert.ok(de > -1, `nu gasesc \`${semnatura}\``);
  const la = text.indexOf("$function$;", de);
  assert.ok(la > de, "nu gasesc capatul functiei");
  return text.slice(de, la);
}

/** Chiar instructiunea care scrie: de la un cuvant pana la primul `;`. */
function instructiunea(corp: string, de: string): string {
  const i = corp.indexOf(de);
  assert.ok(i > -1, `nu gasesc \`${de}\``);
  const j = corp.indexOf(";", i);
  assert.ok(j > i, "instructiunea nu se termina");
  return corp.slice(i, j);
}

/* ── Revendicarea de la checkout ────────────────────────────────────────── */

const SEMN_CLAIM = "create or replace function public.claim_discount_use(";
const M_CLAIM = undeSeScrie(SEMN_CLAIM);

test("⚠ migratia chiar a fost gasita, altfel proba n-are ce citi", () => {
  assert.ok(M_CLAIM, "nicio migratie nu defineste `claim_discount_use`");
  assert.ok(corpul(M_CLAIM!.text, SEMN_CLAIM).length > 300);
});

const CLAIM = corpul(M_CLAIM!.text, SEMN_CLAIM);

test("⚠⚠ portile campaniei se verifica in ACEEASI instructiune cu incrementul", () => {
  /*
   * Defectul de care ne aparam: cineva „simplifica” mutand verificarea intr-un
   * `select` de dinainte. Atunci, intre citire si scriere, incap oricate
   * checkouturi paralele — si toate trec, fiindca toate citesc acelasi numar.
   */
  const scrierea = instructiunea(CLAIM, "update public.discounts");
  assert.match(scrierea, /uses_count = uses_count \+ 1/, "nu mai creste contorul aici");
  assert.match(scrierea, /max_uses is null or uses_count < max_uses/, "plafonul a iesit din scriere");
  assert.match(scrierea, /\band is_active\b/, "un cod stins se revendica din nou");
  assert.match(scrierea, /starts_at is null or starts_at <= now\(\)/, "un cod programat se revendica din nou");
  assert.match(scrierea, /expires_at is null or expires_at >= now\(\)/, "un cod expirat se revendica din nou");
});

test("⚠ ceasul e al BAZEI, nu unul trimis de apelant", () => {
  /*
   * `now()` se judeca pe ceasul Postgresului. Primit ca argument, ceasul ar fi
   * venit din procesul Node — adica de la partea care tocmai a citit codul si
   * are tot interesul sa-l gaseasca bun.
   */
  assert.ok(!CLAIM.includes("p_acum"), "ceasul a ajuns argument");
  assert.match(
    CLAIM,
    /claim_discount_use\(\s*p_discount_id uuid,\s*p_customer_phone text,\s*p_customer_email text\s*\)/,
    "s-a schimbat semnatura — atunci si granturile, si forma veche, trebuie refacute de mana",
  );
});

test("⚠⚠ cheia omului se socoteste IN SQL, nu se primeste gata facuta", () => {
  /*
   * In TypeScript exista DOUA functii `normalizePhone` care dau raspunsuri
   * deosebite (`lib/customers.ts` si `lib/utils/phone.ts`). Primita gata
   * normalizata, cheia ar fi numarat alti oameni decat pagina Clienti — si
   * nimic n-ar fi dat vreo eroare.
   */
  assert.match(CLAIM, /discount_customer_key\(p_customer_phone, p_customer_email\)/);
  assert.ok(!CLAIM.includes("p_customer_key"), "cheia ajunge gata facuta de la apelant");
});

test("⚠⚠ fara telefon si fara email, un cod cu limita per client se REFUZA", () => {
  /*
   * Acolo nu exista niciun fel de „acelasi om", deci limita n-ar margini nimic
   * si codul s-ar lua de oricate ori dintr-un singur browser. `order_customer_key`
   * cade in cazul asta pe `'order:' || order_id` — o cheie noua la fiecare
   * comanda — si de-aia revendicarea NU are voie s-o foloseasca.
   */
  /* ⚠ Si „doar prima comanda" e o margine pe OM, deci cade in aceeasi poarta. */
  assert.match(CLAIM, /if \(v_lim is not null or v_prima\) and v_key is null then[\s\S]{0,100}?return null;/);
  /*
   * ⚠ Cheia pe care se REZERVA e cea cu doua ramuri. `order_customer_key` (cea
   * cu trei, care cade pe `'order:' || id`) apare si ea in functie, dar numai in
   * intrebarea despre comenzile DEJA EXISTENTE — acolo `order_id` exista si
   * ramura a treia e in regula. Folosita pentru rezervare, ar fi dat un om nou
   * la fiecare comanda.
   */
  assert.ok(!/v_key\s*:=\s*public\.order_customer_key/.test(CLAIM),
    "rezervarea se cheie pe cheia cu trei ramuri");
  const inainteDeRezervare = CLAIM.slice(0, CLAIM.indexOf("reserve_discount_for_customer"));
  assert.match(inainteDeRezervare, /v_key := public\.discount_customer_key/);
});

test("⚠⚠ rezervarea pe om vine INAINTEA contorului global", () => {
  /*
   * Scrise invers, un refuz al campaniei (plafon atins, cod stins intre timp)
   * ar fi lasat omul cu o folosire arsa degeaba — si nimic nu i-ar mai fi dat-o
   * inapoi, fiindca nicio comanda nu s-ar fi facut.
   */
  const iRezervare = CLAIM.indexOf("reserve_discount_for_customer");
  const iContor = CLAIM.indexOf("update public.discounts");
  assert.ok(iRezervare > -1 && iContor > iRezervare,
    "contorul global se creste inaintea rezervarii pe om");
});

test("⚠⚠ refuzul campaniei INTOARCE si rezervarea, nu doar se opreste", () => {
  /*
   * In PL/pgSQL, un bloc cu `exception` e o subtranzactie: ce s-a scris in el se
   * intoarce cand exceptia e prinsa. De-aia refuzul se ARUNCA, nu se intoarce cu
   * `return`: un `return null` simplu ar fi lasat randul de registru scris.
   */
  assert.match(CLAIM, /raise exception 'campania refuza' using errcode = 'P0001'/);
  /* ⚠ `[\s\S]{0,200}?` fiindca intre ele sta un comentariu — si el trebuie sa poata
     fi rescris fara sa cada proba. Ce se cere e ca ramura sa se intoarca cu `null`. */
  assert.match(CLAIM, /when sqlstate 'P0001' then[\s\S]{0,300}?return null;/);
});

/* ── Rezervarea, scrisa o singura data ──────────────────────────────────── */

const SEMN_REZ = "create or replace function public.reserve_discount_for_customer(";
const M_REZ = undeSeScrie(SEMN_REZ);
const REZ = corpul(M_REZ!.text, SEMN_REZ);

test("⚠⚠ limita pe om se verifica in CHIAR insertul care rezerva", () => {
  /*
   * ⚠⚠ SI DE-AIA NU SE NUMARA DIN `orders`. La clipa revendicarii comanda inca
   * NU EXISTA (revendicarea e la `order.actions.ts:1887`, insertul la `:1914`),
   * iar sub READ COMMITTED subinterogarea peste `orders` se citeste pe
   * instantaneul de la inceputul instructiunii. Doua comenzi simultane ale
   * aceluiasi om ar numara amandoua zero.
   */
  const ins = instructiunea(REZ, "insert into public.discount_customer_uses");
  /* ⚠ Limita LUCRATOARE: cea scrisa de om, iar in lipsa ei 1 la un cod de prima
     comanda. Scrisa doar ca `per_customer_limit`, un cod de bun venit fara limita
     explicita n-ar fi fost serializat de nimic. */
  assert.match(ins, /coalesce\(d\.per_customer_limit, case when d\.doar_prima_comanda then 1 end\)/,
    "limita lucratoare a iesit din insert");
  assert.match(ins, /from public\.discount_customer_uses u/, "nu mai numara rezervarile");
  assert.ok(!/from public\.orders/i.test(REZ), "rezervarea numara din `orders`, care inca nu are randul");
});

test("⚠⚠ indexul UNIC e cel care serializeaza, si exista", () => {
  /*
   * Singurul lucru care opreste doua tranzactii care nu ating acelasi rand deja
   * existent. Fara el, o limita de 3 ar fi lasat sa treaca oricate, daca veneau
   * in aceeasi clipa.
   */
  const toate = MIGRATII.map((m) => m.text).join("\n");
  assert.match(toate, /unique \(discount_id, customer_key, ordinal\)/);
});

test("⚠ ciocnirea pe index se reia, nu se preface in eroare", () => {
  assert.match(REZ, /when unique_violation then/, "ciocnirea nu mai e prinsa");
  assert.match(REZ, /continue;/, "nu se mai reia dupa ciocnire");
  assert.match(REZ, /for i in 1\.\.\d+ loop/, "nu mai exista reluare");
});

test("⚠ rezervarea NU are porti de calendar, si asta e dinadins", () => {
  /*
   * O cheama si `reclaim_order_discount`, adica desfacerea unei anulari. Comanda
   * exista deja si a fost platita: o campanie incheiata intre timp n-are de ce
   * s-o opreasca. Portile de calendar stau la apelant, nu aici.
   */
  assert.ok(!REZ.includes("starts_at"), "calendarul a intrat in rezervare");
  assert.ok(!REZ.includes("expires_at"), "calendarul a intrat in rezervare");
});

/* ── Cele trei drumuri pe care utilizarea se da inapoi ──────────────────── */

const SEMN_REL = "create or replace function public.release_discount_claim(";
const REL = corpul(undeSeScrie(SEMN_REL)!.text, SEMN_REL);

test("⚠⚠ eliberarea de dinainte de comanda primeste MARCA, nu id-ul cuponului", () => {
  /*
   * `release_discount_use(p_discount_id)`, cea de pana azi, nu avea de unde sti
   * CINE revendicase: randul omului ar fi ramas pe loc pentru totdeauna, iar el
   * si-ar fi ars definitiv folosirea pe o comanda care nu s-a facut niciodata.
   */
  assert.match(REL, /release_discount_claim\(p_use_id uuid\)/);
  assert.match(REL, /delete from public\.discount_customer_uses/);
  assert.match(REL, /uses_count = greatest\(uses_count - 1, 0\)/);

  const toate = MIGRATII.map((m) => m.text).join("\n");
  assert.match(toate, /drop function if exists public\.release_discount_use\(uuid\)/,
    "forma veche, care scade contorul fara sa stie cine l-a crescut, e inca in baza");
});

const SEMN_RELO = "create or replace function public.release_order_discount(";
const RELO = corpul(undeSeScrie(SEMN_RELO)!.text, SEMN_RELO);

test("⚠⚠ anularea unei comenzi da inapoi SI dreptul omului, nu doar pe al campaniei", () => {
  assert.match(RELO, /discount_use_id/, "nu se mai uita la marca");
  assert.match(RELO, /release_discount_claim\(v_use_id\)/, "nu mai sterge randul omului");
});

const SEMN_RECL = "create or replace function public.reclaim_order_discount(";
const RECL = corpul(undeSeScrie(SEMN_RECL)!.text, SEMN_RECL);

test("⚠⚠ desfacerea unei anulari trece prin ACEEASI rezervare, nu printr-o copie", () => {
  /*
   * Pana azi aici era scrisa a doua oara numai verificarea de plafon: o comanda
   * anulata si readusa trecea peste ORICE limita per client, si nimic n-o
   * semnala. Al doilea om care foloseste codul intre timp nu se vedea nicaieri.
   */
  assert.match(RECL, /reserve_discount_for_customer\(v_discount_id, v_key\)/);
  assert.match(RECL, /discount_use_id = v_use_id/, "marca nu se scrie inapoi pe comanda");
  assert.match(RECL, /when sqlstate 'P0001' then[\s\S]{0,300}?return 'plin';/,
    "un refuz al plafonului lasa rezervarea scrisa");
});

/* ── „Doar la prima comanda" ────────────────────────────────────────────── */

test("⚠⚠ intrebarea despre trecut se pune INAINTE de orice scriere", () => {
  /*
   * Raspunsul ei nu depinde de ce facem acum, deci refuzul nu lasa nimic de
   * compensat. Pusa dupa rezervare, un cod de bun venit refuzat ar fi lasat
   * randul de registru scris — si omul n-ar mai fi putut folosi codul niciodata,
   * desi nu i s-a dat nimic.
   */
  const iIntrebare = CLAIM.indexOf("v_prima and exists");
  const iRezervare = CLAIM.indexOf("reserve_discount_for_customer");
  assert.ok(iIntrebare > -1, "poarta primei comenzi a disparut");
  assert.ok(iIntrebare < iRezervare, "se scrie in registru inainte sa se stie daca omul are dreptul");
});

test("⚠⚠ se numara ORICE comanda a omului la magazinul asta, si cele anulate", () => {
  /*
   * Comerciantul spune „pentru clienti noi"; cineva care a comandat si a anulat
   * nu mai e nou. Alegerea e scrisa si pe ecran, langa comutator.
   */
  const bucata = CLAIM.slice(CLAIM.indexOf("v_prima and exists"));
  assert.match(bucata.slice(0, 400), /from public\.orders o/);
  assert.match(bucata.slice(0, 400), /o\.business_id = v_biz/, "intrebarea nu e marginita la magazin");
  assert.ok(!/status/.test(bucata.slice(0, 400)), "comenzile anulate au fost scoase din numaratoare");
});

test("⚠⚠ „prima comanda” inseamna de la sine O SINGURA folosire per om", () => {
  /*
   * Altfel ramanea o cursa: doua comenzi trimise deodata la primul cumparat ar
   * vedea amandoua zero comenzi de dinainte, si ar trece amandoua. Limita
   * lucratoare cade pe 1 chiar cand `per_customer_limit` e gol, si atunci
   * indexul unic serializeaza cererile.
   */
  assert.match(REZ, /coalesce\(d\.per_customer_limit, case when d\.doar_prima_comanda then 1 end\)/);
});

test("⚠ desfacerea unei anulari NU reintreaba daca e prima comanda", () => {
  /*
   * Acolo omul ARE deja comanda — chiar pe cea readusa la viata — deci
   * intrebarea n-ar mai avea raspuns bun niciodata, si o anulare facuta din
   * greseala n-ar mai putea fi desfacuta.
   */
  assert.ok(!RECL.includes("doar_prima_comanda"), "reluarea intreaba despre prima comanda");
});

test("⚠ intrebarea are un index sub ea", () => {
  /*
   * Fara el, „are omul asta vreo comanda?" e o parcurgere a intregii tabele de
   * comenzi la FIECARE plasare cu un cod de bun venit — adica pe drumul cel mai
   * cald al magazinului.
   */
  const t = MIGRATII.map((m) => m.text).join("\n");
  assert.match(t, /create index if not exists idx_orders_business_customer_key/);
  assert.match(t, /on public\.orders \(business_id, public\.order_customer_key\(customer_phone, customer_email, id\)\)/);
});

/* ── Cine are voie sa le cheme ──────────────────────────────────────────── */

test("⚠ toate trei raman inchise pentru oricine in afara de `service_role`", () => {
  const t = MIGRATII.map((m) => m.text).join("\n");
  for (const f of [
    "public.claim_discount_use(uuid, text, text)",
    "public.reserve_discount_for_customer(uuid, text)",
    "public.release_discount_claim(uuid)",
  ]) {
    const esc = f.replace(/[().]/g, (c) => `\\${c}`);
    assert.match(t, new RegExp(`revoke all on function ${esc} from public;`), f);
    assert.match(t, new RegExp(`revoke all on function ${esc} from anon, authenticated;`), f);
    assert.match(t, new RegExp(`grant execute on function ${esc} to service_role;`), f);
  }
  /* ⚠ Fara asta, PostgREST serveste mai departe semnatura veche din cacheul lui. */
  assert.match(M_CLAIM!.text, /notify pgrst, 'reload schema'/);
});

test("⚠⚠ semnatura veche cu un singur argument se STERGE pe fata", () => {
  /*
   * `create or replace` nu poate schimba nici numarul de argumente, nici tipul
   * intors: forma veche ar fi ramas in baza ca supraincarcare care ocoleste
   * toata regula noua, cu granturile ei nemiscate.
   */
  const t = MIGRATII.map((m) => m.text).join("\n");
  assert.match(t, /drop function if exists public\.claim_discount_use\(uuid\);/);
});

test("⚠⚠ stergerea formei vechi vine DUPA ultima migratie care o scrie", () => {
  /*
   * ⚠⚠ DEFECT ADEVARAT, GASIT DE PROBA ASTA (21.09.2026). Migratia care aduce
   * limita per client se numea `…-o-data-per-client.sql` si se aseza ALFABETIC
   * INAINTEA lui `…-programare.sql`, adica inaintea celei care inca scria forma
   * cu un singur argument.
   *
   * Pe baza pe care s-a lucrat nu s-a vazut nimic: acolo migratiile s-au aplicat
   * in ordinea in care le-am scris. Dar o baza refacuta din dosar, in ordinea
   * numelor, ar fi sters forma veche si apoi ar fi CREAT-O la loc — o a doua
   * usa catre contor, care nu stie nimic despre niciun client.
   *
   * ⚠ Dosarul nu are numere de ordine, doar date, iar in aceeasi zi ordinea e
   * data de nume. Deci asta nu se poate cere unui cititor atent: se cere aici.
   */
  const scriu = MIGRATII.filter((m) => m.text.includes("function public.claim_discount_use(p_discount_id uuid)\n"));
  const sterg = MIGRATII.filter((m) => m.text.includes("drop function if exists public.claim_discount_use(uuid);"));
  assert.ok(sterg.length > 0, "nimeni nu mai sterge forma veche");

  const ultimaCareScrie = scriu.at(-1)!.f;
  const ultimaCareSterge = sterg.at(-1)!.f;
  assert.ok(
    ultimaCareSterge > ultimaCareScrie,
    `„${ultimaCareSterge}" se aseaza inaintea lui „${ultimaCareScrie}", deci pe o baza refacuta din dosar forma veche ar renaste`,
  );
});

/* ── Tabela registrului ─────────────────────────────────────────────────── */

test("⚠⚠ registrul e inchis pentru `anon`, si are RLS", () => {
  /*
   * Supabase da ALL pe orice tabela noua catre `anon` si `authenticated`. RLS e
   * a doua broasca, nu prima — si TRUNCATE nu e filtrat de RLS deloc.
   */
  const t = MIGRATII.map((m) => m.text).join("\n");
  assert.match(t, /alter table public\.discount_customer_uses enable row level security/);
  assert.match(t, /revoke all on table public\.discount_customer_uses from anon, authenticated/);
  assert.match(t, /create policy discount_customer_uses_ale_magazinului/);
  /* ⚠ Politica trece prin `businesses`, nu doar pe `business_id`: altfel oricine
     ar citi registrul altuia ghicind un uuid. */
  assert.match(t, /from public\.businesses b\s*\n\s*where b\.id = discount_customer_uses\.business_id and b\.user_id = \(select auth\.uid\(\)\)/);
});

test("⚠ stergerea unui rand de registru NU are voie sa stearga comanda", () => {
  /* `on delete set null`: un rand sters inseamna „utilizarea s-a dat inapoi". */
  const t = MIGRATII.map((m) => m.text).join("\n");
  assert.match(t, /foreign key \(discount_use_id\) references public\.discount_customer_uses\(id\) on delete set null/);
});

/* ── Telefonul, reparat ca sa poata sta la temelie ──────────────────────── */

test("⚠⚠ `normalize_phone` taie TOATE zerourile din fata, nu unul", () => {
  /*
   * Nu era idempotenta: `0722…` -> `722…`, dar `00722…` -> `0722…` (alt om) si
   * `000722…` -> `00722…` (al treilea). Acelasi telefon adevarat, la nesfarsit
   * alti oameni — iar comanda ajunge tot la el, fiindca numarul e bun. Fara
   * reparatia asta, „o data per client" se trece adaugand un zero.
   */
  const m = undeSeScrie("create or replace function public.normalize_phone(");
  assert.ok(m, "nicio migratie nu rescrie `normalize_phone`");
  const corp = corpul(m!.text, "create or replace function public.normalize_phone(");
  assert.match(corp, /regexp_replace\(s2, '\^0\+', ''\)/);
  assert.ok(!corp.includes("substr(s2, 2)"), "s-a intors la taiatul unui singur zero");

  /* ⚠ Indexul e scris PE functie: nereconstruit, ar fi pastrat valorile vechi. */
  assert.match(m!.text, /reindex index public\.idx_orders_business_normphone/);
  /* ⚠⚠ Si `customers.key` e o coloana GENERATA STORED cu aceeasi formula. */
  assert.match(m!.text, /GENERATA STORED/);
});
