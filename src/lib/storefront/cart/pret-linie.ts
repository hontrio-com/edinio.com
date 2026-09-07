import { normalizeazaDefinitia } from "@/lib/customization/definitie";
import { pretUnitar as pretUnitarCuPersonalizare, pretulPersonalizarii } from "@/lib/customization/pret";
import { normalizeazaValorile } from "@/lib/customization/valori";
import { construiesteTrepte, pretPeTrepte, type PretLinie } from "@/lib/storefront/quantity-tiers";
import { rezumatPersonalizare, type CartItem } from "./normalize";

/**
 * Cat costa o linie de cos — SINGURA socoteala, si de-aia sta aici.
 *
 * ═══ ⚠ CE A COSTAT LIPSA EI ═══
 *
 * Socoteala traia in `CartProvider`, adica intr-o componenta React, deci nu putea fi probata fara
 * browser. Cand personalizarea a intrat in cos, s-a reparat doar jumatatea de la server:
 * `placeCartOrder` repretuia linia, iar cosul si pagina de finalizare aratau mai departe pretul de
 * CATALOG. Un fototapet de 3,5 x 2,5 m se vedea cu 89 de lei si se scria in comanda cu 778,75 —
 * clientul confirma o suma si i se cerea alta la usa, iar coletul pleca asigurat pe 89.
 *
 * Nicio proba n-avea cum sa prinda asta cat timp singurul loc unde traia formula era o componenta.
 *
 * ═══ ⚠ ACELASI MOTOR CA PE SERVER ═══
 *
 * `pretulPersonalizarii` si `pretUnitar` de aici sunt CHIAR functiile pe care le cheama poarta
 * comenzii. Nu se rescrie formula: doua socoteli scrise separat se departeaza, si atunci cosul
 * minte iar, doar cu alte cifre.
 *
 * ⚠ SI ACEEASI ASEZARE: treapta de cantitate se aplica pe BAZA, suplimentul e pe bucata, peste ea.
 * Adunat inainte de trepte, un pachet „3 bucati 250 lei" ar fi redus si gravura, nu doar cana.
 */

/** Ce stie serverul despre un produs din cos — chiar forma intoarsa de `getCartPricing`. */
export interface RegulaPretCos {
  price: number;
  combos: Record<string, number>;
  tiers: unknown;
  customization: unknown;
  /**
   * Produsul mai vinde pe variante?
   *
   * ⚠ NU E ACELASI LUCRU CU „`combos` are chei". Un produs poate avea variante cu TOATE
   * combinatiile stinse: atunci `combos` e gol, dar produsul cere mai departe o alegere, iar poarta
   * comenzii refuza linia fara titlu. Fara steagul asta, cosul n-ar fi avut cum sa deosebeasca
   * cazul, si ar fi lasat sa se ajunga la finalizare o linie pe care serverul o respinge.
   *
   * ⚠ Optional dinadins: cine construieste o regula de mana (probe, drumuri vechi) nu e obligat sa
   * stie, iar `undefined` inseamna „nu spun", nu „nu are". Vezi `cereRevizuire`.
   */
  areVariante?: boolean;
}

/** Aceeasi rotunjire la ban ca pe server, ca cele doua numere sa fie chiar acelasi numar. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Suplimentul de personalizare al unei linii, din definitia venita de la server.
 *
 * ⚠ CADE PE NULL cand nu se poate socoti: preturile n-au ajuns inca, produsul nu mai are
 * personalizare, sau valorile nu se mai potrivesc cu definitia. Atunci linia ramane la pretul de
 * catalog — un numar vechi, dar nu unul inventat. Serverul recalculeaza oricum si REFUZA ce nu se
 * potriveste, deci nimeni nu poate cumpara pe pretul asta.
 */
