import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { METODE_ANULABILE, sePoateAnulaDinCont } from "./anulare-reguli";
import { eZonaDeCont } from "./zona";
import { adresaListeiDinCerere } from "./panou-texte";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDITUL DE DINAINTEA UNIRII                                   (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de proprietar: „mai fa un audit complet la tot sistemul asta si daca e
 * totul perfect 10/10 din toate punctele de vedere...”. Cinci auditori
 * independenti; fiecare proba de aici apara o reparatie a lor, ca sa nu se
 * intoarca la prima retusare.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");
const M54 = "2026-09-24-conturi-clienti-zzzz-reparatiile-auditului.sql";

const MIGRATII = readdirSync(join(RAD, "migrations"))
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-"))
  .sort()
  .map((f) => ({ f, text: readFileSync(join(RAD, "migrations", f), "utf8").replace(/\r\n/g, "\n") }));

function corpul(nume: string): { f: string; corp: string } {
  const caps = [`create or replace function public.${nume}(`, `create function public.${nume}(`];
  const m = MIGRATII.filter((x) => caps.some((c) => x.text.includes(c))).at(-1);
  if (!m) return { f: "", corp: "" };
  const i = Math.max(...caps.map((c) => m.text.lastIndexOf(c)));
  const a = m.text.indexOf("$$", i);
  const b = m.text.indexOf("$$", a + 2);
  return { f: m.f, corp: m.text.slice(a + 2, b) };
}

/* ═══ SQL ═══ */

test("⚠ functiile reparate dupa audit au ultima definitie in migratia 54", () => {
  for (const n of [
    "cont_anuleaza_comanda", "cont_maturare", "cont_sesiune_verifica", "cont_incercare_parola",
    "cont_incercare_reusita", "cont_cere_cod", "cont_sterge_contact", "cont_verifica_cod", "cont_sterge",
    "cont_export", "cont_panou_lista", "cont_panou_fisa", "cont_panou_comanda_de_legat", "cont_panou_chei",
  ]) {
    const { f, corp } = corpul(n);
    assert.equal(f, M54, n);
    assert.ok(corp.length > 80, `${n}: ${corp.length} semne`);
  }
});

test("⚠⚠ anularea din cont: comanda blocata, numai neplatita si cu plata care nu poate fi in curs", () => {
  const c = corpul("cont_anuleaza_comanda").corp;
  const blocare = c.indexOf("for update");
  assert.ok(blocare > 0 && blocare < c.indexOf("aplica_tranzitia_comenzii"), "starea se citeste fara blocare");
  assert.match(c, /coalesce\(v_o\.payment_status, 'unpaid'\) <> 'unpaid'/);
  const lista = c.match(/not in \(([^)]*)\)/)?.[1] ?? "";
  const dinSql = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(dinSql, [...METODE_ANULABILE].sort(), "lista din baza si cea din ecran s-au despartit");
});

test("regula anularii, pe ecran", () => {
  const baza = { stare: "pending", starePlata: "unpaid", metodaPlata: "cash_on_delivery" };
  assert.equal(sePoateAnulaDinCont(baza), true);
  assert.equal(sePoateAnulaDinCont({ ...baza, metodaPlata: "stripe" }), false);
  assert.equal(sePoateAnulaDinCont({ ...baza, metodaPlata: "netopia" }), false);
  assert.equal(sePoateAnulaDinCont({ ...baza, starePlata: "paid" }), false);
  assert.equal(sePoateAnulaDinCont({ ...baza, stare: "confirmed" }), false);
  assert.equal(sePoateAnulaDinCont({ ...baza, starePlata: null }), true);
  assert.equal(sePoateAnulaDinCont({ ...baza, metodaPlata: null }), false);
  assert.match(citeste("src/components/storefront/cont/ecrane/EcranComanda.tsx"), /sePoateAnulaDinCont\(/);
});

test("⚠⚠ anularea din cont are urmarile anularii din panou: emailuri si GA4", () => {
  const r = citeste("src/app/api/cont/comanda/route.ts");
  const ok = r.indexOf("if (!r.ok) return");
  assert.ok(ok > 0 && ok < r.indexOf("dupaAnulareaDinCont(magazin, orderId)"));
  const a = citeste("src/lib/cont/anulare.ts");
  for (const x of ["raporteazaRambursareaGa4(orderId)", "sendOrderStatusToCustomer(", "sendComandaAnulataDeClient("]) {
    assert.ok(a.includes(x), x);
  }
});

test("⚠ bugetul zilnic de coduri trece prin garda de cifre (o setare stricata nu mai arunca)", () => {
  const c = corpul("cont_cere_cod").corp;
  assert.match(c, /~ '\^\[0-9\]\{1,5\}\$'/);
  assert.doesNotMatch(c, /'buget_email_zilnic' end\)\)::integer,/, "cast-ul fara garda s-a intors");
});

