/*
  ═══════════════════════════════════════════════════════════════════════════
  O SINGURA STARE PENTRU UN COS
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA. Randul purta doua etichete deodata - „Mail trimis" si „SMS trimis" -
  si niciuna nu spunea ce conteaza: ce s-a intamplat DUPA. Un cos caruia i s-au
  trimis amandoua si care a fost deschis arata la fel ca unul caruia i s-a
  trimis un mail si nimeni nu l-a citit. Iar cosul ignorat capata a treia
  eticheta, langa celelalte doua.

  ⚠ STARILE SUNT O SCARA, si se citeste de sus in jos: prima care se potriveste
  castiga. „Ignorat" bate tot, fiindca e o hotarare a comerciantului si nu se
  mai trimite nimic; „a deschis" bate „i s-a trimis", fiindca deschiderea e
  singurul lucru care se poate dovedi.

  Canalele NU dispar: ele trec in randul de dedesubt si in sertar, unde e loc
  sa scrie si CAND. Pe eticheta ramane raspunsul la „ce fac cu cosul asta".
*/

export type StareCos = "ignorat" | "deschis" | "contactat" | "abandonat";

export interface SemneleCosului {
  ignorat_la?: string | null;
  recovery_email_sent_at?: string | null;
  recovery_sms_sent_at?: string | null;
  /** Cand a deschis clientul linkul dintr-un mesaj, daca l-a deschis. */
  deschis_la?: string | null;
}

export function stareaCosului(c: SemneleCosului): StareCos {
  if (c.ignorat_la) return "ignorat";
  if (c.deschis_la) return "deschis";
  if (c.recovery_email_sent_at || c.recovery_sms_sent_at) return "contactat";
  return "abandonat";
}

export const NUMELE_STARII: Record<StareCos, { titlu: string; ton: string; explicatie: string }> = {
  abandonat: {
    titlu: "Necontactat",
    ton: "muted",
    explicatie: "Coșul e abandonat și nu i s-a trimis încă niciun mesaj de recuperare.",
  },
  contactat: {
    titlu: "Contactat",
    ton: "info",
    explicatie: "I-am trimis un mesaj, dar clientul nu a deschis încă linkul din el.",
  },
  deschis: {
    titlu: "A deschis linkul",
    ton: "success",
    explicatie:
      "Clientul a deschis linkul din mesaj. Dacă finalizează în 7 zile, coșul intră la "
      + "recuperări atribuite.",
  },
  ignorat: {
    titlu: "Ignorat",
    ton: "muted",
    explicatie: "Rămâne în statistici, dar nu mai primește niciun mesaj.",
  },
};

/** Filtrele din capul listei. */
export type FiltruStare = "toate" | StareCos;

export const FILTRE: { cheie: FiltruStare; nume: string }[] = [
  { cheie: "toate", nume: "Toate" },
  { cheie: "abandonat", nume: "Necontactate" },
  { cheie: "contactat", nume: "Contactate" },
  { cheie: "deschis", nume: "Au deschis linkul" },
  { cheie: "ignorat", nume: "Ignorate" },
];

/**
 * ⚠ FILTRUL SE APLICA PE STAREA CALCULATA, nu pe coloane. Altfel „Contactate"
 * ar fi prins si cosurile deschise (au si ele data de trimitere), iar cele
 * doua filtre s-ar suprapune fara ca nimic sa spuna de ce.
 */
export function trece(c: SemneleCosului, filtru: FiltruStare): boolean {
  return filtru === "toate" || stareaCosului(c) === filtru;
}

/**
 * Cate produse si cate bucati are cosul.
 *
 * ⚠ `item_count` E SUMA CANTITATILOR, NU NUMARUL DE PRODUSE. Scris „3 produse"
 * din el, un cos cu doua produse din care unul luat in doua bucati aparea cu
 * trei produse - si sertarul de langa el arata doua randuri. Prins pe ecran,
 * nu in cod.
 */
export function cateInCos(items: { quantity?: number }[], itemCount: number): string {
  const produse = items.length || 0;
  /*
    ⚠ Un cos ale carui linii nu s-au putut citi are `items` gol dar `item_count`
    nenul: „0 produse · 3 buc" se contrazice singur. Atunci se tace despre
    bucati, iar sertarul spune in cuvinte de ce lista e goala.
  */
  if (produse === 0) return "0 produse";
  const bucati = Number(itemCount) || items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const p = produse === 1 ? "1 produs" : `${produse} produse`;
  return bucati > produse ? `${p} · ${bucati} buc` : p;
}
