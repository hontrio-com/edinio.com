/**
 * Stornarea facuta de om IN easybill, inregistrata apoi in Edinio. Logica pura: unde se cauta,
 * ce document se potriveste cu seria si numarul scrise de om, si daca documentul gasit chiar e o
 * stornare a facturii comenzii.
 *
 * ═══ DE CE EXISTA ═══
 *
 * API-ul easybill nu are stornare; ea se face numai din pagina facturii („Acțiuni factură”,
 * „Stornare factură”). Fara un drum inapoi, comanda ar fi ramas in Edinio „facturata” pentru totdeauna:
 * slotul ocupat, nicio factura noua posibila, iar contul cumparatorului ar fi aratat factura
 * stornata drept document viu.
 *
 * ⚠ NIMIC PE INCREDERE. Numarul scris de om se cauta in easybill, iar documentul gasit se verifica:
 * finalizat (nu ciorna), neanulat, cu total NEGATIV. Negasit = eroare, nu o inregistrare oarba: o
 * cheie de stornare pusa gresit elibereaza slotul, iar urmatoarea emitere ar factura comanda a doua
 * oara.
 */

import type { FacturaCitita } from "./client";
import { dataFacturii } from "./document";

/* ═══════════════════════════════════════════════════════════════════════════
   UNDE SE CAUTA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cat de departe in urma se cauta, cel mult. */
export const ZILE_STORNARE_MAXIM = 62;
/** Primele zile se cauta zi cu zi: acolo e aproape sigur stornarea abia facuta. */
export const ZILE_UNA_CATE_UNA = 7;
/** Dupa ele, cate zile intra intr-o cerere. */
export const ZILE_PE_CERERE = 7;

export interface Interval {
  /** „YYYY-MM-DD”. */
  start: string;
  end: string;
}

const ZI_MS = 86_400_000;

