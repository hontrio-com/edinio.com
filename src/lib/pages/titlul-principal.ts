import type { Block } from "./blocks.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CARE TITLU E H1                                                  (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Masurat pe productie: 22 din 29 de pagini publicate n-aveau niciun H1. Titlul
  din hero se scria `<h2>`, iar blocul de titlu pornea pe H2, deci chiar o
  pagina care arata un titlu mare in capul ei ii spunea lui Google ca n-are
  titlu principal.

  Regula: daca omul a ales singur un H1 (blocul de titlu cu „H1"), el ramane
  singurul. Altfel, PRIMUL titlu vizibil al paginii (titlul unui hero sau un
  bloc de titlu, in ordinea de pe pagina, inclusiv in coloane) devine H1.
  Intoarce id-ul blocului, sau null cand nu e nimic de promovat.

  ⚠ Se aplica la randare, nu se scrie in bloc: comerciantul care muta blocurile
  nu trebuie sa tina minte sa mute si H1-ul.
*/
export function titlulPrincipal(blocks: Block[]): string | null {
  /* 26.09.2026 (auditul paginilor): intoarce si H1-ul ales de om, PRIMUL dintre ele.
     Pana acum intorcea null si fiecare titlu cu „H1” iesea `<h1>`: doua alese, doua H1. */
  return primulH1Ales(blocks) ?? primulTitlu(blocks);
}

function primulH1Ales(blocks: Block[]): string | null {
  for (const b of blocks) {
    if (b.type === "heading" && b.level === 1 && (b.text ?? "").trim()) return b.id;
    if (b.type === "columns") {
      for (const it of b.items ?? []) {
        if (!Array.isArray(it.blocks)) continue;
        const gasit = primulH1Ales(it.blocks);
        if (gasit) return gasit;
      }
    }
  }
  return null;
}

/**
 * Pagina are de unde lua un H1 (un titlu ales H1, un hero sau un titlu)? Daca nu,
 * pagina publica pune titlul paginii ca H1 ascuns (26.09.2026: `proba-blocuri`,
 * numai beneficii, pachete si formulare, iesea fara niciun H1).
 */
export function areTitluPrincipal(blocks: Block[]): boolean {
  return areH1Ales(blocks) || primulTitlu(blocks) !== null;
}

function areH1Ales(blocks: Block[]): boolean {
  for (const b of blocks) {
    if (b.type === "heading" && b.level === 1 && (b.text ?? "").trim()) return true;
    if (b.type === "columns") {
      for (const it of b.items ?? []) if (Array.isArray(it.blocks) && areH1Ales(it.blocks)) return true;
    }
  }
  return false;
}

function primulTitlu(blocks: Block[]): string | null {
  for (const b of blocks) {
    if (b.type === "hero" && (b.title ?? "").trim()) return b.id;
    if (b.type === "heading" && (b.text ?? "").trim()) return b.id;
    if (b.type === "columns") {
      for (const it of b.items ?? []) {
        if (!Array.isArray(it.blocks)) continue;
        const gasit = primulTitlu(it.blocks);
        if (gasit) return gasit;
      }
    }
  }
  return null;
}

/**
 * Descrierea pentru Google cand comerciantul n-a scris una: primul paragraf
 * de text al paginii, fara etichete, taiat la ~155 de semne pe un cuvant.
 */
export function descriereDinBlocuri(blocks: Block[]): string | null {
  for (const b of blocks) {
    let html = "";
    if (b.type === "text") html = b.html ?? "";
    else if (b.type === "hero") html = b.subtitle ?? "";
    else if (b.type === "heading") html = b.subtitle ?? "";
    else if (b.type === "columns") {
      for (const it of b.items ?? []) {
        const d = Array.isArray(it.blocks) ? descriereDinBlocuri(it.blocks) : null;
        if (d) return d;
      }
      continue;
    }
    const text = html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 40) {
      if (text.length <= 158) return text;
      const taiat = text.slice(0, 155);
      return `${taiat.slice(0, Math.max(taiat.lastIndexOf(" "), 120))}…`;
    }
  }
  return null;
}
