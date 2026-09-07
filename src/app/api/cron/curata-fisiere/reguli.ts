/**
 * Cand se sterge un fisier incarcat de un cumparator.
 *
 * ═══ ⚠ DE CE EXISTA ═══
 *
 * Capatul de incarcare e PUBLIC si neautentificat, scrie in depozit platit, si pana acum nimic
 * nu stergea nimic: nici fisierele ajunse pe comenzi, nici pe cele urcate si abandonate. Singurul
 * curatitor din proiect, `deleteOrphanImages` din `r2-cleanup.ts`, e no-op explicit. Un fisier
 * care nu ajunge pe nicio comanda ramanea pe factura pe veci, fara proprietar si fara urma — iar
 * continutul lui e poza de familie a unui om care n-a fost intrebat nimic despre stocare.
 *
 * ═══ ⚠ HOTARAREA PROPRIETARULUI, 07.09.2026 ═══
 *
 * Se sterg AMANDOUA felurile: si orfanii, si cele ajunse pe comenzi.
 *
 *   - ORFAN: la 30 de zile de la incarcare.
 *   - PE COMANDA: la 6 luni DE LA DATA COMENZII.
 *
 * ⚠ „De la data comenzii", nu de la starea finala — alegerea lui, spusa pe fata. Pretul ei: o
 * comanda care sta in productie mai mult de sase luni isi pierde fisierul sub mana atelierului.
 * Scris aici ca sa nu para o scapare cand se intampla.
 *
 * ═══ ⚠ SI DE CE CELE DOUA REGULI SUNT DE FAPT UNA ═══
 *
 * O comanda mai veche de sase luni nu mai apara nimic — asta ZICE chiar regula ei. Deci multimea
 * care trebuie citita din baza nu e „toate comenzile", ci doar cele din ULTIMELE SASE LUNI, si
 * intrebarea ramasa e una singura:
 *
 *   se sterge cheia care NU e pe nicio comanda din ultimele sase luni SI al carei obiect e mai
 *   vechi de 30 de zile.
 *
 * Un fisier de pe o comanda de acum sapte luni pica exact unde trebuie: nu mai e aparat, si
 * obiectul lui e demult mai vechi de 30 de zile. Iar un fisier urcat acum zece minute e aparat de
 * marginea de 30 de zile chiar daca omul n-a apasat inca „Trimite comanda".
 *
 * ⚠ CE FACE MARGINEA ASTA SA FIE NEAPARATA: intre incarcare si trimiterea comenzii poate trece
 * oricat — omul lasa fila deschisa, se razgandeste, revine a doua zi. Fara ea, cronul ar sterge
 * fisierul din formularul pe care cineva tocmai il completeaza.
 *
 * ⚠ CE NU APARA NIMIC: cosurile abandonate. Instantaneul lor (`AbandonedCartItem`) are cinci
 * campuri si nu poarta personalizarea, deci un cos deschis de peste 30 de zile isi pierde
 * fisierele. Treizeci de zile e mult mai mult decat traieste un cos in fapt, si liniile
 * personalizate sunt oricum sarite de `liniiRecuperabile`.
 */

/** Cat traieste un fisier care nu e pe nicio comanda. */
export const ZILE_ORFAN = 30;

/** Cat traieste un fisier de pe o comanda, socotit de la DATA COMENZII. */
export const LUNI_PE_COMANDA = 6;

const ZI = 24 * 60 * 60 * 1000;

/** Un obiect din depozit, asa cum il da listarea. */
export interface ObiectDepozit {
  cheie: string;
  /** `LastModified` din R2 — cand au fost scrisi octetii. */
  incarcatLa: Date;
}

export interface Verdict {
  cheie: string;
  motiv: "orfan" | "comanda-veche";
}

/**
 * De cand incoace o comanda mai apara fisierele ei.
 *
 * ⚠ SE SOCOTESTE IN LUNI CALENDARISTICE, nu in `183 * ZI`: „sase luni" e ce a spus proprietarul,
 * si `setMonth` da chiar asta. Diferenta e de pana la trei zile, dar regula scrisa in doua feluri
 * — una in cod, alta in vorbe — e felul in care cele doua se departeaza.
 */