function ziua(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function text(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Intervalele de cautare, de la AZI inapoi pana la data facturii originale (o stornare nu poate fi
 * mai veche decat factura ei), plafonate la `ZILE_STORNARE_MAXIM`.
 *
 * ⚠ „PAGINAREA” E PE TIMP: lista lor de facturi n-are paginare documentata, iar o zi a unui magazin
 * mare inseamna sute de randuri. Deci intervale mici, cele mai noi intai, si cautarea se opreste la
 * primul interval in care documentul apare: de obicei la prima cerere, fiindca omul inregistreaza
 * stornarea imediat dupa ce a facut-o.
 */
export function intervaleDeCautare(
  dataFacturiiOriginale: string | null | undefined,
  acum: Date,
): { intervale: Interval[]; plafonata: boolean } {
  const azi = ziua(dataFacturii(acum)) as number;
  const plafon = azi - (ZILE_STORNARE_MAXIM - 1) * ZI_MS;
  const originala = ziua(dataFacturiiOriginale);
  const plafonata = originala === null || originala < plafon;
  const limita = originala === null ? plafon : Math.max(originala, plafon);

  const intervale: Interval[] = [];
  let sfarsit = azi;
  while (sfarsit >= limita) {
    const lungime = intervale.length < ZILE_UNA_CATE_UNA ? 1 : ZILE_PE_CERERE;
    const start = Math.max(sfarsit - (lungime - 1) * ZI_MS, limita);
    intervale.push({ start: text(start), end: text(sfarsit) });
    sfarsit = start - ZI_MS;
  }
  /* Factura „din viitor” (ceas strambat): macar azi. */
  if (intervale.length === 0) intervale.push({ start: text(azi), end: text(azi) });
  return { intervale, plafonata };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE SE POTRIVESTE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DocumentCautat {
  serie?: string;
  numar: string;
}

/** Numarul, pentru comparatie: fara spatii, iar un numar din cifre fara zerourile din fata. */
function cheieNumar(s: string | null | undefined): string {
  const t = String(s ?? "").toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t;
}

/** Seria, pentru comparatie: doar litere si cifre, majuscule. */
function cheieSerie(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Ce a scris omul, curatat. Daca a pus seria si numarul impreuna in campul de numar („EBF 955”,
 * „EBF-955”) si a lasat seria goala, se despart.
 */
export function documentulCautat(c: DocumentCautat): DocumentCautat {
  const numar = String(c.numar ?? "").trim();
  const serie = String(c.serie ?? "").trim();
  if (!serie) {
    const m = /^([A-Za-z]+)[\s-]*(\d+)$/.exec(numar);
    if (m) return { serie: m[1], numar: m[2] };
  }
  return serie ? { serie, numar } : { numar };
}

/** Documentele cu EXACT numarul cerut (si seria, daca a fost data). Pura. */
export function potrivesteDocumentul(randuri: FacturaCitita[], cautat: DocumentCautat): FacturaCitita[] {
  const c = documentulCautat(cautat);
  const numar = cheieNumar(c.numar);
  const serie = cheieSerie(c.serie);
  if (!numar) return [];
  return randuri.filter((f) => cheieNumar(f.numar) === numar && (!serie || cheieSerie(f.serie) === serie));
}

/* ═══════════════════════════════════════════════════════════════════════════
   E CHIAR O STORNARE A FACTURII?
   ═══════════════════════════════════════════════════════════════════════════ */

function eticheta(f: Pick<FacturaCitita, "serie" | "numar">): string {
  return [f.serie, f.numar].filter(Boolean).join(" ");
}

const lei = (n: number) => `${Math.abs(n).toFixed(2).replace(".", ",")} lei`;

function cheieNume(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}


/** Observatiile pomenesc numarul facturii originale, ca numar intreg, nu ca bucata din altul? */
function pomenesteNumarul(comentarii: string, originala: FacturaCitita): boolean {
  if (!originala.numar) return false;
  const numar = originala.numar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9])0*${numar}([^0-9]|$)`).test(comentarii);
}

/** O factura pomenita in observatii: seria (poate lipsi) si numarul. */
export interface FacturaPomenita {
  serie: string;
  numar: string;
}

/** Cuvinte care stau intre „factura” si numar, dar nu sunt serii. */
const NU_E_SERIE = new Set(["NR", "NUMAR", "NUMARUL", "SERIA", "FISCALA"]);

/**
 * Facturile pomenite in observatiile unui document: „factura EBF 955”, „Storno factura seria EBF nr.
 * 955”, „facturii EBF-955 din 10.11.2026”, „factura nr. 955”.
 *
 * ⚠ CE SCRIEM NOI NU SE NUMARA. Observatiile facturilor noastre poarta marcajul („ref. EDN-…”) si, la
 * reemitere, „(inlocuieste factura X, stornata prin Y)”; daca easybill le copiaza pe stornare, X ar fi
 * parut o alta factura stornata. Se scot inainte.
 */
export function facturiPomenite(comentarii: string): FacturaPomenita[] {
  const curat = stripDiacritice(String(comentarii ?? ""))
    .replace(/\(\s*inlocuieste[^)]*\)/gi, " ")
    .replace(/ref\.\s*EDN-[0-9A-F]+/gi, " ");
  const out: FacturaPomenita[] = [];
  const tipar = /factur\w*\.?\s+(?:seria\s+)?([A-Za-z]{1,10})?[\s-]*(?:nr\.?|numar(?:ul)?)?\s*[:-]?\s*0*(\d{1,10})\b/gi;
  for (const m of curat.matchAll(tipar)) {
    const serie = (m[1] ?? "").toUpperCase();
    out.push({ serie: NU_E_SERIE.has(serie) ? "" : serie, numar: m[2] });
  }
  return out;
}

function stripDiacritice(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function aceeasiFactura(p: FacturaPomenita, o: Pick<FacturaCitita, "serie" | "numar">): boolean {
  if (cheieNumar(p.numar) !== cheieNumar(o.numar)) return false;
  return !p.serie || cheieSerie(p.serie) === cheieSerie(o.serie);
}

export type VerdictStornare =
  | { ok: true; storno: FacturaCitita; avertismente: string[] }
  | { error: string };

/**
 * Hotararea: se inregistreaza documentul gasit drept stornarea facturii, sau nu.
 *
 * REFUZ (nu se scrie nimic): negasit, mai multe la fel, chiar factura originala, ciorna, anulat,
 * total pozitiv sau necitibil, total care nu anuleaza EXACT factura (si cel mai mic, si cel mai mare),
 * observatii care pomenesc ALTA factura.
 * AVERTISMENT (se scrie, dar omul afla): alt client si observatii care nu pomenesc factura, stornare
 * datata inaintea facturii, factura originala anulata.
 *
 * ⚠ STORNAREA PARTIALA SE REFUZA, nu se avertizeaza: dupa inregistrare, slotul e liber, iar „Emite
 * factură nouă” refactureaza TOATA comanda. Clientul ar fi fost facturat de doua ori pentru partea
 * nestornata.
 */
export function verificaStornarea(p: {
  gasite: FacturaCitita[];
  originala: FacturaCitita;
  cautat: DocumentCautat;
  /** Ce interval s-a cautat, pentru mesajul de „negasit”. */
  cautare: { de_la: string; pana_la: string; plafonata: boolean };
}): VerdictStornare {
  const c = documentulCautat(p.cautat);
  const cerut = eticheta({ serie: c.serie ?? "", numar: c.numar });
  const o = p.originala;

  if (p.gasite.length === 0) {
    const unde = p.cautare.plafonata
      ? `în ultimele ${ZILE_STORNARE_MAXIM} de zile (${p.cautare.de_la} - ${p.cautare.pana_la})`
      : `între data facturii și azi (${p.cautare.de_la} - ${p.cautare.pana_la})`;
    return {
      error: `N-am găsit în easybill documentul ${cerut} ${unde}. Verifică seria și numărul exact cum apar în easybill, în lista de facturi. Nu am înregistrat nimic.`,
    };
  }
  if (p.gasite.length > 1) {
    const toate = p.gasite.map(eticheta).join(", ");
    return {
      error: c.serie
        ? `easybill are mai multe documente ${cerut} (${toate}). Nu putem alege singuri: verifică în easybill. Nu am înregistrat nimic.`
        : `Mai multe documente din easybill au numărul ${c.numar} (${toate}). Scrie și seria stornării. Nu am înregistrat nimic.`,
    };
  }

  const s = p.gasite[0];
  const et = eticheta(s) || cerut;
  if (s.cheie === o.cheie) {
    return { error: `${et} e chiar factura comenzii, nu stornarea ei. Scrie seria și numărul documentului de stornare din easybill.` };
  }
  if (s.stare.toLowerCase() !== "fiscal") {
    return { error: `${et} e ciornă în easybill („${s.stare || "fără stare"}”), nu document finalizat. Finalizează stornarea în easybill, apoi înregistreaz-o aici.` };
  }
  if (s.anulata) {
    return { error: `${et} e anulat în easybill, deci nu stornează nimic. Nu am înregistrat nimic.` };
  }
  if (s.total === null) {
    return { error: `easybill nu arată totalul documentului ${et}, deci nu putem verifica dacă e o stornare. Nu am înregistrat nimic.` };
  }
  if (s.total >= 0) {
    return { error: `${et} are totalul ${lei(s.total)}, nu negativ: nu e o stornare. Verifică numărul documentului. Nu am înregistrat nimic.` };
  }
  if (o.total === null) {
    return { error: `easybill nu arată totalul facturii ${eticheta(o)}, deci nu putem verifica dacă ${et} o anulează întreagă. Nu am înregistrat nimic.` };
  }
  if (Math.round(Math.abs(Math.abs(s.total) - Math.abs(o.total)) * 100) / 100 > 0.01) {
    return {
      error: `Stornarea ${et} (-${lei(s.total)}) nu anulează exact factura ${eticheta(o)} (${lei(o.total)}). Edinio înregistrează doar stornarea întreagă: după ea, „Emite factură nouă” refacturează toată comanda. O stornare parțială se rezolvă în easybill, unde emiți și ce mai e de facturat; Edinio n-o poate reface. Nu am înregistrat nimic.`,
    };
  }
  const pomenite = facturiPomenite(s.comentarii);
  if (pomenite.length > 0 && !pomenite.some((x) => aceeasiFactura(x, o))) {
    const care = pomenite.map((x) => [x.serie, x.numar].filter(Boolean).join(" ")).join(", ");
    return {
      error: `Observațiile documentului ${et} pomenesc factura ${care}, nu factura comenzii (${eticheta(o)}). Verifică în easybill ce stornează. Nu am înregistrat nimic.`,
    };
  }

  const avertismente: string[] = [];
  const acelasiClient = (!!s.clientId && s.clientId === o.clientId)
    || (!!s.clientNume && cheieNume(s.clientNume) === cheieNume(o.clientNume));
  const legata = acelasiClient || pomenite.some((x) => aceeasiFactura(x, o)) || pomenesteNumarul(s.comentarii, o);
  if (!legata) {
    avertismente.push(
      `${et} nu pare legată de factura ${eticheta(o)}: alt client${s.clientNume ? ` (${s.clientNume})` : ""}, iar observațiile ei nu pomenesc factura. Verifică în easybill că e stornarea potrivită.`,
    );
  }
  if (s.data && o.data && s.data < o.data) {
    avertismente.push(`${et} e datată ${s.data}, înaintea facturii ${eticheta(o)} (${o.data}). Verifică în easybill.`);
  }
  if (o.anulata) {
    avertismente.push(`Factura ${eticheta(o)} apare și anulată în easybill.`);
  }
  return { ok: true, storno: s, avertismente };
}

/* ═══════════════════════════════════════════════════════════════════════════
   INAINTE DE REFACTURARE: MAI TINE STORNAREA?
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reemiterea dupa storno se sprijina pe stornarea inregistrata. Mai tine ea, la easybill?
 * `null` = da; altfel, motivul refuzului.
 *
 * ⚠ NEGASITA, ANULATA SAU CIORNA = factura veche e din nou VIE (sau n-a fost niciodata anulata
 * fiscal), iar o factura noua peste ea ar fi factura dubla. Se intreaba INAINTEA registrului.
 */
export function stornareaMaiTine(
  storno: FacturaCitita | null,
  etichete: { storno: string; factura: string },
): string | null {
  const s = etichete.storno;
  const f = etichete.factura;
  if (!storno) {
    return `Stornarea ${s} nu mai apare în easybill, deci factura ${f} poate fi din nou vie. Nu emitem alta peste ea: verifică în easybill.`;
  }
  if (storno.anulata) {
    return `Stornarea ${s} e anulată în easybill, deci factura ${f} e din nou vie. Nu emitem alta peste ea.`;
  }
  if (storno.stare.toLowerCase() !== "fiscal") {
    return `Stornarea ${s} e ciornă în easybill, deci nu anulează încă factura ${f}. Finalizeaz-o în easybill, apoi emite factura nouă.`;
  }
  if (storno.total === null || storno.total >= 0) {
    return `Stornarea ${s} nu mai are un total negativ în easybill, deci nu putem ști dacă anulează factura ${f}. Nu emitem alta peste ea: verifică în easybill.`;
  }
  return null;
}
