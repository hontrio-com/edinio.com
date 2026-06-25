"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle, Info } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

export function GoogleAdsConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: MarketingConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [tagId, setTagId] = useState(initialConfig?.google_tag_id ?? "");
  const [conversionLabel, setConversionLabel] = useState(initialConfig?.google_ads_conversion_label ?? "");

  const isActive = !!initialConfig?.google_tag_id?.trim();
  const isGoogleAds = tagId.trim().startsWith("AW-");

  async function handleSave() {
    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      google_tag_id: tagId.trim() || undefined,
      google_ads_conversion_label: conversionLabel.trim() || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(tagId.trim() ? "Google Tag salvat" : "Google Tag eliminat");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout variant="success" icon={CheckCircle} title="Google Tag activ">
          <span className="font-mono">{initialConfig?.google_tag_id}</span>
        </Callout>
      )}

      <Panel className="space-y-4 p-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tag ID *</label>
          <Input
            type="text"
            value={tagId}
            onChange={e => setTagId(e.target.value)}
            placeholder="ex: AW-123456789 sau G-XXXXXXXXXX"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Google Ads: <span className="font-mono">AW-XXXXXXXXX</span> &nbsp;|&nbsp; GA4: <span className="font-mono">G-XXXXXXXXXX</span>
          </p>
        </div>

        {/* Conversion Label — relevant only for Google Ads (AW-) */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Conversion Label (Purchase)
            {isGoogleAds && <span className="ml-1 font-semibold text-warning">recomandat</span>}
          </label>
          <Input
            type="text"
            value={conversionLabel}
            onChange={e => setConversionLabel(e.target.value)}
            placeholder="ex: abc123XYZ_def456"
            className="font-mono"
          />
          <div className="mt-1.5 flex items-start gap-1.5">
            <Info className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              Necesar pentru a raporta comenzile ca &quot;conversii&quot; in Google Ads. Gaseste-l in Google Ads &gt; Goals &gt; Conversions &gt; actiunea de conversie Purchase &gt; Tag setup.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <a
            href="https://ads.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Deschide Google Ads
          </a>
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza"}
          </Button>
        </div>
      </Panel>

      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Evenimente urmarite automat</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><span className="font-mono text-foreground">page_view</span> — la fiecare vizita (configurat automat)</li>
          <li><span className="font-mono text-foreground">add_to_cart</span> — cand un produs este adaugat in cos</li>
          <li><span className="font-mono text-foreground">begin_checkout</span> — la deschiderea formularului de comanda</li>
          <li><span className="font-mono text-foreground">purchase</span> — la confirmarea comenzii (valoare + RON)</li>
          <li><span className="font-mono text-foreground">conversion</span> — eveniment conversie Google Ads (necesita Conversion Label)</li>
        </ul>
      </div>
    </div>
  );
}
