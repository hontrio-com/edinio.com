"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle, Info } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing-config";
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
  /*
   * ⚠ ID-UL DE CONVERSIE E ALT CAMP DECAT TAGUL (18.09.2026). Cand lipseste, dar tagul de mai sus e un
   * `AW-`, se arata acela: asa ramane adevarat si pentru magazinele configurate inainte.
   */
  const [adsId, setAdsId] = useState(
    initialConfig?.google_ads_conversion_id
      ?? (initialConfig?.google_tag_id?.trim().toUpperCase().startsWith("AW-") ? initialConfig.google_tag_id : "")
      ?? "",
  );
  const [conversionLabel, setConversionLabel] = useState(initialConfig?.google_ads_conversion_label ?? "");

  const isActive = !!initialConfig?.google_tag_id?.trim() || !!initialConfig?.google_ads_conversion_id?.trim();
  const isGoogleAds = adsId.trim().toUpperCase().startsWith("AW-");

  async function handleSave() {
    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      google_tag_id: tagId.trim() || undefined,
      google_ads_conversion_id: adsId.trim() || undefined,
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
          <span className="font-mono">{initialConfig?.google_ads_conversion_id || initialConfig?.google_tag_id}</span>
        </Callout>
      )}
      {!!initialConfig?.google_ads_conversion_id && !initialConfig?.google_ads_conversion_label && (
        <Callout variant="warning" icon={Info} title="Mai lipseste eticheta de conversie">
          Fara ea, comanda incheiata nu se raporteaza ca vanzare in Google Ads. O gasesti la actiunea ta de
          conversie, in Google Ads &gt; Obiective &gt; Conversii &gt; Tag setup.
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

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">ID conversie Google Ads</label>
          <Input
            type="text"
            value={adsId}
            onChange={e => setAdsId(e.target.value)}
            placeholder="ex: AW-123456789"
            className="font-mono"
          />
          <div className="mt-1.5 flex items-start gap-1.5">
            <Info className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              Aici merge ID-ul contului de conversii, cel care incepe cu <span className="font-mono">AW-</span>.
              Un ID de Analytics (<span className="font-mono">G-</span>) nu primeste conversii: pana acum, pus aici,
              conversiile nu ajungeau nicaieri.
            </p>
          </div>
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
          <li><span className="font-mono text-foreground">page_view</span>: la fiecare vizita (configurat automat)</li>
          <li><span className="font-mono text-foreground">add_to_cart</span>: cand un produs este adaugat in cos</li>
          <li><span className="font-mono text-foreground">begin_checkout</span>: la deschiderea formularului de comanda</li>
          <li><span className="font-mono text-foreground">purchase</span>: la confirmarea comenzii (valoare + RON)</li>
          <li><span className="font-mono text-foreground">conversion</span>: conversia din Google Ads, cu ID-ul si eticheta de mai sus</li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Articolele pleaca si cu ID-ul din Merchant Center si cu <span className="font-mono">google_business_vertical</span>,
          deci reclamele de remarketing dinamic arata chiar produsele vazute.
        </p>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Enhanced conversions</p>
        <p className="text-xs text-muted-foreground">
          La comanda incheiata trimitem emailul si telefonul clientului <span className="font-medium text-foreground">hash-uite
          SHA-256 pe serverul nostru</span>, ca sa se potriveasca mai bine conversiile. Porneste-le o data din Google Ads:
          Obiective &gt; Conversii &gt; actiunea ta &gt; „Enhanced conversions”, cu metoda „Google tag”.
        </p>
      </div>
    </div>
  );
}