function personalizarea(item: CartItem, regula: RegulaPretCos | undefined) {
  const valori = item.customization;
  if (!valori || typeof valori !== "object" || Object.keys(valori).length === 0) return null;
  const definitie = normalizeazaDefinitia(regula?.customization);
  if (!definitie) return null;
  const curate = normalizeazaValorile(definitie, valori);
  /*
   * ⚠ `curate.ok` SE CITESTE, si pana pe 07.09.2026 nu se citea.
   *
   * Comentariul de deasupra promitea de mult ca se cade pe `null` „cand valorile nu se mai
   * potrivesc cu definitia" — dar codul lua `curate.valori` oricum. Iar la nepotrivire aia e o
   * multime PARTIALA: campurile care s-au curatat sunt acolo, cele care n-au trecut lipsesc.
   *
   * Deci cosul socotea linistit un pret din jumatate de configuratie si il arata ca pe unul bun.
   * Se intampla exact cand comerciantul schimba definitia dupa ce clientul a pus produsul in cos:
   * sterge optiunea „Premium", face un camp obligatoriu, stramteaza marginile. Clientul vedea o
   * suma plauzibila si afla abia la finalizare ca nu se poate comanda.
   *
   * ⚠ NU E O GAURA DE BANI: serverul repretuieste si REFUZA ce nu se potriveste, deci nimeni n-a
   * putut cumpara pe suma aia. E o minciuna de ecran — si un comentariu care promitea o plasa
   * inexistenta.
   *
   * ⚠ CE RAMANE DE FACUT: linia ar trebui sa spuna „Necesita actualizare", nu sa arate tacut
   * pretul de catalog. Aici se opreste minciuna; semnalul catre client e o lucrare de interfata.
   */
  if (!curate.ok) return null;
  return pretulPersonalizarii(definitie, curate.valori);
}

/**
 * Pretul unei bucati INAINTE de treptele de cantitate — eticheta „N buc x P".
 *
 * ⚠ Invariantul pe care il tine: `bucata x cantitate == subtotal + economie`. Fara personalizare
 * in el, randul ar fi scris „2 buc x 89 lei" langa un total de 1.557,50.
 */
export function pretulBucatii(item: CartItem, regula: RegulaPretCos | undefined): number {
  const catalog = pretulDeCatalog(item, regula);
  const pers = personalizarea(item, regula);
  return pers ? round2(pretUnitarCuPersonalizare(pers, catalog)) : catalog;
}

/** Pretul de catalog al bucatii: al combinatiei alese, altfel al produsului. */
function pretulDeCatalog(item: CartItem, regula: RegulaPretCos | undefined): number {
  if (!regula) return item.price;
  const varianta = item.variantTitle ? regula.combos[item.variantTitle] : undefined;
  return varianta != null ? varianta : regula.price;
}

/** Linia intreaga: cat se afiseaza si cat se incaseaza. */
export function pretulLiniei(item: CartItem, regula: RegulaPretCos | undefined): PretLinie {
  const catalog = pretulDeCatalog(item, regula);
  const peTrepte = pretPeTrepte(construiesteTrepte(regula?.tiers, catalog), item.quantity, catalog);

  const pers = personalizarea(item, regula);
  if (!pers) return peTrepte;

  const bucata = round2(pretUnitarCuPersonalizare(pers, peTrepte.unitPrice));
  const faraTrepte = round2(pretUnitarCuPersonalizare(pers, catalog));
  return {
    index: peTrepte.index,
    unitPrice: bucata,
    subtotal: round2(bucata * item.quantity),
    savings: Math.max(0, round2((faraTrepte - bucata) * item.quantity)),
  };
}

