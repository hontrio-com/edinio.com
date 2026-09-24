import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CAUTARE_MAXIMA, FAPTE_CUNOSCUTE, TEMEIURI, adresaListei, citesteFisa, descrieFapta, etichetaTemeiului,
  mesajulDezlegarii, mesajulLegarii, numeleContului, ordineValida, stareValida,
} from "./panou-texte";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PANOUL CONTURILOR, LA COMERCIANT                              (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de proprietar: „si comerciantul poate vedea toate conturile create in
 * magazinul lui si detalii despre fiecare cont in parte?”, apoi „fa-o complet si
 * cu mare atentie”.
 *
 * Probele apara trei lucruri care s-ar strica fara zgomot:
 *   1. SUSPENDAREA se tine in BAZA, pe fiecare drum de intrare, nu doar in ecran;
 *   2. NIMIC SECRET nu iese catre panou (amprente, jetoane, IP-uri intregi);
 *   3. eticheta „are cont” si lista de clienti folosesc ACEEASI cheie.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");

const MIGRATII = readdirSync(join(RAD, "migrations"))
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-"))
  .sort()
  .map((f) => ({ f, text: readFileSync(join(RAD, "migrations", f), "utf8").replace(/\r\n/g, "\n") }));

const M53 = "2026-09-24-conturi-clienti-zzz-panoul-conturilor.sql";

/** Corpul ULTIMEI definitii a unei functii (ordinea numelor e si cea a aplicarii aici). */
function corpul(nume: string): { f: string; corp: string } {
  const cap = `create or replace function ${nume.includes(".") ? nume : `public.${nume}`}(`;
  const m = MIGRATII.filter((x) => x.text.includes(cap)).at(-1);
  if (!m) return { f: "", corp: "" };
  const i = m.text.lastIndexOf(cap);
  const a = m.text.indexOf("$$", i);
  const b = m.text.indexOf("$$", a + 2);
  return { f: m.f, corp: m.text.slice(a + 2, b) };
}

/* ═══ 1. Suspendarea, in baza ═══ */

test("⚠ functiile redefinite si cele noi au ultima definitie in migratia 53", () => {
  for (const n of [
    "cont_sesiune_creeaza", "cont_verifica_provocare", "cont_verifica_suspendarea",
    "cont_panou_lista", "cont_panou_sumar", "cont_panou_fisa", "cont_panou_suspenda", "cont_panou_reactiveaza",
    "cont_panou_iesire", "cont_panou_sterge", "cont_panou_comanda_de_legat", "cont_panou_leaga_comanda",
    "cont_panou_dezleaga_comanda", "cont_panou_chei",
  ]) {
    const { f, corp } = corpul(n);
    assert.equal(f, M53, n);
    assert.ok(corp.length > 100, `${n}: corp de ${corp.length} semne`);
  }
});

test("⚠⚠ un cont suspendat nu primeste sesiune, pe niciun drum", () => {
  /*
   * `cont_sesiune_creeaza` e SINGURA usa a sesiunilor noi (intrarea cu parola,
   * pasul doi, contul nou, resetarea trec toate prin ea). Iar suspendarea ridica
   * epoca, deci sesiunile deschise inainte cad la urmatoarea verificare.
   */
  assert.match(corpul("cont_sesiune_creeaza").corp, /and c\.sters_la is null\s+(\/\*[^*]*\*\/\s+)?and c\.suspendat_la is null;/);
  const s = corpul("cont_panou_suspenda").corp;
  assert.match(s, /set suspendat_la = now\(\), epoca_sesiunii = c\.epoca_sesiunii \+ 1/);
  assert.match(s, /delete from privat\.cont_dispozitiv d where d\.cont_id = p_cont and d\.business_id = p_business;/);
  assert.match(s, /update privat\.cont_cod x\s+set folosit_la = now\(\)/, "codurile inca vii se inchid");
  /* Reactivarea NU coboara epoca: sesiunile vechi raman moarte. */
  assert.doesNotMatch(corpul("cont_panou_reactiveaza").corp, /epoca_sesiunii/);
});

test("⚠⚠ codul de pe email nu deschide un cont suspendat: pasul doi, contul nou, resetarea", () => {
  const corp = corpul("cont_verifica_provocare").corp;
  const opriri = [...corp.matchAll(/'intrare-refuzata', jsonb_build_object\('motiv', 'suspendat', 'prin', '([a-z-]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(opriri, ["doi-pasi", "inregistrare", "resetare"]);
  assert.equal((corp.match(/return query select false, 'suspendat', null::uuid, v_cod\.scop, false;/g) ?? []).length, 3);
  /* Si fiecare oprire vine INAINTEA schimbarii parolei de pe ramura ei. */
  const inreg = corp.indexOf("'prin', 'inregistrare'), v_ip);\n        return query select false, 'suspendat'");
  assert.ok(inreg > 0 && inreg < corp.indexOf("set parola_hash = v_cod.parola_hash"));
  const reset = corp.indexOf("'prin', 'resetare'), v_ip);");
  assert.ok(reset > 0 && reset < corp.indexOf("set parola_hash = p_parola_hash"));
});

test("⚠ restul functiei de verificare a ramas cea din migratia 13, neschimbata", () => {
  /* Copiata mecanic: fara cele trei opriri, trebuie sa fie identica cu cea veche. */
  const vechi = MIGRATII.find((m) => m.f === "2026-09-24-conturi-clienti-parola.sql")!.text;
  const cap = "create or replace function public.cont_verifica_provocare(";
  const i = vechi.indexOf(cap);
  const corpVechi = vechi.slice(vechi.indexOf("$$", i) + 2, vechi.indexOf("$$", vechi.indexOf("$$", i) + 2));
  const faraOpriri = corpul("cont_verifica_provocare").corp.replace(
    /\n *\/\* ⚠⚠ Contul suspendat de magazin: codul dovedeste adresa, dar nu deschide nimic\. \*\/\n(?: *.*\n){6} *end if;/g,
    "",
  );
  assert.equal(faraOpriri, corpVechi);
});

test("⚠⚠ la intrarea cu parola, suspendarea se spune DUPA parola buna si INAINTEA oricarui cod sau sesiuni", () => {
  const a = citeste("src/lib/cont/autentificare.ts");
  const f = a.slice(a.indexOf("export async function intraCuParola("));
  const corp = f.slice(0, f.indexOf("\n}\n"));
  const parola = corp.indexOf("if (!potrivita || !contId) {");
  const suspendare = corp.indexOf("cont_verifica_suspendarea");
  /* ⚠ Drumul dispozitivului de incredere, nu blocajul de mai sus (care il cheama si el). */
  const dispozitiv = corp.indexOf('if (cfg.verificare_intrare !== "mereu" && (await dispozitivCunoscut(p.magazin.id, contId)))');
  const pas = corp.indexOf("await pornestePas(");
  assert.ok(parola > 0 && suspendare > parola, "suspendarea se spune abia dupa parola buna (altfel e un oracol)");
  assert.ok(suspendare < dispozitiv && suspendare < pas, "si inainte de dispozitivul de incredere si de cod");
  assert.match(corp, /if \(suspendat === true\) return \{ rezultat: "refuzat", mesaj: MESAJ_CONT_SUSPENDAT \};/);
  /* Codul de pe email pe un cont suspendat primeste acelasi text. */
  assert.match(a, /case "suspendat":\n\s+return MESAJ_CONT_SUSPENDAT;/);
});

/* ═══ 2. Nimic secret catre panou ═══ */

test("⚠⚠ fisa si lista nu scot amprente, jetoane sau IP-uri intregi", () => {
  for (const n of ["cont_panou_fisa", "cont_panou_lista", "cont_panou_sumar", "cont_panou_comanda_de_legat", "cont_panou_chei"]) {
    const corp = corpul(n).corp;
    /* Parola apare numai ca „are parola”. */
    for (const m of corp.matchAll(/parola_hash[^,)\n]*/g)) {
      assert.ok(m[0].startsWith("parola_hash is not null"), `${n}: ${m[0]}`);
    }
    assert.doesNotMatch(corp, /jeton_hash|cod_hash|provocare_hash/, n);
    /* Niciun rand din `privat` intreg in `jsonb`. */
    assert.doesNotMatch(corp, /to_jsonb\((c|k|s|d|j|l)\)/, n);
  }
  const fisa = corpul("cont_panou_fisa").corp;
  assert.match(fisa, /'ip', privat\.cont_ip_ascuns\(j\.ip\)/);
  assert.equal((fisa.match(/j\.ip\b/g) ?? []).length, 1, "IP-ul iese numai prin `cont_ip_ascuns`");
});

test("IP-ul ascuns: doua grupe din IPv4, /32 din IPv6", () => {
  const corp = corpul("privat.cont_ip_ascuns").corp;
  assert.match(corp, /split_part\(host\(p\), '\.', 1\) \|\| '\.' \|\| split_part\(host\(p\), '\.', 2\) \|\| '\.x\.x'/);
  assert.match(corp, /host\(network\(set_masklen\(p, 32\)\)\) \|\| 'x'/);
});

test("⚠ toate functiile panoului sunt numai pentru `service_role`", () => {
  const m = MIGRATII.find((x) => x.f === M53)!.text;
  const definite = [...m.matchAll(/create or replace function (public\.[a-z_]+)\(/g)].map((x) => x[1]);
  const grant = m.slice(m.indexOf("foreach f in array array["), m.indexOf("] loop"));
  for (const d of definite) assert.ok(grant.includes(`'${d}(`), `${d} nu e in lista drepturilor`);
  assert.match(m, /revoke all on function privat\.cont_ip_ascuns\(inet\) from public, anon, authenticated;/);
});

/* ═══ 3. Aceeasi cheie ca lista de clienti ═══ */

test("⚠⚠ eticheta „are cont” socoteste cheia cu ACELEASI functii ca lista de clienti", () => {
  const chei = corpul("cont_panou_chei").corp;
  assert.match(chei, /public\.order_customer_key\(o\.customer_phone, o\.customer_email, o\.id\)/);
  assert.match(chei, /public\.discount_customer_key\(/);
  assert.match(chei, /c\.sters_la is null/, "conturile sterse nu dau eticheta");
  /* O comanda legata DE MANA poate fi a altui om: nu-i da clientului ei eticheta. */
  assert.match(chei, /where l\.business_id = p_business and l\.temei <> 'legat-de-comerciant'/);
  /* Nici comanda-cadou plasata din cont pe datele destinatarului: numai contactele contului. */
  assert.match(chei, /k\.cont_id = l\.cont_id and k\.verificat_la is not null/);
  /* Si lista de clienti chiar foloseste aceeasi functie. */
  assert.match(corpul("customers_merged").corp, /public\.order_customer_key\(o\.customer_phone, o\.customer_email, o\.id\)/);
});

test("⚠ filtrul „cu cont” trece prin `p_chei`, se intersecteaza cu segmentul si nu-si inghite eroarea", () => {
  const p = citeste("src/app/(dashboard)/dashboard/customers/page.tsx");
  const bloc = p.slice(p.indexOf("if (doarCuCont) {"), p.indexOf("const f = fereastra(perioada);"));
  assert.match(bloc, /await conturileClientilor\(businessId, null\)/);
  assert.match(bloc, /chei = chei === null \? \[\.\.\.cuCont\] : chei\.filter\(\(k\) => cuCont\.has\(k\)\);/);
  assert.doesNotMatch(bloc, /catch/, "o lista nefiltrata sub „cu cont” ar minti");
  assert.match(p, /p_chei: chei \?\? undefined/);
});

/* ═══ Legarea de mana ═══ */

test("⚠⚠ legarea de mana: marketplace refuzat, fara mutare de la alt cont, vedere intreaga, jurnal", () => {
  const l = corpul("cont_panou_leaga_comanda").corp;
  assert.match(l, /if v_o\.mk then\s+return 'marketplace';/);
  assert.match(l, /return 'legata-de-alt-cont';/);
  assert.match(l, /values \(p_order, p_business, p_cont, 'legat-de-comerciant', 'intreaga'\)\s+on conflict \(order_id\) do nothing;/);
  assert.match(l, /'comanda-legata-de-magazin'/);
  /* Comanda se cauta in magazinul CERUT. */
  assert.match(l, /where o\.id = p_order and o\.business_id = p_business;/);
  /* Se dezleaga numai ce a legat comerciantul. */
  assert.match(corpul("cont_panou_dezleaga_comanda").corp, /and l\.temei = 'legat-de-comerciant';/);
});

test("⚠ legarea se face in doi pasi: cautarea arata comanda, abia apoi se leaga", () => {
  const ecran = citeste("src/components/dashboard/clienti/conturi/LeagaComanda.tsx");
  assert.match(ecran, /cautaComandaDeLegat\(businessId, contId, n\)/);
  assert.match(ecran, /leagaComandaDeCont\(businessId, contId, c\.orderId\)/);
  assert.match(ecran, /gasita\.sePotriveste/, "se spune daca emailul sau telefonul e al contului");
  /* Butonul de legare lipseste la marketplace si la o comanda legata deja. */
  assert.match(ecran, /const blocata = gasita && \(gasita\.marketplace \|\| \(gasita\.legataDe !== null\)\);/);
});

/* ═══ Actiunile de server ═══ */

test("⚠⚠ fiecare actiune a panoului isi verifica omul si magazinul INAINTE de baza", () => {
  const s = citeste("src/lib/actions/conturi-panou.actions.ts");
  assert.match(s, /^"use server";/);
  const bucati = s.split(/\nexport async function /).slice(1);
  assert.ok(bucati.length >= 7, `am gasit ${bucati.length} actiuni`);
  for (const b of bucati) {
    const nume = b.slice(0, b.indexOf("("));
    const garda = b.indexOf("await garda(businessId, contId)");
    const baza = b.indexOf("createAdminClient()");
    assert.ok(garda > 0, `${nume}: fara garda`);
    assert.ok(baza > garda, `${nume}: baza inaintea garzii`);
  }
  const g = s.slice(s.indexOf("async function garda("), s.indexOf("function reimprospateaza("));
  assert.match(g, /if \(!esteUuid\(businessId\) \|\| !esteUuid\(contId\)\)/);
  assert.match(g, /\.eq\("id", businessId\)\.eq\("user_id", user\.id\)/);
});

test("⚠ modulul care citeste pentru panou e numai de server si NU e „use server”", () => {
  const s = citeste("src/lib/cont/panou.ts");
  assert.match(s, /^import "server-only";/);
  assert.doesNotMatch(s, /"use server"/, "fiecare export ar fi devenit un capat public, fara garda");
});

test("pagina contului: id stricat sau al altui magazin = 404, magazinul din omul logat", () => {
  const s = citeste("src/app/(dashboard)/dashboard/customers/conturi/[id]/page.tsx");
  assert.match(s, /if \(!esteUuid\(id\)\) notFound\(\);/);
  assert.match(s, /\.eq\("user_id", user\.id\)/);
  assert.match(s, /if \(!fisa\) notFound\(\);/);
});

test("fila „Conturi” exista in pagina Clienti", () => {
  assert.match(citeste("src/components/dashboard/clienti/FilelePaginii.tsx"), /\{ cheie: "conturi", eticheta: "Conturi" \}/);
  assert.match(citeste("src/app/(dashboard)/dashboard/customers/page.tsx"), /fila === "conturi" && \(/);
});

/* ═══ Textele ═══ */

test("⚠⚠ ORICE fapta scrisa in jurnal, in orice migratie, are un text in panou", () => {
  const fapte = new Set<string>();
  for (const m of MIGRATII) {
    for (const x of m.text.matchAll(/insert into privat\.cont_jurnal \([^)]*\)\s*(?:values \(|select )([\s\S]{0,160})/g)) {
      const lit = x[1].match(/'([a-z][a-z-]+)'/);
      if (lit) fapte.add(lit[1]);
    }
  }
  assert.ok(fapte.size >= 15, `am gasit doar ${fapte.size} fapte: ${[...fapte].join(", ")}`);
  const cunoscute = new Set<string>(FAPTE_CUNOSCUTE);
  const fara = [...fapte].filter((f) => !cunoscute.has(f));
  assert.deepEqual(fara, [], `fapte fara text in panou: ${fara.join(", ")}`);
  for (const f of FAPTE_CUNOSCUTE) {
    assert.notEqual(descrieFapta(f, {}).titlu, f, `${f} cade pe textul brut`);
  }
});

test("istoricul: faptele comerciantului se deosebesc, iar comenzile apar cu numarul", () => {
  assert.equal(descrieFapta("iesire-de-peste-tot", { de: "magazin" }).ton, "magazin");
  assert.equal(descrieFapta("iesire-de-peste-tot", {}).ton, "normal");
  assert.equal(descrieFapta("suspendat-de-magazin", { motiv: "Frauda" }).detaliu, "Frauda");
  const numere = new Map([["b0000000-0000-4000-8000-000000000001", "#1350"]]);
  assert.equal(descrieFapta("anulare-comanda", { comanda: "b0000000-0000-4000-8000-000000000001" }, numere).detaliu, "#1350");
  assert.equal(descrieFapta("comanda-legata-de-magazin", { numar: "#7" }).detaliu, "#7");
  assert.equal(descrieFapta("fapta-necunoscuta", {}).titlu, "fapta-necunoscuta", "o fapta noua se vede, nu dispare");
});

test("temeiurile sunt EXACT cele permise de baza", () => {
  const m = MIGRATII.map((x) => x.text).join("\n");
  const chk = m.match(/cont_comanda_temei_check[\s\S]{0,40}check \(temei in \(([^)]*)\)\)/)
    ?? m.match(/temei text not null check \(temei in \(([^)]*)\)\)/);
  const sus = new Set(Object.keys(TEMEIURI));
  if (chk) {
    const dinBaza = [...chk[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
    for (const t of dinBaza) assert.ok(sus.has(t), `temeiul ${t} n-are text`);
  }
  for (const t of ["plasata-in-cont", "contact-verificat", "legat-de-comerciant", "jeton-email", "numar-plus-contact"]) {
    assert.notEqual(etichetaTemeiului(t), t);
  }
  assert.equal(etichetaTemeiului("nou"), "nou");
});

test("fiecare raspuns al bazei la legare si dezlegare are text", () => {
  const leg = corpul("cont_panou_leaga_comanda").corp;
  for (const m of leg.matchAll(/return '([a-z-]+)';/g)) {
    assert.notEqual(mesajulLegarii(m[1]), mesajulLegarii("necunoscut"), m[1]);
  }
  const dez = corpul("cont_panou_dezleaga_comanda").corp;
  for (const m of dez.matchAll(/return '([a-z-]+)';/g)) {
    assert.notEqual(mesajulDezlegarii(m[1]), mesajulDezlegarii("necunoscut"), m[1]);
  }
});

/* ═══ Citirea fisei si filtrele ═══ */

test("⚠ fisa din `jsonb` se citeste fara sa arunce, oricat de stricata ar fi", () => {
  for (const x of [null, undefined, 7, "x", [], {}, { cont: {} }, { cont: { id: "" } }]) {
    assert.equal(citesteFisa(x), null);
  }
  const f = citesteFisa({
    cont: { id: "c1", nume: "  ", are_parola: true },
    contacte: [{ fel: "email", valoare: "a@b.ro", verificat_la: "2026-09-24T10:00:00Z" }, null, { fel: "email" }],
    comenzi: [{ order_id: "o1", numar: "#1", total: "12.5", temei: "plasata-in-cont" }, { numar: "fara id" }],
    jurnal: [{ fapta: "intrare", detalii: "stricat", ip: "86.124.x.x" }, {}],
    sesiuni_deschise: "2",
    preferinte: { primeste_email: false, primeste_sms: true, are_email: true, are_telefon: false },
  });
  assert.ok(f);
  assert.equal(f.nume, null, "numele gol nu e nume");
  assert.equal(f.contacte.length, 1);
  assert.equal(f.comenzi.length, 1);
  assert.equal(f.comenzi[0].total, 12.5);
  assert.deepEqual(f.jurnal[0].detalii, {});
  assert.equal(f.sesiuniDeschise, 2);
  assert.equal(f.primesteEmail, false);
  assert.equal(f.primesteSms, null, "fara telefon confirmat, alegerea nu inseamna nimic");
});

test("filtrele din adresa: orice necunoscut cade pe implicit; adresa nu poarta ce nu e pus", () => {
  assert.equal(stareValida("suspendate"), "suspendate");
  assert.equal(stareValida("orice"), "toate");
  assert.equal(stareValida(null), "toate");
  assert.equal(ordineValida("comenzi"), "comenzi");
  assert.equal(ordineValida("x"), "noi");
  assert.equal(adresaListei({ q: "", stare: "toate", ordine: "noi" }), "/dashboard/customers?fila=conturi");
  /* ⚠ Parametrii se citesc intregi, nu cu `.get`: regula zonei de cont (in
     `regulile-contului.test.ts`) cauta acel tipar ca semn de identitate luata din cerere. */
  const parametri = (u: string) => Object.fromEntries(new URL(u, "https://x.ro").searchParams);
  assert.deepEqual(parametri(adresaListei({ q: " ana ", stare: "suspendate", ordine: "activi", pagina: 3 })), {
    fila: "conturi", q: "ana", stare: "suspendate", ordine: "activi", page: "3",
  });
  assert.equal(parametri(adresaListei({ q: "x".repeat(200), stare: "toate", ordine: "noi" })).q.length, CAUTARE_MAXIMA);
  assert.equal(numeleContului(null, "a@b.ro"), "a@b.ro");
  assert.equal(numeleContului("  ", null), "Cont fără nume");
});

test("⚠ cautarea din bara se taie la fel ca adresa, altfel s-ar retrimite la nesfarsit", () => {
  const s = citeste("src/components/dashboard/clienti/conturi/BaraConturi.tsx");
  assert.match(s, /const cautat = text\.trim\(\)\.slice\(0, CAUTARE_MAXIMA\);/);
  assert.match(citeste("src/app/(dashboard)/dashboard/customers/page.tsx"), /q=\{q\.slice\(0, CAUTARE_MAXIMA\)\}/);
});
