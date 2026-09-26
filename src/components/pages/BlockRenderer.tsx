import type { Block } from "@/lib/pages/blocks.types";
import {
  HeroBlockView, HeadingBlockView, TextBlockView, ImageBlockView, GalleryBlockView,
  ButtonBlockView, ColumnsBlockView, SpacerBlockView, DividerBlockView, VideoBlockView,
  TrustBlockView, SocialBlockView,
} from "./blocks/StaticBlocks";
import { MapBlockView } from "./blocks/MapBlock";
import { FaqBlockView } from "./blocks/FaqBlock";
import { ProductsBlockView, pickProducts, type PageProduct } from "./blocks/ProductsBlock";
import { HtmlBlockView } from "./blocks/HtmlBlockView";
import { ContactFormBlockView } from "./blocks/ContactFormBlock";
import type { PublicForm } from "@/lib/pages/forms.types";
import { BundlesBlockView } from "./blocks/BundlesBlock";
import { NewsletterBlockView } from "./blocks/NewsletterBlock";
import { CouriersBlockView, PaymentsBlockView } from "./blocks/IntegrariBlocks";
import type { PachetPagina } from "@/lib/pages/resolve-bundles";
import type { MetodaAfisata } from "@/lib/pages/integrari-pagini";

interface Social { facebook?: string; instagram?: string; tiktok?: string; youtube?: string; website?: string }

export interface BlockRendererCtx {
  color: string;
  basePath: string;
  storeSlug: string;
  social: Social;
  products: PageProduct[];
  /** Products resolved per block server-side (public route, scale-safe). */
  productsByBlock?: Record<string, PageProduct[]>;
  forms: PublicForm[];
  businessId: string;
  pageId?: string;
  /** Editor preview: disable live form submission. */
  preview?: boolean;
  /**
   * Blocul al carui titlu devine H1 (vezi `titlulPrincipal`). Il calculeaza
   * pagina publica si editorul, pe TOATE blocurile paginii: un bloc randat
   * singur n-ar avea de unde sti daca mai sus exista deja un H1.
   */
  h1Id?: string | null;
  /** Pachetele fiecarui bloc de pachete (pagina publica) sau lista pentru previzualizare (editor). */
  bundlesByBlock?: Record<string, PachetPagina[]>;
  bundles?: PachetPagina[];
  /** Metodele de plata si curierii activi, pentru blocurile de integrari. */
  plati?: MetodaAfisata[];
  curieri?: MetodaAfisata[];
}

/**
 * Pure presentational dispatcher. Used by BOTH the public page route (server,
 * blocks pre-sanitized via prepareBlocksForPublic) and the dashboard editor
 * preview (client, owner's own content). No server-only imports live here.
 */
export function BlockRenderer({ blocks, ctx }: { blocks: Block[]; ctx: BlockRendererCtx }) {
  return (
    <>
      {blocks.map((block) => (
        <BlockOne key={block.id} block={block} ctx={ctx} />
      ))}
    </>
  );
}

function BlockOne({ block, ctx }: { block: Block; ctx: BlockRendererCtx }) {
  switch (block.type) {
    case "hero":     return <HeroBlockView block={block} color={ctx.color} basePath={ctx.basePath} h1={ctx.h1Id === block.id} />;
    case "heading":  return <HeadingBlockView block={block} h1={ctx.h1Id === block.id} />;
    case "text":     return <TextBlockView block={block} />;
    case "image":    return <ImageBlockView block={block} basePath={ctx.basePath} />;
    case "gallery":  return <GalleryBlockView block={block} />;
    case "button":   return <ButtonBlockView block={block} color={ctx.color} basePath={ctx.basePath} />;
    case "columns":  return <ColumnsBlockView block={block} color={ctx.color} basePath={ctx.basePath} renderBlocks={(bs) => <BlockRenderer blocks={bs} ctx={ctx} />} />;
    case "spacer":   return <SpacerBlockView block={block} />;
    case "divider":  return <DividerBlockView block={block} />;
    case "video":    return <VideoBlockView block={block} />;
    case "map":      return <MapBlockView block={block} color={ctx.color} />;
    case "faq":      return <FaqBlockView block={block} />;
    case "trust":    return <TrustBlockView block={block} color={ctx.color} basePath={ctx.basePath} />;
    case "social":   return <SocialBlockView block={block} social={ctx.social} color={ctx.color} />;
    case "products": return <ProductsBlockView block={block} products={ctx.productsByBlock?.[block.id] ?? pickProducts(ctx.products, block)} color={ctx.color} basePath={ctx.basePath} storeSlug={ctx.storeSlug} />;
    case "contact":  return <ContactFormBlockView block={block} form={block.formId ? ctx.forms.find((f) => f.id === block.formId) : undefined} businessId={ctx.businessId} pageId={ctx.pageId} color={ctx.color} disabled={ctx.preview} basePath={ctx.basePath} />;
    case "html":     return <HtmlBlockView block={block} preview={ctx.preview} />;
    case "bundles": {
      const lista = ctx.bundlesByBlock?.[block.id]
        ?? (block.mode === "selected" && block.productIds?.length
          ? block.productIds.map((id) => ctx.bundles?.find((b) => b.id === id)).filter((b): b is PachetPagina => !!b)
          : ctx.bundles ?? []).slice(0, block.limit ?? 6);
      return <BundlesBlockView block={block} pachete={lista} color={ctx.color} basePath={ctx.basePath} storeSlug={ctx.storeSlug} />;
    }
    case "newsletter": return <NewsletterBlockView block={block} color={ctx.color} businessId={ctx.businessId} pageId={ctx.pageId} disabled={ctx.preview} />;
    case "payments": return <PaymentsBlockView block={block} metode={ctx.plati ?? []} />;
    case "couriers": return <CouriersBlockView block={block} curieri={ctx.curieri ?? []} />;
    default:         return null;
  }
}
