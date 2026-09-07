import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { linieFaraPersonalizare, pretulCuPersonalizare, verificaPersonalizarea } from "./comanda";

/**
 * COMANDA DIRECTA POARTA ACUM LINIILE PERSONALIZATE DIN COS.
 *
 * ═══ ⚠ CE ERA STRICAT, SI DE CE N-A SCARTAIT NIMIC ═══
 *
 * Sunt DOUA checkout-uri: cosul (`placeCartOrder`) si comanda directa din pagina produsului
 * (`OrderModal` → `placeOrder`). Al doilea duce cu el si liniile aflate deja in cos.
 *
 * Cand cosul a invatat sa poarte personalizarea, `OrderModal` a ramas sa trimita pentru acele linii
 * doar `{ product_id, name, quantity, variant_title }`. Iar serverul avea o poarta care refuza
 * ORICE linie purtata a unui produs personalizabil — pusa pe vremea cand `CartItem` chiar n-avea
 * unde purta valorile, si motivata in scris cu „valorile nu exista pe drumul asta".
 *
 * Premisa s-a invechit sub poarta. Urmarea: pui un fototapet „Robert" in cos, apesi „Comanda acum"
 * pe alt produs, si comanda se refuza — desi linia din cos e perfect valida. Masurat inainte de
 * reparatie: 13,5% din comenzi (52 din 384) au mai multe linii, deci drumul e umblat.
 *
 * ⚠ Nimic nu putea scartai: tsc trecea (campul lipsea, nu era gresit), suita era verde, iar
 * serverul raspundea cu un mesaj politicos. Doar clientul nu putea cumpara.
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const ALT = "22222222-2222-4222-8222-222222222222";

/** Un fototapet: pretul iese din suprafata, iar catalogul NU se incaseaza. */
const FOTOTAPET = {
  customization: {
    enabled: true,
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89, includePretulProdusului: false, minimM2: 1 },
    fields: [{
      id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
      latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
    }],
  },
};

/** O cana gravata: pretul de catalog SE incaseaza, plus un supliment fix. */
const CANA = {
  customization: {
    enabled: true,
    fields: [{ id: "g", type: "text", label: "Gravura", required: true, max: 20, impact: { fel: "fix", suma: 15 } }],
  },
};

const PRODUS_SIMPLU = { variants: { enabled: false, options: [] } };

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA — ce se refuza si ce NU se mai refuza
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o linie purtata CU personalizare nu se mai refuza", () => {
  /*
   * ⚠ ASTA E REPARATIA, si e singura afirmatie din fisier care ar fi fost ROSIE ieri.
   */
  const produse = [{ id: "p1", page_sections: FOTOTAPET }];
  const linii = [{ product_id: "p1", customization: { dim: { latime: 350, inaltime: 250 } } }];
  assert.equal(
    linieFaraPersonalizare(produse, linii), null,
    "linia din cos, cu valorile ei, e inca refuzata: drumul de vanzare ramane rupt",
  );
});

test("⚠ o linie purtata FARA personalizare se refuza in continuare", () => {
  /*
   * ⚠ PERECHEA CARE APARA BANII. `placeOrder` e export dintr-un modul „use server", adica un capat
   * public: o cerere scrisa de mana cu id-ul unui fototapet, fara valori, s-ar fi pretuit din
   * CATALOG — 89 de lei in loc de 910. Aici nu avem ce socoti, deci se refuza.
   *
   * Tot pe ramura asta cad bump-urile si companionii „cumparate frecvent impreuna": ei chiar n-au
   * de unde purta valori, fiindca nu i-a configurat nimeni.
   */
  const produse = [{ id: "p1", page_sections: FOTOTAPET }];
  const mesaj = linieFaraPersonalizare(produse, [{ product_id: "p1" }]);
  assert.ok(mesaj, "linia fara valori a trecut: se va pretui din catalog");
  assert.match(String(mesaj), /pagina lui/);
});

test("⚠ „poarta valori” inseamna un OBIECT, nu orice", () => {
  /*
   * Un `null`, un sir sau o lista ar fi trecut de un simplu `!= null` si ar fi ajuns la
   * `verificaPersonalizarea` ca sa fie refuzate acolo — dar atunci omul ar fi vazut un mesaj despre
   * un camp lipsa, in loc sa afle ca produsul se comanda din pagina lui.
   */
  const produse = [{ id: "p1", page_sections: FOTOTAPET }];
  for (const rau of [null, undefined, "", "ceva", 7, [], [{ dim: 1 }], true]) {
    assert.ok(
      linieFaraPersonalizare(produse, [{ product_id: "p1", customization: rau }]),
      `a trecut drept personalizare: ${JSON.stringify(rau)}`,
    );
  }
});

