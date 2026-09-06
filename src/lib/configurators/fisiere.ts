/**
 * Fisierele pe care le incarca CUMPARATORUL: unde stau, ce se primeste, si ce se refuza.
 *
 * ═══ ⚠ CINE INCARCA E UN STRAIN, SI ASTA SCHIMBA TOT ═══
 *
 * Tot ce urca in platforma azi vine de la un comerciant autentificat: poza de produs, eticheta
 * AWB, factura. `user.id` intra in cheia din R2, iar cine a urcat raspunde de ce a urcat.
 *
 * Aici urca vizitatorul unui magazin. N-are cont, n-are sesiune, si nu-l cunoaste nimeni pana
 * cand — daca — plaseaza comanda. Deci nu exista „al cui e fisierul" la incarcare, si nici cineva
 * pe care sa dai vina daca umple depozitul. Toate hotararile de mai jos ies din asta.
 *
 * ═══ ⚠ ID-UL E CAPACITATEA ═══
 *
 * `FisierAles.id` e singurul lucru pe care cumparatorul il are ca sa-si vada inapoi propria poza,
 * si el sta in cosul din `localStorage`. Nu exista sesiune de care sa fie legat. Deci cine stie
 * id-ul poate citi fisierul — si de aceea id-ul e un `uuid` emis de server (122 de biti), nu un
 * numar de ordine.
 *
 * ⚠ Cheia din R2 e ALTCEVA decat id-ul, si dinadins. R2 se serveste public prin CDN cu `max-age`
 * de un an, deci daca cheia ar fi fost `configurator/<business>/<id>.jpg`, oricine afla un id ar
 * fi cerut obiectul DIRECT de pe CDN, ocolind orice ruta si orice antet. Cheia poarta o semnatura
 * HMAC din secretul serverului: din id nu se poate compune. Acelasi tipar ca la documentele de
 * transport (`lib/pallex/documente.ts`), si din acelasi motiv.
 *
 * ═══ ⚠ DE CE NU SE REFUZA DUPA DPI ═══
 *
 * Modelul avea `dpiMinim` si `dpiRecomandat`, si nu se pot onora cinstit. „DPI"-ul unui fisier e
 * un numar pe care fisierul il declara DESPRE SINE, si aproape toti mint: o poza de 4000 px facuta
 * cu telefonul se scrie „72 DPI" si e excelenta pentru tipar, iar o imagine de 200×200 marita in
 * Paint se poate scrie „300 DPI" si nu e buna de nimic. Un refuz pe numarul ala ar fi respins
 * tocmai fisierele bune si ar fi primit tocmai gunoiul.
 *
 * Ce se poate masura cinstit sunt PIXELII, si aia se cer: `minLatimePx` / `minInaltimePx`. Iar
 * ceea ce comerciantul voia de fapt sa spuna prin „300 DPI" se scrie cu `pixeliCeruti` — de la
 * cati centimetri se tipareste si la ce densitate, cati pixeli trebuie. Panoul i-o socoteste.
 */

import { createHmac } from "node:crypto";
import { toateNodurile, type Definitie, type NodFisiere } from "./definitie";
import type { Valori } from "./valori";

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFOANE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cat poate avea un fisier, oricat ar cere comerciantul.
 *
 * ⚠ Plafonul e AL NOSTRU, nu al lui. `maxMb` din nod poate sa fie mai mic; mai mare, nu conteaza.
 * Fara plafon, un comerciant care scrie 500 in camp deschide oricui o cale de a ne umple
 * depozitul cu jumatate de gigaoctet pe cerere. Acelasi numar sta si intr-un `check` din baza:
 * ruta nu e singurul drum care poate ajunge vreodata la tabel.
 */
export const MAX_OCTETI = 25 * 1024 * 1024;

/** Cate fisiere poate cere un singur camp, oricat ar scrie comerciantul. */
export const MAX_FISIERE_PE_NOD = 10;

/** Implicitul cand comerciantul nu scrie nimic: o poza, cel mult 10 MB. */
export const FISIERE_IMPLICIT = 1;
export const MB_IMPLICIT = 10;

/**
 * Tipurile primite, dupa OCTETI.
 *
 * ⚠ Lista e INCHISA, si nu contine SVG. Un SVG e un document XML care poate purta `<script>`, iar
 * servit de pe un domeniu al platformei ar fi rulat pe originea aceea. Aceeasi hotarare ca la
 * `uploadImage`, unde un fisier numit „poza.png" cu `type: "text/html"` ajungea servit ca HTML.
 *
 * ⚠ HEIC lipseste tot dinadins: il incarca telefoanele Apple, dar nu-l poate desena niciun
 * browser, deci cumparatorul ar fi urcat o poza pe care nu si-o mai poate vedea si comerciantul
 * n-ar fi putut-o deschide fara unealta.
 */
export const TIPURI_IMAGINE = ["image/jpeg", "image/png", "image/webp"] as const;

/** Documentele primite. PDF si atat: restul sunt formate care ruleaza cod la deschidere. */
export const TIPURI_DOCUMENT = ["application/pdf"] as const;

