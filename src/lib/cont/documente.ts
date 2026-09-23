import type { TonEticheta } from "@/components/ui/eticheta-stare";

/**
 * Documentul fiscal al unei comenzi, asa cum il intoarce baza
 * (`privat.cont_documentul_comenzii`), citit defensiv.
 *
 * ⚠ Regula „care e documentul" (SmartBill, apoi Oblio, apoi fGO, sarind
 * documentele de TEST) sta NUMAI in baza. Aici doar se citeste ce a venit.
 */

export type CasaDeFacturare = "smartbill" | "oblio" | "fgo";

export type DocumentFiscal = {
  casa: CasaDeFacturare;
  serie: string | null;
  numar: string;
  stornata: boolean;
  stornoSerie: string | null;
  stornoNumar: string | null;
  stornoDescarcabil: boolean;
  /** Ziua emiterii (AAAA-LL-ZZ), NUMAI cand registrul o stie. */
  emisaLa: string | null;
};

const CASE = new Set<CasaDeFacturare>(["smartbill", "oblio", "fgo"]);

const sir = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function documentulFiscal(brut: unknown): DocumentFiscal | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const d = brut as Record<string, unknown>;
  const casa = sir(d.casa) as CasaDeFacturare | null;
  const numar = sir(d.numar);
  if (!casa || !CASE.has(casa) || !numar) return null;
  const stornoNumar = sir(d.storno_numar);
  return {
    casa,
    serie: sir(d.serie),
    numar,
    stornata: d.stornata === true,
    stornoSerie: sir(d.storno_serie),
    stornoNumar,
    stornoDescarcabil: d.storno_descarcabil === true && stornoNumar !== null,
    emisaLa: sir(d.emisa_la),
  };
}

/** „CLM 0248". */
export function numarulDocumentului(serie: string | null, numar: string | null): string {
  return [serie, numar].filter((x) => x && x.trim() !== "").join(" ");
}

export function stareaDocumentului(d: DocumentFiscal): { text: string; ton: TonEticheta } {
  return d.stornata ? { text: "Anulata prin stornare", ton: "neutru" } : { text: "Emisa", ton: "bun" };
}