test("⚠ produsele care NU cer personalizare nu sunt atinse de poarta", () => {
  /* Perechea negativa: fara ea, „nimic nu mai trece" ar fi trecut si peste o poarta care refuza tot. */
  const produse = [{ id: "p1", page_sections: PRODUS_SIMPLU }];
  assert.equal(linieFaraPersonalizare(produse, [{ product_id: "p1" }]), null);
  assert.equal(linieFaraPersonalizare([], [{ product_id: "p1" }]), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL — acelasi motor pe amandoua checkout-urile
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ `bazaInclusa` stinsa pune baza pe ZERO, nu o scade", () => {
  /*
   * ⚠ DEOSEBIREA CARE DUCEA LINIA SUB ZERO. Scazuta, un pret de catalog mai mare decat suprafata
   * ar fi dat un pret negativ; pusa pe zero, linia costa exact cat suprafata.
   */
  assert.equal(pretulCuPersonalizare(89, { supliment: 910, bazaInclusa: false } as never), 910);
  assert.equal(pretulCuPersonalizare(89, { supliment: 910, bazaInclusa: true } as never), 999);

  /* Cazul care ar fi iesit negativ prin scadere: catalog mare, suprafata mica. */
  assert.equal(pretulCuPersonalizare(500, { supliment: 30, bazaInclusa: false } as never), 30);
});

test("⚠ pretul nu poate cobori sub zero, si se rotunjeste la banut", () => {
  assert.equal(pretulCuPersonalizare(10, { supliment: -999, bazaInclusa: true } as never), 0);
  assert.equal(pretulCuPersonalizare(10.005, { supliment: 0.005, bazaInclusa: true } as never), 10.01);
  /* Fara personalizare, pretul trece NEATINS — nici rotunjit, nici plafonat. */
  assert.equal(pretulCuPersonalizare(89.994, null), 89.994);
});

test("⚠ drumul intreg: valorile din cos dau pretul autoritar, nu catalogul", () => {
  /*
   * ⚠ CIFRA CARE CONTEAZA. 350 × 250 cm = 8,75 m², la 89 lei/m², cu catalogul NEINCLUS.
   * Serverul socoteste 778,75 — nu cei 89 de lei din catalog.
   *
   * Se merge prin CHIAR functia serverului (`verificaPersonalizarea`), nu printr-o socoteala
   * scrisa a doua oara in proba: o proba care isi calculeaza singura raspunsul trece si cand
   * amandoua partile gresesc la fel.
   */
  const r = verificaPersonalizarea(FOTOTAPET, { dim: { latime: 350, inaltime: 250 } }, BIZ);
  assert.equal(r.fel, "ok", `poarta a refuzat o configuratie valida: ${JSON.stringify(r)}`);
  if (r.fel !== "ok") return;

  assert.equal(r.date.bazaInclusa, false, "catalogul nu trebuia inclus");
  assert.equal(pretulCuPersonalizare(89, r.date), 778.75);
});

test("⚠ doua linii ale ACELUIASI produs se pretuiesc separat", () => {
  /*
   * ⚠ DE CE SE VERIFICA PE INDEX, NU PE PRODUS. O cana „Robert" si una „Maria" sunt doua linii ale
   * aceluiasi `product_id`. O harta cheiata pe produs ar fi pretuit-o pe a doua cu valorile
   * primeia — si, cand suplimentele difera, ar fi incasat suma gresita.
   */
  const scurt = verificaPersonalizarea(CANA, { g: "Robert" }, BIZ);
  const lung = verificaPersonalizarea(CANA, { g: "Maria" }, BIZ);
  assert.equal(scurt.fel, "ok");
  assert.equal(lung.fel, "ok");
  if (scurt.fel !== "ok" || lung.fel !== "ok") return;

  /* Amandoua platesc catalogul plus suplimentul fix; instantaneele raman DEOSEBITE. */
  assert.equal(pretulCuPersonalizare(50, scurt.date), 65);
  assert.equal(pretulCuPersonalizare(50, lung.date), 65);
  assert.notDeepEqual(
    scurt.date.instantaneu, lung.date.instantaneu,
    "doua gravuri diferite au produs acelasi instantaneu: comanda ar pleca cu numele gresit",
  );
});

test("⚠ o alegere a ALTUI magazin nu se pretuieste", () => {
  /* Definitia e a serverului, si e citita pentru magazinul care vinde — nu pentru cel care cere. */
  const r = verificaPersonalizarea(FOTOTAPET, { dim: { latime: 9999, inaltime: 9999 } }, ALT);
  assert.equal(r.fel, "eroare", "o dimensiune peste marginile comerciantului a trecut");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CABLAJUL — cele DOUA locuri din care pleaca linia
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ `OrderModal` trimite personalizarea si la COMANDA, si la COTAREA transportului", () => {
  /*
   * ⚠ DOUA LOCURI, SI AMANDOUA CONTEAZA. Comanda fara ea se refuza — vizibil. Cotarea fara ea e
   * TACUTA: plafonul de livrare gratuita si valoarea declarata la curier s-ar socoti pe pretul de
   * catalog al liniei purtate, 89 in loc de 910. Coletul pleaca asigurat pe o suma mai mica si
   * nimeni nu afla.
   *
   * ⚠ Proba e pe sursa fiindca proiectul n-are jsdom, deci componenta nu se poate randa. Ce se cere
   * e o afirmatie structurala: ca amandoua maparile duc campul mai departe.
   */
  const sursa = readFileSync(
    path.resolve(process.cwd(), "src/components/ministore/OrderModal.tsx"), "utf8",
  ).replace(/\r\n/g, "\n");

  assert.match(
    sursa, /customization: i\.customization/,
    "liniile din cos pleaca spre comanda fara personalizare: serverul le va refuza",
  );
  assert.match(
    sursa, /personalizare: i\.customization/,
    "liniile din cos pleaca spre cotare fara personalizare: transportul se socoteste pe pretul de catalog",
  );
});