export function tipurilePermise(nod: NodFisiere): readonly string[] {
  const alePlatformei = nod.control === "document" ? TIPURI_DOCUMENT : TIPURI_IMAGINE;
  const aleLui = (nod.tipuri ?? []).filter((t) => typeof t === "string");
  if (!aleLui.length) return alePlatformei;
  /*
   * ⚠ SE INTERSECTEAZA, nu se inlocuiesc. Lista comerciantului poate doar sa STRANGA. Luata ca
   * atare, un `tipuri: ["image/svg+xml"]` scris de mana intr-o ciorna ar fi deschis exact usa pe
   * care lista de mai sus o inchide.
   */
  const permise = alePlatformei.filter((t) => aleLui.includes(t));
  return permise.length ? permise : alePlatformei;
}

/** Cate fisiere primeste campul, cu plafonul nostru peste. */
export function cateFisiere(nod: NodFisiere): number {
  const cerut = Number(nod.maxFisiere);
  if (!Number.isFinite(cerut) || cerut < 1) return FISIERE_IMPLICIT;
  return Math.min(Math.floor(cerut), MAX_FISIERE_PE_NOD);
}

/** Cat poate avea un fisier al campului, cu plafonul nostru peste. */
export function catePotOcupa(nod: NodFisiere): number {
  const cerut = Number(nod.maxMb);
  const mb = Number.isFinite(cerut) && cerut > 0 ? cerut : MB_IMPLICIT;
  return Math.min(Math.floor(mb * 1024 * 1024), MAX_OCTETI);
}

/* ═══════════════════════════════════════════════════════════════════════════
   UNDE STA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Secretul de semnare.
 *
 * Acelasi tipar ca la documentele de transport si la simbolurile de cotare: o variabila dedicata
 * daca exista, altfel cheia de service role, care oricum nu paraseste serverul.
 */
