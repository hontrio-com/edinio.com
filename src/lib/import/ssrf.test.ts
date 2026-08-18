import { test } from "node:test";
import assert from "node:assert/strict";

import { pareOPaginaWeb, urmatorulSalt } from "./ssrf";

/*
 * Ce se verifica aici e REGULA, nu apelul HTTP.
 *
 * Poarta de adresa (`assertAdresaPermisa`) nu se poate incerca de aici fara
 * retea: refuza din constructie orice tinta locala, deci un server de proba pe
 * 127.0.0.1 ar fi respins inainte sa apuce sa raspunda — chiar rostul ei. A fost
 * verificata separat, cu gazde publice care rezolva catre adrese interne
 * (`127.0.0.1.nip.io`, `169.254.169.254.nip.io`, `10.0.0.1.nip.io`): toate
 * blocate, iar un feed public adevarat a trecut in aceeasi rulare — proba poate
 * si sa cada, si sa treaca.
 */

const DE_LA = new URL("https://furnizor.ro/export/stoc.csv");

test("urmatorulSalt: adresa absoluta pe https se urmeaza", () => {
  const r = urmatorulSalt("https://cdn.furnizor.ro/stoc.csv", DE_LA, 0);
  assert.ok("url" in r);
  assert.equal(r.url.href, "https://cdn.furnizor.ro/stoc.csv");
});

test("urmatorulSalt: Location relativ se rezolva fata de saltul curent", () => {
  const r = urmatorulSalt("/fisiere/stoc-nou.csv", DE_LA, 0);
  assert.ok("url" in r);
  assert.equal(r.url.href, "https://furnizor.ro/fisiere/stoc-nou.csv");
});

test("urmatorulSalt: Location relativ fara slash se rezolva fata de director", () => {
  const r = urmatorulSalt("stoc-nou.csv", DE_LA, 0);
  assert.ok("url" in r);
  assert.equal(r.url.href, "https://furnizor.ro/export/stoc-nou.csv");
});

test("urmatorulSalt: coborarea pe http se refuza", () => {
  /* Fara TLS nu mai exista nimic care sa lege conexiunea de numele verificat,
     deci rebinding-ul DNS s-ar redeschide exact pe saltul asta. */
  const r = urmatorulSalt("http://furnizor.ro/stoc.csv", DE_LA, 0);
  assert.ok("error" in r);
  assert.match(r.error, /nu e https/);
});

test("urmatorulSalt: alte scheme se refuza", () => {
  for (const rea of ["file:///etc/passwd", "ftp://furnizor.ro/stoc.csv", "data:text/csv,a,b"]) {
    const r = urmatorulSalt(rea, DE_LA, 0);
    assert.ok("error" in r, `${rea} ar fi trebuit refuzata`);
    assert.match(r.error, /nu e https/);
  }
});

test("urmatorulSalt: un Location de nedescifrat nu arunca", () => {
  const r = urmatorulSalt("http://[nu-e-adresa", DE_LA, 0);
  assert.ok("error" in r);
  assert.match(r.error, /nevalida/);
});

test("urmatorulSalt: al cincilea salt inca merge, al saselea nu", () => {
  /* Granita se verifica pe amandoua partile: un plafon care taie cu un salt mai
     devreme ar rupe lanturi cinstite (Sheets + non-www + CDN), iar unul care
     taie mai tarziu ar lasa bucla sa se invarta. */
  const ultimul = urmatorulSalt("https://cdn.furnizor.ro/stoc.csv", DE_LA, 4);
  assert.ok("url" in ultimul);

  const peste = urmatorulSalt("https://cdn.furnizor.ro/stoc.csv", DE_LA, 5);
  assert.ok("error" in peste);
  assert.match(peste.error, /prea multe ori/);
});

test("urmatorulSalt: acreditarile dintr-un Location se scot din adresa", () => {
  /* `fetch` refuza sa construiasca o cerere dintr-o adresa cu acreditari, deci
     lasate acolo ar rupe lantul la mijloc, cu acelasi mesaj sec. */
  const r = urmatorulSalt("https://client:parola@cdn.furnizor.ro/stoc.csv", DE_LA, 0);
  assert.ok("url" in r);
  assert.equal(r.url.href, "https://cdn.furnizor.ro/stoc.csv");
  assert.equal(r.url.username, "");
  assert.equal(r.url.password, "");
});

test("pareOPaginaWeb: pagina de eroare sau de autentificare e recunoscuta", () => {
  /* Cazul masurat: un link Dropbox stricat a intors 95 KB de HTML, iar feedul a
     ajuns pana la ecranul de potrivire cu o singura coloana, `<!DOCTYPE html>`.
     Comerciantul primea „Adresa raspunde: 221 randuri" si un mesaj de reusita. */
  const pagini = [
    "<!DOCTYPE html>\n<html><head><title>404</title></head></html>",
    "<!doctype html><html lang=\"ro\">",
    "\n\n  <html>\n<body>Autentifica-te</body></html>",
    "<HTML><BODY>Eroare</BODY></HTML>",
    /* Masurate pe corpuri de eroare adevarate: toate treceau drept feed bun. */
    "<!-- (c) Furnizor 2026 -->\n<html><body>Eroare</body></html>",
    '<meta http-equiv="refresh" content="0;url=/login">',
    "<head><title>Autentificare</title></head>",
    "<body>Sesiune expirata</body>",
    '<?xml version="1.0"?><produse/>',
    '{"error":"not found"}',
    '[{"sku":"A"}]',
  ];
  for (const p of pagini) {
    assert.equal(pareOPaginaWeb(Buffer.from(p, "utf8")), true, `nerecunoscut: ${p.slice(0, 30)}`);
  }
});

test("pareOPaginaWeb: un fisier cu date NU e luat drept pagina", () => {
  const fisiere: [string, Buffer][] = [
    ["CSV simplu", Buffer.from("sku,stoc\nABC-1,5\n", "utf8")],
    ["CSV cu BOM", Buffer.from("﻿Cod;stoc\nABC-1;5\n", "utf8")],
    ["CSV cu punct-virgula", Buffer.from("Cod;Cantitate\nX1;12\n", "utf8")],
    ["XLSX (arhiva ZIP)", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])],
    /* Un antet care CONTINE eticheta, dar nu incepe cu ea. */
    ["CSV cu cuvantul html intr-o coloana", Buffer.from("cod,descriere html\nX1,ceva\n", "utf8")],
  ];
  for (const [nume, b] of fisiere) {
    assert.equal(pareOPaginaWeb(b), false, `luat gresit drept pagina: ${nume}`);
  }
});

test("pareOPaginaWeb: un fisier gol nu pica pe nas", () => {
  assert.equal(pareOPaginaWeb(Buffer.alloc(0)), false);
});
