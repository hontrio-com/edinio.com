import assert from "node:assert/strict";
import { test } from "node:test";
import { TOATE_GHIDURILE } from "@/lib/website/ajutor";
import { GHIDURI_INTEGRARI, ghidulIntegrarii } from "./ghiduri-integrari";

/*
 * „Ghidul complet, pas cu pas” din pagina fiecarei integrari duce la un ghid care EXISTA.
 *
 * ⚠ Un slug schimbat sau sters in Ajutor ar fi lasat in pagina integrarii un link mort, fara ca
 * cineva sa-l vada: pagina se randeaza la fel, iar ghidul lipsa da 404 abia la apasare.
 */

const EXISTENTE = new Set(TOATE_GHIDURILE.map((g) => `${g.categorie.slug}/${g.slug}`));

test("fiecare integrare duce la un ghid din catalogul Ajutor, in categoria lui", () => {
  const moarte = Object.entries(GHIDURI_INTEGRARI)
    .filter(([, [categorie, ghid]]) => !EXISTENTE.has(`${categorie}/${ghid}`))
    .map(([id, [categorie, ghid]]) => `${id} -> ${categorie}/${ghid}`);
  assert.deepEqual(moarte, []);
  assert.ok(Object.keys(GHIDURI_INTEGRARI).length >= 40, "lista s-a golit: proba n-ar mai apara nimic");
});

test("casele de facturare si SAGA au ghid, iar adresa se compune din pereche", () => {
  for (const id of ["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill", "saga"]) {
    const adresa = ghidulIntegrarii(id);
    assert.ok(adresa, `${id}: fara ghid`);
    assert.ok(adresa!.endsWith(`/plati-si-facturare/${GHIDURI_INTEGRARI[id][1]}`), `${id}: ${adresa}`);
  }
  assert.equal(ghidulIntegrarii("nu-exista"), null);
});