function secret(): string {
  return process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

const EXTENSII: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Extensia dupa tipul REAL, hotarat din octeti. Niciodata dupa numele dat de client. */
export function extensiaPentru(mime: string): string | null {
  return EXTENSII[mime] ?? null;
}

/**
 * Cheia din R2, deterministica si neghicibila.
 *
 * ⚠ Semnatura intra in NUMELE fisierului, nu intr-un parametru de adresa: un parametru s-ar
 * pierde la prima copiere a linkului, si atunci ar ramane doar cheia ghicibila.
 *
 * ⚠ Si `businessId`, si `id` intra in sirul semnat. Doar `id` ar fi fost de ajuns pentru
 * imprevizibilitate, dar atunci doua magazine ar fi putut ajunge la aceeasi cheie daca vreodata
 * id-ul se genereaza in alta parte — iar stergerea unuia l-ar fi luat pe al celuilalt.
 */
export function cheiaFisierului(businessId: string, id: string, mime: string): string | null {
  const ext = extensiaPentru(mime);
  if (!ext || !businessId || !id) return null;
  const semnatura = createHmac("sha256", secret())
    .update(`configurator|${businessId}|${id}`)
    .digest("hex")
    .slice(0, 24);
  return `configurator/${businessId}/${id}-${semnatura}.${ext}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE SE PRIMESTE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ce s-a masurat pe server despre un fisier. Imaginile au si dimensiuni. */
export interface FisierMasurat {
  mime: string;
  octeti: number;
  latime?: number | null;
  inaltime?: number | null;
}

/**
 * De ce nu se primeste fisierul, in romana, sau `null` cand se primeste.
 *
 * ⚠ ACEEASI FUNCTIE LA INCARCARE SI LA PLASAREA COMENZII. La incarcare ea spune cumparatorului
 * pe loc ce e in neregula. La plasare, aceeasi verificare se face DIN NOU, pe randul din baza:
 * cine cheama ruta poate sari peste prima si trimite de-a dreptul un id vechi, al altui camp, cu
 * alta marime. Doua verificari din acelasi cod nu pot ajunge sa nu mai spuna acelasi lucru.
 */
export function motivulRefuzului(nod: NodFisiere, f: FisierMasurat): string | null {
  const permise = tipurilePermise(nod);
  if (!permise.includes(f.mime)) {
    const nume = permise.map((t) => (extensiaPentru(t) ?? t).toUpperCase()).join(", ");
    return `Se pot incarca doar fisiere ${nume}.`;
  }

  const maxim = catePotOcupa(nod);
  if (!Number.isFinite(f.octeti) || f.octeti <= 0) return "Fisierul pare gol.";
  if (f.octeti > maxim) {
    return `Fisierul e prea mare. Limita e ${Math.floor(maxim / (1024 * 1024))} MB.`;
  }

  /*
   * ⚠ Dimensiunile se cer doar cand chiar s-au putut masura. Un PDF n-are latime in pixeli, si
   * un camp de documente cu `minLatimePx` scris din greseala ar fi refuzat ORICE fisier — pe
   * pagina cumparatorului, fara ca el sa poata face nimic.
   */
  const latime = Number(f.latime);
  const inaltime = Number(f.inaltime);
  if (Number.isFinite(latime) && Number.isFinite(inaltime) && latime > 0 && inaltime > 0) {
    const minL = Number(nod.minLatimePx);
    const minI = Number(nod.minInaltimePx);
    if (Number.isFinite(minL) && minL > 0 && latime < minL) {
      return `Imaginea e prea mica: are ${latime} px latime, si trebuie cel putin ${Math.floor(minL)} px.`;
    }
    if (Number.isFinite(minI) && minI > 0 && inaltime < minI) {
      return `Imaginea e prea mica: are ${inaltime} px inaltime, si trebuie cel putin ${Math.floor(minI)} px.`;
    }
  }

  return null;
}

/**
 * Cati pixeli trebuie ca sa iasa bine la tipar.
 *
 * ⚠ ASTA E CE VOIA SA SPUNA „300 DPI", scris in singura forma care se poate si masura, si onora.
 * Comerciantul stie doi din trei: de la cati centimetri se tipareste, si la ce densitate vrea.
 * Al treilea — cati pixeli — il socotim noi, si el e ce se verifica pe fisierul adevarat.
 *
 * Se intoarce `null` cand nu iese un numar bun, ca sa nu ajunga un `NaN` intr-un camp.
 */
export function pixeliCeruti(centimetri: number, dpi: number): number | null {
  if (!Number.isFinite(centimetri) || !Number.isFinite(dpi)) return null;
  if (centimetri <= 0 || dpi <= 0) return null;
  const px = Math.ceil((centimetri / 2.54) * dpi);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE CERE O CONFIGURATIE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un id de fisier, impreuna cu campul care l-a cerut. */
export interface FisierCerut {
  nodId: string;
  fisierId: string;
}

/**
 * Fiecare fisier la care trimite o configuratie, cu campul de unde vine.
 *
 * ⚠ CU NODUL, nu doar id-ul. Verificarea de la plasare compara fisierul cu limitele CAMPULUI
 * lui: fara sa se stie de la care vine, un fisier de 8 MB urcat intr-un camp care primeste 10 ar
 * fi trecut si intr-unul care primeste 2. Adica limita s-ar fi aplicat la incarcare si nicaieri
 * altundeva — iar incarcarea o poate ocoli oricine cheama ruta de mana.
 *
 * ⚠ Nu arunca niciodata: valorile vin de la client.
 */
export function fisiereleCerute(d: Definitie | undefined, valori: Valori | undefined): FisierCerut[] {
  const out: FisierCerut[] = [];
  if (!d || !valori) return out;
  for (const nod of toateNodurile(d)) {
    if (nod.fel !== "fisiere") continue;
    const v = valori[nod.id];
    if (!v || v.f !== "fisiere") continue;
    for (const f of v.v ?? []) {
      if (f && typeof f.id === "string" && f.id) out.push({ nodId: nod.id, fisierId: f.id });
    }
  }
  return out;
}

/** Nodurile de fisiere ale unei definitii, dupa id. */
export function nodurileDeFisiere(d: Definitie | undefined): Map<string, NodFisiere> {
  const out = new Map<string, NodFisiere>();
  for (const nod of toateNodurile(d ?? { versiuneSchema: 1, mod: "auto", pasi: [] })) {
    if (nod.fel === "fisiere") out.set(nod.id, nod);
  }
  return out;
}

/**
 * Fiecare id de fisier dintr-un instantaneu deja SCRIS pe comanda.
 *
 * ⚠ NU CERE DEFINITIA, si nici n-are nevoie. Ce ajunge in `orders.items[].configuratie.valori`
 * a trecut deja prin `doarCampurileCunoscute`: un `{ f: "fisiere" }` pus pe id-ul unui camp de
 * text a fost aruncat inca de la verificare. Deci aici e de ajuns forma.
 *
 * ⚠ Nu arunca pe nimic. Instantaneul poate fi scris de o versiune mai veche de cod, poate fi
 * atins dintr-o consola, si e citit pe drumul care leaga fisierele de comanda — unde o exceptie
 * ar fi insemnat o comanda platita cu pozele nelegate, deci maturate peste o saptamana.
 */
export function fisiereleDinInstantanee(items: unknown): string[] {
  const out = new Set<string>();
  if (!Array.isArray(items)) return [];
  for (const linie of items.slice(0, 200)) {
    const cfg = (linie as { configuratie?: unknown })?.configuratie;
    const valori = (cfg as { valori?: unknown })?.valori;
    if (!valori || typeof valori !== "object" || Array.isArray(valori)) continue;
    for (const v of Object.values(valori as Record<string, unknown>)) {
      const val = v as { f?: unknown; v?: unknown };
      if (val?.f !== "fisiere" || !Array.isArray(val.v)) continue;
      for (const f of val.v.slice(0, MAX_FISIERE_PE_NOD)) {
        const id = (f as { id?: unknown })?.id;
        if (typeof id === "string" && id) out.add(id);
      }
    }
  }
  return [...out];
}
