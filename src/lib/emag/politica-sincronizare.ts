import type { EmagConfig, EmagOferta, EmagOfertaCitita, EmagProdusOferta, EmagStoc } from "./types";

/**
 * Ce trimite Edinio catre eMAG la o miscare de stoc sau de pret: stocul, pretul, amandoua sau nimic.
 *
 * ═══ ⚠ DE CE EXISTA (12.11.2026) ═══
 *
 * Aceeasi cerere ca la Trendyol (04.11.2026, vezi `lib/trendyol/politica-sincronizare.ts`):
 * comerciantul vinde pe marketplace la alte preturi decat in magazin. La eMAG singura oprire
 * era „Trimite automat prețul și stocul”, care le oprea pe AMANDOUA. Masurat in productie pe
 * 12.11: VetDepo are comutatorul acela OPRIT, deci de la ei nu mai pleaca nici stocul, iar eMAG
 * poate vinde marfa pe care magazinul n-o mai are. Exact alegerea intre doua pagube pe care
 * Trendyol a avut-o pana pe 04.11.
 *
 * ═══ ⚠ ALEGE CE PLEACA, NU CARE OFERTE (hotararea proprietarului, 12.11) ═══
 *
 * La Trendyol comutatoarele scrise trec si peste listarile preluate. Aici NU, si dinadins:
 * `emag_offers.auto_sync = false` are TREI intelesuri, iar doua n-au voie sa fie calcate de un
 * comutator de magazin:
 *
 *   - oferta preluata din contul lor la import si nepornita de om;
 *   - oferta oprita anume de om, din lista ofertelor (`comutaSincronizareaOfertei`);
 *   - oferta legata STRAMB (cronul, pasul 5d): numele ei la eMAG n-are niciun cuvant comun cu
 *     produsul nostru, deci stocul nostru ar pleca pe marfa altuia. 20 asa la VetDepo, 12.11.
 *
 * Deci oferta hotaraste DACA pleaca ceva (`rutaDeTrimitere`), iar comutatoarele de aici
 * hotarasc CE pleaca.
 *
 * ═══ ⚠ NESCRISE INSEAMNA PORNITE, ADICA PURTAREA DE PANA AZI ═══
 *
 * Spre deosebire de Trendyol, aici „nescris” si „scris pornit” fac acelasi lucru, tocmai
 * fiindca nu trec peste oferte. Un magazin care n-a atins comutatoarele merge exact ca inainte.
 */
export interface PoliticaSincronizare {
  stoc: boolean;
  pret: boolean;
}

export function politicaSincronizare(
  config: Pick<EmagConfig, "sincronizeaza_stocul" | "sincronizeaza_pretul">,
  { fortat = false }: { fortat?: boolean } = {},
): PoliticaSincronizare {
  return {
    /*
     * ⚠ APASAREA OMULUI TRECE PESTE STOCUL OPRIT. „Trimite acum” pe un produs anume e o cerere
     * de acum, pentru produsul ala; comutatorul vorbeste despre ce pleaca singur. La fel ca la
     * Trendyol (`manual`).
     */
    stoc: config.sincronizeaza_stocul !== false || fortat,
    /*
     * ⚠ PRETUL OPRIT NU TRECE NICIODATA, nici la apasarea omului. Comutatorul oprit spune
     * „pretul de pe eMAG il pun eu acolo”; o apasare pe „Trimite acum” nu e o razgandire
     * despre asta.
     */
    pret: config.sincronizeaza_pretul !== false,
  };
}

/**
 * Campurile care spun PRETUL unei oferte.
 *
 * ⚠ `vat_id` E PRINTRE ELE, dinadins. `sale_price` e FARA TVA, iar pe site eMAG arata pretul cu
 * cota lor. Schimbata cota de aici, pretul vazut de cumparator s-ar fi schimbat si el, desi
 * comerciantul a spus „pretul de pe eMAG il pun eu”.
 */
export const CAMPURI_DE_PRET = [
  "sale_price", "recommended_price", "min_sale_price", "max_sale_price", "vat_id",
] as const;

/**
 * Oferta pentru `offer/save` („light API”), fara jumatatea oprita.
 *
 * ⚠ AICI CAMPUL LIPSA INSEAMNA „LAS-O CUM E”. Ruta usoara scrie numai ce primeste: se
 * sprijina deja pe asta `{id, stock}` (stocul, din 25.08.2026) si `{id, status: 0}` (retragerea).
 * Deci nu e nevoie sa citim ce au ei, ca la Trendyol: e destul sa nu trimitem.
 *
 * ⚠ SE APLICA PESTE `oferteUsoare`, NU INAUNTRUL EI. Deriva compara chiar rezultatul lui
 * `oferteUsoare` cu ce au ei, si sare oferta cand `sale_price` lipseste. Taiat acolo, pretul
 * oprit ar fi oprit si masurarea STOCULUI.
 *
 * Starea (`status`) si timpul de pregatire raman: nu sunt nici pret, nici stoc, iar un produs
 * oprit in magazin trebuie oprit si la ei.
 */
export function ofertaUsoaraDupaPolitica(o: EmagOferta, pol: PoliticaSincronizare): EmagOferta {
  if (pol.stoc && pol.pret) return o;
  const iesita: EmagOferta = { ...o };
  if (!pol.pret) for (const camp of CAMPURI_DE_PRET) delete iesita[camp];
  if (!pol.stoc) delete iesita.stock;
  return iesita;
}

