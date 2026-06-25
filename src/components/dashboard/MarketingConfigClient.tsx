"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";

export function MarketingConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: MarketingConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [fbPixelId, setFbPixelId] = useState(initialConfig?.facebook_pixel_id ?? "");
  const [ttPixelId, setTtPixelId] = useState(initialConfig?.tiktok_pixel_id ?? "");
  const [googleTagId, setGoogleTagId] = useState(initialConfig?.google_tag_id ?? "");

  const fbActive = !!initialConfig?.facebook_pixel_id?.trim();
  const ttActive = !!initialConfig?.tiktok_pixel_id?.trim();
  const googleActive = !!initialConfig?.google_tag_id?.trim();

  async function handleSave() {
    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      facebook_pixel_id: fbPixelId.trim() || undefined,
      tiktok_pixel_id: ttPixelId.trim() || undefined,
      google_tag_id: googleTagId.trim() || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Configuratie marketing salvata");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Facebook Pixel */}
      <Panel className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/integrations/facebook-pixel.svg" alt="Facebook Pixel" className="h-8 w-8 flex-shrink-0 object-contain" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Facebook Pixel</h3>
            {fbActive ? (
              <Badge variant="success" className="mt-0.5">Activ · ID {initialConfig?.facebook_pixel_id}</Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">Neconectat</span>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Pixel ID</label>
          <Input
            type="text"
            value={fbPixelId}
            onChange={e => setFbPixelId(e.target.value)}
            placeholder="ex: 1234567890123456"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gaseste Pixel ID-ul in Facebook Business Manager &gt; Events Manager.
          </p>
        </div>

        <a
          href="https://business.facebook.com/events_manager"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide Events Manager
        </a>
      </Panel>

      {/* TikTok Pixel */}
      <Panel className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/integrations/tiktok-pixel.svg" alt="TikTok Pixel" className="h-8 w-8 flex-shrink-0 object-contain" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">TikTok Pixel</h3>
            {ttActive ? (
              <Badge variant="success" className="mt-0.5">Activ · ID {initialConfig?.tiktok_pixel_id}</Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">Neconectat</span>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Pixel ID</label>
          <Input
            type="text"
            value={ttPixelId}
            onChange={e => setTtPixelId(e.target.value)}
            placeholder="ex: C4ABCDEF1234567890"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gaseste Pixel ID-ul in TikTok Ads Manager &gt; Assets &gt; Events.
          </p>
        </div>

        <a
          href="https://ads.tiktok.com/i18n/events_manager"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide TikTok Events Manager
        </a>
      </Panel>

      {/* Google Ads / GA4 */}
      <Panel className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/integrations/google-ads.svg" alt="Google Ads" className="h-8 w-8 flex-shrink-0 object-contain" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Google Ads / GA4</h3>
            {googleActive ? (
              <Badge variant="success" className="mt-0.5">Activ · {initialConfig?.google_tag_id}</Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">Neconectat</span>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tag ID</label>
          <Input
            type="text"
            value={googleTagId}
            onChange={e => setGoogleTagId(e.target.value)}
            placeholder="ex: AW-123456789 sau G-XXXXXXXXXX"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Google Ads: gaseste Tag ID-ul in Google Ads &gt; Tools &gt; Google Tag. GA4: in Analytics &gt; Admin &gt; Data Streams.
          </p>
        </div>

        <a
          href="https://ads.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Deschide Google Ads
        </a>
      </Panel>

      {/* Save button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Se salveaza..." : "Salveaza configuratia"}
        </Button>
      </div>

      {/* Events tracked */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Evenimente urmarite automat</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><span className="font-mono text-foreground">PageView</span> — la fiecare vizita pe pagina magazinului</li>
          <li><span className="font-mono text-foreground">AddToCart</span> — cand un produs este adaugat in cos</li>
          <li><span className="font-mono text-foreground">InitiateCheckout</span> — la deschiderea formularului de comanda</li>
          <li><span className="font-mono text-foreground">Purchase / CompletePayment / purchase</span> — la confirmarea comenzii (cu valoare + RON)</li>
        </ul>
      </div>
    </div>
  );
}
