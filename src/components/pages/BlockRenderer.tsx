import type { Block } from "@/lib/pages/blocks.types";
import {
  HeroBlockView, HeadingBlockView, TextBlockView, ImageBlockView, GalleryBlockView,
  ButtonBlockView, ColumnsBlockView, SpacerBlockView, DividerBlockView, VideoBlockView,
  MapBlockView, TrustBlockView, SocialBlockView,
} from "./blocks/StaticBlocks";
import { FaqBlockView } from "./blocks/FaqBlock";
import { ProductsBlockView, pickProducts, type PageProduct } from "./blocks/ProductsBlock";
import { HtmlBlockView } from "./blocks/HtmlBlockView";
import { ContactFormBlockView } from "./blocks/ContactFormBlock";
import type { PublicForm } from "@/lib/pages/forms.types";

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
    case "hero":     return <HeroBlockView block={block} color={ctx.color} basePath={ctx.basePath} />;
    case "heading":  return <HeadingBlockView block={block} />;
    case "text":     return <TextBlockView block={block} />;
    case "image":    return <ImageBlockView block={block} basePath={ctx.basePath} />;
    case "gallery":  return <GalleryBlockView block={block} />;
    case "button":   return <ButtonBlockView block={block} color={ctx.color} basePath={ctx.basePath} />;
    case "columns":  return <ColumnsBlockView block={block} color={ctx.color} basePath={ctx.basePath} />;
    case "spacer":   return <SpacerBlockView block={block} />;
    case "divider":  return <DividerBlockView block={block} />;
    case "video":    return <VideoBlockView block={block} />;
    case "map":      return <MapBlockView block={block} />;
    case "faq":      return <FaqBlockView block={block} />;
    case "trust":    return <TrustBlockView block={block} color={ctx.color} />;
    case "social":   return <SocialBlockView block={block} social={ctx.social} color={ctx.color} />;
    case "products": return <ProductsBlockView block={block} products={ctx.productsByBlock?.[block.id] ?? pickProducts(ctx.products, block)} color={ctx.color} basePath={ctx.basePath} storeSlug={ctx.storeSlug} />;
    case "contact":  return <ContactFormBlockView block={block} form={block.formId ? ctx.forms.find((f) => f.id === block.formId) : undefined} businessId={ctx.businessId} pageId={ctx.pageId} color={ctx.color} disabled={ctx.preview} />;
    case "html":     return <HtmlBlockView block={block} />;
    default:         return null;
  }
}
