import type { OfferProduct, ResolvedOffer } from "./offer.types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE INTRĂ ÎN COMANDĂ CÂND CINEVA BIFEAZĂ O OFERTĂ              (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Patru tipuri de ofertă se bifează în formularul de comandă: bump-ul, upgrade-ul,
 * „cumperi X primești Y" și cadoul. Formularul e scris de DOUĂ ori — `OrderModal`
 * (de pe pagina de produs) și `CheckoutForm` (din coș) — și amândouă trebuie să
 * răspundă la fel la aceleași trei întrebări:
 *
 *   1. care oferte mai au ce arăta?
 *   2. ce linie intră în comandă pentru o ofertă bifată, și câte bucăți?
 *   3. ce linie din coș IESE, când oferta e un schimb?
 *
 * ⚠⚠ DE-AIA STAU AICI, nu în fiecare formular. Regula bump-ului („ascunde-l dacă
 * produsul e deja în comandă") era scrisă în amândouă, iar cele două se
 * potriveau doar fiindcă niciuna nu se atinsese de la scriere. Cu patru tipuri,
 * dintre care unul scoate o linie și altul aduce mai multe bucăți, două copii
 * s-ar fi despărțit la prima retușare — iar despărțirea se vede în bani: un
 * formular ar fi trimis alt subtotal decât încasează serverul.
 *
 * ⚠ NIMIC DE AICI NU E AUTORITAR. Prețurile sunt pentru ecran și pentru cotarea
 * transportului; la plasarea comenzii serverul reface tot drumul din configurația
 * ofertei (`aplicaOfertaPeLinii`). Fișierul ăsta n-are voie să fie singurul loc
 * unde se știe cât costă ceva.
 */

/** O linie purtată din coș, cât de puțin trebuie să știm despre ea. */
export interface LinieDinCos {
  /** Cheia de identitate a liniei (produs, sau produs::variantă) — vezi `lineKey`. */
  key: string;
  productId: string;
  quantity: number;
}

/** Ce adaugă în comandă o ofertă bifată. */
export interface LinieDeOferta {
  offerId: string;
  product: OfferProduct;
  /** Câte bucăți intră. Unu peste tot, în afară de „cumperi X, primești Y". */
  bucati: number;
  /** Prețul prin ofertă, PE BUCATĂ. */
  pret: number;
  /** Prețul de catalog, pe bucată — pentru tăietura de pe ecran. */
  pretIntreg: number;
}

/**
 * Produsele pe care oferta le mai poate da: cele care nu sunt deja în comandă.
 *
 * ⚠ Serverul le-a exclus deja pe cele din coș (`resolveCartOffers`), dar
 * clientul poate schimba coșul din formular după ce lista a sosit. Fără filtrul
 * ăsta, o ofertă ar fi rămas pe ecran pentru un produs pe care omul tocmai l-a
 * adăugat singur, iar reducerea s-ar fi așezat a doua oară pe aceeași linie.
 */
export function produseleRamase(
  o: ResolvedOffer, produseInComanda: ReadonlySet<string>,
): OfferProduct[] {
  return o.products.filter((p) => !produseInComanda.has(p.id));
}

/**
 * Ce linie a scos fiecare upgrade bifat: id-ul ofertei → cheia liniei.
 *
 * ⚠⚠ O HARTĂ, NU O MULȚIME DE CHEI, și asta a fost un defect adevărat, văzut pe
 * ecran: cu o mulțime, linia scoasă ieșea și din lista pe care se caută linia de
 * schimbat, deci oferta bifată nu-și mai găsea perechea și DISPĂREA din formular
 * — iar odată dispărută, prețul ei nu mai intra în comandă. Coșul scădea cu
 * prețul cremei mici și nu creștea cu al celei mari.
 *
 * Cu harta, oferta își ține minte linia și rămâne pe ecran bifată.
 */
export type LiniiScoase = Readonly<Record<string, string>>;

/** Cheile liniilor scoase de oricare upgrade bifat. */
export function cheileScoase(scoase: LiniiScoase): Set<string> {
  return new Set(Object.values(scoase));
}

/**
 * Linia din coș pe care o SCOATE un upgrade. `undefined` = n-are ce scoate.
 *
 * ⚠⚠ NUMAI LINII DIN COȘ, niciodată produsul formularului. Comanda directă are
 * întotdeauna un produs principal, iar prețul lui se socotește pe server înainte
 * de oferte și nu se poate anula de aici (vezi `TIPURI_DIN_FORMULAR`). Un
 * upgrade care ar pretinde că scoate produsul de pe pagină ar fi lăsat comanda
 * cu amândouă înăuntru — adică ar fi mințit chiar pe ecranul pe care scrie
 * „în loc de".
 *
 * ⚠ `liniiCos` e coșul ÎNTREG, cu tot cu liniile deja scoase: oferta care a scos
 * o linie trebuie s-o găsească mai departe, altfel iese chiar ea de pe ecran.
 */
export function linieDeSchimbat(
  o: ResolvedOffer,
  liniiCos: readonly LinieDinCos[],
  scoase: LiniiScoase = {},
): LinieDinCos | undefined {
  if (!o.reguli?.inlocuieste) return undefined;
  /* Linia pe care a scos-o CHIAR oferta asta. */
  const aLui = scoase[o.id];
  if (aLui) {
    const gasita = liniiCos.find((l) => l.key === aLui);
    if (gasita) return gasita;
  }
  /* Altfel, prima liberă: cele luate de alte upgrade-uri nu se mai pot lua. */
  const luate = cheileScoase(scoase);
  const deSchimbat = new Set(o.reguli.deSchimbat ?? []);
  return liniiCos.find((l) => l.quantity >= 1 && !luate.has(l.key) && deSchimbat.has(l.productId));
}

/**
 * Ofertele pe care formularul chiar le poate arăta.
 *
 * ⚠ Un upgrade fără linie de schimbat NU se arată: ar fi fost un bump cu alt
 * text, iar cumpărătorul ar fi citit „în loc de crema de 50 ml" fără să aibă
 * vreo cremă de 50 ml în comandă.
 */
export function ofertePeCareLePoateArata(
  oferte: readonly ResolvedOffer[],
  /** Coșul ÎNTREG, cu tot cu liniile scoase de upgrade-uri. */
  liniiCos: readonly LinieDinCos[],
  produseInComanda: ReadonlySet<string>,
  scoase: LiniiScoase = {},
): ResolvedOffer[] {
  return oferte.filter((o) => {
    if (!o.pricing || o.products.length === 0) return false;
    if (produseleRamase(o, produseInComanda).length === 0) return false;
    if (o.reguli?.inlocuieste && !linieDeSchimbat(o, liniiCos, scoase)) return false;
    return true;
  });
}

/**
 * Ce intră în comandă pentru o ofertă bifată.
 *
 * `alegere` e produsul ales de cumpărător la un cadou la alegere. Când lipsește,
 * sau când nu se mai poate da, se ia primul rămas — aceeași regulă ca serverul,
 * care primește tot setul și pune prețul pe linia chiar trimisă.
 */
export function linieDeOferta(
  o: ResolvedOffer,
  produseInComanda: ReadonlySet<string>,
  alegere?: string,
): LinieDeOferta | null {
  const ramase = produseleRamase(o, produseInComanda);
  if (ramase.length === 0) return null;
  const p = (alegere && ramase.find((x) => x.id === alegere)) || ramase[0];
  /*
    ⚠ `pretOferta` e prețul PRODUSULUI ĂSTUIA prin ofertă. `pricing.price` e al
    primului produs, și cât timp oferta arată unul singur cele două sunt același
    număr. La cadoul la alegere nu mai sunt: acolo fiecare cadou are prețul lui.
  */
  const pret = p.pretOferta ?? o.pricing?.price ?? p.price;
  return {
    offerId: o.id,
    product: p,
    bucati: Math.max(1, Math.floor(Number(o.reguli?.primesti) || 1)),
    pret: Math.round(pret * 100) / 100,
    pretIntreg: Math.round(p.price * 100) / 100,
  };
}

/** Liniile aduse de toate ofertele bifate, în ordinea în care se arată. */
export function liniileAcceptate(
  oferte: readonly ResolvedOffer[],
  acceptate: ReadonlySet<string>,
  produseInComanda: ReadonlySet<string>,
  alegeri: Readonly<Record<string, string>> = {},
): LinieDeOferta[] {
  const out: LinieDeOferta[] = [];
  /*
    ⚠ Produsele deja luate de o ofertă de mai sus intră și ele în „ce e în
    comandă": două oferte care dau același cadou ar fi pus de două ori aceeași
    linie, iar serverul, care marchează liniile atinse (`atinse`), ar fi
    ieftinit-o o singură dată. Ecranul ar fi arătat două cadouri și factura unul.
  */
  const luate = new Set(produseInComanda);
  for (const o of oferte) {
    if (!acceptate.has(o.id)) continue;
    const linie = linieDeOferta(o, luate, alegeri[o.id]);
    if (!linie) continue;
    luate.add(linie.product.id);
    out.push(linie);
  }
  return out;
}

/** Cât adaugă la marfă liniile ofertelor bifate. */
export function subtotalulOfertelor(linii: readonly LinieDeOferta[]): number {
  return Math.round(linii.reduce((s, l) => s + l.pret * l.bucati, 0) * 100) / 100;
}
