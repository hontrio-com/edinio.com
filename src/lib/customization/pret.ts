import type { CampPersonalizare, DefinitiePersonalizare, Impact } from "./definitie";
import { MAX_LATURA_M, suprafataFacturata, suprafataM2 } from "./suprafata";
import type { ValoareCamp } from "./valori";

/**
 * Cat costa personalizarea.
 *
 * ═══ ⚠ CE INTRA SI CE NU IESE DE AICI ═══
 *
 * Intra: definitia AUTORITARA a produsului (din `page_sections`, citita de server sau primita de
 * pagina) si valorile CURATATE ale clientului. Iese o suma pe bucata, plus defalcarea ei.
 *
 * ⚠ NU intra niciun pret trimis de browser. Clientul trimite ce a ALES, nu cat costa — la fel ca
 * la extraoptiunile de checkout (`validateExtras`), unde serverul pastreaza doar `id`-ul si pune
 * el pretul. Un pret venit din browser n-are cum sa fie verificat: singurul lucru cu care s-ar
 * putea compara e chiar calculul asta.
 *
 * ⚠ Acelasi modul ruleaza in browser (pentru pretul care se schimba sub ochii clientului) si pe
 * server (pentru cel care se incaseaza). Doua implementari ar fi divergit, iar divergenta s-ar fi
 * vazut ca „pe pagina scria 910, pe factura 89".
 */

/** ⚠ Copie locala, ca in restul proiectului: acelasi `round2` sta scris in 22 de fisiere. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface RandDefalcare {
  eticheta: string;
  suma: number;
  /** „8,75 m² x 89 lei/m²" — pentru ecranul comerciantului si pentru comanda. */
  detaliu?: string;
}

export interface RezultatPret {
  /** Cat se ADAUGA pe bucata, peste pretul de catalog. Niciodata negativ. */
  supliment: number;
  /**
   * `false` doar in modul „suprafata" cu baza stinsa: atunci pretul de catalog NU se incaseaza.
   *
   * ⚠ E un steag, nu o scadere. Scazut din supliment, un pret de catalog mai mare decat suprafata
   * ar fi dus linia sub zero, si de acolo incolo fiecare socoteala din platforma — TVA, prag de
   * transport, ramburs — ar fi primit un numar in care nu crede.
   */
  bazaInclusa: boolean;
  /** Suprafata reala, in m². Lipseste cand produsul nu se socoteste pe suprafata. */
  aria?: number;
  /** Cat se factureaza din ea, dupa minim si rotunjire. */
  ariaFacturata?: number;
  /** Tariful principal folosit, lei/m². */
  tarifM2?: number;
  defalcare: RandDefalcare[];
}

/** Pretul unitar final, din baza de catalog si rezultatul personalizarii. */
export function pretUnitar(rezultat: RezultatPret, bazaPeBucata: number): number {
  const baza = rezultat.bazaInclusa ? Number(bazaPeBucata) || 0 : 0;
  return Math.max(0, baza + rezultat.supliment);
}

