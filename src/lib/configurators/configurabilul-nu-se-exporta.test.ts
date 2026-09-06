import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ceLipseste } from "../emag/pregatire";
import { validateListing } from "../aboutyou/mapping";
import type { AboutYouListingEnrichment, MappableProduct } from "../aboutyou/mapping";
import type { AboutYouConfig } from "../aboutyou/types";
import { motivulConfiguratorului } from "./nu-se-exporta";

/**
 * Un produs CONFIGURABIL nu se exporta pe niciun canal din afara.
 *
 * ═══ ⚠ CE COSTA DACA O SINGURA INTEGRARE RAMANE FARA GARDA ═══
 *
 * Pretul unui produs configurabil se naste din ce alege cumparatorul. Niciunul dintre canale nu
 * poate purta alegerile inapoi, deci acolo produsul sta la pretul de baza — pretul unui obiect
 * care nu exista. Se vinde, si comerciantul primeste o comanda pe care n-are cum s-o onoreze.
 *
 * ⚠ Si paguba NU se opreste cand se repara codul: produsul e deja listat, reclama deja plateste
 * clicuri, iar comenzile continua sa vina. De-aia regula e „nu se exporta deloc", si de-aia
 * fiecare canal trebuie sa aiba garda ACUM, nu la prima reclamatie.
 *
 * ═══ ⚠ DE CE LISTA CANALELOR SE CITESTE DIN COD ═══
 *
 * Scrisa de mana aici, ea ar fi ramas in urma exact la ce ne temem: al saptelea marketplace.
 * Cine leaga unul nou ATINGE `marketplace/stoc-pe-canale.ts` — altfel o vanzare pe un canal nu
 * mai scade stocul pe celelalte, adica insasi propozitia cu care se vinde Edinio. Deci lista de
 * acolo e cea care se tine la zi singura, si de acolo se citeste.
 *
 * ⚠ SI ARE O GARDA DE NUMARATOARE. Un cititor care se rupe (regexul nu mai prinde) ar intoarce
 * zero canale, iar proba ar trece VERDE peste toate. O proba care nu poate cadea nu apara nimic:
 * vezi cele 88 de alarme ale santinelei, niciuna adevarata.
 */

const RADACINA = process.cwd();

function sursa(rel: string): string {
  /* ⚠ Terminatiile se normalizeaza: depozitul are si fisiere CRLF pe disc. */
  return readFileSync(path.join(RADACINA, rel), "utf8").replace(/\r\n/g, "\n");
}

/** Toate fisierele `.ts`/`.tsx` de sub un dosar, fara probe. Dosarul lipsa da lista goala. */
function fisiere(rel: string): string[] {
  const abs = path.join(RADACINA, rel);
  let intrari: string[];
  try {
    intrari = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const nume of intrari) {
    const sub = path.join(rel, nume);
    if (statSync(path.join(RADACINA, sub)).isDirectory()) {
      out.push(...fisiere(sub));
    } else if (/\.tsx?$/.test(nume) && !nume.endsWith(".test.ts") && !nume.endsWith(".test.tsx")) {
      out.push(sub.split(path.sep).join("/"));
    }
  }
  return out;
}

/** Semnul dupa care se recunoaste garda: chemarea ajutorului comun. */
const GARDA = "configurabileDeExport(";

interface Canal {
  /** Cheia din `IMPINGERI`: `emag`, `gmc`, … */
  cheie: string;
  /** Dosarul integrarii, dedus din importul functiei de coada. */
  dosar: string;
}

/**
 * Canalele, citite din `marketplace/stoc-pe-canale.ts`.
 *
 * Se leaga cheia de dosar prin SIMBOLUL importat (`gmc: enqueueGmcSyncMany` ->
 * `@/lib/google-merchant/queue`), ca sa nu existe niciun tabel de traducere scris de mana:
 * „gmc" si „google-merchant" n-au nicio litera comuna.
 */
function canaleDinCod(): Canal[] {
  const s = sursa("src/lib/marketplace/stoc-pe-canale.ts");
  const dosarul = new Map<string, string>();
  for (const m of s.matchAll(/import \{\s*(\w+)\s*\} from "@\/lib\/([\w-]+)\/queue";/g)) {
    dosarul.set(m[1], m[2]);
  }
  /* ⚠ Nu `[^=]*` inaintea acoladei: tipul tabelului contine el insusi un `=>`, deci
     potrivirea s-ar opri inainte sa ajunga la chei — si lista ar iesi GOALA, adica verde. */
  const bloc = /const IMPINGERI\b([\s\S]*?)\n\};/.exec(s);
  assert.ok(bloc, "nu mai gasesc tabelul IMPINGERI — cititorul s-a rupt, nu integrarile");
  const out: Canal[] = [];
  for (const m of bloc[1].matchAll(/^\s*(\w+):\s*(\w+),/gm)) {
    const dosar = dosarul.get(m[2]);
    assert.ok(dosar, `canalul ${m[1]} trimite la ${m[2]}, care nu vine din niciun "@/lib/…/queue"`);
    out.push({ cheie: m[1], dosar });
  }
  return out;
}

/**
 * Feedurile care se CITESC de la noi, nu se imping de noi.
 *
 * Ele n-au coada, deci nu apar in `IMPINGERI`. Semnul lor e ca sunt rute publice care citesc
 * produse: azi asta inseamna catalogul Meta.
 */
function feeduriDinCod(): string[] {
  return fisiere("src/app/(public)")
    .filter((f) => f.endsWith("/route.ts") && sursa(f).includes('from("products")'));
}

