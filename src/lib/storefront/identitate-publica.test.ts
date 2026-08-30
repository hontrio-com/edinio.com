import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adresaPostalaJsonLd, adresaPublica, contactJsonLd } from "./identitate-publica";

/*
 * ⚠ Defectul pe care il apara probele astea nu produce nicio eroare nicaieri.
 *
 * Comerciantul completeaza integral „Datele magazinului" (Setari > General), se
 * uita pe pagina publica si vede datele structurate FARA adresa si FARA email.
 * Nimic nu cade, nimic nu se logheaza: pur si simplu campurile nu ajung acolo.
 * E aceeasi clasa cu EAN-ul care nu ajungea in feed.
 *
 * Masurat pe productie la 14.08.2026: 3 din 70 de magazine publicate aveau
 * adresa completata si invizibila, iar emailul nu se emitea la NICIUNUL din cele
 * 29 care il aveau.
 */

test("⚠⚠ „Datele magazinului\" ajung in adresa publica, nu doar „Editeaza magazinul\"", () => {
  /*
   * Cazul EXACT raportat: comerciantul a completat ecranul Setari > General,
   * care scrie in `address`/`city`/`county`. Blocul JSON-LD se uita numai la
   * `store_city`, deci nu iesea nimic.
   */
  const doarFirma = {
    address: "Str. Principala 112",
    city: "Ghimes Faget",
    county: "Bacau",
    email: "contact@magazin.ro",
    phone: "0732954813",
  };
  const a = adresaPostalaJsonLd(doarFirma);
  assert.ok(a, "adresa nu are voie sa lipseasca doar fiindca s-a completat celalalt ecran");
  assert.equal(a.streetAddress, "Str. Principala 112");
  assert.equal(a.addressLocality, "Ghimes Faget");
  assert.equal(a.addressRegion, "Bacau");
  assert.equal(a.addressCountry, "RO");
});

test("adresa MAGAZINULUI bate adresa firmei", () => {
  /* Aceeasi precedenta ca la emiterea AWB-urilor: de acolo pleaca marfa. */
  const amandoua = {
    address: "Str. Firmei 1", city: "Oras Firma", county: "Judet Firma",
    store_address: "Str. Magazin 2", store_city: "Oras Magazin", store_county: "Judet Magazin",
  };
  assert.deepEqual(adresaPublica(amandoua), {
    strada: "Str. Magazin 2", oras: "Oras Magazin", judet: "Judet Magazin",
  });
});

test("⚠ campurile se iau INDEPENDENT, nu ca bloc", () => {
  /*
   * Un magazin poate avea strada la „Editeaza magazinul" si orasul la „Datele
   * magazinului". Luate ca bloc, ar fi iesit jumatate de adresa.
   */
  const amestecat = { store_address: "Str. Magazin 2", city: "Oras Firma", county: "Bacau" };
  assert.deepEqual(adresaPublica(amestecat), {
    strada: "Str. Magazin 2", oras: "Oras Firma", judet: "Bacau",
  });
});

test("⚠ adresa se emite si cand lipseste ORASUL", () => {
  /*
   * Varianta dinainte cerea `store_city` si arunca restul: un magazin cu strada
   * si judetul completate nu avea deloc adresa in datele structurate.
   */
  const faraOras = { store_address: "Str. Principala 112", store_county: "Bacau" };
  const a = adresaPostalaJsonLd(faraOras);
  assert.ok(a);
  assert.equal(a.streetAddress, "Str. Principala 112");
  assert.equal(a.addressRegion, "Bacau");
  assert.equal("addressLocality" in a, false, "nu se inventeaza un oras");
});

test("fara nicio bucata de adresa nu se emite un bloc gol", () => {
  /* Un `PostalAddress` cu doar `addressCountry: RO` nu spune nimic si Google il
     raporteaza ca date structurate incomplete. */
  assert.equal(adresaPostalaJsonLd({}), null);
  assert.equal(adresaPostalaJsonLd({ address: "   ", city: "", store_city: null }), null);
});

test("⚠ emailul chiar ajunge in datele structurate", () => {
  /* Lipsea cu totul din blocul `Store`, desi e completat in panou si se afiseaza
     oricum in subsol ca cerinta ANPC. */
  assert.deepEqual(contactJsonLd({ email: "contact@magazin.ro", phone: "0732954813" }), {
    telephone: "0732954813",
    email: "contact@magazin.ro",
  });
  assert.deepEqual(contactJsonLd({ email: "  " , phone: null }), {});
});

test("spatiile nu produc campuri goale", () => {
  const a = adresaPostalaJsonLd({ store_address: "  Str. A 1  ", store_city: " Cluj ", city: "Ignorat" });
  assert.equal(a?.streetAddress, "Str. A 1");
  assert.equal(a?.addressLocality, "Cluj");
});
