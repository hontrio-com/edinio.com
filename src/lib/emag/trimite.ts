/**
 * Trimiterea unei modificari catre eMAG.
 *
 * Drumul il alege `rute.ts`, incarcatura o construieste `mapping.ts`, verdictul il
 * da `errors.ts`. Aici e legatura dintre ele si scrisul inapoi in baza.
 *
 * ═══ ⚠ CE SE INTAMPLA CU UN ELEMENT CARE NU REUSESTE ═══
 *
 * Nu se sterge din coada si nu se pretinde ca a mers. Verdictul hotaraste:
 *
 *   `reusit`               iese din coada, `last_synced_at` se scrie
 *   `reusit_cu_observatii` iese din coada — oferta E salvata la ei — dar
 *                          `doc_errors` se pastreaza si se arata omului
 *   `refuz`                arde o incercare, ramane in coada, motivul se scrie
 *   `trecatoare`           ⚠ NU arde nicio incercare. 429 sau 5xx nu sunt vina
 *                          nimanui, iar arse, cinci minute de pana la ei ar goli
 *                          coada unui magazin intreg
 *   `chei`                 se opreste MAGAZINUL, nu elementul: `needs_reconnect`
 *
 * Ultimele doua sunt lectii scrise cu pretul lor in `src/lib/trendyol/sync.ts:81`.
 */

import {
  potrivesteCaracteristici, type Nepotrivire, type Specificatie,
} from "./caracteristici";
import { caracteristiciLipsa } from "./taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import {
  actualizeazaStoc, cautaDupaEan, isEmagError, salveazaMasuratori, salveazaOferte,
  salveazaProduseOferte,
} from "./client";
import { mesajOmenesc, sAIncheiat, type VerdictEmag } from "./errors";
import {
  construiesteOferte, masuratoriEmag, oferteUsoare, stocuriDeTrimis,
  type IdentitateUsoara, type ProdusDeCartografiat,
} from "./mapping";
import { rutaDeTrimitere } from "./rute";
import { eanuriDeCautat, verdictEan, type RaspunsEan } from "./ean";
import { ceLipseste, type ProdusDeVerificat } from "./pregatire";
import type { ContextEmag } from "./sync";
import type { EmagOferta, EmagProdusOferta, StareOferta } from "./types";
import type { OpEmag } from "./queue";

type Admin = ReturnType<typeof createAdminClient>;

/** Un rand `emag_offers`, cat trebuie ca sa se poata trimite. */
interface RandOfertaLocal {
  id: string;
  emag_id: number;
  variant_title: string | null;
  family_id: number | null;
  part_number_key: string | null;
  ean: string | null;
  auto_sync: boolean;
  last_synced_at: string | null;
  /**
   * `false` = oferta a fost PRELUATA din contul lor la import.
   *
   * ⚠ E singurul semn ca oferta EXISTA la eMAG fara ca noi s-o fi trimis vreodata.
   * `last_synced_at` nu spune asta: el inseamna „cand am trimis NOI", si e gol pentru
   * tot ce s-a importat.
   */
  creat_de_edinio: boolean;
}

