import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/*
 * ⚠⚠ PRODUSUL REACTIVAT TREBUIE SA INTRE IN COADA PROIECTORULUI (24.09.2026).
 *
 * Dezactivarea sterge randul din `catalog_produs`; reactivarea il recreeaza GOL
 * (`proiectat_la` NULL, fara fatete, fara text de cautare). O schimbare NUMAI de
 * `is_active` trecea drept „doar stoc”, deci produsul nu intra in coada si ramanea asa
 * pentru totdeauna: la OKXI, 1114 produse active pe care nu le gasea nici cautarea,
 * nici filtrele, nici pagina de brand. Probat pe demo, intr-o tranzactie intoarsa:
 * reactivat -> in coada; doar stoc pe un produs activ -> NU (optimizarea ramane).
 *
 * Proba citeste definitia din SCHEMA DE REFERINTA (ce e in productie), nu din migratie:
 * o migratie noua care rescrie declansatorul fara conditie ar reaparea aici.
 */

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8").replace(/\r\n/g, "\n");

function corpDeclansator(): string {
  const i = baseline.indexOf("FUNCTION public.trg_catalog_proiectie()");
  assert.ok(i >= 0, "declansatorul trebuie sa existe in schema de referinta");
  return baseline.slice(i, baseline.indexOf("$function$", baseline.indexOf("$function$", i) + 10));
}

test("⚠⚠ „doar stoc” cere ca produsul sa fi fost ACTIV inainte", () => {
  const corp = corpDeclansator();
  const doarStoc = corp.slice(corp.indexOf("v_doar_stoc :="), corp.indexOf(";", corp.indexOf("v_doar_stoc :=")));
  assert.match(doarStoc, /coalesce\(old\.is_active, false\)\s+and /);
});

test("orice alt drum decat „doar stoc” pune produsul in coada", () => {
  const corp = corpDeclansator();
  assert.match(corp, /if tg_op = 'INSERT' or not v_doar_stoc then\s+insert into public\.catalog_murdar/);
});
