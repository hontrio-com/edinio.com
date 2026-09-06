import { r2KeyFromUrl } from "@/lib/r2-url";
import { normalizeazaDefinitia, type CampPersonalizare } from "./definitie";
import { pretulPersonalizarii, type RandDefalcare } from "./pret";
import { normalizeazaValorile, type ValoareCamp } from "./valori";

/**
 * Poarta personalizarii pe drumul comenzii.
 *
 * ═══ ⚠ CE REPARA, INAINTE DE ORICE ═══
 *
 * Pana acum serverul scria blobul clientului VERBATIM in `orders.items[].customization`, cu un
 * spread conditionat si fara nicio verificare: nici ca produsul chiar are personalizare pornita,
 * nici ca id-urile campurilor exista, nici ca un camp obligatoriu a fost completat, nici ca
 * adresa unui fisier arata catre depozitul nostru.
 *
 * Adica: „Camp obligatoriu" era o regula a BROWSERULUI. Cine trimitea cererea de mana o ocolea, iar
 * comerciantul primea o comanda pentru o cana gravata fara gravura. Iar etichetele din comanda —
 * cele dupa care se produce marfa — erau scrise tot de client.
 *
 * ⚠ Acum devine si o poarta de BANI, fiindca personalizarea poate schimba pretul. De aceea nimic
 * de aici nu „repara pe jumatate": ce nu se verifica, se refuza.
 *
 * ═══ ⚠ ACELASI TIPAR CA `validateExtras` ═══
 *
 * Clientul trimite ce a ALES, nu cat costa. Serverul citeste definitia din `page_sections`
 * (pe care o are deja — `placeOrder` cere `page_sections` in interogarea de produs) si pune el
 * pretul. Deosebirea fata de `validateExtras`: acolo o extraoptiune necunoscuta dispare TACIT
 * intr-un `.filter()`; aici se refuza zgomotos. O alegere pe care n-o intelegem inseamna ca omul
 * a cerut altceva decat i se livreaza.
 */

/** Prefixul sub care ruta publica de incarcare scrie fisierele clientilor. */
const PREFIX_INCARCARI = "products/customizations/";

/** Cate fisiere se accepta in total pe o linie, oricum ar fi configurate campurile. */
const MAX_FISIERE_PE_LINIE = 40;

/** O intrare din instantaneul scris in comanda. Forma e cea pe care o citeste deja panoul. */
export interface IntrareInstantaneu {
  type: string;
  label: string;
  value: string | string[];
  /** Id-ul optiunii alese, la `butoane`. Panoul nu-l citeste; auditul, da. */
  optiuneId?: string;
  /** Dimensiunile brute, ca sa nu trebuiasca despartit textul de mai sus. */
  dim?: { latime: number; inaltime: number; unitate: string };
}

export interface PersonalizareComanda {
  /** Cat se adauga PE BUCATA peste pretul de catalog. */
  supliment: number;
  /** `false` cand pretul de catalog NU se incaseaza (suprafata cu baza stinsa). */
  bazaInclusa: boolean;
  /** Se scrie in `orders.items[].customization` — forma citita deja de panou. */
  instantaneu: Record<string, IntrareInstantaneu>;
  /** Se scrie in `orders.items[].personalizare`. Defalcarea, pentru ecran si audit. */
  detaliu: {
    supliment: number;
    aria?: number;
    ariaFacturata?: number;
    tarifM2?: number;
    defalcare: RandDefalcare[];
  };
}

export type RezultatPersonalizare =
  /** Produsul n-are personalizare. ⚠ Si atunci nu se accepta nici date de la client. */
  | { fel: "fara" }
  | { fel: "ok"; date: PersonalizareComanda }
  | { fel: "eroare"; mesaj: string };

