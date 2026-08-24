/**
 * Centrul problemelor: acelasi necaz, o singura data (§64).
 *
 * ═══ ⚠ CE INTREBARE RASPUNDE ═══
 *
 * Panoul stia sa spuna „38 de oferte au probleme". Cu 38 de randuri de citit unul
 * cate unul, comerciantul nu afla ce e de FACUT — desi de cele mai multe ori e un
 * singur lucru: o caracteristica lipsa dintr-o categorie, o marca nerecunoscuta, un
 * EAN gresit copiat.
 *
 * Aici se aduna, iar raspunsul devine „38 de oferte asteapta aceeasi caracteristica"
 * — care se repara o data.
 *
 * ═══ ⚠ GRUPELE VIN DIN DATE, NU DINTR-O LISTA SCRISA DE MANA ═══
 *
 * O lista de categorii scrisa in cod ar fi ramas in urma la primul mesaj nou de-al
 * lor — si atunci mesajul nou, singurul despre care nu stie inca nimeni nimic, ar fi
 * cazut in „altele" si ar fi ramas acolo pentru totdeauna.
 *
 * Deci mesajele lor se NORMALIZEAZA si se grupeaza dupa tipar. Ce se cunoaste
 * primeste si un nume in romana; ce nu se cunoaste se grupeaza oricum, corect, si se
 * arata cu textul lor intreg.
 */

/** Din ce parte a sistemului vine problema. Se arata, fiindca reparatia difera. */
export type SursaProblemei =
  /** eMAG a respins ceva. Se repara in fisa produsului. */
  | "emag"
  /** Nu s-a putut trimite: lipseste ceva la noi. */
  | "edinio"
  /** N-am ajuns la ei: releu, timp expirat, limita de cereri. Se reia singur. */
  | "legatura";

export interface GrupProbleme {
  /** Amprenta tiparului. Stabila intre treceri, ca sa se poata desface pe ecran. */
  cheie: string;
  sursa: SursaProblemei;
  /** Ce scrie omului. Pentru tiparele necunoscute, chiar textul lor. */
  titlu: string;
  /** Cate lucruri sunt in grup. */
  cate: number;
  /** Un exemplu intreg, neatins, ca sa se vada amanuntul pierdut la normalizare. */
  exemplu: string;
  /** Cateva oferte din grup, ca sa se poata deschide una. */
  oferte: number[];
}

/**
 * Ce inseamna un `validation_status`, in cuvintele lor si ale noastre.
 *
 * ⚠ NUMAI STARILE RELE. Restul nu sunt probleme si n-au ce cauta in centrul asta:
 * `1` inseamna „asteapta MKTP", `9` „aprobat", `11` „actualizare in asteptare".
 * Puse aici, un catalog sanatos ar fi aratat sute de „probleme" care nu sunt.
 */
export const VALIDARE_RA: Record<number, string> = {
  2: "Așteaptă aprobarea mărcii",
  3: "Așteaptă verificarea EAN-ului",
  4: "Așteaptă verificarea documentației",
  5: "Marcă respinsă de eMAG",
  6: "EAN respins de eMAG",
  8: "Documentație respinsă de eMAG",
  10: "Ofertă blocată de eMAG",
  12: "Actualizare respinsă de eMAG",
};

/**
 * Un mesaj, redus la tiparul lui.
 *
 * ═══ ⚠ FARA PASUL ASTA, GRUPAREA N-AR GRUPA NIMIC ═══
 *
 * Mesajele eMAG poarta id-uri si valori inauntru: „characteristic 38 (Marime) is
 * required", „characteristic 41 (Culoare) is required". Grupate pe textul brut, ar fi
 * iesit doua grupuri de cate unul — adica exact lista pe care centrul asta ar trebui
 * s-o inlocuiasca.
 *
 * Se sterg: numerele, ce e intre ghilimele si intre paranteze. Ce ramane e forma
 * necazului, si ea se repeta.
 *
 * ⚠ Amanuntul sters NU se pierde: `exemplu` pastreaza un mesaj intreg, neatins.
 * Fara el, „lipseste o caracteristica" n-ar fi spus CARE — si n-ar fi ajutat cu nimic.
 */
export function tiparulMesajului(mesaj: string): string {
  return mesaj
    .toLowerCase()
    /* Ce e intre ghilimele sau paranteze e o valoare, nu forma necazului. */
    .replace(/["'„”][^"'„”]*["'„”]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    /* Id-uri, coduri, preturi. */
    .replace(/\d+([.,]\d+)?/g, " ")
    /* Semnele de punctuatie nu deosebesc doua necazuri. */
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Un lucru care s-a stricat, inainte de grupare. */
export interface Necaz {
  sursa: SursaProblemei;
  mesaj: string;
  /** Titlu gata scris, cand il stim (starile de validare). */
  titlu?: string;
  /** Amprenta gata facuta, cand nu vine dintr-un mesaj liber. */
  cheie?: string;
  emagId?: number | null;
  /**
   * Cate lucruri sunt in necazul asta. Implicit unul.
   *
   * ⚠ EXISTA CA SA NU SE CONSTRUIASCA LISTE URIASE DEGEABA. Starile de validare se
   * afla din `count` exact, fara sa se citeasca niciun rand; un magazin cu patruzeci
   * de mii de oferte respinse ar fi cerut atunci un tablou de patruzeci de mii de
   * elemente identice, doar ca gruparea sa numere pana acolo.
   */
  cate?: number;
}

/** Cate oferte se tin ca exemplu intr-un grup. Destule cat sa deschizi una. */
export const OFERTE_PE_GRUP = 8;

/**
 * Aduna necazurile in grupuri.
 *
 * Functie curata: intra o lista, iese o lista. Se poate proba intreaga fara retea si
 * fara baza de date — si e chiar partea care are ce sa greseasca.
 *
 * ⚠ Grupurile ies ORDONATE dupa cate lucruri au, descrescator. Cel mai des necaz e
 * si cel care merita reparat intai; ordonate dupa altceva, omul ar fi inceput cu
 * unul care atinge o singura oferta.
 */
export function grupeaza(necazuri: Necaz[]): GrupProbleme[] {
  const grupuri = new Map<string, GrupProbleme>();

  for (const n of necazuri) {
    const mesaj = (n.mesaj ?? "").trim();
    if (!mesaj && !n.titlu) continue;

    const cheie = n.cheie ?? `${n.sursa}:${tiparulMesajului(mesaj)}`;
    const existent = grupuri.get(cheie);

    if (existent) {
      existent.cate += n.cate ?? 1;
      if (n.emagId != null && existent.oferte.length < OFERTE_PE_GRUP) {
        existent.oferte.push(n.emagId);
      }
      continue;
    }

    grupuri.set(cheie, {
      cheie,
      sursa: n.sursa,
      /* ⚠ Cand nu stim un nume, se arata CHIAR MESAJUL LOR, nu „Problemă necunoscută".
         Un tipar nou e tocmai cel despre care nu stie nimeni nimic; ascuns sub o
         eticheta generica, ar fi ramas acolo pentru totdeauna. */
      titlu: n.titlu ?? mesaj,
      cate: n.cate ?? 1,
      exemplu: mesaj,
      oferte: n.emagId != null ? [n.emagId] : [],
    });
  }

  return [...grupuri.values()].sort((a, b) => b.cate - a.cate);
}
