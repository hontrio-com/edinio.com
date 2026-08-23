/**
 * Structura comună a documentelor juridice de pe site.
 *
 * Termenii, Politica de Confidențialitate și Politica de Cookies sunt trei
 * documente diferite, dar au aceleași cărămizi: paragrafe numerotate, liste,
 * definiții, fișe de date, tabele. Tipurile stau aici o singură dată, ca un
 * bloc nou (tabelele, de exemplu) să apară pe toate trei deodată.
 *
 * ═══ TEXTELE SUNT ALE CLIENTULUI ═══
 *
 * Toate trei au fost date cuvânt cu cuvânt, cu cererea explicită „să nu omiți
 * nimic". Nu se rescriu, nu se scurtează, nu se reordonează. O reformulare care
 * sună mai bine poate schimba ce se poate susține în fața unei autorități.
 *
 * ⚠ Transcrierea NU se verifică recitind-o. Se pune originalul într-un fișier și
 * se compară linie cu linie cu ce iese din modul. Așa a ieșit la iveală, la
 * Termeni, un „Denumire:" pe care îl adăugasem eu în fața numelui firmei.
 */

export type Bloc =
  | {
      tip: "paragraf";
      /** Numerotarea din document („10.4."), afișată stins în fața textului. */
      nr?: string;
      text: string;
      /** Bucăți exacte din `text` care se îngroașă. Vezi `segmenteEvidentiate`. */
      evidenta?: string[];
    }
  /** Titlu în interiorul unui articol („Dreptul de acces", „29.1. Interes legitim"). */
  | { tip: "subtitlu"; nr?: string; text: string }
  | { tip: "lista"; items: string[] }
  | { tip: "definitii"; items: { termen: string; text: string }[] }
  /**
   * Fișa de identificare a unei firme.
   *
   * ⚠ Rândul FĂRĂ `eticheta` e denumirea, capul fișei. În documente ea stă
   * singură, fără niciun cuvânt în față — iar proba de integritate a prins exact
   * asta: pusesem „Denumire:", adică un cuvânt care nu e al clientului, într-un
   * document juridic. Nu i se pune etichetă înapoi.
   *
   * `valoare` poate conține `\n` acolo unde documentul rupe adresa pe două
   * rânduri; se randează ca atare, nu se lipește.
   */
  | { tip: "date"; items: { eticheta?: string; valoare: string; href?: string }[] }
  /** Adresă poștală scrisă pe rânduri, așa cum e în document. */
  | { tip: "adresa"; linii: string[] }
  /** Propoziția prin care documentul se declară el însuși esențial. */
  | { tip: "accent"; text: string }
  /**
   * Trimiteri către alte documente ale site-ului.
   *
   * ⚠ E o cărămidă, nu un link scris în text, fiindcă un `paragraf` nu poate
   * purta linkuri: `segmenteEvidentiate` taie textul doar în bucăți îngroșate.
   * Documentul GDPR trimite la Confidențialitate și la Cookies în articolul 14,
   * iar celelalte trei se pomenesc unele pe altele în preambul, deocamdată ca
   * text simplu.
   *
   * ⚠ `href` e o cale internă, deci se randează cu `next/link`. Pentru adrese
   * din afară există deja `date` cu `href`.
   */
  | { tip: "trimiteri"; items: { text: string; href: string }[] }
  | { tip: "email"; adresa: string }
  /**
   * Tabel, folosit doar la Cookies.
   *
   * ⚠ Sub `lg` NU se derulează pe orizontală: fiecare rând devine o fișă
   * „antet → valoare". Un tabel de cinci coloane pe un telefon de 390px arată
   * două, iar cine nu ghicește că poate trage lateral crede că a citit tot —
   * aceeași concluzie ca la tabelul de comparație de pe pagina de start.
   */
  | { tip: "tabel"; antet: string[]; randuri: string[][]; nota?: string };

export interface Sectiune {
  /** Ancora din adresă. Stabilă: pe ea se pot da linkuri către o clauză. */
  id: string;
  /** Numărul articolului, așa cum e în document. */
  nr: number;
  titlu: string;
  blocuri: Bloc[];
}

/** Un document juridic întreg, gata de randat. */
export interface DocumentLegal {
  titlu: string;
  actualizare: string;
  preambul: Bloc[];
  sectiuni: Sectiune[];
}

/**
 * Taie textul în bucăți, îngroșându-le pe cele cerute prin `evidenta`.
 *
 * Întoarce o listă de segmente, nu JSX, ca să poată fi probată fără să randezi
 * nimic. Bucata căutată se ia LITERAL: caracterele speciale de regex se
 * neutralizează, altfel un termen cu paranteză ar arunca.
 *
 * ⚠ Nu schimbă niciodată textul: lipite la loc, segmentele dau exact intrarea.
 * Probele verifică asta pentru FIECARE paragraf din toate trei documentele.
 */
export function segmenteEvidentiate(
  text: string,
  evidenta?: string[],
): { text: string; tare: boolean }[] {
  if (!evidenta?.length) return [{ text, tare: false }];

  const tipar = new RegExp(`(${evidenta.map(scapaRegex).join("|")})`, "g");
  return text
    .split(tipar)
    .filter((bucata) => bucata !== "")
    .map((bucata) => ({ text: bucata, tare: evidenta.includes(bucata) }));
}

function scapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tot textul unui document, ca listă de rânduri.
 *
 * Există ca să poată fi comparat cu originalul primit de la client. Ordinea și
 * despărțirea pe rânduri OGLINDESC documentul: un `date` cu adresa ruptă pe două
 * rânduri scoate două rânduri, nu unul lipit, fiindcă așa e și în original.
 */
export function liniiDocument(doc: DocumentLegal): string[] {
  const out: string[] = [doc.titlu, `Ultima actualizare: ${doc.actualizare}`];
  const adauga = (blocuri: Bloc[]) => {
    for (const b of blocuri) {
      switch (b.tip) {
        case "paragraf":
          out.push((b.nr ? `${b.nr} ` : "") + b.text);
          break;
        case "subtitlu":
          out.push((b.nr ? `${b.nr} ` : "") + b.text);
          break;
        case "lista":
          out.push(...b.items);
          break;
        case "definitii":
          out.push(...b.items.map((d) => `${d.termen} ${d.text}`));
          break;
        case "date":
          for (const d of b.items) {
            if (d.valoare.includes("\n")) {
              if (d.eticheta) out.push(`${d.eticheta}:`);
              out.push(...d.valoare.split("\n"));
            } else {
              out.push((d.eticheta ? `${d.eticheta}: ` : "") + d.valoare);
            }
          }
          break;
        case "adresa":
          out.push(...b.linii);
          break;
        case "accent":
          out.push(b.text);
          break;
        case "email":
          out.push(b.adresa);
          break;
        case "trimiteri":
          out.push(...b.items.map((t) => t.text));
          break;
        case "tabel":
          out.push(b.antet.join(" "));
          out.push(...b.randuri.map((r) => r.join(" ")));
          if (b.nota) out.push(b.nota);
          break;
      }
    }
  };
  adauga(doc.preambul);
  for (const s of doc.sectiuni) {
    out.push(`${s.nr}. ${s.titlu}`);
    adauga(s.blocuri);
  }
  return out;
}
