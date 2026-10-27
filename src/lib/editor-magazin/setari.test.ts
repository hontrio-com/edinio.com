import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DateleGenerale } from "@/lib/dashboard/datele-magazinului";
import {
  adresaSetarii, catalogDinPageContent, catalogModificat, esteSetare, FILE_MUTATE_IN_EDITOR, formularModificat,
  panouriGeneraleModificate, SETARI_EDITOR, setareDinAdresa, type StareGenerale,
} from "./setari";

/*
 * Fila „Setări” a editorului (etapa 8, lista lui de pe 27.10.2026): ce panou are modificari nesalvate,
 * ce cere adresa, unde duc filele vechi din Setari.
 */

const DATE: DateleGenerale = {
  store_name: "Florăria Mirei", tagline: "Flori proaspete", description: "", phone: "0722123456", whatsapp: "0722123456",
  email: "", store_address: "", store_city: "", store_county: "", social: { instagram: "https://instagram.com/floraria" },
  butoane: { whatsapp: true, apel: false }, business_name: "SC Floraria SRL", cui: "RO1", reg_com: "", address: "", city: "", county: "",
};
const stare = (date: Partial<DateleGenerale> = {}, formatComanda = "sequential"): StareGenerale => ({ date: { ...DATE, ...date }, formatComanda });

test("nimic schimbat: niciun panou nesalvat", () => {
  assert.deepEqual(panouriGeneraleModificate(stare(), stare()), []);
});

test("fiecare camp isi aprinde panoul lui, si doar pe el", () => {
  assert.deepEqual(panouriGeneraleModificate(stare({ tagline: "Altceva" }), stare()), ["general"]);
  assert.deepEqual(panouriGeneraleModificate(stare({ phone: "0733" }), stare()), ["general"]);
  assert.deepEqual(panouriGeneraleModificate(stare({ butoane: { whatsapp: false, apel: false } }), stare()), ["general"]);
  assert.deepEqual(panouriGeneraleModificate(stare({ social: { instagram: "https://instagram.com/alt" } }), stare()), ["social"]);
  assert.deepEqual(panouriGeneraleModificate(stare({ cui: "RO2" }), stare()), ["firma"]);
  // Numerotarea comenzilor sta in panoul firmei.
  assert.deepEqual(panouriGeneraleModificate(stare({}, "random"), stare()), ["firma"]);
  assert.deepEqual(panouriGeneraleModificate(stare({ store_name: "X", cui: "RO2" }), stare()), ["general", "firma"]);
});

test("⚠ un spatiu scris si sters, sau o retea golita, nu lasa panoul „nesalvat”", () => {
  assert.deepEqual(panouriGeneraleModificate(stare({ tagline: "Flori proaspete " }), stare()), []);
  assert.deepEqual(
    panouriGeneraleModificate(stare({ social: { instagram: "https://instagram.com/floraria", tiktok: "" } }), stare()),
    [],
  );
  // Dar o retea chiar scoasa e o schimbare.
  assert.deepEqual(panouriGeneraleModificate(stare({ social: {} }), stare()), ["social"]);
});

test("formularul si catalogul: schimbat = alt JSON, cu cheile in orice ordine", () => {
  assert.equal(formularModificat({ extras: [], custom_fields: [] }, { custom_fields: [], extras: [] }), false);
  assert.equal(formularModificat({ hidden_fields: [] }, { hidden_fields: ["discount"] }), true);
  const c = { hide_products_without_images: false, hide_out_of_stock_products: true, show_empty_categories: false };
  assert.equal(catalogModificat(c, { ...c }), false);
  assert.equal(catalogModificat({ ...c, show_empty_categories: true }, c), true);
});

test("⚠ comutatoarele catalogului se citesc ca in magazin: doar `true` e pornit", () => {
  assert.deepEqual(catalogDinPageContent({}), { hide_products_without_images: false, hide_out_of_stock_products: false, show_empty_categories: false });
  assert.deepEqual(
    catalogDinPageContent({ hide_products_without_images: true, hide_out_of_stock_products: "true", show_empty_categories: 1 }),
    { hide_products_without_images: true, hide_out_of_stock_products: false, show_empty_categories: false },
  );
});

test("adresa editorului: fila „Setări” si setarea cerute; orice altceva cade pe lista, nu pe o setare ghicita", () => {
  assert.equal(setareDinAdresa(undefined, undefined), null);
  assert.equal(setareDinAdresa("sectiuni", "catalog"), null);
  assert.equal(setareDinAdresa("setari", undefined), "lista");
  assert.equal(setareDinAdresa("setari", "formular"), "formular");
  assert.equal(setareDinAdresa("setari", "nu-exista"), "lista");
  assert.equal(setareDinAdresa("setari", ["catalog"]), "lista");
  for (const s of SETARI_EDITOR) assert.ok(esteSetare(s.cheie));
  assert.equal(adresaSetarii("catalog"), "/dashboard/editor?fila=setari&setare=catalog");
  assert.equal(adresaSetarii(), "/dashboard/editor?fila=setari");
});

test("⚠ filele vechi din Setari duc la o setare care exista", () => {
  assert.deepEqual(Object.keys(FILE_MUTATE_IN_EDITOR).sort(), ["catalog", "formular-comanda"]);
  for (const setare of Object.values(FILE_MUTATE_IN_EDITOR)) assert.ok(esteSetare(setare), setare);
});
