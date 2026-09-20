/*
  ═══════════════════════════════════════════════════════════════════════════
  O SINGURA PERIOADA PENTRU TOATA PAGINA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA. Trei cifre una langa alta despre trei rastimpuri diferite:
  „Cosuri abandonate" era pe tot ce incapea intr-o citire de 90 de zile,
  „Rata de abandon" pe luna curenta, „Recuperate" tot pe luna curenta. Nimic
  nu spunea care pe ce, deci ele pareau ca se pot compara intre ele.

  ⚠ CEASUL E CEL ROMANESC. „Luna aceasta" socotita pe UTC incepe cu doua-trei
  ore mai tarziu, deci o comanda din noaptea de 1 ale lunii ar cadea in luna
  trecuta. Aceeasi hotarare ca peste tot in panou.
*/

export type NumePerioada = "7z" | "30z" | "90z" | "luna" | "tot";

export interface Perioada {
  nume: NumePerioada;
  eticheta: string;
  deLa: Date;
  panaLa: Date;
}

export const ETICHETE: Record<NumePerioada, string> = {
  "7z": "7 zile",
  "30z": "30 de zile",
  "90z": "90 de zile",
  luna: "Luna aceasta",
  tot: "De când există magazinul",
};

/** Ora Romaniei, oricare ar fi ceasul serverului. */
function acumInRomania(acum: Date): Date {
  return new Date(acum.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
}

/**
 * Fereastra cerută, cu capatul de sus mereu in viitorul apropiat.
 *
 * ⚠ `panaLa` e MAINE, nu `acum`: un cos scris cu o secunda in urma, pe un ceas
 * de baza de date care merge putin inainte, ar fi cazut in afara ferestrei.
 */
export function fereastra(nume: NumePerioada, acum: Date = new Date()): Perioada {
  const zi = 86_400_000;
  const panaLa = new Date(acum.getTime() + zi);
  const deLa = (() => {
    switch (nume) {
      case "7z": return new Date(acum.getTime() - 7 * zi);
      case "30z": return new Date(acum.getTime() - 30 * zi);
      case "90z": return new Date(acum.getTime() - 90 * zi);
      case "luna": {
        const ro = acumInRomania(acum);
        /*
          ⚠ Se construieste intai data locala romaneasca a zilei 1, apoi se
          scade decalajul fata de ceasul serverului: altfel un server pe UTC ar
          taia luna cu trei ore mai tarziu.
        */
        const inceputLocal = new Date(ro.getFullYear(), ro.getMonth(), 1, 0, 0, 0, 0);
        const decalaj = ro.getTime() - acum.getTime();
        return new Date(inceputLocal.getTime() - decalaj);
      }
      case "tot": return new Date(0);
    }
  })();
  return { nume, eticheta: ETICHETE[nume], deLa, panaLa };
}

export const PERIOADE: NumePerioada[] = ["7z", "30z", "90z", "luna", "tot"];

/** Cate randuri pe pagina se pot cere. */
export const PE_PAGINA = [25, 50] as const;
export type CatePePagina = (typeof PE_PAGINA)[number];

/**
 * Marginile cererii catre baza, pentru o pagina.
 *
 * ⚠ PostgREST cere `from`/`to` INCLUSIVE la amandoua capetele. Scris ca la
 * `slice`, fiecare pagina ar fi avut un rand in plus, iar ultimul rand al unei
 * pagini ar fi fost si primul celei urmatoare.
 */
export function marginile(pagina: number, pePagina: number): { de: number; la: number } {
  const p = Math.max(1, Math.floor(pagina));
  const de = (p - 1) * pePagina;
  return { de, la: de + pePagina - 1 };
}

/** Cate pagini ies din `total` randuri. Zero randuri inseamna tot o pagina. */
export function catePagini(total: number, pePagina: number): number {
  return Math.max(1, Math.ceil(total / pePagina));
}
