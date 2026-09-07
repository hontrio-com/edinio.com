/**
 * Mesajul pe care comerciantul il trimite catre Pepita ca sa i se activeze conexiunea.
 *
 * ⚠ ACTIVAREA NU SE FACE DIN EDINIO, si nu exista niciun capat prin care sa o cerem
 * programatic. Seller Center-ul lor spune ca adresa feedului se trimite „to your
 * dedicated contact or to the seller support address", impreuna cu trei raspunsuri:
 * daca feedul are produse cu variatii, daca se foloseste costul de transport din feed
 * sau cel implicit, si la fel pentru termenul de livrare.
 *
 * Textul de mai jos raspunde la toate trei, ca omul sa nu fie intrebat si sa nu
 * ghiceasca.
 *
 * ⚠ „NU CONȚINE PRODUSE CU VARIAȚII” E ADEVARAT, si e important sa fie spus: noi
 * aplatizam combinatiile, deci pentru ei fiecare varianta e un produs de sine
 * statator. Daca ar crede altceva, ar astepta structura `<Variations>` si ar putea
 * grupa gresit articolele.
 */

export interface AdreseDeTrimis {
  feedProduse: string;
  feedStoc: string;
  comenzi: string;
}

export function sablonMesajPepita(a: AdreseDeTrimis): string {
  return [
    "Bună ziua,",
    "",
    "Doresc activarea conexiunii pentru magazinul meu, administrat prin platforma Edinio.",
    "",
    `Feed produse: ${a.feedProduse}`,
    `Feed stoc: ${a.feedStoc}`,
    `Adresă API pentru trimiterea comenzilor: ${a.comenzi}`,
    "",
    "Feedul NU conține produse cu variații: fiecare variantă este trimisă ca produs de sine",
    "stătător, cu identificator propriu.",
    "",
    "Costul de transport și termenul de pregătire: dacă sunt prezente în feed, vă rog să le",
    "folosiți pe cele din feed; unde lipsesc, vă rog să aplicați valorile implicite stabilite",
    "pentru contul meu.",
    "",
    "Vă rog să îmi confirmați când conexiunea este activă.",
    "",
    "Mulțumesc,",
  ].join("\n");
}
