/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HONTRIO, PROMOVAT IN PANOU                                     (24.11.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hontrio e platforma-sora: creeaza si administreaza reclamele Google Shopping
 * ale unui magazin, din catalogul si din vanzarile lui. Se leaga de Edinio prin
 * conectorul din `src/lib/hontrio/` (OAuth cu PKCE, pornit DIN Hontrio).
 *
 * Aici sta doar PROMOVAREA: butonul „Promovează-ți magazinul" din bara de sus si
 * bannerul din capul paginii de Integrari. Conectorul nu se atinge de aici.
 *
 * ⚠ FISIER FARA `server-only`, DINADINS. Bara de sus e componenta de client, deci
 * adresele trebuie sa poata ajunge in pachetul browserului. `lib/hontrio/config.ts`
 * e `server-only` (tine secretul clientului), asa ca adresa site-ului a fost
 * mutata AICI si se citeste de aici peste tot: un singur loc care scrie domeniul.
 *
 * ⚠ ADRESELE SUNT MASURATE, nu presupuse (24.11.2026):
 *
 *   https://hontrio.com/...            -> 307 catre https://www.hontrio.com/...
 *   https://www.hontrio.com/register   -> 307 catre https://app.hontrio.com/register
 *   https://app.hontrio.com/register   -> 200
 *
 * Parametrii au supravietuit ambelor redirectari, dar fiecare redirectare e un
 * drum in plus si un loc unde se pot pierde (aceeasi lectie ca la Scapa de Stoc).
 * De aceea legaturile duc direct la capatul lantului.
 *
 * ⚠ NU SE POATE DESCHIDE INTR-UN CADRU, ca Scapa de Stoc. Raspunsul lor are
 * `X-Frame-Options: DENY` si `frame-ancestors 'none'`, iar conectarea trece prin
 * fereastra Google, care refuza oricum incadrarea. Deci: fila noua.
 */

/** Site-ul de prezentare. Pe `www`, unde raspunde fara redirectare. */
export const SITE_HONTRIO = "https://www.hontrio.com";

/** Aplicatia: aici se creeaza contul si se conecteaza magazinul. */
export const APLICATIA_HONTRIO = "https://app.hontrio.com";

export const NUMELE_HONTRIO = "Hontrio";

/** Eticheta butonului din bara de sus, ceruta de proprietar cu vorbele astea. */
export const INDEMN_HONTRIO = "Promovează-ți magazinul";

/** Ce face, cu vorbele de pe site-ul lor (inceputul paginii principale). */
export const CE_FACE_HONTRIO =
  "Hontrio transformă produsele magazinului tău în reclame Google Shopping și se ocupă de ele în fiecare zi.";

/**
 * De unde a plecat omul spre Hontrio. Ajunge in `utm_campaign`, ca in rapoartele
 * lor sa se vada care loc din panou aduce conturi: butonul din bara sau bannerul.
 *
 * ⚠ Valorile sunt chei de raport: schimbata una, vizitele vechi si cele noi apar
 * pe doua randuri diferite. Se adauga altele, nu se redenumesc acestea.
 */
export const LOCURI_PROMOVARE = ["bara-de-sus", "meniu-telefon", "banner-integrari"] as const;
export type LocPromovare = (typeof LOCURI_PROMOVARE)[number];

/** Parametrii de urmarire pusi pe fiecare legatura. */
export const URMARIREA_HONTRIO = { utm_source: "edinio", utm_medium: "panou" } as const;

function cuUrmarire(baza: string, loc: LocPromovare, ancora?: string): string {
  const u = new URL(baza);
  for (const [cheie, valoare] of Object.entries(URMARIREA_HONTRIO)) u.searchParams.set(cheie, valoare);
  u.searchParams.set("utm_campaign", loc);
  if (ancora) u.hash = ancora;
  return u.toString();
}

/** Pagina de prezentare; cu `ancora`, direct la o sectiune a ei (de pilda `how`). */
export function adresaPrezentareHontrio(loc: LocPromovare, ancora?: string): string {
  return cuUrmarire(`${SITE_HONTRIO}/`, loc, ancora);
}

/** Formularul de cont nou. */
export function adresaContNouHontrio(loc: LocPromovare): string {
  return cuUrmarire(`${APLICATIA_HONTRIO}/register`, loc);
}

/* ── Produsele magazinului, aratate ca reclame in banner ─────────────────── */

/** Cate produse intra in exemplul din banner. */
export const PRODUSE_IN_EXEMPLU = 3;

export interface ProdusDeExemplu {
  id: string;
  nume: string;
  pret: number;
  /** Pretul vechi, doar cand e mai mare decat cel curent (produs la reducere). */
  pretVechi: number | null;
  imagine: string;
}

/** Prima poza a produsului, daca e o adresa `http(s)`. `images` e `jsonb`: poate fi orice. */
export function primaImagine(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const prima = images[0];
  if (typeof prima !== "string") return null;
  const curata = prima.trim();
  return /^https?:\/\//i.test(curata) ? curata : null;
}

/**
 * Alege produsele pentru exemplul din banner, din randurile citite.
 *
 * ⚠ ORI TOATE TREI, ORI NIMIC. Un exemplu cu un singur produs arata ca o pagina
 * stricata, iar unul completat cu produse inventate n-ar mai fi „produsele tale".
 * Cand magazinul n-are trei produse cu poza si pret, bannerul ramane doar cu
 * textul.
 */
export function produseDeExemplu(
  randuri: ReadonlyArray<{
    id: string;
    name: string | null;
    price: number | null;
    compare_at_price?: number | null;
    images: unknown;
  }>,
): ProdusDeExemplu[] {
  const alese: ProdusDeExemplu[] = [];
  for (const r of randuri) {
    const imagine = primaImagine(r.images);
    const nume = (r.name ?? "").trim();
    const pret = Number(r.price);
    if (!imagine || !nume || !Number.isFinite(pret) || pret <= 0) continue;
    const vechi = Number(r.compare_at_price);
    alese.push({
      id: r.id,
      nume,
      pret,
      pretVechi: Number.isFinite(vechi) && vechi > pret ? vechi : null,
      imagine,
    });
    if (alese.length === PRODUSE_IN_EXEMPLU) return alese;
  }
  return [];
}

const FORMAT_PRET = new Intl.NumberFormat("ro-RO", {
  style: "currency",
  currency: "RON",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Pretul, cum il scrie Google in reclamele de cumparaturi din Romania: „189,00 RON".
 *
 * ⚠ NU `formatPrice` al casei („189 lei"): cardul e o reproducere a celui din
 * Google, iar acolo moneda e codul ei, cu doua zecimale.
 */
export function pretCaInGoogle(valoare: number): string {
  /* `Intl` pune un spatiu NEDESPARTITOR intre suma si moneda; se pastreaza, ca pretul sa nu se rupa pe doua randuri. */
  return FORMAT_PRET.format(valoare);
}