/**
 * Mai e configuratia liniei valida fata de definitia de ACUM a produsului?
 *
 * ═══ ⚠ DE CE E O INTREBARE SEPARATA ═══
 *
 * `pretulBucatii` cade pe pretul de catalog cand valorile nu se mai potrivesc — asta opreste
 * minciuna de pret, dar tace. Clientul vede o suma plauzibila si afla abia la finalizare, cand
 * serverul refuza, ca linia nu se poate comanda.
 *
 * Se intampla cand comerciantul schimba definitia dupa ce omul a pus produsul in cos: sterge o
 * optiune, face un camp obligatoriu, stramteaza marginile unei dimensiuni. Nimic din asta nu e
 * vina clientului, si nimic nu i-o spune.
 *
 * ⚠ RASPUNDE `false` SI CAND NU STIM INCA. Preturile ajung in browser asincron; pana atunci
 * `regula` lipseste, iar o linie perfect buna ar fi fost aratata ca stricata. Se cere sa STIM ca
 * nu se potriveste, nu doar sa nu stim ca se potriveste.
 *
 * ⚠ SI NU E O A DOUA JUDECATA DE PRET: intreaba chiar `normalizeazaValorile`, cel pe care il
 * foloseste si pretuirea, si pe care serverul il cheama din nou la comanda. Doua reguli scrise
 * separat s-ar fi departat, iar cosul ar fi strigat pe linii pe care serverul le accepta.
 */
export function cereRevizuire(item: CartItem, regula: RegulaPretCos | undefined): boolean {
  if (!regula) return false;

  /*
   * ═══ ⚠ SI VARIANTA, NU DOAR PERSONALIZAREA ═══
   *
   * Pana pe 08.09.2026 intrebarea asta se uita numai la personalizare. Un tricou „XXL" cu gravura
   * „Robert" al carui XXL a fost stins de comerciant intre timp trecea drept perfect valid:
   * gravura chiar ERA valida, deci semnalul tacea, butonul de finalizare ramanea aprins, iar
   * pretul afisat cadea tacut pe cel al produsului de baza. Abia `placeCartOrder` refuza, cu
   * „Varianta «XXL» nu mai este disponibila", dupa ce omul isi daduse adresa si alesese plata.
   *
   * ⚠ ACEEASI REGULA CA LA POARTA COMENZII (`orders/variant-guard.ts`), cele trei ramuri ale ei:
   * titlu pe un produs fara variante, lipsa de titlu pe unul cu variante, si titlu care nu mai e
   * printre combinatiile active. Scrisa altfel, cosul ar fi strigat pe linii pe care serverul le
   * accepta, sau ar fi tacut pe cele pe care le refuza.
   *
   * ⚠ SE JUDECA INAINTEA PERSONALIZARII, si de aceea `regula` se cere mai sus: o linie poate avea
   * varianta stricata si personalizarea intreaga, iar atunci tot trebuie sa fie marcata.
   */
  const titlu = typeof item.variantTitle === "string" ? item.variantTitle : "";
  if (titlu) {
    /*
     * Nu mai e printre combinatiile ACTIVE: ori a fost stinsa, ori produsul nu mai are variante
     * deloc. Amandoua sunt refuzuri la comanda, si amandoua se vad la fel de aici.
     */
    if (regula.combos[titlu] == null) return true;
  } else if (regula.areVariante === true) {
    /* ⚠ Numai `=== true`: `undefined` inseamna „nu stiu", si pe o presupunere nu se strica un cos. */
    return true;
  }

  const valori = item.customization;
  if (!valori || typeof valori !== "object" || Object.keys(valori).length === 0) return false;
  const definitie = normalizeazaDefinitia(regula.customization);
  /*
   * ⚠ Produsul care nu mai are personalizare DELOC: linia poarta valori pe care definitia de acum
   * nu le mai cunoaste. Serverul o va refuza, deci omul trebuie sa afle acum.
   */
  if (!definitie) return true;
  return !normalizeazaValorile(definitie, valori).ok;
}

