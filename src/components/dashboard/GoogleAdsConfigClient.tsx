"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle, Info } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing";

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
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Google Tag activ</p>
            <p className="text-xs text-green-700 font-mono">{initialConfig?.google_tag_id}</p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tag ID *</label>
          <input
            type="text"
            value={tagId}
            onChange={e => setTagId(e.target.value)}
            placeholder="ex: AW-123456789 sau G-XXXXXXXXXX"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Google Ads: <span className="font-mono">AW-XXXXXXXXX</span> &nbsp;|&nbsp; GA4: <span className="font-mono">G-XXXXXXXXXX</span>
          </p>
        </div>

        {/* Conversion Label — relevant only for Google Ads (AW-) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Conversion Label (Purchase)
            {isGoogleAds && <span className="ml-1 text-amber-600 font-semibold">recomandat</span>}
          </label>
          <input
            type="text"
            value={conversionLabel}
            onChange={e => setConversionLabel(e.target.value)}
            placeholder="ex: abc123XYZ_def456"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
          />
          <div className="flex items-start gap-1.5 mt-1.5">
            <Info className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza"}
          </button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-semibold text-foreground mb-2">Evenimente urmarite automat</p>
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
