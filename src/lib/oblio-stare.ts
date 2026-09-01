/*
  ═══════════════════════════════════════════════════════════════════════════════
  HOTARARILE DESPRE STAREA INTEGRARII OBLIO, SCOASE DIN COMPONENTA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA FISIERUL ASTA. Aceleasi hotarari traiau in `OblioConfigClient`,
  amestecate cu randarea. Probele lor nu puteau decat sa CAUTE TEXT in sursa —
  si o proba care cauta text a lasat sa treaca verzi sase mutatii din noua,
  printre care stergerea unui singur `return;` care oprea salvarea. Aici sunt
  functii curate, care se CHEAMA in probe, nu se citesc.

  ⚠ SI O DEOSEBIRE CARE A COSTAT O REPARATIE INTREAGA: „n-am putut intreba" nu e
  acelasi lucru cu „contul n-are stocuri". Amandoua aratau ca lista goala, si din
  cauza asta o gestiune deja aleasa se putea sterge singura. Vezi `ListaGestiuni`.
*/

export type GestiuneOblio = { name: string; tip: string };

/**
 * Gestiunile contului, cu TREI intelesuri, nu doua:
 *
 *   `null`  — N-AM PUTUT INTREBA. Nomenclatorul a picat, sau nu l-am cerut inca
 *             (pagina abia s-a deschis). Nu stim nimic, deci nu acuzam si nu
 *             stergem nimic.
 *   `[]`    — CONTUL N-ARE STOCURI. Raspuns bun al furnizorului. Campul nu se
 *             arata, gestiunea nu se cere, nu se trimite nimic pe factura.
 *   lista   — CONTUL ARE STOCURI. Gestiunea devine obligatorie.
 *
 * ⚠ Confuzia dintre primele doua e chiar defectul pe care fisierul asta il
 * opreste. `catch(() => [])` o producea: un refuz al furnizorului se citea drept
 * „nu i se aplica" si integrarea parea sanatoasa.
 */
export type ListaGestiuni = GestiuneOblio[] | null;

export type IntrareStare = {
  clientId: string;
  cif: string;
  seriesInvoice: string;
  enabled: boolean;
  management: string;
  gestiuni: ListaGestiuni;
};

export type StareOblio = {
  /** Acreditarile si seria sunt puse, SI nu lipseste nimic obligatoriu. */
  complet: boolean;
  /** Complet SI comutatorul pornit. Doar asa se poate emite o factura. */
  activ: boolean;
  /** Contul cere gestiune si omul n-a ales una. Factura ar fi refuzata sigur. */
  lipsesteGestiunea: boolean;
  /** Salvarea are voie sa plece. */
  poateSalva: boolean;
};

/**
 * Contul cere gestiune? Numai o lista NEGOALA inseamna da.
 *
 * ⚠ `null` da FALS dinadins: nestiind, nu punem in carca omului un camp pe care
 * poate nici nu-l are. Pretul e ca la deschiderea paginii, inainte sa apucam sa
 * intrebam, nu stim — de aceea pagina intreaba singura la montare.
 */
export function gestiuneaECeruta(gestiuni: ListaGestiuni): gestiuni is GestiuneOblio[] {
  /*
    ⚠ E SI INGUSTARE DE TIP, dinadins. Randarea campului si `gestiuni.map` de
    dupa ea trebuie sa fie acelasi rationament, nu doua verificari care pot
    ajunge sa nu mai fie de acord. Afirmatia e cinstita: cand da adevarat, chiar
    E o lista — spre deosebire de un `as`, care ar taia paza fara sa dovedeasca.
  */
  return Array.isArray(gestiuni) && gestiuni.length > 0;
}

/**
 * Ce alegere se pastreaza cand soseste o lista noua de gestiuni.
 *
 * ⚠ REGULA CARE LIPSEA: o lista goala sau necunoscuta NU STERGE alegerea de
 * dinainte. Varianta veche facea `setManagement("")` ori de cate ori alegerea nu
 * se regasea in lista sosita — deci un nomenclator cazut stergea tacut gestiunea
 * salvata, si urmatoarea salvare pleca fara ea.
 */
export function alegeGestiunea(gestiuni: ListaGestiuni, aleasaAcum: string): string {
  if (!Array.isArray(gestiuni) || gestiuni.length === 0) return aleasaAcum;
  // Una singura nu e o alegere — se pune singura.
  if (gestiuni.length === 1) return gestiuni[0].name;
  // Alegerea veche mai exista in lista noua? Se tine. Altfel, alege omul.
  return gestiuni.some(g => g.name === aleasaAcum) ? aleasaAcum : "";
}

/**
 * Gestiunea salvata NU se pierde la o resalvare care n-o trimite.
 *
 * ⚠ PLASA DE PE SERVER, si e acolo fiindca cea din browser s-a dovedit ocolibila:
 * campul de gestiune se arata doar dupa ce pagina citeste nomenclatorul, iar pana
 * la 01.09.2026 nomenclatorul se citea doar la apasarea unui buton. Cine salva
 * fara sa-l apese trimitea un config fara `management`, si cel salvat inainte
 * disparea. S-a intamplat in productie DUPA ce campul era deja desfasurat.
 *
 * ⚠ Se cheama pe server dinadins: acolo nu poate fi ocolita de nicio cale din
 * browser. Stergerea intentionata trece prin `disconnectOblio`, care sterge tot
 * configul si nu vine pe aici.
 */
export function pastreazaGestiunea<T extends { management?: string }>(
  nou: T,
  vechi: { management?: string } | null | undefined,
): T {
  const veche = vechi?.management?.trim();
  if (nou.management?.trim() || !veche) return nou;
  return { ...nou, management: veche };
}

/**
 * Starea intreaga, dintr-o singura privire.
 *
 * ⚠ `complet` NUMARA SI GESTIUNEA. Fara asta, caseta verde „Oblio activ —
 * facturile se pot emite" se aprindea pentru un cont caruia Oblio ii refuza
 * fiecare factura. Masurat pe VetDepo la 01.09.2026: comutator pornit, toate
 * campurile puse, gestiune absenta, patru facturi refuzate, caseta verde.
 */
export function stareOblio(x: IntrareStare): StareOblio {
  const bazaPusa = !!(x.clientId && x.cif && x.seriesInvoice);
  const lipsesteGestiunea = gestiuneaECeruta(x.gestiuni) && !x.management.trim();
  const complet = bazaPusa && !lipsesteGestiunea;
  return {
    complet,
    activ: complet && x.enabled,
    lipsesteGestiunea,
    // ⚠ Doar gestiunea lipsa opreste salvarea. Comutatorul stins e o alegere
    // legitima — se avertizeaza, nu se opreste.
    poateSalva: !lipsesteGestiunea,
  };
}