/** Ce are eMAG ACUM pe o oferta: valorile care se pastreaza pentru jumatatea oprita. */
export interface ValoriLaEi {
  sale_price: number;
  recommended_price: number | null;
  min_sale_price: number | null;
  max_sale_price: number | null;
  vat_id: number | null;
  /** `null` = nu stim ce stoc au, deci n-avem ce pastra. */
  stock: EmagStoc[] | null;
}

function pozitiv(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Valorile de pastrat, din raspunsul lui `product_offer/read`.
 *
 * ⚠ FARA PRET DE-AL LOR NU EXISTA NIMIC DE PASTRAT, si atunci intoarce `null`. Un zero pus „ca
 * sa avem o valoare” ar fi trimis oferta la zero lei, adica exact ce comerciantul a oprit.
 *
 * ⚠ STOCUL SE IA PE DEPOZITE, cum il dau ei. Abia daca lipseste se cade pe `general_stock`, pe
 * depozitul magazinului. Adunat intr-un singur numar, un comerciant cu doua depozite si-ar fi
 * vazut stocul mutat dintr-unul in altul.
 */
export function valorileLaEi(o: EmagOfertaCitita, depozit: number): ValoriLaEi | null {
  const pret = pozitiv(o.sale_price);
  if (pret == null) return null;

  let stock: EmagStoc[] | null = null;
  if (Array.isArray(o.stock)) {
    const peDepozite = o.stock
      .filter((s) => Number.isFinite(Number(s?.warehouse_id)) && Number.isFinite(Number(s?.value)))
      .map((s) => ({ warehouse_id: Number(s.warehouse_id), value: Math.max(0, Math.floor(Number(s.value))) }));
    if (peDepozite.length > 0) stock = peDepozite;
  }
  if (!stock && Number.isFinite(Number(o.general_stock))) {
    stock = [{ warehouse_id: depozit, value: Math.max(0, Math.floor(Number(o.general_stock))) }];
  }

  return {
    sale_price: pret,
    recommended_price: pozitiv(o.recommended_price),
    min_sale_price: pozitiv(o.min_sale_price),
    max_sale_price: pozitiv(o.max_sale_price),
    vat_id: pozitiv(o.vat_id),
    stock,
  };
}

/**
 * Oferta pentru `product_offer/save` (ruta grea, cu fisa), cu jumatatea oprita luata de la ei.
 *
 * ═══ ⚠ AICI NU SE POATE DOAR „NU TRIMITE” ═══
 *
 * Ruta grea duce fisa produsului SI oferta, iar pretul si stocul sunt in schema lor campuri ale
 * ofertei pe care le trimitem mereu. Nu stim, si n-avem cum proba de pe masina de lucru, ce face
 * eMAG cu o oferta EXISTENTA trimisa fara ele. Deci se face ca la Trendyol: se citeste ce au ei
 * chiar inainte, si se trimite inapoi neschimbat.
 *
 * ⚠ `null` = oferta NU pleaca: n-avem ce pastra (nu i-am putut citi valorile), iar a o trimite
 * cu pretul magazinului ar fi exact ce comerciantul a oprit.
 *
 * ⚠ Banda min/max se pastreaza a LOR cand e intreaga (`max > min`); altfel se face in jurul
 * pretului LOR, cu procentul magazinului. Banda noastra in jurul pretului nostru ar fi putut
 * lasa pretul lor in afara ei, si eMAG ar fi marcat oferta „Preț invalid”.
 */
export function ofertaGreaDupaPolitica(
  o: EmagProdusOferta,
  laEi: ValoriLaEi | undefined,
  pol: PoliticaSincronizare,
  banda: (pretFaraTva: number) => { min_sale_price: number; max_sale_price: number },
): EmagProdusOferta | null {
  if (pol.stoc && pol.pret) return o;
  if (!laEi) return null;

  const iesita: EmagProdusOferta = { ...o };
  if (!pol.pret) {
    iesita.sale_price = laEi.sale_price;
    if (laEi.recommended_price != null && laEi.recommended_price > laEi.sale_price) {
      iesita.recommended_price = laEi.recommended_price;
    } else {
      delete iesita.recommended_price;
    }
    const aLor = laEi.min_sale_price != null && laEi.max_sale_price != null
      && laEi.max_sale_price > laEi.min_sale_price;
    const b = aLor
      ? { min_sale_price: laEi.min_sale_price!, max_sale_price: laEi.max_sale_price! }
      : banda(laEi.sale_price);
    iesita.min_sale_price = b.min_sale_price;
    iesita.max_sale_price = b.max_sale_price;
    /* ⚠ Cota lor, cand o stim. Vezi `CAMPURI_DE_PRET`. Necunoscuta, ramane a noastra: campul e
       obligatoriu in schema rutei grele, iar o cota lipsa ar fi facut toata cererea sa cada. */
    if (laEi.vat_id != null) iesita.vat_id = laEi.vat_id;
  }
  if (!pol.stoc) {
    if (!laEi.stock) return null;
    iesita.stock = laEi.stock;
  }
  return iesita;
}

/**
 * Ce se trimite, in cuvinte, pentru textele din panou: „prețul și stocul”, „prețul”, „stocul”.
 *
 * ⚠ Un singur loc: butonul, intrebarea de confirmare si mesajul de dupa trebuie sa spuna acelasi
 * lucru, iar scrise de trei ori s-ar fi despartit la prima schimbare.
 */
export function ceSeTrimite(pol: PoliticaSincronizare): "prețul și stocul" | "prețul" | "stocul" | null {
  if (pol.pret && pol.stoc) return "prețul și stocul";
  if (pol.pret) return "prețul";
  if (pol.stoc) return "stocul";
  return null;
}
