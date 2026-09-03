/*
  ═══════════════════════════════════════════════════════════════════════════════
  CODUL FARA COMENTARII, PENTRU PROBELE CARE CAUTA IN SURSA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA. O proba care interzice sau cere o forma in sursa nu deosebeste
  codul de vorbele despre cod. In repo-ul asta asta se intoarce mereu impotriva
  noastra, fiindca fiecare reparatie e insotita de o nota care NUMESTE forma
  gresita — deci cu cat explic mai bine, cu atat mai des cade plasa.

  M-a muscat de doua ori intr-o singura zi, in amandoua directiile:

    - FALS POZITIV: plasa care interzice `currency ?? "ron"` a cazut pe propriul
      meu comentariu, care citeaza forma veche ca s-o explice.
    - FALS NEGATIV, mai rau: plasa care cere `payment_status === "paid"` in
      webhook a trecut VERDE peste un mutant care stergea conditia — fiindca
      sirul aparea in comentariul de deasupra ei. Mutantul a supravietuit tocmai
      probei scrise pentru el.

  ⚠ DE CE MERGE CARACTER CU CARACTER si nu cu un regex. Sirurile si sabloanele pot
  contine `//`; un `https://` taiat cu regexul ar ascunde tocmai randurile cautate
  — adica un fals negativ, mai rau decat cel pozitiv.

  ⚠ CE NU FACE. Nu e un parser. Nu stie de expresii regulate scrise in cod (`/x\/y/`),
  fiindca in fisierele pe care le citim ele nu apar la inceput de expresie langa
  ghilimele. Daca vreodata apar, se vede: proba incepe sa taca sau sa strige aiurea.

  ⚠ SI DE CE NU E FOLOSIT PESTE TOT. Mai exista vreo cincisprezece copii ale
  functiei asteia in probe (olx, marketplace, admin-analytics), fiecare putin
  altfel. Nu le-am mutat pe toate aici odata cu reparatia de fata: fiecare are
  purtarea ei, si o migrare oarba ar schimba tacut ce apara. Aici sunt aduse cele
  din zona de marketing, unde defectele de mai sus s-au si intamplat.
*/

/** Sursa fara comentarii de linie si de bloc, cu sirurile pastrate intregi. */
export function faraComentarii(cod: string): string {
  let out = "";
  let i = 0;
  while (i < cod.length) {
    const c = cod[i];
    const d = cod[i + 1];

    if (c === "/" && d === "/") {
      while (i < cod.length && cod[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < cod.length && !(cod[i] === "*" && cod[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const ghilimea = c;
      out += c;
      i++;
      while (i < cod.length && cod[i] !== ghilimea) {
        /* ⚠ O evadare inghite si caracterul de dupa ea: `"a\"b"` e UN sir. */
        if (cod[i] === "\\") { out += cod[i]; i++; }
        out += cod[i];
        i++;
      }
      out += ghilimea;
      i++;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}
