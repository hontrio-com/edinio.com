/**
 * Mesajul pe care comerciantul il trimite catre Pepita ca sa i se activeze conexiunea.
 *
 * ⚠ ACTIVAREA NU SE FACE DIN EDINIO, si nu exista niciun capat prin care sa o cerem
 * programatic. Seller Center-ul lor spune ca adresa feedului se trimite „to your
 * dedicated contact or to the seller support address", impreuna cu trei raspunsuri:
 * daca feedul are produse cu variatii, daca se foloseste costul de transport din feed
 * sau cel implicit, si la fel pentru termenul de livrare.
 *
 * ⚠ SUNT PATRU, NU TREI, din 09.09.2026. A patra e TARA, si n-am aflat-o din
 * documentatia lor, ci dintr-un email prin care ne-au intrebat-o dupa ce un comerciant
 * le trimisese adresele: „ar fi necesar sa clarificam pentru ce tara a fost creat acest
 * lucru. Avem nevoie de fluxuri specifice fiecarei tari". Documentatia lor n-o cere;
 * oamenii lor, da. Lista scrisa din documentatie a fost deci incompleta de la inceput, si
 * nimic din repo n-o putea arata: proba ei verifica exact cele trei puncte pe care le stiam.
 *
 * Textul de mai jos raspunde la toate patru, ca omul sa nu fie intrebat si sa nu
 * ghiceasca.
 *
 * ⚠ „NU CONȚINE PRODUSE CU VARIAȚII” E ADEVARAT, si e important sa fie spus: noi
 * aplatizam combinatiile, deci pentru ei fiecare varianta e un produs de sine
 * statator. Daca ar crede altceva, ar astepta structura `<Variations>` si ar putea
 * grupa gresit articolele.
 */

import { PIATA_IMPLICITA, PIETE, type PiataPepita } from "./types";

export interface AdreseDeTrimis {
  feedProduse: string;
  feedStoc: string;
  comenzi: string;
}

export function sablonMesajPepita(a: AdreseDeTrimis, piata: PiataPepita = PIATA_IMPLICITA): string {
  const p = PIETE[piata];
  return [
    "Bună ziua,",
    "",
    "Doresc activarea conexiunii pentru magazinul meu, administrat prin platforma Edinio.",
    "",
    `Feed produse: ${a.feedProduse}`,
    `Feed stoc: ${a.feedStoc}`,
    `Adresă API pentru trimiterea comenzilor: ${a.comenzi}`,
    "",
    /*
      ⚠ TARA SE SPUNE AICI, si nu se poate afla din feed.

      Formatul lor n-are niciun camp de tara; singurul semn e `<Currency>`, si el sta pe
      fiecare pret, adica INAUNTRUL unui `<Product>`. Un catalog cu zero produse nu poarta
      deci nicio urma de tara, si tocmai peste un asemenea catalog au intrebat ei. Randul
      asta e singurul loc de pe tot drumul in care raspunsul chiar incape.

      ⚠ Vine din `PIETE`, nu scris de mana: cand apare a doua piata, mesajul se muta odata
      cu ea. Iar ei cer feeduri SEPARATE pe fiecare tara, deci a doua piata inseamna a doua
      pereche de adrese, nu un feed cu doua monede.
    */
    `Țara pentru care este creat feedul: ${p.eticheta} (${p.adresa}). Prețurile sunt în ${p.moneda}.`,
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
