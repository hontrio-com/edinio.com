import { curierulEtichetei, FARA_EXPEDIERE, NUMELE_CURIERULUI, type CurierEticheta } from "./etichete-lot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADUNAREA ETICHETELOR UNUI LOT, INTR-UN SINGUR DOCUMENT        (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ AICI NU SE CHEAMA NICI CURIERUL, NICI BIBLIOTECA DE PDF. Amandoua vin ca
 * parametri, si nu din cochetarie: altfel regula („ce se sare, in ce ordine ies
 * paginile, ce se intampla cand cade una") s-ar fi putut proba numai mimand
 * saisprezece API-uri, adica deloc. Asa proba loveste chiar regula.
 */

export type OcteteSauMotiv =
  | { ok: true; octeti: Uint8Array }
  | { ok: false; motiv: string };

export interface ComandaDeAdunat {
  id: string;
  order_number: string;
  /** Randul comenzii, cu coloanele de expediere. */
  rand: Record<string, unknown>;
}

export interface RezultatAdunare {
  /** Documentul lipit, sau `null` cand n-a intrat nicio eticheta in el. */
  pdf: Uint8Array | null;
  /** Numerele comenzilor care au intrat, IN ORDINEA SELECTIEI. */
  incluse: string[];
  sarite: { comanda: string; motiv: string }[];
  /** Lotul s-a oprit la termen: comenzile ramase n-au fost nici macar incercate. */
  oprit: boolean;
}

/**
 * ⚠ CAT DUREAZA, si de ce termenul e mai strans decat pare.
 *
 * Ruta are `maxDuration = 300`. Aducerea unei etichete e o CITIRE la curier, mult
 * mai scurta decat o emitere, dar GLS si eColet pot trece si pe la CDN si pe la
 * furnizor. Bazinul nu intrerupe o aducere pornita (ar lasa un apel in aer), deci
 * marja trebuie sa acopere cel mai lung apel plus lipirea documentului.
 *
 * Aceeasi socoteala ca la `BUGET_LOT_MS` din `bulk-orders.actions.ts`, unde o marja
 * gresita a lasat functia sa fie taiata fara sa intoarca nimic.
 */
export const BUGET_ETICHETE_MS = 220_000;

/** Cate etichete se cer deodata. Sunt citiri, dar tot lovesc pragul de rata al curierului. */
export const ETICHETE_DEODATA = 4;

export async function adunaEtichete(
  comenzi: ComandaDeAdunat[],
  aduOcteti: (comanda: ComandaDeAdunat, curier: CurierEticheta) => Promise<OcteteSauMotiv>,
  lipeste: (documente: Uint8Array[]) => Promise<Uint8Array>,
  optiuni?: { concurenta?: number; termenMs?: number; acum?: () => number },
): Promise<RezultatAdunare> {
  const concurenta = optiuni?.concurenta ?? ETICHETE_DEODATA;
  const acum = optiuni?.acum ?? Date.now;
  const termen = acum() + (optiuni?.termenMs ?? BUGET_ETICHETE_MS);

  /*
   * ⚠ REZULTATELE SE ASAZA PE POZITIE, nu in ordinea in care se intorc.
   *
   * Aducerile merg in paralel, deci cea de-a zecea comanda poate raspunde prima.
   * Puse in ordinea sosirii, paginile ar fi iesit amestecate — iar comerciantul
   * lipeste eticheta de pe pagina N pe coletul N. Doua colete schimbate intre ele
   * inseamna doua livrari gresite, si se afla abia de la clienti.
   */
  const adunate: (Uint8Array | null)[] = new Array(comenzi.length).fill(null);
  const sarite: { comanda: string; motiv: string }[] = [];
  let atinse = 0;

  let cursor = 0;
  const lucratori = Array.from({ length: Math.min(concurenta, comenzi.length) }, async () => {
    while (cursor < comenzi.length) {
      /* ⚠ Nu se intrerupe o aducere pornita; se opreste doar PORNIREA alteia. */
      if (acum() >= termen) return;
      const i = cursor++;
      const c = comenzi[i];
      atinse++;

      const curier = curierulEtichetei(c.rand);
      if (!curier) {
        sarite.push({ comanda: c.order_number, motiv: FARA_EXPEDIERE });
        continue;
      }
      try {
        const r = await aduOcteti(c, curier);
        if (r.ok) adunate[i] = r.octeti;
        else sarite.push({ comanda: c.order_number, motiv: r.motiv });
      } catch (e) {
        /*
         * ⚠ O ETICHETA CAZUTA NU DOBOARA LOTUL. Altfel un singur curier picat ar fi
         * lasat comerciantul fara NICIUNA dintre celelalte saptesprezece, si tot el
         * ar fi trebuit sa ghiceasca de la care a pornit.
         */
        sarite.push({
          comanda: c.order_number,
          motiv: `${NUMELE_CURIERULUI[curier]}: ${(e as Error).message}`,
        });
      }
    }
  });
  await Promise.all(lucratori);

  const incluse: string[] = [];
  const documente: Uint8Array[] = [];
  for (let i = 0; i < comenzi.length; i++) {
    const d = adunate[i];
    if (d) { documente.push(d); incluse.push(comenzi[i].order_number); }
  }

  return {
    pdf: documente.length > 0 ? await lipeste(documente) : null,
    incluse,
    sarite,
    /*
     * ⚠ Se DEDUCE din numere, nu se cara printr-un steag pus pe un drum de iesire:
     * asa nu poate ramane nesetat. Aceeasi forma ca `oprit` din `BulkResult`.
     */
    oprit: atinse < comenzi.length,
  };
}
