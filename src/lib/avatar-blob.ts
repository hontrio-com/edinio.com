import { blobatar } from "blobatar";

/*
  Chipul fiecarui utilizator, desenat din id-ul lui.

  Pana acum, in bara de sus statea un cerc cu initialele. Doi comercianti cu
  aceleasi initiale aratau identic, iar un cont fara nume arata „U".

  ⚠ SAMANTA E ID-UL, NU NUMELE. Doua motive: acelasi om isi pastreaza chipul
  daca isi schimba numele in setari, si nimic din ce scrie utilizatorul nu
  ajunge in desen. Biblioteca (`blobatar`) intoarce SVG gata facut, iar noi il
  punem in pagina; cu numele ca samanta, textul lui ar fi intrat in drumul ala.

  ⚠ SE DESENEAZA PE SERVER si se trimite ca text. Asa, biblioteca nu ajunge in
  pachetul trimis browserului, iar chipul e acelasi la fiecare randare: acelasi
  id da mereu acelasi desen, deci si comerciantii de azi il capata pe al lor,
  fara sa fie nevoie sa se schimbe ceva in baza.
*/
export function avatarUtilizator(idUtilizator: string, marime = 28): string {
  return blobatar(idUtilizator || "necunoscut", { size: marime });
}
