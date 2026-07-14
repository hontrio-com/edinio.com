"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import { Save, Loader2, CreditCard, Info, Key, User } from "lucide-react";
import { saveKlarnaConfig, disconnectKlarna } from "@/lib/actions/klarna.actions";
import type { KlarnaConfig } from "@/lib/klarna";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

const DEFAULT_CONFIG: KlarnaConfig = {
  enabled: false,
  sandbox: true,
  username: "",
  password: "",
  title: "Klarna",
};

export default function KlarnaConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: KlarnaConfig | null;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<KlarnaConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = !!initialConfig?.username && !!initialConfig?.password;

  function set<K extends keyof KlarnaConfig>(key: K, value: KlarnaConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if (!cfg.username.trim()) { toast.error("Utilizatorul API este obligatoriu."); return; }
    if (!cfg.password.trim()) { toast.error("Parola API este obligatorie."); return; }
    startSave(async () => {
      const result = await saveKlarnaConfig(businessId, {
        ...cfg,
        username: cfg.username.trim(),
        password: cfg.password.trim(),
        title: cfg.title.trim() || DEFAULT_CONFIG.title,
      });
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configuratia Klarna a fost salvata.");
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectKlarna(businessId);
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Klarna deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="klarna" description="Accepta plati Klarna — «Cumpara acum, plateste mai tarziu» si plata in rate." />

      <div className="space-y-5">
        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Integreaza Klarna pentru a accepta plati «Cumpara acum, plateste mai tarziu» si plata in rate. Clientii sunt
            redirectionati catre pagina securizata Klarna, fara a introduce datele de plata pe site-ul tau. Ai nevoie de
            credentialele API (utilizator si parola) din Klarna Merchant Portal (Setari &rarr; API credentials). Plata se
            face in RON, pentru clienti din Romania.
          </p>
        </div>

        {/* Ghid */}
        <Panel className="overflow-hidden">
          <PanelHeader>
            <PanelTitle>Cum configurezi integrarea?</PanelTitle>
          </PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              { step: "1", title: "Cont Klarna si credentiale API", desc: "Creeaza-ti cont in Klarna Merchant Portal si genereaza o pereche utilizator - parola API din Settings -> API credentials (\"Generate new API credentials\")." },
              { step: "2", title: "Testeaza pe Playground", desc: "Foloseste intai credentialele de Playground pe mediul de test. Platile nu sunt reale si poti simula un client cu personele de test Klarna." },
              { step: "3", title: "Completeaza si activeaza", desc: "Introdu utilizatorul si parola API, alege mediul (Playground pentru testare, Live pentru productie), activeaza si salveaza." },
              { step: "4", title: "Apare in Metode de plata", desc: 'Dupa activare, Klarna apare automat in Setari -> Metode de plata, unde poti schimba denumirea si ordinea afisarii la checkout.' },
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
              <p className="text-sm font-semibold text-foreground">Activeaza Klarna</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Afiseaza optiunea de plata Klarna la checkout</p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={v => set("enabled", v)} />
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            {/* Playground toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Mod Playground (testare)</p>
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
                placeholder="Klarna" />
              <p className="mt-1 text-xs text-muted-foreground">Cum apare optiunea de plata in formularul de comanda (o poti schimba si din Metode de plata)</p>
            </div>

            {/* Username */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Utilizator API
              </label>
              <Input type="text" value={cfg.username} onChange={(e) => set("username", e.target.value)}
                placeholder="Utilizatorul API Klarna" autoComplete="off" />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Parola API
              </label>
              <Input type="password" value={cfg.password} onChange={(e) => set("password", e.target.value)}
                placeholder="Parola API Klarna" autoComplete="new-password" />
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
