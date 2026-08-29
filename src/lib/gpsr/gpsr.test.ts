import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gpsrEfectiv, gpsrLipsuri, gpsrDinProdus, gpsrPentruOlx, type GpsrConfig } from "./index";

/* ══════════════════════════════════════════════════════════════════════════
   GPSR: CINE RASPUNDE PENTRU SIGURANTA PRODUSULUI (30.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Regulamentul european cere ca fiecare produs vandut catre consumatori din UE sa arate cine e
   producatorul si cine raspunde pentru el in Uniune. OLX il cere prin `product_safety_regulation`
   si il refuza in categoriile unde e obligatoriu; eMAG si About You cer acelasi lucru, cu alte
   nume. Pana azi nu trimiteam nimic, deci acolo publicarea pica fara ca noi sa fi avut vreodata
   datele.

   ⚠ DOUA LOCURI, SI ASTA E MIEZUL. Producatorul e, de obicei, acelasi pentru tot catalogul: pus pe
   fiecare produs, ar fi rescris de trei mii de ori si gresit de la al doilea. Dar un revanzator are
   alt producator la fiecare brand — deci produsul poate SUPRASCRIE.

   ⚠ SUPRASCRIEREA E LA NIVEL DE PERSOANA, NU DE CAMP. Imbinate camp cu camp, s-ar naste o adresa
   jumatate a unui producator si jumatate a altuia: o informatie legala FALSA, mai rea decat una
   lipsa.
*/

const CONFIG: GpsrConfig = {
  manufacturer: { name: "Fabrica SRL", country: "RO", address: "Str. Uzinei 1, Cluj", email: "info@fabrica.ro" },
  contact_person: { name: "Reprezentant SRL", country: "RO", address: "Bd. UE 5, București", email: "ue@rep.ro" },
  warning_and_safety: "A nu se lăsa la îndemâna copiilor.",
};

test("⚠ fara nimic pe produs, se iau datele magazinului", () => {
  const r = gpsrEfectiv(null, CONFIG);
  assert.equal(r?.manufacturer?.name, "Fabrica SRL");
  assert.equal(r?.contact_person?.name, "Reprezentant SRL");
  assert.equal(r?.warning_and_safety, "A nu se lăsa la îndemâna copiilor.");
});

test("⚠ suprascrierea e pe PERSOANA intreaga, nu pe camp", () => {
  /*
   * ⚠ AICI E TOT ROSTUL. Produsul da doar numele altui producator. Imbinat camp cu camp, ar fi
   * iesit „Alta Fabrica SRL" cu ADRESA lui „Fabrica SRL" — o declaratie legala falsa, spusa cu
   * incredere. Persoana se ia intreaga, sau deloc.
   */
  const r = gpsrEfectiv({ gpsr: { manufacturer: { name: "Alta Fabrica SRL" } } }, CONFIG);
  assert.equal(r?.manufacturer?.name, "Alta Fabrica SRL");
  assert.equal(r?.manufacturer?.address, undefined,
    "adresa magazinului n-are voie sa se lipeasca de producatorul produsului");
  /* ⚠ Iar ce NU s-a suprascris cade tot pe magazin: reprezentantul a ramas al lui. */
  assert.equal(r?.contact_person?.name, "Reprezentant SRL");
});

test("⚠ o persoana goala nu suprascrie nimic", () => {
  /*
   * Formularul trimite siruri goale pentru campurile neatinse. Socotite drept suprascriere, ar fi
   * sters producatorul din setari — si produsul ar fi plecat fara el.
   */
  const r = gpsrEfectiv({ gpsr: { manufacturer: { name: "", address: "", email: "", phone: "" } } }, CONFIG);
  assert.equal(r?.manufacturer?.name, "Fabrica SRL");
});

test("⚠ cand nu stim nimic, nu se trimite un obiect gol", () => {
  /*
   * ⚠ `{}` inseamna „am declarat ceva" — neadevarat. Furnizorii il valideaza, iar refuzul lor pe un
   * obiect gol nu mai spune ce lipseste. Lipsa e mai cinstita.
   */
  assert.equal(gpsrEfectiv(null, null), null);
  assert.equal(gpsrEfectiv({ gpsr: {} }, {}), null);
});

test("⚠ `placed_before_2024` singur e destul, si vine numai de pe produs", () => {
  /*
   * E singurul camp care nu poate veni din setarile magazinului: tine de produs, nu de comerciant.
   * Iar pentru produsele astea regulamentul nu cere restul.
   */
  const r = gpsrEfectiv({ gpsr: { placed_before_2024: true } }, null);
  assert.deepEqual(r, { placed_before_2024: true });
  assert.deepEqual(gpsrLipsuri(r), [], "nu se mai cere nimic pentru ele");
});

