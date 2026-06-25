"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import { Save, Loader2, CreditCard, Info, Key } from "lucide-react";
import { saveNetopiaConfig, disconnectNetopia } from "@/lib/actions/netopia.actions";
import type { NetopiaConfig } from "@/lib/netopia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

const DEFAULT_CONFIG: NetopiaConfig = {
  enabled: false,
  sandbox: true,
  pos_signature: "",
  title: "Card online (Netopia)",
  api_key: "",
  badge_html: "",
};

export default function NetopiaConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: NetopiaConfig | null;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<NetopiaConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = !!initialConfig?.pos_signature && !!initialConfig?.api_key;

  function set<K extends keyof NetopiaConfig>(key: K, value: NetopiaConfig[K]) {
    setCfg(c => ({ ...c, [key]: value }));
  }

  function save() {
    if (!cfg.pos_signature.trim()) {
      toast.error("POS Signature este obligatoriu.");
      return;
    }
    if (!cfg.api_key.trim()) {
      toast.error("API Key este obligatoriu.");
      return;
    }
    startSave(async () => {
      const result = await saveNetopiaConfig(businessId, cfg);
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configuratia Netopia a fost salvata.");
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectNetopia(businessId);
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Netopia deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="netopia" description="Accepta plati cu cardul prin Netopia Payments." />

      <div className="space-y-5">
        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Integreaza Netopia Payments pentru a accepta plati cu cardul. Clientii sunt redirectionati catre pagina securizata Netopia, fara a introduce datele cardului pe site-ul tau.
            Ai nevoie de un cont de comerciant Netopia si de API Key-ul generat din panoul Netopia.
          </p>
        </div>

        {/* Ghid */}
        <Panel className="overflow-hidden">
          <PanelHeader>
            <PanelTitle>Cum configurezi integrarea?</PanelTitle>
          </PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              {
                step: "1",
                title: "Logheaza-te in contul Netopia",
                desc: "Mergi pe admin.netopia-payments.com si autentifica-te cu contul tau de comerciant.",
              },
              {
                step: "2",
                title: "Copiaza POS Signature",
                desc: 'Mergi la "Puncte de vanzare" → alege punctul de vanzare → "Setari tehnice" si copiaza valoarea din campul "Signature" (format XXXX-XXXX-XXXX-XXXX). Lipeste-o mai jos.',
              },
              {
                step: "3",
                title: "Genereaza API Key din Profil → Securitate",
                desc: 'API Key-ul NU se afla in "Setari tehnice". Apasa pe numele contului (sus) → "Profil" → "Securitate" si genereaza un API Key. Copiaza-l si lipeste-l mai jos.',
              },
              {
                step: "4",
                title: "Salveaza si activeaza",
                desc: "Completeaza toate campurile, alege modul (Sandbox pentru testare, Live pentru productie), activeaza si salveaza.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Atentie: chei RSA vechi */}
        <Callout variant="warning" icon={Info}>
          <span className="font-medium text-foreground">Nu confunda API Key-ul cu cheile de criptare.</span> In &quot;Setari tehnice&quot; vei vedea si o &quot;Cheie publica&quot; si o &quot;Cheie privata&quot;: acestea sunt pentru vechea integrare (Netopia API v1) si <span className="font-medium text-foreground">nu sunt necesare aici</span>. Edinio foloseste API v2, care are nevoie doar de <span className="font-medium text-foreground">POS Signature</span> (din Setari tehnice) si de <span className="font-medium text-foreground">API Key</span> (din Profil → Securitate).
        </Callout>

        {/* Main config card */}
        <Panel className="space-y-5 p-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza Netopia Payments</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Afiseaza optiunea de plata cu cardul la checkout
              </p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={v => set("enabled", v)} />
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            {/* Sandbox toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Mod Sandbox (testare)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cfg.sandbox ? "Platile nu sunt reale — foloseste pentru testare" : "Mod Live — platile sunt reale"}
                </p>
              </div>
              <Switch checked={cfg.sandbox} onCheckedChange={v => set("sandbox", v)} className="data-checked:bg-warning" />
            </div>

            {/* Title */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                Titlu afisaj checkout
              </label>
              <Input
                type="text"
                value={cfg.title}
                onChange={e => set("title", e.target.value)}
                placeholder="Card online (Netopia)"
              />
              <p className="mt-1 text-xs text-muted-foreground">Cum apare optiunea de plata in formularul de comanda</p>
            </div>

            {/* POS Signature */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">POS Signature</label>
              <Input
                type="text"
                value={cfg.pos_signature}
                onChange={e => set("pos_signature", e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Gasesti Signature-ul in Netopia → Puncte de vanzare → Setari tehnice
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                API Key
              </label>
              <Input
                type="password"
                value={cfg.api_key}
                onChange={e => set("api_key", e.target.value)}
                placeholder="Introdu API Key-ul Netopia"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Genereaza un API Key din Netopia → Profil → Securitate (nu din Setari tehnice)
              </p>
            </div>

            {/* Logo Netopia pentru footer (Identitate Vizuala) */}
            <div className="border-t border-border pt-4">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Logo Netopia pentru footer (Identitate Vizuala)
              </label>
              <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
                Afisarea logo-ului Netopia este obligatorie cand accepti plata cu cardul. Dupa ce lipesti codul mai jos, logo-ul apare automat in footer-ul magazinului.
              </p>
              <div className="mb-2.5 space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Cum obtii codul:</p>
                <p>1. In contul Netopia, mergi la <span className="font-medium text-foreground">Identitate Vizuala</span>.</p>
                <p>2. La tipul de platforma, alege <span className="font-medium text-foreground">HTML/IFRAME</span> (recomandat).</p>
                <p>3. Selecteaza <span className="font-medium text-foreground">Punctul de vanzare</span> potrivit.</p>
                <p>4. Copiaza codul generat si lipeste-l mai jos.</p>
              </div>
              <Textarea
                value={cfg.badge_html ?? ""}
                onChange={e => set("badge_html", e.target.value)}
                placeholder={'<iframe src="https://netopia-payments.com/..."></iframe>'}
                rows={4}
                className="resize-y font-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Accepta doar codul de tip <span className="font-medium">HTML/IFRAME</span> de la Netopia. Alte formate (Script, React, Angular) nu vor fi afisate.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Salveaza
            </Button>
            {isConfigured && (
              <Button variant="outline" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="animate-spin" /> : null}
                Deconecteaza
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
