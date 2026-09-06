import type { CampPersonalizare, DefinitiePersonalizare, Impact } from "./definitie";
import { suprafataFacturata, suprafataM2 } from "./suprafata";
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
function campulDeSuprafata(definitie: DefinitiePersonalizare): CampPersonalizare | undefined {
  const mod = definitie.pret;
  if (mod?.fel === "suprafata") {
    return definitie.fields.find((c) => c.id === mod.campDimensiuni && c.type === "dimensiuni");
  }
  const dims = definitie.fields.filter((c) => c.type === "dimensiuni");
  return dims.length === 1 ? dims[0] : undefined;
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
