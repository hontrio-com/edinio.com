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
    .select("id")
    .eq("slug", slug)
    .single();

  let fbPixelId: string | null = null;
  let ttPixelId: string | null = null;
  let googleTagId: string | null = null;

  if (business) {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("marketing_config")
      .eq("business_id", business.id)
      .single();

    const mc = settings?.marketing_config as MarketingConfig | null;
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
