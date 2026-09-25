import test from "node:test";
import assert from "node:assert/strict";
import { adresaDetaliuluiComenzii, adresaListeiDeComenzi } from "./pagination";

test("„Inapoi” din detaliile comenzii se intoarce pe pagina si cu filtrele de unde a plecat", () => {
  const detaliu = adresaDetaliuluiComenzii("abc", "status=pending&page=3&q=ion");
  const lista = new URL(detaliu, "https://x.ro").searchParams.get("lista") ?? undefined;
  assert.equal(adresaListeiDeComenzi(lista), "/dashboard/orders?q=ion&status=pending&page=3");
});

test("fara filtre, detaliul n-are parametru si „Inapoi” duce pe lista simpla", () => {
  assert.equal(adresaDetaliuluiComenzii("abc", ""), "/dashboard/orders/abc");
  assert.equal(adresaListeiDeComenzi(undefined), "/dashboard/orders");
});

test("cheile straine se arunca, deci „Inapoi” nu poate duce in alta parte", () => {
  assert.equal(adresaListeiDeComenzi("page=2&next=https://rau.ro"), "/dashboard/orders?page=2");
  assert.equal(adresaListeiDeComenzi("//rau.ro"), "/dashboard/orders");
});
