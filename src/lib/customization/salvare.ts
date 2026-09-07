import {
  MAX_CAMPURI, MAX_LUNGIME_TEXT, MAX_OPTIUNI, MAX_PERSONALIZARE_LINIE, megaoctetiiCampului,
  normalizeazaDefinitia, type DefinitiePersonalizare,
} from "./definitie";
import { MAX_FISIERE } from "./valori";
import { campulDeSuprafata } from "./pret";

/**
 * Poarta de SCRIERE a personalizarii: ce salveaza comerciantul se si serveste, sau afla de ce nu.
 *
 * ═══ ⚠ SE RAPORTEAZA, NU SE REPARA ═══
 *
 * Cititorul (`normalizeazaDefinitia`) e bland dinadins: nu arunca niciodata, si trece peste ce nu
 * intelege. Purtarea aia apara CITIREA — un `page_sections` scris strambe, de orice drum, n-are
 * voie sa opreasca o vanzare.
 *
 * Dar la SCRIERE aceeasi blandete devine tacere. Comerciantul adauga al 31-lea camp, primeste
 * „Salvat", si vitrina serveste 30 — fara ca ceva pe ecran sa spuna care lipseste. Sau pune
 * tarifele pe optiuni si lasa caseta „Tarif lei/m²" pe 0: modul „pe suprafata" cade inapoi pe
 * „adaugat", ecranul arata un fel de pretuire, si se incaseaza altul.
 *
 * ⚠ NICI FORMA NORMALIZATA NU SE SCRIE IN BAZA. Ar fi atins cele 29 de randuri existente si ar fi
 * stricat exact proprietatea pentru care poarta sta la citire. Se scrie ce a trimis omul; i se
 * spune doar cand ce a trimis nu se poate servi intreg.
 *
 * ⚠ Sta in modulul PUR, nu langa actiunea de server, si nu din gust: `product.actions.ts` e
 * „use server", iar acolo FIECARE export e un capat public — deci functia n-ar fi putut fi
 * exportata ca s-o probeze cineva.
 */

