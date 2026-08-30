/**
 * Ofertele eMAG, facute produse Edinio. Tot pur, tot fara retea.
 *
 * ═══ ⚠ SALTUL DE MODEL: EI N-AU VARIANTE, NOI AVEM ═══
 *
 * La eMAG fiecare marime e o OFERTA SEPARATA, cu id propriu, legata de surorile ei
 * printr-o `family`. La noi, un tricou in S, M si L e UN produs cu trei combinatii.
 *
 * Deci importul nu poate merge oferta cu oferta. Un comerciant care are pe eMAG un
 * tricou in trei marimi si-ar fi vazut in Edinio TREI produse — cu acelasi nume,
 * aceeasi poza si stocul rupt in trei. Si nu s-ar fi plans de asta ca de un defect,
 * ci ar fi crezut ca asa merge platforma, si ar fi stat sa le uneasca de mana.
 *
 * De aceea ofertele se strang intai in familii, si abia familia devine produs.
 *
 * ═══ CE DA NUMELE UNEI COMBINATII ═══
 *
 * eMAG nu trimite „S" ca atare. Trimite un tablou de caracteristici, iar care
 * dintre ele DESPART membrii familiei se afla din categoria lor:
 * `category/read` -> `family_types[].characteristics[].characteristic_id`.
 *
 * Fara maparea asta n-am fi avut de unde lua titlul si am fi ramas la un numar de
 * ordine — adica un produs cu combinatiile „1", „2", „3", care nu spun nimic nici
 * comerciantului, nici cumparatorului.
 */

import type { EmagCategorie, EmagImagine, EmagOfertaCitita } from "./types";
import type { StagedImage, StagedProduct, StagedVariantCombination } from "@/lib/import/types";
import { normalizeazaPartNumber } from "./mapping";
import { VARIANT_TITLE_SEP } from "@/lib/storefront/variants";

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL, INAPOI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Pretul asa cum il tine magazinul, din pretul fara TVA pe care il da eMAG.
 *
 * ⚠ EXACT INVERSUL LUI `pretFaraTva`, SI ASA TREBUIE SA RAMANA. eMAG da toate
 * preturile fara TVA. Magazinele noastre le tin cu sau fara, dupa
 * `store_settings.prices_include_vat`.
 *
 * Luat de-a gata, un catalog importat ar fi aparut in magazin mai ieftin cu o cota
 * intreaga de TVA — la 21%, o cincime sub pret. Si nu da nicio eroare: produsele se
 * publica, se vand, si se afla din marja peste o luna.
 *
 * Probat impotriva lui `pretFaraTva`: dus si intors, acelasi numar.
 */
export function pretDeAfisat(faraTva: number, cotaProcente: number, includeTva: boolean): number {
  if (!Number.isFinite(faraTva) || faraTva <= 0) return 0;
  if (!includeTva) return douaZecimale(faraTva);
  const cota = Number.isFinite(cotaProcente) ? cotaProcente : 0;
  return douaZecimale(faraTva * (1 + cota / 100));
}

/**
 * ⚠ DOUA ZECIMALE LA INTOARCERE, PATRU LA DUCERE, SI E DINADINS.
 *
 * Spre eMAG se trimit patru, cate ingaduie ei, ca sa nu se piarda nimic la
 * impartirea cu TVA-ul. Dar `products.price` e pretul pe care il vede omul pe
 * eticheta, si nimeni nu vinde cu 82,6364 lei. Rotunjit aici, o data.
 */
