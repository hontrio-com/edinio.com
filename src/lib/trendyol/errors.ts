/**
 * Mesajele Trendyol, pe intelesul comerciantului roman.
 *
 * ⚠ SE POTRIVESTE PE `errors[].key`, NU PE TEXT.
 *
 * Documentatia lor o cere explicit: „key este identificatorul stabil... message
 * este LOCALIZAT de Accept-Language — nu-l folosi ca discriminant". Tabelul de
 * dinainte potrivea pe text si de aceea jumatate din el era cod mort: intrarile
 * turcesti („tedarikçi bulunamadı") nu se puteau declansa niciodata, fiindca noi
 * trimitem mereu `storeFrontCode: RO` si `Accept-Language: ro`, iar turca vine
 * doar pe vitrina TR. Iar potrivirile scurte („brand", „stock", „category")
 * loveau in orice mesaj care le continea, inclusiv in unele despre altceva.
 *
 * Regula ramane: comerciantul primeste o propozitie in romana care ii spune CE
 * sa faca. Textul original ramane la coada, ca sa poata fi dus la suportul
 * Trendyol cand nu il recunoastem.
 */

/** Cheile stabile, culese din raspunsurile reale ale Trendyol. */
const DUPA_CHEIE: Record<string, string> = {
  "supplier.api.supplier.not.found":
    "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina) — sunt cele doua lucruri care il identifica.",
  "invalid.storefrontcode":
    "Tara magazinului (vitrina) nu este acceptata de Trendyol. Alege una din lista si reconecteaza contul.",
  "authentication.error":
    "Trendyol a respins autentificarea. Verifica Seller ID-ul, apoi API Key si API Secret, din panoul de vanzator.",
  "clientapiauthenticationexception":
    "Cheile API au fost respinse de Trendyol. Ia-le din nou din panoul de vanzator, de la Informatii cont > Detalii integrare.",
};

interface Traducere {
  /** Bucata de text, minuscule, dupa care recunoastem mesajul. */
  potrivire: string;
  romana: string;
}

/*
 * Plasa de rezerva, pentru cand raspunsul nu vine cu `key`.
 *
 * Potrivirile sunt FRAZE, nu cuvinte: „brand" singur prindea si „Brand-ul a fost
 * actualizat", si orice alt mesaj in care aparea cuvantul, si il traducea in
 * „brandul nu a fost gasit" — un raspuns fals, care trimite comerciantul sa
 * repare ce era deja bun.
 */
const TRADUCERI: Traducere[] = [
  {
    potrivire: "supplier not found",
    romana: "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina).",
  },
  /*
   * Variantele turcesti raman, desi pe vitrina RO nu se pot declansa.
   *
   * Nu sunt cod mort degeaba: mesajul turcesc apare EXACT atunci cand antetul
   * `storeFrontCode` lipseste sau ajunge gresit — adica in singurul caz in care
   * ai nevoie disperata de un diagnostic. Costa doua randuri si spun raspicat
   * unde sa te uiti.
   */
  {
    potrivire: "tedarikçi bulunamadı",
    romana: "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina) — sunt cele doua lucruri care il identifica.",
  },
  {
    potrivire: "tedarikci bulunamadi",
    romana: "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina) — sunt cele doua lucruri care il identifica.",
  },
  {
    potrivire: "istenilen kaynak bulunamadı",
    romana: "Resursa ceruta nu exista la Trendyol. Daca tocmai ai schimbat tara magazinului, reconecteaza contul.",
  },
  {
    potrivire: "barcode",
    romana: "Codul de bare al produsului nu este acceptat. Trendyol cere litere, cifre, punct, liniuta si underscore, fara spatii sau diacritice.",
  },
  {
    potrivire: "vat rate",
    romana: "Cota de TVA trimisa nu este acceptata de vitrina aleasa. Verifica setarile produsului.",
  },
  {
    potrivire: "brand not found",
    romana: "Brandul nu a fost gasit in catalogul Trendyol. Alege unul din lista lor sau cere-le adaugarea celui propriu.",
  },
  {
    potrivire: "brand id",
    romana: "Brandul trimis nu este valid la Trendyol. Alege-l din lista lor.",
  },
  {
    potrivire: "category",
    romana: "Categoria trimisa nu este valida pentru vitrina aleasa. Refa asocierea de categorii.",
  },
  {
    potrivire: "stock",
    romana: "Stocul trimis a fost respins de Trendyol. Verifica valoarea produsului.",
  },
];

/**
 * Traduce, cand recunoastem mesajul.
 *
 * `cheie` bate mereu textul: e stabila si nu depinde de limba raspunsului.
 */
export function traduMesajTrendyol(mesaj: string | undefined, status?: number, cheie?: string): string {
  const k = (cheie ?? "").trim().toLowerCase();
  if (k && DUPA_CHEIE[k]) return DUPA_CHEIE[k];

  const brut = (mesaj ?? "").trim();
  if (!brut) {
    if (k) return `Trendyol a respins operatiunea (${k}).`;
    return status ? `Trendyol a raspuns cu eroare (HTTP ${status}).` : "Eroare necunoscuta de la Trendyol.";
  }

  const jos = brut.toLowerCase();
  const gasita = TRADUCERI.find((t) => jos.includes(t.potrivire));
  if (gasita) return gasita.romana;

  // Necunoscut: il aratam, dar spunem ca vine de la ei, ca sa nu para al nostru.
  return `Trendyol a respins operatiunea${status ? ` (HTTP ${status})` : ""}: ${brut}`;
}

/** Mesajele pe coduri HTTP, unde codul spune mai mult decat textul. */
export function mesajDupaStatus(status: number, mediu?: "stage" | "production"): string | null {
  /*
   * Mediul de test se verifica INAINTE de codurile generice.
   *
   * Gazda de stage sta in spatele unui filtru de retea si raspunde 403 cu o
   * pagina HTML, nu 503 cu JSON — deci ramura care explica exact asta era pusa
   * dupa cea de 403 si nu se declansa niciodata. Comerciantul care alegea
   * „Stage" primea „Trendyol a blocat cererea", fara sa afle de ce.
   */
  if (mediu === "stage" && (status === 403 || status === 503 || status === 0)) {
    return "Mediul de test Trendyol nu este accesibil de pe serverele noastre: cere-le sa autorizeze IP-ul, sau treci pe Producție. Cheile de test sunt diferite de cele de producție.";
  }
  if (status === 401) {
    /*
     * ⚠ 401 NU inseamna doar „chei gresite".
     *
     * Probat: un Seller ID care nu-ti apartine, cu chei perfect valide, da tot
     * `401 TrendyolAuthorizationException` — nu 403. Mesajul care dadea vina
     * doar pe chei trimitea comerciantul sa le regenereze la nesfarsit, cand de
     * fapt gresise numarul contului.
     */
    return "Trendyol a respins autentificarea. Verifica Seller ID-ul (doar cifre, exact ca in panou), apoi API Key si API Secret — de la Informații cont > Detalii integrare (vizibile doar utilizatorului principal).";
  }
  if (status === 403) {
    // Documentatia: lipsa User-Agent da 403. In productie, si un IP pe lista neagra.
    return "Trendyol a blocat cererea. Daca tocmai ai conectat contul, incearca din nou peste cateva minute; daca se repeta, cere-le sa verifice daca serverul nostru e blocat.";
  }
  if (status === 429) {
    return "Prea multe cereri catre Trendyol intr-un interval scurt. Reincearca peste un minut.";
  }
  if (status >= 500) {
    return "Trendyol are o problema momentana. Reincearca peste cateva minute.";
  }
  return null;
}
