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
 *
 * 3. **O scriere cazuta nu se mai uita (19.11.2026, auditul editorului).** Pana atunci, dupa o cadere
 *    coada ramanea goala: nimic programat, nimic de reincercat. Ciorna de pe ecran nu mai ajungea in
 *    baza pana la urmatoarea modificare, iar „Ieși” primea `false` de la `goleste` la nesfarsit, fara
 *    sa mai incerce ceva (butonul parea mort). Acum valoarea cazuta se tine minte: se reincearca
 *    singura, tot mai rar (`reincercari`), la `reincearca()` (revenirea legaturii) si la `goleste()`.
 *    O valoare mai noua o inlocuieste: fiecare valoare e ciorna INTREAGA, deci cea veche nu mai are rost.
 */

/**
 * Ce spune o scriere: `true` = e in baza (sau nu mai era nimic de scris); `false` = a cazut pe drum
 * (legatura, serverul), deci se reincearca singura; `"refuzat"` = serverul a raspuns si a spus nu
 * (alta fila a scris intre timp, plafonul de marime), deci aceeasi cerere ar primi acelasi raspuns:
 * se reincearca doar la cerere (`goleste`, `reincearca`).
 */
export type RezultatScriere = boolean | "refuzat";

export interface CoadaSalvarii<T> {
  /** Salvarea lui `valoare` peste `intarziere` ms; o programare noua o inlocuieste pe cea veche. */
  programeaza(valoare: T): void;
  /**
   * Porneste ACUM salvarea programata (sau reincearca scrierea cazuta), daca exista, si asteapta tot
   * ce e pe drum. `true` = nu mai e nimic de scris; `false` = ultima scriere a cazut.
   */
  goleste(): Promise<boolean>;
  /** Uita salvarea programata si pe cea cazuta (Publica, Renunta); ce e deja pe drum isi termina drumul. */
  anuleaza(): void;
  /** Reincearca ACUM scrierea cazuta, daca exista una si nimic mai nou nu e programat. */
  reincearca(): void;
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

/** Dupa cat se reincearca singura o scriere cazuta: tot mai rar, apoi la fiecare minut cat editorul e deschis. */
export const REINCERCARI_SALVARE: readonly number[] = [4_000, 10_000, 30_000, 60_000];

export function creeazaCoadaSalvarii<T>({ intarziere, scrie, ceas = CEAS_REAL, reincercari = REINCERCARI_SALVARE }: {
  intarziere: number;
  /**
   * Scrierea propriu-zisa (`RezultatScriere`). Nu se cheama niciodata doua deodata, deci tot ce
   * citeste (baza, epoca) e starea de dupa scrierea de dinainte.
   */
  scrie: (valoare: T) => Promise<RezultatScriere>;
  ceas?: Ceas;
  reincercari?: readonly number[];
}): CoadaSalvarii<T> {
  let programata: { id: unknown; valoare: T } | null = null;
  let peDrum: Promise<boolean> = Promise.resolve(true);
  /** Scrierea cazuta care asteapta o noua incercare; `id` e temporizatorul ei, `null` cand nu se reincearca singura. */
  let cazuta: { valoare: T; incercari: number; id: unknown } | null = null;
  /** A cata scriere a pornit: o cadere se tine minte doar daca dupa ea n-a mai pornit alta. */
  let pornite = 0;

  function uitaCazuta(): void {
    if (cazuta && cazuta.id !== null) ceas.clearTimeout(cazuta.id);
    cazuta = null;
  }

  function porneste(valoare: T, incercari = 0): Promise<boolean> {
    const numar = ++pornite;
    // `peDrum` nu respinge niciodata: o scriere cazuta (sau aruncata) nu opreste coada.
    peDrum = peDrum
      .then(() => scrie(valoare))
      .catch((): RezultatScriere => false)
      .then((rezultat) => {
        if (rezultat === true) return true;
        // O valoare mai noua e deja programata sau pe drum: ea duce ciorna intreaga, asta nu mai trebuie.
        if (programata || numar !== pornite) return false;
        uitaCazuta();
        const peste = rezultat === "refuzat" || reincercari.length === 0
          ? null
          : reincercari[Math.min(incercari, reincercari.length - 1)];
        cazuta = {
          valoare,
          incercari: incercari + 1,
          id: peste === null ? null : ceas.setTimeout(() => {
            const deReluat = cazuta;
            if (!deReluat) return;
            cazuta = null;
            void porneste(deReluat.valoare, deReluat.incercari);
          }, peste),
        };
        return false;
      });
    return peDrum;
  }

  return {
    programeaza(valoare) {
      if (programata) ceas.clearTimeout(programata.id);
      uitaCazuta();
      const id = ceas.setTimeout(() => {
        programata = null;
        void porneste(valoare);
      }, intarziere);
      programata = { id, valoare };
    },
    goleste() {
      if (programata) {
        ceas.clearTimeout(programata.id);
        const { valoare } = programata;
        programata = null;
        return porneste(valoare);
      }
      if (cazuta) {
        const deReluat = cazuta;
        uitaCazuta();
        return porneste(deReluat.valoare, deReluat.incercari);
      }
      return peDrum;
    },
    anuleaza() {
      if (programata) ceas.clearTimeout(programata.id);
      programata = null;
      uitaCazuta();
      // Ce a cazut inainte nu mai conteaza: „Publică” / „Renunță” au inlocuit ciorna cu totul. Fara randul asta, o
      // cadere veche facea `goleste` sa raspunda `false` si dupa ele, desi nu mai era nimic de scris.
      peDrum = peDrum.then(() => true);
    },
    reincearca() {
      if (programata || !cazuta) return;
      const deReluat = cazuta;
      uitaCazuta();
      // De la capat cu rarirea: cineva a cerut-o anume (legatura a revenit, omul a apasat).
      void porneste(deReluat.valoare, 0);
    },
  };
}
