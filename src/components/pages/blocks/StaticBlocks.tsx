import { Globe } from "lucide-react";
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon } from "../../ministore/social-icons";
import { PageIcon } from "../icon-registry";
import { BlockShell } from "../BlockShell";
import { resolveHref, isExternalHref } from "@/lib/pages/href";
import { videoEmbedUrl, mapEmbedUrl } from "@/lib/pages/embeds";
import type { CSSProperties } from "react";
import type {
  HeroBlock, HeadingBlock, TextBlock, ImageBlock, GalleryBlock, GalleryItem, ButtonBlock,
  ColumnsBlock, SpacerBlock, DividerBlock, VideoBlock, MapBlock, TrustBlock, SocialBlock,
} from "@/lib/pages/blocks.types";

/* Pure presentational components. HTML passed to dangerouslySetInnerHTML is
   sanitized upstream by the public route (prepare-blocks); in the editor preview
   it is the owner's own content. Button effects use CSS classes (see globals.css)
   so these stay server-renderable. */

const BTN_SIZE: Record<string, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-7 py-3.5 text-sm",
  lg: "px-9 py-4 text-base",
};
const BTN_ROUNDED: Record<string, string> = {
  sm: "rounded-md", md: "rounded-lg", lg: "rounded-xl", full: "rounded-full",
};
const FX: Record<string, string> = {
  none: "", pulse: "fx-pulse", shake: "fx-shake", bounce: "fx-bounce", glow: "fx-glow", heartbeat: "fx-heartbeat",
};

