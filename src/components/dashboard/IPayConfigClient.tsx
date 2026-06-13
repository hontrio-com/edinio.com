"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import { Save, Loader2, CreditCard, Info, Key, User } from "lucide-react";
import { saveIpayConfig, disconnectIpay } from "@/lib/actions/ipay.actions";
import type { IPayConfig } from "@/lib/ipay";

const DEFAULT_CONFIG: IPayConfig = {
  enabled: false,
  sandbox: true,
  username: "",
  password: "",
  title: "Card bancar (BT iPay)",
};

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export default function IPayConfigClient({
  businessId,
  initialConfig,
}: {
  businessId: string;
  initialConfig: IPayConfig | null;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<IPayConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConfigured = !!initialConfig?.username && !!initialConfig?.password;

  function set<K extends keyof IPayConfig>(key: K, value: IPayConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if (!cfg.username.trim()) { toast.error("Utilizatorul API este obligatoriu."); return; }
    if (!cfg.password.trim()) { toast.error("Parola API este obligatorie."); return; }
    startSave(async () => {
      const result = await saveIpayConfig(businessId, { ...cfg, username: cfg.username.trim(), password: cfg.password, title: cfg.title.trim() || DEFAULT_CONFIG.title });
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      toast.success("Configuratia BT iPay a fost salvata.");
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectIpay(businessId);
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("BT iPay deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="ipay" description="Accepta plati cu cardul prin BT iPay (Banca Transilvania)." />

      <div className="space-y-5">
        {/* Info */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Integreaza BT iPay pentru a accepta plati cu cardul. Clientii sunt redirectionati catre pagina securizata
            a Bancii Transilvania (cu 3D Secure), fara a introduce datele cardului pe site-ul tau. Ai nevoie de
            credentialele API (utilizator si parola) primite de la Banca Transilvania la crearea comerciantului iPay.
          </p>
        </div>

        {/* Ghid */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Cum configurezi integrarea?</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              { step: "1", title: "Obtine credentialele API", desc: "Banca Transilvania iti furnizeaza o pereche utilizator - parola API la crearea comerciantului pe platforma iPay. Sunt diferite de credentialele consolei." },
              { step: "2", title: "Testeaza pe Sandbox", desc: "Foloseste intai credentialele de test pe mediul Sandbox. Platile nu sunt reale si poti folosi cardurile de test furnizate de banca." },
              { step: "3", title: "Completeaza si activeaza", desc: "Introdu utilizatorul si parola, alege modul (Sandbox pentru testare, Live pentru productie), activeaza si salveaza." },
              { step: "4", title: "Apare in Metode de plata", desc: 'Dupa activare, BT iPay apare automat in Setari -> Metode de plata, unde poti schimba denumirea si ordinea afisarii la checkout.' },
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
              <p className="text-sm font-semibold text-foreground">Activeaza BT iPay</p>
              <p className="text-xs text-muted-foreground mt-0.5">Afiseaza optiunea de plata cu cardul la checkout</p>
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
              <input type="text" value={cfg.title} onChange={(e) => set("title", e.target.value)}
                placeholder="Card bancar (BT iPay)" className={inputCls} />
              <p className="text-xs text-muted-foreground mt-1">Cum apare optiunea de plata in formularul de comanda (o poti schimba si din Metode de plata)</p>
            </div>

            {/* Username */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Utilizator API
              </label>
              <input type="text" value={cfg.username} onChange={(e) => set("username", e.target.value)}
                placeholder="Utilizatorul API iPay" autoComplete="off" className={inputCls} />
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Parola API
              </label>
              <input type="password" value={cfg.password} onChange={(e) => set("password", e.target.value)}
                placeholder="Parola API iPay" autoComplete="new-password" className={inputCls} />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salveaza
            </button>
            {isConfigured && (
              <button type="button" onClick={disconnect} disabled={disconnecting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-60">
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
