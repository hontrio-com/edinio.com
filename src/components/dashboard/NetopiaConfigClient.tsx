"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, CheckCircle, CreditCard, Info, Key } from "lucide-react";
import { saveNetopiaConfig, disconnectNetopia } from "@/lib/actions/netopia.actions";
import type { NetopiaConfig } from "@/lib/netopia";

const DEFAULT_CONFIG: NetopiaConfig = {
  enabled: false,
  sandbox: true,
  pos_signature: "",
  title: "Card online (Netopia)",
  api_key: "",
};

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

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
      toast.error("Account Signature este obligatoriu.");
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
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Integreaza Netopia Payments pentru a accepta plati cu cardul. Clientii sunt redirectionati catre pagina securizata Netopia, fara a introduce datele cardului pe site-ul tau.
            Ai nevoie de un cont de comerciant Netopia si de API Key-ul generat din panoul Netopia.
          </p>
        </div>

        {/* Ghid */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Cum configurezi integrarea?</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              {
                step: "1",
                title: "Logheaza-te in contul Netopia",
                desc: 'Mergi pe admin.netopia-payments.com si acceseaza "Puncte de vanzare" → "Setari tehnice".',
              },
              {
                step: "2",
                title: "Copiaza POS Signature",
                desc: "Gasesti Signature-ul punctului de vanzare. Copiaza-l si lipeste-l mai jos.",
              },
              {
                step: "3",
                title: "Genereaza API Key",
                desc: 'In sectiunea "Setari tehnice" → "API Key", genereaza un API Key nou. Copiaza-l si lipeste-l mai jos.',
              },
              {
                step: "4",
                title: "Salveaza si activeaza",
                desc: "Completeaza toate campurile, alege modul (Sandbox pentru testare, Live pentru productie), activeaza si salveaza.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main config card */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza Netopia Payments</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Afiseaza optiunea de plata cu cardul la checkout
              </p>
            </div>
            <button type="button" onClick={() => set("enabled", !cfg.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${cfg.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            {/* Sandbox toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div>
                <p className="text-sm font-medium text-foreground">Mod Sandbox (testare)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cfg.sandbox ? "Platile nu sunt reale — foloseste pentru testare" : "Mod Live — platile sunt reale"}
                </p>
              </div>
              <button type="button" onClick={() => set("sandbox", !cfg.sandbox)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${cfg.sandbox ? "bg-primary" : "bg-muted-foreground/30"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.sandbox ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {/* Title */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                Titlu afisaj checkout
              </label>
              <input
                type="text"
                value={cfg.title}
                onChange={e => set("title", e.target.value)}
                placeholder="Card online (Netopia)"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">Cum apare optiunea de plata in formularul de comanda</p>
            </div>

            {/* POS Signature */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">POS Signature</label>
              <input
                type="text"
                value={cfg.pos_signature}
                onChange={e => set("pos_signature", e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Gasesti Signature-ul in Netopia → Puncte de vanzare → Setari tehnice
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                API Key
              </label>
              <input
                type="password"
                value={cfg.api_key}
                onChange={e => set("api_key", e.target.value)}
                placeholder="Introdu API Key-ul Netopia"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Genereaza un API Key din Netopia → Setari tehnice → API Key
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salveaza
            </button>
            {isConfigured && (
              <button
                type="button"
                onClick={disconnect}
                disabled={disconnecting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-60"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Deconecteaza
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