test("⚠ lipsurile se numesc, ca omul sa afle inainte de refuzul lor", () => {
  /*
   * ⚠ SI TARA E IN LISTA. Schema OLX pentru `ProductSafetyRegulationsParty` are `name`, `country`,
   * `address`, `email` — iar `country` lipsea cu totul de la noi.
   *
   * ⚠ Si contactul cere NUME SI E-MAIL, nu „e-mail sau telefon": schema lor n-are `phone` deloc.
   * Ceruta asa, validarea noastra ar fi spus ca e in regula un contact pe care ei nu-l pot primi.
   */
  assert.deepEqual(gpsrLipsuri(gpsrEfectiv(null, null)), [
    "numele producătorului", "adresa producătorului", "țara producătorului",
    "persoana responsabilă din UE (nume și e-mail)",
  ]);
  assert.deepEqual(gpsrLipsuri(gpsrEfectiv(null, CONFIG)), []);
});

test("⚠ `page_sections` se citeste fara sa presupunem forma", () => {
  /*
   * ⚠ E jsonb: produsele vechi n-au cheia deloc, iar un import prost ar putea pune acolo un sir sau
   * o lista. O citire increzatoare ar fi aruncat in mijlocul unei publicari in masa.
   */
  for (const gunoi of [null, undefined, "text", 42, [], { gpsr: "text" }, { gpsr: [] }]) {
    assert.deepEqual(gpsrDinProdus(gunoi), {}, `n-a rezistat la ${JSON.stringify(gunoi)}`);
  }
});

test("⚠ corpul OLX poarta declaratia, si numai cand exista", () => {
  const mapping = readFileSync("src/lib/olx/mapping.ts", "utf8");
  assert.match(mapping, /\.\.\.\(gpsr \? \{ product_safety_regulation: gpsr \} : \{\}\)/,
    "cheia lipseste cu totul cand n-avem date, nu se trimite `{}`");
  /* ⚠ Si datele produsului chiar ajung pana aici: `page_sections` e in citire. */
  const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
  assert.match(sync, /PRODUCT_FIELDS =[\s\S]{0,220}?page_sections/,
    "fara coloana in citire, suprascrierea de pe produs n-ar fi vazuta niciodata");
  /* ⚠ Iar setarile magazinului se citesc O DATA, la context, nu la fiecare produs. */
  assert.match(sync, /\.select\("olx_config, gpsr_config"\)/);
  assert.match(sync, /gpsr: \(ss\?\.gpsr_config as GpsrConfig\) \?\? null/);
});

test("⚠ sectiunea din editor se arata doar cand un marketplace o cere", () => {
  /*
   * ⚠ Cerinta LEGALA il priveste pe oricine vinde in UE; cerinta TEHNICA — un API care refuza — e
   * numai a marketplace-urilor. Un comerciant fara nicio integrare n-are ce face cu campurile
   * astea acum, si n-are rost sa i le punem in drum. Acelasi tipar ca sectiunea Google Shopping.
   */
  const form = readFileSync("src/components/dashboard/ProductForm.tsx", "utf8");
  assert.match(form, /\{\(olxConnected \|\| emagConnected\) && \(/);
  /* ⚠ Si e deschisa din start daca produsul are deja o suprascriere: inchisa, ar ascunde date. */
  assert.match(form, /const \[showGpsr, setShowGpsr\] = useState\(/);
});

test("⚠ catre OLX pleaca STRICT schema lor, fara campuri in plus", () => {
  /*
   * ═══ ⚠ STRUCTURA COMUNA NU E STRUCTURA LOR (30.08.2026, tarziu) ═══
   *
   * `GpsrDate` e comuna celor trei marketplace-uri, fiindca informatia e aceeasi. Dar schema OLX
   * pentru `ProductSafetyRegulationsParty` are exact `name`, `country`, `address`, `email`. Trimis
   * asa cum il tinem noi, corpul purta un `phone` pe care schema lor nu-l cunoaste — iar campurile
   * in plus sunt tocmai ce respinge o validare stricta.
   *
   * ⚠ Taierea se face la MAPAREA LOR, nu prin saracirea structurii comune: telefonul ramane pentru
   * cine il cere.
   */
  const date = gpsrEfectiv({ gpsr: { manufacturer: { name: "X", country: "ro", address: "A", email: "e@x.ro", phone: "0700" } } }, null);
  assert.equal(date?.manufacturer?.phone, "0700", "structura comuna pastreaza telefonul");
  const alLor = gpsrPentruOlx(date);
  const man = alLor?.manufacturer as Record<string, unknown>;
  assert.deepEqual(Object.keys(man).sort(), ["address", "country", "email", "name"]);
  assert.equal(man.phone, undefined, "`phone` nu are ce cauta in schema OLX");
  /* ⚠ Si codul de tara pleaca in forma pe care o cer: doua litere mari. */
  assert.equal(man.country, "RO");
  /* ⚠ Iar cand n-avem nimic, nu se trimite un obiect gol. */
  assert.equal(gpsrPentruOlx(null), null);
});
