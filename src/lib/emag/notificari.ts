/**
 * Ce ne spune o notificare eMAG, si ce se citeste in urma ei.
 *
 * ═══ ⚠ CONTINUTUL NOTIFICARII NU SE IA DE BUN, DAR TINTA EI DA ═══
 *
 * Regula de baza ramane cea din ruta: notificarea spune CE s-a schimbat, nu CUM arata
 * acum. Adevarul se citeste tot de la ei, cu o cerere anume.
 *
 * ⚠ CE ERA. Cand notificarea nu purta un id de comanda recunoscut — deci la RETUR, AWB si
 * DOCUMENTATIE APROBATA — se cadea pe o singura plasa: „citeste comenzile ultimelor
 * cincisprezece minute". Ceea ce, pentru un retur, nu face absolut nimic: returul nu e o
 * comanda si nu apare in `order/read`.
 *
 * Deci semnalul se pierdea, iar returul se afla abia la trecerea de sfert de ora a
 * cronului. Comerciantul avea marfa inapoi in depozit si niciun rand in Edinio.
 *
 * ⚠ La documentatie e mai subtil, dar la fel de suparator: reconcilierea merge cu un
 * cursor prin catalog, pagina cu pagina. Pe un catalog de 3.700 de oferte, o aprobare
 * poate sta zeci de minute pana ajunge cursorul la ea — iar intrebarea „de ce nu se vinde
 * inca produsul meu?" e chiar cea mai frecventa a comerciantului.
 *
 * ═══ ⚠ FORMA NOTIFICARII NU E DOCUMENTATA NICAIERI ═══
 *
 * Nu e in OpenAPI. Deci nu se ghiceste: se cauta printre denumirile plauzibile, iar cand
 * NU se recunoaste nimic, se raspunde `necunoscut` si ruta cade pe plasa de dinainte.
 * Adaugarea asta nu are voie sa strice ce mergea.
 */

/** Ce fel de eveniment, si pe ce anume. */
export type Notificare =
  | { fel: "comanda"; id: number }
  | { fel: "retur"; id: number }
  | { fel: "documentatie"; id: number }
  /**
   * Nu s-a recunoscut nimic. Se cade pe fereastra scurta de comenzi, ca pana acum.
   *
   * ═══ ⚠ SI AICI INTRA, ANUME, SI NOTIFICARILE DE AWB ═══
   *
   * eMAG trimite notificari si pentru starea AWB-ului. N-au cale proprie, si NU din
   * scapare: o schimbare de AWB vine odata cu o schimbare de stare a COMENZII, iar aceea
   * se vede foarte bine in `order/read` cu `modifiedAfter` — adica exact ce face plasa de
   * dinainte.
   *
   * ⚠ Deosebirea fata de RETUR e tocmai asta: un retur NU apare niciodata in `order/read`,
   * deci pentru el plasa nu facea nimic. Pentru AWB face.
   *
   * ⚠ Si nu tinem noi starea curierului: `emag_awb` se scrie la emitere si nu se
   * improspateaza de nicaieri. O cale rapida care „ar actualiza AWB-ul" ar fi trebuit sa
   * inventeze intai ce anume actualizeaza. Un fel de notificare pentru care nu exista
   * nimic de facut e mai bine sa n-aiba ramura, decat sa aiba una goala care pare ca face
   * ceva.
   */
  | { fel: "necunoscut" };

/** Toate felurile in care poate veni un numar de la ei. */
function numarul(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Prima cheie din listă care poartă un număr. */
function primulNumar(o: Record<string, unknown>, chei: string[]): number | null {
  for (const c of chei) {
    const n = numarul(o[c]);
    if (n != null) return n;
  }
  return null;
}

/**
 * Textele din care se poate deduce felul evenimentului.
 *
 * ⚠ Se cauta in ORICE camp de text de la nivelul intai, nu intr-unul anume: nu stim cum
 * il numesc. `resource`, `type`, `event`, `action`, `topic` — s-au vazut toate, la alti
 * furnizori. Cautarea larga costa nimic; ghicirea unui singur nume costa semnalul intreg.
 */
function textele(o: Record<string, unknown>): string {
  const bucati: string[] = [];
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.length < 200) bucati.push(v.toLowerCase());
  }
  return bucati.join(" ");
}

/**
 * Ce fel de notificare e, si pe ce.
 *
 * ⚠ ORDINEA CONTEAZA. Un id de COMANDA e cel mai sigur semn si se ia primul: notificarile
 * de comanda sunt cele mai multe, iar drumul lor e cel mai bine incercat.
 *
 * ⚠ Un retur poarta si el `order_id` — al comenzii returnate. Deci daca s-ar cauta intai
 * dupa comanda, fiecare retur ar fi fost tratat drept comanda, s-ar fi recitit comanda si
 * returul s-ar fi pierdut la fel ca pana acum. De aceea felul se hotaraste din TEXT
 * inainte de a se citi id-ul.
 */
export function citesteNotificarea(corp: unknown): Notificare {
  if (!corp || typeof corp !== "object") return { fel: "necunoscut" };
  const o = corp as Record<string, unknown>;

  /* Unele forme impacheteaza totul intr-un `data`. Se cerceteaza si acolo. */
  const inauntru = (o.data && typeof o.data === "object" ? o.data : {}) as Record<string, unknown>;
  const tot: Record<string, unknown> = { ...inauntru, ...o };
  const text = `${textele(o)} ${textele(inauntru)}`;

  /*
   * ⚠ „rma” si „return” inseamna amandoua retur. Se cauta si dupa cheia `rma_id`, fiindca
   * o notificare poate purta id-ul fara sa spuna in vreun text ce e.
   */
  const idRetur = primulNumar(tot, ["rma_id", "rmaId", "emag_rma_id", "return_id", "returnId"]);
  if (idRetur != null || /\brma\b|retur|return/.test(text)) {
    const id = idRetur ?? primulNumar(tot, ["id"]);
    if (id != null) return { fel: "retur", id };
  }

  /*
   * ⚠ Documentatie aprobata. `product_id` de aici e id-ul NOSTRU intern (`emag_id`), nu
   * al lor — la fel ca in comenzi. Vezi nota din `orders.ts`.
   */
  if (/documentation|documentatie|documentație/.test(text)) {
    const id = primulNumar(tot, ["product_id", "productId", "offer_id", "offerId", "id"]);
    if (id != null) return { fel: "documentatie", id };
  }

  const idComanda = primulNumar(tot, ["order_id", "orderId", "emag_order_id", "id"]);
  if (idComanda != null) return { fel: "comanda", id: idComanda };

  return { fel: "necunoscut" };
}
