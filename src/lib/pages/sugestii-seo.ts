import type { Block, PageSeo } from "./blocks.types";
import { flattenBlocks } from "./block-tree";
import { descriereDinBlocuri, titlulPrincipal } from "./titlul-principal";
import { slugify } from "@/lib/utils/slugify";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SUGESTII SEO PENTRU O PAGINA                                     (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: „mai multe optiuni de SEO si sugestii”. Verificarile de aici se
  fac din ce e deja pe pagina, in editor, fara nicio cerere: titlul, descrierea,
  H1-ul (cu ACEEASI regula ca pagina publica, `titlulPrincipal`), textul
  alternativ al imaginilor, cat text are pagina, legaturile interne, imaginea de
  distribuire si cuvantul cheie principal, daca omul a ales unul.

  ⚠ O sugestie spune CE sa faca, nu doar ce lipseste: „Adauga o descriere” e
  mai util decat „Descriere: lipsa”.
*/

export type Nivel = "bine" | "atentie" | "problema";
export interface Sugestie { nivel: Nivel; text: string }

/** Compara fara diacritice si fara majuscule („Lămpi” = „lampi”). */
const norm = (s: string) => slugify(s).replace(/-/g, " ");

function textDin(b: Block): string {
  const html = b.type === "text" ? b.html
    : b.type === "hero" ? `${b.title ?? ""} ${b.subtitle ?? ""}`
    : b.type === "heading" ? `${b.text ?? ""} ${b.subtitle ?? ""}`
    : b.type === "faq" ? (b.items ?? []).map((i) => `${i.q} ${i.a}`).join(" ")
    : b.type === "trust" ? (b.items ?? []).map((i) => `${i.title} ${i.desc}`).join(" ")
    : "";
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function titluH1(blocks: Block[], toate: Block[]): string {
  const alesDeOm = toate.find((b) => b.type === "heading" && b.level === 1);
  if (alesDeOm && alesDeOm.type === "heading") return alesDeOm.text ?? "";
  const id = titlulPrincipal(blocks);
  const b = toate.find((x) => x.id === id);
  return b?.type === "hero" ? b.title ?? "" : b?.type === "heading" ? b.text ?? "" : "";
}

export function sugestiiSeo(p: { title: string; slug: string; seo: PageSeo; blocks: Block[] }): { scor: number; sugestii: Sugestie[] } {
  const toate = flattenBlocks(p.blocks);
  const s: Sugestie[] = [];
  const titlu = (p.seo.title || p.title).trim();
  const descriere = (p.seo.description ?? "").trim();

  if (p.seo.noindex) s.push({ nivel: "problema", text: "Pagina e ascunsă din Google (noindex). Debifează dacă vrei să apară în căutări." });

  if (titlu.length < 30) s.push({ nivel: "atentie", text: `Titlul pentru Google are ${titlu.length} caractere. Între 30 și 60 spune mai mult și e ales mai des.` });
  else if (titlu.length > 60) s.push({ nivel: "atentie", text: `Titlul pentru Google are ${titlu.length} caractere. Peste 60, Google îl taie.` });
  else s.push({ nivel: "bine", text: "Titlul are o lungime bună." });

  if (!descriere) {
    const auto = descriereDinBlocuri(p.blocks);
    s.push(auto
      ? { nivel: "atentie", text: "Nu ai scris o descriere: se ia automat primul paragraf. Una scrisă de tine convinge mai bine." }
      : { nivel: "problema", text: "Pagina n-are descriere și nici un paragraf din care să se ia. Scrie o descriere de 70-160 de caractere." });
  } else if (descriere.length < 70) s.push({ nivel: "atentie", text: `Descrierea are ${descriere.length} caractere. Între 70 și 160 e ideal.` });
  else if (descriere.length > 160) s.push({ nivel: "atentie", text: `Descrierea are ${descriere.length} caractere. Peste 160, Google o taie.` });
  else s.push({ nivel: "bine", text: "Descrierea are o lungime bună." });

  const h1 = titluH1(p.blocks, toate);
  const h1Alese = toate.filter((b) => b.type === "heading" && b.level === 1).length;
  if (!h1) s.push({ nivel: "problema", text: "Pagina n-are niciun titlu. Adaugă un bloc de titlu sau un hero cu titlu: devine titlul principal (H1)." });
  else if (h1Alese > 1) s.push({ nivel: "atentie", text: `Ai ${h1Alese} titluri marcate H1. Lasă unul singur, celelalte H2.` });
  else s.push({ nivel: "bine", text: `Titlul principal (H1): „${h1.slice(0, 60)}”.` });

  const imagini = toate.filter((b) => b.type === "image" && b.src);
  const faraAlt = imagini.filter((b) => b.type === "image" && !(b.alt ?? "").trim()).length;
  if (faraAlt > 0) s.push({ nivel: "atentie", text: `${faraAlt} ${faraAlt === 1 ? "imagine n-are" : "imagini n-au"} text alternativ. Descrie ce se vede: ajută Google Imagini și cititoarele de ecran.` });
  else if (imagini.length > 0) s.push({ nivel: "bine", text: "Toate imaginile au text alternativ." });

  const cuvinte = toate.map(textDin).join(" ").split(/\s+/).filter((w) => w.length > 1).length;
  if (cuvinte < 150) s.push({ nivel: "atentie", text: `Pagina are ${cuvinte} de cuvinte. Sub 150, Google o poate socoti prea subțire; câteva paragrafe utile ajută.` });
  else s.push({ nivel: "bine", text: `Pagina are ${cuvinte} de cuvinte.` });

  const interne = toate.filter((b) => {
    const h = b.type === "button" ? b.href : b.type === "hero" ? b.buttonHref : b.type === "image" ? b.href : undefined;
    return !!h && h.startsWith("/");
  }).length + toate.filter((b) => b.type === "text" && /href="\//.test(b.html ?? "")).length;
  if (interne === 0) s.push({ nivel: "atentie", text: "Nicio legătură spre alte pagini ale magazinului. Un buton spre produse sau o categorie ține clientul pe site." });
  else s.push({ nivel: "bine", text: `${interne} ${interne === 1 ? "legătură" : "legături"} spre alte pagini ale magazinului.` });

  if (!p.seo.ogImage) s.push({ nivel: "atentie", text: "Nu ai ales o imagine de distribuire: pe Facebook și WhatsApp apare coperta magazinului." });

  const cuvant = (p.seo.focusKeyword ?? "").trim();
  if (cuvant) {
    const c = norm(cuvant);
    const verifica = (unde: string, text: string) => s.push(norm(text).includes(c)
      ? { nivel: "bine", text: `Cuvântul cheie apare în ${unde}.` }
      : { nivel: "atentie", text: `Cuvântul cheie „${cuvant}” nu apare în ${unde}.` });
    verifica("titlul pentru Google", titlu);
    verifica("descriere", descriere || descriereDinBlocuri(p.blocks) || "");
    verifica("titlul principal (H1)", h1);
    verifica("link (slug)", p.slug.replace(/-/g, " "));
    const primul = toate.map(textDin).find((t) => t.length > 40) ?? "";
    verifica("primul paragraf", primul);
  }

  const puncte = s.reduce((acc, x) => acc + (x.nivel === "bine" ? 1 : x.nivel === "atentie" ? 0.5 : 0), 0);
  const scor = s.length ? Math.round((puncte / s.length) * 100) : 0;
  const ordine: Record<Nivel, number> = { problema: 0, atentie: 1, bine: 2 };
  return { scor, sugestii: s.sort((a, b) => ordine[a.nivel] - ordine[b.nivel]) };
}
