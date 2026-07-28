/**
 * Mesajele Trendyol, pe intelesul comerciantului roman.
 *
 * Trendyol raspunde in turca sau engleza, dupa endpoint si dupa vitrina, iar
 * documentatia lor NU are catalog de coduri de business — pagina de erori
 * contine doar coduri HTTP generice. Deci nu se poate traduce dupa un cod: se
 * potriveste dupa text, cu originalul pastrat pentru cazurile necunoscute.
 *
 * Regula: comerciantul primeste mereu o propozitie in romana care ii spune CE
 * sa faca. Textul original ramane la coada, intre paranteze, ca sa poata fi dus
 * la suportul Trendyol daca nu il recunoastem.
 */

interface Traducere {
  /** Bucata de text, minuscule, dupa care recunoastem mesajul. */
  potrivire: string;
  romana: string;
}

const TRADUCERI: Traducere[] = [
  {
    potrivire: "tedarikçi bulunamadı",
    romana: "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina) — sunt cele doua lucruri care il identifica.",
  },
  {
    potrivire: "tedarikci bulunamadi",
    romana: "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina) — sunt cele doua lucruri care il identifica.",
  },
  {
    potrivire: "supplier not found",
    romana: "Trendyol nu recunoaste acest cont de vanzator. Verifica Seller ID-ul si tara magazinului (vitrina).",
  },
  {
    potrivire: "clientapiauthenticationexception",
    romana: "Cheile API au fost respinse de Trendyol. Ia-le din nou din panoul de vanzator, de la Informatii cont > Detalii integrare.",
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
    potrivire: "vat",
    romana: "Cota de TVA trimisa nu este acceptata de vitrina aleasa. Verifica setarile produsului.",
  },
  {
    potrivire: "brand",
    romana: "Brandul nu a fost gasit in catalogul Trendyol. Alege unul din lista lor sau cere-le adaugarea celui propriu.",
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

/** Traduce, cand recunoastem mesajul. Altfel il pastreaza, dar cu context romanesc. */
export function traduMesajTrendyol(mesaj: string | undefined, status?: number): string {
  const brut = (mesaj ?? "").trim();
  if (!brut) return status ? `Trendyol a raspuns cu eroare (HTTP ${status}).` : "Eroare necunoscuta de la Trendyol.";

  const jos = brut.toLowerCase();
  const gasita = TRADUCERI.find((t) => jos.includes(t.potrivire));
  if (gasita) return gasita.romana;

  // Necunoscut: il aratam, dar spunem ca vine de la ei, ca sa nu para al nostru.
  return `Trendyol a respins operatiunea${status ? ` (HTTP ${status})` : ""}: ${brut}`;
}

/** Mesajele pe coduri HTTP, unde codul spune mai mult decat textul. */
export function mesajDupaStatus(status: number, mediu?: "stage" | "production"): string | null {
  if (status === 401) {
    return "Cheile API au fost respinse de Trendyol. Ia-le din nou din panoul de vanzator, de la Informatii cont > Detalii integrare (vizibile doar utilizatorului principal).";
  }
  if (status === 403) {
    // Documentatia: lipsa User-Agent da 403. In productie, si un IP pe lista neagra.
    return "Trendyol a blocat cererea. Daca tocmai ai conectat contul, incearca din nou peste cateva minute; daca se repeta, cere-le sa verifice daca serverul nostru e blocat.";
  }
  if (status === 429) {
    return "Prea multe cereri catre Trendyol intr-un interval scurt. Reincearca peste un minut.";
  }
  if (status === 503 && mediu === "stage") {
    return "Mediul de test Trendyol cere autorizarea IP-ului serverului nostru. Cere-le sa il adauge si foloseste cheile de test, care sunt diferite de cele de productie.";
  }
  if (status >= 500) {
    return "Trendyol are o problema momentana. Reincearca peste cateva minute.";
  }
  return null;
}
