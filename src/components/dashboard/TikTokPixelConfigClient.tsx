"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing";

export function TikTokPixelConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: MarketingConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState(initialConfig?.tiktok_pixel_id ?? "");

  const isActive = !!initialConfig?.tiktok_pixel_id?.trim();

  async function handleSave() {
    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      tiktok_pixel_id: pixelId.trim() || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(pixelId.trim() ? "TikTok Pixel salvat" : "TikTok Pixel eliminat");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">TikTok Pixel activ</p>
            <p className="text-xs text-green-700 font-mono">{initialConfig?.tiktok_pixel_id}</p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Pixel ID</h3>
        <div>
          <input
            type="text"
            value={pixelId}
            onChange={e => setPixelId(e.target.value)}
            placeholder="ex: C4ABCDEF1234567890"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Gaseste Pixel ID-ul in TikTok Ads Manager &gt; Assets &gt; Events.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <a
            href="https://ads.tiktok.com/i18n/events_manager"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Deschide TikTok Events Manager
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
          <li><span className="font-mono text-foreground">PageView</span> — la fiecare vizita pe pagina magazinului</li>
          <li><span className="font-mono text-foreground">AddToCart</span> — cand un produs este adaugat in cos</li>
          <li><span className="font-mono text-foreground">InitiateCheckout</span> — la deschiderea formularului de comanda</li>
          <li><span className="font-mono text-foreground">CompletePayment</span> — la confirmarea comenzii (cu valoare + RON)</li>
        </ul>
      </div>
    </div>
  );
}
