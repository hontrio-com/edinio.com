/**
 * Salvarea amanata a ciornei de design, cu o singura scriere pe drum (25.10.2026).
 *
 * Doua lucruri pe care temporizatorul simplu din `useCiornaDesign` nu le facea:
 *
 * 1. **Scrierile nu se mai intrec.** Baza garzii de concurenta (`draft-guard.ts`) se lua cand se
 *    PROGRAMA salvarea. O modificare facuta cat salvarea de dinainte era inca pe drum pleca deci cu
 *    baza veche, iar garda o respingea ca „modificat in alta fila”. Aici scrierea urmatoare asteapta
 *    raspunsul celei de dinainte, iar `scrie` isi citeste baza abia cand ii vine randul.
 * 2. **Iesirea nu mai pierde ultima modificare.** La plecarea din editor temporizatorul se stergea,
 *    deci o modificare facuta cu mai putin de o secunda inainte nu mai ajungea in baza. `goleste`
 *    porneste pe loc salvarea programata si asteapta tot ce e pe drum.
 */

export interface CoadaSalvarii<T> {
  /** Salvarea lui `valoare` peste `intarziere` ms; o programare noua o inlocuieste pe cea veche. */
  programeaza(valoare: T): void;
  /**
   * Porneste ACUM salvarea programata, daca exista, si asteapta tot ce e pe drum.
   * `true` = nu mai e nimic de scris; `false` = ultima scriere a cazut.
   */
  goleste(): Promise<boolean>;
  /** Uita salvarea programata (Publica, Renunta); ce e deja pe drum isi termina drumul. */
  anuleaza(): void;
}

/** Ceasul, ca probele sa nu astepte secunde adevarate. */
export interface Ceas {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const CEAS_REAL: Ceas = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function creeazaCoadaSalvarii<T>({ intarziere, scrie, ceas = CEAS_REAL }: {
  intarziere: number;
  /**
   * Scrierea propriu-zisa: `true` la reusita. Nu se cheama niciodata doua deodata, deci tot ce
   * citeste (baza, epoca) e starea de dupa scrierea de dinainte.
   */
  scrie: (valoare: T) => Promise<boolean>;
  ceas?: Ceas;
}): CoadaSalvarii<T> {
  let programata: { id: unknown; valoare: T } | null = null;
  let peDrum: Promise<boolean> = Promise.resolve(true);

  function porneste(valoare: T): Promise<boolean> {
    // `peDrum` nu respinge niciodata: o scriere cazuta (sau aruncata) nu opreste coada.
    peDrum = peDrum.then(() => scrie(valoare)).catch(() => false);
    return peDrum;
  }

  return {
    programeaza(valoare) {
      if (programata) ceas.clearTimeout(programata.id);
      const id = ceas.setTimeout(() => {
        programata = null;
        void porneste(valoare);
      }, intarziere);
      programata = { id, valoare };
    },
    goleste() {
      if (!programata) return peDrum;
      ceas.clearTimeout(programata.id);
      const { valoare } = programata;
      programata = null;
      return porneste(valoare);
    },
    anuleaza() {
      if (programata) ceas.clearTimeout(programata.id);
      programata = null;
    },
  };
}
