import { JUDETE } from "@/lib/ro/judete";
import { normalizeCountyName } from "@/lib/utils/ro-address";

/**
 * Regulile profilului, fara nimic de server: le folosesc si ruta, si formularul,
 * ca omul sa vada aceeasi greseala inainte si dupa trimitere.
 *
 * ⚠ Plafoanele sunt si in baza (`cont_profil_salveaza`, constrangerile de pe
 * `cont_cumparator`); aici e numai ce poate spune ecranul pe loc.
 */

export type AdresaProfil = {
  judet: string;
  localitate: string;
  adresa: string;
  codPostal: string;
};

export type ProfilCont = {
  nume: string;
  telefon: string;
  adresa: AdresaProfil;
  /** Momentul ultimei schimbari a pozei, sau null cand nu are poza. Intra in adresa pozei, ca browserul sa n-o tina minte pe cea veche. */
  pozaLa: string | null;
};

export const ADRESA_GOALA: AdresaProfil = { judet: "", localitate: "", adresa: "", codPostal: "" };

export const LIMITE_PROFIL = { nume: 120, telefon: 20, localitate: 80, adresa: 200, codPostal: 10 } as const;

/**
 * Poza care ajunge la server. ⚠ Vercel refuza orice cerere peste 4,5 MB inainte sa ajunga
 * la ruta, deci browserul micsoreaza intai pozele mari (`micsoreazaPoza`), iar plafonul
 * de aici sta sub limita aceea.
 */
export const POZA_MAX_OCTETI = 4 * 1024 * 1024;
export const POZA_TIPURI = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"] as const;

const doarText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type ProfilTrimis = {
  nume: string;
  telefon: string;
  judet: string;
  localitate: string;
  adresa: string;
  codPostal: string;
};

/** Curata ce vine din formular (sau din orice alta parte) la forma pe care o salveaza baza. */
export function curataProfilul(corp: unknown): ProfilTrimis {
  const o = (corp && typeof corp === "object" ? corp : {}) as Record<string, unknown>;
  return {
    nume: doarText(o.nume, LIMITE_PROFIL.nume).replace(/\s+/g, " "),
    telefon: doarText(o.telefon, LIMITE_PROFIL.telefon),
    judet: doarText(o.judet, 60),
    localitate: doarText(o.localitate, LIMITE_PROFIL.localitate),
    adresa: doarText(o.adresa, LIMITE_PROFIL.adresa),
    codPostal: doarText(o.codPostal, LIMITE_PROFIL.codPostal),
  };
}

export type GreseliProfil = Partial<Record<keyof ProfilTrimis, string>>;

/**
 * Greselile, camp cu camp. Adresa e facultativa, dar daca omul a inceput-o, o
 * cerem intreaga (judet, localitate, strada): o adresa pe jumatate n-ar ajuta la
 * comanda, doar ar incurca formularul.
 */
export function greseliProfil(p: ProfilTrimis): GreseliProfil {
  const g: GreseliProfil = {};
  if (!p.nume) g.nume = "Scrie numele tau.";
  if (p.telefon) {
    const cifre = p.telefon.replace(/\D/g, "").length;
    if (!/^[+0-9 ().-]+$/.test(p.telefon) || cifre < 9 || cifre > 15) g.telefon = "Numarul de telefon nu pare corect.";
  }
  const aInceputAdresa = Boolean(p.judet || p.localitate || p.adresa || p.codPostal);
  if (aInceputAdresa) {
    if (!p.judet) g.judet = "Alege judetul.";
    else if (!(JUDETE as readonly string[]).includes(p.judet)) g.judet = "Alege judetul din lista.";
    if (!p.localitate) g.localitate = eBucuresti(p.judet) ? "Alege sectorul." : "Scrie localitatea.";
    if (!p.adresa) g.adresa = "Scrie strada si numarul.";
  }
  if (p.codPostal && !/^[0-9]{6}$/.test(p.codPostal)) g.codPostal = "Codul postal are 6 cifre.";
  return g;
}

/** Bucurestiul se alege pe sectoare, ca la comanda (acolo curierii cer „Sector N”). */
export function eBucuresti(judet: string): boolean {
  return normalizeCountyName(judet || "").toLowerCase() === "bucuresti";
}

/** Adresa salvata (jsonb din baza) la forma formularului. Orice camp lipsa devine gol. */
export function adresaDinBaza(v: unknown): AdresaProfil {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const t = (x: unknown) => (typeof x === "string" ? x : "");
  return { judet: t(o.judet), localitate: t(o.localitate), adresa: t(o.adresa), codPostal: t(o.cod_postal) };
}

/** Initialele din nume, pentru cercul din locul pozei. */
export function initialeDinNume(nume: string | null | undefined): string {
  const parti = (nume ?? "").trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return "";
  return (parti[0][0] + (parti.length > 1 ? parti[parti.length - 1][0] : "")).toUpperCase();
}
