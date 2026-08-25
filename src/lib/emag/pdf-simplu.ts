/**
 * O pagina de PDF, scrisa de mana.
 *
 * ═══ ⚠ DE CE FARA BIBLIOTECA ═══
 *
 * eMAG cere ca atasamentul sa fie un `.pdf` la o adresa — nu ingaduie text, nu ingaduie
 * imagine. Iar noi n-aveam nicio unealta de PDF in depozit: facturile vin gata facute de
 * la SmartBill/Oblio/fGO, deci nu s-a pus niciodata problema.
 *
 * ⚠ O dependenta noua pentru douasprezece randuri de text ar fi fost o alegere proasta:
 * `pdfkit` si `pdf-lib` aduc sute de kilooctati intr-un pachet care ruleaza pe lambda, la
 * fiecare pornire rece, pentru o pagina cu trei cuvinte pe ea.
 *
 * Un PDF de o pagina e un format mic si asezat: antet, patru obiecte, tabelul de pozitii
 * si coada. Se scrie o data si nu se mai schimba.
 *
 * ⚠ NUMAI ASCII, DINADINS. Fontul de baza (Helvetica) e in codarea WinAnsi, iar
 * diacriticele romanesti n-au toate un loc acolo — un „ș" ar fi iesit ca semn strain sau
 * ar fi rupt sirul. Pentru un document care poarta un numar de AWB si un nume de curier,
 * a scrie „Curier" fara diacritice e o pierdere pe care nimeni n-o vede; un caracter
 * stalcit se vede imediat. Vezi `faraDiacritice`.
 */

/** Ce nu incape in WinAnsi se aduce la forma fara semne. */
const SEMNE: Record<string, string> = {
  ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t",
  Ă: "A", Â: "A", Î: "I", Ș: "S", Ş: "S", Ț: "T", Ţ: "T",
  "„": '"', "”": '"', "’": "'", "–": "-", "—": "-", "…": "...",
};

export function faraDiacritice(s: string): string {
  return [...(s ?? "")].map((c) => SEMNE[c] ?? c).join("");
}

/**
 * ⚠ In sirurile PDF, `(`, `)` si `\` sunt semne de structura. Nescapate, un nume de
 * curier cu paranteza ar fi rupt fisierul — si eMAG ar fi refuzat atasamentul cu un mesaj
 * despre document, nu despre nume.
 */
function sirPdf(s: string): string {
  return faraDiacritice(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    /* Orice a ramas in afara ASCII-ului tiparibil se scoate: mai bine lipseste un semn
       decat sa iasa un octet pe care cititorul lor nu-l intelege. */
    .replace(/[^\x20-\x7E]/g, "");
}

export interface RandPdf {
  text: string;
  /** Marimea literei. Implicit 11. */
  marime?: number;
  /** Cat se coboara fata de randul dinainte, in puncte. Implicit 18. */
  spatiu?: number;
}

/**
 * Construieste un PDF de o pagina A4 cu randurile date.
 *
 * ⚠ Pozitiile din tabelul `xref` se socotesc din octetii CHIAR SCRISI, nu dintr-o
 * numaratoare paralela. O a doua socoteala s-ar fi despartit de prima la prima schimbare
 * de continut, iar fisierul ar fi iesit stricat numai pentru unele texte — adica defectul
 * cel mai greu de gasit.
 */
export function pdfDintrunSingurFolio(randuri: RandPdf[]): Buffer {
  const continut = [
    "BT",
    ...randuri.flatMap((r, i) => [
      `/F1 ${r.marime ?? 11} Tf`,
      i === 0 ? "1 0 0 1 56 780 Tm" : `0 -${r.spatiu ?? 18} Td`,
      `(${sirPdf(r.text)}) Tj`,
    ]),
    "ET",
  ].join("\n");

  const obiecte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
      + "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(continut, "latin1")} >>\nstream\n${continut}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const pozitii: number[] = [];
  obiecte.forEach((o, i) => {
    pozitii.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const inceputXref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${obiecte.length + 1}\n0000000000 65535 f \n`;
  for (const p of pozitii) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${obiecte.length + 1} /Root 1 0 R >>\n`
    + `startxref\n${inceputXref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
