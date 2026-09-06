/**
 * „E produsul asta gata de eMAG?" — raspuns INAINTE de a chema API-ul.
 *
 * ═══ ⚠ DE CE SE VERIFICA LOCAL, CAND EI VERIFICA OARICUM ═══
 *
 * Fiindca fiecare produs trimis incomplet costa de patru ori:
 *
 *   arde o cerere din cele 3 pe secunda ale magazinului — aceleasi 3 de care are
 *     nevoie o miscare de stoc dupa o vanzare;
 *   arde o incercare din coada, iar dupa cinci elementul se opreste;
 *   se intoarce cu o eroare de documentatie pe care comerciantul o vede abia peste
 *     ore, intr-o alta lista, cand nu mai tine minte ce a atins;
 *   iar pana atunci panoul arata „trimis", ceea ce nu e o minciuna, dar nu e nici
 *     adevarul care il intereseaza.
 *
 * Toate patru dispar daca intrebarea se pune inainte, unde raspunsul e instantaneu
 * si scris in romana.
 *
 * ═══ CE NU FACE ═══
 *
 * Nu inlocuieste validarea LOR si nu pretinde ca o prezice. eMAG poate respinge un
 * produs impecabil dupa criterii pe care nu ni le spune — marca neaprobata, imagine
 * cu filigran, o categorie la care contul n-are acces. De aceea rezultatul de aici
 * se numeste „pregatire", nu „va fi acceptat".
 *
 * ⚠ FISIER PUR, FARA NICIUN IMPORT. Il cheama si ecranul, si serverul. Vezi
 * `colete.ts` pentru aceeasi regula si acelasi motiv.
 */

/** Cat de tare doare lipsa. */
export type Gravitate =
  /** eMAG refuza cererea sau respinge produsul. Nu se trimite pana nu se repara. */
  | "blocheaza"
  /** Se publica si asa, dar produsul se vinde mai prost sau arata mai rau. */
  | "recomandat";

export interface Lipsa {
  /** Cheia campului, pentru ecran: `ean`, `brand`, `caracteristica:6553`. */
  camp: string;
  /** Ce vede omul. Scris ca o instructiune, nu ca un diagnostic. */
  eticheta: string;
  gravitate: Gravitate;
}

/** Ce stie ecranul despre produs. Forme simple dinadins: se cheama si din client. */
export interface ProdusDeVerificat {
  name?: string | null;
  price?: number | null;
  sku?: string | null;
  category?: string | null;
  images?: unknown;
  weight_grams?: number | null;
  description?: string | null;
  /** Codul de bare al produsului, din `page_sections.google.gtin`. */
  gtin?: string | null;
  /** Marca, din `page_sections.google.brand`. */
  brand?: string | null;
  /** Dimensiunile in cm, din `page_sections.dimensions`. */
  dimensiuni?: { length?: number; width?: number; height?: number } | null;
  /**
   * Produsul cere date de la cumparator? Din `page_sections.customization`.
   *
   * ⚠ Nu se poate onora prin eMAG: comanda lor n-are unde sa poarte „numele care trebuie
   * imprimat". Vezi nota din `ceLipseste`.
   */
  personalizare?: { enabled?: boolean; fields?: { required?: boolean }[] } | null;
  /** Pachet Edinio: stoc derivat din componente. Vezi nota din `ceLipseste`. */
  estePachet?: boolean | null;
}

/** Ce cere categoria eMAG aleasa pentru produs. `null` = nicio categorie legata. */
export interface CerinteCategorie {
  category_id: number;
  eanObligatoriu: boolean;
  garantieObligatorie: boolean;
  /** Caracteristicile obligatorii ale categoriei, cu numele lor. */
  obligatorii: { id: number; nume: string }[];
  /** Caracteristicile completate de comerciant la maparea categoriei. */
  completate: { id: number; value: string }[];
  /** Are categoria un tip de familie ales? Conteaza numai la produsele cu variante. */
  areTipFamilie: boolean;
}

/** Ce s-a ales la nivel de magazin. */
export interface CerinteMagazin {
  vat_id?: number | null;
  handling_time?: number | null;
  warranty_default?: number | null;
  /** GPSR: producatorul e obligatoriu in UE pentru majoritatea categoriilor. */
  areGpsr: boolean;
}

