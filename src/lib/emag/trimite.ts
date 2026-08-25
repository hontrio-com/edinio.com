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
  cautaDupaEan, isEmagError, salveazaMasuratori, salveazaOferte,
  salveazaProduseOferte,
} from "./client";
import { ePreaMareLotul, mesajOmenesc, sAIncheiat, type VerdictEmag } from "./errors";
import {
  amprentaContinutului, construiesteOferte, eanDeTrimis, masuratoriEmag, oferteUsoare,
  stocuriDeTrimis, type IdentitateUsoara, type ProdusDeCartografiat,
} from "./mapping";
import { rutaDeTrimitere } from "./rute";
import { combinatiiActiveUnice, parseVariants } from "@/lib/storefront/variants";
import { EAN_PE_CERERE, eanuriDeCautat, imparteRaspunsurilePeRanduri, verdictEan, type RaspunsEan } from "./ean";
import { ceLipseste, type ProdusDeVerificat } from "./pregatire";
import { EroareCitireBaza, randCitit, randuriCitite } from "./citire";
import { ePrimitaDeEmag, imaginiPentruEmag } from "./imagini";
import type { ContextEmag } from "./sync";
import type { EmagOferta, EmagProdusOferta, StareOferta } from "./types";
import type { OpEmag } from "./queue";
import { enqueueEmagSyncMany } from "./queue";

type Admin = ReturnType<typeof createAdminClient>;

/** Un rand `emag_offers`, cat trebuie ca sa se poata trimite. */
interface RandOfertaLocal {
  id: string;
  emag_id: number;
  variant_title: string | null;
  /** Numele ofertei LA EI, scris de reconciliere. Vezi `schimbaSiNumele`. */
  nume_emag: string | null;
  /**
   * Starea ofertei LA EI: 1 activa, 0 oprita, 2 scoasa din vanzare („End of Life").
   *
   * ⚠ `null` inseamna „inca n-am citit", nu „n-are stare". Pe „nu stiu" nu se opreste
   * nimic: mai bine o cerere in plus decat o oferta pe care nu i-o mai atingem niciodata
   * fiindca n-am apucat s-o reconciliem.
   */
  status_la_ei: number | null;
  family_id: number | null;
  part_number_key: string | null;
  ean: string | null;
  auto_sync: boolean;
  last_synced_at: string | null;
  /**
   * `false` = oferta a fost PRELUATA din contul lor la import.
   *
   * ⚠ E singurul semn ca oferta EXISTA la eMAG fara ca noi s-o fi trimis vreodata.
   * `last_synced_at` nu spune asta: el inseamna „cand am trimis NOI”, si e gol pentru
   * tot ce s-a importat.
   */
  creat_de_edinio: boolean;
}

export interface RezultatTrimitere {
  verdict: VerdictEmag | "sarit";
  mesaj: string;
}

/**
 * Oferta asta exista la eMAG?
 *
 * ═══ ⚠ DOI MARTORI, SI SCRISI O SINGURA DATA ═══
 *
 *   `last_synced_at != null`    am trimis-o NOI. Cel mai limpede semn, dar nu singurul.
 *   `creat_de_edinio === false` a fost PRELUATA din contul lui, la import. Exista acolo
 *                               dinainte de noi, si importul nu scrie `last_synced_at` —
 *                               nici n-ar trebui, acela inseamna „cand am trimis NOI”.
 *
 * ⚠ REGULA ASTA A FOST SCRISA DE TREI ORI IN FISIER, SI UNA DIN COPII A RAMAS IN URMA.
 * `existaLaEmag` si `retragePeEmagId` aveau amandoi martori; `retrage()` avea numai
 * primul. Deci un produs cu oferte PRELUATE trecea de alegerea rutei si pica la
 * retragerea propriu-zisa: lista iesea goala, verdictul era `sarit`, elementul se stergea
 * din coada si se numara la „duse” — iar oferta ramanea la VANZARE pe eMAG.
 *
 * ⚠ Ajungea acolo chiar de pe butonul „Retrage de pe eMAG”: comerciantul apasa, ecranul
 * ii raspundea „Oferta nu a ajuns niciodată pe eMAG”, si produsul lui se vindea mai
 * departe acolo. Un raspuns increzator si gresit, adica cel mai rau fel.
 *
 * De aceea sta aici, exportata si probata: o regula scrisa in trei locuri se desparte.
 */
/**
 * eMAG a scos oferta din vanzare?
 *
 * ═══ ⚠ `status: 2` = „END OF LIFE", SI NU E O STARE DE-A NOASTRA ═══
 *
 * Masurat pe contul VetDepo: **3.095 din 4.678 de oferte** sunt `status_la_ei = 2` — doua
 * treimi din catalog, scoase din vanzare candva de comerciant sau de ei.
 *
 * eMAG REFUZA orice scriere de pret sau de stoc pe ele, si o spune limpede:
 *
 *   „ERROR: The offer status is 2 (end of life). If you want to sell this product,
 *    please update the status to 1 (active)."
 *
 * ⚠ CE FACEA PANA ACUM: le trimitea oricum, la fiecare miscare de stoc, la nesfarsit.
 * Fiecare incercare arde o cerere din cele 3 pe secunda ale magazinului — chiar cererile
 * prin care trebuie sa plece stocul ofertelor care CHIAR se vand.
 *
 * ⚠ SI CE NU FACE REPARATIA ASTA: nu trimite `status: 1` ca sa le repuna la vanzare.
 * Ar fi o hotarare a COMERCIANTULUI luata de un cron — exact greseala facuta cu plasa de
 * siguranta, care a inceput sa publice singura un catalog. Se opreste, si se spune de ce.
 */
export function eScoasaDeLaVanzare(rand: { status_la_ei: number | null }): boolean {
  return rand.status_la_ei === 2;
}

