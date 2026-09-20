/*
  Cate zile mai sunt pana la o data din abonament.

  ⚠ CEASUL SE CITESTE O SINGURA DATA, PE SERVER, si numarul se trimite mai
  departe ca prop.

  Benzile de cont il citeau fiecare in randare (`Date.now()` in corpul
  componentei). Doua neajunsuri, amandoua tacute:

  1. `GracePeriodBanner` e componenta de client. Serverul randa cu ceasul lui,
     browserul cu al vizitatorului, iar la miezul noptii sau pe un calculator cu
     ora gresita cele doua texte nu mai coincideau: exact ce reclama React la
     hidratare.
  2. Regula de lint a proiectului („Cannot call impure function during render")
     le semnala de mult, si erau doua dintre erorile vechi ale depozitului.

  Aici ora e argument, cu o valoare implicita, deci socoteala se poate proba
  pentru orice clipa.
*/

/** Zile intregi pana la `iso`. Negativ sau zero daca data a trecut. */
export function zileRamase(iso: string | null | undefined, acum: number = Date.now()): number {
  if (!iso) return 0;
  const tinta = new Date(iso).getTime();
  if (Number.isNaN(tinta)) return 0;
  /*
    ⚠ Se rotunjeste IN SUS: cat timp mai e un ceas pana la expirare, omului i se
    spune „o zi", nu „zero zile". Rotunjit in jos, ultima zi de testare ar fi
    aratat ca si cum ar fi trecut deja.
  */
  return Math.ceil((tinta - acum) / 86400000);
}
