/**
 * Linia de adresa a comenzii -> campurile separate cerute de e-packet.
 *
 * ═══ DE CE ═══
 *
 * Checkoutul are UN SINGUR camp de adresa (vezi `src/lib/orders/adresa.ts`), iar e-packet cere
 * `street` (max. 50), `number` (max. 10, OBLIGATORIU: 422 masurat fara el), `block` (30),
 * `entrance`, `floor`, `apartment` (10 fiecare), separat. Si NU are camp de observatii.
 *
 * ═══ CUM ═══
 *
 * Intai bucatile cu ETICHETA, scrise de oameni in zeci de feluri: „nr. 12", „Nr12", „bl A2",
 * „blA", „sc. B", „scara 1", „et 3", „ap. 7", „apt 7". Ce ramane e strada; daca n-a avut „nr",
 * numarul e ULTIMUL cuvant numeric al primei bucati („Str. Mare 12", „Calea 13 Septembrie 90" ->
 * 90, nu 13). „Bd. 1 Mai" ramane FARA numar: un 1 din mijloc e al numelui, nu al casei.
 *
 * Masurat pe 436 de adrese reale (productie, 07.10.2026): textul liber de dupa numar („nr 12
 * langa scoala"), numarul lipit de cuvant („Florilor12"), etichetele lipite („blA, sc1, ap12") si
 * CODUL POSTAL scris in linie. Codul se scoate si se intoarce: e cel mai bun cod pe care il are
 * comanda (`codPostal`).
 *
 * ⚠ NU SE INVENTEAZA NIMIC. Fara numar, campul ramane gol si fereastra il cere (omul poate scrie
 * „FN", forma romaneasca pentru „fara numar", primita de ei, masurat). Un numar ghicit trimite
 * coletul la alta casa. Textul liber de dupa numar NU se arunca: ramane langa strada.
 */

export type AdresaDespartita = {
  strada: string;
  numar: string;
  bloc: string;
  scara: string;
  etaj: string;
  apartament: string;
  /** Codul postal gasit in linie (6 cifre), sau sir gol. */
  codPostal: string;
};

/** Lungimile LOR (specificatia, si 422 masurat la strada de 51 si blocul de 31). */
export const LUNGIMI_ADRESA = { strada: 50, numar: 10, bloc: 30, scara: 10, etaj: 10, apartament: 10 } as const;

type CampEtichetat = "numar" | "bloc" | "scara" | "etaj" | "apartament";

/** Etichetele, in ordinea in care se cauta. */
const ETICHETE: { camp: CampEtichetat; re: string }[] = [
  { camp: "numar", re: "(?:nr|numarul|numar|număr|numărul)" },
  { camp: "bloc", re: "(?:bl|bloc|blocul)" },
  { camp: "scara", re: "(?:sc|scara|scară)" },
  { camp: "etaj", re: "(?:et|etaj|etajul)" },
  { camp: "apartament", re: "(?:ap|apt|apart|apartament|apartamentul)" },
];

const TOATE = ETICHETE.map((e) => e.re).join("|");

/** Un numar de casa: „12", „25A", „3/B", „12-14". */
const NUMAR_CASA = /^\d{1,5}[A-Za-z]{0,2}(?:[/-]\d{0,5}[A-Za-z]?)?$/;
/** „Fara numar": se pastreaza asa cum e scris. */
const FARA_NUMAR = /^(?:fn|f\.n\.?|f\/n|fara\s+numar|fără\s+număr)$/i;

/**
 * Eticheta LIPITA de valoare („blA", „sc1", „nr12"): numai cand valoarea incepe cu o cifra sau o
 * MAJUSCULA, altfel „Blocurilor", „Scarisoarei" si „Apusului" ar fi bloc, scara si apartament.
 * Intoarce aceeasi forma ca `exec` (grupul 1 = ce era inainte, grupul 2 = valoarea).
 */
function lipita(text: string, re: string): RegExpExecArray | null {
  for (const m of text.matchAll(new RegExp(`(^|[\\s,.;(])${re}([0-9A-Za-z][\\w/-]*)`, "gi"))) {
    const prima = m[2][0];
    if (/[0-9]/.test(prima) || (prima === prima.toUpperCase() && prima !== prima.toLowerCase())) {
      return m as unknown as RegExpExecArray;
    }
  }
  return null;
}

function curat(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s,.;:()-]+|[\s,.;:(-]+$/g, "").trim();
}