/**
 * Personalizarea liniei, scrisa asa cum o citeste OMUL — din definitia produsului.
 *
 * ═══ ⚠ CE REPARA, SI DE CE ERA VIZIBIL PE FIECARE COS ═══
 *
 * `rezumatPersonalizare` din `normalize.ts` lucreaza pe valorile BRUTE, fiindca acolo nu exista
 * definitia. Iar valorile brute nu sunt ce vede omul:
 *
 *   - la `butoane` si `select`, valoarea e ID-ul optiunii — un UUID facut de panou. Clientul citea
 *     in cos „350 x 250 · 91c8409f-8bdf-4a…" in loc de „350 × 250 cm · Premium";
 *   - la `comutator`, valoarea e `true`, iar vechiul rezumat SAREA peste `true` cu totul. Deci
 *     „Protectie impermeabila: Da" nu aparea NICIODATA, desi se si platea;
 *   - dimensiunile ieseau fara unitate, iar numerele fara a lor.
 *
 * Serverul si instantaneul comenzii erau corecte de mult — acolo ID-ul devine „Premium". Minciuna
 * era doar INAINTE de comanda, adica exact acolo unde omul verifica ce cumpara.
 *
 * ⚠ UN SINGUR FORMATOR, si asta e chiar cerinta: sertarul, cele trei pagini de cos si finalizarea
 * il cheama pe acesta. Scrise separat, cele patru ecrane ar fi numit altfel aceleasi alegeri.
 *
 * ⚠ CE SE ARATA CU ETICHETA SI CE NU. „Premium" si „350 × 250 cm" se citesc singure; „Da" nu
 * inseamna nimic fara numele campului. Deci eticheta se pune unde valoarea nu vorbeste singura.
 *
 * ⚠ CADE PE REZUMATUL VECHI cand definitia n-a ajuns inca (preturile vin asincron). Ala arata mai
 * putin, dar arata ceva: doua linii personalizate diferit trebuie sa ARATE diferit chiar si in
 * clipa dinaintea sosirii preturilor, altfel clientul crede ca a apasat de doua ori.
 */
export function rezumatulLiniei(item: CartItem, regula: RegulaPretCos | undefined): string {
  const valori = item.customization;
  if (!valori || typeof valori !== "object" || Object.keys(valori).length === 0) return "";

  const definitie = normalizeazaDefinitia(regula?.customization);
  if (!definitie) return rezumatPersonalizare(valori as Record<string, unknown>);

  const bucati: string[] = [];
  /* Se merge pe ORDINEA CAMPURILOR din definitie, nu pe cea a cheilor trimise de browser. */
  for (const camp of definitie.fields) {
    const v = (valori as Record<string, unknown>)[camp.id];
    if (v === null || v === undefined || v === "" || v === false) continue;

    switch (camp.type) {
      /* ⚠ Lista derulanta e tot `butoane` — un STIL, nu un tip. Vezi `TIP_INVECHIT_SELECT`. */
      case "butoane": {
        const et = (camp.optiuni ?? []).find((o) => o.id === v)?.eticheta;
        /* Optiunea stearsa intre timp: se arata eticheta campului, nu un UUID gol de inteles. */
        bucati.push(et || (typeof v === "string" && (camp.optiuni ?? []).length === 0 ? v : camp.label));
        break;
      }
      case "comutator":
        bucati.push(`${camp.label}: Da`);
        break;
      case "dimensiuni": {
        const o = v as { latime?: unknown; inaltime?: unknown };
        bucati.push(`${o.latime ?? "?"} × ${o.inaltime ?? "?"} ${camp.unitate ?? "cm"}`);
        break;
      }
      case "numar":
        bucati.push(camp.unitate_text ? `${v} ${camp.unitate_text}` : `${camp.label}: ${v}`);
        break;
      case "image":
      case "fisier": {
        const cate = Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "").length : 0;
        if (cate > 0) bucati.push(`${cate} ${cate === 1 ? "fisier" : "fisiere"}`);
        break;
      }
      default:
        /* text, textarea, color: valoarea se citeste singura. Taiata, ca sa nu umple randul. */
        bucati.push(String(v).slice(0, 40));
    }
  }

  return bucati.join(" · ");
}

