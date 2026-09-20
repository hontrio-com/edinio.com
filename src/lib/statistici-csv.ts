import { numeCanal, type DateVanzari } from "@/lib/vanzari";
import type {
  DateTrafic, DetaliuVanzari, RandJudet, SumarVanzari,
} from "@/lib/statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CE DESCARCA COMERCIANTUL
  ═══════════════════════════════════════════════════════════════════════════

  Fisierul se deschide, in aproape toate cazurile, in Excel pe un Windows
  romanesc. De-aia:

  ⚠ SE DESPARTE CU `;`, NU CU VIRGULA. Excel pe setari romanesti citeste
  virgula ca separator zecimal, nu de coloane: cu „,", un „1234,56" s-ar fi
  rupt in doua celule si tot randul s-ar fi mutat cu o coloana.

  ⚠ ZECIMALA E VIRGULA. Scris „1234.56", Excel romanesc il ia drept text; suma
  de pe coloana ar fi iesit zero, fara nicio eroare.

  ⚠ SE PUNE BOM LA INCEPUT (in `descarcaCsv`). Fara el, Excel citeste fisierul
  ca ANSI si diacriticele din numele produselor ies „Pled din lânã".

  ⚠ RANDURILE SE INCHEIE CU CRLF, cum cere formatul.
*/

const SEP = ";";

/** O celula: text, numar sau nimic. */
export type Celula = string | number | null | undefined;

/**
 * Scrie o celula pentru Excel romanesc.
 *
 * ⚠ Ghilimelele se dubleaza si celula se inchide in ghilimele ori de cate ori
 * poarta `;`, ghilimele sau rand nou. Un nume de produs cu punct si virgula in
 * el ar fi taiat randul in doua, tacut.
 */
export function celula(v: Celula): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return String(v).replace(".", ",");
  }
  const t = String(v);
  return /[";\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

export function catreCsv(randuri: Celula[][]): string {
  return randuri.map((r) => r.map(celula).join(SEP)).join("\r\n");
}

/** Numele fisierului: spune ce e inauntru si din ce perioada. */
export function numeFisierCsv(fila: string, de_la: string, pana_la: string): string {
  return `edinio-${fila}-${de_la}_${pana_la}.csv`;
}

function randuriSumar(s: SumarVanzari): Celula[][] {
  return [
    ["Comenzi", s.comenzi],
    ["Total incasat (lei)", s.vanzari],
    ["din care TVA (lei)", s.tva],
    ["Valoarea produselor (lei)", s.produse],
    ["Transport (lei)", s.transport],
    ["Taxa de ramburs (lei)", s.taxa_ramburs],
    ["Reduceri date (lei)", s.reduceri],
    ["Bucati vandute", s.bucati],
    ["Comenzi anulate", s.anulate],
    ["Comenzi rambursate", s.rambursate],
    ["Pierdut din anulari si rambursari (lei)", s.pierdute],
  ];
}

/**
 * Tot ce arata pagina, intr-un singur fisier.
 *
 * ⚠ UN SINGUR FISIER, CU TITLURI INTRE BLOCURI, si nu cate un fisier pe tabel:
 * comerciantul vrea sa trimita contabilului „luna trecuta", nu sapte atasamente
 * care trebuie puse la loc in ordine.
 *
 * ⚠ SCRIE SI CE INSEAMNA CIFRELE, la sfarsit. Un CSV fara nicio vorba despre
 * ce e o „vanzare" ajunge intr-un raport unde nimeni nu mai stie daca anularile
 * sunt inauntru sau afara.
 */
export function csvStatistici({
  vanzari, trafic, detaliu, judete, perioadaScrisa, canal,
}: {
  vanzari: DateVanzari | null;
  trafic: DateTrafic | null;
  detaliu: DetaliuVanzari;
  judete: RandJudet[];
  perioadaScrisa: string;
  canal: string;
}): string {
  const r: Celula[][] = [];
  const gol = () => r.push([]);
  const titlu = (t: string) => { gol(); r.push([t]); };

  r.push(["Statistici Edinio"]);
  r.push(["Perioada", perioadaScrisa]);
  r.push(["Canal", canal ? numeCanal(canal) : "Toate canalele"]);

  titlu("Sumar");
  r.push(["Cifra", "Valoare"]);
  r.push(...randuriSumar(detaliu.sumar));

  if (trafic) {
    titlu("Trafic");
    r.push(["Cifra", "Valoare"]);
    r.push(["Vizitatori", trafic.total.vizitatori]);
    r.push(["Sesiuni", trafic.total.sesiuni]);
    r.push(["Afisari de pagina", trafic.total.afisari]);
    r.push(["Sesiuni cu comanda", trafic.total.sesiuni_cu_comanda]);
  }

  if (vanzari && vanzari.serie.length > 0) {
    titlu(`Pe ${vanzari.granulatie === "zi" ? "zile" : vanzari.granulatie === "saptamana" ? "saptamani" : "luni"}`);
    r.push(["Inceputul bucatii", "Vanzari (lei)", "Comenzi"]);
    for (const p of vanzari.serie) r.push([p.bucata, p.vanzari, p.comenzi]);
  }

  if (detaliu.produse.length > 0) {
    titlu("Produse");
    r.push(["Produs", "Bucati", "Comenzi", "Valoarea liniilor (lei)"]);
    for (const p of detaliu.produse) r.push([p.nume, p.bucati, p.comenzi, p.vanzari]);
  }

  if (detaliu.categorii.length > 0) {
    titlu("Categorii");
    r.push(["Categorie", "Bucati", "Comenzi", "Valoarea liniilor (lei)"]);
    for (const c of detaliu.categorii) r.push([c.categorie, c.bucati, c.comenzi, c.vanzari]);
  }

  if (detaliu.canale.length > 0) {
    titlu("Canale");
    r.push(["Canal", "Comenzi", "Vanzari (lei)"]);
    for (const c of detaliu.canale) r.push([numeCanal(c.canal), c.comenzi, c.vanzari]);
  }

  if (detaliu.statusuri.length > 0) {
    titlu("Stari ale comenzilor");
    r.push(["Stare", "Comenzi", "Valoare (lei)"]);
    for (const s of detaliu.statusuri) r.push([s.status, s.comenzi, s.vanzari]);
  }

  if (judete.length > 0) {
    titlu("Judete");
    r.push(["Judet", "Comenzi", "Vanzari (lei)", "Valoare medie (lei)"]);
    for (const j of judete) r.push([j.judet, j.comenzi, j.vanzari, j.medie]);
  }

  titlu("Ce inseamna cifrele");
  r.push(["Vanzare", "Orice comanda care nu e anulata sau rambursata."]);
  r.push(["Sesiune", "O vizita, incheiata dupa 30 de minute fara nicio miscare."]);
  r.push(["Vizitatori", "Oameni distincti, numarati pe zi si insumati."]);
  r.push([
    "Valoarea liniilor",
    "Pret x bucati. Nu da totalul comenzilor: acolo intra transportul si se scad reducerile.",
  ]);
  r.push([
    "Stari",
    "Singurul bloc care numara si comenzile anulate sau rambursate.",
  ]);

  return catreCsv(r);
}