export function despartaAdresa(linie: string | null | undefined): AdresaDespartita {
  const rez: AdresaDespartita = { strada: "", numar: "", bloc: "", scara: "", etaj: "", apartament: "", codPostal: "" };
  let rest = ` ${(linie ?? "").replace(/\s+/g, " ").trim()} `;
  if (!rest.trim()) return rez;

  /* Codul postal din linie: sase cifre singure. Se scoate, ca sa nu fie luat drept numar. */
  const cp = /(^|[\s,.;(])(\d{6})(?=[\s,.;)]|$)/.exec(rest);
  if (cp) {
    rez.codPostal = cp[2];
    rest = rest.slice(0, cp.index) + `${cp[1]} ` + rest.slice(cp.index + cp[0].length);
  }

  /* Textul de dupa numar („langa scoala"), pastrat ca sa ajunga langa strada. */
  let dupaNumar = "";

  for (const { camp, re } of ETICHETE) {
    /*
     * Eticheta incepe un cuvant si e urmata de punct, spatiu sau doua puncte, ca „Strada Etajului"
     * sau „Scarisoara" sa nu fie citite drept etaj si scara. Lipita („blA", „sc1", „nr12") trece
     * numai cu o CIFRA sau o MAJUSCULA dupa ea: „Blocurilor" si „Apusului" raman cuvinte.
     */
    const m = new RegExp(`(^|[\\s,.;(])${re}(?:\\.|\\s|:)\\s*([^,;]*?)(?=\\s*(?:[,;]|\\s(?:${TOATE})(?:\\.|\\s|:)|$))`, "i")
      .exec(rest) ?? lipita(rest, re);
    if (!m) continue;
    let valoare = curat(m[2]);
    if (!valoare) continue;
    if (camp === "numar" && !FARA_NUMAR.test(valoare)) {
      /* Numarul e primul cuvant; restul („langa scoala") nu e numar. */
      /* „nr 99A(langa piata)": si paranteza lipita incheie numarul. */
      const [primul, ...alte] = valoare.replace(/\(/, " (").split(" ");
      if (/^\d/.test(primul)) {
        valoare = primul;
        dupaNumar = curat(alte.join(" ").replace(/^\(|\)$/g, ""));
      }
    }
    rez[camp] = valoare;
    rest = rest.slice(0, m.index) + `${m[1]} ` + rest.slice(m.index + m[0].length);
  }

  /* Strada = prima bucata (pana la virgula); restul bucatilor fara eticheta sunt de obicei
     localitatea sau judetul, scrise inca o data. */
  const bucati = rest.split(/[,;]/).map(curat).filter(Boolean);
  let strada = bucati[0] ?? "";

  if (!rez.numar) {
    for (let i = 0; i < bucati.length; i++) {
      const cuvinte = bucati[i].split(" ");
      const unu = cuvinte[cuvinte.length - 1];
      const doua = cuvinte.slice(-2).join(" ");
      /* „7 bis", „25 A": numai „bis" sau o litera. „Bd. 1 Mai" ar fi iesit numarul „1 Mai". */
      let n = cuvinte.length >= 3 && /^\d{1,5}$/.test(cuvinte[cuvinte.length - 2]) && /^(?:bis|[A-Za-z])$/i.test(unu) ? doua
        : cuvinte.length >= 2 && NUMAR_CASA.test(unu) ? unu
        : "";
      let faraNumar = n ? curat(cuvinte.slice(0, cuvinte.length - n.split(" ").length).join(" ")) : "";
      /* Lipit de ultimul cuvant: „Florilor12" (dar nu un cuvant scurt, ca „A2" sau „B1"). */
      const lipit = !n ? /^(\p{L}{3,})(\d{1,5}[A-Za-z]?)$/u.exec(unu) : null;
      if (lipit && cuvinte.length >= 2) {
        n = lipit[2];
        faraNumar = curat([...cuvinte.slice(0, -1), lipit[1]].join(" "));
      }
      if (n) {
        rez.numar = n;
        if (i === 0 || !strada) strada = faraNumar;
        break;
      }
      /* Numarul singur, ca bucata separata: „Strada Mare, 12". */
      if (i > 0 && NUMAR_CASA.test(bucati[i])) { rez.numar = bucati[i]; break; }
    }
  }

  rez.strada = curat([strada, dupaNumar].filter(Boolean).join(" "));
  return rez;
}
