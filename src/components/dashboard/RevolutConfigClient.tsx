"use client";

import { useState, useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import { Save, Loader2, CreditCard, Key } from "lucide-react";
import { saveRevolutConfig, disconnectRevolut } from "@/lib/actions/revolut.actions";
import type { RevolutConfigInput } from "@/lib/revolut";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";

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

  const isConfigured = (!!initialConfig?.secret_key || secretulEsteSalvat(initialConfig, "secret_key"));

  function set<K extends keyof RevolutConfigInput>(key: K, value: RevolutConfigInput[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function save() {
    if ((!cfg.secret_key.trim() && !secretulEsteSalvat(initialConfig, "secret_key"))) { toast.error("Cheia secreta API este obligatorie."); return; }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof saveRevolutConfig>>;
      try {
        result = await saveRevolutConfig(businessId, {
          ...cfg,
          secret_key: cfg.secret_key.trim(),
          title: cfg.title.trim() || DEFAULT_CONFIG.title,
        });
      } catch {
        /* ⚠ Scrie configurarea Revolut. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea Revolut s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la salvare"); return; }
      if (result.warning) toast.warning(result.warning);
      else toast.success("Configuratia Revolut a fost salvata.");
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      let result: Awaited<ReturnType<typeof disconnectRevolut>>;
      try {
        result = await disconnectRevolut(businessId);
      } catch {
        /* ⚠ Actiunea CHEAMA afara, `deleteWebhook` la Revolut, dar cu `.catch(() => {})`:
           esecul lui e inghitit dinadins, ca sa nu opreasca deconectarea, deci nu el
           poate fi cauza unei aruncari. Ce ramane nestiut e doar daca stergerea de la
           noi a apucat sa se scrie. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a sters configurarea "
          + "Revolut. Reimprospateaza pagina si uita-te daca mai apare conectat inainte "
          + "sa incerci din nou.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Eroare la stergere"); return; }
      toast.success("Revolut deconectat.");
      setCfg(DEFAULT_CONFIG);
      router.refresh();
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="revolut" description="Accepta plati cu cardul prin Revolut: pagina de plata securizata, incasare imediata." />

      <div className="space-y-5">

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
                  {cfg.sandbox ? "Platile nu sunt reale, foloseste pentru testare" : "Mod Live: platile sunt reale"}
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
                placeholder={secretulEsteSalvat(initialConfig, "secret_key") ? PLACEHOLDER_SECRET_SALVAT : ""} autoComplete="new-password" />
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
              <ButonDeconectare
                nume="Revolut"
                cePierzi="Cheia se șterge din Edinio, iar webhook-ul înregistrat la Revolut se șterge și el, deci cumpărătorii nu mai pot plăti prin Revolut. Plățile deja încasate rămân neatinse. Ca să te întorci, ceri din nou cheia secretă din contul tău Revolut."
                pending={disconnecting}
                marime="default"
                onConfirma={disconnect}
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