export function ofertaEsteLaEi(
  rand: { last_synced_at: string | null; creat_de_edinio: boolean },
): boolean {
  return rand.last_synced_at != null || rand.creat_de_edinio === false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ELEMENTUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un element din coada, dus pana la capat.
 *
 * ⚠ `fortat` vine de la apasarea comerciantului, NU din coada. Coada duce numai
 * lucru automat; butonul „Trimite acum” trece si peste ofertele preluate, fiindca
 * „nu trimite singur” nu inseamna „nu trimite niciodata”.
 */
export async function trimiteElement(
  admin: Admin,
  ctx: ContextEmag,
  productId: string,
  op: OpEmag,
  fortat = false,
): Promise<RezultatTrimitere> {
  /*
   * ═══ ⚠ O BAZA CARE N-A RASPUNS NU E UN PRODUS CARE NU EXISTA ═══
   *
   * Toate citirile de dedesubt arunca `EroareCitireBaza` la o cadere reala (vezi
   * `citire.ts`). Se prinde AICI, intr-un singur loc, si devine `trecatoare`:
   *
   *   `sarit`      elementul se STERGE din coada. Nimeni nu-l mai reia niciodata.
   *   `trecatoare` ramane, nu arde nicio incercare, se reia cu asteptare crescatoare.
   *
   * ⚠ Prins mai adanc, fiecare citire ar fi trebuit sa stie singura ce sa faca — si
   * prima uitata ar fi lasat gaura la loc, exact ca pana acum.
   *
   * ⚠ Se prinde NUMAI eroarea asta. Orice alta exceptie merge mai departe la apelant,
   * fiindca acolo e o defectiune de cod, iar inghitita ar deveni un „reincerc la
   * nesfarsit" tacut — chiar boala pe care o vindecam.
   */
  try {
    return await dusPanaLaCapat(admin, ctx, productId, op, fortat);
  } catch (e) {
    if (!(e instanceof EroareCitireBaza)) throw e;
    void logError({
      action: "emag.trimite",
      message: e.message,
      details: { productId, op, businessId: ctx.businessId },
      businessId: ctx.businessId,
      severity: "warning",
    });
    return {
      verdict: "trecatoare",
      mesaj: "Baza de date n-a răspuns la citirea produsului. Se reia singur.",
    };
  }
}

async function dusPanaLaCapat(
  admin: Admin,
  ctx: ContextEmag,
  productId: string,
  op: OpEmag,
  fortat: boolean,
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
   * n-ar trebui: acela inseamna „cand am trimis NOI”.
   *
   * Deci fiecare oferta preluata din contul comerciantului iesea cu
   * `existaLaEmag: false`, iar `rutaDeTrimitere` intorcea „nimic” la RETRAGERE. Adica:
   * stergi un produs importat din magazin, elementul intra in coada, iese „sarit”, se
   * sterge, se numara la „duse” — si oferta ramane la VANZARE pe eMAG.
   *
   * Comerciantul vede produsul disparut din Edinio si comenzi care continua sa vina
   * pentru marfa pe care n-o mai are. Niciun mesaj de eroare, nicaieri.
   *
   * `creat_de_edinio: false` e scris de import (`import-run.ts`) si numai de el; ce
   * facem noi primeste `true`. Deci e semnul exact.
   */
  const existaLaEmag = randuri.some(ofertaEsteLaEi);
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

/*
 * ═══ ⚠ AMANDOUA ARUNCA LA O CADERE A BAZEI, SI ASTA E TOT ROSTUL ═══
 *
 * Forma dinainte era `const { data } = …; return data ?? null`. Iar mai jos, `!produs`
 * inseamna „Produsul nu mai există în magazin”, verdict `sarit` — TERMINAL: cronul
 * sterge elementul din coada.
 *
 * Deci o pana de o clipa a bazei, nimerita exact peste trecerea cronului, stergea
 * lucrarea unui produs care exista foarte bine. Pretul nou nu mai pleca la eMAG
 * niciodata, si nimic nu spunea de ce: in coada nu mai era nimic de vazut.
 *
 * ⚠ La `citesteRandurile` e si mai rau, fiindca `[]` nu se vede deloc: lista goala
 * inseamna „produsul n-are nicio oferta”, iar la o RETRAGERE inseamna „n-a ajuns
 * niciodata pe eMAG" — deci oferta ramane la vanzare pentru marfa stearsa din magazin.
 */
async function citesteProdusul(
  admin: Admin, productId: string, businessId: string,
): Promise<ProdusDeCartografiat | null> {
  const r = await admin.from("products")
    .select("id, name, description, price, compare_at_price, images, category, sku, weight_grams, stock_quantity, is_active, is_bundle, page_sections")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  return randCitit<ProdusDeCartografiat>("products", r as never);
}

async function citesteRandurile(
  admin: Admin, businessId: string, productId: string,
): Promise<RandOfertaLocal[]> {
  const r = await admin.from("emag_offers")
    .select("id, emag_id, variant_title, family_id, part_number_key, ean, auto_sync, last_synced_at, creat_de_edinio, nume_emag, status_la_ei")
    .eq("business_id", businessId).eq("product_id", productId)
    .order("emag_id", { ascending: true });
  return randuriCitite<RandOfertaLocal>("emag_offers", r as never);
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
    const m = `Produsul are categoria „${produs.category ?? "—"}”, care nu e legată de nicio categorie eMAG.`;
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  /*
   * ═══ ⚠ SE VERIFICA LOCAL INAINTE DE A CHEMA EMAG ═══
   *
   * Un produs incomplet trimis costa de patru ori: arde o cerere din cele 3 pe secunda
   * (aceleasi de care are nevoie o miscare de stoc dupa o vanzare), arde o incercare
   * din coada, se intoarce cu o eroare de documentatie pe care comerciantul o vede
   * abia peste ore, iar pana atunci panoul arata „trimis”.
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
     * ⚠ „refuz”, nu „trecatoare”: lipsa unui camp nu se repara singura, iar reincercata
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
  /*
   * ⚠ DACA NU S-A PUTUT INTREBA, NU SE CREEAZA.
   *
   * Forma dinainte ignora rezultatul si mergea mai departe la `product_offer/save` — adica
   * CREA produsul in catalogul lor comun fara sa stie daca exista deja. Exact duplicatul
   * de care fuge toata functia: pagina noua, fara recenzii si fara vizitatori, dupa zile
   * de validare manuala, si de nedesfacut.
   *
   * „trecatoare” fiindca chiar e: ruta lor n-a raspuns acum, elementul ramane in coada si
   * se reia cu asteptare crescatoare.
   */
  const stieCatalogul = await cautaInCatalogulLor(
    admin, ctx, await citesteRandurile(admin, ctx.businessId, produs.id), produs,
  );
  if (stieCatalogul.fel === "trecatoare") {
    return {
      verdict: "trecatoare",
      mesaj: "Nu s-a putut verifica dacă produsul există deja pe eMAG. Se reia singur.",
    };
  }

  /*
   * ═══ ⚠ UN VERDICT CARE SPUNE „NU” TREBUIE SI SA OPREASCA (25.08.2026) ═══
   *
   * Pana acum, `nehotarat`, `inchis` si `avem_deja` scriau motivul pe rand si raspundeau
   * „ok” — iar linia urmatoare mergea la `product_offer/save`. Comentariile de acolo
   * spuneau chiar „NU se creeaza unul nou”, si se crea.
   *
   * ⚠ `refuz`, nu `sarit`. „Sarit” ar sterge elementul din coada si comerciantul n-ar mai
   * avea nimic de vazut; „refuz” arde o incercare, lasa motivul in coada si in panou, si
   * dupa cinci incercari abandoneaza fara sa dispara. Motivul nu se repara singur — il
   * repara omul, in fisa produsului — deci trebuie sa ramana sub ochii lui.
   */
  if (stieCatalogul.fel === "oprit") {
    await scrieEroare(admin, ctx.businessId, produs.id, stieCatalogul.mesaj);
    return { verdict: "refuz", mesaj: stieCatalogul.mesaj };
  }
  const cuCheie = await citesteRandurile(admin, ctx.businessId, produs.id);

  /*
   * ═══ ⚠ CARACTERISTICILE SE IAU DIN FISA PRODUSULUI, NU DOAR DIN CATEGORIE (§19) ═══
   *
   * Pana acum se puteau fixa doar PE CATEGORIE: o singura valoare pentru toate
   * produsele din ea. Ceea ce e absurd tocmai la caracteristicile care conteaza — nu
   * toate tricourile sunt „M”, si tocmai `Marime` e obligatorie.
   *
   * ⚠ Cea fixata pe categorie NU se pierde: umple golurile, pentru produsele care n-au
   * specificatia lor. Sterse, un magazin care si-a fixat „Material: Bumbac” pe toata
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

  /*
   * ═══ ⚠ WebP-UL IL FACEM NOI, DECI TOT NOI IL CONVERTIM (25.08.2026) ═══
   *
   * Conducta de imagini a magazinului incearca `image/webp` prima. Schema eMAG, la
   * `images[].url`, primeste numai „JPG, JPEG or PNG”.
   *
   * ⚠ Pana acum, produsul se OPREA cu un mesaj catre comerciant: „convertește imaginea”.
   * Corect din punctul de vedere al datelor, dar e o munca pe care i-o dam noi, pentru un
   * fisier pe care tot noi l-am facut — si pe care el nici nu-l poate schimba din Edinio,
   * fiindca formatul il alege conducta.
   *
   * Acum se face o COPIE convertita in R2, sub o cheie socotita din adresa sursa. Vitrina
   * ramane pe WebP; eMAG primeste JPEG. La a doua trecere, copia exista deja si nu se mai
   * descarca nimic.
   *
   * ⚠ Se cheama NUMAI daca chiar e nevoie. In catalogul masurat (24.08.2026) erau 1348 de
   * `.jpg`, un `.png` si patru `.webp` — deci pentru 1349 din 1353 de produse, linia de
   * mai jos nu face nicio cerere de retea.
   */
  const { produs: produsCuImagini, nereusite } = await cuImaginiPrimiteDeEmag(ctx, produs);

  const { oferte, probleme, observatii } = construiesteOferte(
    produsCuImagini,
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
      /* ⚠ Ca sa nu plece numele si codul in aceeasi cerere. Vezi `schimbaSiNumele`. */
      nume_emag: r.nume_emag,
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
     * impinge devreme, deci ea devenea „motivul”: patru elemente de coada isi ardeau
     * incercarile raportand „Codul de bare 5.94903E+12 nu e valid”, cand cauza adevarata
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
   * ═══ ⚠ AMPRENTA SE SCRIE NUMAI AICI, SI NUMAI LA REUSITA ═══
   *
   * Aici e SINGURUL loc din care pleaca continutul (`product_offer/save`). Scrisa si pe
   * rutele usoare, o miscare de stoc ar fi „confirmat" un continut pe care nu l-a trimis —
   * exact orbirea pe care amprenta o repara.
   *
   * ⚠ Se scrie amprenta produsului DE ACUM, nu de la inceputul trecerii: intre citire si
   * trimitere n-a trecut nimic care s-o schimbe, iar recalculata din acelasi obiect e
   * aceeasi. Ce se schimba DUPA trimitere ramane o schimbare neplecata, si asa trebuie.
   */
  /*
   * ═══ ⚠ CE N-A PLECAT INTREG NU SE MARCHEAZA CA PLECAT (25.08.2026) ═══
   *
   * `schimbaSiNumele` omite `part_number` cand se schimba si numele — eMAG refuza sa le
   * primeasca pe amandoua deodata. Nota de acolo spunea ca „la trecerea urmatoare codul
   * pleaca singur", dar NIMIC nu crea acea trecere: dupa succes elementul iesea din coada,
   * reconcilierea repara doar pret si stoc, iar plasa nu vedea nicio schimbare.
   *
   * Rezultat: la eMAG numele nou si codul VECHI, pe termen nelimitat.
   *
   * ⚠ ABTINEREA SINGURA NU AJUNGE, SI ASTA S-A DOVEDIT PE 25.08.2026. Forma dinainte doar
   * NU scria amprenta, si se bizuia pe plasa s-o aduca inapoi. Plasa insa taie anume
   * `when o.amprenta_continut is null then false` — iar aici amprenta e goala CHIAR fiindca
   * ne-am abtinut s-o scriem. Deci produsul nu se intorcea niciodata, si nota de mai sus
   * descria un mecanism care nu exista. Mai rau: se auto-intretinea, fiindca fiecare
   * schimbare de nume reconfirma golul.
   *
   * ⚠ SI PRINDEA MAI MULT DECAT SE CREDEA: `mapping.ts` omite codul la ORICE schimbare de
   * nume, nu doar cand se schimba si codul. Populatia atinsa era „nume", nu „nume + cod".
   *
   * Leacul de acum nu mai trece prin plasa deloc, ci face cele doua lucruri care lipseau:
   *
   *   1. scrie `nume_emag` cu CE AM TRIMIS. Stim exact ce am pus in cerere si stim ca ei au
   *      raspuns cu bine; nu e o presupunere. De aici, `schimbaSiNumele` va fi fals.
   *   2. repune produsul in coada, cu `oferta` — care pe o oferta existenta merge tot pe
   *      ruta grea (`rute.ts`: `if (s.op === "oferta") return { fel: "creeaza" }`), singura
   *      care poarta codul.
   *
   * Converge in exact doua treceri, si nu depinde nici de reconciliere, nici de amprenta.
   *
   * ⚠ Se citeste din INCARCATURA, nu se re-socoteste: `part_number` lipsa pe o ofertă
   * construita inseamna exact „am omis ceva". O a doua socoteala s-ar fi departat de prima,
   * ca de trei ori azi.
   */
  const aRamasCeva = (oferte as EmagProdusOferta[]).some((o) => !o.part_number);

  if (sAIncheiat(r.verdict as VerdictEmag) && aRamasCeva) {
    await maiTrebuieOTrecere(admin, ctx, produs.id, oferte as EmagProdusOferta[]);
  }

  if (sAIncheiat(r.verdict as VerdictEmag) && !aRamasCeva) {
    const { error: eAmprenta } = await admin.from("emag_offers")
      .update({ amprenta_continut: amprentaContinutului(produs) })
      .eq("business_id", ctx.businessId).eq("product_id", produs.id);
    if (eAmprenta) {
      /* ⚠ Nescrisa, amprenta ramane cea veche si plasa va repune produsul in coada la
         urmatoarea trecere. Adica o cerere in plus, nu o pierdere — deci se scrie in
         jurnal si se merge mai departe. */
      void logError({
        action: "emag.amprenta",
        message: `amprenta continutului nu s-a scris: ${eAmprenta.message}`,
        details: { productId: produs.id, businessId: ctx.businessId },
        businessId: ctx.businessId,
        severity: "warning",
      });
    }
  }

  /*
   * ⚠ OBSERVATIILE NU SE PIERD la o trimitere reusita.
   *
   * „Oferta pleaca fara cod de bare” e adevarat si merita stiut: in categoriile unde EAN-ul
   * e obligatoriu, eMAG o lasa ciorna, iar omul ar cauta motivul in panoul lor. Se lipesc
   * de mesaj, nu se ridica la verdict: produsul CHIAR a plecat.
   */
  /* ⚠ O imagine care n-a putut fi convertita NU dispare in tacere. Produsul poate pleca
     foarte bine fara ea, dar comerciantul trebuie sa afle: la eMAG, o poza lipsa nu da
     nicio eroare, produsul apare pur si simplu fara ea. */
  for (const x of nereusite) observatii.push(`Imaginea ${x.adresa} n-a plecat: ${x.motiv}.`);

  if (observatii.length > 0 && (r.verdict === "reusit" || r.verdict === "reusit_cu_observatii")) {
    return { ...r, verdict: "reusit_cu_observatii", mesaj: [r.mesaj, ...observatii].filter(Boolean).join(" · ") };
  }
  return r;
}

/**
 * Produsul, cu imaginile aduse la un format pe care eMAG chiar il citeste.
 *
 * ⚠ Se intoarce o COPIE. Schimbat pe loc, randul citit din baza ar fi purtat mai departe
 * adresele convertite, iar orice cod de dedesubt care se asteapta la imaginile magazinului
 * ar fi lucrat pe altceva fara sa stie.
 *
 * ⚠ Se ating si pozele COMBINATIILOR: la un produs cu variante, poza combinatiei e cea
 * principala a ofertei ei. Lasata `.webp`, marimea „Rosu” ar fi plecat fara poza — iar
 * eMAG nu se plange, produsul apare pur si simplu asa.
 *
 * ⚠ Daca nu e nimic de convertit, se intoarce chiar produsul primit: nicio copie, nicio
 * cerere de retea. Asta e cazul obisnuit, si trebuie sa ramana ieftin.
 */
async function cuImaginiPrimiteDeEmag(
  ctx: ContextEmag, produs: ProdusDeCartografiat,
): Promise<{ produs: ProdusDeCartografiat; nereusite: { adresa: string; motiv: string }[] }> {
  const aleProdusului = (Array.isArray(produs.images) ? produs.images : [])
    .map((x) => String(x ?? "").trim()).filter(Boolean);

  const ps = (produs.page_sections ?? {}) as { variants?: unknown };
  const aleCombinatiilor = combinatiiActiveUnice(parseVariants(ps.variants))
    .map((c) => (c.image ?? "").trim()).filter(Boolean);

  const toate = [...new Set([...aleProdusului, ...aleCombinatiilor])];
  if (toate.every(ePrimitaDeEmag)) return { produs, nereusite: [] };

  const { noi, nereusite } = await imaginiPentruEmag(ctx.businessId, toate);

  /* ⚠ Copie adanca a `page_sections`: acolo stau combinatiile, iar o copie de suprafata
     ar fi lasat obiectele lor comune cu randul original. */
  const psNou = JSON.parse(JSON.stringify(produs.page_sections ?? {})) as {
    variants?: { combinations?: { image?: string | null }[] };
  };
  for (const c of psNou.variants?.combinations ?? []) {
    const veche = (c.image ?? "").trim();
    const noua = veche ? noi.get(veche) : undefined;
    /* ⚠ Ce n-a putut fi convertit se SCOATE, nu se lasa `.webp`: filtrul din `mapping.ts`
       l-ar fi taiat oricum, iar lasat aici ar fi aratat ca merge. */
    if (veche) c.image = noua ?? null;
  }

  return {
    produs: {
      ...produs,
      images: aleProdusului.map((u) => noi.get(u)).filter((u): u is string => !!u),
      page_sections: psNou as ProdusDeCartografiat["page_sections"],
    },
    nereusite,
  };
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
    customization?: { enabled?: boolean; fields?: { required?: boolean }[] };
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
    /* ⚠ Doua garzi noi, vezi `ceLipseste`: personalizarea nu se poate onora prin comanda
       lor, iar pachetul are stoc derivat pe care integrarea nu-l scade. */
    personalizare: ps.customization ?? null,
    estePachet: p.is_bundle === true,
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
    const m = deCeNimicDeTrimis(randuri);
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
 * `POST /offer/save` cu `{id, stock}` — un lot, nu o cerere pe oferta.
 *
 * ⚠ ANTETUL ASTA SPUNEA PANA AZI `PATCH /offer_stock/{id}`, adica exact ruta pe care
 * functia NU mai merge. O nota care contrazice codul de sub ea e mai rea decat lipsa ei:
 * cine o citeste pleaca cu o convingere gresita si n-are de ce s-o verifice. Ruta aceea e
 * masurata cu 0 reusite din 850 pe contul real — vezi `actualizeazaStoc` in `client.ts`.
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
    const m = deCeNimicDeTrimis(randuri);
    await scrieEroare(admin, ctx.businessId, produs.id, m);
    return { verdict: "refuz", mesaj: m };
  }

  const depozit = ctx.config.warehouse_id ?? 1;

  /*
   * ═══ ⚠ STOCUL PLEACA PE `offer/save`, NU PE `offer_stock` (25.08.2026) ═══
   *
   * MASURAT IN PRODUCTIE, pe contul VetDepo, in jurnalul de cereri:
   *
   *   PATCH /offer_stock/{id}   0 reusite,  850 de refuzuri 400   ← niciodata, nici una
   *   POST  /product_offer/save 1145 reusite,  0 refuzuri
   *   POST  /order/read, /category/read, /rma/read, /vat/read …   toate merg
   *
   * Ruta usoara de stoc N-A FUNCTIONAT NICIODATA. S-a vazut abia cand a miscat primul
   * stoc, la 04:02, fiindca pana atunci nu fusese chemata. Din acel minut, fiecare
   * vanzare pe Edinio a incetat sa mai scada stocul la eMAG — adica exact supravanzarea
   * de care exista toata integrarea.
   *
   * ⚠ CE AM EXCLUS, cu dovezi, nu prin ghicire:
   *
   *   acreditarile   toate celelalte rute merg pe acelasi cont
   *   releul, IP-ul  la fel
   *   ofertele       active la ei (`status 1`), aprobate (`validation_status 9`), cu stoc
   *   valorile       5, 7, 16, 25, 31 — nimic negativ, nimic urias
   *   invelisul      `{data:{...}}` e ce cere schema LOR, si e chiar forma care merge de
   *                  1145 de ori pe `product_offer/save`
   *   adresa         `emagUrl` da exact `/api-3/offer_stock/{id}`
   *
   * ⚠ CE A RAMAS: `PATCH`. E SINGURUL loc din toata integrarea unde nu trimitem `POST` —
   * si singurul care cade. Iar cele 850 de refuzuri n-au `mesaje`: cand eMAG refuza din
   * logica lui, trimite `isError` cu motive, si le-am fi prins. Un 400 fara forma lor
   * seamana a cerere oprita INAINTE sa ajunga la aplicatia lor.
   *
   * ⚠ N-AM PUTUT DOVEDI ASTA CU O CERERE. Releul cu IP fix traieste doar in mediul
   * Vercel; de pe masina de lucru cererea ar pleca de pe un IP nealbit si ar primi un 403
   * care nu spune nimic despre metoda. Deci nu se repara ghicind metoda — se ocoleste
   * necunoscutul pe o ruta DOVEDITA.
   *
   * `offer/save` e tot o ruta USOARA: nu atinge documentatia, nu atinge continutul. E
   * chiar ruta pe care documentatia lor o da pentru pret SI stoc. Iar codul se sprijina
   * deja pe scrierea ei partiala: `retragePeEmagId` trimite doar `{id, status: 0}`.
   *
   * ⚠ SE TRIMITE NUMAI `{id, stock}`. Orice camp in plus ar fi o schimbare pe care
   * nimeni n-a cerut-o — chiar lectia Trendyol, unde o miscare trimisa pe ruta grea a
   * raportat succes fara sa schimbe pretul.
   *
   * ⚠ SI INTR-UN SINGUR LOT. Forma dinainte facea cate o cerere PE OFERTA: un produs cu
   * 50 de variante ardea 50 din cele 3 cereri pe secunda ale magazinului, pentru o
   * singura miscare de stoc. `offer/save` ia pana la 50 de oferte deodata.
   */
  const oferte: EmagOferta[] = stocuri.map((st) => ({
    id: st.emagId,
    stock: [{ warehouse_id: depozit, value: st.cantitate }],
  }));

  let ultimulMesaj = "";
  let celMaiRau: VerdictEmag = "reusit";

  for (let i = 0; i < oferte.length; i += LOT) {
    const r = await salveazaOferte(ctx.auth, oferte.slice(i, i + LOT));
    if (isEmagError(r)) {
      celMaiRau = maiRau(celMaiRau, r.verdict ?? "refuz");
      ultimulMesaj = mesajOmenesc(r.error);
      /* ⚠ La `chei` se opreste tot: acreditarile nu se repara intre doua loturi. */
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
/**
 * A plecat numele, dar codul a ramas acasa. Se pregateste trecerea a doua.
 *
 * ⚠ SE SCRIE `nume_emag` DIN INCARCATURA, NU DIN `produs.titlu`. Ce am trimis a fost
 * TAIAT la limita lor, iar reconcilierea aduce inapoi exact forma taiata. Scris din
 * titlul intreg, un produs cu nume lung ar fi parut mereu „schimbat", `schimbaSiNumele`
 * ar fi ramas adevarat pe veci, si codul n-ar mai fi plecat NICIODATA — adica exact
 * defectul pe care functia asta il repara, doar mutat cu un pas mai incolo.
 *
 * ⚠ Numai randurile carora chiar li s-a omis codul. Celelalte au plecat intregi si n-au
 * ce cauta intr-o a doua trecere.
 *
 * ⚠ O scriere picata nu se ascunde, dar nici nu opreste: `enqueueEmagSyncMany` de mai jos
 * repune oricum produsul, iar la trecerea urmatoare `nume_emag` va fi cel vechi si codul
 * se va omite din nou — o cerere in plus, nu o pierdere.
 */
async function maiTrebuieOTrecere(
  admin: Admin, ctx: ContextEmag, productId: string, oferte: EmagProdusOferta[],
): Promise<void> {
  const faraCod = oferte.filter((o) => !o.part_number && typeof o.id === "number");

  for (const o of faraCod) {
    const { error } = await admin.from("emag_offers")
      .update({ nume_emag: (o.name ?? "").trim() || null })
      .eq("business_id", ctx.businessId).eq("emag_id", o.id);
    if (error) {
      void logError({
        action: "emag.nume-trimis",
        message: `numele trimis nu s-a putut scrie inapoi: ${error.message}`,
        details: { productId, emagId: o.id, businessId: ctx.businessId },
        businessId: ctx.businessId,
        severity: "warning",
      });
    }
  }

  /* ⚠ `oferta`, nu `pret`: pe o oferta existenta numai `oferta` urca pe ruta grea, si
     numai ruta grea poarta `part_number`. Vezi `rutaDeTrimitere`. */
  await enqueueEmagSyncMany(ctx.businessId, [productId]);
}

function identitatiUsoare(randuri: RandOfertaLocal[]): IdentitateUsoara[] {
  return randuri
    /*
     * ═══ ⚠ AL DOILEA MARTOR, SI AICI (25.08.2026) ═══
     *
     * Filtrul era `last_synced_at != null`, adica „am trimis-o NOI". Dar o oferta
     * PRELUATA la import are `last_synced_at` gol si `creat_de_edinio: false` — exista la
     * ei, doar ca n-am pus noi mana pe ea.
     *
     * ⚠ Deci dupa ce comerciantul apasa „preia-le in Edinio" si porneste `auto_sync`,
     * prima lui vanzare raspundea „Produsul nu are nicio ofertă eMAG al cărei stoc să fie
     * actualizat." Ofertele importate — chiar cele pentru care a cerut anume sincronizarea
     * — ramaneau intr-un colt unde nu le atingea nici stocul, nici pretul.
     *
     * `ofertaEsteLaEi` e regula casei si era deja folosita la alegerea rutei si la
     * retragere. Aici ramasese copia veche, cu un singur martor — a treia oara azi cand
     * aceeasi regula scrisa in doua locuri se desparte.
     */
    .filter(ofertaEsteLaEi)
    /* ⚠ Cele scoase de ei din vanzare NU se trimit: refuza si pretul, si stocul. Vezi
       `eScoasaDeLaVanzare`. Mesajul pentru om il da apelantul, care stie de ce lista a
       iesit goala. */
    .filter((r) => !eScoasaDeLaVanzare(r))
    .map((r) => ({ variant_title: r.variant_title, emag_id: r.emag_id }));
}

/**
 * De ce n-a ramas nicio ofertă de trimis pe ruta usoara.
 *
 * ⚠ „Publică-l întâi" si „eMAG l-a scos din vanzare" sunt doua lucruri complet diferite,
 * iar spuse la fel, omul cauta unde nu e. Primul il trimite la butonul de publicare — pe
 * care il apasa degeaba, fiindca oferta EXISTA la ei.
 */
function deCeNimicDeTrimis(randuri: RandOfertaLocal[]): string {
  const laEi = randuri.filter(ofertaEsteLaEi);
  if (laEi.length === 0) return "Produsul nu are nicio ofertă eMAG de actualizat. Publică-l întâi.";

  if (laEi.every(eScoasaDeLaVanzare)) {
    return "eMAG a scos oferta din vânzare („End of Life”), și refuză orice schimbare de preț "
      + "sau de stoc pe ea. Ca s-o vinzi din nou, repune-o activă din panoul lor.";
  }
  return "Produsul nu are nicio ofertă eMAG de actualizat. Publică-l întâi.";
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
    /* ⚠ „Sarit”, nu „refuz”. Un produs fara dimensiuni nu e o eroare — e un produs
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
 * STERGEA inainte sa apuce sa trimita ceva (`route.ts:211`). Fara log, fara „dus”, fara
 * „cazut”. Toata logica scrisa anume pentru cazul asta — `rutaDeTrimitere` cu
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
  /*
   * ═══ ⚠ CITIREA PICATA NU E „OFERTA NU MAI EXISTA” (25.08.2026) ═══
   *
   * `sarit` e terminal: cronul sterge elementul din coada. Iar elementul asta e
   * RETRAGEREA unui produs deja sters din magazin — deci sters de aici, nimeni nu-l mai
   * pune vreodata la loc: legatura `emag_offers.product_id` s-a rupt la stergere
   * (`on delete set null`), asa ca nici macar nu se mai poate afla ce era de retras.
   *
   * Oferta ramane la VANZARE pe eMAG pentru marfa care nu mai exista, si comerciantul
   * afla cand primeste comanda. Anularea o plateste el, in bani si in punctaj la ei.
   *
   * ⚠ De aceea aici raspunsul la o cadere e `trecatoare`, nu `sarit`: nu arde nicio
   * incercare, elementul ramane in coada si se reia.
   */
  const r0 = await admin.from("emag_offers")
    .select("emag_id, last_synced_at, creat_de_edinio")
    .eq("business_id", ctx.businessId).eq("emag_id", emagId).maybeSingle();

  let rand: { emag_id: number; last_synced_at: string | null; creat_de_edinio: boolean } | null;
  try {
    rand = randCitit("emag_offers", r0 as never);
  } catch (e) {
    if (!(e instanceof EroareCitireBaza)) throw e;
    return {
      verdict: "trecatoare",
      mesaj: "Baza de date n-a răspuns la citirea ofertei. Retragerea se reia singură.",
    };
  }
  if (!rand) return { verdict: "sarit", mesaj: "Oferta nu mai există la noi." };

  /* ⚠ Aceeasi regula ca la `existaLaEmag`: o oferta PRELUATA exista la ei chiar daca
     n-am trimis-o noi niciodata, deci si ea trebuie oprita. */
  if (!ofertaEsteLaEi(rand)) {
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
  /*
   * ═══ ⚠ DOI MARTORI, CA LA `existaLaEmag` SI LA `retragePeEmagId` ═══
   *
   * Aici era numai unul: `last_synced_at != null`. Dar acela inseamna „cand am trimis
   * NOI", si importul nu-l scrie — nici n-ar trebui.
   *
   * Deci un produs ale carui oferte au fost PRELUATE din contul comerciantului trecea de
   * `rutaDeTrimitere` (care stie de al doilea martor) si pica aici: lista iesea goala,
   * verdictul era `sarit`, elementul se stergea din coada si se numara la „duse” — iar
   * oferta ramanea la VANZARE pe eMAG.
   *
   * ⚠ Ajungea aici chiar de pe butonul „Retrage de pe eMAG”: comerciantul apasa, ecranul
   * spunea „Oferta nu a ajuns niciodată pe eMAG”, si produsul lui se vindea mai departe
   * acolo. Cea mai rea forma cu putinta — un raspuns increzator si gresit.
   *
   * `creat_de_edinio: false` e scris NUMAI de import. Deci e semnul exact.
   */
  const vii = randuri.filter(ofertaEsteLaEi);
  if (vii.length === 0) return { verdict: "sarit", mesaj: "Oferta nu a ajuns niciodată pe eMAG." };

  const r = await salveazaOferte(ctx.auth, vii.map((x) => ({ id: x.emag_id, status: 0 as const })));
  if (isEmagError(r)) return { verdict: r.verdict ?? "refuz", mesaj: mesajOmenesc(r.error) };

  /*
   * ⚠ `bucatiDeIduri`, desi „sunt doar variantele unui produs”.
   *
   * Id-urile sunt UUID-uri, iar `.in()` NU pleaca in corpul cererii, ci in ADRESA:
   * fiecare adauga 37 de semne, iar marginea respinge cererea peste ~650. Masurat pe
   * proiectul real, in `supabase/id-chunks.ts`.
   *
   * Un produs cu 700 de combinatii active pare de nefacut — pana la un magazin de
   * piese auto cu o singura pozitie „surub” si toate dimensiunile drept variante.
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
      /* ⚠ Ca sa nu plece numele si codul in aceeasi cerere. Vezi `schimbaSiNumele`. */
      nume_emag: r.nume_emag,
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
   „EXISTA DEJA PE eMAG?” — INTREBAT INAINTE DE A CREA
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
 * cea pe care o cauta oamenii. Comerciantul vede „publicat” si nu vinde nimic.
 *
 * ⚠ SE INTREABA O SINGURA DATA PE OFERTA. Odata scris, `part_number_key` ramane, iar
 * la trimiterile urmatoare pasul asta se sare — altfel fiecare actualizare de pret ar
 * fi ars inca o cerere din cele 3 pe secunda ale magazinului.
 *
 * ⚠ Nereusita NU opreste publicarea. Daca eMAG nu raspunde la cautare, se trimite mai
 * departe forma cu documentatie: mai bine un produs publicat pe o pagina noua decat
 * unul nepublicat. Se scrie in jurnal, si se reia data viitoare.
 */
/**
 * Ce se poate face dupa ce am intrebat catalogul lor.
 *
 * ═══ ⚠ „OK” NU MAI E DE AJUNS, SI ASTA A FOST DEFECTUL ═══
 *
 * Functia raspundea `"ok" | "necunoscut"`, iar apelantul intelegea din „ok” ca poate
 * merge la `product_offer/save`. Numai ca „ok” se intorcea si pentru trei verdicte care
 * inseamna EXACT PE DOS — si chiar comentariile de dedesubt scriau „NU se creeaza unul
 * nou", dupa care se crea.
 *
 *   `nehotarat`  codul de bare duce la mai multe produse DIFERITE pe eMAG. Se trimitea
 *                fara `part_number_key`, deci se CREA un produs nou in catalogul lor
 *                COMUN: pagina fara recenzii si fara vizitatori, zile de validare
 *                manuala, si de nedesfacut.
 *   `inchis`     produsul exista, dar ei nu mai primesc oferte pe el. Se trimitea tot
 *                fara cheie, deci acelasi duplicat — pentru un lucru despre care STIAM
 *                deja ca nu se poate face.
 *   `avem_deja`  avem oferta acolo sub alt id intern. A doua oferta e refuzata de ei,
 *                dar cererea si incercarea se ard oricum.
 *
 * Un verdict care spune „nu” trebuie sa si OPREASCA. Altfel e doar un comentariu.
 */
type VerdictCatalog =
  /** Nu s-a gasit nimic care sa opreasca. Se poate trimite. */
  | { fel: "mergi" }
  /** Ruta lor n-a raspuns acum. Se reia, fara sa se arda o incercare. */
  | { fel: "trecatoare" }
  /** S-a aflat ceva care interzice trimiterea. Mesajul e pentru comerciant. */
  | { fel: "oprit"; mesaj: string };

async function cautaInCatalogulLor(
  admin: Admin,
  ctx: ContextEmag,
  randuri: RandOfertaLocal[],
  /**
   * Produsul, ca sa se poata afla codul care CHIAR va pleca.
   *
   * ⚠ Fara el, filtrul de mai jos citea `emag_offers.ean` — o coloana pe care o scrie
   * NUMAI importul, din raspunsul LOR. La un produs facut in Edinio ea e NULL, deci lista
   * iesea goala si `documentation/find_by_eans` nu se chema niciodata. Toata paza
   * impotriva duplicatului rula doar pentru ofertele care veneau deja de la ei — adica
   * exact acolo unde duplicatul nu se poate produce.
   */
  produs: ProdusDeCartografiat,
): Promise<VerdictCatalog> {
  /* Se intreaba numai pentru ofertele care n-au inca o pagina si care chiar au cod. */
  /*
   * ⚠ CODUL SE IA DIN FISA PRODUSULUI, ca la trimitere. Vezi `eanDeTrimis`: aceeasi
   * functie, ca „ce verific" si „ce trimit" sa nu se mai poata departa.
   */
  const codPeRandBrut = new Map<RandOfertaLocal, string>();
  for (const r of randuri) {
    if (r.part_number_key) continue;
    const cod = eanDeTrimis(produs, r.variant_title, r.ean);
    if (cod) codPeRandBrut.set(r, cod);
  }
  const deCautat = [...codPeRandBrut.keys()];
  if (deCautat.length === 0) return { fel: "mergi" };

  /*
   * ═══ ⚠ UN SINGUR LOT, NU O CERERE PE OFERTA (indreptat 24.08.2026) ═══
   *
   * Forma dinainte facea `for (const rand of deCautat)` si chema `cautaDupaEan` cu UN
   * cod. Nu „aproape una pe oferta” — exact una.
   *
   * ⚠ CE COSTA: ruta are limite PROPRII, mai stranse decat restul API-ului — 5 pe
   * secunda, 200 pe minut si **5.000 PE ZI**. Un catalog de 3.500 de oferte ardea 3.500
   * din cele 5.000 numai pe cautari, si lovea plafonul de 200/min la orice publicare in
   * masa. Iar infrastructura pentru 100 exista de la inceput si nu era folosita:
   * `cautaDupaEan` si `eanuriDeCautat` taie amandoua la 100.
   *
   * ⚠ Raspunsurile se desfac inapoi pe randuri dupa campul `eans`, fiindca `verdictEan`
   * judeca un teanc ca fiind despre UN produs: nedespartite, ar fi spus „nehotarat”
   * pentru toate. Vezi `imparteRaspunsurilePeRanduri`.
   */
  const codPeRand = new Map<RandOfertaLocal, string>();
  for (const r of deCautat) {
    const c = eanuriDeCautat([codPeRandBrut.get(r)])[0];
    if (c) codPeRand.set(r, c);
  }
  if (codPeRand.size === 0) return { fel: "mergi" };

  /*
   * ═══ ⚠ IN LOTURI DE 100, NU UN SINGUR LOT DE 100 (indreptat 25.08.2026) ═══
   *
   * Forma de ieri lua TOATE codurile, le trecea prin `eanuriDeCautat` — care taie la 100,
   * limita lor — si impartea raspunsurile peste TOATE randurile.
   *
   * ⚠ Deci la un produs cu 250 de variante: primele 100 se intrebau, restul de 150 NU.
   * Iar randurile neintrebate primeau zero raspunsuri, si `verdictEan([])` intoarce
   * `produs_nou`. Adica exact cea mai scumpa greseala cu putinta: se CREA produsul in
   * catalogul lor COMUN, pe o pagina noua fara recenzii si fara vizitatori, dupa zile de
   * validare manuala. Un duplicat acolo nu se poate desface.
   *
   * ⚠ REGULA: „EAN neverificat” NU e acelasi lucru cu „EAN verificat si inexistent”.
   * Prima inseamna „nu stiu”, si nu are voie sa devina o hotarare.
   *
   * Depozitul chiar are produse mari — nu e un caz teoretic.
   */
  const deIntrebat = [...codPeRand.keys()];
  const peRand = new Map<RandOfertaLocal, RaspunsEan[]>();

  for (let i = 0; i < deIntrebat.length; i += EAN_PE_CERERE) {
    const bucata = deIntrebat.slice(i, i + EAN_PE_CERERE);
    const coduri = eanuriDeCautat(bucata.map((r) => codPeRand.get(r)));
    if (coduri.length === 0) continue;

    const raspuns = await cautaDupaEan(ctx.auth, coduri);

    if (isEmagError(raspuns)) {
      /*
       * ⚠ SE OPRESTE PUBLICAREA INTREAGA, nu doar bucata asta.
       *
       * Forma dinainte scria in jurnal si mergea mai departe, iar apelantul ignora
       * rezultatul si ajungea la `product_offer/save`: crea produsul fara sa stie daca
       * exista deja.
       *
       * ⚠ Si nu se continua cu bucatile URMATOARE: ar insemna sa hotaram pentru unele
       * variante ale aceluiasi produs si sa ghicim pentru altele.
       */
      void logError({
        action: "emag.ean",
        message: `cautarea dupa cod de bare a esuat: ${raspuns.error}`,
        details: { cate: coduri.length, dinTotal: deIntrebat.length, businessId: ctx.businessId },
        businessId: ctx.businessId,
        severity: "warning",
      });
      /* ⚠ NU se arunca: coada n-are `try` in jurul elementului, iar o exceptie ar rupe
         toata trecerea cronului, nu doar produsul asta. */
      return { fel: "trecatoare" };
    }

    /* ⚠ Raspunsurile bucatii se impart NUMAI peste randurile bucatii. Peste toate, un
       raspuns al unei variante ar fi hotarat pentru alta care nici n-a fost intrebata. */
    /* ⚠ Se trimite codul SOCOTIT, nu `r.ean`: coloana e goala la ofertele noastre, iar
       impartirea s-ar fi facut pe nimic si fiecare rand ar fi primit zero raspunsuri —
       adica `verdictEan([])` = „produs nou", chiar hotararea scumpa de care fugim. */
    const alBucatii = imparteRaspunsurilePeRanduri(
      bucata.map((r) => ({ rand: r, ean: codPeRandBrut.get(r) ?? null })),
      (Array.isArray(raspuns.data) ? raspuns.data : []) as RaspunsEan[],
    );
    for (const [cheie, lista] of alBucatii) peRand.set(cheie.rand, lista);
  }

  /*
   * ⚠ SE ADUNA MOTIVELE, NU SE IESE LA PRIMUL. Un produs cu variante trimite toate
   * ofertele intr-o singura cerere, deci daca UNA e oprita, se opreste tot — iar
   * comerciantul trebuie sa vada CARE si DE CE, nu doar prima gasita.
   */
  const opriri: string[] = [];

  for (const rand of codPeRand.keys()) {
    const v = verdictEan(peRand.get(rand) ?? []);
    const care = (rand.variant_title ?? "").trim();
    const numeleLui = care ? `„${care}”` : "Produsul";

    if (v.fel === "atasare") {
      /*
       * ⚠ Se scrie `part_number_key`, si ATAT. `mapping.ts` il trimite mai departe,
       * iar prezenta lui schimba forma cererii din „creeaza produs” in „ataseaza-te
       * la produsul care exista". Nu se atinge nimic altceva din rand.
       */
      await admin.from("emag_offers")
        .update({ part_number_key: v.part_number_key, updated_at: new Date().toISOString() })
        .eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      continue;
    }

    if (v.fel === "avem_deja") {
      /* Cheia se scrie oricum: e legatura la pagina lor, si o vrem chiar daca oprim. */
      await admin.from("emag_offers")
        .update({ part_number_key: v.part_number_key, updated_at: new Date().toISOString() })
        .eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);

      /*
       * ═══ ⚠ „AVEM DEJA” INSEAMNA NOI, SAU EL? ═══
       *
       * `vendor_has_offer` spune doar ca VANZATORUL are o oferta pe pagina aceea. Dar
       * vanzatorul suntem tot noi dupa prima publicare reusita — iar intre publicare si
       * clipa in care reconcilierea aduce inapoi `part_number_key`, randul inca n-are
       * cheie, deci reintra in cautare si ar iesi „avem deja”.
       *
       * ⚠ Oprit orbeste, orice a doua trimitere a unui produs proaspat publicat ar fi
       * fost refuzata de noi insine, cu un mesaj despre panoul lor. Adica un defect mai
       * suparator decat cel reparat.
       *
       * Aceiasi doi martori ca peste tot in fisier: daca NOI am trimis-o vreodata
       * (`last_synced_at`), sau daca e preluata din contul lui (`creat_de_edinio: false`),
       * atunci oferta de acolo e chiar a randului asta si nu opreste nimic. Ramane un
       * singur caz care opreste: rand facut de noi, netrimis niciodata, iar pe pagina lor
       * exista deja o oferta a comerciantului — publicata din panoul eMAG.
       */
      const eAlta = !ofertaEsteLaEi(rand);
      if (eAlta) {
        opriri.push(
          `${numeleLui} are deja o ofertă pe eMAG („${v.nume}”), publicată din panoul lor. `
          + "Fă întâi un import din eMAG, ca oferta aceea să fie preluată aici; altfel s-ar "
          + "crea o a doua ofertă pe același produs.",
        );
      }
      continue;
    }

    if (v.fel === "inchis") {
      /*
       * ⚠ SE SCRIA MOTIVUL, SI SE TRIMITEA TOTUSI. Comentariul de aici spunea „NU se
       * creeaza unul nou in schimb" — dar functia raspundea „ok”, iar apelantul mergea
       * mai departe la `product_offer/save` FARA `part_number_key`. Adica exact ce scria
       * ca nu face: crea produsul a doua oara in catalogul lor comun.
       *
       * Acum opreste. Nu se pierde nimic: `allow_to_add_offer = 0` inseamna ca nu se
       * poate, si n-are rost sa ardem o cerere din cele 3 pe secunda ca sa aflam iar.
       */
      const m = `${numeleLui} există pe eMAG sub „${v.nume}” (${v.part_number_key}), dar `
        + "eMAG nu mai acceptă oferte noi pe el.";
      await admin.from("emag_offers").update({
        error: m, updated_at: new Date().toISOString(),
      }).eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      opriri.push(m);
      continue;
    }

    if (v.fel === "nehotarat") {
      /*
       * ═══ ⚠ CEL MAI SCUMP DINTRE TOATE, SI TOCMAI EL MERGEA MAI DEPARTE ═══
       *
       * Codul duce la produse DIFERITE: fie comerciantul a pus pe produs codul altuia,
       * fie un pachet poarta si codul cutiei, si al continutului. Trimis fara cheie, se
       * CREA un al treilea produs in catalogul lor comun — pe langa cele doua care exista
       * deja si care sunt chiar dovada ca ceva e amestecat.
       *
       * Edinio n-are cum sa aleaga intre ele si nu trebuie sa incerce. Alege omul.
       */
      const m = `${numeleLui} are un cod de bare care duce la ${v.candidati} produse `
        + "diferite pe eMAG. Verifică-l în fișa produsului: publicat așa, s-ar crea un "
        + "produs nou în catalogul lor, pe o pagină fără recenzii.";
      await admin.from("emag_offers").update({
        error: m, updated_at: new Date().toISOString(),
      }).eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      opriri.push(m);
      continue;
    }

    /* `produs_nou`: nu exista la ei. Se trimite cu documentatie, ca pana acum. */
  }

  /* ⚠ Cel mult trei motive in mesaj: un produs cu 200 de variante stricate ar fi umplut
     `last_error` cu o pagina de text pe care n-o citeste nimeni. */
  if (opriri.length > 0) {
    const cate = opriri.length > 3 ? ` (și încă ${opriri.length - 3})` : "";
    return { fel: "oprit", mesaj: opriri.slice(0, 3).join(" · ") + cate };
  }

  return { fel: "mergi" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOTURILE SI SCRISUL INAPOI
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ Maximul lor. Vezi `LOT_MAXIM` si nota din `errors.ts` despre „Maximum input vars”. */
const LOT = 50;

/**
 * Trimite in loturi si strange verdictul cel mai rau.
 *
 * ⚠ VERDICTUL LOTULUI E CEL MAI RAU DIN EL, nu ultimul si nu primul. Raspunsul lor
 * la `product_offer/save` e generic, fara rezultate pe element (verificat in spec):
 * nu exista niciun mod de a afla CARE dintre cele 50 au trecut. Luat ultimul, un lot
 * cu o singura cadere la inceput ar fi iesit din coada raportand succes.
 */
/**
 * Trimite un lot, iar daca eMAG spune ca e prea mare, il rupe in doua si incearca iar.
 *
 * ═══ ⚠ DOUA LIMITE, NU UNA ═══
 *
 * `LOT = 50` respecta limita de ENTITATI din documentatia lor. Dar mai au una, pe
 * ELEMENTE: „Maximum input vars of 4000 exceeded”. Un lot de 50 de produse simple incape
 * linistit; 50 de variante cu caracteristici, imagini, GPSR, stoc si familie pot sa nu.
 *
 * ⚠ CE FACEA PANA ACUM: 50 -> refuz, reincercare 50 -> acelasi refuz, si tot asa pana la
 * abandon. Lotul era fix, deci reincercarea nu putea schimba nimic — cinci incercari arse
 * pe o cerere care nu avea cum sa reuseasca, si un produs care nu se publica niciodata.
 *
 * ⚠ SE INJUMATATESTE NUMAI LA ACEA EROARE, nu la orice refuz. Un produs caruia ii lipseste
 * un camp va fi refuzat la fel si singur; injumatatit, am face de patru ori mai multe
 * cereri pentru acelasi „nu”.
 *
 * ⚠ Cand ramane O SINGURA entitate si tot nu incape, se opreste si se spune. Aia nu mai e
 * o problema de lot, e un produs care nu poate fi trimis nicicum — iar comerciantul
 * trebuie sa afle CARE, nu sa vada un refuz care se repeta.
 */
async function trimiteCuInjumatatire(
  lot: unknown[],
  trimite: (l: unknown[]) => Promise<
    | { error: string; status: number; verdict?: VerdictEmag; mesaje?: string[] }
    | { data: unknown; verdict?: VerdictEmag; mesaje?: string[] }
  >,
  observatii: string[],
): Promise<
  | { error: string; status: number; verdict?: VerdictEmag; mesaje?: string[] }
  | { data: unknown; verdict?: VerdictEmag; mesaje?: string[] }
> {
  const r = await trimite(lot);
  if (!("error" in r) || !ePreaMareLotul(r.mesaje, r.error)) return r;

  if (lot.length <= 1) {
    return {
      ...r,
      error: "Produsul e prea mare pentru o singură cerere eMAG (limita lor de 4000 de "
        + "elemente). Scurtează descrierea, caracteristicile sau numărul de imagini.",
    };
  }

  const mijloc = Math.ceil(lot.length / 2);
  const a = await trimiteCuInjumatatire(lot.slice(0, mijloc), trimite, observatii);
  const b = await trimiteCuInjumatatire(lot.slice(mijloc), trimite, observatii);

  /* ⚠ Observatiile jumatatii care a MERS nu se pierd fiindca cealalta a picat. */
  for (const parte of [a, b]) {
    if (verdictIncheiat(parte.verdict)) observatii.push(...(parte.mesaje ?? []));
  }
  /* ⚠ Se intoarce partea REA, daca exista: un lot in care o jumatate a picat n-a reusit. */
  if ("error" in a) return a;
  if ("error" in b) return b;
  return a;
}

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
   * Masurat in ziua aceea: 180 de randuri scrise „trimis”, cu zero mesaje pastrate —
   * desi eMAG raspunsese la fiecare fie „ai deja produsul asta”, fie „e ciorna, ii
   * lipseste EAN-ul". Comerciantul avea in fata un ecran care spunea ca totul a mers.
   *
   * Exact greseala §12.9 pe care ne-am ferit s-o facem la Trendyol — motivul
   * respingerii neafisat — facuta la celalalt capat: motivul PRIMIT si aruncat.
   */
  const observatii: string[] = [];

  for (let i = 0; i < elemente.length; i += LOT) {
    const r = await trimiteCuInjumatatire(elemente.slice(i, i + LOT), trimite, observatii);
    /*
     * ⚠ SE STRANG SI DE LA UN „REUSIT” CURAT (24.08.2026, a doua oara in aceeasi zi).
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
 * ceva de aratat omului, chiar daca amandoua inseamna „s-a salvat”.
 */
const GREUTATE: Record<VerdictEmag, number> = {
  reusit: 0, reusit_cu_observatii: 1, trecatoare: 2, refuz: 3, chei: 4,
};

/**
 * Lotul s-a incheiat, deci ce au spus ei despre el merita pastrat.
 *
 * ⚠ `undefined` inseamna „clientul n-a pus verdict”, iar implicitul acolo e `reusit`.
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
 * produs perfect trimis ar fi aratat „eroare” pentru o specificatie in plus pe care
 * eMAG nici n-o cere.
 *
 * ⚠ Se spune SI ce accepta ei. „Culoare: Turcoaz nu e o valoare acceptata” fara lista
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
 * langa asta, ar fi ramas in urma la prima schimbare — si atunci „deriva” ar fi
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
     * timpul de pregatire ii rescria valoarea de la eMAG cu „o zi”.
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