function Btn({ href, basePath, label, color, variant = "solid", size = "md", rounded = "lg", effect = "none", textColor, fullWidth, newTab }: {
  href?: string; basePath: string; label: string; color: string;
  variant?: "solid" | "outline" | "soft" | "ghost"; size?: "sm" | "md" | "lg"; rounded?: "sm" | "md" | "lg" | "full";
  effect?: string; textColor?: string | null; fullWidth?: boolean; newTab?: boolean;
}) {
  const resolved = resolveHref(href, basePath);
  const ext = newTab || isExternalHref(href);
  let style: CSSProperties = {};
  if (variant === "solid") style = { backgroundColor: color, color: textColor || "#fff", boxShadow: `0 4px 16px ${color}44` };
  else if (variant === "outline") style = { border: `2px solid ${color}`, color: textColor || color, background: "transparent" };
  else if (variant === "soft") style = { backgroundColor: `${color}1f`, color: textColor || color };
  else style = { color: textColor || color, background: "transparent" }; // ghost
  return (
    <a href={resolved} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-all hover:opacity-90 active:scale-[0.98] ${BTN_SIZE[size]} ${BTN_ROUNDED[rounded]} ${FX[effect] ?? ""} ${fullWidth ? "w-full" : ""}`}
      style={style}>
      {label}
    </a>
  );
}

export function HeroBlockView({ block, color, basePath }: { block: HeroBlock; color: string; basePath: string }) {
  const heightCls = block.height === "lg" ? "py-28 md:py-40" : block.height === "sm" ? "py-14 md:py-20" : block.height === "custom" ? "" : "py-20 md:py-28";
  const heightStyle: CSSProperties | undefined = block.height === "custom" ? { minHeight: Math.max(80, block.heightCustom ?? 360), display: "flex", flexDirection: "column", justifyContent: "center" } : undefined;
  const align = block.align === "left" ? "items-start text-left" : "items-center text-center";
  const textColor = block.textColor ?? (block.bgImage ? "#ffffff" : "#111111");
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: block.bgColor ?? (block.bgImage ? "#111" : "var(--color-surface)") }}>
      {block.bgImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {block.bgImage && block.overlay !== false && <div className="absolute inset-0 bg-black/45" />}
      <div className={`relative z-10 max-w-4xl mx-auto px-4 flex flex-col ${align} ${heightCls}`} style={heightStyle}>
        {block.title && (
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight" style={{ color: textColor }}>{block.title}</h2>
        )}
        {block.subtitle && (
          <p className="mt-4 text-base sm:text-lg max-w-2xl leading-relaxed" style={{ color: textColor, opacity: 0.85 }}>{block.subtitle}</p>
        )}
        {block.buttonLabel && (
          <div className="mt-8">
            <Btn href={block.buttonHref} basePath={basePath} label={block.buttonLabel} color={block.buttonColor || color} textColor={block.buttonTextColor} />
          </div>
        )}
      </div>
    </section>
  );
}

const HEADING_SIZE: Record<string, string> = {
  sm: "text-lg sm:text-xl",
  md: "text-xl sm:text-2xl",
  lg: "text-2xl sm:text-3xl md:text-4xl",
  xl: "text-3xl sm:text-4xl md:text-5xl",
  "2xl": "text-4xl sm:text-5xl md:text-6xl",
  "3xl": "text-5xl sm:text-6xl md:text-7xl",
};

export function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const Tag = (`h${block.level ?? 2}`) as "h1" | "h2" | "h3";
  const custom = block.size === "custom";
  const sizeCls = custom ? "" : (HEADING_SIZE[block.size ?? "lg"] ?? HEADING_SIZE.lg);
  const style: CSSProperties = {};
  if (block.color) style.color = block.color;
  if (custom) { style.fontSize = Math.max(12, block.sizeCustom ?? 32); style.lineHeight = 1.1; }
  return (
    <BlockShell style={block.style}>
      <Tag className={`font-black tracking-tight ${block.color ? "" : "text-foreground"} ${sizeCls}`} style={Object.keys(style).length ? style : undefined}>{block.text}</Tag>
    </BlockShell>
  );
}

export function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      <div className="policy-content leading-relaxed text-base text-left"
        style={block.style?.textColor ? { color: block.style.textColor } : undefined}
        dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
    </BlockShell>
  );
}

export function ImageBlockView({ block, basePath }: { block: ImageBlock; basePath: string }) {
  if (!block.src) return null;
  const justify = block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center";
  const w = Math.min(100, Math.max(10, block.widthPct ?? 100));
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={block.src} alt={block.alt ?? ""} className={`h-auto ${block.rounded !== false ? "rounded-2xl" : ""}`} style={{ width: `${w}%` }} />
  );
  return (
    <BlockShell style={block.style}>
      <figure className={`flex flex-col ${block.align === "left" ? "items-start" : block.align === "right" ? "items-end" : "items-center"}`}>
        <div className={`flex w-full ${justify}`}>
          {block.href ? <a href={resolveHref(block.href, basePath)} style={{ width: `${w}%` }}>{img}</a> : img}
        </div>
        {block.caption && <figcaption className="mt-2 text-sm text-muted-foreground text-center">{block.caption}</figcaption>}
      </figure>
    </BlockShell>
  );
}

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  const items: GalleryItem[] = block.items ?? (block.images ?? []).filter(Boolean).map((src) => ({ src }));
  if (items.length === 0) return null;
  const cols = block.columns === 2 ? "grid-cols-2" : block.columns === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3";
  const gap = block.gap === "sm" ? "gap-2" : block.gap === "lg" ? "gap-5" : "gap-3";
  const mode = block.captionMode ?? "none";
  return (
    <BlockShell style={block.style}>
      <div className={`grid ${cols} ${gap}`}>
        {items.map((it, i) => (
          <figure key={i} className="text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.src} alt={it.title ?? ""} className="w-full aspect-square object-cover rounded-xl border border-border" />
            {mode !== "none" && (it.title || it.desc) && (
              <figcaption className="mt-1.5">
                {(mode === "title" || mode === "both") && it.title && <p className="text-sm font-semibold text-foreground">{it.title}</p>}
                {(mode === "desc" || mode === "both") && it.desc && <p className="text-xs text-muted-foreground">{it.desc}</p>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </BlockShell>
  );
}

export function ButtonBlockView({ block, color, basePath }: { block: ButtonBlock; color: string; basePath: string }) {
  if (!block.label) return null;
  return (
    <BlockShell style={{ align: "center", ...block.style }}>
      <Btn href={block.href} basePath={basePath} label={block.label} color={block.color || color}
        variant={block.variant} size={block.size} rounded={block.rounded} effect={block.effect}
        textColor={block.textColor} fullWidth={block.fullWidth} newTab={block.newTab} />
    </BlockShell>
  );
}

const TPL_FR: Record<string, string> = {
  "1-1": "1fr 1fr", "1-2": "1fr 2fr", "2-1": "2fr 1fr",
  "1-1-1": "1fr 1fr 1fr", "2-1-1": "2fr 1fr 1fr", "1-2-1": "1fr 2fr 1fr", "1-1-2": "1fr 1fr 2fr",
};

export function ColumnsBlockView({ block, color, basePath }: { block: ColumnsBlock; color: string; basePath: string }) {
  const items = block.items ?? [];
  const count = block.count ?? 2;
  const fr = TPL_FR[block.template ?? ""] ?? (count === 3 ? "1fr 1fr 1fr" : "1fr 1fr");
  const gap = block.gap === "sm" ? "gap-3" : block.gap === "lg" ? "gap-8" : "gap-6";
  const valign = block.verticalAlign === "center" ? "items-center" : "items-start";
  return (
    <BlockShell style={block.style}>
      <div className={`grid grid-cols-1 ${gap} ${valign} md:[grid-template-columns:var(--tpl)]`} style={{ "--tpl": fr } as CSSProperties}>
        {items.slice(0, count).map((it, i) => (
          <div key={i} className={`flex flex-col gap-3 text-left ${block.bordered ? "border border-border rounded-2xl p-5" : ""}`}>
            {it.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image} alt={it.heading ?? ""} className="w-full h-auto rounded-xl" />
            )}
            {it.heading && <h3 className="text-lg font-bold text-foreground">{it.heading}</h3>}
            {it.html && <div className="policy-content text-foreground/75 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: it.html }} />}
            {it.buttonLabel && <div className="mt-1"><Btn href={it.buttonHref} basePath={basePath} label={it.buttonLabel} color={color} variant="outline" /></div>}
          </div>
        ))}
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
  // Uploaded (self-hosted) video takes priority over an embed URL.
  if (block.src) {
    return (
      <BlockShell style={{ width: "container", ...block.style }}>
        <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-black" style={{ aspectRatio: "16/9" }}>
          <video
            src={block.src}
            poster={block.poster ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      </BlockShell>
    );
  }
  const embed = videoEmbedUrl(block.url);
  if (!embed) return null;
  return (
    <BlockShell style={{ width: "container", ...block.style }}>
      <div className="relative w-full overflow-hidden rounded-2xl border border-border" style={{ aspectRatio: "16/9" }}>
        <iframe src={embed} title="Video" className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
      </div>
    </BlockShell>
  );
}

export function MapBlockView({ block }: { block: MapBlock }) {
  const embed = mapEmbedUrl(block.query);
  if (!embed) return null;
  return (
    <BlockShell style={{ width: "container", ...block.style }}>
      <iframe src={embed} title="Harta" className="w-full rounded-2xl border border-border" style={{ height: block.height ?? 320 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </BlockShell>
  );
}

export function TrustBlockView({ block, color }: { block: TrustBlock; color: string }) {
  const items = block.items ?? [];
  if (items.length === 0) return null;
  const cols = block.columns ?? Math.min(items.length, 4);
  // Center the grid and let it size to its content so e.g. 3 items don't leave a gap.
  const maxW = cols === 2 ? "max-w-2xl" : cols === 3 ? "max-w-4xl" : "max-w-6xl";
  const card = block.card !== false;
  const itemAlign = block.align === "left" ? "items-start text-left" : "items-center text-center";
  return (
    <BlockShell style={block.style}>
      <div className={`grid grid-cols-2 gap-4 mx-auto ${maxW} md:[grid-template-columns:var(--tc)]`} style={{ "--tc": `repeat(${cols}, minmax(0, 1fr))` } as CSSProperties}>
        {items.map((b, i) => (
          <div key={i} className={`flex flex-col gap-3 ${itemAlign} ${card ? "p-5 bg-surface rounded-xl border border-border" : ""}`}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15`, color }}>
              <PageIcon name={b.icon} className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm mb-1">{b.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </BlockShell>
  );
}

interface Social { facebook?: string; instagram?: string; tiktok?: string; youtube?: string; website?: string }

export function SocialBlockView({ block, social, color }: { block: SocialBlock; social: Social; color: string }) {
  const links: { href: string; label: string; icon: React.ElementType }[] = [];
  if (social.instagram) links.push({ href: social.instagram, label: "Instagram", icon: InstagramIcon });
  if (social.facebook) links.push({ href: social.facebook, label: "Facebook", icon: FacebookIcon });
  if (social.tiktok) links.push({ href: social.tiktok, label: "TikTok", icon: TikTokIcon });
  if (social.youtube) links.push({ href: social.youtube, label: "YouTube", icon: YoutubeIcon });
  if (social.website) links.push({ href: social.website, label: "Website", icon: Globe });
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