/** Un obiect simplu — nu null, nu tablou. */
function esteObiectSimplu(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Cum se numeste campul intr-un mesaj catre comerciant.
 *
 * ⚠ ETICHETA GOALA E LEGITIMA, si asta s-a masurat inainte de a scrie randurile de mai jos:
 * 17 din cele 49 de campuri vii din productie, pe 9 produse, au `label` gol — iar formularul
 * creeaza campurile noi tot asa. Un mesaj care spune „Campul «»" nu ajuta pe nimeni, iar un REFUZ
 * pe eticheta goala ar fi facut cele 9 produse nesalvabile: comerciantul care intra sa schimbe
 * pretul ar fi primit o eroare despre un camp de personalizare pe care nu l-a atins.
 *
 * Deci se cade pe POZITIE, nu se refuza.
 */
function numeleCampului(eticheta: string, pozitie: number): string {
  const e = eticheta.trim();
  return e ? `„${e}”` : `al ${pozitie}-lea camp`;
}

export function problemaPersonalizarii(pageSections: unknown): string | null {
  const ps = esteObiectSimplu(pageSections) ? pageSections : null;
  const brut = ps?.customization;
  if (!esteObiectSimplu(brut) || brut.enabled !== true) return null;

  const campuriTrimise = Array.isArray(brut.fields) ? brut.fields : [];
  if (campuriTrimise.length === 0) return null;

  const citita = normalizeazaDefinitia(brut);
  if (!citita) {
    return "Personalizarea e pornita, dar niciun camp nu se poate folosi. Fiecare camp are nevoie"
      + " de un tip cunoscut si de un nume propriu.";
  }

  if (campuriTrimise.length > MAX_CAMPURI) {
    return `Personalizarea accepta cel mult ${MAX_CAMPURI} campuri; ai ${campuriTrimise.length}.`;
  }
  /*
   * ⚠ GREUTATEA, nu doar numarul de campuri. Vezi `MAX_PERSONALIZARE_LINIE`: cosul isi taie
   * liniile mai grele de atat, iar schema ingaduia de trei ori mai mult. Deci se putea configura
   * ceva pe care pagina il accepta, „Adauga in cos" il accepta, si care DISPARE la prima
   * reimprospatare — fara ca nimic sa scartaie.
   *
   * Comerciantul afla acum cand configureaza, cu un mesaj care spune ce sa taie.
   */
  const greutate = greutateaMaximaAPersonalizarii(citita);
  if (greutate > MAX_PERSONALIZARE_LINIE) {
    return "Campurile de personalizare pot aduna prea mult text pentru o singura linie de cos"
      + ` (pana la ${greutate.toLocaleString("ro-RO")} de caractere, iar limita e`
      + ` ${MAX_PERSONALIZARE_LINIE.toLocaleString("ro-RO")}). Scurteaza limitele de caractere sau`
      + " scoate cateva campuri.";
  }
  if (citita.fields.length < campuriTrimise.length) {
    const cate = campuriTrimise.length - citita.fields.length;
    return (cate === 1
      ? "Un camp de personalizare nu se poate folosi"
      : `${cate} campuri de personalizare nu se pot folosi`)
      + " — verifica sa aiba fiecare un tip cunoscut, si un nume care nu se repeta.";
  }

  for (const [pozitie, camp] of citita.fields.entries()) {
    const nume = numeleCampului(camp.label, pozitie + 1);

    /*
     * ⚠ CAMP OBLIGATORIU PE CARE NIMENI NU-L POATE COMPLETA.
     *
     * Un `butoane` sau `select` obligatoriu si fara nicio optiune se salveaza azi fara niciun
     * mesaj. In vitrina apare eticheta cu steluta rosie si, dedesubt, NIMIC. Clientul apasa
     * „Comanda": fereastra nu se deschide, si scrie „Alege o optiune." sub un rand pe care nu e
     * nimic de ales. Apasa iar. Si iar.
     *
     * ⚠ `pers.verifica()` nu poate intoarce NICIODATA `true` pe o asemenea configurare, deci
     * produsul e pierdut pana cand cineva observa — iar comerciantul n-are cum sa observe din
     * panou, fiindca acolo scrie ca s-a salvat.
     *
     * Se cere doar la campurile OBLIGATORII: unul optional si gol se poate sari, deci nu blocheaza
     * nimic, iar refuzul ar fi oprit un comerciant care tocmai adauga campul si n-a apucat sa
     * scrie optiunile.
     */
    if (camp.required) {
      /*
       * ⚠ O SINGURA RAMURA, de cand `select` e un STIL al lui `butoane`. Erau doua, si a doua avea
       * si alta forma de optiuni (`options: string[]`) — adica exact felul de pereche care se tine
       * in sincron pana intr-o zi cand nu se mai tine.
       */
      const fara = camp.type === "butoane" && (camp.optiuni ?? []).length === 0;
      if (fara) {
        return `${nume} e obligatoriu si n-are nicio optiune, deci clientul nu-l poate completa —`
          + " produsul nu s-ar putea comanda. Adauga cel putin o optiune, sau fa campul optional.";
      }
    }

    /*
     * ⚠ LIMITELE DE INCARCARE NU POT DEPASI CE ACCEPTA SERVERUL.
     *
     * Casutele „Fisiere max" si „MB pe fisier" erau libere, si nimic nu le margine — nici panoul,
     * nici cititorul (spre deosebire de vecinul lor, `max_length`, unde plafonul CHIAR se pune).
     * Deci comerciantul scria 50 si 100, primea „Salvat", si mintea apoi propriul client de doua
     * ori: ecranul promitea „50 fisiere, 100 MB fiecare", iar serverul pastra 20 si refuza la 40.
     *
     * ⚠ Numarul e jumatatea GRAVA: doar el produce o comanda REUSITA cu date lipsa. Marimea
     * macar cade zgomotos, chiar daca pe un mesaj gresit.
     */
    if (camp.type === "image" || camp.type === "fisier") {
      if ((camp.max_files ?? 0) > MAX_FISIERE) {
        return `${nume}: se pot trimite cel mult ${MAX_FISIERE} fisiere pe camp; ai cerut`
          + ` ${camp.max_files}. Peste atat, restul s-ar pierde fara ca cineva sa afle.`;
      }
      const mb = megaoctetiiCampului(camp.type);
      if ((camp.max_file_size_mb ?? 0) > mb) {
        return `${nume}: se accepta cel mult ${mb} MB pe fisier; ai cerut`
          + ` ${camp.max_file_size_mb}. Peste atat, incarcarea cade si clientul nu afla de ce.`;
      }
    }

    /*
     * ⚠ MARGINI CARE S-AU TRIMIS SI NU S-AU CITIT.
     *
     * Cititorul arunca marginile fara sens ca interval, si bine face — asa campul ramane
     * completabil in loc sa blocheze vanzarea. Dar aruncate in TACERE, comerciantul crede ca a pus
     * „intre 100 si 500 cm" si serveste un camp nemarginit: clientul comanda 1 cm sau 90 de metri,
     * si comanda trece.
     */
    const trimis = campuriTrimise.find((f) => esteObiectSimplu(f) && f.id === camp.id);
    if (camp.type === "numar" && esteObiectSimplu(trimis)) {
      const min = Number(trimis.min);
      const max = Number(trimis.max);
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        return `${nume}: minimul (${min}) e mai mare decat maximul (${max}). Nicio valoare n-ar`
          + " putea fi scrisa in campul asta.";
      }
      const imp = Number(trimis.implicit);
      if (Number.isFinite(imp) && camp.implicit === undefined) {
        return `${nume}: valoarea implicita ${imp} nu se potriveste cu marginile sau cu pasul, deci`
          + " ea ar fi refuzata chiar de verificarea campului. Schimb-o sau scoate-o.";
      }
    }
    if (camp.type === "dimensiuni" && esteObiectSimplu(trimis)) {
      for (const [cheie, numeLatura] of [["latime", "latimii"], ["inaltime", "inaltimii"]] as const) {
        const l = trimis[cheie];
        const citit = camp[cheie];
        if (esteObiectSimplu(l) && Object.keys(l).length > 0 && citit === undefined) {
          return `${nume}: marginile ${numeLatura} nu se pot folosi. Minimul trebuie sa fie mai mare`
            + " ca zero, iar maximul cel putin cat minimul — altfel campul ramane nemarginit si"
            + " clientul poate cere orice masura.";
        }
        if (esteObiectSimplu(l) && citit !== undefined
          && l.implicit !== undefined && citit.implicit === undefined) {
          return `${nume}: valoarea implicita a ${numeLatura} nu e intre margini sau nu se potriveste`
            + " cu pasul, deci ea ar fi refuzata chiar de verificarea campului.";
        }
      }
    }

    const optiuniTrimise =
      esteObiectSimplu(trimis) && Array.isArray(trimis.optiuni) ? trimis.optiuni : null;
    if (!optiuniTrimise) continue;
    if (optiuniTrimise.length > MAX_OPTIUNI) {
      return `Campul „${camp.label}” accepta cel mult ${MAX_OPTIUNI} optiuni;`
        + ` ai ${optiuniTrimise.length}.`;
    }
    if ((camp.optiuni ?? []).length < optiuniTrimise.length) {
      return `Campul „${camp.label}” are optiuni care nu se pot folosi — fiecare are nevoie de un`
        + " nume propriu, care nu se repeta.";
    }
  }

  /*
   * ⚠ UN „+15 LEI/M²" CARE N-ARE DE UNDE SA-SI IA METRII.
   *
   * `pretulPersonalizarii` sare un supliment pe m² cand nu exista suprafata, si o face dinadins:
   * la nivelul socotelii, „nu incasez nimic" e mai putin rau decat „inventez un numar". Dar
   * configurarea in care suprafata nu se poate afla NICIODATA nu e un caz de rulare — e o greseala
   * de configurare, si numai comerciantul o poate repara.
   *
   * Masurat inainte de reparatie, cu „Protectie impermeabila +15 lei/m²" pe un produs cu pret
   * standard 100 lei: supliment 0, pret 100, si la salvare TRECEA. Comerciantul vedea tariful
   * salvat si incasa zero, pe fiecare comanda.
   *
   * ⚠ Doua feluri in care suprafata nu se poate afla, si amandoua se opresc aici: niciun camp de
   * dimensiuni, sau DOUA si niciunul numit ca sursa (`campulDeSuprafata` refuza sa aleaga „primul
   * din lista": ordinea campurilor se poate schimba, si atunci pretul s-ar muta singur).
   *
   * ⚠ Cazul in care campul EXISTA dar clientul nu l-a completat NU se opreste aici — acolo
   * dimensiunile pot ramane optionale pentru cine nu cumpara nimic pe metru, iar refuzul vine la
   * comanda, langa campul vinovat (`campurileFaraSuprafata`).
   */
  if (!campulDeSuprafata(citita)) {
    const peM2 = citita.fields.filter((c) =>
      c.impact?.fel === "pe_m2" && c.impact.suma > 0
      || (c.optiuni ?? []).some((o) => o.impact?.fel === "pe_m2" && o.impact.suma > 0));
    if (peM2.length > 0) {
      const nume = peM2.map((c) => c.label).filter(Boolean).join(", ");
      const areDimensiuni = citita.fields.some((c) => c.type === "dimensiuni");
      return (nume ? `„${nume}” are pret pe metru patrat, dar` : "Ai un pret pe metru patrat, dar")
        + (areDimensiuni
          ? " sunt mai multe campuri de dimensiuni si niciunul nu e ales ca sursa a suprafetei."
            + " Alege modul „Calculat din suprafata” si spune din care camp se socoteste, sau lasa"
            + " un singur camp de dimensiuni."
          : " produsul n-are niciun camp de dimensiuni. Adauga unul, altfel suplimentul nu se poate"
            + " socoti si nu se incaseaza nimic.");
    }
  }

  /*
   * ⚠ MODUL DE PRET CAZUT INAPOI e cel mai scump caz din functia asta, fiindca e SINGURUL care
   * schimba banii fara sa schimbe nimic pe ecran: comerciantul vede „Calculat din suprafata", si
   * se incaseaza pretul de catalog. Vezi `citestePret` pentru cele cinci conditii.
   */
  const felTrimis = esteObiectSimplu(brut.pret) ? brut.pret.fel : undefined;
  if (felTrimis === "suprafata" && citita.pret?.fel !== "suprafata") {
    return "Pretul pe suprafata nu se poate aplica asa. Ai nevoie de: un camp de dimensiuni ales,"
      + " cu margini (sau cu o suprafata minima facturabila), si un tarif mai mare ca zero — fie in"
      + " casuta „Tarif lei/m²”, fie pe FIECARE optiune a campului care da tariful.";
  }
  return null;
}

