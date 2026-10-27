import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formularDeSalvat, formularDinPageContent, problemaFormularului } from "./formular-comanda";

/*
 * Setari > Formular de comanda: campurile optionale, campurile suplimentare si
 * extraoptiunile platite. Datele stau tot in `page_content.checkout_config`.
 */

const RADACINA = process.cwd();
/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
const sursa = (f: string) => readFileSync(path.join(RADACINA, f), "utf8").replace(/\r\n/g, "\n");

test("citirea: liste mereu prezente, cheile necunoscute pastrate", () => {
  const cfg = formularDinPageContent({
    checkout_config: {
      hidden_fields: [],
      email_field: { enabled: true, required: false },
      cheie_noua: "ramane",
    },
  });
  assert.deepEqual(cfg.custom_fields, []);
  assert.deepEqual(cfg.extras, []);
  assert.deepEqual(cfg.hidden_fields, []);
  assert.deepEqual(cfg.email_field, { enabled: true, required: false });
  assert.equal((cfg as Record<string, unknown>).cheie_noua, "ramane");
});

test("citirea: un rand stricat din baza nu darama fila", () => {
  const cfg = formularDinPageContent({
    checkout_config: {
      custom_fields: [{ id: "cf_1", type: "ciudat" }, null],
      extras: [{ id: "ext_1", label: "Ambalaj", price: "nu e numar" }],
    },
  });
  assert.equal(cfg.custom_fields?.[0].label, "");
  assert.equal(cfg.custom_fields?.[0].type, "text");
  assert.equal(cfg.custom_fields?.[1].id, "cf_r1", "un id lipsa primeste unul stabil, dupa pozitie, diferit de cele scrise");
  assert.equal(cfg.extras?.[0].price, 0);
  assert.deepEqual(formularDinPageContent(null).custom_fields, []);
  assert.deepEqual(formularDinPageContent({ checkout_config: "x" }).extras, []);
});

test("⚠ extraoptiunea pastreaza `id`-ul: comenzile o cauta dupa el pe server", () => {
  /* `validateExtras` din order.actions.ts potriveste alegerea clientului dupa `id`. */
  const cfg = formularDinPageContent({ checkout_config: { extras: [{ id: "ext_1712", label: "Rapid", price: 9.99 }] } });
  assert.equal(formularDeSalvat(cfg).extras?.[0].id, "ext_1712");
  assert.match(sursa("src/lib/actions/order.actions.ts"), /new Map\(serverExtras\.map\(\(e\) => \[e\.id, e\]\)\)/);
});

test("ce nu poate pleca la client se opreste inainte de salvare", () => {
  const camp = (p: object) => ({ id: "cf_1", label: "Mesaj", type: "text" as const, required: false, ...p });
  const extra = (p: object) => ({ id: "ext_1", label: "Ambalaj", price: 5, ...p });
  assert.match(problemaFormularului({ custom_fields: [camp({ label: "  " })] }) ?? "", /nu are etichetă/);
  assert.match(problemaFormularului({ custom_fields: [camp({ type: "select", options: " , " })] }) ?? "", /fără opțiuni/);
  assert.match(problemaFormularului({ extras: [extra({ label: "" })] }) ?? "", /nu are denumire/);
  assert.match(problemaFormularului({ extras: [extra({ price: -5 })] }) ?? "", /0 sau mai mare/);
  assert.match(problemaFormularului({ extras: [extra({ price: Number.NaN })] }) ?? "", /număr/);
  assert.equal(problemaFormularului({ custom_fields: [camp({ type: "select", options: "Rosu, Alb" })], extras: [extra({})] }), null);
  assert.equal(problemaFormularului({}), null);
});

test("la salvare: etichete fara spatii pe margini, pret la doua zecimale", () => {
  const out = formularDeSalvat({
    hidden_fields: [],
    custom_fields: [{ id: "cf_1", label: "  Mesaj ", type: "text", required: true, placeholder: " scrie " }],
    extras: [{ id: "ext_1", label: " Rapid ", price: 9.999, description: " 24h " }],
  });
  assert.equal(out.custom_fields?.[0].label, "Mesaj");
  assert.equal(out.custom_fields?.[0].placeholder, "scrie");
  assert.equal(out.extras?.[0].label, "Rapid");
  assert.equal(out.extras?.[0].price, 10);
  assert.equal(out.extras?.[0].description, "24h");
  assert.deepEqual(out.hidden_fields, []);
});

/* ─────────────── cusatura: ce trimite fila ─────────────── */

test("⚠⚠ fila trimite DOAR `checkout_config`, verificat si curatat", () => {
  /*
   * `updatePageContent` imbina pe chei de prim nivel. O cheie in plus, dintr-o copie
   * facuta la deschiderea paginii, ar scrie peste ce a schimbat intre timp alt ecran.
   */
  // Din etapa 8 (27.10.2026) fila sta in editor; starea si salvarea ei, in `useSetariMagazin`, langa
  // catalog (care trimite si el prin `updatePageContent`, cheile LUI): de aceea doar corpul formularului.
  const tot = sursa("src/components/editor-magazin/setari/useSetariMagazin.ts");
  const s = tot.slice(tot.indexOf("function useFormularComanda("), tot.indexOf("function useCatalog("));
  const apeluri = s.match(/updatePageContent\([^)]*\)/g) ?? [];
  assert.deepEqual(apeluri, ["updatePageContent(businessId, { checkout_config: curat })"]);
  assert.match(s, /const problema = problemaFormularului\(config\);\n\s*if \(problema\) \{ toast\.error\(problema\); return; \}/);
  assert.match(s, /const curat = formularDeSalvat\(config\);/);
});
