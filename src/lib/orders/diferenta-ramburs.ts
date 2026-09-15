/**
 * Cat din diferenta dintre marfa incasata si rambursul declarat la cotare e SUBDECLARARE,
 * si cat e gaura noastra de unitati.
 *
 * ═══ ⚠ JURNALUL CARE MASURA DEFECTUL ERA EL INSUSI STRICAT ═══
 *
 * Pana pe 14.09.2026, `placeOrder` si `placeCartOrder` comparau `marfaIncasata` cu
 * `cod_declarat` si scriau `rambursSubdeclarat` la orice diferenta peste un leu. Comentariul de
 * deasupra se apara chiar de capcana unitatilor, scriind „se compara MARFA cu MARFA", si tot in
 * ea cadea.
 *
 * Masurat in jurnal: 17 randuri intre 05.08 si 10.09.2026. NICIUNUL nu era subdeclarare.
 *
 *   * `OrderModal` trimite `cod_declarat: subtotal`, care contine bump-urile si companionii, dar
 *     NU extraoptiunile;
 *   * checkout-ul trimite `cod_declarat: total` din cos, care nu contine NICI bump-urile, NICI
 *     extraoptiunile;
 *   * iar serverul compara cu `subtotal + extrasTotal - reduceri`, care le contine pe amandoua.
 *
 * Dovada in comenzi reale: #0227, #0219 si #0207 poarta o extraoptiune de 5 lei, de unde cele
 * unsprezece diferente de fix 5,00; #0160 si #0084 poarta un bump de 55 de lei.
 *
 * ⚠ O diferenta care se repeta la o valoare FIXA nu e comportament de om, e o constanta din
 * codul tau.
 *
 * ═══ ⚠ CE NU FACE FUNCTIA ASTA, SI DE CE ═══
 *
 * NU ascunde felia explicabila, si asta e important. Cererea de cotatie chiar pleaca cu o suma
 * mai mica decat se incaseaza la usa, iar aceea e constatarea SYS-P1-03 din auditul curierilor,
 * inca deschisa. Daca jurnalul ar fi fost pur si simplu facut sa taca pe extraoptiuni si bump-uri,
 * am fi vindecat termometrul, nu febra.
 *
 * De aceea `explicabil` se intoarce separat si se scrie in detaliile randului, ori de cate ori
 * randul chiar se scrie. Ce se schimba e PRAGUL: se aprinde doar pentru `nelamurit`.
 *
 * Cat costa felia explicabila pe tot magazinul se afla printr-o interogare peste comenzi, nu
 * printr-un rand pe fiecare comanda: jurnalul asta e scris dintr-un capat public anonim, si
 * fiecare rand in plus e un rand pe care il poate cere oricine.
 *
 * ═══ ⚠ CAT COSTA FELIA EXPLICABILA, MASURAT PE 15.09.2026 ═══
 *
 * Randul de mai sus spune ca suma se afla printr-o interogare peste comenzi, nu printr-un rand pe
 * fiecare comanda. S-a facut interogarea, si raspunsul schimba ordinea de lucru:
 *
 *     extraoptiunile sunt liniile cu `product_id` care incepe cu `extra_`
 *     21 de comenzi le poarta, din 09.07 pana in 10.09.2026; 16 sunt cu ramburs
 *     105 lei in total, din care 80 pe comenzi cu ramburs
 *
 * ⚠ Deci felia care iese din suma cotata e de **80 de lei pe doua luni**, iar ce pierde
 * comerciantul din ea nu e suma, ci COMISIONUL de ramburs pe ea: cateva procente, adica ordinul
 * catorva lei pe toata viata platformei.
 *
 * Inchiderea ei ar cere ca amandoua formularele de checkout sa trimita la cotare o suma care
 * cuprinde extraoptiunile, adica o schimbare pe drumul cel mai circulat al platformei, acolo unde
 * se vad preturile cumparatorilor. Nu se justifica la cifra asta. Se remasoara, nu se copiaza:
 * interogarea e scrisa mai sus, iar daca magazinele incep sa vanda extraoptiuni scumpe, raspunsul
 * se schimba.
 *
 * ⚠ SI JURNALUL REPARAT A FOST REMASURAT, tot pe 15.09.2026: ZERO randuri
 * `rambursSubdeclarat` de la reparatia din 14.09 incoace, pe 27 de comenzi din care 9 cu ramburs.
 * Zeroul nu e un zero de scriere: jurnalul a scris in aceeasi fereastra 10 randuri, de trei feluri.
 * E un esantion mic, deci nu inchide SYS-P1-03; e doar prima masuratoare facuta cu termometrul bun.
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface DiferentaRamburs {
  /**
   * Partea din diferenta care e in afara sumei cotate PRIN PROIECTARE: extraoptiunile, si
   * bump-urile acolo unde formularul nu le declara. Nu e vina clientului si nu e semnal.
   */
  explicabil: number;
  /**
   * Ce ramane dupa ce se scade partea explicabila. DOAR asta e subdeclarare, si doar pe asta se
   * aprinde jurnalul.
   */
  nelamurit: number;
}

export interface IntrareDiferentaRamburs {
  /** `subtotal + extrasTotal - reduceri`, asa cum il socoteste serverul. */
  marfaIncasata: number;
  /** `cod_declarat`, adica suma cu care s-a cerut chiar cotatia. */
  declarat: number;
  /** Extraoptiunile validate pe server. Nu intra in `cod_declarat` in NICIUNUL din formulare. */
  extrasTotal: number;
  /**
   * ⚠ Venitul bump-urilor repretuite pe server, SI NU E ACELASI IN CELE DOUA LOCURI.
   *
   * `placeOrder` (OrderModal) trimite ZERO: acolo `cod_declarat` e chiar `subtotal`-ul din
   * browser, care contine deja bump-urile, deci scazandu-le a doua oara am ierta o subdeclarare
   * adevarata de exact atat.
   *
   * `placeCartOrder` (checkout) trimite suma adevarata: acolo `cod_declarat` e totalul cosului,
   * care nu le contine.
   *
   * Cine „uniformizeaza" cele doua chemari strica jumatate din masuratoare, in tacere. De aceea
   * exista o proba care se uita la APELANTI, nu doar la functia asta.
   */
  venitBumpuri: number;
}

export function diferentaDeRamburs(a: IntrareDiferentaRamburs): DiferentaRamburs {
  /*
   * ⚠ Numai valorile POZITIVE se scad. O intrare stricata sau negativa (un extra cu pret negativ,
   * un venit socotit gresit) nu are voie sa MAREASCA partea nelamurita si sa nasca un semnal fals:
   * greseala se face in favoarea tacerii, fiindca randul asta acuza un client.
   */
  const explicabil = round2(Math.max(0, round2(a.extrasTotal)) + Math.max(0, round2(a.venitBumpuri)));
  const nelamurit = round2(round2(a.marfaIncasata) - round2(a.declarat) - explicabil);
  return { explicabil, nelamurit };
}