/** Toate fisierele in care ar putea sta garda unui canal. */
function razaCanalului(c: Canal): string[] {
  const cron = fisiere("src/app/api/cron").filter((f) => f.includes(`/cron/${c.cheie}-`));
  return [...fisiere(`src/lib/${c.dosar}`), ...cron];
}

test("lista canalelor se citeste din cod, si cititorul ei poate sa cada", () => {
  const canale = canaleDinCod();
  const feeduri = feeduriDinCod();
  /*
   * ⚠ GARDA DE NUMARATOARE. Fara ea, un regex rupt ar da zero canale si toate probele de mai jos
   * ar trece pe o lista goala — verde peste sase integrari nepazite.
   */
  assert.ok(
    canale.length >= 5,
    `am citit doar ${canale.length} canale din stoc-pe-canale.ts; cititorul s-a rupt`,
  );
  assert.ok(
    feeduri.length >= 1,
    "n-am gasit nicio ruta publica de feed care citeste produse; cititorul s-a rupt",
  );
  for (const c of canale) {
    assert.ok(
      razaCanalului(c).length > 0,
      `canalul ${c.cheie} n-are niciun fisier in src/lib/${c.dosar} — legatura cheie->dosar s-a rupt`,
    );
  }
});

test("FIECARE integrare care exporta produse trece prin garda de configurator", () => {
  const lipsesc: string[] = [];
  for (const c of canaleDinCod()) {
    const raza = razaCanalului(c);
    if (!raza.some((f) => sursa(f).includes(GARDA))) lipsesc.push(c.cheie);
  }
  for (const f of feeduriDinCod()) {
    if (!sursa(f).includes(GARDA)) lipsesc.push(f);
  }
  assert.deepEqual(
    lipsesc, [],
    `integrarile astea exporta produse fara sa intrebe de configurator: ${lipsesc.join(", ")}. `
    + "Un produs configurabil ar pleca acolo la pretul de baza.",
  );
});

test("niciun loc nu citeste multimea fara sa se uite si la verdict", () => {
  /*
   * ⚠ `configuratoareleCuVerdict` intoarce o harta GOALA si cand citirea a picat. Luata fara
   * `ok`, o pana de o clipa a bazei inseamna „niciun produs n-are configurator" — adica exact
   * catalogul intreg trimis la pretul de baza, pentru o secunda proasta.
   */
  const cu = [...fisiere("src/lib"), ...fisiere("src/app")]
    .filter((f) => !f.endsWith("nu-se-exporta.ts") && sursa(f).includes(GARDA));
  assert.ok(
    cu.length >= 6,
    `garda e chemata doar din ${cu.length} fisiere; asteptam cel putin cate unul pe integrare`,
  );
  const fara = cu.filter((f) => !/\bconfigurabile\.ok\b/.test(sursa(f)));
  assert.deepEqual(
    fara, [],
    `fisierele astea folosesc multimea fara sa citeasca verdictul: ${fara.join(", ")}`,
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Si cele doua verdicte PURE, probate pe fapte, nu pe sursa
   ═══════════════════════════════════════════════════════════════════════════ */

test("eMAG: configuratorul opreste publicarea, iar lipsa lui n-o opreste", () => {
  const magazin = { areGpsr: false };
  const cu = ceLipseste({ name: "Masa", price: 100, sku: "M1", brand: "X", areConfigurator: true }, null, magazin, false);
  const fara = ceLipseste({ name: "Masa", price: 100, sku: "M1", brand: "X", areConfigurator: false }, null, magazin, false);
  const blocheaza = (l: { camp: string; gravitate: string }[]) =>
    l.some((x) => x.camp === "configurator" && x.gravitate === "blocheaza");
  assert.equal(blocheaza(cu), true, "produsul configurabil ar pleca pe eMAG la pretul de baza");
  assert.equal(blocheaza(fara), false, "un produs fara configurator nu are de ce sa fie oprit");
});

test("About You: configuratorul intra intre problemele care blocheaza trimiterea", () => {
  const config: AboutYouConfig = {};
  const product: MappableProduct = {
    id: "p1", name: "Masa", description: null, price: 100, compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"], category: "Mese", sku: "M1", weight_grams: 1000,
  };
  const listing: AboutYouListingEnrichment = {
    brand_id: 1, category_id: 2, color_id: 3, attributes: [],
    material_composition: null, country_of_origin: "RO", hs_code: null,
  };
  const cu = validateListing({ config, product, listing, variants: [], areConfigurator: true });
  const fara = validateListing({ config, product, listing, variants: [], areConfigurator: false });
  const mesaj = motivulConfiguratorului("About You");
  assert.ok(cu.issues.includes(mesaj), "produsul configurabil ar pleca pe About You la pretul de baza");
  assert.ok(!fara.issues.includes(mesaj), "un produs fara configurator nu are de ce sa fie oprit");
});

test("mesajul spune si ce are omul de facut, nu doar ce s-a intamplat", () => {
  /*
   * ⚠ Fara ultima propozitie, mesajul e un diagnostic dintr-o lista pe care comerciantul o vede
   * peste ore, cand nu mai tine minte ce a atins. Si poarta NUMELE canalului: acelasi text pe
   * sase canale l-ar fi lasat sa caute singur pe care dintre ele e blocat produsul.
   */
  const m = motivulConfiguratorului("OLX");
  assert.match(m, /configurator/i);
  assert.match(m, /pretul de baza/i);
  assert.equal(m.split("OLX").length - 1, 2, "numele canalului nu mai apare de doua ori in mesaj");
});
