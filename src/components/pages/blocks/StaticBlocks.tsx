import { Truck, ShieldCheck, RotateCcw, Phone, Globe } from "lucide-react";
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon } from "../../ministore/social-icons";
import { BlockShell } from "../BlockShell";
import { resolveHref, isExternalHref } from "@/lib/pages/href";
import { videoEmbedUrl, mapEmbedUrl } from "@/lib/pages/embeds";
import type {
  HeroBlock, HeadingBlock, TextBlock, ImageBlock, GalleryBlock, ButtonBlock,
  ColumnsBlock, SpacerBlock, DividerBlock, VideoBlock, MapBlock, TrustBlock, SocialBlock,
} from "@/lib/pages/blocks.types";

/* These are pure presentational components. HTML passed to dangerouslySetInnerHTML
   is sanitized upstream by the public route (prepare-blocks); in the editor preview
   it is the owner's own content. */

const TRUST_ICONS: Record<string, React.ElementType> = {
  truck: Truck, shield: ShieldCheck, "rotate-ccw": RotateCcw, phone: Phone,
};

function ButtonLink({ href, basePath, label, color, variant }: {
  href?: string; basePath: string; label: string; color: string; variant?: "solid" | "outline";
}) {
  const resolved = resolveHref(href, basePath);
  const ext = isExternalHref(href);
  const style = variant === "outline"
    ? { borderColor: color, color }
    : { backgroundColor: color, color: "#fff", boxShadow: `0 4px 16px ${color}44` };
  return (
    <a
      href={resolved}
      {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold rounded-xl transition-all hover:opacity-90 active:scale-[0.98] ${variant === "outline" ? "border-2 bg-transparent" : ""}`}
      style={style}
    >
      {label}
    </a>
  );
}

export function HeroBlockView({ block, color, basePath }: { block: HeroBlock; color: string; basePath: string }) {
  const height = block.height === "lg" ? "py-28 md:py-40" : block.height === "sm" ? "py-14 md:py-20" : "py-20 md:py-28";
  const align = block.align === "left" ? "items-start text-left" : "items-center text-center";
  const textColor = block.textColor ?? (block.bgImage ? "#ffffff" : "#111111");
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: block.bgColor ?? (block.bgImage ? "#111" : "var(--color-surface)") }}>
      {block.bgImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {block.bgImage && block.overlay !== false && <div className="absolute inset-0 bg-black/45" />}
      <div className={`relative z-10 max-w-4xl mx-auto px-4 flex flex-col ${align} ${height}`}>
        {block.title && (
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight" style={{ color: textColor }}>
            {block.title}
          </h2>
        )}
        {block.subtitle && (
          <p className="mt-4 text-base sm:text-lg max-w-2xl leading-relaxed" style={{ color: textColor, opacity: 0.85 }}>
            {block.subtitle}
          </p>
        )}
        {block.buttonLabel && (
          <div className="mt-8">
            <ButtonLink href={block.buttonHref} basePath={basePath} label={block.buttonLabel} color={color} />
          </div>
        )}
      </div>
    </section>
  );
}

export function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const Tag = (`h${block.level ?? 2}`) as "h1" | "h2" | "h3";
  const size = block.level === 1 ? "text-3xl sm:text-4xl md:text-5xl" : block.level === 3 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl md:text-4xl";
  return (
    <BlockShell style={block.style}>
      <Tag className={`font-black tracking-tight text-foreground ${size}`}>{block.text}</Tag>
    </BlockShell>
  );
}

export function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      <div className="policy-content text-foreground/80 leading-relaxed text-base text-left"
        dangerouslySetInnerHTML={{ __html: block.html ?? "" }} />
    </BlockShell>
  );
}

export function ImageBlockView({ block, basePath }: { block: ImageBlock; basePath: string }) {
  if (!block.src) return null;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={block.src} alt={block.alt ?? ""} className={`w-full h-auto ${block.rounded !== false ? "rounded-2xl" : ""}`} />
  );
  return (
    <BlockShell style={block.style}>
      <figure className="mx-auto">
        {block.href ? <a href={resolveHref(block.href, basePath)}>{img}</a> : img}
        {block.caption && <figcaption className="mt-2 text-sm text-muted-foreground text-center">{block.caption}</figcaption>}
      </figure>
    </BlockShell>
  );
}

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  const images = (block.images ?? []).filter(Boolean);
  if (images.length === 0) return null;
  const cols = block.columns === 2 ? "grid-cols-2" : block.columns === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3";
  return (
    <BlockShell style={block.style}>
      <div className={`grid ${cols} gap-3`}>
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded-xl border border-border" />
        ))}
      </div>
    </BlockShell>
  );
}

export function ButtonBlockView({ block, color, basePath }: { block: ButtonBlock; color: string; basePath: string }) {
  if (!block.label) return null;
  return (
    <BlockShell style={{ align: "center", ...block.style }}>
      <ButtonLink href={block.href} basePath={basePath} label={block.label} color={color} variant={block.variant} />
    </BlockShell>
  );
}

export function ColumnsBlockView({ block, color, basePath }: { block: ColumnsBlock; color: string; basePath: string }) {
  const items = block.items ?? [];
  const cols = block.count === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <BlockShell style={block.style}>
      <div className={`grid grid-cols-1 ${cols} gap-6 text-left`}>
        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-3">
            {it.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image} alt={it.heading ?? ""} className="w-full h-auto rounded-xl" />
            )}
            {it.heading && <h3 className="text-lg font-bold text-foreground">{it.heading}</h3>}
            {it.html && <div className="policy-content text-foreground/75 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: it.html }} />}
            {it.buttonLabel && <div className="mt-1"><ButtonLink href={it.buttonHref} basePath={basePath} label={it.buttonLabel} color={color} variant="outline" /></div>}
          </div>
        ))}
      </div>
    </BlockShell>
  );
}

export function SpacerBlockView({ block }: { block: SpacerBlock }) {
  const h = block.size === "sm" ? 24 : block.size === "lg" ? 64 : block.size === "xl" ? 96 : 40;
  return <div style={{ height: h }} aria-hidden />;
}

export function DividerBlockView({ block }: { block: DividerBlock }) {
  return (
    <BlockShell style={{ padding: "sm", ...block.style }}>
      <hr style={{ borderTopStyle: block.lineStyle ?? "solid", borderColor: block.color ?? "var(--color-border)" }} />
    </BlockShell>
  );
}

export function VideoBlockView({ block }: { block: VideoBlock }) {
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
  return (
    <BlockShell style={block.style}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((b, i) => {
          const Icon = TRUST_ICONS[b.icon] ?? ShieldCheck;
          return (
            <div key={i} className="flex flex-col items-center text-center gap-3 p-5 bg-surface rounded-xl border border-border">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm mb-1">{b.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            </div>
          );
        })}
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
            className="w-11 h-11 rounded-xl flex items-center justify-center border border-border hover:opacity-80 transition-opacity"
            style={{ color }}>
            <l.icon className="h-5 w-5" />
          </a>
        ))}
      </div>
    </BlockShell>
  );
}
