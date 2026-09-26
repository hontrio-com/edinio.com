import { createBlock, type Block, type TipPaginaProprie } from "./blocks.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SABLOANELE DE PAGINA NOUA                                        (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: fereastra „Pagina noua” era un chenar mic, cu titlu si link.
  Omul pornea mereu de la o pagina goala si trebuia sa stie ce blocuri pune ca
  sa iasa un „Despre noi” sau un „Contact”.

  Un sablon e doar un punct de plecare: blocuri obisnuite, cu text de exemplu,
  pe care le schimba sau le sterge in editor. Fiecare isi aduce si tipul
  paginii (pentru datele structurate), pe care omul il poate schimba.

  ⚠ Se construiesc pe SERVER (`createPage`), nu se primesc de la client: altfel
  ruta de creare ar fi acceptat orice bloc pe langa verificarile din `updatePage`.
*/

export const SABLOANE = ["goala", "despre", "contact", "faq", "prezentare", "articol"] as const;
export type Sablon = (typeof SABLOANE)[number];

export const DESPRE_SABLOANE: Record<Sablon, { nume: string; descriere: string; tip: TipPaginaProprie; titlu: string }> = {
  goala: { nume: "Pagină goală", descriere: "Pornești de la zero și adaugi blocurile tale.", tip: "pagina", titlu: "" },
  despre: { nume: "Despre noi", descriere: "Povestea magazinului, cu imagine, valori și un îndemn.", tip: "pagina", titlu: "Despre noi" },
  contact: { nume: "Contact", descriere: "Formular, date de contact și hartă cu butoane Waze și Google Maps.", tip: "contact", titlu: "Contact" },
  faq: { nume: "Întrebări frecvente", descriere: "Răspunsuri la ce te întreabă clienții, apar și în Google.", tip: "pagina", titlu: "Întrebări frecvente" },
  prezentare: { nume: "Prezentare / campanie", descriere: "Hero mare, beneficii, produse și un buton de cumpărare.", tip: "colectie", titlu: "" },
  articol: { nume: "Articol de blog", descriere: "Titlu, imagine și text, gata de citit.", tip: "articol", titlu: "" },
};

export const esteSablon = (v: unknown): v is Sablon => typeof v === "string" && (SABLOANE as readonly string[]).includes(v);

/** Blocurile unui sablon. `titlu` = titlul paginii, pus in capul ei unde are rost. */
export function blocuriSablon(sablon: Sablon, titlu: string): Block[] {
  const t = titlu.trim();
  const b = <T extends Block>(tip: T["type"], p: Partial<T>): Block => ({ ...createBlock(tip), ...p }) as Block;

  switch (sablon) {
    case "despre":
      return [
        b("hero", { title: t || "Despre noi", subtitle: "Cine suntem, de unde am pornit și de ce facem ce facem.", buttonLabel: "", layout: "overlay", height: "sm", style: { anim: "fade-up" } }),
        b("columns", {
          count: 2, template: "1-1", perRow: 2, verticalAlign: "center", gap: "lg",
          items: [
            { blocks: [{ ...createBlock("image", { inColumn: true }) }] },
            {
              blocks: [
                { ...createBlock("heading", { inColumn: true }), text: "Povestea noastră", level: 2, size: "lg", style: { padding: "sm", width: "full", align: "left" } } as Block,
                { ...createBlock("text", { inColumn: true }), html: "<p>Scrie aici cum a început magazinul, ce vă face diferiți și pentru cine lucrați. Două-trei paragrafe scurte sunt de ajuns.</p>" } as Block,
              ],
            },
          ],
          style: { padding: "lg", anim: "fade-up" },
        }),
        b("trust", { style: { padding: "lg", anim: "fade-up" } }),
        b("button", { label: "Vezi produsele", href: "/", style: { align: "center", padding: "lg" } }),
      ];
    case "contact":
      return [
        b("heading", { text: t || "Contact", level: 1, size: "xl", subtitle: "Scrie-ne și îți răspundem cât de repede putem.", style: { align: "center", padding: "lg" } }),
        b("columns", {
          count: 2, template: "1-1", perRow: 2, gap: "lg",
          items: [
            { blocks: [{ ...createBlock("contact", { inColumn: true }), title: "Trimite-ne un mesaj" } as Block] },
            {
              blocks: [
                { ...createBlock("text", { inColumn: true }), html: "<p><strong>Telefon:</strong> 07xx xxx xxx<br><strong>Email:</strong> contact@magazin.ro<br><strong>Program:</strong> Luni–Vineri, 9:00–18:00</p>" } as Block,
                { ...createBlock("map", { inColumn: true }), wazeButton: true, googleButton: true, height: 280 } as Block,
              ],
            },
          ],
          style: { padding: "md" },
        }),
      ];
    case "faq":
      return [
        b("faq", {
          title: t || "Întrebări frecvente",
          subtitle: "Nu găsești răspunsul? Scrie-ne și te ajutăm.",
          variant: "cards", icon: "chevron", iconPos: "right",
          items: [
            { q: "În cât timp ajunge comanda?", a: "De obicei în 1–3 zile lucrătoare de la confirmare." },
            { q: "Pot returna un produs?", a: "Da, în 14 zile de la primire, fără să ne spui motivul." },
            { q: "Cum pot plăti?", a: "Cu cardul online sau ramburs, la curier." },
          ],
          style: { padding: "lg", anim: "fade-up" },
        }),
        b("button", { label: "Contactează-ne", href: "", style: { align: "center", padding: "md" } }),
      ];
    case "prezentare":
      return [
        b("hero", { title: t || "Colecția nouă", subtitle: "O frază care spune de ce merită.", buttonLabel: "Cumpără acum", buttonHref: "/", secondLabel: "Află mai mult", height: "lg", kenBurns: true }),
        b("trust", { style: { padding: "lg", anim: "fade-up" } }),
        b("products", { title: "Produse din colecție", style: { padding: "lg", anim: "fade-up" } }),
        b("faq", { title: "Întrebări frecvente", variant: "minimal", style: { padding: "lg" } }),
        b("button", { label: "Vezi toate produsele", href: "/", effect: "shine", size: "lg", style: { align: "center", padding: "lg" } }),
      ];
    case "articol":
      return [
        b("heading", { text: t || "Titlul articolului", level: 1, size: "xl", style: { align: "left", padding: "md", width: "narrow" } }),
        b("image", { style: { padding: "sm", width: "narrow" } }),
        b("text", { html: "<p>Începe cu ideea principală a articolului, în două-trei rânduri. Apoi dezvoltă, cu subtitluri scurte și paragrafe mici.</p><h2>Primul subtitlu</h2><p>Textul tău aici.</p>" }),
      ];
    default:
      return [];
  }
}
