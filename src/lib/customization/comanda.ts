import { terminatia } from "./adresa";
import { normalizeazaDefinitia, type CampPersonalizare } from "./definitie";
import { esteCheiaNoastra } from "./fisiere-private";
import { campurileFaraSuprafata, pretulPersonalizarii, type RandDefalcare } from "./pret";
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



/** Cate fisiere se accepta in total pe o linie, oricum ar fi configurate campurile. */
const MAX_FISIERE_PE_LINIE = 40;

/**
 * Ce terminatii poate purta un camp, dupa tipul lui.
 *
 * ⚠ SE POATE VERIFICA fiindca terminatia e pusa de NOI, nu de client: ruta de incarcare o alege
 * din octetii fisierului (`EXT_BY_MIME`), nu din numele trimis. Deci intrebarea „ce e in
 * fisierul asta?" are deja raspuns la momentul asta, si el e scris chiar in cheie.
 *
 * ⚠ CE APARA: capatul de incarcare e public, iar felul continutului i-l spune tot clientul
 * (`documente=1`). Fara randurile de aici, oricine putea urca un PDF si il putea trimite intr-un
 * camp de IMAGINE — iar vitrina, panoul de comenzi si emailul incearca toate sa randeze o
 * miniatura pentru ce sta acolo. Poarta aia se inchide unde se stie definitia produsului.
 */
const TERMINATII: Record<string, readonly string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
  fisier: ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"],
};

/*
 * ⚠ `sePoateRandaCaImagine` si `terminatia` s-au mutat in `adresa.ts`, si nu de dragul ordinii:
 * amandoua le cerea cate o componenta `"use client"`, iar de aici ar fi tras cu ele
 * `fisiere-private.ts`, adica `node:crypto`, in pachetul de browser al fiecarei pagini de produs.
 * Modulul de acolo e pur si citeste amandoua formele valorii — cheia noua si adresa veche.
 */

function terminatiaSePotriveste(adresa: string, tip: string): boolean {
  const permise = TERMINATII[tip];
  /* Un tip fara lista nu are fisiere; verificarea de mai jos nu se aplica. */
  if (!permise) return true;
  const t = terminatia(adresa);
  return t !== null && permise.includes(t);
}

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
 * O valoare de fisier e a magazinului asta?
 *
 * ⚠ O SINGURA FORMA: CHEIA SEMNATA. Ruta de incarcare intoarce cheia, purtand o semnatura HMAC
 * din secretul serverului. Ce se scrie in comanda si ce pleaca in email e cheia, nu adresa.
 * Vezi `fisiere-private.ts`.
 *
 * ═══ ⚠ DE CE EXISTA POARTA ASTA, DE LA INCEPUT ═══
 *
 * `value` venea din formularul PUBLIC de comanda si ajungea direct intr-un `<a href>` din panoul
 * comerciantului — iar un `javascript:` acolo ruleaza in sesiunea lui autentificata. Adica XSS
 * stocat. Si, a doua oara: fara cererea ca fisierul sa fie sub prefixul MAGAZINULUI, un client
 * putea trimite poza de produs a altui magazin, sau orice alt obiect din galeata, si ea aparea in
 * comanda ca „fisierul incarcat de client".
 *
 * ⚠ Semnatura le acopera pe amandoua deodata, si mai strans decat verificarea de adresa: cheia
 * poarta `business_id`-ul in chiar textul semnat, deci nu se poate compune pentru alt magazin,
 * si nu e o adresa, deci nu exista nicio schema de pus in ea.
 *
 * ═══ ⚠ FEREASTRA DE DESFASURARE: INCHISA 07.09.2026 ═══
 *
 * Aici a stat o a doua ramura, `esteAdresaVeche`, care primea adresa publica din depozitul
 * nostru — pentru paginile ramase deschise in browsere peste desfasurarea care a introdus cheile.
 * Nu mai exista asemenea pagini, iar ruta de incarcare nu mai intoarce `url` deloc (acelasi comit).
 *
 * ⚠ Nu era o ramura periculoasa, era doar una de sustinut: verifica gazda EXACT, nu prin
 * `r2KeyFromUrl`, tocmai fiindca ajutorul comun primeste orice `*.r2.dev` si o galeata straina cu
 * prefixul nostru ar fi trecut. Scoasa, si acea capcana dispare cu ea.
 *
 * ⚠ NU EXISTA DATE VECHI DE SUSTINUT: masurat inainte de prima livrare, 0 din 381 de comenzi
 * purtau vreun fisier de personalizare, si de atunci singura forma scrisa e cheia. Citirea
 * adresei intregi ramane totusi in `adresa.ts` (`terminatia`, `numeleFisierului`), fiindca acolo
 * e despre CE SE ARATA pe un rand deja existent, nu despre ce se primeste la comanda.
 */
function esteFisierulNostru(adresa: string, businessId: string): boolean {
  return esteCheiaNoastra(adresa, businessId);
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

  /*
   * ⚠ UN SUPLIMENT PE M² CERE METRI, si daca nu-i are, comanda se OPRESTE.
   *
   * `pretulPersonalizarii` il sare dinadins — la nivelul socotelii, „nu incasez nimic" e mai
   * putin rau decat „inventez un numar". Dar sarit si nespus, devine TACERE: comerciantul a
   * configurat „Protectie impermeabila +15 lei/m²", o vede salvata, si incaseaza ZERO. Clientul
   * primeste protectia pe gratis, si nimeni nu afla pana la inventar.
   *
   * ⚠ Se intreaba despre ALEGEREA clientului, nu despre configurare: cine nu bifeaza nimic pe
   * metru nu e obligat sa dea dimensiuni. Vezi `campurileFaraSuprafata`.
   */
  const faraSuprafata = campurileFaraSuprafata(definitie, curate.valori);
  if (faraSuprafata.length > 0) {
    const cere = faraSuprafata.map((c) => c.label).filter(Boolean).join(", ");
    return {
      fel: "eroare",
      mesaj: cere
        ? `Completeaza dimensiunile: fara ele nu se poate socoti ${cere}.`
        : "Completeaza dimensiunile: fara ele nu se poate socoti pretul.",
    };
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
      /* ⚠ Vezi `TERMINATII`: un PDF trimis intr-un camp de imagine se refuza aici. */
      if (!terminatiaSePotriveste(adresa, camp.type)) {
        return {
          fel: "eroare",
          mesaj: camp.type === "image"
            ? `${camp.label}: se accepta doar imagini.`
            : `${camp.label}: formatul fisierului nu se accepta.`,
        };
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
