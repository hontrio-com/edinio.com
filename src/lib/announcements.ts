// Shared types + helpers for the Noutati (announcements) system.

export type AnnouncementBlock =
  | { type: "heading"; text: string }
  | { type: "text"; html: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "video"; url: string }
  | { type: "button"; label: string; url: string }
  | { type: "divider" };

export type Announcement = {
  id: string;
  title: string;
  excerpt: string | null;
  blocks: AnnouncementBlock[];
  cover_url: string | null;
  is_published: boolean;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Convert a YouTube / Vimeo / Loom watch URL into an embeddable iframe src.
 * Returns null if the URL is not a recognised provider (caller then treats it
 * as a direct video file or a plain link).
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "loom.com" && u.pathname.includes("/share/")) {
      const id = u.pathname.split("/share/")[1]?.split("/")[0];
      if (id) return `https://www.loom.com/embed/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.trim());
}

/**
 * Rezumatul de o vorba al unui anunt, pentru lista din panou.
 *
 * Se ia `excerpt` daca exista; altfel se face unul din primul bloc de text.
 * ⚠ HTML-ul se CURATA de etichete, nu se taie pur si simplu: „<p>Salut</p>"
 * scurtat la 20 de caractere ar fi ajuns pe ecran cu o eticheta rupta in doua,
 * iar randul de sub titlu ar fi aratat cod.
 *
 * ⚠ Se taie la ULTIMUL SPATIU dinaintea limitei, nu la mijlocul unui cuvant.
 */
export function rezumatScurt(a: Pick<Announcement, "excerpt" | "blocks">, limita = 150): string {
  const dinExcerpt = a.excerpt?.trim();
  if (dinExcerpt) return scurteaza(dinExcerpt, limita);

  const blocuri = Array.isArray(a.blocks) ? a.blocks : [];
  for (const b of blocuri) {
    if (b.type === "text") {
      const curat = faraEtichete(b.html);
      if (curat) return scurteaza(curat, limita);
    }
    if (b.type === "heading" && b.text.trim()) return scurteaza(b.text.trim(), limita);
  }
  return "";
}

/*
  ⚠ SI SEMNELE SCRISE CU NUME, nu doar cele cinci de baza.

  Editorul din panoul de administrare scrie curent `&mdash;`, `&hellip;` sau
  ghilimelele romanesti ca entitati. Lasate asa, randul de sub titlu arata
  „Comenzi &amp;mdash; facturi", adica exact ca o pagina stricata. Cele numerice
  (`&#8222;`) se traduc singure, dupa cod.
*/
const SEMNE: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  mdash: "-", ndash: "-", hellip: "...", laquo: "«", raquo: "»",
  bdquo: "„", ldquo: "”", rdquo: "”", lsquo: "’", rsquo: "’", shy: "",
};

function faraEtichete(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, cod: string) => String.fromCodePoint(Number(cod)))
    .replace(/&#x([0-9a-f]+);/gi, (_, cod: string) => String.fromCodePoint(parseInt(cod, 16)))
    .replace(/&([a-z]+);/gi, (intreg, nume: string) => SEMNE[nume.toLowerCase()] ?? intreg)
    .replace(/\s+/g, " ")
    .trim();
}

function scurteaza(text: string, limita: number): string {
  if (text.length <= limita) return text;
  const taiat = text.slice(0, limita);
  const spatiu = taiat.lastIndexOf(" ");
  return `${(spatiu > limita * 0.6 ? taiat.slice(0, spatiu) : taiat).trimEnd()}...`;
}
