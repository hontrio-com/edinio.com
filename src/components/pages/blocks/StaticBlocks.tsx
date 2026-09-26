import { Globe } from "lucide-react";
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon } from "../../ministore/social-icons";
import { PageIcon } from "../icon-registry";
import { ASCUNS, BlockShell, RAZA, UMBRA } from "../BlockShell";
import { resolveHref, isExternalHref } from "@/lib/pages/href";
import { videoEmbedUrl } from "@/lib/pages/embeds";
import { culoareSigura, cuTransparenta } from "@/lib/pages/culori";
import { atributeAnimatie, clasaEfectButon, clasaEfectImagine } from "@/lib/pages/animatii";
import { stivaFont } from "@/lib/pages/fonturi";
import { NativeVideo } from "./NativeVideo";
import type { CSSProperties, ReactNode } from "react";
import type {
  Block, HeroBlock, HeadingBlock, TextBlock, ImageBlock, GalleryBlock, GalleryItem, ButtonBlock,
  ColumnsBlock, SpacerBlock, DividerBlock, VideoBlock, TrustBlock, SocialBlock,
} from "@/lib/pages/blocks.types";
import { columnsGridTemplate, isFlexibleColumns } from "@/lib/pages/block-tree";

/* Pure presentational components. HTML passed to dangerouslySetInnerHTML is
   sanitized upstream by the public route (prepare-blocks); in the editor preview
   it is the owner's own content. Button effects use CSS classes (see
   stil-comun.css) so these stay server-renderable. */

const BTN_SIZE: Record<string, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-7 py-3.5 text-sm",
  lg: "px-9 py-4 text-base",
};
const BTN_ROUNDED: Record<string, string> = {
  sm: "rounded-md", md: "rounded-lg", lg: "rounded-xl", full: "rounded-full",
};

type Varianta = "solid" | "outline" | "soft" | "ghost";

