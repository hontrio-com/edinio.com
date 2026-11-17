import "server-only";
import { adresaCapturii, CAPTURI_TEME } from "@/lib/teme/capturi-teme";
import { adresaCapturiiTelefon, CAPTURI_TELEFON } from "@/lib/teme/capturi-telefon";
import { adresaDemo, TEME } from "@/lib/teme/teme";

/*
 * Temele, pe scurt (16.11.2026): ce arata despre o tema pasul „Aspect” al inscrierii si pagina „/teme” a site-ului de
 * prezentare. O singura lista pentru amandoua, ca o tema noua sa apara deodata in ambele locuri.
 *
 * ⚠ DOAR PE SERVER. `TEME` poarta designurile si datele demo ale tuturor celor 30 de teme: importata intr-o componenta
 * client, ar fi intrat intreaga in pachetul paginii. Paginile (componente de server) fac lista asta mica si o dau
 * componentelor client, care o importa doar ca TIP.
 */

export interface TemaPeScurt {
  cheie: string;
  nume: string;
  /** Pentru cine e tema, scurt: descrierea pana la primele doua puncte („Pentru magazine de modă”). */
  pentru: string;
  descriere: string;
  /** Culoarea principala a temei (la inscriere, culoarea magazinului sare pe ea cand omul alege tema). */
  culoare: string;
  captura: { adresa: string; latime: number; inaltime: number } | null;
  /** Primul ecran pe telefon (`scripts/teme/capturi-telefon.mjs`), pentru telefonul din cardurile paginii „/teme”. */
  telefon: { adresa: string; latime: number; inaltime: number } | null;
  /** „Vezi demo”: subdomeniul temei (`adresaDemo`, ca in pagina „Teme” din panou). */
  adresaDemo: string;
  /** Cat aduce „Importă și datele demo”, ca textul bifei sa spuna. */
  demo: { produse: number; bannere: number; randuri: number };
}

/** „Pentru magazine de modă: alb-negru, ...” -> „Pentru magazine de modă”. Fara doua puncte, descrierea intreaga. */
export function pentruCine(descriere: string): string {
  const i = descriere.indexOf(":");
  return (i > 0 ? descriere.slice(0, i) : descriere).trim();
}

/** Toate temele, in ordinea din `TEME` (a lui). `host` = gazda paginii, pentru „Vezi demo” (`adresaDemo`). */
export function temelePeScurt(host: string | null | undefined): TemaPeScurt[] {
  return TEME.map((t) => ({
    cheie: t.cheie,
    nume: t.nume,
    pentru: pentruCine(t.descriere),
    descriere: t.descriere,
    culoare: t.identitate.culoare,
    captura: CAPTURI_TEME[t.cheie] ? { adresa: adresaCapturii(t.cheie), ...CAPTURI_TEME[t.cheie] } : null,
    telefon: CAPTURI_TELEFON[t.cheie] ? { adresa: adresaCapturiiTelefon(t.cheie), ...CAPTURI_TELEFON[t.cheie] } : null,
    adresaDemo: adresaDemo(t, host),
    demo: { produse: t.date.produse.length, bannere: t.date.bannere.length, randuri: t.date.randuri.length },
  }));
}