/**
 * Pretul aratat pentru linia asta e unul pe care NU l-am putut valida la server?
 *
 * ═══ ⚠ DE CE E O A TREIA INTREBARE, PE LANGA PRET SI REVIZUIRE ═══
 *
 * Cand `regula` lipseste, `pretulLiniei` cade pe `item.price`. Pentru un produs obisnuit aia e o
 * purtare buna: pretul de catalog salvat la adaugare, poate vechi de-o zi, dar din aceeasi lume cu
 * cel adevarat. Un cos care arata ceva usor vechi e mai bun decat unul care nu arata nimic.
 *
 * ⚠ PENTRU O LINIE PERSONALIZATA E CU TOTUL ALTCEVA. Acolo `item.price` e pretul de BAZA, salvat
 * dinadins fara supliment: fototapetul de 3,5 x 2,5 m cu Premium si protectie costa 910 lei si are
 * `price: 89`. Nu e „usor vechi", e alt ordin de marime. Clientul vedea 89, apasa, si comanda
 * pleca cu 910. Serverul nu putea fi pacalit nicio clipa, dar omului i se aratase un numar pe care
 * nimeni nu-l onora.
 *
 * ⚠ SI `cereRevizuire` NU ACOPERA CAZUL: ea raspunde `false` cand `regula` lipseste, dinadins,
 * fiindca „nu stiu inca" nu inseamna „stricat". Aceeasi lipsa are insa PATRU pricini care nu se
 * deosebesc din afara: preturile inca se incarca, cererea a picat, produsul a fost sters, sau
 * produsul n-a venit in raspuns. Prima e trecatoare; celelalte trei nu trec niciodata singure.
 *
 * Deci intrebarea de aici nu e „e stricata linia", ci „am voie sa arat un pret pentru ea". Ce se
 * face cu raspunsul, tine de ecran: cosul scrie „se valideaza" in loc de suma, iar finalizarea nu
 * se lasa apasata.
 *
 * ⚠ NUMAI PENTRU LINIILE CU PERSONALIZARE. Un produs obisnuit nu se opreste dintr-o cerere picata:
 * ar fi insemnat sa nu se mai poata comanda nimic pe platforma la o clipire de retea.
 */
export function pretulNevalidat(item: CartItem, regula: RegulaPretCos | undefined): boolean {
  const valori = item.customization;
  if (!valori || typeof valori !== "object" || Object.keys(valori).length === 0) return false;
  return !regula;
}

/**
 * Ne putem lega de pretul acestei linii?
 *
 * ═══ ⚠ DOUA FELURI DE „NU", O SINGURA URMARE ═══
 *
 * `pretulNevalidat` spune „inca nu stiu, sau n-am aflat": preturile se incarca, cererea a picat,
 * produsul n-a venit in raspuns. `cereRevizuire` spune „stiu, si e stricat": marimea a fost stinsa,
 * optiunea a disparut, campul a devenit obligatoriu.
 *
 * Pentru OM cele doua sunt lucruri diferite si trebuie sa scrie altceva pe ecran, „se verifica
 * pretul" fata de „necesita actualizare". Pentru SUME insa sunt acelasi lucru: in amandoua cazurile
 * linia intra in total cu pretul ei de BAZA, iar el poate fi 89 in loc de 910. Un total socotit cu
 * el e un numar plauzibil si gresit, la fel de gresit din amandoua pricinile.
 *
 * ⚠ DE-AIA EXISTA INTREBAREA ASTA A TREIA. Fara ea, fiecare ecran ar fi trebuit sa-si aduca aminte
 * sa le puna pe amandoua, iar primul care uita una lasa exact jumatate din gaura deschisa. Asa s-a
 * si intamplat: dupa ce s-a inchis cazul „nevalidat", cazul „de revizuit" a mai aratat o vreme un
 * pret de catalog in cos si lasa „Comanda acum" sa plece cu o linie pe care serverul o refuza.
 *
 * ⚠ CE SE FACE CU RASPUNSUL tine de ecran: pretul liniei si TOATE sumele care o contin se ascund,
 * iar butoanele de comanda nu pleaca. Textul de langa ele ramane deosebit, ca omul sa stie daca are
 * de asteptat sau de reparat.
 */
export function pretulNesigur(item: CartItem, regula: RegulaPretCos | undefined): boolean {
  return pretulNevalidat(item, regula) || cereRevizuire(item, regula);
}