/**
 * Adresa asta arata catre un fisier incarcat de un client AL MAGAZINULUI ASTA?
 *
 * ⚠ DOUA VERIFICARI, SI AMANDOUA CONTEAZA.
 *
 * 1. Sa fie una dintre originile NOASTRE de depozit (`r2KeyFromUrl`). Fara ea, `value` era un sir
 *    liber care ajungea direct intr-un `<a href>` din panoul comerciantului — iar un
 *    `javascript:` acolo ruleaza in sesiunea lui autentificata. Adica XSS stocat, trimis prin
 *    formularul public de comanda.
 * 2. Sa fie sub prefixul de incarcari AL MAGAZINULUI. Fara ea, un client putea trimite adresa
 *    unei poze de produs a altui magazin, sau orice alt obiect din galeata, si el ar fi aparut in
 *    comanda ca „fisierul incarcat de client".
 */
function esteFisierulNostru(adresa: string, businessId: string): boolean {
  const cheie = r2KeyFromUrl(adresa);
  if (!cheie) return false;
  return cheie.startsWith(`${PREFIX_INCARCARI}${businessId}/`);
}

/**
 * Valorile trimise de browser, aduse la forma pe care o citeste `normalizeazaValorile`.
 *
 * ═══ ⚠ FEREASTRA DE DESFASURARE ═══
 *
 * Pagina de pana acum trimite `{ [id]: { type, label, value } }` — un obiect per camp, cu eticheta
 * scrisa de client. Pagina noua trimite valoarea BRUTA: un sir, un numar, `{ latime, inaltime }`.
 *
 * Intre desfasurare si ultima pagina veche ramasa deschisa in browserul cuiva trec minute bune.
 * Fara despachetarea de aici, fiecare dintre acele pagini ar fi primit „Camp obligatoriu" pe un
 * camp completat — clientul l-ar fi vazut plin pe ecran si refuzat de server, fara nicio explicatie
 * pe care s-o poata urma.
 *
 * ⚠ Se ia DOAR `value`; `type` si `label` din vechiul obiect se arunca. Ele veneau de la client, si
 * tocmai asta repara poarta.
 */
function despacheteaza(brut: unknown): unknown {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return brut;
  const out: Record<string, unknown> = {};
  for (const [cheie, v] of Object.entries(brut as Record<string, unknown>)) {
    out[cheie] =
      v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>)
        ? (v as Record<string, unknown>).value
        : v;
  }
  return out;
}

/** Dimensiunile, scrise asa cum le citeste omul: „350 x 250 cm". */
function caText(v: ValoareCamp, camp: CampPersonalizare): string | string[] {
  switch (v.fel) {
    case "text":
      return v.text;
    case "fisiere":
      return v.adrese;
    case "numar":
      return camp.unitate_text ? `${v.numar} ${camp.unitate_text}` : String(v.numar);
    case "dimensiuni":
      return `${v.latime} x ${v.inaltime} ${camp.unitate ?? "cm"}`;
    case "optiune":
      /*
       * ⚠ Se scrie ETICHETA, nu id-ul: panoul, emailurile si factura arata `value` asa cum e, iar
       * „prm" nu spune nimic atelierului. Id-ul pleaca alaturi, in `optiuneId`, ca sa se poata
       * spune peste un an care optiune a fost, chiar daca intre timp a fost redenumita.
       */
      return (camp.optiuni ?? []).find((o) => o.id === v.id)?.eticheta || v.id;
    case "pornit":
      return v.pornit ? "Da" : "Nu";
  }
}

/**
 * Verifica si pretuieste personalizarea unei linii.
 *
 * `pageSections` e al produsului AUTORITAR, citit de server. `brut` e ce a trimis browserul.
 */
