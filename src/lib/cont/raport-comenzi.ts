import { createAdminClient } from "@/lib/supabase/admin";
import { liniaAdresei, type AdresaLivrare } from "@/lib/orders/adresa";
import type { CelulaExport, TabelExport } from "@/lib/orders/export-comenzi";
import { argumenteleCautarii, type FiltreComenzi } from "./cautare-comenzi";
import { stareaComenzii } from "./stare-comanda";

/**
 * Raportul de comenzi din contul clientului (cerut de un magazin, 23.11.2026).
 *
 * Clientii cu cont ai magazinului comanda pentru alte persoane (revanzatori), iar la sfarsit
 * de perioada isi fac socoteala: ce au comandat, pentru cine, cu ce AWB si in ce stare. Lista
 * din „Comenzile mele” e paginata si nu se poate duce in Excel; raportul da TOATE comenzile
 * filtrului de pe ecran (cautare, stare, perioada), intr-un singur fisier.
 *
 * ⚠ ACELEASI FILTRE ca lista: pleaca prin `argumenteleCautarii`, iar baza le aplica in
 * `cont_raportul_comenzilor` cu acelasi bloc de conditii ca `cont_comenzile_mele` (o proba
 * tine cele doua blocuri identice). Altfel raportul ar fi putut spune altceva decat ecranul.
 *
 * ⚠ POARTA VEDERII e in baza: la o comanda cu vederea „redusa”, destinatarul, telefonul,
 * adresa si AWB-ul vin NULL. Aici nu se mai hotaraste nimic.
 */

/** Plafonul unui raport. Peste el, fisierul spune ca a fost taiat. */
export const RAPORT_MAX = 2000;

export type RandRaport = {
  numar: string;
  creataLa: string;
  stare: string;
  incasata: boolean;
  total: number;
  destinatar: string | null;
  telefon: string | null;
  adresa: AdresaRaport | null;
  awburi: string | null;
  produse: string | null;
  bucati: number;
};

type AdresaRaport = AdresaLivrare & { city?: string; county?: string; postal_code?: string; postalCode?: string };

export async function raportulComenzilor(
  businessId: string,
  contId: string,
  filtre: FiltreComenzi,
): Promise<{ randuri: RandRaport[]; total: number }> {
  const { data, error } = await createAdminClient().rpc("cont_raportul_comenzilor", {
    p_business: businessId,
    p_cont: contId,
    p_limita: RAPORT_MAX,
    ...argumenteleCautarii(filtre, new Date()),
  });
  if (error) throw error;
  const brute = data ?? [];
  return {
    randuri: brute.map((r) => ({
      numar: r.numar,
      creataLa: r.creata_la,
      stare: r.stare,
      incasata: r.incasata === true,
      total: Number(r.total),
      destinatar: r.destinatar ?? null,
      telefon: r.telefon ?? null,
      adresa: r.adresa_livrare && typeof r.adresa_livrare === "object" && !Array.isArray(r.adresa_livrare)
        ? (r.adresa_livrare as AdresaRaport)
        : null,
      awburi: r.awburi ?? null,
      produse: r.produse ?? null,
      bucati: Number(r.bucati ?? 0),
    })),
    /* Totalul gasit de baza, pe acelasi rand cu comenzile: spune daca plafonul a taiat. */
    total: brute.length > 0 ? Number(brute[0].total_randuri) : 0,
  };
}

/* Tabelul are forma exportului din panou (`TabelExport`), ca foaia sa o faca aceeasi functie
   (`foaiaExportului`): totalul ramane numar, data ramane data, la ora Romaniei. */

/* ⚠ Fara diacritice: e text de vitrina (ecranele contului nu le poarta). */
const COLOANE: [string, number][] = [
  ["Comanda", 12], ["Data", 18], ["Stare", 14], ["Incasata", 10], ["Total", 10],
  ["Destinatar", 24], ["Telefon", 14], ["Adresa", 36], ["Localitate", 16], ["Judet", 14], ["Cod postal", 10],
  ["AWB", 26], ["Bucati", 8], ["Produse", 60],
];

function sir(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

/** Tabelul raportului. ⚠ Functie PURA: ce iese aici se proba; fisierul il face ruta. */
export function tabelulRaportului(randuri: RandRaport[]): TabelExport {
  return {
    antete: COLOANE.map(([a]) => a),
    latimi: COLOANE.map(([, l]) => l),
    randuri: randuri.map((r): CelulaExport[] => {
      const a = r.adresa;
      return [
        r.numar,
        r.creataLa ? { data: r.creataLa } : null,
        stareaComenzii(r.stare).label,
        r.incasata ? "Da" : "Nu",
        Number.isFinite(r.total) ? r.total : null,
        sir(r.destinatar),
        sir(r.telefon),
        a ? sir(liniaAdresei(a)) : null,
        a ? sir(a.city) : null,
        a ? sir(a.county) : null,
        a ? sir(a.postal_code) ?? sir(a.postalCode) : null,
        sir(r.awburi),
        r.bucati,
        sir(r.produse),
      ];
    }),
  };
}

/** Numele fisierului, cu perioada cand a fost ceruta pe zile. */
export function numeleRaportului(slug: string, filtre: FiltreComenzi, azi: string): string {
  const perioada = filtre.deLa || filtre.panaLa
    ? `${filtre.deLa || "inceput"}_${filtre.panaLa || azi}`
    : azi;
  return `comenzi-${slug}-${perioada}.xlsx`;
}
