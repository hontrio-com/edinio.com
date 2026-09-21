import { formatPrice } from "@/lib/utils/format";

import { stareaCosului, NUMELE_STARII } from "./starea-cosului";
import { numeleSursei } from "./reguli";
import type { AbandonedCartRow } from "@/lib/abandoned-cart";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CAUTARE, SORTARE SI EXPORT PE LISTA DE COSURI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ TOATE TREI LUCREAZA PE PAGINA ADUSA, nu pe tot magazinul, si ecranul spune
  asta. O cautare care pare sa caute peste tot si gaseste doar in cele 25 de
  randuri de fata e mai rea decat niciuna: omul cauta un client, nu-l gaseste,
  si crede ca nu exista.
*/

export type CheieSortare = "activitate" | "valoare" | "produse" | "nume";

export const SORTARI: { cheie: CheieSortare; nume: string }[] = [
  { cheie: "activitate", nume: "Ultima activitate" },
  { cheie: "valoare", nume: "Valoare" },
  { cheie: "produse", nume: "Număr de produse" },
  { cheie: "nume", nume: "Nume client" },
];

/**
 * Textul dupa care se cauta un cos.
 *
 * ⚠ FARA DIACRITICE SI FARA LITERE MARI, de amandoua partile: cine scrie
 * „ionescu" trebuie sa-l gaseasca pe „Ionescu", iar cine scrie „gheorghita"
 * trebuie sa-l gaseasca pe „Gheorghiță". Altfel cautarea pare stricata tocmai
 * pe numele romanesti.
 */
export function cheieCautare(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

export function sePotriveste(c: AbandonedCartRow, cautat: string): boolean {
  const q = cheieCautare(cautat);
  if (!q) return true;
  /* ⚠ Si numele produselor: „cine a lasat covorul in cos" e o intrebare buna. */
  const undeva = [
    c.customer_name, c.email, c.phone,
    ...c.items.map((i) => i.name),
  ];
  return undeva.some((x) => cheieCautare(x).includes(q));
}

/**
 * Lista asezata.
 *
 * ⚠ SORTAREA NU SCHIMBA NUMARUL DE RANDURI. Pare limpede, dar o sortare care
 * arunca randurile fara valoarea ceruta (un cos fara nume, de pilda) ar face
 * randuri sa dispara din pagina fara ca nimic sa spuna de ce.
 */
export function asezate(
  randuri: AbandonedCartRow[], cheie: CheieSortare, crescator: boolean,
): AbandonedCartRow[] {
  const semn = crescator ? 1 : -1;
  const copie = [...randuri];
  copie.sort((a, b) => {
    switch (cheie) {
      case "valoare": return semn * (Number(a.subtotal) - Number(b.subtotal));
      case "produse": return semn * (a.item_count - b.item_count);
      case "nume":
        /* ⚠ Cosurile fara nume stau la coada, oricum ai sorta: nu sunt „primele alfabetic". */
        if (!a.customer_name && !b.customer_name) return 0;
        if (!a.customer_name) return 1;
        if (!b.customer_name) return -1;
        return semn * a.customer_name.localeCompare(b.customer_name, "ro");
      case "activitate":
      default:
        return semn * (new Date(a.last_activity_at).getTime() - new Date(b.last_activity_at).getTime());
    }
  });
  return copie;
}

/*
  ⚠ SEPARATORUL E PUNCT-SI-VIRGULA, nu virgula. Excel in romana citeste CSV-ul
  dupa separatorul de lista al sistemului, care la noi e `;`. Cu virgula, tot
  randul intra intr-o singura celula - si omul crede ca exportul e stricat.
*/
const SEP = ";";

/** Un camp de CSV, cu ghilimelele dinauntru dublate. */
function camp(v: string | number | null | undefined): string {
  const t = String(v ?? "");
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export const COLOANE_CSV = [
  "Client", "Email", "Telefon", "Produse", "Bucăți", "Valoare",
  "Stare", "Sursă", "Ultima activitate", "Mesaje trimise",
];

export function csvulCosurilor(randuri: AbandonedCartRow[]): string {
  const linii = [COLOANE_CSV.join(SEP)];
  for (const c of randuri) {
    linii.push([
      camp(c.customer_name ?? ""),
      camp(c.email ?? ""),
      /*
        ⚠ Telefonul se scrie ca TEXT, cu apostrof in fata. Fara el, Excel vede
        „0722184305" ca pe un numar, taie zeroul din fata si transforma coloana
        in „722184305" - un numar la care nu suna nimeni.
      */
      camp(c.phone ? `'${c.phone}` : ""),
      camp(c.items.length),
      camp(c.item_count),
      /* ⚠ Virgula zecimala romaneasca, si ea ceruta de Excel-ul lor. */
      camp(Number(c.subtotal).toFixed(2).replace(".", ",")),
      camp(NUMELE_STARII[stareaCosului(c)].titlu),
      camp(numeleSursei(c.source)),
      camp(new Date(c.last_activity_at).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })),
      camp(c.mesaje.length),
    ].join(SEP));
  }
  /*
    ⚠ CRLF si BOM: fara BOM, Excel deschide fisierul ca Latin-1 si toate
    diacriticele ies „Ionescu Gheorghiţă" → „Ionescu GheorghiÈ›Ä". Nu e o
    frumusete, e diferenta dintre un export folosibil si unul aruncat.
  */
  return `﻿${linii.join("\r\n")}\r\n`;
}

/** Cum se cheama fisierul descarcat. */
export function numeleFisierului(acum: Date = new Date()): string {
  const z = new Date(acum.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `cosuri-abandonate-${z.getFullYear()}-${p(z.getMonth() + 1)}-${p(z.getDate())}.csv`;
}

/** Rezumatul unei selectii, pentru butoanele de actiune in masa. */
export function rezumatSelectie(alese: AbandonedCartRow[]): {
  cate: number; cuEmail: number; cuTelefon: number; valoare: string;
} {
  return {
    cate: alese.length,
    cuEmail: alese.filter((c) => !!c.email && !c.ignorat_la).length,
    cuTelefon: alese.filter((c) => !!c.phone && !c.ignorat_la).length,
    valoare: formatPrice(alese.reduce((s, c) => s + Number(c.subtotal || 0), 0)),
  };
}
