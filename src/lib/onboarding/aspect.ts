/*
 * Aspectul ales la inscriere (27.09.2026).
 *
 * ⚠ UN STIL E O PERECHE DE VARIANTE REALE (antet + subsol), nu un „tema" cu
 * fonturi. `StoreStyle` (fonturi, rotunjiri) exista in baza, dar magazinul
 * clasic aproape nu-l citeste: fonturile ajung doar in paginile de cont si in
 * meniul unor antete. Un pas care ar fi promis „alege fontul" ar fi promis ceva
 * ce magazinul nu face. Variantele de antet si de subsol,
 * in schimb, sunt exact componentele din galeria editorului de design.
 *
 * ⚠ Fisier PUR: il citesc si pagina (client), si `createBusiness` (server), care
 * NU are voie sa creada ce vine din browser fara sa treaca prin `stilDupaId`.
 */

export interface StilMagazin {
  id: string;
  nume: string;
  descriere: string;
  antet: "classic" | "centered" | "market" | "pills";
  subsol: "dark" | "columns" | "centered";
}

export const STILURI: readonly StilMagazin[] = [
  { id: "clasic", nume: "Clasic", descriere: "Simplu și aerisit, potrivit pentru orice", antet: "classic", subsol: "dark" },
  { id: "elegant", nume: "Elegant", descriere: "Pentru modă, bijuterii și cosmetice", antet: "centered", subsol: "centered" },
  { id: "catalog", nume: "Catalog mare", descriere: "Multe categorii, căutare la vedere", antet: "market", subsol: "columns" },
  { id: "jucaus", nume: "Modern", descriere: "Rotunjit, cu butoane colorate", antet: "pills", subsol: "columns" },
] as const;

export const STIL_IMPLICIT = STILURI[0];

export function stilDupaId(id: unknown): StilMagazin {
  return STILURI.find((s) => s.id === id) ?? STIL_IMPLICIT;
}

/* Culorile de pornire. Prima e a platformei, deci implicitul de azi al tuturor magazinelor. */
export const CULORI: readonly { hex: string; nume: string }[] = [
  { hex: "#07c527", nume: "Verde" },
  { hex: "#1E3A5F", nume: "Bleumarin" },
  { hex: "#0891B2", nume: "Turcoaz" },
  { hex: "#6D28D9", nume: "Violet" },
  { hex: "#E11D48", nume: "Roșu" },
  { hex: "#D97706", nume: "Chihlimbar" },
  { hex: "#8B1A1A", nume: "Vișiniu" },
  { hex: "#374151", nume: "Grafit" },
] as const;

export const CULOARE_IMPLICITA = CULORI[0].hex;

/** `#rrggbb`, altfel culoarea platformei. Se aplica si pe server: e text venit din browser. */
export function culoareValida(v: unknown): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : CULOARE_IMPLICITA;
}

/*
 * Telefonul, in forma pe care o scriu oamenii: `+40 722 123 456`, `0040722123456`,
 * `0722-123-456`. Pana azi trecea doar `07XXXXXXXX` scris lipit, iar un fix de
 * magazin (`021…`, `0264…`) era refuzat cu „Format invalid".
 */
export function normalizeazaTelefon(brut: string): string {
  let t = brut.replace(/[\s\-().]/g, "");
  if (t.startsWith("+40")) t = "0" + t.slice(3);
  else if (t.startsWith("0040")) t = "0" + t.slice(4);
  else if (/^40[237]\d{8}$/.test(t)) t = "0" + t.slice(2);
  return t;
}

export function telefonValid(t: string): boolean {
  return /^0[237]\d{8}$/.test(t);
}
