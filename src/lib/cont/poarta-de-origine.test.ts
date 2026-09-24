import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { originaEsteNumaiAMagazinului, conturilePornite, poateAprindeConturi } from "./origine";
import { RESERVED_PAGE_SLUGS, SEGMENT_CONT } from "@/lib/pages/reserved-slugs";

/*
 * Ce apara fisierul asta: zona de cont NU se deschide pe originea comuna
 * `www.edinio.com`, unde 57 din cele 70 de magazine publicate sunt servite si
 * unde fiecare comerciant isi incarca propriile scripturi terte. Acolo, un
 * script de pe vitrina magazinului A poate cere si CITI, same-origin, contul
 * unui cumparator al magazinului B.
 *
 * ⚠ Probele nu masoara o cablare, masoara REGULA: ce gazda deschide contul.
 */

const MAGAZIN = { custom_domain: "magazin.ro", custom_domain_healthy: true as boolean | null };

test("contul se deschide pe domeniul magazinului", () => {
  assert.equal(originaEsteNumaiAMagazinului("magazin.ro", MAGAZIN), true);
  assert.equal(originaEsteNumaiAMagazinului("MAGAZIN.RO", MAGAZIN), true);
  assert.equal(originaEsteNumaiAMagazinului("magazin.ro:443", MAGAZIN), true);
});

test("contul NU se deschide pe originea comuna a platformei", () => {
  for (const gazda of ["www.edinio.com", "edinio.com", "ajutor.edinio.com", "edinio-com-git-x.vercel.app"]) {
    assert.equal(
      originaEsteNumaiAMagazinului(gazda, MAGAZIN),
      false,
      `${gazda} nu are voie sa deschida zona de cont`,
    );
  }
});

test("contul NU se deschide pe domeniul ALTUI magazin", () => {
  assert.equal(originaEsteNumaiAMagazinului("alt-magazin.ro", MAGAZIN), false);
  // Nici pe un subdomeniu al lui: `www.magazin.ro` e alta origine, iar proxy-ul
  // il duce oricum la apex cu 308.
  assert.equal(originaEsteNumaiAMagazinului("www.magazin.ro", MAGAZIN), false);
});

test("un magazin fara domeniu propriu nu deschide contul nicaieri", () => {
  const faraDomeniu = { custom_domain: null, custom_domain_healthy: null };
  for (const gazda of ["www.edinio.com", "magazin.ro", "localhost:3000"]) {
    assert.equal(originaEsteNumaiAMagazinului(gazda, faraDomeniu), false);
  }
});

test("comutatorul e stins la orice altceva decat `true`", () => {
  assert.equal(conturilePornite({ enabled: true }), true);
  for (const v of [{}, null, undefined, { enabled: false }, { enabled: "true" }, { enabled: 1 }, "da", []]) {
    assert.equal(conturilePornite(v), false, `${JSON.stringify(v)} nu inseamna pornit`);
  }
});

test("comutatorul nu se poate aprinde fara domeniu propriu sanatos", () => {
  assert.equal(poateAprindeConturi({ custom_domain: null, custom_domain_healthy: null }).poate, false);
  assert.equal(poateAprindeConturi({ custom_domain: "magazin.ro", custom_domain_healthy: false }).poate, false);
  // `null` inseamna „inca neverificat”, nu „cazut”: un domeniu tocmai conectat
  // nu asteapta cronul, la fel ca in proxy.
  assert.equal(poateAprindeConturi({ custom_domain: "magazin.ro", custom_domain_healthy: null }).poate, true);
  assert.equal(poateAprindeConturi({ custom_domain: "magazin.ro", custom_domain_healthy: true }).poate, true);
});

test("motivul refuzului e scris in romana, si spune unde se rezolva", () => {
  const v = poateAprindeConturi({ custom_domain: null, custom_domain_healthy: null });
  assert.match(v.motiv ?? "", /domeniu propriu/i);
  assert.match(v.motiv ?? "", /Setări/);
});

/*
 * ⚠ Rezervarea slugului intra IN ACELASI COMMIT cu ruta: in App Router segmentul
 * static bate `[pageSlug]`, deci o pagina proprie numita „cont” ar fi devenit
 * invizibila fara nicio eroare. Si rezervarea nu repara retroactiv.
 */
test("slugul zonei de cont e rezervat, cu tot cu numele apropiate", () => {
  for (const s of [SEGMENT_CONT, "account", "contul-meu", "comenzile-mele", "profil"]) {
    assert.ok(RESERVED_PAGE_SLUGS.has(s), `„${s}” trebuie sa fie rezervat`);
  }
});

test("„contact” NU e rezervat: e alt segment, si e un nume bun de pagina proprie", () => {
  assert.equal(RESERVED_PAGE_SLUGS.has("contact"), false);
});

/*
 * ⚠⚠ Sentry nu se incarca pe vitrine, dinadins: fisierul intra in pachetul de
 * client al FIECAREI pagini si se plateste in viteza magazinului. Regula lui e
 * un regex pe CALE, iar o ruta de cont numita `/login` l-ar fi potrivit si ar fi
 * tras SDK-ul in pachetul fiecarui vizitator.
 *
 * Proba citeste regexul de pe disc, nu o copie a lui.
 */
test("nicio ruta a zonei de cont nu trage Sentry in pachetul vitrinei", () => {
  const sursa = readFileSync("src/instrumentation-client.ts", "utf8").replace(/\r\n/g, "\n");
  // ⚠ Declaratia e taiata pe doua randuri in fisier, deci tiparul trece peste
  // randul nou. Cu `.` simplu n-ar fi gasit nimic, iar proba ar fi raportat
  // vesel „zero incalcari" fara sa fi masurat nimic.
  const m = sursa.match(/const ZONE_CU_CONT\s*=\s*(\/\^[\s\S]*?\/);/);
  assert.ok(m, "nu am gasit ZONE_CU_CONT in instrumentation-client.ts");
  const re = new RegExp(m![1].slice(1, -1));
  for (const cale of ["/cont", "/cont/comenzi", "/cont/intra", "/cont/facturi"]) {
    assert.equal(re.test(cale), false, `${cale} nu are voie sa potriveasca ZONE_CU_CONT`);
  }
});