function Btn({ href, basePath, label, color, variant = "solid", size = "md", rounded = "lg", effect = "none", textColor, fullWidth, newTab, icon, iconPos = "left", font, weight, transform }: {
  href?: string; basePath: string; label: string; color: string;
  variant?: Varianta; size?: "sm" | "md" | "lg"; rounded?: "sm" | "md" | "lg" | "full";
  effect?: string; textColor?: string | null; fullWidth?: boolean; newTab?: boolean;
  icon?: string | null; iconPos?: "left" | "right";
  font?: string | null; weight?: string; transform?: string;
}) {
  const resolved = resolveHref(href, basePath);
  const ext = newTab || isExternalHref(href);
  /* `--fx-c`: culoarea butonului, pentru efectele care o folosesc (`fx-ring`, `fx-fill`, `fx-lift`). */
  let style = { "--fx-c": color } as CSSProperties;
  if (variant === "solid") style = { ...style, backgroundColor: color, color: textColor || "#fff", boxShadow: `0 4px 16px ${cuTransparenta(color, 0.27)}` };
  else if (variant === "outline") style = { ...style, border: `2px solid ${color}`, color: textColor || color, background: "transparent" };
  else if (variant === "soft") style = { ...style, backgroundColor: cuTransparenta(color, 0.12), color: textColor || color };
  else style = { ...style, color: textColor || color, background: "transparent" }; // ghost
  style = { ...style, ...tipografie({ font, weight, transform }) };
  const ic = icon ? <PageIcon name={icon} className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} /> : null;
  return (
    <a href={resolved} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-all hover:opacity-90 active:scale-[0.98] ${BTN_SIZE[size]} ${BTN_ROUNDED[rounded]} ${clasaEfectButon(effect)} ${fullWidth ? "w-full" : ""}`}
      style={style}>
      {iconPos === "left" && ic}
      {label}
      {iconPos === "right" && ic}
    </a>
  );
}

/** Stilul de tipografie comun titlului din hero si blocului de titlu. */
function tipografie(t: { font?: string | null; weight?: string; transform?: string; italic?: boolean; spacing?: string }): CSSProperties {
  const s: CSSProperties = {};
  if (t.font) s.fontFamily = stivaFont(t.font as Parameters<typeof stivaFont>[0]);
  if (t.weight) s.fontWeight = Number(t.weight);
  if (t.transform && t.transform !== "none") s.textTransform = t.transform as CSSProperties["textTransform"];
  if (t.italic) s.fontStyle = "italic";
  if (t.spacing === "tight") s.letterSpacing = "-0.03em";
  else if (t.spacing === "wide") s.letterSpacing = "0.04em";
  else if (t.spacing === "wider") s.letterSpacing = "0.12em";
  return s;
}

export function HeroBlockView({ block, color, basePath, h1 }: { block: HeroBlock; color: string; basePath: string; h1?: boolean }) {
  const split = block.layout === "split-left" || block.layout === "split-right";
  const heightCls = block.height === "lg" ? "py-28 pg-md:py-40" : block.height === "sm" ? "py-14 pg-md:py-20" : block.height === "custom" ? "" : "py-20 pg-md:py-28";
  const heightStyle: CSSProperties | undefined = block.height === "custom" ? { minHeight: Math.max(80, block.heightCustom ?? 360), display: "flex", flexDirection: "column", justifyContent: "center" } : undefined;
  const align = block.align === "left" || split ? "items-start text-left" : "items-center text-center";
  const textColor = block.textColor ?? (block.bgImage && !split ? "#ffffff" : "#111111");
  const Titlu = h1 ? "h1" : "h2";
  const strat = Math.min(80, Math.max(0, block.overlayOpacity ?? 45)) / 100;
  /*
    Fundalul unui hero fara imagine si fara culoare aleasa (26.09.2026): era alb
    (`--color-surface`), deci pe pagina alba banda se pierdea. Acum, o nuanta
    foarte deschisa a culorii magazinului.
  */
  const fundalHero = `color-mix(in srgb, ${culoareSigura(color) ?? "#111111"} 6%, #ffffff)`;

  const text = (
    <>
      {block.title && (
        <Titlu
          className="text-3xl pg-sm:text-4xl pg-md:text-5xl font-black tracking-tight leading-tight"
          style={{ color: textColor, ...tipografie({ font: block.titleFont, weight: block.titleWeight, transform: block.titleTransform }) }}
        >
          {block.title}
        </Titlu>
      )}
      {block.subtitle && (
        <p className="mt-4 text-base pg-sm:text-lg max-w-2xl leading-relaxed" style={{ color: textColor, opacity: 0.85, ...tipografie({ font: block.subtitleFont }) }}>{block.subtitle}</p>
      )}
      {(block.buttonLabel || block.secondLabel) && (
        <div className={`mt-8 flex flex-wrap gap-3 ${split || block.align === "left" ? "" : "justify-center"}`}>
          {block.buttonLabel && <Btn href={block.buttonHref} basePath={basePath} label={block.buttonLabel} color={block.buttonColor || color} textColor={block.buttonTextColor} />}
          {block.secondLabel && (
            <Btn href={block.secondHref} basePath={basePath} label={block.secondLabel}
              color={split ? (block.buttonColor || color) : (block.bgImage ? "#ffffff" : block.buttonColor || color)} variant="outline" />
          )}
        </div>
      )}
    </>
  );

  if (split) {
    /* Imaginea alaturi de text: pe telefon imaginea sta deasupra. */
    return (
      <section className={`relative overflow-hidden ${block.style?.hideOn ? ASCUNS[block.style.hideOn] ?? "" : ""}`} style={{ backgroundColor: block.bgColor ?? fundalHero }} {...atributeAnimatie(block.style).attrs} suppressHydrationWarning>
        <div className={`mx-auto grid max-w-6xl items-center gap-8 px-4 pg-md:grid-cols-2 pg-md:gap-14 ${heightCls}`} style={heightStyle}>
          <div className={`${block.layout === "split-right" ? "pg-md:order-2" : ""} overflow-hidden rounded-2xl`}>
            {block.bgImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.bgImage} alt="" fetchPriority={h1 ? "high" : undefined} decoding="async"
                className={`aspect-[4/3] w-full object-cover ${block.kenBurns ? "hero-ken-burns" : ""}`} />
            )}
          </div>
          <div className={`flex flex-col ${align}`}>{text}</div>
        </div>
      </section>
    );
  }

  return (
    <section className={`relative overflow-hidden ${block.style?.hideOn ? ASCUNS[block.style.hideOn] ?? "" : ""}`} style={{ backgroundColor: block.bgColor ?? (block.bgImage ? "#111" : fundalHero) }} {...atributeAnimatie(block.style).attrs} suppressHydrationWarning>
      {block.bgImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.bgImage} alt="" fetchPriority={h1 ? "high" : undefined} decoding="async"
          className={`absolute inset-0 w-full h-full object-cover ${block.kenBurns ? "hero-ken-burns" : ""}`} />
      )}
      {block.bgImage && block.overlay !== false && <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${strat})` }} />}
      <div className={`relative z-10 max-w-4xl mx-auto px-4 flex flex-col ${align} ${heightCls}`} style={heightStyle}>
        {text}
      </div>
    </section>
  );
}

const HEADING_SIZE: Record<string, string> = {
  sm: "text-lg pg-sm:text-xl",
  md: "text-xl pg-sm:text-2xl",
  lg: "text-2xl pg-sm:text-3xl pg-md:text-4xl",
  xl: "text-3xl pg-sm:text-4xl pg-md:text-5xl",
  "2xl": "text-4xl pg-sm:text-5xl pg-md:text-6xl",
  "3xl": "text-5xl pg-sm:text-6xl pg-md:text-7xl",
};

export function HeadingBlockView({ block, h1 }: { block: HeadingBlock; h1?: boolean }) {
  // Un titlu gol nu lasa in pagina un `<h2></h2>` gol.
  if (!(block.text ?? "").trim() && !block.eyebrow && !block.subtitle) return null;
  /* H1 e numai titlul ales de `titlulPrincipal`; un al doilea „H1” iese H2 (marimea ramane cea aleasa in bloc). */
  const Tag = (h1 ? "h1" : `h${block.level === 1 ? 2 : block.level ?? 2}`) as "h1" | "h2" | "h3";
  const custom = block.size === "custom";
  const sizeCls = custom ? "" : (HEADING_SIZE[block.size ?? "lg"] ?? HEADING_SIZE.lg);
  const style: CSSProperties = tipografie(block);
  if (block.gradient?.from && block.gradient.to) {
    style.backgroundImage = `linear-gradient(90deg, ${block.gradient.from}, ${block.gradient.to})`;
    style.WebkitBackgroundClip = "text";
    style.backgroundClip = "text";
    style.color = "transparent";
  } else if (block.color) style.color = block.color;
  if (custom) { style.fontSize = Math.max(12, block.sizeCustom ?? 32); style.lineHeight = 1.1; }
  const colorat = !!block.color || !!block.gradient;
  return (
    <BlockShell style={block.style}>
      {block.eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: block.gradient?.from ?? block.color ?? undefined, opacity: block.color || block.gradient ? 1 : 0.6 }}>
          {block.eyebrow}
        </p>
      )}
      <Tag className={`pg-titlu font-black tracking-tight ${colorat ? "" : "text-foreground"} ${sizeCls}`} style={Object.keys(style).length ? style : undefined}>{block.text}</Tag>
      {block.subtitle && <p className="mt-3 text-base pg-sm:text-lg leading-relaxed text-muted-foreground">{block.subtitle}</p>}
    </BlockShell>
  );
}

const INALTIME_RAND: Record<string, number> = { tight: 1.3, normal: 1.6, relaxed: 1.8, loose: 2.1 };

export function TextBlockView({ block }: { block: TextBlock }) {
  /* Tipografia textului, pe bloc (25.09.2026). Lipsa oricarui camp = ca pana acum. */
  const stil: CSSProperties = tipografie({ font: block.font, weight: block.weight, spacing: block.spacing });
  if (block.style?.textColor) stil.color = block.style.textColor;
  if (block.fontSize) stil.fontSize = Math.min(32, Math.max(12, block.fontSize));
  if (block.lineHeight) stil.lineHeight = INALTIME_RAND[block.lineHeight];
  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      {/* ⚠ Fara `text-left`: batea alinierea aleasa in „Aspect” (a venit din `BlockShell`). */}
      <div className={`policy-content pg-text text-base ${block.lineHeight ? "pg-text-rand" : "leading-relaxed"}`}
        style={Object.keys(stil).length ? stil : undefined}
        dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
    </BlockShell>
  );
}

const ASPECT: Record<string, string> = {
  "1:1": "aspect-square", "4:3": "aspect-[4/3]", "3:4": "aspect-[3/4]", "16:9": "aspect-video", "21:9": "aspect-[21/9]",
};

export function ImageBlockView({ block, basePath }: { block: ImageBlock; basePath: string }) {
  if (!block.src) return null;
  const justify = block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center";
  const w = Math.min(100, Math.max(10, block.widthPct ?? 100));
  const taiata = block.aspect && block.aspect !== "original" ? ASPECT[block.aspect] : "";
  const raza = block.rounded !== false ? "rounded-2xl" : "";
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={block.src} alt={block.alt ?? ""} loading="lazy" decoding="async"
      className={`h-auto w-full ${taiata ? `${taiata} object-cover` : ""} ${raza}`} />
  );
  const efect = clasaEfectImagine(block.hover);
  const cutie = (inner: ReactNode) => (
    <div className={`${efect} ${raza} ${UMBRA[block.shadow ?? "none"] ?? ""}`} style={{ width: `${w}%` }}>{inner}</div>
  );
  return (
    <BlockShell style={block.style}>
      <figure className={`flex flex-col ${block.align === "left" ? "items-start" : block.align === "right" ? "items-end" : "items-center"}`}>
        <div className={`flex w-full ${justify}`}>
          {block.href
            ? <a href={resolveHref(block.href, basePath)} {...(block.newTab || isExternalHref(block.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="contents">{cutie(img)}</a>
            : cutie(img)}
        </div>
        {block.caption && <figcaption className="mt-2 text-sm text-muted-foreground text-center">{block.caption}</figcaption>}
      </figure>
    </BlockShell>
  );
}

const GALERIE_COLOANE: Record<number, string> = {
  2: "pg-md:grid-cols-2", 3: "pg-md:grid-cols-3", 4: "pg-md:grid-cols-4", 5: "pg-md:grid-cols-5", 6: "pg-md:grid-cols-6",
};
const MASONRY_COLOANE: Record<number, string> = {
  2: "pg-md:columns-2", 3: "pg-md:columns-3", 4: "pg-md:columns-4", 5: "pg-md:columns-5", 6: "pg-md:columns-6",
};

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  const items: GalleryItem[] = block.items ?? (block.images ?? []).filter(Boolean).map((src) => ({ src }));
  if (items.length === 0) return null;
  const n = block.columns ?? 3;
  const pePhone = block.mobileColumns ?? 2;
  const gap = block.gap === "sm" ? "gap-2" : block.gap === "lg" ? "gap-5" : "gap-3";
  const mode = block.captionMode ?? "none";
  const raza = RAZA[block.rounded ?? "md"] ?? "rounded-xl";
  const efect = clasaEfectImagine(block.hover);
  const masonry = block.layout === "masonry";
  const aspect = masonry ? "" : `${ASPECT[block.aspect ?? "1:1"] ?? "aspect-square"} object-cover`;

  const figura = (it: GalleryItem, i: number) => (
    <figure key={i} className={`text-left ${masonry ? `mb-3 break-inside-avoid` : ""}`}>
      <div className={`${efect} ${raza} border border-border`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.src} alt={it.title ?? ""} loading="lazy" decoding="async" className={`w-full ${aspect} ${raza}`} />
      </div>
      {mode !== "none" && (it.title || it.desc) && (
        <figcaption className="mt-1.5">
          {(mode === "title" || mode === "both") && it.title && <p className="text-sm font-semibold text-foreground">{it.title}</p>}
          {(mode === "desc" || mode === "both") && it.desc && <p className="text-xs text-muted-foreground">{it.desc}</p>}
        </figcaption>
      )}
    </figure>
  );

  return (
    <BlockShell style={block.style}>
      {masonry ? (
        <div className={`${pePhone === 1 ? "columns-1" : "columns-2"} ${MASONRY_COLOANE[n] ?? "pg-md:columns-3"} ${gap}`}>{items.map(figura)}</div>
      ) : (
        <div className={`grid ${pePhone === 1 ? "grid-cols-1" : "grid-cols-2"} ${GALERIE_COLOANE[n] ?? "pg-md:grid-cols-3"} ${gap}`}>{items.map(figura)}</div>
      )}
    </BlockShell>
  );
}

export function ButtonBlockView({ block, color, basePath }: { block: ButtonBlock; color: string; basePath: string }) {
  if (!block.label) return null;
  const aliniere = block.style?.align === "left" ? "justify-start" : block.style?.align === "right" ? "justify-end" : "justify-center";
  return (
    <BlockShell style={{ align: "center", ...block.style }}>
      <div className={`flex flex-wrap items-center gap-3 ${aliniere}`}>
        <Btn href={block.href} basePath={basePath} label={block.label} color={block.color || color}
          variant={block.variant} size={block.size} rounded={block.rounded} effect={block.effect}
          textColor={block.textColor} fullWidth={block.fullWidth} newTab={block.newTab}
          icon={block.icon} iconPos={block.iconPos} font={block.font} weight={block.weight} transform={block.transform} />
        {block.secondLabel && (
          <Btn href={block.secondHref} basePath={basePath} label={block.secondLabel} color={block.color || color}
            variant={block.secondVariant ?? "outline"} size={block.size} rounded={block.rounded}
            fullWidth={block.fullWidth} newTab={block.newTab} font={block.font} weight={block.weight} transform={block.transform} />
        )}
      </div>
    </BlockShell>
  );
}

const GAP_COLOANE: Record<string, string> = { none: "gap-0", sm: "gap-3", md: "gap-6", lg: "gap-8", xl: "gap-12" };
const VALIGN: Record<string, string> = { top: "items-start", center: "items-center", bottom: "items-end", stretch: "items-stretch" };

/*
  Asezarea coloanelor, O SINGURA DATA (26.09.2026, auditul paginilor): editorul isi
  scria grila lui si ignora cardul, fundalul, alinierea verticala, coloanele pe
  telefon, ordinea inversa si spatiile „fara” / „foarte mare”, deci setarile nu se
  vedeau decat pe pagina publicata. Acum si pagina, si editorul (`EditableColumns`)
  folosesc functia asta.
*/
export function asezareColoane(block: ColumnsBlock) {
  const count = block.count ?? 2;
  const gap = GAP_COLOANE[block.gap ?? "md"] ?? "gap-6";
  const valign = VALIGN[block.verticalAlign ?? "top"] ?? "items-start";
  const pePhone = block.mobileColumns === 2 ? "grid-cols-2" : "grid-cols-1";
  // Fara culoare aleasa, fundalul cardului e cel al magazinului (de obicei alb pe alb): conturul il face vizibil.
  const card = block.cellCard ? `rounded-2xl p-5 pg-sm:p-6 ${block.cellBg ? "" : "border border-border"}` : "";
  const cardStyle: CSSProperties | undefined = block.cellCard ? { backgroundColor: block.cellBg ?? "var(--color-surface)" } : undefined;
  return {
    count,
    grila: `grid ${pePhone} ${gap} ${valign} pg-md:[grid-template-columns:var(--tpl)]`,
    stilGrila: { "--tpl": columnsGridTemplate(block) } as CSSProperties,
    /** Clasa si stilul celulei `i`: cardul si ordinea inversa pe telefon (ultima coloana sus; de la `md`, ordinea fireasca). */
    celula: (i: number) => ({
      className: `${block.reverseMobile ? "pg-md:!order-none" : ""} ${card} ${block.verticalAlign === "stretch" ? "h-full" : ""}`,
      style: { ...(block.reverseMobile ? { order: count - i } : {}), ...cardStyle } as CSSProperties,
    }),
  };
}

export function ColumnsBlockView({ block, color, basePath, renderBlocks }: {
  block: ColumnsBlock; color: string; basePath: string;
  /** Renders a column's nested blocks (injected by BlockRenderer to keep recursion in one place). */
  renderBlocks: (blocks: Block[]) => ReactNode;
}) {
  const items = block.items ?? [];
  const flex = isFlexibleColumns(block);
  const a = asezareColoane(block);
  const { count } = a;
  return (
    <BlockShell style={block.style}>
      <div className={a.grila} style={a.stilGrila}>
        {Array.from({ length: count }).map((_, i) => {
          const it = items[i] ?? (flex ? { blocks: [] as Block[] } : {});
          const cel = a.celula(i);
          // Flexible column: render its nested blocks; keep the cell minimal (each
          // nested block brings its own padding/width via BlockShell).
          if (Array.isArray(it.blocks)) {
            return (
              <div key={i} className={`pg-celula min-w-0 ${block.bordered ? "border border-border rounded-2xl overflow-hidden" : ""} ${cel.className}`}
                style={cel.style}>
                {renderBlocks(it.blocks)}
              </div>
            );
          }
          // Classic column: the legacy flat layout.
          return (
            <div key={i} className={`flex flex-col gap-3 text-left ${block.bordered ? "border border-border rounded-2xl p-5" : ""} ${cel.className}`}
              style={cel.style}>
              {it.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image} alt={it.heading ?? ""} loading="lazy" decoding="async" className="w-full h-auto rounded-xl" />
              )}
              {it.heading && <h3 className="text-lg font-bold text-foreground">{it.heading}</h3>}
              {it.html && <div className="policy-content text-foreground/75 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: it.html }} />}
              {it.buttonLabel && <div className="mt-1"><Btn href={it.buttonHref} basePath={basePath} label={it.buttonLabel} color={color} variant="outline" /></div>}
            </div>
          );
        })}
      </div>
    </BlockShell>
  );
}

export function SpacerBlockView({ block }: { block: SpacerBlock }) {
  const h = block.size === "custom" ? Math.max(0, block.sizeCustom ?? 40)
    : block.size === "sm" ? 24 : block.size === "lg" ? 64 : block.size === "xl" ? 96 : 40;
  return <div style={{ height: h }} aria-hidden />;
}

export function DividerBlockView({ block }: { block: DividerBlock }) {
  const w = Math.min(100, Math.max(10, block.widthPct ?? 100));
  return (
    <BlockShell style={{ padding: "sm", ...block.style }}>
      <hr className="mx-auto" style={{
        width: `${w}%`,
        borderTopStyle: block.lineStyle ?? "solid",
        borderTopWidth: Math.max(1, block.thickness ?? 1),
        borderColor: block.color ?? "var(--color-border)",
      }} />
    </BlockShell>
  );
}

export function VideoBlockView({ block }: { block: VideoBlock }) {
  const w = Math.min(100, Math.max(10, block.widthPct ?? 100));
  const ratio = block.aspect === "9:16" ? "9 / 16" : block.aspect === "1:1" ? "1 / 1" : "16 / 9";
  const justify = block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center";
  // Shared frame: alignment + custom width + aspect ratio (like the image block).
  const frame = (inner: ReactNode) => (
    <BlockShell style={{ width: "container", ...block.style }}>
      <div className={`flex w-full ${justify}`}>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-black" style={{ width: `${w}%`, aspectRatio: ratio }}>
          {inner}
        </div>
      </div>
    </BlockShell>
  );

  // Uploaded (self-hosted) video takes priority over an embed URL.
  if (block.src) {
    return frame(
      <NativeVideo
        src={block.src}
        poster={block.poster ?? undefined}
        controls={block.controls !== false}
        autoplay={!!block.autoplay}
        loop={!!block.loop}
        muted={!!block.muted}
      />,
    );
  }
  const embed = videoEmbedUrl(block.url, {
    autoplay: block.autoplay,
    loop: block.loop,
    muted: block.muted,
    controls: block.controls !== false,
  });
  if (!embed) return null;
  return frame(
    <iframe src={embed} title="Video" className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />,
  );
}

const MARIME_ICON: Record<string, { cutie: string; icon: string }> = {
  sm: { cutie: "h-10 w-10", icon: "h-4 w-4" },
  md: { cutie: "h-12 w-12", icon: "h-5 w-5" },
  lg: { cutie: "h-16 w-16", icon: "h-7 w-7" },
};
const TREPTE_COLOANE: Record<number, string> = {
  1: "pg-md:grid-cols-1", 2: "pg-md:grid-cols-2", 3: "pg-md:grid-cols-3", 4: "pg-md:grid-cols-4", 5: "pg-md:grid-cols-5", 6: "pg-md:grid-cols-6",
};
const HOVER_BENEFICIU: Record<string, string> = {
  none: "", lift: "transition-transform duration-300 hover:-translate-y-1", scale: "transition-transform duration-300 hover:scale-[1.03]",
  glow: "transition-shadow duration-300 hover:shadow-[0_18px_40px_-18px_var(--fx-c)]",
};

/*
  Beneficiile (25.09.2026): iconita din lista SAU imaginea proprie (din
  Biblioteca Media), trei asezari (iconita deasupra, in stanga, banda pe un
  rand), stiluri de iconita, carduri cu colturi/umbra, efecte la trecerea
  cursorului si aparitie pe rand. Un bloc vechi, fara campurile noi, arata ca
  inainte: iconita in cerc deasupra, carduri, pana la 4 coloane.
*/
export function TrustBlockView({ block, color, basePath }: { block: TrustBlock; color: string; basePath: string }) {
  const items = block.items ?? [];
  if (items.length === 0) return null;
  const layout = block.layout ?? "stack";
  const cols = block.columns ?? Math.min(items.length, 4);
  // Center the grid and let it size to its content so e.g. 3 items don't leave a gap.
  const maxW = cols <= 2 ? "max-w-2xl" : cols === 3 ? "max-w-4xl" : "max-w-6xl";
  const card = block.card !== false;
  const stanga = block.align === "left" || layout === "row" || layout === "strip";
  const itemAlign = layout === "stack" ? (stanga ? "items-start text-left" : "items-center text-center") : "items-start text-left";
  const accent = block.iconColor || color;
  const m = MARIME_ICON[block.iconSize ?? "md"] ?? MARIME_ICON.md;
  const stilIcon = block.iconStyle ?? "circle";
  const cutieIcon = stilIcon === "plain" ? "" : stilIcon === "square" ? `rounded-xl ${m.cutie}` : stilIcon === "outline" ? `rounded-full border-2 ${m.cutie}` : `rounded-full ${m.cutie}`;
  const fundalIcon: CSSProperties = stilIcon === "plain" ? { color: accent }
    : stilIcon === "outline" ? { color: accent, borderColor: cuTransparenta(accent, 0.35) }
    : { backgroundColor: block.iconBg ?? cuTransparenta(accent, 0.08), color: accent };
  const pePhone = block.mobileColumns === 1 ? "grid-cols-1" : "grid-cols-2";
  const banda = layout === "strip";
  const pas = block.itemAnim && block.itemAnim !== "none" ? block.itemAnim : null;

  return (
    <BlockShell style={block.style}>
      {(block.title || block.subtitle) && (
        <div className={`mb-8 ${stanga && layout === "stack" ? "text-left" : "text-center"}`}>
          {block.title && <h2 className="pg-titlu text-2xl pg-sm:text-3xl font-black tracking-tight text-foreground">{block.title}</h2>}
          {block.subtitle && <p className="mt-2 text-muted-foreground">{block.subtitle}</p>}
        </div>
      )}
      <div
        className={banda
          ? `mx-auto flex flex-col divide-y divide-border pg-md:flex-row pg-md:divide-x pg-md:divide-y-0 ${card ? "rounded-2xl border border-border bg-surface" : ""}`
          : `mx-auto grid ${pePhone} gap-4 ${maxW} ${TREPTE_COLOANE[cols] ?? "pg-md:grid-cols-3"}`}
        style={banda && card && block.cardBg ? { backgroundColor: block.cardBg } : undefined}
      >
        {items.map((b, i) => {
          const continut = (
            <>
              <div className={`flex shrink-0 items-center justify-center ${cutieIcon}`} style={fundalIcon}>
                {b.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={b.image} alt="" loading="lazy" className={`${stilIcon === "plain" ? m.cutie : "h-3/5 w-3/5"} object-contain`} />
                  : <PageIcon name={b.icon} className={m.icon} />}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-sm font-semibold text-foreground" style={block.titleColor ? { color: block.titleColor } : undefined}>{b.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground" style={block.descColor ? { color: block.descColor } : undefined}>{b.desc}</p>
              </div>
            </>
          );
          const clase = [
            "flex gap-3",
            layout === "stack" ? `flex-col ${itemAlign}`
              // Iconita in stanga, cate doua pe telefon: in ~170px nu incap iconita si textul unul langa altul.
              : layout === "row" && block.mobileColumns !== 1 ? "flex-col items-start text-left pg-sm:flex-row pg-sm:items-center"
              : "flex-row items-center text-left",
            banda ? "flex-1 px-5 py-4" : card ? `p-5 bg-surface border border-border ${RAZA[block.cardRadius ?? "md"] ?? "rounded-xl"} ${UMBRA[block.cardShadow ?? "none"] ?? ""}` : "",
            banda ? "" : HOVER_BENEFICIU[block.hover ?? "none"] ?? "",
          ].join(" ");
          const stil = { ...(card && !banda && block.cardBg ? { backgroundColor: block.cardBg } : {}), "--fx-c": cuTransparenta(accent, 0.45) } as CSSProperties;
          /* Aparitie pe rand: fiecare beneficiu cu 120 ms dupa cel dinainte (vezi `atributeAnimatie`). */
          const anim = pas ? atributeAnimatie({ anim: pas, animDelay: i * 120 }).attrs : {};
          return b.href
            ? <a key={i} href={resolveHref(b.href, basePath)} className={clase} style={stil} {...anim} suppressHydrationWarning>{continut}</a>
            : <div key={i} className={clase} style={stil} {...anim} suppressHydrationWarning>{continut}</div>;
        })}
      </div>
    </BlockShell>
  );
}

interface Social { facebook?: string; instagram?: string; tiktok?: string; youtube?: string; website?: string }

/* Numai adrese web: `business.social` se salveaza fara validare, iar aici ajunge direct in `href`. */
const webSigur = (u?: string) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

export function SocialBlockView({ block, social, color }: { block: SocialBlock; social: Social; color: string }) {
  const links: { href: string; label: string; icon: React.ElementType }[] = [];
  const add = (u: string | undefined, label: string, icon: React.ElementType) => { const h = webSigur(u); if (h) links.push({ href: h, label, icon }); };
  add(social.instagram, "Instagram", InstagramIcon);
  add(social.facebook, "Facebook", FacebookIcon);
  add(social.tiktok, "TikTok", TikTokIcon);
  add(social.youtube, "YouTube", YoutubeIcon);
  add(social.website, "Website", Globe);
  if (links.length === 0) return null;
  return (
    <BlockShell style={{ align: "center", ...block.style }}>
      {block.title && <p className="text-sm font-semibold text-foreground mb-4">{block.title}</p>}
      <div className="flex items-center justify-center gap-3">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.label}
            className="w-11 h-11 rounded-xl flex items-center justify-center border border-border hover:opacity-80 transition-opacity" style={{ color }}>
            <l.icon className="h-5 w-5" />
          </a>
        ))}
      </div>
    </BlockShell>
  );
}
