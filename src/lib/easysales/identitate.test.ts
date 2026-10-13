import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  articoleleLiniilor, cheiaArticolului, cheileLiniilor, skuGenerat, IDENTITATE_SIMPLU,
  type ProdusPentruIdentitate,
} from "./identitate";
import { identitateCombinatie } from "@/lib/storefront/variante-identitate";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const STERS = "33333333-3333-4333-8333-333333333333";

/** base32 RFC 4648 scris altfel (pe sir de biti), ca proba sa nu copieze implementarea. */
function base32Referinta(buf: Buffer, cate: number): string {
  const biti = [...buf].map((o) => o.toString(2).padStart(8, "0")).join("");
  let out = "";
  for (let i = 0; out.length < cate; i += 5) out += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(biti.slice(i, i + 5), 2)];
  return out;
}

test("SKU-ul generat: EDN- + 10 caractere base32 din sha256(uuid|identitate), determinist", () => {
  const s = skuGenerat(P1, "");
  assert.match(s, /^EDN-[A-Z2-7]{10}$/);
  assert.equal(s, `EDN-${base32Referinta(createHash("sha256").update(`${P1}|`).digest(), 10)}`);
  assert.equal(skuGenerat(P1, ""), s, "acelasi la orice reincercare");
  assert.notEqual(skuGenerat(P1, "abcdef0123456789"), s, "alta identitate, alt SKU");
  assert.notEqual(skuGenerat(P2, ""), s);
});

const COMBO = (title: string, sku: string, enabled = true, uid?: string) =>
  ({ id: title, title, price: "", compare_at_price: "", sku, stock_quantity: "", image: "", enabled, ...(uid ? { uid } : {}) });

const CU_VARIANTE = (combos: ReturnType<typeof COMBO>[], sku: string | null = "CANA"): ProdusPentruIdentitate => ({
  id: P1, name: "Cana", sku,
  page_sections: { variants: { enabled: true, options: [{ id: "o", name: "Marime", values: combos.map((c) => c.title) }], combinations: combos } },
});

test("produs simplu: identitatea goala si SKU-ul lui", () => {
  const produse = new Map([[P1, { id: P1, name: "Cana", sku: " CANA-1 ", page_sections: {} }]]);
  const [c] = cheileLiniilor([{ product_id: P1, name: "Cana", price: 10, quantity: 1 }], null, produse);
  assert.deepEqual(c, { product_uuid: P1, identitate: IDENTITATE_SIMPLU, produsExista: true, skuDorit: "CANA-1", nelegata: false });
});

test("varianta se ia din `stoc_rezervat`, iar doua linii ale aceluiasi produs nu iau acelasi titlu", () => {
  const p = CU_VARIANTE([COMBO("Mica", "C-M", true, "0123456789abcdef"), COMBO("Mare", "C-X")]);
  const produse = new Map([[P1, p]]);
  const chei = cheileLiniilor(
    [
      { product_id: P1, name: "Cana (Mare)", price: 12, quantity: 2 },
      { product_id: P1, name: "Cana (Mica)", price: 10, quantity: 1 },
    ],
    { produse: [], variante: [
      { product_id: P1, variant_title: "Mica", quantity: 1 },
      { product_id: P1, variant_title: "Mare", quantity: 2 },
    ] },
    produse,
  );
  assert.equal(chei[0]!.identitate, identitateCombinatie({ title: "Mare" }));
  assert.equal(chei[0]!.skuDorit, "C-X");
  assert.equal(chei[1]!.identitate, "0123456789abcdef", "uid-ul combinatiei, nu titlul");
  assert.equal(chei[1]!.skuDorit, "C-M");
  assert.equal(chei[0]!.nelegata || chei[1]!.nelegata, false);
});

test("o combinatie cu SKU-ul parintelui (fara majuscule) nu-si foloseste SKU-ul: se genereaza", () => {
  const produse = new Map([[P1, CU_VARIANTE([COMBO("Mica", "cana")], "CANA")]]);
  const [c] = cheileLiniilor([{ product_id: P1, name: "Cana (Mica)", quantity: 1 }],
    { variante: [{ product_id: P1, variant_title: "Mica", quantity: 1 }] }, produse);
  assert.equal(c!.skuDorit, null);
  assert.equal(c!.nelegata, false);
});

test("fara rezervare, sufixul numelui leaga numai cand e unic; altfel linia e NELEGATA pe produs", () => {
  const produse = new Map([[P1, CU_VARIANTE([COMBO("Mica", "C-M"), COMBO("Mare", "C-X")])]]);
  const [a] = cheileLiniilor([{ product_id: P1, name: "Cana (Mare)", quantity: 1 }], null, produse);
  assert.equal(a!.identitate, identitateCombinatie({ title: "Mare" }));
  const [b] = cheileLiniilor([{ product_id: P1, name: "Cana", quantity: 1 }], null, produse);
  assert.deepEqual(b, { product_uuid: P1, identitate: IDENTITATE_SIMPLU, produsExista: true, skuDorit: null, nelegata: true });
});

test("combinatia stinsa dupa comanda tot se gaseste: pe ea s-a vandut linia", () => {
  const produse = new Map([[P1, CU_VARIANTE([COMBO("Mica", "C-M", false)])]]);
  const [c] = cheileLiniilor([{ product_id: P1, name: "Cana (Mica)", quantity: 1 }],
    { variante: [{ product_id: P1, variant_title: "Mica", quantity: 1 }] }, produse);
  assert.equal(c!.nelegata, false);
  assert.equal(c!.skuDorit, "C-M");
});

test("produs sters: piatra de mormant pe identitatea produsului; extraoptiunea si id-ul stricat dau null", () => {
  const chei = cheileLiniilor(
    [
      { product_id: STERS, name: "Disparut", quantity: 1 },
      { product_id: "extra_cadou", name: "Cadou", quantity: 1 },
      { product_id: "nu-e-uuid", name: "?", quantity: 1 },
    ],
    null, new Map(),
  );
  assert.deepEqual(chei[0], { product_uuid: STERS, identitate: "", produsExista: false, skuDorit: null, nelegata: true });
  assert.equal(chei[1], null);
  assert.equal(chei[2], null);
});

test("articolele liniilor urmeaza indicele si poarta steagul de nelegata", () => {
  const chei = [
    { product_uuid: P1, identitate: "", produsExista: true, skuDorit: "A", nelegata: false },
    null,
    { product_uuid: STERS, identitate: "", produsExista: false, skuDorit: null, nelegata: true },
  ];
  const alocate = new Map([
    [cheiaArticolului(chei[0]!), { id: 1000000001, sku: "A" }],
    [cheiaArticolului(chei[2]!), { id: 1000000002, sku: "EDN-X" }],
  ]);
  assert.deepEqual(articoleleLiniilor(chei, alocate), [
    { productWebsiteId: 1000000001, sku: "A", nelegata: false },
    null,
    { productWebsiteId: 1000000002, sku: "EDN-X", nelegata: true },
  ]);
});