/** Suprafata scrisa asa cum o citeste omul. */
function caM2(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2).replace(".", ",")} m²`;
}

function caBani(n: number): string {
  return String(round2(n)).replace(".", ",");
}

/** Impactul ales de client pentru un camp — de pe optiune la `butoane`, de pe camp la restul. */
function impactulAles(camp: CampPersonalizare, v: ValoareCamp | undefined): Impact | undefined {
  if (v === undefined) return undefined;
  if (camp.type === "butoane") {
    if (v.fel !== "optiune") return undefined;
    return (camp.optiuni ?? []).find((o) => o.id === v.id)?.impact;
  }
  /*
   * ⚠ Un comutator STINS nu costa. Fara verificarea asta, pretul s-ar fi adunat si cand clientul a
   * raspuns „nu" — iar el ar fi vazut suma crescand la o alegere pe care tocmai a refuzat-o.
   */
  if (camp.type === "comutator" && (v.fel !== "pornit" || !v.pornit)) return undefined;
  return camp.impact;
}

/**
 * Din ce camp se socoteste suprafata.
 *
 * In modul „suprafata" e cel numit de comerciant. In modul „adaugat" — unde tot pot exista
 * suplimente pe m² — e singurul camp de dimensiuni, daca exista exact unul.
 *
 * ⚠ Cu doua campuri de dimensiuni si niciunul numit, se intoarce `undefined`: o alegere „primul
 * din lista" ar fi fost stabila pana cand cineva reordoneaza campurile, si atunci pretul s-ar fi
 * schimbat singur, pe un produs pe care nimeni nu l-a atins.
 */
export function campulDeSuprafata(definitie: DefinitiePersonalizare): CampPersonalizare | undefined {
  const mod = definitie.pret;
  if (mod?.fel === "suprafata") {
    return definitie.fields.find((c) => c.id === mod.campDimensiuni && c.type === "dimensiuni");
  }
  const dims = definitie.fields.filter((c) => c.type === "dimensiuni");
  return dims.length === 1 ? dims[0] : undefined;
}

/**
 * Campurile care CER o suprafata si n-o au.
 *
 * ═══ ⚠ CE COSTA CAND NIMENI NU INTREABA ASTA ═══
 *
 * `pretulPersonalizarii` SARE un supliment pe m² cand nu exista suprafata — si o face dinadins:
 * la nivelul socotelii, „nu incasez nimic" e mai putin rau decat „inventez un numar". Dar sarita
 * acolo si nespusa nicaieri, alegerea aia devine TACERE.
 *
 * Masurat pe patru configurari, inainte de reparatie, cu „Protectie impermeabila +15 lei/m²":
 *
 *     pe_m2 fara camp de dimensiuni      -> supliment 0 | PRET 100 | la salvare: TRECE
 *     pe_m2 cu DOUA campuri de dimensiuni -> supliment 0 | PRET 100 | la salvare: TRECE
 *     pe_m2 cu camp optional necompletat  -> supliment 0 | PRET 100 | la salvare: TRECE
 *     MARTOR, dimensiuni completate       -> supliment 131,25 | PRET 231,25
 *
 * Comerciantul configureaza tariful, il vede salvat, si incaseaza zero. Clientul primeste marfa
 * cu protectie fara s-o plateasca, si nimeni nu afla — pana la inventar.
 *
 * ⚠ SE INTREABA DESPRE ALEGEREA CLIENTULUI, nu despre configurare. Un `pe_m2` pus pe o optiune
 * pe care nimeni n-a ales-o nu cere nimic; abia cand omul bifeaza protectia are nevoie de metri.
 * Asa dimensiunile pot ramane OPTIONALE pentru cine nu cumpara nimic pe metru.
 *
 * Configurarea in care suprafata nu se poate afla NICIODATA (zero campuri de dimensiuni, sau doua
 * si niciunul numit) se opreste in alta parte: la SALVARE, in `problemaPersonalizarii`. Acolo e
 * greseala comerciantului, si tot el trebuie s-o repare.
 */
export function campurileFaraSuprafata(
  definitie: DefinitiePersonalizare,
  valori: Map<string, ValoareCamp>,
): CampPersonalizare[] {
  const campDim = campulDeSuprafata(definitie);
  const v = campDim ? valori.get(campDim.id) : undefined;
  const areSuprafata =
    !!campDim && v?.fel === "dimensiuni"
    && suprafataM2(v.latime, v.inaltime, campDim.unitate ?? "cm") !== null;
  if (areSuprafata) return [];

  const out: CampPersonalizare[] = [];
  for (const camp of definitie.fields) {
    if (campDim && camp.id === campDim.id) continue;
    /* Campul-sursa de tarif nu intra: in modul „suprafata" el DA tariful, nu un supliment. */
    if (definitie.pret?.fel === "suprafata" && camp.id === definitie.pret.campTarif) continue;
    const imp = impactulAles(camp, valori.get(camp.id));
    if (imp?.fel === "pe_m2" && imp.suma > 0) out.push(camp);
  }
  return out;
}

export function pretulPersonalizarii(
  definitie: DefinitiePersonalizare,
  valori: Map<string, ValoareCamp>,
): RezultatPret {
  const mod = definitie.pret ?? { fel: "adaugat" as const };
  const defalcare: RandDefalcare[] = [];

  /* ── Suprafata ───────────────────────────────────────────────────────────── */

  const campDim = campulDeSuprafata(definitie);
  let aria: number | undefined;
  let ariaFacturata: number | undefined;

  if (campDim) {
    const v = valori.get(campDim.id);
    if (v?.fel === "dimensiuni") {
      const a = suprafataM2(v.latime, v.inaltime, campDim.unitate ?? "cm");
      if (a !== null) {
        aria = a;
        ariaFacturata = suprafataFacturata(
          a,
          mod.fel === "suprafata" ? mod.minimM2 : undefined,
          mod.fel === "suprafata" ? mod.rotunjire : undefined,
        );
      }
    }
  }

  /*
   * ⚠ Fara suprafata, in modul „suprafata" nu se poate socoti NIMIC — si atunci nu se vinde la
   * pretul de baza, ci nu se vinde deloc: `supliment` ramane 0 SI baza ramane inclusa, deci linia
   * costa cat catalogul. Refuzul propriu-zis vine din `normalizeazaValorile`, care marcheaza
   * dimensiunile lipsa ca o constatare — deci comanda nici nu ajunge aici cu ele goale.
   *
   * Perechea asta e dinadins: calculul nu inventeaza un pret, iar poarta care opreste comanda sta
   * intr-un singur loc.
   */
  const m2 = ariaFacturata ?? 0;

  /* ── Tariful principal ───────────────────────────────────────────────────── */

  let tarifM2: number | undefined;
  let campTarifId: string | undefined;

  if (mod.fel === "suprafata") {
    tarifM2 = mod.tarif;
    if (mod.campTarif) {
      campTarifId = mod.campTarif;
      const camp = definitie.fields.find((c) => c.id === mod.campTarif);
      const v = camp ? valori.get(camp.id) : undefined;
      const imp = camp ? impactulAles(camp, v) : undefined;
      /*
       * ⚠ Optiunea aleasa INLOCUIESTE tariful, nu se adauga peste el. „Premium 89 lei/m²" inseamna
       * ca metrul patrat costa 89, nu ca mai costa 89 pe langa tariful de baza. Adunate, un
       * fototapet Premium ar fi iesit la 69+89 = 158 lei/m², adica de doua ori pretul afisat.
       */
      if (imp?.fel === "pe_m2") tarifM2 = imp.suma;
    }
  }

  /* ── Suplimentele ────────────────────────────────────────────────────────── */

  let supliment = 0;

  if (mod.fel === "suprafata" && tarifM2 !== undefined && m2 > 0) {
    const suma = round2(m2 * tarifM2);
    supliment += suma;
    const camp = campTarifId ? definitie.fields.find((c) => c.id === campTarifId) : undefined;
    const v = camp ? valori.get(camp.id) : undefined;
    const numeOptiune =
      camp && v?.fel === "optiune"
        ? (camp.optiuni ?? []).find((o) => o.id === v.id)?.eticheta
        : undefined;
    defalcare.push({
      eticheta: numeOptiune || camp?.label || "Suprafata",
      suma,
      detaliu: `${caM2(m2)} x ${caBani(tarifM2)} lei/m²`,
    });
  }

  for (const camp of definitie.fields) {
    /* Campul care da tariful principal e deja socotit mai sus; adunat iar, s-ar plati de doua ori. */
    if (mod.fel === "suprafata" && camp.id === campTarifId) continue;

    const v = valori.get(camp.id);
    const imp = impactulAles(camp, v);
    if (!imp || imp.fel === "fara" || imp.suma <= 0) continue;

    if (imp.fel === "fix") {
      supliment += imp.suma;
      defalcare.push({ eticheta: camp.label, suma: round2(imp.suma) });
      continue;
    }
    /*
     * ⚠ Un supliment pe m² fara suprafata NU se socoteste ca zero tacut si nici nu se preface in
     * suma fixa: se sare. Un „+15 lei/m²" pe un produs fara camp de dimensiuni e o greseala de
     * configurare a comerciantului, iar cel mai putin rau lucru e sa nu incasam nimic pentru ea.
     */
    if (m2 > 0) {
      const suma = round2(m2 * imp.suma);
      supliment += suma;
      defalcare.push({
        eticheta: camp.label,
        suma,
        detaliu: `${caM2(m2)} x ${caBani(imp.suma)} lei/m²`,
      });
    }
  }

  return {
    supliment: round2(Math.max(0, supliment)),
    bazaInclusa: mod.fel === "suprafata" ? mod.includePretulProdusului : true,
    ...(aria !== undefined ? { aria } : {}),
    ...(ariaFacturata !== undefined ? { ariaFacturata } : {}),
    ...(tarifM2 !== undefined ? { tarifM2 } : {}),
    defalcare,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PODEAUA: cat costa produsul asta cand clientul alege TOT ce e mai ieftin
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Valorile CELE MAI IEFTINE pe care le poate alege un client, sau `null` cand nu se pot afla.
 *
 * ⚠ NU E O A DOUA FORMULA DE PRET. Aici se ALEG doar valorile; pretul iese tot din
 * `pretulPersonalizarii`, acelasi motor care incaseaza. Doua formule s-ar fi departat, si atunci
 * cardul ar fi promis un numar pe care casa nu-l recunoaste.
 *
 * Regulile, si de ce fiecare:
 *  - `dimensiuni`: laturile MINIME. Ele exista mereu in modul „suprafata" (vezi `citestePret`:
 *    fara margini si fara suprafata minima facturabila modul cade pe „adaugat"), iar cand lipsesc
 *    dar exista `minimM2`, orice latura mica da chiar minimul.
 *  - `comutator`: STINS. O bifa neatinsa nu costa nimic, si nimeni nu e obligat s-o apese.
 *  - `butoane` OPTIONAL: nealese. Cea mai ieftina alegere e „niciuna".
 *  - `butoane` OBLIGATORIU (si campul-sursa de tarif, care e obligatoriu de la `citestePret`):
 *    optiunea care costa cel mai putin CU ADEVARAT, nu nominal — `pe_m2` se inmulteste intai cu
 *    suprafata de podea, altfel „1 leu/m²" ar fi parut mai ieftin decat „5 lei fix" pe 8,75 m².
 *  - restul campurilor OBLIGATORII cu impact: se pun completate, fiindca clientul nu le poate sari.
 *    Valoarea in sine nu conteaza — `impactulAles` se uita doar daca EXISTA una.
 */
function valoriDePodea(definitie: DefinitiePersonalizare): Map<string, ValoareCamp> | null {
  const mod = definitie.pret ?? { fel: "adaugat" as const };
  const valori = new Map<string, ValoareCamp>();
  const campDim = campulDeSuprafata(definitie);
  const campTarifId = mod.fel === "suprafata" ? mod.campTarif : undefined;

  let m2 = 0;
  if (campDim) {
    const lat = campDim.latime?.min ?? 1;
    const inalt = campDim.inaltime?.min ?? 1;
    const a = suprafataM2(lat, inalt, campDim.unitate ?? "cm");
    /* In modul „suprafata" fara suprafata nu exista pret de jos — nu se ghiceste unul. */
    if (a === null) { if (mod.fel === "suprafata") return null; }
    else {
      m2 = suprafataFacturata(
        a,
        mod.fel === "suprafata" ? mod.minimM2 : undefined,
        mod.fel === "suprafata" ? mod.rotunjire : undefined,
      );
      valori.set(campDim.id, { fel: "dimensiuni", latime: lat, inaltime: inalt });
    }
  } else if (mod.fel === "suprafata") {
    return null;
  }

  /** Cat costa cu adevarat un impact, la suprafata de podea. */
  const cost = (imp: Impact | undefined): number => {
    if (!imp || imp.fel === "fara" || imp.suma <= 0) return 0;
    return imp.fel === "pe_m2" ? imp.suma * m2 : imp.suma;
  };

  for (const camp of definitie.fields) {
    if (campDim && camp.id === campDim.id) continue;
    if (camp.type === "comutator") continue;

    if (camp.type === "butoane") {
      const optiuni = camp.optiuni ?? [];
      if (!optiuni.length) continue;
      const eSursa = camp.id === campTarifId;
      if (!camp.required && !eSursa) continue;
      /*
       * ⚠ La campul-sursa, o optiune FARA `pe_m2` inseamna „tariful de baza", nu „gratis" — deci
       * costul ei e `tarif x m2`, nu zero. Socotita gratis, podeaua ar fi iesit sub orice pret
       * pe care il poate plati cineva.
       */
      const costulOptiunii = (o: { impact?: Impact }): number =>
        eSursa && mod.fel === "suprafata" && o.impact?.fel !== "pe_m2"
          ? mod.tarif * m2
          : cost(o.impact);
      let cea = optiuni[0];
      for (const o of optiuni) if (costulOptiunii(o) < costulOptiunii(cea)) cea = o;
      valori.set(camp.id, { fel: "optiune", id: cea.id });
      continue;
    }

    if (!camp.required) continue;
    valori.set(camp.id, { fel: "text", text: "" });
  }

  return valori;
}

/**
 * Cel mai mic pret pe bucata pe care il poate plati cineva, sau `null` cand nu se poate afla.
 *
 * ═══ ⚠ DE CE E NEVOIE DE EL ═══
 *
 * `products.price` a incetat sa mai fie pretul produsului in ziua in care personalizarea a
 * capatat pret. La un fototapet cu `includePretulProdusului` STINS — configurarea pe care chiar
 * panoul o recomanda — pretul de catalog nu se incaseaza deloc: nu e nici pret de vanzare, nici
 * pret de pornire, nu e nimic. Si tocmai el pleaca azi pe cardul din grila, in sortare, in filtrul
 * de pret, in insigna de reducere, in JSON-LD, in Google Merchant si in catalogul Meta.
 *
 * Masurat pe exemplul din proiect: card „89,00 lei", pagina „603,75 lei". De 6,8 ori mai mult,
 * intre doua ecrane, fara ca omul sa fi atins nimic.
 *
 * ⚠ `null` inseamna „nu stiu", si atunci apelantul nu schimba nimic — nu inseamna „nu costa".
 */
export function podeaPersonalizarii(
  definitie: DefinitiePersonalizare,
  bazaPeBucata: number,
): number | null {
  const valori = valoriDePodea(definitie);
  if (!valori) return null;
  return pretUnitar(pretulPersonalizarii(definitie, valori), bazaPeBucata);
}

/**
 * Valorile CELE MAI SCUMPE pe care le poate alege un client — oglinda podelei.
 *
 * ⚠ Aceleasi reguli, intoarse: laturile la MAXIM, comutatoarele PORNITE, iar la `butoane`
 * optiunea cea mai scumpa — si la campurile OBLIGATORII, si la cele optionale, fiindca omul le
 * poate alege pe amandoua. Restul e identic cu `valoriDePodea`, inclusiv trucul pentru campul-sursa
 * de tarif, unde o optiune fara `pe_m2` inseamna „tariful de baza", nu „gratis".
 */
function valoriDePlafon(definitie: DefinitiePersonalizare): Map<string, ValoareCamp> | null {
  const mod = definitie.pret ?? { fel: "adaugat" as const };
  const valori = new Map<string, ValoareCamp>();
  const campDim = campulDeSuprafata(definitie);
  const campTarifId = mod.fel === "suprafata" ? mod.campTarif : undefined;

  let m2 = 0;
  if (campDim) {
    /*
     * ⚠ Laturile NEMARGINITE dau un plafon urias, dar FINIT (`MAX_LATURA_M`). El nu ajunge
     * niciodata intr-un numar afisat — se foloseste doar ca sa se raspunda „poate creste?".
     */
    const lat = campDim.latime?.max ?? MAX_LATURA_M * 100;
    const inalt = campDim.inaltime?.max ?? MAX_LATURA_M * 100;
    const a = suprafataM2(lat, inalt, campDim.unitate ?? "cm");
    if (a === null) { if (mod.fel === "suprafata") return null; }
    else {
      m2 = suprafataFacturata(
        a,
        mod.fel === "suprafata" ? mod.minimM2 : undefined,
        mod.fel === "suprafata" ? mod.rotunjire : undefined,
      );
      valori.set(campDim.id, { fel: "dimensiuni", latime: lat, inaltime: inalt });
    }
  } else if (mod.fel === "suprafata") {
    return null;
  }

  const cost = (imp: Impact | undefined): number => {
    if (!imp || imp.fel === "fara" || imp.suma <= 0) return 0;
    return imp.fel === "pe_m2" ? imp.suma * m2 : imp.suma;
  };

  for (const camp of definitie.fields) {
    if (campDim && camp.id === campDim.id) continue;

    if (camp.type === "butoane") {
      const optiuni = camp.optiuni ?? [];
      if (!optiuni.length) continue;
      const eSursa = camp.id === campTarifId;
      const costulOptiunii = (o: { impact?: Impact }): number =>
        eSursa && mod.fel === "suprafata" && o.impact?.fel !== "pe_m2"
          ? mod.tarif * m2
          : cost(o.impact);
      let cea = optiuni[0];
      for (const o of optiuni) if (costulOptiunii(o) > costulOptiunii(cea)) cea = o;
      valori.set(camp.id, { fel: "optiune", id: cea.id });
      continue;
    }

    /* ⚠ Comutatorul PORNIT, spre deosebire de podea, unde e stins. */
    if (camp.type === "comutator") {
      valori.set(camp.id, { fel: "pornit", pornit: true });
      continue;
    }

    valori.set(camp.id, { fel: "text", text: "" });
  }

  return valori;
}

/** Cel mai mare pret pe bucata pe care il poate plati cineva, sau `null` cand nu se poate afla. */
function plafonPersonalizarii(
  definitie: DefinitiePersonalizare,
  bazaPeBucata: number,
): number | null {
  const valori = valoriDePlafon(definitie);
  if (!valori) return null;
  return pretUnitar(pretulPersonalizarii(definitie, valori), bazaPeBucata);
}

/**
 * Poate cineva plati MAI MULT decat numarul afisat?
 *
 * ═══ ⚠ DE CE E O A DOUA INTREBARE, SI NU ACEEASI ═══
 *
 * `pretulDepindeDeAlegeri` raspunde la „minte pretul din catalog?" — si ea pazeste FEEDURILE
 * publice, unde un produs scos e o paguba. `pretulPoateCreste` raspunde la „numarul asta e un
 * MINIM?" — si ea hotaraste doar eticheta „de la" de pe card.
 *
 * Confundate, se strica una pe alta, si asta s-a masurat:
 *
 *   Ziua 1: fototapet cu `products.price` = 89. Cardul scrie corect „de la 48,30 lei", dar poarta
 *           de feed il scoate din Google si Meta, si ii scrie comerciantului in panou chiar
 *           instructiunea noastra: „pretul din catalog [trebuie sa devina] chiar pretul de pornire".
 *   Ziua 2: comerciantul face ce i s-a cerut si pune 48,30. Produsul se intoarce in feeduri — si,
 *           fara ca nimeni sa fi atins cardul, grila incepe sa scrie „48,30 lei" in loc de
 *           „de la 48,30 lei". Podeaua a ajuns egala cu catalogul, deci raspunsul s-a schimbat.
 *   Ziua 3: clientul sorteaza dupa pret, gaseste fototapetul intre marunțisuri la 48,30, apasa, si
 *           pe pagina scrie „de la 48,30 lei". Isi pune 3x2,5 m Premium: 667,50.
 *
 * Adica instructiunea platformei il ducea pe comerciant chiar in defect.
 *
 * ⚠ CONSECINTA DE STIUT: „de la" apare acum si la produsele din modul „adaugat" cu supliment
 * doar OPTIONAL — un card care azi scrie „100 lei" va scrie „de la 100 lei". Nu e un pret
 * schimbat: 100 ramane platibil, si e chiar pretul de pornire. E raspunsul cinstit la intrebarea
 * pusa, si e o schimbare vizibila pe carduri care azi arata bine.
 */
export function pretulPoateCreste(
  definitie: DefinitiePersonalizare,
  bazaPeBucata: number,
): boolean {
  const podea = podeaPersonalizarii(definitie, bazaPeBucata);
  const plafon = plafonPersonalizarii(definitie, bazaPeBucata);
  /* Ce nu se poate socoti nu se poate promite ca pret exact. */
  if (podea === null || plafon === null) return true;
  return round2(plafon) > round2(podea);
}

/**
 * Minte `products.price` despre produsul asta?
 *
 * ⚠ Se raspunde DIN PODEA, nu dintr-o a doua judecata. Un al doilea criteriu („are mod
 * suprafata SAU vreun impact obligatoriu") ar fi trebuit tinut in acord cu socoteala la fiecare
 * schimbare, si primul dezacord ar fi fost tacut.
 *
 * Se foloseste ca poarta pe suprafetele PUBLICE unde nu se poate afisa decat un singur numar si
 * unde numarul gresit costa bani: OLX, Google Merchant, catalogul Meta. Acolo o oferta de 89 de
 * lei pentru o marfa de 603 aduce clicuri platite care pleaca, si — la Google — suspendare pentru
 * nepotrivire intre pretul din feed si cel de pe pagina.
 */
export function pretulDepindeDeAlegeri(
  definitie: DefinitiePersonalizare,
  bazaPeBucata: number,
): boolean {
  const podea = podeaPersonalizarii(definitie, bazaPeBucata);
  /* Nu se poate socoti o podea = nu se poate sustine nici pretul de catalog. */
  if (podea === null) return true;
  return round2(podea) !== round2(Number(bazaPeBucata) || 0);
}
