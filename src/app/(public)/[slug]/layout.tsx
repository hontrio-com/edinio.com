import { createClient } from "@/lib/supabase/server";
import { FacebookPixel } from "@/components/public/FacebookPixel";
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

  let pixelId: string | null = null;

  if (business) {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("marketing_config")
      .eq("business_id", business.id)
      .single();

    const mc = settings?.marketing_config as MarketingConfig | null;
    pixelId = mc?.facebook_pixel_id?.trim() || null;
  }

  return (
    <>
      {pixelId && <FacebookPixel pixelId={pixelId} />}
      {children}
    </>
  );
}
