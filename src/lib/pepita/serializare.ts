/**
 * Articolul, scris ca `<Product>` in cele doua feeduri Pepita.
 *
 * Ordinea elementelor urmeaza tabelul din documentatia lor. XML-ul nu cere o
 * ordine anume la elemente diferite, dar un feed care arata ca exemplul lor e
 * mai usor de comparat cu el cand ceva nu merge.
 *
 * ⚠ FEEDUL DE STOC E ALTUL, mai scurt, si asta e dinadins: ei il citesc o data
 * pe ora, iar cel de produse o data pe zi. Un feed de stoc care ar duce si
 * descrierile ar fi de douazeci de ori mai mare pentru aceeasi informatie.
 */

import type { ArticolPepita } from "./articole";
import { el, grup, numar } from "./xml";

/** `<Product>` intreg, pentru feedul de produse. */
export function produsXml(a: ArticolPepita): string {
  const descrieri = grup("Descriptions", [
    el("Name", a.nume),
    el("Description", a.descriere),
    el("Brand", a.brand),
    el("Manufacturer", a.producator),
  ].join(""));

  const preturi = preturiXml(a);

  const garantie = a.garantie
    ? grup("Warranty", el("Type", a.garantie.tip) + el("Duration", String(a.garantie.durata)))
    : "";

  const categorii = grup("Categories", a.categorii
    .map((c) => grup("Category", el("Id", c.id) + el("Name", c.nume)))
    .join(""));

  const poze = grup("Photos", a.poze
    .map((f) => grup("Photo", el("Url", f.url) + el("IsPrimary", f.principala ? "true" : "false") + el("Title", f.titlu)))
    .join(""));

  const atribute = a.atribute.length
    ? grup("Attributes", a.atribute
        .map((t) => grup("Attribute", el("AttributeName", t.nume) + el("AttributeValue", t.valoare)))
        .join(""))
    : "";

  const dim = a.dimensiuni;
  const dimensiuni = dim
    ? grup("VolumeDimensions", [
        dim.lungime != null ? el("Length", numar(dim.lungime, 4)) : "",
        dim.latime != null ? el("Width", numar(dim.latime, 4)) : "",
        dim.inaltime != null ? el("Height", numar(dim.inaltime, 4)) : "",
        dim.greutate != null ? el("Weight", numar(dim.greutate, 4)) : "",
      ].join(""))
    : "";

  return grup("Product", [
    el("Id", a.id),
    a.ultimaModificare != null ? el("LastMod", String(a.ultimaModificare)) : "",
    el("StructuredId", a.gtin),
    el("ProductNumber", a.mpn),
    descrieri,
    preturi,
    garantie,
    categorii,
    poze,
    el("ProductUrl", a.url),
    disponibilitateXml(a),
    atribute,
    dimensiuni,
  ].join("")) + "\n";
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BLOCUL DE PRETURI, SCRIS O SINGURA DATA                       (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ IL FOLOSESC AMANDOUA FEEDURILE, si tocmai de-aia exista ca functie. De cand
 * Pepita cere preturi si in feedul de STOC, acelasi articol isi spune pretul pe
 * doua cai: o data pe zi in feedul de produse si o data pe ora in cel de stoc.
 * Scrise separat, cele doua s-ar fi despartit la prima retusare — iar atunci
 * marketplace-ul ar fi avut doua preturi pentru acelasi `<Id>` si ar fi pastrat
 * pe ultimul citit, adica pe cel din feedul de stoc, fara ca nimeni sa afle.
 *
 * ⚠ Ordinea elementelor e a exemplului lor: Currency, Price, VatPercent, apoi
 * cele optionale.
 */
function preturiXml(a: ArticolPepita): string {
  return grup("Prices", [
    el("Currency", a.moneda),
    el("Price", numar(a.pret)),
    el("VatPercent", numar(a.tva, 2)),
    /* `DiscountedPrice` numai cand chiar exista o reducere; vezi `preturilePentruFeed`. */
    a.pretRedus != null ? el("DiscountedPrice", numar(a.pretRedus)) : "",
    a.transportBucata != null ? el("ShippingPrice", numar(a.transportBucata)) : "",
  ].join(""));
}

/**
 * `<Product>` scurt, pentru feedul de stoc.
 *
 * ═══ ⚠⚠ PRETURILE AU INTRAT AICI PE 24.09.2026, LA CEREREA LOR ═══
 *
 * Tabelul din documentatia lor pentru feedul de stoc (`docs/pepita/xml-format-2026-09-08.txt`,
 * sectiunea „Keszlet atadasa") cere DOAR `<Id>` si `<Availability>` — si exact asta trimiteam. Dar
 * ne-au scris, dupa ce VetDepo le-a dat adresele: „as dori sa le rog dezvoltatorilor nostri sa
 * adauge preturi in fluxul de stocuri, deoarece acest parametru este necesar si in noul nostru
 * procesor de fluxuri".
 *
 * Deci cererea e mai NOUA decat documentul de pe disc. Documentul ramane acolo asa cum e, iar
 * abaterea e scrisa aici, ca urmatorul om sa nu creada ca cineva a adaugat elemente la
 * intamplare.
 *
 * ⚠⚠ ZEROUL NU SE POATE INTAMPLA, si asta conteaza fiindca regula lor generala spune
 * „preturile sunt obligatorii in orice caz, iar un pret 0 nu e acceptat de sistemul nostru".
 * Articolele cu pret zero nu ajung niciodata pana aici: `articolelePentruProdus` le opreste cu
 * „pret-zero" si le arata comerciantului pe ecran, langa produs.
 *
 * ⚠ Termenul de pregatire tot nu se trimite: nu e in tabelul lor de stoc, iar un element in
 * plus intr-un feed citit de douazeci si patru de ori mai des e cost fara folos. Preturile sunt
 * altceva — ele au fost CERUTE.
 */
export function stocXml(a: ArticolPepita): string {
  return grup("Product", el("Id", a.id) + preturiXml(a) + disponibilitateXml(a, false)) + "\n";
}

/**
 * `<Product>` pentru un articol care NU MAI EXISTA la noi: piatra lui de mormant.
 *
 * ═══ ⚠ DE CE E NEVOIE DE ASA CEVA ═══
 *
 * Feedurile noastre spun ce EXISTA, niciodata ce a disparut. Pepita citeste ce ii dam si
 * pastreaza restul: un articol scos din feed nu se sterge la ei, ramane la vanzare cu ULTIMUL
 * pret si ULTIMUL stoc trimise. Deci un produs sters, dezactivat, scos din listare sau o
 * combinatie disparuta continua sa se vanda cu „mai am 5 bucati" — si comanda chiar vine.
 *
 * Nu exista niciun API prin care sa cerem stergerea. Singura cale pe care ne-o da formatul lor
 * e chiar asta: acelasi `<Id>`, cu `Available=false` si `Quantity=0`. Nu sterge oferta, dar o
 * scoate din vanzare, si asta opreste supravanzarea.
 *
 * ⚠ ZEROUL SE SCRIE, nu se lasa pe dinafara. `null` ar insemna „nu tinem evidenta bucatilor",
 * adica exact pe dos. Vezi nota de la `disponibilitateXml`.
 */
export function stocDisparutXml(articolId: string): string {
  return grup(
    "Product",
    el("Id", articolId) + grup("Availability", el("Available", "false") + el("Quantity", 0)),
  ) + "\n";
}

function disponibilitateXml(a: ArticolPepita, cuTermen = true): string {
  return grup("Availability", [
    el("Available", a.disponibil ? "true" : "false"),
    /*
     * ⚠ `null` inseamna „nu tinem evidenta bucatilor" si atunci elementul LIPSESTE. Zero
     * inseamna „nu mai am niciuna", adica exact pe dos, si TREBUIE sa se scrie.
     *
     * ⚠ Nota de aici spunea, pana la proba cu mutanti, ca `el()` ar inghiti zeroul si ca
     * de aceea scrierea e facuta de mana. Era fals: `el()` sare doar peste `null` si peste
     * sirul gol, iar „0" nu e niciunul dintre ele. O nota care descrie o plasa inexistenta
     * e mai rea decat lipsa notei, fiindca urmatorul om o crede.
     */
    el("Quantity", a.cantitate),
    cuTermen ? el("ShippingDelay", a.termenZile) : "",
  ].join(""));
}
