import { bucatiDeCumparat, bucatiDeOferit, cadoulSeAlege, inlocuiesteProdusul } from "./offer.types";
import type { OfferType, OfferTrigger, OfferConfig, OfferDisplay } from "./offer.types";
import type { StareOferta } from "./stare";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN RÂND DIN LISTA DE OFERTE                                   (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ E `OfferRow` plus STAREA socotită în bază. Rândul vine din `offers_page`,
 * care întoarce și `offer_state(...)`; ecranul nu o mai socotește a doua oară,
 * fiindcă filtrul a ales rândurile după cea din bază, iar eticheta trebuie să
 * spună același lucru cu filtrul.
 *
 * ⚠ `business_id` NU e aici, și nici nu trebuie: pagina lucrează pe magazinul
 * celui logat, iar RLS o ține. Purtat mai departe, ar fi fost încă un câmp pe
 * care cineva l-ar fi putut crede o alegere.
 */
export interface OfertaDinLista {
  id: string;
  type: OfferType;
  name: string;
  is_active: boolean;
  priority: number;
  trigger: OfferTrigger;
  config: OfferConfig;
  display: OfferDisplay;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  conversions: number;
  revenue_added: number;
  created_at: string;
  updated_at: string;
  /** Starea, socotită de `offer_state` în chiar interogarea care a filtrat. */
  stare: StareOferta;
  /** Câte produse cere oferta și câte se mai pot cumpăra. Vezi `starea Stocului`. */
  produseCerute: number;
  produseRamase: number;
}

/**
 * Cifrele din cap, socotite pe TOT magazinul — nu pe pagina adusă.
 *
 * ⚠⚠ `afisari`, `acceptari` și `venit` sunt CONTOARE de pe rândul ofertei, nu
 * socoteli peste comenzi, și nici n-ar putea fi: `orders` nu păstrează nicio
 * legătură către oferta folosită. Urmarea, scrisă și pe ecran: nu scad când o
 * comandă se anulează. `comenziCazute` e singurul fel de a spune cât de mult nu
 * scad.
 */
export interface TotalurileOfertelor {
  oferte: number;
  active: number;
  afisari: number;
  acceptari: number;
  venit: number;
  comenziCazute: number;
  baniDatiCazuti: number;
  /** Oferte care merg acum dar au pierdut produse (încă se văd). */
  oferteCiuntite: number;
  /** Oferte care merg acum dar n-au mai rămas cu niciun produs. */
  oferteMoarte: number;
}

/**
 * Câte din cei care au VĂZUT oferta au și luat-o, în procente.
 *
 * ⚠ `null` când n-a văzut-o nimeni, nu 0: „0%” ar fi însemnat „au văzut-o și
 * n-au vrut-o”, iar adevărul e că n-a ajuns încă pe niciun ecran.
 *
 * ⚠⚠ ȘI POATE TRECE DE 100%, fără să fie un defect. Afișările la checkout și în
 * coș se numără abia de la 22.09.2026; acceptările se numără din 04.08.2026.
 * Pe ofertele mai vechi, numitorul e mai mic decât ar fi trebuit. De-aia
 * procentul nu se rotunjește tăcut la 100 — se arată cât e, și se spune de ce.
 */
export function rataDeAcceptare(afisari: number, acceptari: number): number | null {
  if (afisari <= 0) return null;
  return Math.round((acceptari / afisari) * 1000) / 10;
}

/**
  * Cifrele ofertelor, scrise ROMÂNEȘTE.
  *
  * ⚠ VĂZUT PE ECRAN LA PRIMA RULARE: cardul scria „8417” iar tabelul, pe același
  * ecran, „1.846” — fiindcă tabelul trecea prin `toLocaleString` și cardul nu.
  * Iar rata ieșea „4.9%”, cu punct: în românește separatorul zecimal e virgula,
  * și punctul e chiar cel al miilor. Deci „4.9” se citește greșit, nu doar urât.
  */
export function scrieCifra(n: number): string {
  return n.toLocaleString("ro-RO");
}

export function scrieRata(n: number): string {
  return `${n.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE A MAI RĂMAS DIN CE OFERĂ                                   (23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ TREI STĂRI, NU DOUĂ, fiindcă „i-a căzut unul din patru” și „n-a mai rămas
 * niciunul” cer lucruri deosebite de la comerciant: prima merită știută, a doua
 * e o ofertă care nu se mai vede deloc. Adunate într-una, n-ar fi știut dacă
 * trebuie să se miște acum sau când are timp.
 *
 * ⚠ `necunoscut` NU e „e bine”: ofertele automate și cele de cantitate n-au
 * listă fixă de produse, deci nu se poate spune nimic despre ele. Scris ca
 * „întreagă”, ar fi fost o liniște pe care nimeni n-a verificat-o.
 */
export type StareaStocului = "necunoscut" | "intreaga" | "ciuntita" | "moarta";

export function stareaStocului(o: Pick<OfertaDinLista, "produseCerute" | "produseRamase">): StareaStocului {
  if (!o.produseCerute) return "necunoscut";
  if (o.produseRamase === 0) return "moarta";
  return o.produseRamase < o.produseCerute ? "ciuntita" : "intreaga";
}

export const DESPRE_STAREA_STOCULUI: Record<Exclude<StareaStocului, "necunoscut" | "intreaga">, {
  text: string; explicatie: string;
}> = {
  ciuntita: {
    text: "Produse lipsă",
    explicatie: "Unele produse din ofertă nu mai sunt pe stoc. Oferta încă se vede, dar cu mai puține.",
  },
  moarta: {
    text: "Fără stoc",
    explicatie: "Niciun produs din ofertă nu mai e pe stoc, deci oferta NU se mai arată cumpărătorilor. Adaugă stoc sau schimbă produsele.",
  },
};

/** Ce arată rândul despre unde apare oferta. Fără nume de coloane. */
export function undeApare(trigger: OfferTrigger): string {
  if (trigger.scope === "all") return "toate produsele";
  if (trigger.scope === "categories") {
    const n = trigger.categories.length;
    return n === 1 ? "o categorie" : `${n} categorii`;
  }
  const n = trigger.productIds.length;
  return n === 1 ? "un produs" : `${n} produse`;
}

/**
 * Ce oferă, pe scurt.
 *
 * ⚠ Oferta de cantitate NU oferă produse, le ieftinește. Rândul comun scria
 * „oferă 0 produse”, adică exact pe dos față de ce face.
 */
export function ceOfera(o: Pick<OfertaDinLista, "type" | "config">): string {
  if (o.type === "volume") {
    const praguri = o.config.praguri ?? [];
    if (praguri.length === 0) return "niciun prag";
    return praguri.map((p) => `de la ${p.min_qty} buc −${p.percent}%`).join(", ");
  }
  if (o.config.autoByCategory) return "produse alese automat din categorie";
  const n = o.config.productIds.length;
  /*
    ⚠ CELE TREI TIPURI NOI SPUN REGULA, nu doar numărul. „oferă un produs” e
    adevărat și la un bump, și la un „cumperi 2 primești 1” — dar la al doilea
    numărul care contează nu e câte produse sunt în listă, ci câte bucăți cere
    și câte dă. Rândul din listă e singurul loc din care se poate afla asta fără
    să deschizi editarea.
  */
  if (o.type === "bogo") {
    const x = bucatiDeCumparat(o.type, o.config);
    const y = bucatiDeOferit(o.type, o.config);
    return x > 0 ? `la ${x} buc, ${y} buc din un produs` : "un produs";
  }
  if (o.type === "upgrade") {
    return inlocuiesteProdusul(o.type, o.config) ? "un produs, în schimb" : "un produs, pe lângă";
  }
  if (o.type === "gift" && cadoulSeAlege(o.type, o.config)) {
    return n === 1 ? "un cadou" : `${n} cadouri, la alegere`;
  }
  return n === 1 ? "un produs" : `${n} produse`;
}
