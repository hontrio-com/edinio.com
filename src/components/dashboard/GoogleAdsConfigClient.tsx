"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, ExternalLink, Info, Tag, Target } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import type { MarketingConfig } from "@/lib/marketing-config";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

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

  /* Bara de salvare: apare doar cand cele trei campuri s-au departat de ultima salvare. */
  const valori = { tagId, adsId, conversionLabel };
  const [reper, setReper] = useState(valori);
  const modificat = JSON.stringify(valori) !== JSON.stringify(reper);
  function renunta() { setTagId(reper.tagId); setAdsId(reper.adsId); setConversionLabel(reper.conversionLabel); }

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
      toast.success(tagId.trim() ? "Tagul Google a fost salvat." : "Tagul Google a fost eliminat.");
      setReper(valori);
      router.refresh();
    }
  }

  const faraEticheta = !!initialConfig?.google_ads_conversion_id && !initialConfig?.google_ads_conversion_label;
  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      { ton: "bun", text: "Tag activ" },
      ...(faraEticheta ? [{ ton: "asteptare" as const, text: "Fără etichetă de conversie" }] : []),
    ];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="google-ads"
      titlu="Conversii Google Ads"
      descriere="Vânzările din magazin ajung ca și conversii în Google Ads, pentru licitare și remarketing."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Tag ID", facut: !!initialConfig?.google_tag_id?.trim() },
          { text: "ID de conversie (AW-)", facut: !!initialConfig?.google_ads_conversion_id?.trim() },
          { text: "Eticheta de conversie", facut: !!initialConfig?.google_ads_conversion_label?.trim() },
        ]} />
        <CardCifre titlu="Evenimente trimise automat" randuri={EVENIMENTE_GOOGLE.map(([nume, cand]) => ({
          eticheta: <span className="font-mono text-foreground">{nume}</span>,
          valoare: <span className="text-muted-foreground">{cand}</span>,
        }))} />
        <CumFunctioneaza id="google-ads" puncte={[
          { Icon: Tag, text: "Tagul Google se încarcă pe fiecare pagină a magazinului, după acordul de cookie-uri." },
          { Icon: Target, text: "La comanda încheiată pleacă o conversie cu ID-ul AW- și eticheta ei, cu valoarea în RON." },
          { Icon: Boxes, text: "Articolele pleacă și cu ID-ul din Merchant Center, deci remarketingul dinamic arată chiar produsele văzute." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Tagul Google" descriere="Tagul care se încarcă pe paginile magazinului.">
        <Field label="Tag ID" htmlFor="google-tag" required hint={<>Google Ads: <span className="font-mono">AW-XXXXXXXXX</span>, GA4: <span className="font-mono">G-XXXXXXXXXX</span></>}>
          <Input id="google-tag" type="text" value={tagId} onChange={e => setTagId(e.target.value)} placeholder="ex: AW-123456789 sau G-XXXXXXXXXX" className="font-mono" />
        </Field>
        <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" className={legatura}>
          Deschide Google Ads <ExternalLink className="h-3 w-3" />
        </a>
      </Sectiune>

      <Sectiune pas={2} titlu="Conversia de vânzare" descriere="Cu ele, fiecare comandă încheiată se raportează ca vânzare în Google Ads.">
        {faraEticheta && (
          <Callout variant="warning" icon={Info} title="Mai lipsește eticheta de conversie">
            Fără ea, comanda încheiată nu se raportează ca vânzare în Google Ads. O găsești la acțiunea ta de
            conversie, în Google Ads, Obiective, Conversii, Tag setup.
          </Callout>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ID conversie Google Ads" htmlFor="google-conversie"
            ajutor={<ExplicatieCard marime="mic" intrebare="Ce scriu aici" eticheta="ID-ul de conversie"
              text="ID-ul contului de conversii, cel care începe cu AW-. Un ID de Analytics (G-) nu primește conversii: pus aici, conversiile nu ajung nicăieri." />}>
            <Input id="google-conversie" type="text" value={adsId} onChange={e => setAdsId(e.target.value)} placeholder="ex: AW-123456789" className="font-mono" />
          </Field>
          <Field
            label={<>Conversion Label (Purchase){isGoogleAds && <span className="ml-1 font-semibold text-warning">recomandat</span>}</>}
            htmlFor="google-eticheta"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Eticheta de conversie"
              text="În Google Ads: Goals, Conversions, acțiunea de conversie Purchase, apoi Tag setup. Fără ea, comenzile nu se raportează ca vânzări." />}>
            <Input id="google-eticheta" type="text" value={conversionLabel} onChange={e => setConversionLabel(e.target.value)} placeholder="ex: abc123XYZ_def456" className="font-mono" />
          </Field>
        </div>
      </Sectiune>

      <Sectiune titlu="Enhanced conversions">
        <p className="text-xs leading-relaxed text-muted-foreground">
          La comanda încheiată trimitem emailul și telefonul clientului <span className="font-medium text-foreground">hash-uite
          SHA-256 pe serverul nostru</span>, ca să se potrivească mai bine conversiile. Pornește-le o dată din Google Ads:
          Obiective, Conversii, acțiunea ta, „Enhanced conversions”, cu metoda „Google tag”.
        </p>
      </Sectiune>

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={handleSave} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}

const EVENIMENTE_GOOGLE: [string, string][] = [
  ["page_view", "fiecare vizită"],
  ["add_to_cart", "adăugarea în coș"],
  ["begin_checkout", "formularul de comandă"],
  ["purchase", "comanda confirmată, cu valoarea"],
  ["conversion", "conversia Google Ads"],
];