/**
 * Cat poate cantari, in cel mai rau caz, personalizarea unei linii cu definitia asta.
 *
 * ⚠ SE SOCOTESTE PE CAZUL CEL MAI GREU, nu pe cel obisnuit: cosul taie linia cand payload-ul
 * REAL depaseste plafonul, iar un client care completeaza tot la maximum e un client obisnuit,
 * nu un atacator. O socoteala „in medie" ar fi lasat exact configuratia care se evapora.
 *
 * ⚠ CIFRELE SUNT MARGINI DE SUS, cu antetul JSON inauntru: cheia campului, ghilimelele si virgula.
 * Mai degraba prea mari decat prea mici — un plafon care lasa sa treaca ceva ce cosul taie mai
 * tarziu nu apara nimic.
 */
export function greutateaMaximaAPersonalizarii(definitie: DefinitiePersonalizare): number {
  let total = 2; /* acoladele obiectului */
  for (const camp of definitie.fields) {
    total += camp.id.length + 6; /* "id": , */
    switch (camp.type) {
      case "text":
      case "textarea":
        total += Math.min(camp.max_length ?? MAX_LUNGIME_TEXT, MAX_LUNGIME_TEXT) + 2;
        break;
      case "image":
      case "fisier":
        /* Fiecare cheie de fisier: `products/customizations/<uuid>/<uuid>-<24 hex>.<ext>` ≈ 120. */
        total += (camp.max_files ?? 1) * 124 + 2;
        break;
      case "butoane":
        /* Id-ul optiunii alese. (Lista derulanta e tot `butoane`, deci cantareste la fel.) */
        total += Math.max(40, ...(camp.optiuni ?? []).map((o) => o.id.length + 4));
        break;
      case "dimensiuni":
        total += 60;
        break;
      case "numar":
        total += 24;
        break;
      case "comutator":
        total += 8;
        break;
      default:
        /* `color` si orice tip nou: o valoare scurta, cu marja. */
        total += 64;
    }
  }
  return total;
}
