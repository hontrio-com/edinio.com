import { slugDin } from "./types";

/**
 * Cuprinsul unui articol, scos din titlurile lui.
 *
 * ⚠ NU SE ȚINE ÎN BAZĂ. Cuprinsul e o părere despre text, iar textul se schimbă
 * la fiecare salvare: ținut separat, ar rămâne în urmă fără să crape nimic, și
 * ar arăta un titlu care nu mai există. Scos din HTML la afișare, nu poate
 * minți niciodată.
 *
 * ⚠ FUNCȚIONEAZĂ ȘI PE TEXT SCRIS DE MÂNĂ. Editorul are un mod HTML brut, deci
 * corpul articolului nu vine întotdeauna de la Tiptap. De asta se caută
 * titlurile în HTML-ul final, nu în vreo structură a editorului.
 */
export interface IntrareCuprins {
  id: string;
  text: string;
  /** 2 pentru titlurile mari, 3 pentru cele mici de sub ele. */
  nivel: 2 | 3;
}

/** Scoate etichetele și dezleagă entitățile de care avem nevoie. */
function textCurat(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Întoarce cuprinsul ȘI HTML-ul cu ancore puse pe titluri.
 *
 * Amândouă dintr-o singură trecere, dinadins: dacă ar fi două funcții, una ar
 * putea fi chemată fără cealaltă, iar cuprinsul ar trimite către ancore care nu
 * există în pagină. Aici nu se pot despărți.
 */
export function cuprinsSiHtml(html: string): { cuprins: IntrareCuprins[]; html: string } {
  const cuprins: IntrareCuprins[] = [];
  const folosite = new Map<string, number>();

  const iesire = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (intreg, nivelStr: string, atribute: string, dinauntru: string) => {
      const text = textCurat(dinauntru);
      if (!text) return intreg;

      /* Un titlu scris doar din semne nu dă niciun slug. Îi punem un nume
         numerotat, ca ancora să existe totuși: altfel intrarea din cuprins ar
         trimite în gol, iar cititorul ar apăsa și nu s-ar întâmpla nimic. */
      const baza = slugDin(text) || `titlu-${cuprins.length + 1}`;

      /* Două titluri cu același nume sunt obișnuite („Pe scurt" în două
         secțiuni). Fără numerotare, ambele ancore ar avea același id, iar
         browserul ar sări mereu la primul. */
      const deCateOri = (folosite.get(baza) ?? 0) + 1;
      folosite.set(baza, deCateOri);
      const id = deCateOri === 1 ? baza : `${baza}-${deCateOri}`;

      const nivel = Number(nivelStr) as 2 | 3;
      cuprins.push({ id, text, nivel });

      /* Un `id` scris deja de om în editor se păstrează: e al lui, poate fi
         ținta unei legături date cuiva. Îi luăm valoarea pentru cuprins, ca
         cele două să arate spre același loc. */
      const idExistent = /\sid=["']([^"']+)["']/i.exec(atribute);
      if (idExistent) {
        cuprins[cuprins.length - 1].id = idExistent[1];
        return intreg;
      }

      return `<h${nivel}${atribute} id="${id}">${dinauntru}</h${nivel}>`;
    },
  );

  return { cuprins, html: iesire };
}

/**
 * Merită arătat cuprinsul?
 *
 * Sub trei titluri, o listă de cuprins ocupă mai mult loc decât economisește:
 * cititorul vede oricum tot articolul dintr-o derulare. Pragul e aici, ca să nu
 * fie hotărât altfel în fiecare pagină.
 */
export function meritaCuprins(cuprins: IntrareCuprins[]): boolean {
  return cuprins.length >= 3;
}
