"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import { Save, Loader2, CreditCard, Info, Key } from "lucide-react";
import { saveRevolutConfig, disconnectRevolut } from "@/lib/actions/revolut.actions";
import type { RevolutConfigInput } from "@/lib/revolut";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

const DEFAULT_CONFIG: RevolutConfigInput = {
  enabled: false,
  sandbox: true,
  secret_key: "",
  title: "Revolut",
};

export default function RevolutConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: RevolutConfigInput | null;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<RevolutConfigInput>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = !!initialConfig?.secret_key;

  function set<K extends keyof RevolutConfigInput>(key: K, value: RevolutConfigInput[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if (!cfg.secret_key.trim()) { toast.error("Cheia secreta API este obligatorie."); return; }
    startSave(async () => {
      const result = await saveRevolutConfig(businessId, {
        ...cfg,
        secret_key: cfg.secret_key.trim(),
        title: cfg.title.trim() || DEFAULT_CONFIG.title,
      });
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      if (result.warning) toast.warning(result.warning);
      else toast.success("Configuratia Revolut a fost salvata.");
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectRevolut(businessId);
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Revolut deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="revolut" description="Accepta plati cu cardul prin Revolut — pagina de plata securizata, incasare imediata." />

      <div className="space-y-5">
        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Integreaza Revolut Merchant pentru a accepta plati cu cardul (inclusiv Apple Pay, Google Pay si Revolut Pay).
            Clientii sunt redirectionati catre pagina securizata Revolut, fara a introduce datele cardului pe site-ul tau,
            iar plata este incasata imediat. Ai nevoie de cheia secreta API (Merchant API) din contul tau Revolut Business
            &rarr; Merchant &rarr; APIs. Plata se face in RON. Webhook-ul de confirmare se inregistreaza automat la salvare.
          </p>
        </div>

        {/* Ghid */}
        <Panel className="overflow-hidden">
          <PanelHeader>
            <PanelTitle>Cum configurezi integrarea?</PanelTitle>
          </PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              { step: "1", title: "Cont Revolut Business + Merchant", desc: "Ai nevoie de un cont Revolut Business si un cont Merchant (sub-cont pentru acceptarea platilor). Activeaza contul Merchant din aplicatia/dashboard-ul Revolut Business." },
              { step: "2", title: "Genereaza cheia secreta API", desc: "In Revolut Business, mergi la Merchant -> APIs si genereaza cheia secreta (Secret key). O folosim doar pe server, niciodata pe site-ul public." },
              { step: "3", title: "Testeaza pe Sandbox", desc: "Foloseste intai o cheie din mediul Sandbox pentru testare (platile nu sunt reale). Treci pe Live abia cand totul functioneaza." },
              { step: "4", title: "Completeaza si activeaza", desc: "Introdu cheia secreta, alege mediul (Sandbox pentru testare, Live pentru productie), activeaza si salveaza. Dupa activare, Revolut apare automat in Setari -> Metode de plata." },
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

        {/* Main config card */}
        <Panel className="space-y-5 p-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza Revolut</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Afiseaza optiunea de plata cu cardul prin Revolut la checkout</p>
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
              <Input type="text" value={cfg.title} onChange={(e) => set("title", e.target.value)}
                placeholder="Revolut" />
              <p className="mt-1 text-xs text-muted-foreground">Cum apare optiunea de plata in formularul de comanda (o poti schimba si din Metode de plata)</p>
            </div>

            {/* Secret key */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Cheie secreta API (Merchant)
              </label>
              <Input type="password" value={cfg.secret_key} onChange={(e) => set("secret_key", e.target.value)}
                placeholder="sk_..." autoComplete="new-password" />
              <p className="mt-1 text-xs text-muted-foreground">Din Revolut Business &rarr; Merchant &rarr; APIs. Se pastreaza doar pe server.</p>
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