export function verificaPersonalizarea(
  pageSections: unknown,
  brut: unknown,
  businessId: string,
): RezultatPersonalizare {
  const ps = pageSections && typeof pageSections === "object"
    ? (pageSections as Record<string, unknown>)
    : null;
  const definitie = normalizeazaDefinitia(ps?.customization);

  if (!definitie) {
    /*
     * ⚠ Produsul n-are personalizare, dar clientul a trimis una. Se REFUZA, nu se ignora.
     *
     * Ignorata, datele ar fi disparut tacut si comanda ar fi plecat mai departe — clientul ar fi
     * crezut ca a comandat o gravura, comerciantul ar fi produs o cana simpla. Iar in celalalt
     * sens: comerciantul care tocmai a stins personalizarea ar fi continuat sa primeasca cereri
     * de gravura din paginile ramase deschise, fara sa afle de ce.
     */
    const areDate = !!brut && typeof brut === "object" && Object.keys(brut).length > 0;
    if (areDate) {
      return { fel: "eroare", mesaj: "Produsul nu mai accepta personalizare. Reincarca pagina." };
    }
    return { fel: "fara" };
  }

  const curate = normalizeazaValorile(definitie, despacheteaza(brut));
  if (!curate.ok) {
    /*
     * ⚠ Se spune PRIMA constatare, cu eticheta campului. Un „date invalide" sec l-ar fi lasat pe
     * client sa ghiceasca ce anume, pe un formular cu cinci campuri.
     */
    const c = curate.constatari[0];
    return { fel: "eroare", mesaj: c.eticheta ? `${c.eticheta}: ${c.mesaj}` : c.mesaj };
  }

  /* ── Fisierele: proprietate, nu doar forma ──────────────────────────────── */

  let fisiere = 0;
  for (const camp of definitie.fields) {
    const v = curate.valori.get(camp.id);
    if (v?.fel !== "fisiere") continue;
    for (const adresa of v.adrese) {
      if (!esteFisierulNostru(adresa, businessId)) {
        return { fel: "eroare", mesaj: `${camp.label}: fisierul nu e valid. Incarca-l din nou.` };
      }
    }
    fisiere += v.adrese.length;
  }
  if (fisiere > MAX_FISIERE_PE_LINIE) {
    return { fel: "eroare", mesaj: "Prea multe fisiere pe o linie de comanda." };
  }

  /* ── Pretul, hotarat AICI ───────────────────────────────────────────────── */

  const p = pretulPersonalizarii(definitie, curate.valori);

  /* ── Instantaneul ───────────────────────────────────────────────────────── */

  /*
   * ⚠ ETICHETELE SE IAU DIN DEFINITIA SERVERULUI, la momentul comenzii — nu de la client, cum se
   * intampla pana acum. Un client putea trimite ce eticheta voia, iar comerciantul producea dupa
   * ea. Si nu se citesc mai tarziu din produsul viu: comerciantul poate redenumi campul maine, si
   * comanda de azi trebuie sa spuna in continuare ce s-a vandut.
   */
  const instantaneu: Record<string, IntrareInstantaneu> = {};
  for (const camp of definitie.fields) {
    const v = curate.valori.get(camp.id);
    if (!v) continue;
    const intrare: IntrareInstantaneu = {
      type: camp.type,
      label: camp.label,
      value: caText(v, camp),
    };
    if (v.fel === "optiune") intrare.optiuneId = v.id;
    if (v.fel === "dimensiuni") {
      intrare.dim = { latime: v.latime, inaltime: v.inaltime, unitate: camp.unitate ?? "cm" };
    }
    instantaneu[camp.id] = intrare;
  }

  return {
    fel: "ok",
    date: {
      supliment: p.supliment,
      bazaInclusa: p.bazaInclusa,
      instantaneu,
      detaliu: {
        supliment: p.supliment,
        ...(p.aria !== undefined ? { aria: p.aria } : {}),
        ...(p.ariaFacturata !== undefined ? { ariaFacturata: p.ariaFacturata } : {}),
        ...(p.tarifM2 !== undefined ? { tarifM2: p.tarifM2 } : {}),
        defalcare: p.defalcare,
      },
    },
  };
}
