"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle, Search } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import { type MarketingConfig, parseTikTokPixelId } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

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
    const raw = pixelId.trim();
    // Extract the bare ID if the merchant pasted the whole base-code snippet;
    // reject obviously invalid input before hitting the server.
    if (raw) {
      const parsed = parseTikTokPixelId(raw);
      if (!parsed) {
        toast.error("TikTok Pixel ID invalid. Copiaza ID-ul din TikTok Events Manager (ex: C4ABCDEF...).");
        return;
      }
      if (parsed !== raw) setPixelId(parsed); // snippet pasted → show clean ID
    }

    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      tiktok_pixel_id: raw || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(raw ? "TikTok Pixel salvat" : "TikTok Pixel eliminat");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout variant="success" icon={CheckCircle} title="TikTok Pixel activ">
          <span className="font-mono">{initialConfig?.tiktok_pixel_id}</span>
        </Callout>
      )}

      <Panel className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Pixel ID</h3>
        <div>
          <Input
            type="text"
            value={pixelId}
            onChange={e => setPixelId(e.target.value)}
            placeholder="ex: C4ABCDEF1234567890"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
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
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza"}
          </Button>
        </div>
      </Panel>

      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Evenimente urmarite automat</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><span className="font-mono text-foreground">PageView</span> — la fiecare vizita pe pagina magazinului</li>
          <li><span className="font-mono text-foreground">ViewContent</span> — la vizualizarea unui produs</li>
          <li><span className="font-mono text-foreground">AddToCart</span> — cand un produs este adaugat in cos</li>
          <li><span className="font-mono text-foreground">InitiateCheckout</span> — la deschiderea formularului de comanda</li>
          <li><span className="font-mono text-foreground">PlaceAnOrder</span> + <span className="font-mono text-foreground">CompletePayment</span> — la confirmarea comenzii (cu valoare + RON)</li>
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="h-4 w-4 text-primary" /> Cum verifici ca pixelul functioneaza
        </p>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Instaleaza extensia <span className="font-medium text-foreground">TikTok Pixel Helper</span> in Chrome.</li>
          <li>Deschide magazinul intr-o fereastra <span className="font-medium text-foreground">incognito</span>.</li>
          <li>Daca ai bannerul de cookie-uri activ, apasa <span className="font-medium text-foreground">Accepta</span> — pixelii se incarca doar dupa consimtamant (GDPR). Fara acest pas, Pixel Helper nu vede nimic.</li>
          <li>Pixel Helper ar trebui sa arate pixelul si evenimentul <span className="font-mono text-foreground">PageView</span>.</li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Poti dezactiva bannerul din <span className="font-medium text-foreground">Setari &gt; Banner Cookies</span> (pixelii se vor incarca fara consimtamant — raspunderea GDPR iti apartine).
        </p>
      </div>
    </div>
  );
}