export function pragulComenzilor(acum: Date): Date {
  const d = new Date(acum.getTime());
  d.setMonth(d.getMonth() - LUNI_PE_COMANDA);
  return d;
}

/**
 * Ce se sterge din depozit.
 *
 * @param obiecte    tot ce sta sub prefixul incarcarilor
 * @param aparate    cheile aflate pe comenzi din ultimele `LUNI_PE_COMANDA` luni
 * @param acum       clipa de referinta (se da, ca sa se poata proba)
 *
 * ⚠ FUNCTIA E PURA SI NU STERGE NIMIC. Ea raspunde la o intrebare; stergerea o face ruta, care
 * are si portile care nu se pot scrie aici (baza a raspuns? listarea s-a terminat? plafonul pe
 * rulare?). Socoteala unei stergeri ireversibile nu are voie sa traiasca in acelasi loc cu
 * apelurile de retea care o si executa.
 */
export function deSters(obiecte: ObiectDepozit[], aparate: ReadonlySet<string>, acum: Date): Verdict[] {
  const limitaOrfan = acum.getTime() - ZILE_ORFAN * ZI;
  const out: Verdict[] = [];

  for (const o of obiecte) {
    if (!o || typeof o.cheie !== "string" || !o.cheie) continue;
    /*
     * ⚠ O DATA NECITIBILA APARA FISIERUL, nu il condamna. `LastModified` lipsa sau stricat ar da
     * `NaN`, iar orice comparatie cu `NaN` e `false` — dar asta se scrie pe fata, nu se lasa pe
     * seama purtarii lui `NaN`: cine rescrie randul cu `>=` in loc de `<` ar sterge tocmai
     * obiectele despre care nu stim nimic.
     */
    const t = o.incarcatLa instanceof Date ? o.incarcatLa.getTime() : NaN;
    if (!Number.isFinite(t)) continue;

    if (aparate.has(o.cheie)) continue;
    if (t < limitaOrfan) {
      /*
       * Motivul se pune dupa vechimea obiectului, ca sa se poata citi din log ce s-a intamplat:
       * un fisier mai vechi decat pragul comenzilor a fost aproape sigur pe o comanda iesita din
       * fereastra, unul mai nou e o incarcare pe care n-a urmat nicio comanda.
       */
      const pragComenzi = pragulComenzilor(acum).getTime();
      out.push({ cheie: o.cheie, motiv: t < pragComenzi ? "comanda-veche" : "orfan" });
    }
  }

  return out;
}

/**
 * Cheile de personalizare purtate de o comanda.
 *
 * ⚠ CITESTE AMANDOUA FORMELE de valoare — un sir si o lista de siruri — fiindca asta scrie
 * `verificaPersonalizarea` in `orders.items[].customization`: un camp de text da un sir, unul de
 * fisiere da o lista.
 *
 * ⚠ SI NU SE UITA LA CE TIP ZICE CAMPUL. `type` din instantaneu vine din definitia produsului, iar
 * definitia se poate schimba dupa comanda: un camp `fisier` devenit `text` ar face fisierele lui
 * invizibile aici, si cronul le-ar sterge desi stau pe o comanda de saptamana trecuta. Se cauta
 * FORMA valorii — prefixul incarcarilor — care nu se schimba niciodata sub noi.
 */
export function cheileComenzii(items: unknown, prefix: string): string[] {
  const out: string[] = [];
  if (!Array.isArray(items)) return out;

  for (const linie of items) {
    const pers = (linie as { customization?: unknown } | null)?.customization;
    if (!pers || typeof pers !== "object" || Array.isArray(pers)) continue;

    for (const intrare of Object.values(pers as Record<string, unknown>)) {
      const v = (intrare as { value?: unknown } | null)?.value;
      for (const s of Array.isArray(v) ? v : [v]) {
        if (typeof s === "string" && s.startsWith(prefix)) out.push(s);
      }
    }
  }

  return out;
}
