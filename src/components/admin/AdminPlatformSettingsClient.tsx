"use client";

import { useState } from "react";
import {
  Settings2, ShieldAlert, Package, Store, Percent, Clock, Mail, Save, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { PLAN_LABELS } from "@/lib/plans";

const PLANS_ORDER = ["free", "basic", "premium", "ultra"] as const;

async function saveSetting(key: string, value: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Eroare la salvare");
    }
    toast.success("Setare salvata cu succes");
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Eroare la salvare");
    return false;
  }
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  onSave,
  saving,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-4">
        {children}
      </div>
      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
            "bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salveaza
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

export function AdminPlatformSettingsClient({
  settings,
}: {
  settings: Record<string, unknown>;
}) {
  // -- Maintenance mode --
  const maintenanceInit = (settings.maintenance_mode ?? { enabled: false, message: "" }) as {
    enabled: boolean;
    message: string;
  };
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(maintenanceInit.enabled);
  const [maintenanceMessage, setMaintenanceMessage] = useState(maintenanceInit.message);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  // -- Max products per plan --
  const maxProductsInit = (settings.max_products_per_plan ?? { free: 5, basic: 20, premium: 100, ultra: 500 }) as Record<string, number>;
  const [maxProducts, setMaxProducts] = useState<Record<string, number>>({ ...maxProductsInit });
  const [savingMaxProducts, setSavingMaxProducts] = useState(false);

  // -- Max businesses per plan --
  const maxBusinessesInit = (settings.max_businesses_per_plan ?? { free: 1, basic: 3, premium: 10, ultra: 50 }) as Record<string, number>;
  const [maxBusinesses, setMaxBusinesses] = useState<Record<string, number>>({ ...maxBusinessesInit });
  const [savingMaxBusinesses, setSavingMaxBusinesses] = useState(false);

  // -- Platform commission --
  const commissionInit = (settings.platform_commission ?? { percent: 0, fixed: 0 }) as {
    percent: number;
    fixed: number;
  };
  const [commissionPercent, setCommissionPercent] = useState(commissionInit.percent);
  const [commissionFixed, setCommissionFixed] = useState(commissionInit.fixed);
  const [savingCommission, setSavingCommission] = useState(false);

  // -- Default trial days --
  const trialInit = (settings.default_trial_days ?? 14) as number;
  const [trialDays, setTrialDays] = useState(trialInit);
  const [savingTrial, setSavingTrial] = useState(false);

  // -- Email templates --
  const emailInit = (settings.email_templates ?? { welcome_subject: "", welcome_body: "" }) as {
    welcome_subject: string;
    welcome_body: string;
  };
  const [emailSubject, setEmailSubject] = useState(emailInit.welcome_subject);
  const [emailBody, setEmailBody] = useState(emailInit.welcome_body);
  const [savingEmail, setSavingEmail] = useState(false);

  const inputClass =
    "w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const textareaClass =
    "w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y min-h-24";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Setari platforma</h1>
        <p className="text-sm text-zinc-500 mt-1">Configureaza setarile globale ale platformei Edinio</p>
      </div>

      {/* 1. Maintenance mode */}
      <SectionCard
        title="Mod mentenanta"
        description="Activeaza modul mentenanta pentru a bloca accesul utilizatorilor la platforma"
        icon={ShieldAlert}
        saving={savingMaintenance}
        onSave={async () => {
          setSavingMaintenance(true);
          await saveSetting("maintenance_mode", {
            enabled: maintenanceEnabled,
            message: maintenanceMessage,
          });
          setSavingMaintenance(false);
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={maintenanceEnabled}
            onClick={() => setMaintenanceEnabled(!maintenanceEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              maintenanceEnabled ? "bg-red-500" : "bg-zinc-300 dark:bg-zinc-600",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                maintenanceEnabled ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
          <span className={cn(
            "text-sm font-semibold",
            maintenanceEnabled ? "text-red-600" : "text-zinc-500",
          )}>
            {maintenanceEnabled ? "Activ" : "Inactiv"}
          </span>
        </div>
        <LabeledInput label="Mesaj mentenanta">
          <textarea
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            placeholder="Platforma este in mentenanta. Revenim in curand."
            rows={3}
            className={textareaClass}
          />
        </LabeledInput>
      </SectionCard>

      {/* 2. Max products per plan */}
      <SectionCard
        title="Limite produse pe plan"
        description="Numarul maxim de produse pe care un utilizator le poate crea pe fiecare plan"
        icon={Package}
        saving={savingMaxProducts}
        onSave={async () => {
          setSavingMaxProducts(true);
          await saveSetting("max_products_per_plan", maxProducts);
          setSavingMaxProducts(false);
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {PLANS_ORDER.map((plan) => (
            <LabeledInput key={plan} label={PLAN_LABELS[plan] ?? plan}>
              <input
                type="number"
                min={0}
                value={maxProducts[plan] ?? 0}
                onChange={(e) =>
                  setMaxProducts((prev) => ({ ...prev, [plan]: parseInt(e.target.value) || 0 }))
                }
                className={inputClass}
              />
            </LabeledInput>
          ))}
        </div>
      </SectionCard>

      {/* 3. Max businesses per plan */}
      <SectionCard
        title="Limite magazine pe plan"
        description="Numarul maxim de magazine pe care un utilizator le poate crea pe fiecare plan"
        icon={Store}
        saving={savingMaxBusinesses}
        onSave={async () => {
          setSavingMaxBusinesses(true);
          await saveSetting("max_businesses_per_plan", maxBusinesses);
          setSavingMaxBusinesses(false);
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {PLANS_ORDER.map((plan) => (
            <LabeledInput key={plan} label={PLAN_LABELS[plan] ?? plan}>
              <input
                type="number"
                min={0}
                value={maxBusinesses[plan] ?? 0}
                onChange={(e) =>
                  setMaxBusinesses((prev) => ({ ...prev, [plan]: parseInt(e.target.value) || 0 }))
                }
                className={inputClass}
              />
            </LabeledInput>
          ))}
        </div>
      </SectionCard>

      {/* 4. Platform commission */}
      <SectionCard
        title="Comision platforma"
        description="Comisionul perceput pe tranzactiile procesate prin platforma"
        icon={Percent}
        saving={savingCommission}
        onSave={async () => {
          setSavingCommission(true);
          await saveSetting("platform_commission", {
            percent: commissionPercent,
            fixed: commissionFixed,
          });
          setSavingCommission(false);
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <LabeledInput label="Procent (%)">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </LabeledInput>
          <LabeledInput label="Fix (lei)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={commissionFixed}
              onChange={(e) => setCommissionFixed(parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </LabeledInput>
        </div>
        <p className="text-xs text-zinc-400">
          Comision total per tranzactie: {commissionPercent}% + {commissionFixed} lei fix
        </p>
      </SectionCard>

      {/* 5. Default trial days */}
      <SectionCard
        title="Zile trial implicit"
        description="Numarul de zile de trial gratuit pentru utilizatorii noi"
        icon={Clock}
        saving={savingTrial}
        onSave={async () => {
          setSavingTrial(true);
          await saveSetting("default_trial_days", trialDays);
          setSavingTrial(false);
        }}
      >
        <LabeledInput label="Numar de zile">
          <input
            type="number"
            min={0}
            max={365}
            value={trialDays}
            onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)}
            className={cn(inputClass, "max-w-32")}
          />
        </LabeledInput>
      </SectionCard>

      {/* 6. Email template */}
      <SectionCard
        title="Template email bun venit"
        description="Emailul trimis automat utilizatorilor noi la inregistrare"
        icon={Mail}
        saving={savingEmail}
        onSave={async () => {
          setSavingEmail(true);
          await saveSetting("email_templates", {
            welcome_subject: emailSubject,
            welcome_body: emailBody,
          });
          setSavingEmail(false);
        }}
      >
        <LabeledInput label="Subiect">
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Bine ai venit pe Edinio!"
            className={inputClass}
          />
        </LabeledInput>
        <LabeledInput label="Continut email">
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Salut {{name}}, bine ai venit pe Edinio..."
            rows={6}
            className={textareaClass}
          />
        </LabeledInput>
        <p className="text-xs text-zinc-400">
          Variabile disponibile: {"{{name}}"}, {"{{email}}"}, {"{{plan}}"}
        </p>
      </SectionCard>
    </div>
  );
}