test("⚠ „ultimul email confirmat” se numara sub incuietoarea contului", () => {
  const c = corpul("cont_sterge_contact").corp;
  const blocare = c.indexOf("for update");
  assert.ok(blocare > 0 && blocare < c.indexOf("select count(*) into v_ramase"));
});

test("⚠ maturarea merge pe indexuri (doua brate, fara SAU) si ia numele numai din comenzile omului", () => {
  const c = corpul("cont_maturare").corp;
  assert.match(c, /public\.normalize_phone\(o\.customer_phone\) = c\.valoare/);
  assert.match(c, /lower\(btrim\(o\.customer_email\)\) = c\.valoare/);
  assert.match(c, /\n\s+union\n/);
  assert.doesNotMatch(c, /nullif\(lower\(btrim\(coalesce\(o\.customer_email/, "forma care ocolea indexul s-a intors");
  assert.match(c, /and l\.temei <> 'legat-de-comerciant'\s+order by o\.created_at desc/);
});

test("⚠⚠ adresa noua in cont: codul altui cont nu se potriveste si nu se arde, 10 pe zi pe adresa", () => {
  const c = corpul("cont_verifica_cod").corp;
  assert.match(c, /and x\.cod_hash = p_cod_hash and x\.cont_id = p_cont/);
  assert.match(c, /and c\.fel = p_fel and c\.destinatie = v_dest and c\.folosit_la is null\s+and c\.cont_id = p_cont;/);
  assert.match(c, /interval '24 hours';\s+if v_incercari >= 10 then/);
  /* Plafonul zilnic e tot al contului: ghicirile altui cont nu-l tin pe om afara o zi. */
  assert.match(c, /and x\.fel = p_fel and x\.destinatie = v_dest and x\.cont_id = p_cont\s+and x\.creat_la > now\(\) - interval '24 hours';/);
});

test("⚠ sesiunea: gratia rotirii tine omul in cont, cu aceleasi conditii; prelungirea cel mult o data pe ora", () => {
  const c = corpul("cont_sesiune_verifica").corp;
  const gratie = c.slice(c.indexOf("s.incheiata_la > now() - r.gratie_rotire"), c.indexOf("if s.motiv_incheiere = 'rotire' then"));
  for (const x of ["c.sters_la is not null", "c.suspendat_la is not null", "c.epoca_sesiunii <> s.epoca", "pornit is not true", "return query select c.id, c.nume, false;"]) {
    assert.ok(gratie.includes(x), x);
  }
  assert.match(c, /if s\.inactiva_dupa < least\(now\(\) \+ r\.inactivitate, s\.expira_la\) - interval '1 hour' then/);
});

test("⚠⚠ incercarea de parola se rezerva sub incuietoare si nu mai prelungeste un blocaj", () => {
  const c = corpul("cont_incercare_parola").corp;
  const lacat = c.indexOf("pg_advisory_xact_lock");
  assert.ok(lacat > 0 && lacat < c.indexOf("select count(*) into v_cate"));
  assert.ok(c.indexOf("if v_cate >= 5 then") < c.indexOf("insert into privat.cont_jurnal"), "blocat = nimic scris");
  assert.match(corpul("cont_incercare_reusita").corp, /j\.fapta = 'parola-gresita'/);

  const a = citeste("src/lib/cont/autentificare.ts");
  for (const [nume, capat] of [["export async function intraCuParola(", "export type ContulCuParola"], ["export async function parolaDinCont(", "export async function parolaNouaEAceeasi("]] as const) {
    const corp = a.slice(a.indexOf(nume), a.indexOf(capat));
    const rezerva = corp.indexOf("cont_incercare_parola");
    const compara = corp.indexOf("await parolaPotrivita(");
    assert.ok(rezerva > 0 && compara > rezerva, `${nume}: comparatia vine inaintea rezervarii`);
    assert.ok(corp.indexOf("await elibereazaRezervarea(") > compara, `${nume}: reusita nu-si sterge rezervarea`);
    assert.match(corp, /if \(rezervare === null\) \{/, `${nume}: greseala s-ar scrie de doua ori`);
  }
});

test("⚠ stergerea contului scoate si blocajele de pe adresele lui; exportul ascunde IP-urile straine", () => {
  const s = corpul("cont_sterge").corp;
  assert.ok(s.indexOf("delete from privat.cont_contact_blocat") < s.indexOf("delete from privat.cont_contact x"), "blocajele se sterg dupa contacte (nu le mai gaseste)");
  assert.match(corpul("cont_export").corp, /when j\.fapta in \('parola-gresita', 'intrare-refuzata'\) then privat\.cont_ip_ascuns\(j\.ip\)/);
});

test("panoul: numele si telefonul nu vin din comenzi legate de mana; previzualizarea cere contacte confirmate", () => {
  const l = corpul("cont_panou_lista").corp;
  assert.equal((l.match(/l\.temei <> 'legat-de-comerciant'/g) ?? []).length, 3);
  assert.match(corpul("cont_panou_fisa").corp, /l\.cont_id = c\.id and l\.temei <> 'legat-de-comerciant'/);
  assert.match(corpul("cont_panou_comanda_de_legat").corp, /k\.cont_id = p_cont and k\.verificat_la is not null/);
  /* Lista alege pagina INAINTE sa imbogateasca randurile. */
  assert.ok(l.indexOf("pagina as (") < l.indexOf("public.cont_preferinte(p_business, p.id)"));
});

test("⚠ toate functiile din 54 sunt numai pentru `service_role`, iar indexul cheii straine exista", () => {
  const m = MIGRATII.find((x) => x.f === M54)!.text;
  const definite = [...m.matchAll(/create or replace function (public\.[a-z_]+)\(/g)].map((x) => x[1]);
  const grant = m.slice(m.indexOf("foreach f in array array["), m.indexOf("] loop"));
  for (const d of definite) assert.ok(grant.includes(`'${d}(`), d);
  assert.match(m, /create index if not exists idx_cont_instiintare_magazin on privat\.cont_instiintare \(business_id\);/);
});

/* ═══ Cod ═══ */

test("⚠⚠ legaturile spre cont din vitrina sunt `<a>`, nu `<Link>` (fara pixeli si fara preluare in avans)", () => {
  for (const f of ["src/components/storefront/cont/ActiuneCont.tsx", "src/components/storefront/cont/ContulDupaComanda.tsx"]) {
    const s = citeste(f);
    assert.doesNotMatch(s, /from "next\/link"/, f);
    assert.match(s, /<a\s/, f);
  }
});

test("zona de cont e ancorata la inceputul caii", () => {
  assert.equal(eZonaDeCont("/cont", "magazin"), true);
  assert.equal(eZonaDeCont("/cont/comenzi/abc", "magazin"), true);
  assert.equal(eZonaDeCont("/magazin/cont", "magazin"), true);
  assert.equal(eZonaDeCont("/magazin/cont/date", "magazin"), true);
  assert.equal(eZonaDeCont("/produs/cont", "magazin"), false);
  assert.equal(eZonaDeCont("/magazin/produs/cont", "magazin"), false);
  assert.equal(eZonaDeCont("/contact", "magazin"), false);
  assert.equal(eZonaDeCont("/magazin/contact", "magazin"), false);
});

test("⚠ o sesiune care nu mai e raspunde 401 cu mesaj, nu 404", () => {
  for (const r of ["comanda", "contact", "preferinte", "sterge", "parola"]) {
    const s = citeste(`src/app/api/cont/${r}/route.ts`);
    assert.match(s, /if \(!s\) return sesiuneExpirata\(\);/, r);
  }
  assert.match(citeste("src/lib/cont/ruta-document.ts"), /if \(!s\) return sesiuneExpirata\(\);/);
});

test("⚠ iesirea refuza un `Origin` strain, dar nu cere unul", () => {
  const s = citeste("src/app/api/cont/iesire/route.ts");
  assert.match(s, /if \(req\.headers\.get\("origin"\) && !vineDePeMagazin\(req\)\)/);
});

test("⚠⚠ pasul codului: dupa prea multe greseli sau pe un cont suspendat, ecranul reia de la inceput", () => {
  const s = citeste("src/app/api/cont/pas/route.ts");
  assert.match(s, /r\.motiv === "prea-multe-incercari" \|\| r\.motiv === "suspendat"/);
  assert.ok(s.indexOf("await anuntaParolaSchimbata(") < s.indexOf("await incheieIntrarea("), "emailul de siguranta vine dupa sesiune");
});

test("⚠⚠ schimbarea parolei: emailul de siguranta intai, sesiunea separat, aceeasi parola refuzata", () => {
  const s = citeste("src/app/api/cont/parola/route.ts");
  assert.ok(s.indexOf("await anuntaParolaSchimbata(") < s.indexOf("await deschideSesiune("));
  assert.match(s, /reintra: true/);
  assert.match(s, /await parolaNouaEAceeasi\(/);
  /* Emailul de siguranta pe toate adresele confirmate. */
  const a = citeste("src/lib/cont/autentificare.ts");
  const f = a.slice(a.indexOf("export async function anuntaParolaSchimbata("));
  assert.match(f, /c\.fel === "email" && c\.verificat/);
  assert.match(f, /for \(const a of adrese\)/);
});

test("⚠ filtrul „cu cont” citeste cheile pe pagini (PostgREST taie la 1000)", () => {
  const s = citeste("src/lib/cont/panou.ts");
  const f = s.slice(s.indexOf("export async function conturileClientilor("));
  assert.match(f, /\.range\(de, de \+ PAGINA - 1\)/);
  assert.match(f, /if \(\(data \?\? \[\]\)\.length < PAGINA\) break;/);
});

test("setarile conturilor: domeniul se cere numai la pornire, plafonul cel putin 1", () => {
  const s = citeste("src/lib/actions/cont-client.actions.ts");
  assert.match(s, /if \(curatat\.enabled && !curent\.enabled\) \{\n\s+const v = poateAprindeConturi/);
  assert.match(s, /if \(curatat\.enabled && curatat\.buget_email_zilnic < 1\)/);
});

test("⚠ comanda din cont fara email in formular primeste adresa contului, pe ambele drumuri", () => {
  const s = citeste("src/lib/actions/order.actions.ts");
  assert.equal((s.match(/if \(poartaCont\.contId && !data\.customer_email\?\.trim\(\)\) \{/g) ?? []).length, 2);
});

test("⚠ la intoarcerea in pagina, pasul contului se reciteste si cand „obligatoriu” a venit dupa incarcare", () => {
  const s = citeste("src/components/storefront/cont/contul-la-comanda.ts");
  assert.match(s, /if \(!activ \|\| !necesar\) return;/);
});

test("⚠ „Toate conturile” primeste inapoi NUMAI lista conturilor (nicio redirectionare deschisa)", () => {
  const baza = "/dashboard/customers?fila=conturi";
  assert.equal(adresaListeiDinCerere(undefined), baza);
  assert.equal(adresaListeiDinCerere(`${baza}&q=ana&stare=suspendate&page=2`), `${baza}&q=ana&stare=suspendate&page=2`);
  for (const rau of ["https://rau.ro", "//rau.ro", "/dashboard/orders", `${baza}/../x`, `${baza}"><script>`, `${baza}x`, "x".repeat(400)]) {
    assert.equal(adresaListeiDinCerere(rau), baza, rau);
  }
  assert.equal(adresaListeiDinCerere([`${baza}&page=3`, "https://rau.ro"]), `${baza}&page=3`);
  /* `URLSearchParams` lasa `*` necodat: o cautare cu stea nu-si mai pierde locul. */
  const cuStea = `${baza}&${new URLSearchParams({ q: "ana*" }).toString()}`;
  assert.equal(adresaListeiDinCerere(cuStea), cuStea);
});

test("⚠ intrarea cu parola: refuzurile de dupa parola buna", () => {
  const a = citeste("src/lib/cont/autentificare.ts");
  const intra = a.slice(a.indexOf("export async function intraCuParola("), a.indexOf("export type ContulCuParola"));
  /* „Ai deja cod": omul e dus la ecranul codului, provocarea din cookie e inca a lui. */
  assert.match(intra, /\(pas\.motiv === "are-cod-viu" \|\| pas\.motiv === "prea-multe"\) && \(await arePas\(\)\)\) \{\s+return \{ rezultat: "cod", mesaj:/);
  assert.match(citeste("src/app/api/cont/intra/route.ts"), /mesaj: r\.mesaj \?\? "Ti-am trimis un cod pe email/);
  /* Blocajul aparut intre cele doua citiri nu scoate dispozitivul de incredere. */
  assert.match(intra, /if \(ri\?\.blocat === true\) \{\s+if \(await dispozitivCunoscut\(p\.magazin\.id, contId\)\) deIncredere = true;\s+else blocatCont = true;/);
  /* Rezervarea eliberata cu eroarea citita, in ambele usi. */
  assert.equal(a.split("await elibereazaRezervarea(").length - 1, 2);
  assert.equal(a.split('rpc("cont_incercare_reusita"').length - 1, 1);
  assert.match(a, /rpc\("cont_incercare_reusita"[^;]+;\s+if \(error\) throw error;/);
});

test("⚠ contul nou: refuzul sterge provocarea veche (ea poarta parola de atunci)", () => {
  const a = citeste("src/lib/cont/autentificare.ts");
  assert.match(a, /\} else if \(p\.scop === "inregistrare"\) \{[\s\S]{0,300}\(await cookies\(\)\)\.delete\(COOKIE_PAS\);/);
});

test("parola schimbata fara sesiune: intrarea spune de ce; cererea de stergere numai dupa stergere reusita", () => {
  assert.match(citeste("src/components/storefront/cont/SchimbaParola.tsx"), /window\.location\.href = "\/cont\/intra\?parola=1";/);
  assert.match(citeste("src/app/(public)/[slug]/cont/intra/page.tsx"), /dupaParolaNoua=\{parola === "1"\}/);
  assert.match(citeste("src/components/storefront/cont/ecrane/EcranIntrare.tsx"), /Parola ta a fost schimbata\./);
  assert.match(citeste("src/app/api/cont/sterge/route.ts"), /const cerereTrimisa = vreaCerere && r\.ok \? await trimiteCerereaDeStergere/);
});
