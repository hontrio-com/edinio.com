import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  areCuiDeFacturare, clientFacturaDinMetadata, firmaDinAnaf, metadataFacturare,
} from "./firma-abonament";
import type { AnafCompany } from "@/lib/anaf/lookup";

const anaf: AnafCompany = {
  cui: "18547290",
  business_name: "EXEMPLU SRL",
  county: "Cluj",
  city: "Cluj-Napoca",
  address: "Str. Lunga nr. 1",
  post_code: "400000",
  reg_com: "J12/1/2020",
  vat_payer: true,
  inactive: false,
};

test("un CUI lipsa sau gresit se cere din nou; unul bun, cu sau fara RO, nu", () => {
  assert.equal(areCuiDeFacturare(null), false);
  assert.equal(areCuiDeFacturare(""), false);
  assert.equal(areCuiDeFacturare("12345"), false);
  assert.equal(areCuiDeFacturare("18547290"), true);
  assert.equal(areCuiDeFacturare("RO18547290"), true);
});

test("„RO” se pune doar platitorilor de TVA", () => {
  assert.equal(firmaDinAnaf(anaf).cui, "RO18547290");
  assert.equal(firmaDinAnaf({ ...anaf, vat_payer: false }).cui, "18547290");
});

test("firma trece prin metadata Stripe si iese client de factura, cu CUI", () => {
  const meta = { user_id: "u", plan: "basic", ...metadataFacturare(firmaDinAnaf(anaf)) };
  assert.deepEqual(clientFacturaDinMetadata(meta, "a@b.ro"), {
    name: "EXEMPLU SRL",
    email: "a@b.ro",
    vatCode: "RO18547290",
    address: "Str. Lunga nr. 1",
    city: "Cluj-Napoca",
    county: "Cluj",
  });
});

test("fara firma in metadata (abonamente vechi) nu inventeaza un client", () => {
  assert.equal(clientFacturaDinMetadata({ user_id: "u", plan: "basic" }, "a@b.ro"), null);
  assert.equal(clientFacturaDinMetadata(undefined, "a@b.ro"), null);
  assert.equal(clientFacturaDinMetadata({ fact_cui: "12345", fact_nume: "X" }, "a@b.ro"), null);
});

test("metadata ramane sub plafonul Stripe de 500 de caractere", () => {
  const lung = metadataFacturare({ ...firmaDinAnaf(anaf), address: "x".repeat(900) });
  for (const v of Object.values(lung)) assert.ok(v.length <= 500);
});

/*
  REGULA: plata unui abonament porneste doar prin `usePlataAbonament`, care stie
  sa deschida fereastra de CUI. Un buton nou care ar chema ruta direct ar primi
  `cereCui` si i-ar arata omului doar o eroare.
*/
test("nimeni nu cheama /api/stripe/checkout ocolind fereastra de CUI", () => {
  const fisiere: string[] = [];
  const umbla = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) umbla(p);
      else if (/\.tsx?$/.test(n) && !n.endsWith(".test.ts")) fisiere.push(p);
    }
  };
  umbla("src");
  const ruta = new RegExp("fetch\\(\\s*[\"'`]/api/stripe/checkout[\"'`]");
  const cheama = fisiere.filter((f) => ruta.test(readFileSync(f, "utf8")));
  assert.deepEqual(cheama.map((f) => f.split("\\").join("/")), ["src/components/dashboard/PlataAbonament.tsx"]);
});