/**
 * Tot ce lipseste, in ordinea in care merita reparat.
 *
 * ⚠ ORDINEA E A GRAVITATII, NU A CAMPURILOR DIN FORMULAR. Comerciantul care se uita
 * la o lista vrea sa stie ce-l opreste, nu in ce ordine sunt scrise campurile.
 */
export function ceLipseste(
  produs: ProdusDeVerificat,
  categorie: CerinteCategorie | null,
  magazin: CerinteMagazin,
  areVariante: boolean,
): Lipsa[] {
  const out: Lipsa[] = [];
  const gol = (v: unknown) => !(typeof v === "string" ? v.trim() : v);

  /* ── Ce opreste trimiterea ─────────────────────────────────────────────── */

  /*
   * ═══ ⚠ PRODUSELE PERSONALIZABILE NU POT FI ONORATE PRIN eMAG ═══
   *
   * Edinio ingaduie campuri cerute cumparatorului: „numele care trebuie imprimat",
   * o poza de urcat, o culoare aleasa. Comanda eMAG n-are unde sa le poarte — nici
   * `order/read`, nici atasamentele nu au un loc pentru raspunsul clientului.
   *
   * ⚠ CE COSTA daca produsul pleaca: clientul cumpara de pe eMAG o cana personalizata,
   * comerciantul primeste o comanda fara sa stie ce sa scrie pe ea, si alege intre a
   * anula (o plateste in bani si in punctaj) si a trimite ceva la intamplare.
   *
   * ⚠ Se opreste ORICE personalizare pornita, nu doar cele cu campuri obligatorii.
   * Pana cand exista un model explicit pentru comenzile de marketplace, un camp
   * „optional" tot inseamna ca vitrina promite ceva ce eMAG nu poate transmite.
   */
  if (produs.personalizare?.enabled) {
    const cerute = (produs.personalizare.fields ?? []).filter((f) => f?.required).length;
    out.push({
      camp: "personalizare",
      eticheta: cerute > 0
        ? `Produsul cere ${cerute} ${cerute === 1 ? "informație" : "informații"} de la cumpărător `
          + "(personalizare), iar comanda eMAG nu are cum să le transmită."
        : "Produsul are personalizare activă, iar comanda eMAG nu are cum să transmită "
          + "răspunsurile cumpărătorului.",
      gravitate: "blocheaza",
    });
  }

  /*
   * ═══ ⚠ PACHETELE AU STOC DERIVAT, IAR eMAG NU STIE ASTA ═══
   *
   * Un pachet Edinio n-are stoc propriu (`track_inventory: false`, `stock_quantity: null`):
   * cate se pot vinde se socoteste din componente. La o comanda, trebuie scazuta fiecare
   * componenta cu cantitatea ei, iar la anulare pusa inapoi.
   *
   * Integrarea eMAG nu face asta. Publicat, pachetul ar vinde fara sa scada nimic.
   *
   * ⚠ Azi nu ajunge acolo oricum — `sku` si `brand` lipsesc mereu la pachete, si il opresc
   * mai jos. Dar acela e un noroc, nu o garda: cine adauga maine SKU pe pachete deschide
   * gaura fara sa stie ce a deschis. Se spune limpede, aici.
   */
  if (produs.estePachet) {
    out.push({
      camp: "pachet",
      eticheta: "Pachetele nu se pot publica pe eMAG: stocul lor se calculează din "
        + "componente, iar o comandă de acolo n-ar scădea nimic din depozit.",
      gravitate: "blocheaza",
    });
  }

  if (!categorie) {
    out.push({
      camp: "categorie",
      eticheta: produs.category
        ? `Categoria „${produs.category}" nu e legată de nicio categorie eMAG.`
        : "Produsul n-are categorie în magazin.",
      gravitate: "blocheaza",
    });
  }

  if (gol(produs.name)) {
    out.push({ camp: "nume", eticheta: "Produsul n-are nume.", gravitate: "blocheaza" });
  }

  if (!(Number(produs.price) > 0)) {
    out.push({ camp: "pret", eticheta: "Produsul n-are preț.", gravitate: "blocheaza" });
  }

  /*
   * ⚠ `part_number` e OBLIGATORIU la creare, si e SKU-ul nostru. Fara el, `mapping.ts`
   * cade pe id-ul produsului — un UUID — care trece de eMAG dar ajunge in facturi si
   * in exporturi ca un sir de 36 de semne pe care nimeni nu-l poate cauta.
   */
  if (gol(produs.sku)) {
    out.push({
      camp: "sku",
      eticheta: "Produsul n-are cod (SKU). eMAG îl cere, iar fără el primește un cod generat, greu de căutat.",
      gravitate: "blocheaza",
    });
  }

  if (gol(produs.brand)) {
    out.push({
      camp: "brand",
      eticheta: "Produsul n-are marcă. eMAG o cere la orice produs nou.",
      gravitate: "blocheaza",
    });
  }

  if (numarImagini(produs.images) === 0) {
    out.push({
      camp: "imagini",
      eticheta: "Produsul n-are nicio imagine.",
      gravitate: "blocheaza",
    });
  }

  if (magazin.vat_id == null) {
    out.push({
      camp: "tva",
      eticheta: "Nu e aleasă cota de TVA folosită pe eMAG, în setările integrării.",
      gravitate: "blocheaza",
    });
  }

  if (magazin.handling_time == null) {
    out.push({
      camp: "timp_pregatire",
      eticheta: "Nu e ales în câte zile expediezi, în setările integrării.",
      gravitate: "blocheaza",
    });
  }

  if (categorie) {
    if (categorie.eanObligatoriu && gol(produs.gtin)) {
      out.push({
        camp: "ean",
        eticheta: "Categoria eMAG aleasă cere cod de bare (EAN), iar produsul n-are unul.",
        gravitate: "blocheaza",
      });
    }

    if (categorie.garantieObligatorie && !(Number(magazin.warranty_default) > 0)) {
      out.push({
        camp: "garantie",
        eticheta: "Categoria eMAG aleasă cere garanție. Pune una implicită în setările integrării.",
        gravitate: "blocheaza",
      });
    }

    /*
     * ⚠ Caracteristicile se completeaza pe CATEGORIE, nu pe produs. Se verifica aici
     * fiindca lipsa lor respinge fiecare produs din categoria aceea — iar mesajul lui
     * eMAG vorbeste despre produs, nu despre mapare, deci comerciantul l-ar fi cautat
     * in datele produsului.
     */
    const completate = new Set(
      categorie.completate.filter((c) => (c.value ?? "").trim()).map((c) => c.id),
    );
    for (const c of categorie.obligatorii) {
      if (!completate.has(c.id)) {
        out.push({
          camp: `caracteristica:${c.id}`,
          eticheta: `Categoria eMAG cere caracteristica „${c.nume}", necompletată la mapare.`,
          gravitate: "blocheaza",
        });
      }
    }

    /*
     * ⚠ Fara tip de familie, eMAG PRIMESTE ofertele dar nu le grupeaza: marimile apar
     * ca produse fara legatura, iar cumparatorul nu poate schimba marimea din pagina.
     * NU da nicio eroare — de aia se prinde aici.
     */
    if (areVariante && !categorie.areTipFamilie) {
      out.push({
        camp: "tip_familie",
        eticheta: "Produsul are variante, dar categoria eMAG n-are ales un grup de variante. Mărimile ar apărea ca produse separate.",
        gravitate: "blocheaza",
      });
    }
  }

  /* ── Ce nu opreste, dar costa ──────────────────────────────────────────── */

  /*
   * ⚠ TEXTUL ASTA S-A SCHIMBAT DE DOUA ORI IN ACEEASI ZI (25.08.2026), si e scris de ce.
   *
   * Dimineata spunea „Nu sunt completate datele GPSR" — dar `emag_config.gpsr` nu se putea
   * scrie de nicaieri: exista in tipuri, `mapping.ts` il trimitea, si atat. Deci era o
   * fundatura: omul cauta prin toate cartile setarilor si pleca incredintat ca i-a scapat
   * lui ceva. Atunci textul a fost facut sa spuna adevarul: „nu se pot completa inca".
   *
   * Peste un ceas, formularul a fost adaugat (`PanouGpsr`). Deci si al doilea text devenise
   * neadevarat, doar in cealalta directie.
   *
   * ⚠ Un text care descrie ce POATE FACE omul trebuie sa se schimbe ODATA cu ce poate face.
   * Amandoua formele au fost adevarate cand s-au scris; niciuna n-ar mai fi azi.
   *
   * ⚠ SI SPUNE UNDE, nu doar ce lipseste. Vezi regula casei despre mesaje care numesc
   * butonul adevarat.
   */
  if (!magazin.areGpsr) {
    out.push({
      camp: "gpsr",
      eticheta: "Nu sunt completate datele GPSR (producător, reprezentant UE). eMAG le cere la "
        + "tot mai multe categorii. Le pui în setările integrării eMAG, la „Date GPSR”.",
      gravitate: "recomandat",
    });
  }

  if (gol(produs.description)) {
    out.push({
      camp: "descriere",
      eticheta: "Produsul n-are descriere. Pe eMAG, pagina fără descriere se vinde mai prost.",
      gravitate: "recomandat",
    });
  }

  if (!(Number(produs.weight_grams) > 0)) {
    out.push({
      camp: "greutate",
      eticheta: "Produsul n-are greutate. Fără ea, curierul o măsoară la ridicare și refacturează diferența.",
      gravitate: "recomandat",
    });
  }

  const d = produs.dimensiuni;
  if (!(Number(d?.length) > 0 && Number(d?.width) > 0 && Number(d?.height) > 0)) {
    out.push({
      camp: "dimensiuni",
      eticheta: "Produsul n-are dimensiuni. eMAG le folosește la calculul volumetric al transportului.",
      gravitate: "recomandat",
    });
  }

  if (numarImagini(produs.images) === 1) {
    out.push({
      camp: "imagini_putine",
      eticheta: "Produsul are o singură imagine. Pe eMAG, mai multe unghiuri cresc vânzările.",
      gravitate: "recomandat",
    });
  }

  return out;
}

