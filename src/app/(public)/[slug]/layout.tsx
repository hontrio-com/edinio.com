import { createClient } from "@/lib/supabase/server";
import { FacebookPixel } from "@/components/public/FacebookPixel";
import { TikTokPixel } from "@/components/public/TikTokPixel";
import { GoogleTag } from "@/components/public/GoogleTag";
import type { MarketingConfig } from "@/lib/marketing";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, store_settings(marketing_config)")
    .eq("slug", slug)
    .single();

  let fbPixelId: string | null = null;
  let ttPixelId: string | null = null;
  let googleTagId: string | null = null;

  if (business) {
    const rawSettings = (business as unknown as { store_settings: { marketing_config: unknown } | { marketing_config: unknown }[] | null }).store_settings;
    const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
    const mc = (settings?.marketing_config ?? null) as MarketingConfig | null;
    fbPixelId = mc?.facebook_pixel_id?.trim() || null;
    ttPixelId = mc?.tiktok_pixel_id?.trim() || null;
    googleTagId = mc?.google_tag_id?.trim() || null;
  }

  return (
    <>
      {fbPixelId && <FacebookPixel pixelId={fbPixelId} />}
      {ttPixelId && <TikTokPixel pixelId={ttPixelId} />}
      {googleTagId && <GoogleTag tagId={googleTagId} />}
      {children}
    </>
  );
}
