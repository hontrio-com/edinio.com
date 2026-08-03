/**
 * Cand se taie pretul vechi.
 *
 * Un pret taiat e o promisiune: „inainte costa mai mult". Conditia care o tine e
 * intotdeauna aceeasi — pretul vechi trebuie sa fie STRICT peste pretul pe care
 * clientul il vede acum. Doar ca regula era scrisa de mana in fiecare loc care
 * afiseaza un pret, si in trei dintre ele s-a scris doar „exista o valoare".
 *
 * Masurat pe 2026-08-03 in productie: 12 produse din 251 cu `compare_at_price`
 * completat il au sub sau egal cu pretul curent. Cel mai vizibil, „Jordan negru
 * alb" de la magazinul-online: 200 lei taiat cu 150 lei, adica o „reducere" care
 * e de fapt o scumpire de 50 de lei. Iar „structuri metalice" de la sibiu are 1,00
 * taiat cu 1,00. Pe cardul din magazin nu se vede nimic din toate astea, fiindca
 * acolo comparatia exista; in lista de produse din panou se vedea, deci
 * comerciantul si magazinul lui spuneau lucruri diferite despre acelasi produs.
 *
 * Comparatia se face cu pretul de LANGA care se afiseaza taiat — in lista din
 * panou, acela e `products.price`, si tot el se paseaza aici. Nu confunda cu
 * cardul din magazin: acolo se afiseaza minimul vandabil (constatarea 17), deci
 * un produs variabil cu baza 175 si toate marimile la 203 arata 203, si daca
 * vreodata se randeaza taiat si acolo, apelantul trebuie sa trimita minimul, nu
 * baza. Ajutorul nu ghiceste: compara ce i se da.
 */

/**
 * Pretul vechi de afisat taiat, sau `null` cand nu e nimic de taiat.
 *
 * Ambele argumente sunt OBLIGATORII si al doilea e pretul AFISAT tocmai ca sa nu
 * poata fi uitat: o semnatura cu un singur argument ar fi lasat pe fiecare apelant
 * sa decida daca mai face si comparatia, si exact asta a produs cele 12 cazuri.
 */
export function pretVechiDeTaiat(compareAt: unknown, pretAfisat: unknown): number | null {
  if (compareAt == null || compareAt === "") return null;
  const vechi = Number(compareAt);
  const acum = Number(pretAfisat);
  if (!Number.isFinite(vechi) || !Number.isFinite(acum)) return null;
  // Strict mai mare: la egalitate nu exista nicio reducere de aratat, iar un pret
  // taiat cu el insusi arata a defect chiar si cand cifrele sunt corecte.
  return vechi > acum ? vechi : null;
}