function douaZecimale(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE STIM DESPRE CATEGORIILE LOR
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ContextCategoriiImport {
  /** `category_id` -> numele categoriei. Ce lipseste ramane fara categorie. */
  nume: Map<number, string>;
  /** `family_type_id` -> id-urile caracteristicilor care despart membrii familiei. */
  caracteristiciDeFamilie: Map<number, number[]>;
  /** `characteristic_id` -> numele ei („Mărime"), pentru numele axei de variante. */
  numeCaracteristici: Map<number, string>;
}

/** Contextul de import, strans din categoriile aduse cu `category/read`. */
export function contextDinCategorii(categorii: EmagCategorie[]): ContextCategoriiImport {
  const nume = new Map<number, string>();
  const caracteristiciDeFamilie = new Map<number, number[]>();
  const numeCaracteristici = new Map<number, string>();

  for (const c of categorii) {
    if (c.name) nume.set(c.id, c.name);
    for (const car of c.characteristics ?? []) {
      if (car.name) numeCaracteristici.set(car.id, car.name);
    }
    for (const ft of c.family_types ?? []) {
      const ids = (ft.characteristics ?? []).map((x) => x.characteristic_id).filter((x) => Number.isFinite(x));
      if (ids.length) caracteristiciDeFamilie.set(ft.id, ids);
    }
  }

  return { nume, caracteristiciDeFamilie, numeCaracteristici };
}

export interface ContextPreturiImport {
  /** Cota in PROCENTE (21 pentru 21%). */
  vat_rate: number;
  prices_include_vat: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRUPAREA IN FAMILII
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Familie {
  /** `0` inseamna „fara familie": oferta e un produs de sine statator. */
  family_id: number;
  family_type_id: number | null;
  /** ⚠ Sortate dupa `emag_id`, ca ordinea combinatiilor sa fie aceeasi la fiecare rulare. */
  membri: EmagOfertaCitita[];
}

/**
 * Ofertele, stranse in familii.
 *
 * ⚠ `family.id === 0` NU e o familie — asa scoate eMAG un produs dintr-o familie.
 * Bagate toate intr-un cos comun sub cheia 0, toate produsele simple ale unui
 * magazin ar fi devenit UN produs cu 300 de combinatii.
 */
export function grupeazaFamilii(oferte: EmagOfertaCitita[]): Familie[] {
  const familii = new Map<number, Familie>();
  const singuratice: Familie[] = [];

  for (const o of oferte) {
    const fid = o.family?.id ?? 0;
    if (!fid) {
      singuratice.push({ family_id: 0, family_type_id: null, membri: [o] });
      continue;
    }
    const f = familii.get(fid);
    if (f) f.membri.push(o);
    else familii.set(fid, { family_id: fid, family_type_id: o.family?.family_type_id ?? null, membri: [o] });
  }

  const toate = [...familii.values(), ...singuratice];
  for (const f of toate) f.membri.sort((a, b) => a.id - b.id);
  /* Ordinea familiilor conteaza si ea: `stageProducts` scrie `row_index` din pozitie,
     iar doua importuri ale aceluiasi catalog trebuie sa dea acelasi raport. */
  toate.sort((a, b) => (a.membri[0]?.id ?? 0) - (b.membri[0]?.id ?? 0));
  return toate;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TITLUL UNEI COMBINATII
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cum se numeste membrul asta al familiei.
 *
 * Se iau valorile caracteristicilor care despart familia, in ordinea in care le da
 * categoria, si se lipesc cu separatorul casei.
 *
 * ⚠ CAND NU SE POATE AFLA, SE CADE PE `part_number`, NU PE UN NUMAR DE ORDINE.
 * Un numar de ordine ar fi aratat la fel la fiecare produs si s-ar fi SCHIMBAT cand
 * comerciantul mai adauga o marime — iar `emag_offers.variant_title` e chiar
 * legatura pe care se scade stocul la o vanzare. Mutata sub picioare, vanzarea unei
 * marimi ar fi scazut stocul alteia. `part_number` e al ofertei si nu se muta.
 */
export function titluCombinatie(
  o: EmagOfertaCitita,
  caracteristiciDeFamilie: number[],
): string {
  const dupaId = new Map<number, string>();
  for (const c of o.characteristics ?? []) {
    if (typeof c?.value === "string" && c.value.trim()) dupaId.set(c.id, c.value.trim());
  }
  const bucati = caracteristiciDeFamilie.map((id) => dupaId.get(id)).filter((v): v is string => !!v);
  if (bucati.length) return bucati.join(VARIANT_TITLE_SEP);
  return (o.part_number ?? "").trim() || `#${o.id}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMAGINI SI STOC
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Imaginile, cu principala prima.
 *
 * ⚠ `display_type: 1` e principala la ei. Lasate in ordinea primita, produsul ar fi
 * aparut in magazin cu alta poza decat pe eMAG — si comerciantul ar fi crezut ca
 * importul i-a stricat pozele.
 */
export function imaginiDeImportat(imagini: EmagImagine[] | undefined): StagedImage[] {
  const bune = (imagini ?? []).filter((i) => typeof i?.url === "string" && i.url.trim());
  const rang = (i: EmagImagine) => (i.display_type === 1 ? 0 : 1);
  return [...bune]
    .sort((a, b) => rang(a) - rang(b))
    .map((i, idx) => ({ src: i.url.trim(), position: idx }));
}

/**
 * Cate bucati are oferta.
 *
 * ⚠ `stock[]` e PE DEPOZIT, si se aduna. Luata doar prima intrare, un comerciant cu
 * doua depozite si-ar fi vazut in Edinio jumatate din marfa — iar magazinul ar fi
 * spus „stoc epuizat" pentru produse care exista.
 */
export function stocDeImportat(o: EmagOfertaCitita): number {
  const dinDepozite = (o.stock ?? []).reduce(
    (s, x) => s + (Number.isFinite(x?.value) ? Math.max(0, x.value) : 0), 0,
  );
  if (dinDepozite > 0) return dinDepozite;
  /* `general_stock` e ce vede cumparatorul la ei. Se ia doar cand nu s-a putut aduna
     nimic pe depozite — nu in loc, fiindca ei il pot plafona. */
  return Number.isFinite(o.general_stock) ? Math.max(0, o.general_stock!) : 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAMILIA -> PRODUS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `external_id`-ul produsului creat.
 *
 * ⚠ SE PREFIXEAZA, SI NU E COCHETARIE. Cheia de dedublare e
 * `products_source_external_uidx (business_id, source, external_id)`. Un `family_id`
 * si un `emag_id` sunt amandoua numere din contul aceluiasi comerciant si se pot
 * ciocni — familia 12 si oferta 12 ar fi scris amandoua `"12"`, iar al doilea import
 * ar fi „actualizat" produsul gresit in loc sa-l creeze pe al lui.
 */
export function idExtern(f: Familie): string {
  return idExternDin(f.family_id, f.membri[0]!.id);
}

/**
 * Acelasi `external_id`, compus din numere in loc de familie.
 *
 * ⚠ EXISTA CA SA NU FIE SCRIS DE DOUA ORI. Legarea produselor nou create
 * (`leagaOferteleNoi`) porneste de la randuri din `emag_offers`, unde n-are nicio
 * familie la indemana — doar `family_id` si `emag_id`. Compus acolo de mana, ar fi
 * fost al doilea loc care trebuie sa spuna EXACT acelasi lucru.
 *
 * Iar daca cele doua s-ar fi departat vreodata cu o litera, legarea n-ar fi gasit
 * niciun produs si n-ar fi dat nicio eroare: importul ar fi creat produsele, dar
 * ofertele ar fi ramas nelegate pe veci, iar comerciantul ar fi vazut catalogul
 * importat si stocul nesincronizat, fara nicio legatura vizibila intre cele doua.
 */
export function idExternDin(familyId: number | null, emagId: number): string {
  return familyId ? `familie-${familyId}` : `oferta-${emagId}`;
}

export interface ProduseDeCreat {
  produse: StagedProduct[];
  /** Cate o linie pentru fiecare familie care n-a putut fi facuta produs. */
  probleme: string[];
  /** `external_id` -> ce oferte l-au compus. Din el se scriu randurile `emag_offers`. */
  compozitie: Map<string, { emag_id: number; variant_title: string | null }[]>;
}

/**
 * Familiile, facute produse gata de pus in conducta de import a casei.
 *
 * ⚠ NU CREEAZA NIMIC SI NU SCRIE NIMIC. Da `StagedProduct[]`, adica exact ce
 * mananca `stageProducts()`. Asa se mostenesc de-a gata: dedublarea de slug,
 * `upsertCategoryPath`, limita de plan, mutarea imaginilor in R2 si raportul CSV de
 * erori — toate probate deja pe importurile din Shopify si WooCommerce.
 */
export function produseDeCreat(
  familii: Familie[],
  cat: ContextCategoriiImport,
  pret: ContextPreturiImport,
): ProduseDeCreat {
  const produse: StagedProduct[] = [];
  const probleme: string[] = [];
  const compozitie = new Map<string, { emag_id: number; variant_title: string | null }[]>();

  for (const f of familii) {
    const cap = f.membri[0];
    if (!cap) continue;

    const nume = (cap.name ?? "").trim();
    if (!nume) {
      probleme.push(`Oferta ${cap.id} nu are nume la eMAG și nu poate deveni produs.`);
      continue;
    }

    const extern = idExtern(f);
    const caleCategorie = numeCategorie(cap.category_id, cat);
    const marca = (cap.brand ?? "").trim() || null;

    /* ── Produs simplu ────────────────────────────────────────────────────── */
    if (f.membri.length === 1 && !f.family_id) {
      produse.push({
        external_id: extern,
        name: nume,
        slug: null,
        description_html: (cap.description ?? "").trim() || null,
        price: pretDeAfisat(cap.sale_price ?? 0, pret.vat_rate, pret.prices_include_vat),
        compare_at_price: null,
        sku: normalizeazaPartNumber(cap.part_number) || null,
        category_path: caleCategorie,
        tags: [],
        images: imaginiDeImportat(cap.images),
        track_inventory: true,
        stock_quantity: stocDeImportat(cap),
        weight_grams: null,
        is_active: cap.status === 1,
        is_featured: false,
        variants: null,
        seo: null,
        gtin: (cap.ean ?? [])[0] ?? null,
        brand: marca,
      });
      compozitie.set(extern, [{ emag_id: cap.id, variant_title: null }]);
      continue;
    }

    /* ── Familie -> produs cu combinatii ──────────────────────────────────── */
    const idCar = f.family_type_id ? (cat.caracteristiciDeFamilie.get(f.family_type_id) ?? []) : [];
    if (f.family_id && idCar.length === 0) {
      /*
       * ⚠ NU SE INVENTEAZA O AXA. Fara caracteristicile care despart familia, nu
       * stim CE le deosebeste — doar ca sunt deosebite. Un produs cu combinatiile
       * „TR-S", „TR-M" ar fi aratat cumparatorului niste coduri drept marimi.
       * Mai bine se spune limpede si le uneste comerciantul.
       */
      probleme.push(
        `Familia ${f.family_id} („${nume}", ${f.membri.length} oferte) nu are tipul de familie ` +
        `în categoriile aduse de la eMAG, deci nu se știe ce deosebește mărimile. ` +
        `Produsele nu au fost create — verifică accesul la categoria ${cap.category_id ?? "?"}.`,
      );
      continue;
    }

    const numeAxa = idCar.map((id) => cat.numeCaracteristici.get(id) ?? `Opțiune ${id}`);
    const combinatii: StagedVariantCombination[] = [];
    const vazute = new Set<string>();
    const aleMele: { emag_id: number; variant_title: string | null }[] = [];

    for (const m of f.membri) {
      const titlu = titluCombinatie(m, idCar);
      /*
       * ⚠ TITLURILE CARE SE REPETA SE SAR, PRIMUL CASTIGA. Aceeasi regula ca
       * `combinatiiActiveUnice()`, si din acelasi motiv masurat: in datele reale
       * exista 31 de titluri duplicate pe 7 produse. Doua combinatii cu acelasi
       * titlu inseamna doua randuri `emag_offers` cu aceeasi cheie
       * `(business_id, product_id, variant_title)` — adica scrierea cade, si cade
       * pentru tot produsul.
       */
      if (vazute.has(titlu)) {
        probleme.push(
          `Oferta ${m.id} din familia ${f.family_id} are aceeași denumire de variantă („${titlu}") ` +
          `ca o alta și a fost sărită.`,
        );
        continue;
      }
      vazute.add(titlu);
      combinatii.push({
        id: titlu.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `v${m.id}`,
        title: titlu,
        price: pretDeAfisat(m.sale_price ?? 0, pret.vat_rate, pret.prices_include_vat),
        sku: normalizeazaPartNumber(m.part_number),
        enabled: m.status === 1,
        stock_quantity: stocDeImportat(m),
        gtin: (m.ean ?? [])[0],
      });
      aleMele.push({ emag_id: m.id, variant_title: titlu });
    }

    if (combinatii.length === 0) {
      probleme.push(`Familia ${f.family_id} („${nume}") nu a produs nicio variantă validă.`);
      continue;
    }

    produse.push({
      external_id: extern,
      name: nume,
      slug: null,
      description_html: (cap.description ?? "").trim() || null,
      /*
       * ⚠ Pretul produsului e CEL MAI MIC dintre combinatii, nu al primei. Asa scrie
       * „de la X lei" peste tot in magazin; luat de la prima, un tricou al carui S
       * costa mai mult ar fi aratat mai scump decat e.
       */
      price: Math.min(...combinatii.map((c) => c.price).filter((p) => p > 0)) || combinatii[0].price,
      compare_at_price: null,
      sku: normalizeazaPartNumber(cap.part_number) || null,
      category_path: caleCategorie,
      tags: [],
      images: imaginiDeImportat(cap.images),
      track_inventory: true,
      stock_quantity: combinatii.reduce((s, c) => s + c.stock_quantity, 0),
      weight_grams: null,
      is_active: f.membri.some((m) => m.status === 1),
      is_featured: false,
      variants: {
        enabled: true,
        options: numeAxa.length
          ? numeAxa.map((n, i) => ({
              id: n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `optiune-${i}`,
              name: n,
              values: [...new Set(combinatii.map((c) => c.title.split(VARIANT_TITLE_SEP)[i]).filter(Boolean))],
            }))
          : [{ id: "varianta", name: "Variantă", values: combinatii.map((c) => c.title) }],
        combinations: combinatii,
      },
      seo: null,
      gtin: (cap.ean ?? [])[0] ?? null,
      brand: marca,
    });
    compozitie.set(extern, aleMele);
  }

  return { produse, probleme, compozitie };
}

/**
 * Calea categoriei.
 *
 * ⚠ CAND NU SE STIE NUMELE, PRODUSUL RAMANE FARA CATEGORIE. Alternativa ar fi fost
 * „Categoria 1234", si atunci `upsertCategoryPath` ar fi facut in magazin cate o
 * categorie cu numar pentru fiecare categorie eMAG neadusa — gunoi vizibil in
 * meniul magazinului, pe care comerciantul l-ar fi curatat de mana.
 */
function numeCategorie(id: number | undefined, cat: ContextCategoriiImport): string[] {
  if (!id) return [];
  const n = cat.nume.get(id);
  return n ? [n] : [];
}