/**
 * Cate imagini are produsul.
 *
 * ⚠ `products.images` e `jsonb` si vine in doua forme in datele reale: tablou de
 * siruri, si tablou de obiecte cu `url`. Numarat pe o singura forma, jumatate din
 * produse ar fi parut fara imagini si ar fi fost oprite de la publicare pe degeaba.
 */
export function numarImagini(brut: unknown): number {
  if (!Array.isArray(brut)) return 0;
  return brut.filter((x) => {
    if (typeof x === "string") return !!x.trim();
    if (x && typeof x === "object") {
      const u = (x as { url?: unknown; src?: unknown }).url ?? (x as { src?: unknown }).src;
      return typeof u === "string" && !!u.trim();
    }
    return false;
  }).length;
}

/**
 * Cat de pregatit e produsul, in procente.
 *
 * ═══ ⚠ UN PRODUS CARE NU POATE PLECA NU TRECE DE 60% ═══
 *
 * Scorul nu e o medie a bifelor. Daca ar fi, un produs caruia ii lipseste categoria
 * — deci nu poate pleca deloc — ar fi aratat 90% fiindca are poze si descriere. Iar
 * 90% il face pe om sa creada ca mai e putin, cand de fapt nu e nimic de facut pana
 * nu leaga categoria.
 *
 * Deci: orice lipsa care BLOCHEAZA plafoneaza scorul sub 60, si abia deasupra pragului
 * conteaza cele recomandate.
 */
export function scorPregatire(lipsuri: Lipsa[]): number {
  const blocante = lipsuri.filter((l) => l.gravitate === "blocheaza").length;
  const recomandate = lipsuri.filter((l) => l.gravitate === "recomandat").length;

  if (blocante > 0) {
    /* Cu cat sunt mai multe piedici, cu atat mai jos. Niciodata peste 55. */
    return Math.max(5, 55 - blocante * 10);
  }
  /* Fara piedici: 100 minus cate 6 puncte pentru fiecare lucru recomandat. */
  return Math.max(60, 100 - recomandate * 6);
}

/** Se poate trimite produsul acum? */
export function sePoatePublica(lipsuri: Lipsa[]): boolean {
  return !lipsuri.some((l) => l.gravitate === "blocheaza");
}