export interface RezultatTrimitere {
  verdict: VerdictEmag | "sarit";
  mesaj: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ELEMENTUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un element din coada, dus pana la capat.
 *
 * ⚠ `fortat` vine de la apasarea comerciantului, NU din coada. Coada duce numai
 * lucru automat; butonul „Trimite acum" trece si peste ofertele preluate, fiindca
 * „nu trimite singur" nu inseamna „nu trimite niciodata".
 */
export async function trimiteElement(
  admin: Admin,
  ctx: ContextEmag,
  productId: string,
  op: OpEmag,
  fortat = false,
): Promise<RezultatTrimitere> {
  const produs = await citesteProdusul(admin, productId, ctx.businessId);
  if (!produs) {
    /*
     * ⚠ Produsul nu mai e la noi, iar lucrarea nu e o retragere. NU e o eroare de
     * repetat: reincercata, ar arde cele cinci incercari si ar sta in coada zile
     * intregi. Se incheie linistit.
     */
    if (op !== "retragere") return { verdict: "sarit", mesaj: "Produsul nu mai există în magazin." };
  }

  const randuri = await citesteRandurile(admin, ctx.businessId, productId);
  /*
   * ═══ ⚠ O OFERTA PRELUATA EXISTA LA EI, CHIAR DACA N-AM TRIMIS-O NOI NICIODATA ═══
   *
   * Forma dinainte se uita doar la `last_synced_at`. Dar importul nu-l scrie — si nici
   * n-ar trebui: acela inseamna „cand am trimis NOI".
   *
   * Deci fiecare oferta preluata din contul comerciantului iesea cu
   * `existaLaEmag: false`, iar `rutaDeTrimitere` intorcea „nimic" la RETRAGERE. Adica:
   * stergi un produs importat din magazin, elementul intra in coada, iese „sarit", se
   * sterge, se numara la „duse" — si oferta ramane la VANZARE pe eMAG.
   *
   * Comerciantul vede produsul disparut din Edinio si comenzi care continua sa vina
   * pentru marfa pe care n-o mai are. Niciun mesaj de eroare, nicaieri.
   *
   * `creat_de_edinio: false` e scris de import (`import-run.ts`) si numai de el; ce
   * facem noi primeste `true`. Deci e semnul exact.
   */
  const existaLaEmag = randuri.some(
    (r) => r.last_synced_at != null || r.creat_de_edinio === false,
  );
  const autoSync = randuri.length === 0 ? true : randuri.every((r) => r.auto_sync);

  const ruta = rutaDeTrimitere({
    op, existaLaEmag, autoSync, fortat,
    /* ⚠ Implicit PORNIT: cine publica din Edinio se asteapta ca fisa sa vina tot de
       acolo. Se opreste doar cand comerciantul cere asta explicit. */
    sincronizeazaContinut: ctx.config.sync_continut !== false,
    /* ⚠ Marcajul, nu numarul de randuri preluate. Un cont eMAG gol are zero oferte
       preluate dupa un import reusit — citit din numar, un comerciant nou n-ar fi
       putut publica niciodata. Vezi `catalog_citit_la` in `types.ts`. */
    catalogCitit: !!ctx.config.catalog_citit_la,
  });
  if (ruta.fel === "nimic") {
    await scrieEroare(admin, ctx.businessId, productId, ruta.motiv ?? "");
    return { verdict: "sarit", mesaj: ruta.motiv ?? "" };
  }

  if (ruta.fel === "retrage") return retrage(admin, ctx, randuri);
  if (!produs) return { verdict: "sarit", mesaj: "Produsul nu mai există în magazin." };
  if (ruta.fel === "stoc") return duStocul(admin, ctx, produs, randuri);
  if (ruta.fel === "masuratori") return duMasuratorile(ctx, produs, randuri);
  if (ruta.fel === "oferta") return duOferta(admin, ctx, produs, randuri);
  return duTotul(admin, ctx, produs, randuri, fortat);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITIRILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Specificatiile din fisa produsului, in forma pe care o asteapta potrivirea.
 *
 * ⚠ Forma reala din productie, masurata pe 24.08.2026: `page_sections.specifications`
 * e un tablou de `{label, value}`. Citita ca obiect sau ca text, ar fi iesit goala si
 * potrivirea n-ar fi facut nimic — tacut, cu toate caracteristicile lipsa.
 */
function specificatiile(produs: ProdusDeCartografiat): Specificatie[] {
  const ps = (produs.page_sections ?? {}) as { specifications?: unknown };
  if (!Array.isArray(ps.specifications)) return [];
  return ps.specifications
    .map((x) => {
      const o = (x ?? {}) as { label?: unknown; value?: unknown };
      return {
        label: typeof o.label === "string" ? o.label : "",
        value: typeof o.value === "string" ? o.value : String(o.value ?? ""),
      };
    })
    .filter((s) => s.label.trim().length > 0 && s.value.trim().length > 0);
}

async function citesteProdusul(
  admin: Admin, productId: string, businessId: string,
): Promise<ProdusDeCartografiat | null> {
  const { data } = await admin.from("products")
    .select("id, name, description, price, compare_at_price, images, category, sku, weight_grams, stock_quantity, is_active, page_sections")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  return (data as ProdusDeCartografiat | null) ?? null;
}

async function citesteRandurile(
  admin: Admin, businessId: string, productId: string,
): Promise<RandOfertaLocal[]> {
  const { data } = await admin.from("emag_offers")
    .select("id, emag_id, variant_title, family_id, part_number_key, ean, auto_sync, last_synced_at, creat_de_edinio")
    .eq("business_id", businessId).eq("product_id", productId)
    .order("emag_id", { ascending: true });
  return (data as RandOfertaLocal[] | null) ?? [];
}

/* ═══════════════════════════════════════════════════════════════════════════
   RUTA GREA: PRODUS + DOCUMENTATIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `POST /product_offer/save` — singura care creeaza.
 *
 * ⚠ AICI SE ALOCA IDENTITATILE, INAINTE DE ORICE TRIMITERE. `emag_id` e cheia dupa
 * care eMAG recunoaste oferta si trebuie sa fie STABILA pe veci: generata la
 * trimitere, fiecare trimitere ar fi creat alta oferta acolo si ar fi lasat-o pe cea
 * veche orfana. Deci randul se scrie intai la noi, si abia apoi pleaca.
 */
async function duTotul(
  admin: Admin, ctx: ContextEmag, produs: ProdusDeCartografiat, randuri: RandOfertaLocal[],
  /**
   * Comerciantul a apasat el pe UN produs.
   *
   * ⚠ Numai atunci se cere lui eMAG sa descarce iar imaginile. Vezi nota de la
   * `force_images_download` din `mapping.ts`: au o limita stransa, atinsa din prima
   * cerere. Coada nu forteaza niciodata.
   */
  fortat = false,
): Promise<RezultatTrimitere> {
  const categorie = ctx.config.category_map?.[produs.category ?? ""];
  if (!categorie?.category_id) {
    const m = `Produsul are categoria „${produs.category ?? "—"}", care nu e legată de nicio categorie eMAG.`;
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  /*
   * ═══ ⚠ SE VERIFICA LOCAL INAINTE DE A CHEMA EMAG ═══
   *
   * Un produs incomplet trimis costa de patru ori: arde o cerere din cele 3 pe secunda
   * (aceleasi de care are nevoie o miscare de stoc dupa o vanzare), arde o incercare
   * din coada, se intoarce cu o eroare de documentatie pe care comerciantul o vede
   * abia peste ore, iar pana atunci panoul arata „trimis".
   *
   * Toate patru dispar cand intrebarea se pune aici, unde raspunsul e instantaneu si
   * scris in romana. ⚠ Verificarea NU inlocuieste validarea LOR si nu o prezice: eMAG
   * poate respinge un produs impecabil din motive pe care nu ni le spune. E o plasa,
   * si de aceea ce trece de ea pleaca mai departe ca pana acum.
   */
  const lipsuri = ceLipseste(
    produsDeVerificat(produs),
    {
      category_id: categorie.category_id,
      eanObligatoriu: categorie.ean_obligatoriu === true,
      garantieObligatorie: categorie.garantie_obligatorie === true,
      obligatorii: [],
      completate: categorie.characteristics ?? [],
      areTipFamilie: categorie.family_type_id != null,
    },
    {
      vat_id: ctx.config.vat_id ?? null,
      handling_time: ctx.config.handling_time ?? null,
      warranty_default: ctx.config.warranty_default ?? null,
      areGpsr: !!ctx.config.gpsr?.manufacturer?.length,
    },
    areVariante(produs),
  );

  const blocante = lipsuri.filter((l) => l.gravitate === "blocheaza");
  if (blocante.length > 0) {
    /*
     * ⚠ „refuz", nu „trecatoare": lipsa unui camp nu se repara singura, iar reincercata
     * la nesfarsit ar manca ritmul magazinului pentru nimic. Arde o incercare, si
     * mesajul spune EXACT ce e de facut.
     */
    const m = blocante.map((l) => l.eticheta).join(" ");
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  const identitati = await asiguraIdentitatile(admin, ctx, produs, randuri, categorie.family_type_id ?? null);
  if ("error" in identitati) {
    return { verdict: "refuz", mesaj: identitati.error };
  }

  /*
   * ⚠ SE INTREABA INAINTE DE A CREA, nu dupa. Vezi `cautaInCatalogulLor`: eMAG are
   * catalog COMUN, iar acelasi obiect trimis ca produs nou intra a doua oara acolo —
   * pe o pagina fara recenzii si fara vizitatori, dupa zile de validare manuala.
   *
   * Se cheama DUPA `asiguraIdentitatile` fiindca are nevoie de randurile scrise: cheia
   * gasita se scrie pe ele, iar citirea de dedesubt o ia de acolo.
   */
  await cautaInCatalogulLor(admin, ctx, await citesteRandurile(admin, ctx.businessId, produs.id));
  const cuCheie = await citesteRandurile(admin, ctx.businessId, produs.id);

  /*
   * ═══ ⚠ CARACTERISTICILE SE IAU DIN FISA PRODUSULUI, NU DOAR DIN CATEGORIE (§19) ═══
   *
   * Pana acum se puteau fixa doar PE CATEGORIE: o singura valoare pentru toate
   * produsele din ea. Ceea ce e absurd tocmai la caracteristicile care conteaza — nu
   * toate tricourile sunt „M", si tocmai `Marime` e obligatorie.
   *
   * ⚠ Cea fixata pe categorie NU se pierde: umple golurile, pentru produsele care n-au
   * specificatia lor. Sterse, un magazin care si-a fixat „Material: Bumbac" pe toata
   * categoria s-ar fi trezit ca nu mai pleaca nimic.
   *
   * ⚠ Nepotrivirile se SCRIU, nu se inghit. O valoare in afara listei lor face oferta
   * INTREAGA sa fie respinsa, iar mesajul lor vorbeste despre caracteristica, nu
   * despre valoare — comerciantul n-ar fi avut de unde sti ce sa schimbe.
   */
  const potrivite = potrivesteCaracteristici(
    specificatiile(produs),
    categorie.characteristics_categorie ?? [],
    categorie.characteristics ?? [],
  );

  /*
   * ═══ ⚠ PLASA S-A MUTAT DE PE CATEGORIE PE PRODUS (§19) ═══
   *
   * Inainte, maparea categoriei era refuzata pana cand comerciantul fixa o valoare
   * pentru fiecare caracteristica obligatorie. Acum ele pot veni din fisa fiecarui
   * produs — deci verificarea trebuie sa fie tot pe produs.
   *
   * Fara mutarea asta, §19 ar fi deschis o gaura: maparea trece, produsul fara
   * specificatia lui pleaca la eMAG, arde o cerere din cele 3 pe secunda, arde o
   * incercare din coada, si se intoarce cu un mesaj despre o caracteristica pe care
   * comerciantul o vede abia peste ore.
   *
   * Aici raspunsul e instantaneu si spune NUMELE caracteristicii, in romana.
   */
  const obligatoriiLipsa = caracteristiciLipsa(
    { id: categorie.category_id, characteristics: categorie.characteristics_categorie ?? [] },
    potrivite.caracteristici,
  );
  if (obligatoriiLipsa.length > 0) {
    const nume = obligatoriiLipsa.map((x) => (x.name ?? "").trim() || `#${x.id}`).join(", ");
    const m = `Produsul n-are ce cere eMAG in categoria asta: ${nume}. `
      + "Adauga-le in specificatiile produsului, sau fixeaza-le pe categorie.";
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  /* ⚠ Se scriu si cand sunt ZERO, ca sa se STEARGA cele reparate. Scrise doar cand
     exista, o nepotrivire rezolvata ar fi ramas in panou pentru totdeauna, iar omul
     ar fi cautat la nesfarsit o problema care nu mai era. */
  await scrieNepotrivirile(admin, ctx.businessId, produs.id, potrivite.nepotriviri);

  const { oferte, probleme, observatii } = construiesteOferte(
    produs,
    magazinDin(ctx, produs),
    {
      category_id: categorie.category_id,
      characteristics: potrivite.caracteristici,
      family_type_id: categorie.family_type_id,
    },
    /* Identitatile REFACUTE, ca sa poarte `part_number_key` daca s-a gasit unul. */
    cuCheie.map((r) => ({
      variant_title: r.variant_title,
      emag_id: r.emag_id,
      part_number_key: r.part_number_key,
      ean: r.ean,
    })),
    identitati.familyId,
    /* ⚠ Numai apasarea explicita a comerciantului pe UN produs forteaza descarcarea
       imaginilor. Vezi nota din `mapping.ts`: eMAG are o limita stransa pe
       `force_download`, si se atinge de la prima cerere. Coada nu forteaza niciodata. */
    fortat,
  );

  if (oferte.length === 0) {
    /*
     * ⚠ MOTIVUL SE IA DIN `probleme`, NU DIN OBSERVATII (indreptat 24.08.2026)
     *
     * Amandoua erau in aceeasi lista, iar aici se lua PRIMA. Nota despre codul de bare se
     * impinge devreme, deci ea devenea „motivul": patru elemente de coada isi ardeau
     * incercarile raportand „Codul de bare 5.94903E+12 nu e valid", cand cauza adevarata
     * era alta, mai jos in lista.
     *
     * ⚠ Iar codul acela nici nu se poate repara — Excel il rescrisese, si pastreaza 6
     * cifre din 13. Deci omul era trimis la o reparatie imposibila pentru ceva ce nici
     * nu-l bloca.
     */
    const m = probleme[0] ?? "Nu s-a putut construi nicio ofertă pentru produs.";
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  const r = await trimiteInLoturi(admin, ctx, produs.id, oferte, (lot) =>
    salveazaProduseOferte(ctx.auth, lot as EmagProdusOferta[]),
  );

  /*
   * ⚠ OBSERVATIILE NU SE PIERD la o trimitere reusita.
   *
   * „Oferta pleaca fara cod de bare" e adevarat si merita stiut: in categoriile unde EAN-ul
   * e obligatoriu, eMAG o lasa ciorna, iar omul ar cauta motivul in panoul lor. Se lipesc
   * de mesaj, nu se ridica la verdict: produsul CHIAR a plecat.
   */
  if (observatii.length > 0 && (r.verdict === "reusit" || r.verdict === "reusit_cu_observatii")) {
    return { ...r, verdict: "reusit_cu_observatii", mesaj: [r.mesaj, ...observatii].filter(Boolean).join(" · ") };
  }
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RUTA USOARA: PRET, TVA, TIMP DE PREGATIRE, STARE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Produsul, in forma pe care o cere verificarea.
 *
 * ⚠ `page_sections` e `jsonb` cu forma libera: marca, codul de bare si dimensiunile
 * stau in colturi diferite. Se scot AICI, o data, ca `pregatire.ts` sa ramana pur si
 * sa poata fi chemat si din ecran.
 */
function produsDeVerificat(p: ProdusDeCartografiat): ProdusDeVerificat {
  const ps = (p.page_sections ?? {}) as {
    google?: { gtin?: string; brand?: string };
    dimensions?: { length?: number; width?: number; height?: number };
  };
  return {
    name: p.name,
    price: p.price,
    sku: p.sku,
    category: p.category,
    images: p.images,
    weight_grams: p.weight_grams,
    description: p.description,
    gtin: ps.google?.gtin ?? null,
    brand: ps.google?.brand ?? null,
    dimensiuni: ps.dimensions ?? null,
  };
}

/** Are produsul combinatii active? Din ele se naste nevoia de grup de variante. */
function areVariante(p: ProdusDeCartografiat): boolean {
  const ps = (p.page_sections ?? {}) as {
    variants?: { enabled?: boolean; combinations?: { enabled?: boolean }[] };
  };
  return !!ps.variants?.enabled && (ps.variants.combinations ?? []).some((c) => c?.enabled);
}

/**
 * `POST /offer/save` — NU atinge documentatia.
 *
 * ⚠ ASTA E RUTA PE CARE TREBUIE SA MEARGA O SCHIMBARE DE PRET. Trimisa pe cea grea,
 * ar rescrie la eMAG tot ce a atins vreodata comerciantul in panoul lor — chiar
 * defectul de la Trendyol, unde 1051 de produse au raportat succes cu preturile
 * neschimbate.
 */
async function duOferta(
  admin: Admin, ctx: ContextEmag, produs: ProdusDeCartografiat, randuri: RandOfertaLocal[],
): Promise<RezultatTrimitere> {
  const usoare = oferteUsoare(produs, magazinDin(ctx, produs), identitatiUsoare(randuri));

  /*
   * ═══ ⚠ ZERO OFERTE NU E O REUSITA ═══
   *
   * Fara paza asta, un produs care si-a pierdut randurile din `emag_offers` — sters
   * si recreat, sau adus dintr-un import cazut la jumatate — ar fi iesit din coada
   * raportand succes, cu zero cereri plecate. Raspuns de succes, zero efect, si
   * nimeni nu afla: chiar forma incidentului VetDepo.
   */
  if (usoare.length === 0) {
    const m = "Produsul nu are nicio ofertă eMAG de actualizat. Publică-l întâi.";
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  return trimiteInLoturi(admin, ctx, produs.id, usoare, (lot) =>
    salveazaOferte(ctx.auth, lot as EmagOferta[]),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RUTA CEA MAI USOARA: NUMAI STOCUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `PATCH /offer_stock/{id}` — o cerere pe oferta.
 *
 * ⚠ NU ATINGE NICI PRETUL, NICI DOCUMENTATIA. La o oferta pe care comerciantul a
 * modificat-o in panoul lor, orice ruta mai grea i-ar fi sters modificarile la
 * FIECARE vanzare — adica de zeci de ori pe zi, fara ca nimic sa dea eroare.
 */
async function duStocul(
  admin: Admin, ctx: ContextEmag, produs: ProdusDeCartografiat, randuri: RandOfertaLocal[],
): Promise<RezultatTrimitere> {
  const stocuri = stocuriDeTrimis(produs, identitatiUsoare(randuri), ctx.config.stoc_rezervat);

  /* ⚠ Aceeasi paza ca la pret, si aici e si mai scumpa: o miscare de stoc care
     raporteaza succes fara sa plece nicaieri inseamna ca eMAG continua sa vanda
     marfa pe care magazinul n-o mai are. */
  if (stocuri.length === 0) {
    const m = "Produsul nu are nicio ofertă eMAG al cărei stoc să fie actualizat.";
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  const depozit = ctx.config.warehouse_id ?? 1;
  let ultimulMesaj = "";
  let celMaiRau: VerdictEmag = "reusit";

  for (const st of stocuri) {
    const r = await actualizeazaStoc(ctx.auth, st.emagId, [{ warehouse_id: depozit, value: st.cantitate }]);
    if (isEmagError(r)) {
      celMaiRau = maiRau(celMaiRau, r.verdict ?? "refuz");
      ultimulMesaj = mesajOmenesc(r.error);
      /* ⚠ La `chei` se opreste tot: acreditarile nu se repara intre doua oferte. */
      if (celMaiRau === "chei") break;
      continue;
    }
    celMaiRau = maiRau(celMaiRau, r.verdict ?? "reusit");
  }

  await scrieRezultatul(admin, ctx.businessId, produs.id, celMaiRau, ultimulMesaj);
  return { verdict: celMaiRau, mesaj: ultimulMesaj };
}

/**
 * Randurile noastre, reduse la ce trebuie rutelor usoare.
 *
 * ⚠ SE IAU NUMAI CELE CARE EXISTA DEJA LA EI. Un rand fara `last_synced_at` n-a
 * ajuns niciodata la eMAG, iar trimis pe `offer/save` ar primi un refuz despre un id
 * inexistent — si ar arde incercarile unui produs care de fapt trebuie PUBLICAT.
 */
function identitatiUsoare(randuri: RandOfertaLocal[]): IdentitateUsoara[] {
  return randuri
    .filter((r) => r.last_synced_at != null)
    .map((r) => ({ variant_title: r.variant_title, emag_id: r.emag_id }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   MASURATORI SI RETRAGERE
   ═══════════════════════════════════════════════════════════════════════════ */

async function duMasuratorile(
  ctx: ContextEmag, produs: ProdusDeCartografiat, randuri: RandOfertaLocal[],
): Promise<RezultatTrimitere> {
  const ps = (produs.page_sections ?? {}) as { dimensions?: { length?: number; width?: number; height?: number } };
  const masuratori = randuri
    .map((r) => masuratoriEmag(r.emag_id, ps.dimensions, produs.weight_grams))
    .filter((m): m is NonNullable<typeof m> => m != null);

  if (masuratori.length === 0) {
    /* ⚠ „Sarit", nu „refuz". Un produs fara dimensiuni nu e o eroare — e un produs
       caruia nimeni nu i le-a pus. Reincercat, ar arde incercarile degeaba. */
    return { verdict: "sarit", mesaj: "Produsul nu are dimensiuni și greutate complete." };
  }

  const r = await salveazaMasuratori(ctx.auth, masuratori);
  if (isEmagError(r)) return { verdict: r.verdict ?? "refuz", mesaj: mesajOmenesc(r.error) };
  return { verdict: r.verdict ?? "reusit", mesaj: "" };
}

/**
 * Oprirea de la vanzare.
 *
 * ⚠ eMAG NU ARE STERGERE DE OFERTA. Se trimite `status: 0` pe `offer/save`, si atat.
 * Cine cauta un `DELETE` in documentatia lor nu-l gaseste si e tentat sa lase
 * produsul acolo — iar magazinul continua sa vanda pe eMAG ceva ce nu mai are.
 */
/**
 * Retrage ofertele unui produs care NU MAI EXISTA in magazin.
 *
 * ═══ ⚠ DE CE NU MERGE PE CALEA OBISNUITA (audit 24.08.2026) ═══
 *
 * La stergerea unui produs, `emag_offers.product_id` devine `null` — asa cere cheia
 * straina (`on delete set null`). Deci calea obisnuita, care cauta ofertele DUPA produs,
 * nu mai gaseste nimic: legatura s-a rupt exact in clipa in care aveam nevoie de ea.
 *
 * Iar coada mergea si mai prost: elementul intra cu `product_id: null`, iar cronul il
 * STERGEA inainte sa apuce sa trimita ceva (`route.ts:211`). Fara log, fara „dus", fara
 * „cazut". Toata logica scrisa anume pentru cazul asta — `rutaDeTrimitere` cu
 * `op: "retragere"` — era cod mort pe calea automata.
 *
 * ⚠ CE COSTA: comerciantul sterge produsul din magazin si continua sa primeasca comenzi
 * eMAG pentru marfa pe care n-o mai are. Anularile le plateste el, in bani si in punctaj
 * la ei. E chiar scenariul scris ca fiind de evitat in nota de la `existaLaEmag`.
 *
 * Aici se merge direct pe `emag_id`, care e al NOSTRU si nu se pierde la stergere.
 */
export async function retragePeEmagId(
  admin: Admin, ctx: ContextEmag, emagId: number,
): Promise<RezultatTrimitere> {
  const { data } = await admin.from("emag_offers")
    .select("emag_id, last_synced_at, creat_de_edinio")
    .eq("business_id", ctx.businessId).eq("emag_id", emagId).maybeSingle();

  const rand = data as { emag_id: number; last_synced_at: string | null; creat_de_edinio: boolean } | null;
  if (!rand) return { verdict: "sarit", mesaj: "Oferta nu mai există la noi." };

  /* ⚠ Aceeasi regula ca la `existaLaEmag`: o oferta PRELUATA exista la ei chiar daca
     n-am trimis-o noi niciodata, deci si ea trebuie oprita. */
  if (rand.last_synced_at == null && rand.creat_de_edinio !== false) {
    return { verdict: "sarit", mesaj: "Oferta nu a ajuns niciodată pe eMAG." };
  }

  const r = await salveazaOferte(ctx.auth, [{ id: rand.emag_id, status: 0 as const }]);
  if (isEmagError(r)) return { verdict: r.verdict ?? "refuz", mesaj: mesajOmenesc(r.error) };

  await admin.from("emag_offers")
    .update({ status: "withdrawn" satisfies StareOferta, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);

  return { verdict: "reusit", mesaj: "Oferta a fost oprită de la vânzare pe eMAG." };
}

async function retrage(
  admin: Admin, ctx: ContextEmag, randuri: RandOfertaLocal[],
): Promise<RezultatTrimitere> {
  const vii = randuri.filter((r) => r.last_synced_at != null);
  if (vii.length === 0) return { verdict: "sarit", mesaj: "Oferta nu a ajuns niciodată pe eMAG." };

  const r = await salveazaOferte(ctx.auth, vii.map((x) => ({ id: x.emag_id, status: 0 as const })));
  if (isEmagError(r)) return { verdict: r.verdict ?? "refuz", mesaj: mesajOmenesc(r.error) };

  /*
   * ⚠ `bucatiDeIduri`, desi „sunt doar variantele unui produs".
   *
   * Id-urile sunt UUID-uri, iar `.in()` NU pleaca in corpul cererii, ci in ADRESA:
   * fiecare adauga 37 de semne, iar marginea respinge cererea peste ~650. Masurat pe
   * proiectul real, in `supabase/id-chunks.ts`.
   *
   * Un produs cu 700 de combinatii active pare de nefacut — pana la un magazin de
   * piese auto cu o singura pozitie „surub" si toate dimensiunile drept variante.
   * Iar cand pica, pica taman la retragere: produsul ramane de vanzare pe eMAG desi
   * a fost scos din magazin, si raspunsul e un 400 in text simplu care nu pomeneste
   * nimic despre id-uri.
   *
   * Costa doua randuri. Lipsa lui costa un produs care se vinde si nu exista.
   */
  const acum = new Date().toISOString();
  for (const bucata of bucatiDeIduri(vii.map((x) => x.id))) {
    /* ⚠ SI `business_id`, desi id-urile vin dintr-o citire deja legata de magazin.
       E o scriere pe o LISTA de id-uri: daca lista ar veni vreodata dintr-o citire
       nelegata, ar atinge randurile altui comerciant fara sa dea vreo eroare. Costa
       o conditie; lipsa ei costa incredere care nu se mai castiga inapoi. */
    await admin.from("emag_offers")
      .update({ status: "withdrawn" satisfies StareOferta, last_synced_at: acum })
      .eq("business_id", ctx.businessId)
      .in("id", bucata);
  }
  return { verdict: r.verdict ?? "reusit", mesaj: "" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IDENTITATILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Randurile `emag_offers` ale produsului, facute daca lipsesc.
 *
 * ⚠ SE SCRIU INAINTE DE TRIMITERE, SI ASTA E TOT ROSTUL FUNCTIEI. `emag_id` e cheia
 * dupa care eMAG recunoaste oferta. Alocata la trimitere si nesalvata, urmatoarea
 * trimitere ar cere alta, iar la ei ar aparea inca un produs — cu vechiul ramas
 * orfan, nevandabil si nestergibil.
 *
 * `family_id` se cere o data pe PRODUS, nu pe rand: toate combinatiile trebuie sa
 * cada in aceeasi familie, altfel eMAG le arata ca produse fara legatura.
 */
async function asiguraIdentitatile(
  admin: Admin,
  ctx: ContextEmag,
  produs: ProdusDeCartografiat,
  randuri: RandOfertaLocal[],
  familyTypeId: number | null,
): Promise<{ identitati: { variant_title: string | null; emag_id: number; part_number_key?: string | null; ean?: string | null }[]; familyId: number | null } | { error: string }> {
  const titluri = titluriDeTrimis(produs);
  const dupaTitlu = new Map(randuri.map((r) => [r.variant_title ?? "", r]));
  const lipsa = titluri.filter((t) => !dupaTitlu.has(t ?? ""));

  /*
   * Familia se cere numai cand chiar sunt variante SI categoria are un tip de
   * familie. ⚠ Fara `family_type_id`, eMAG refuza `family.id`, iar trimis oricum
   * intoarce un refuz despre un camp pe care comerciantul nu-l vede nicaieri.
   */
  let familyId = randuri.find((r) => r.family_id)?.family_id ?? null;
  const vreaFamilie = titluri.length > 1 && familyTypeId != null;
  if (vreaFamilie && !familyId) {
    const { data, error } = await admin.rpc("emag_familie_noua");
    if (error) return { error: `Nu s-a putut aloca familia de variante: ${error.message}` };
    familyId = Number(data);
  }

  if (lipsa.length > 0) {
    const noi = lipsa.map((t) => ({
      business_id: ctx.businessId,
      product_id: produs.id,
      variant_title: t,
      family_id: familyId,
      family_type_id: familyTypeId,
      status: "queued" satisfies StareOferta,
      creat_de_edinio: true,
    }));
    const { error } = await admin.from("emag_offers").insert(noi);
    if (error) return { error: `Nu s-au putut pregăti ofertele: ${error.message}` };
  }

  if (familyId && randuri.some((r) => r.family_id !== familyId)) {
    await admin.from("emag_offers").update({ family_id: familyId, family_type_id: familyTypeId })
      .eq("business_id", ctx.businessId).eq("product_id", produs.id);
  }

  const proaspete = await citesteRandurile(admin, ctx.businessId, produs.id);
  return {
    identitati: proaspete.map((r) => ({
      variant_title: r.variant_title,
      emag_id: r.emag_id,
      part_number_key: r.part_number_key,
      ean: r.ean,
    })),
    familyId,
  };
}

/**
 * Ce titluri de combinatie pleaca la eMAG.
 *
 * Un produs simplu da `[null]`; unul cu variante da cate un titlu pentru fiecare
 * combinatie ACTIVA si UNICA — aceeasi regula ca `combinatiiActiveUnice()`, fiindca
 * in datele reale exista 31 de titluri duplicate pe 7 produse.
 */
function titluriDeTrimis(produs: ProdusDeCartografiat): (string | null)[] {
  const ps = (produs.page_sections ?? {}) as {
    variants?: { enabled?: boolean; combinations?: { title?: string; enabled?: boolean }[] };
  };
  const v = ps.variants;
  if (!v?.enabled || !Array.isArray(v.combinations)) return [null];
  const vazute = new Set<string>();
  const out: string[] = [];
  for (const c of v.combinations) {
    const t = (c?.title ?? "").trim();
    if (!c?.enabled || !t || vazute.has(t)) continue;
    vazute.add(t);
    out.push(t);
  }
  return out.length ? out : [null];
}

/* ═══════════════════════════════════════════════════════════════════════════
   „EXISTA DEJA PE eMAG?" — INTREBAT INAINTE DE A CREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cauta produsul in catalogul lor dupa codul de bare si scrie `part_number_key`.
 *
 * ═══ ⚠ DE CE E UN PAS SEPARAT, INAINTEA TRIMITERII ═══
 *
 * eMAG are un catalog COMUN: un obiect e o singura pagina, pe care mai multi
 * vanzatori isi pun ofertele. Trimis ca produs NOU, acelasi obiect intra a doua oara
 * in catalogul lor.
 *
 * Ce urmeaza nu e o eroare, ci ceva mai rau: documentatia noua intra in validare
 * manuala si sta zile, in loc ca oferta sa fie vandabila in minute pe pagina care
 * exista; iar oferta ajunge pe o pagina fara recenzii si fara vizitatori, in loc de
 * cea pe care o cauta oamenii. Comerciantul vede „publicat" si nu vinde nimic.
 *
 * ⚠ SE INTREABA O SINGURA DATA PE OFERTA. Odata scris, `part_number_key` ramane, iar
 * la trimiterile urmatoare pasul asta se sare — altfel fiecare actualizare de pret ar
 * fi ars inca o cerere din cele 3 pe secunda ale magazinului.
 *
 * ⚠ Nereusita NU opreste publicarea. Daca eMAG nu raspunde la cautare, se trimite mai
 * departe forma cu documentatie: mai bine un produs publicat pe o pagina noua decat
 * unul nepublicat. Se scrie in jurnal, si se reia data viitoare.
 */
async function cautaInCatalogulLor(
  admin: Admin,
  ctx: ContextEmag,
  randuri: RandOfertaLocal[],
): Promise<void> {
  /* Se intreaba numai pentru ofertele care n-au inca o pagina si care chiar au cod. */
  const deCautat = randuri.filter((r) => !r.part_number_key && (r.ean ?? "").trim());
  if (deCautat.length === 0) return;

  for (const rand of deCautat) {
    const eanuri = eanuriDeCautat([rand.ean]);
    if (eanuri.length === 0) continue;

    const r = await cautaDupaEan(ctx.auth, eanuri);
    if (isEmagError(r)) {
      void logError({
        action: "emag.ean",
        message: `cautarea dupa cod de bare a esuat: ${r.error}`,
        details: { emag_id: rand.emag_id, ean: rand.ean },
        businessId: ctx.businessId,
        severity: "warning",
      });
      return;
    }

    const v = verdictEan((Array.isArray(r.data) ? r.data : []) as RaspunsEan[]);

    if (v.fel === "atasare") {
      /*
       * ⚠ Se scrie `part_number_key`, si ATAT. `mapping.ts` il trimite mai departe,
       * iar prezenta lui schimba forma cererii din „creeaza produs" in „ataseaza-te
       * la produsul care exista". Nu se atinge nimic altceva din rand.
       */
      await admin.from("emag_offers")
        .update({ part_number_key: v.part_number_key, updated_at: new Date().toISOString() })
        .eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      continue;
    }

    if (v.fel === "avem_deja") {
      /* Avem deja oferta pe pagina aceea, dar sub alt `emag_id` — de obicei publicata
         din panoul lor, inainte de Edinio. Se scrie cheia ca sa se vada legatura;
         importul o va potrivi la urmatoarea trecere. */
      await admin.from("emag_offers")
        .update({ part_number_key: v.part_number_key, updated_at: new Date().toISOString() })
        .eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      continue;
    }

    if (v.fel === "inchis") {
      /*
       * ⚠ Produsul exista, dar eMAG nu ingaduie oferte noi pe el. NU se creeaza unul
       * nou in schimb: ar fi exact duplicatul de care fugim, si l-ar respinge oricum.
       * Se scrie motivul, si il vede comerciantul in lista.
       */
      await admin.from("emag_offers").update({
        error: `Produsul „${v.nume}" există pe eMAG, dar nu mai acceptă oferte noi (${v.part_number_key}).`,
        updated_at: new Date().toISOString(),
      }).eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      continue;
    }

    if (v.fel === "nehotarat") {
      await admin.from("emag_offers").update({
        error: `Codul de bare duce la ${v.candidati} produse diferite pe eMAG. Verifică-l înainte de publicare.`,
        updated_at: new Date().toISOString(),
      }).eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      continue;
    }

    /* `produs_nou`: nu exista la ei. Se trimite cu documentatie, ca pana acum. */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOTURILE SI SCRISUL INAPOI
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ Maximul lor. Vezi `LOT_MAXIM` si nota din `errors.ts` despre „Maximum input vars". */
const LOT = 50;

/**
 * Trimite in loturi si strange verdictul cel mai rau.
 *
 * ⚠ VERDICTUL LOTULUI E CEL MAI RAU DIN EL, nu ultimul si nu primul. Raspunsul lor
 * la `product_offer/save` e generic, fara rezultate pe element (verificat in spec):
 * nu exista niciun mod de a afla CARE dintre cele 50 au trecut. Luat ultimul, un lot
 * cu o singura cadere la inceput ar fi iesit din coada raportand succes.
 */
async function trimiteInLoturi(
  admin: Admin,
  ctx: ContextEmag,
  productId: string,
  elemente: unknown[],
  trimite: (lot: unknown[]) => Promise<
    | { error: string; status: number; verdict?: VerdictEmag; mesaje?: string[] }
    | { data: unknown; verdict?: VerdictEmag; mesaje?: string[] }
  >,
): Promise<RezultatTrimitere> {
  let celMaiRau: VerdictEmag = "reusit";
  let mesaj = "";
  /*
   * ═══ ⚠ OBSERVATIILE LOR SE STRANG, NU SE ARUNCA ═══
   *
   * `reusit_cu_observatii` exista tocmai fiindca eMAG salveaza oferta SI are ceva de
   * spus despre ea. Pana pe 24.08.2026 partea a doua se pierdea: `scrieRezultatul`
   * punea `error: null` la orice verdict incheiat, si nimic altundeva nu tinea minte
   * mesajele.
   *
   * Masurat in ziua aceea: 180 de randuri scrise „trimis", cu zero mesaje pastrate —
   * desi eMAG raspunsese la fiecare fie „ai deja produsul asta", fie „e ciorna, ii
   * lipseste EAN-ul". Comerciantul avea in fata un ecran care spunea ca totul a mers.
   *
   * Exact greseala §12.9 pe care ne-am ferit s-o facem la Trendyol — motivul
   * respingerii neafisat — facuta la celalalt capat: motivul PRIMIT si aruncat.
   */
  const observatii: string[] = [];

  for (let i = 0; i < elemente.length; i += LOT) {
    const r = await trimite(elemente.slice(i, i + LOT));
    /*
     * ⚠ SE STRANG SI DE LA UN „REUSIT" CURAT (24.08.2026, a doua oara in aceeasi zi).
     *
     * Prima forma lua mesajele numai de la `reusit_cu_observatii`. Dar eMAG intoarce
     * avertismente si pe raspunsuri fara `isError` — iar cel mai important dintre ele
     * e chiar asta:
     *
     *     „WARNING: The product was saved as a draft, and you need the following
     *      product fields to continue documenting and have the product ready for
     *      sale: EAN."
     *
     * Adica: produsul TAU nu se vinde. Verdictul e `reusit`, si pe drept — salvarea a
     * reusit. Dar aruncand mesajul, ecranul arata o oferta trimisa cu bine, iar
     * comerciantul afla ca e ciorna abia din panoul lor.
     *
     * S-a vazut in aceeasi zi, uitandu-ma la retrimiterea celor 40: 39 au iesit curate,
     * una a ramas ciorna, si NIMIC in ecran n-o deosebea de celelalte.
     *
     * ⚠ Nu se mai filtreaza dupa verdict, ci dupa daca EI au avut ceva de spus.
     */
    if (verdictIncheiat(r.verdict)) observatii.push(...(r.mesaje ?? []));
    if ("error" in r) {
      celMaiRau = maiRau(celMaiRau, r.verdict ?? "refuz");
      mesaj = mesajOmenesc(r.error);
      /* ⚠ La `chei` se opreste tot: acreditarile nu se repara singure intre loturi,
         iar mai departe n-am face decat sa ardem cererile magazinului degeaba. */
      if (celMaiRau === "chei") break;
      continue;
    }
    celMaiRau = maiRau(celMaiRau, r.verdict ?? "reusit");
  }

  await scrieRezultatul(admin, ctx.businessId, productId, celMaiRau, mesaj, observatii);
  return { verdict: celMaiRau, mesaj };
}

/**
 * Care verdict e mai rau.
 *
 * ⚠ `chei` bate tot: e o problema de CONT, si nicio reusita pe alt lot n-o sterge.
 * Apoi `refuz`, apoi `trecatoare`. `reusit_cu_observatii` bate `reusit` fiindca are
 * ceva de aratat omului, chiar daca amandoua inseamna „s-a salvat".
 */
const GREUTATE: Record<VerdictEmag, number> = {
  reusit: 0, reusit_cu_observatii: 1, trecatoare: 2, refuz: 3, chei: 4,
};

/**
 * Lotul s-a incheiat, deci ce au spus ei despre el merita pastrat.
 *
 * ⚠ `undefined` inseamna „clientul n-a pus verdict", iar implicitul acolo e `reusit`.
 * Tratat ca neincheiat, avertismentele s-ar fi pierdut tocmai pe calea cea mai
 * obisnuita.
 */
function verdictIncheiat(v: VerdictEmag | undefined): boolean {
  return v === undefined || v === "reusit" || v === "reusit_cu_observatii";
}

function maiRau(a: VerdictEmag, b: VerdictEmag): VerdictEmag {
  return GREUTATE[b] > GREUTATE[a] ? b : a;
}

/** Starea in care ramane oferta dupa un verdict. */
function stareaDupa(v: VerdictEmag): StareOferta {
  if (v === "reusit") return "sent";
  if (v === "reusit_cu_observatii") return "sent";
  return "error";
}

async function scrieRezultatul(
  admin: Admin, businessId: string, productId: string, verdict: VerdictEmag, mesaj: string,
  observatii: string[] = [],
): Promise<void> {
  const acum = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: stareaDupa(verdict),
    error: sAIncheiat(verdict) ? null : (mesaj || null),
    updated_at: acum,
  };
  /*
   * ═══ ⚠ OBSERVATIILE MERG IN `doc_errors`, NU IN `error` ═══
   *
   * Trei campuri, trei intelesuri, si amestecate ar minti fiecare in alt fel:
   *
   *   `error`       trimiterea s-a OPRIT. Pus aici, o oferta salvata ar fi aratat
   *                 rosu si comerciantul ar fi retrimis-o degeaba.
   *   `issues`      ce am observat NOI in fisa lui (`scrieNepotrivirile`). Scris
   *                 peste, s-ar fi sters ce s-a masurat inainte de trimitere.
   *   `doc_errors`  ce spune EI despre oferta. Chiar campul pe care ecranul il arata
   *                 intreg, cuvant cu cuvant, si singurul loc din care afla omul ce
   *                 are de reparat.
   *
   * ⚠ Se scrie si cand lista e goala, la orice reusita: altfel observatiile unei
   * trimiteri vechi ar fi ramas pe ecran dupa ce omul le-a reparat, si n-ar fi avut
   * cum sa afle ca le-a reparat.
   */
  if (sAIncheiat(verdict)) patch.doc_errors = observatii;
  /*
   * ⚠ `last_synced_at` SE SCRIE NUMAI LA REUSITA, si el e chiar semnalul „exista la
   * eMAG". Scris si la refuz, urmatoarea trimitere ar fi crezut ca oferta e deja
   * acolo si ar fi plecat pe ruta usoara — care nu creeaza nimic. Produsul ar fi
   * ramas nepublicat pe veci, cu un mesaj despre un id inexistent.
   */
  if (sAIncheiat(verdict)) patch.last_synced_at = acum;

  const { error } = await admin.from("emag_offers")
    .update(patch as never).eq("business_id", businessId).eq("product_id", productId);
  if (error) {
    void logError({
      action: "emag.trimite.scrie",
      message: error.message,
      details: { businessId, productId, verdict },
      severity: "error",
    });
  }
}

/**
 * Ce n-a intrat din fisa produsului in caracteristicile lor (§19).
 *
 * ⚠ Se scriu in `issues`, NU in `error`. Sunt doua lucruri diferite: `error` opreste
 * trimiterea, `issues` doar spune ce s-ar putea completa mai bine. Amestecate, un
 * produs perfect trimis ar fi aratat „eroare" pentru o specificatie in plus pe care
 * eMAG nici n-o cere.
 *
 * ⚠ Se spune SI ce accepta ei. „Culoare: Turcoaz nu e o valoare acceptata" fara lista
 * il lasa pe om sa ghiceasca; cu lista, repara din prima.
 */
async function scrieNepotrivirile(
  admin: Admin, businessId: string, productId: string, nepotriviri: Nepotrivire[],
): Promise<void> {
  const texte = nepotriviri.map((n) =>
    n.motiv === "valoare_neingaduita"
      ? `„${n.eticheta}: ${n.valoare}” nu e o valoare acceptată de eMAG${
        n.ingaduite?.length ? `. Ei acceptă: ${n.ingaduite.join(", ")}` : ""}`
      : `„${n.eticheta}” nu are corespondent în categoria eMAG aleasă.`);

  await admin.from("emag_offers")
    .update({ issues: texte as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId).eq("product_id", productId);
}

async function scrieEroare(admin: Admin, businessId: string, productId: string, mesaj: string): Promise<void> {
  await admin.from("emag_offers")
    .update({ error: mesaj || null, updated_at: new Date().toISOString() })
    .eq("business_id", businessId).eq("product_id", productId);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXTUL MAGAZINULUI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce stie magazinul despre el insusi, in forma ceruta de cartografiere.
 *
 * ⚠ EXPORTAT DINADINS, ca reconcilierea sa masoare deriva fata de ce s-ar TRIMITE
 * cu adevarat, nu fata de un calcul paralel. O a doua socoteala a pretului, scrisa
 * langa asta, ar fi ramas in urma la prima schimbare — si atunci „deriva" ar fi
 * masurat diferenta dintre doua functii de-ale noastre, nu dintre noi si eMAG.
 */
export function magazinDin(ctx: ContextEmag, produs: ProdusDeCartografiat) {
  const ps = (produs.page_sections ?? {}) as { google?: { brand?: string } };
  return {
    /* ⚠ Citite din setarile magazinului la incarcarea contextului, NU scrise aici.
       Vezi nota din `ContextEmag`: scrise in cod, un magazin cu alta cota si-ar fi
       publicat toate preturile gresite, tacut. */
    vat_rate: ctx.vatRate,
    prices_include_vat: ctx.pricesIncludeVat,
    vat_id: ctx.config.vat_id ?? 0,
    /* ⚠ Implicit `0`: intrarea in Genius se cere, nu se presupune. Implicitul LOR e 1,
       iar netrimis, fiecare produs publicat ar fi intrat acolo. Vezi `types.ts`. */
    emag_club: (ctx.config.emag_club === 1 ? 1 : 0) as 0 | 1,
    /*
     * ═══ ⚠ `null`, NU `1` ═══
     *
     * Prima forma punea `?? 1`. Iar `oferteUsoare` trimite MEREU `handling_time`
     * in incarcatura — deci fiecare schimbare de PRET a unui magazin care nu si-a ales
     * timpul de pregatire ii rescria valoarea de la eMAG cu „o zi".
     *
     * Un comerciant care expediaza in trei zile si-ar fi vazut oferta promitand una,
     * dupa o simpla modificare de pret. Fara nicio eroare: campul se accepta.
     *
     * `handling_time` e OPTIONAL la ei. Cand nu-l stim, nu-l trimitem — si atunci eMAG
     * pastreaza ce are. Publicarea cere oricum valoarea, prin `ceLipsestePentruPublicare`.
     */
    handling_time: ctx.config.handling_time ?? null,
    /* ⚠ La fel ca `handling_time`: `null` cand nu s-a declarat, si atunci nu pleaca
       deloc. Schema lor are `default: 14`; trimis din obisnuinta, ar fi rescris la
       fiecare republicare timpul de reaprovizionare pus de comerciant in panoul lor.
       ⚠ NU intra in `ceLipseste`: are un implicit la ei, deci nu opreste publicarea. */
    supply_lead_time: ctx.config.supply_lead_time ?? null,
    warehouse_id: ctx.config.warehouse_id ?? 1,
    warranty: ctx.config.warranty_default ?? 24,
    price_band_pct: ctx.config.price_band_pct ?? 30,
    /* ⚠ Taxa verde numai pe eMAG RO: documentatia lor spune „Available only for the
       eMAG RO platform". Trimisa pe bg sau hu, e un camp necunoscut. */
    green_tax: ctx.auth.tara === "ro" || ctx.auth.tara == null ? ctx.config.green_tax : null,
    stoc_rezervat: ctx.config.stoc_rezervat ?? null,
    source_language: limbaDupaTara(ctx),
    /* Marca produsului, nu a magazinului. eMAG o cere obligatoriu la unele categorii,
       iar `mapping.ts` cade pe ea cand produsul n-are alta. */
    brand: (ps.google?.brand ?? "").trim() || null,
    gpsr: ctx.config.gpsr,
  };
}

/**
 * Limba documentatiei, dupa tara contului.
 *
 * ⚠ eMAG cere `source_language` ca sa stie in ce limba e textul trimis. Pusa gresit,
 * traducerea lor automata porneste de la o presupunere falsa — iar
 * `translation_validation_status` poate bloca publicarea chiar cu restul aprobat.
 */
function limbaDupaTara(ctx: ContextEmag): string {
  const t = ctx.auth.tara;
  if (t === "bg") return "bg_BG";
  if (t === "hu") return "hu_HU";
  return "ro_RO";
}
