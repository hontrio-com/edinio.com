"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing";

export function MarketingConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: MarketingConfig | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState(initialConfig?.facebook_pixel_id ?? "");

  const isActive = !!initialConfig?.facebook_pixel_id?.trim();

  async function handleSave() {
    const trimmed = pixelId.trim();

    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      facebook_pixel_id: trimmed || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(trimmed ? "Facebook Pixel salvat" : "Facebook Pixel eliminat");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Facebook Pixel */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <div className="flex items-center gap-3">
          <img src="/integrations/facebook-pixel.svg" alt="Facebook Pixel" className="h-8 w-8 object-contain flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Facebook Pixel</h3>
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded mt-0.5">
                Activ · ID {initialConfig?.facebook_pixel_id}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Neconectat</span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pixel ID</label>
          <input
            type="text"
            value={pixelId}
            onChange={e => setPixelId(e.target.value)}
            placeholder="ex: 1234567890123456"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Gaseste Pixel ID-ul in Facebook Business Manager &gt; Events Manager.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <a
            href="https://business.facebook.com/events_manager"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Deschide Events Manager
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

      {/* Events tracked */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-semibold text-foreground mb-2">Evenimente urmarite automat</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><span className="font-mono text-foreground">PageView</span> — la fiecare vizita pe pagina magazinului</li>
          <li><span className="font-mono text-foreground">AddToCart</span> — cand un produs este adaugat in cos</li>
          <li><span className="font-mono text-foreground">InitiateCheckout</span> — la deschiderea formularului de comanda</li>
          <li><span className="font-mono text-foreground">Purchase</span> — la confirmarea comenzii (cu valoare + RON)</li>
        </ul>
      </div>
    </div>
  );
}
