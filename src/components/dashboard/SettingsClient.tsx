"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import {
  Loader2, Save, FileText, Settings, Zap, Receipt,
  Truck, Percent, Globe, Bell, Lock, Clock, Hash, Shuffle, Eye, EyeOff,
  Check, Sparkles, Crown, Rocket, Search, MessageSquare, ExternalLink, Phone,
  ShieldCheck, ShieldOff, Mail,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { createClient } from "@/lib/supabase/client";
import { updateStorePolicies, updateGeneralSettings, updateVatSettings, updateNotificationsSettings, updateSmsoConfig, updateShippingConfig } from "@/lib/actions/store.actions";
import { deleteAccount, sendMfaOtp, verifyAndEnableMfaEmail, verifyAndDisableMfaEmail } from "@/lib/actions/auth.actions";
import { BillingSection } from "@/components/dashboard/BillingSection";
import type { Database } from "@/types/database.types";

type UserProfile = Database["public"]["Tables"]["users_profile"]["Row"];

type SectionId =
  | "general" | "plan" | "facturare" | "livrare"
  | "taxe" | "domeniu" | "notificari" | "politici" | "securitate";

const NAV_SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general",    label: "General",     icon: Settings  },
  { id: "plan",       label: "Plan",        icon: Zap       },
  { id: "facturare",  label: "Facturare",   icon: Receipt   },
  { id: "livrare",    label: "Livrare",     icon: Truck     },
  { id: "taxe",       label: "Taxe",        icon: Percent   },
  { id: "domeniu",    label: "Domeniu",     icon: Globe     },
  { id: "notificari", label: "Notificari",  icon: Bell      },
  { id: "politici",   label: "Politici",    icon: FileText  },
  { id: "securitate", label: "Securitate",  icon: Lock      },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  basic: "Basic",
  premium: "Premium",
  ultra: "Ultra",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-600 border-gray-200",
  basic: "bg-blue-50 text-blue-700 border-blue-200",
  premium: "bg-purple-50 text-purple-700 border-purple-200",
  ultra: "bg-amber-50 text-amber-700 border-amber-200",
};

const PLANS = [
  {
    id: "basic",
    label: "Basic",
    price: 99,
    icon: Rocket,
    color: "blue",
    badge: null,
    features: [
      "Pana la 500 produse",
      "Comenzi nelimitate",
      "Suport non-stop 24/7",
      "Mentenanta gratuita",
    ],
    highlight: false,
  },
  {
    id: "premium",
    label: "Premium",
    price: 249,
    icon: Sparkles,
    color: "purple",
    badge: "Recomandat",
    features: [
      "Pana la 2.500 produse",
      "Comenzi nelimitate",
      "Suport non-stop 24/7",
      "Mentenanta gratuita",
      "Manager dedicat magazinului tau",
    ],
    highlight: true,
  },
  {
    id: "ultra",
    label: "Ultra",
    price: 499,
    icon: Crown,
    color: "amber",
    badge: null,
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Suport non-stop 24/7",
      "Mentenanta gratuita",
      "Manager dedicat magazinului tau",
    ],
    highlight: false,
  },
] as const;

const POLICIES = [
  { key: "terms",        label: "Termeni si conditii",            placeholder: "Descrie conditiile generale de utilizare a magazinului tau..." },
  { key: "delivery",     label: "Politica de livrare",            placeholder: "Descrie conditiile de livrare: timpi, costuri, zone..." },
  { key: "return",       label: "Politica de retur",              placeholder: "Descrie conditiile de retur si inlocuire a produselor..." },
  { key: "privacy",      label: "Politica de confidentialitate",  placeholder: "Descrie modul in care colectezi si procesezi datele personale..." },
  { key: "gdpr",         label: "GDPR",                           placeholder: "Descrie drepturile utilizatorilor conform GDPR..." },
  { key: "cancellation", label: "Politica de anulare a comenzii", placeholder: "Descrie conditiile si termenele pentru anularea comenzilor..." },
] as const;

interface BusinessData {
  id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  cui: string | null;
}

interface PolicyEntry {
  content: string;
  enabled: boolean;
}

type PoliciesMap = Record<string, PolicyEntry>;

function parsePolicies(raw: Record<string, unknown>): PoliciesMap {
  const result: PoliciesMap = {};
  for (const { key } of POLICIES) {
    const val = raw[key];
    if (typeof val === "string") {
      result[key] = { content: val, enabled: true };
    } else if (val && typeof val === "object" && "content" in val) {
      result[key] = {
        content: String((val as Record<string, unknown>).content ?? ""),
        enabled: (val as Record<string, unknown>).enabled !== false,
      };
    } else {
      result[key] = { content: "", enabled: true };
    }
  }
  return result;
}

interface VatSettings {
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  show_vat_breakdown: boolean;
}

interface NotificationsConfig {
  notification_email: string;
  new_order: boolean;
}

interface SmsoConfig {
  enabled: boolean;
  api_key: string;
  sender_id: string;
}

interface ShippingMethodConfig {
  enabled: boolean;
  price: number;
  label?: string;
}

interface ShippingConfig {
  shipping_enabled: boolean;
  free_shipping_threshold: number | null;
  shipping_zones: Record<string, ShippingMethodConfig>;
}

const SHIPPING_METHODS: { id: string; label: string; logo: string; defaultPrice: number; filter?: string }[] = [
  { id: "fan-courier",  label: "Fan Courier",       logo: "/integrations/fan-courier.svg",  defaultPrice: 20 },
  { id: "dpd",          label: "DPD",               logo: "/integrations/dpd.svg",          defaultPrice: 18 },
  { id: "cargus",       label: "Cargus",            logo: "/integrations/cargus.svg",       defaultPrice: 17 },
  { id: "sameday",      label: "Sameday",           logo: "/integrations/sameday.svg",      defaultPrice: 19 },
  { id: "woot",         label: "Woot",              logo: "/integrations/woot.svg",         defaultPrice: 16, filter: "invert(1)" },
  { id: "colete",       label: "Colete Online",     logo: "/integrations/colete-online.svg", defaultPrice: 15 },
  { id: "own",          label: "Curier propriu",    logo: "",                               defaultPrice: 10 },
  { id: "pickup",       label: "Ridicare personala", logo: "",                              defaultPrice: 0  },
];

function buildDefaultZones(existing: Record<string, ShippingMethodConfig>): Record<string, ShippingMethodConfig> {
  const zones: Record<string, ShippingMethodConfig> = {};
  for (const m of SHIPPING_METHODS) {
    zones[m.id] = existing[m.id] ?? { enabled: false, price: m.defaultPrice };
  }
  return zones;
}

interface Props {
  profile: UserProfile;
  email: string;
  businessId: string | null;
  businessData: BusinessData | null;
  storePolicies: Record<string, unknown>;
  orderNumberFormat: string;
  vatSettings: VatSettings;
  notificationsConfig: NotificationsConfig;
  smsoConfig: SmsoConfig;
  shippingConfig: ShippingConfig;
  activeCourierIds: string[];
  mfaEmailEnabled: boolean;
  planSuccess?: boolean;
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <Clock className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">{title}</p>
      <p className="text-sm text-muted-foreground">Aceasta sectiune va fi disponibila in curand.</p>
    </div>
  );
}

export function SettingsClient({ profile, email, businessId, businessData, storePolicies, orderNumberFormat, vatSettings, notificationsConfig, smsoConfig, shippingConfig, activeCourierIds, mfaEmailEnabled, planSuccess }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>(planSuccess ? "plan" : "general");

  useEffect(() => {
    if (planSuccess) {
      toast.success("Plata a fost procesata! Planul tau a fost actualizat.");
    }
  }, [planSuccess]);

  useEffect(() => {
    if (planSuccess) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const hashMap: Partial<Record<string, SectionId>> = {
      abonament: "facturare",
      facturare: "facturare",
      plan: "plan",
    };
    const mapped = hashMap[hash] ?? (NAV_SECTIONS.some(s => s.id === hash) ? hash as SectionId : null);
    if (mapped) setActiveSection(mapped);
  }, [planSuccess]);


  // Account
  const [fullName, setFullName] = useState(profile.full_name);
  const [savingName, setSavingName] = useState(false);

  // Business
  const [biz, setBiz] = useState({
    business_name: businessData?.business_name ?? "",
    address: businessData?.address ?? "",
    city: businessData?.city ?? "",
    county: businessData?.county ?? "",
    phone: businessData?.phone ?? "",
    email: businessData?.email ?? "",
    cui: businessData?.cui ?? "",
  });
  const [anafLoading, setAnafLoading] = useState(false);
  const [orderFormat, setOrderFormat] = useState<"sequential" | "random">(
    orderNumberFormat === "random" ? "random" : "sequential"
  );
  const [savingGeneral, startGeneralTransition] = useTransition();

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Delete account
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, startDeleteTransition] = useTransition();

  // Stripe checkout
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  async function startCheckout(planId: string) {
    setCheckoutLoading(planId);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.error || !data.url) {
      toast.error(data.error ?? "Eroare la initializarea platii.");
      setCheckoutLoading(null);
      return;
    }
    window.location.href = data.url;
  }

  // Policies
  const [policies, setPolicies] = useState<PoliciesMap>(() => parsePolicies(storePolicies));
  const [savingPolicies, startPoliciesTransition] = useTransition();

  // VAT
  const [vat, setVat] = useState<VatSettings>(vatSettings);
  const [vatRateInput, setVatRateInput] = useState(String(vatSettings.vat_rate));
  const [savingVat, startVatTransition] = useTransition();

  // Notifications
  const [notif, setNotif] = useState<NotificationsConfig>(notificationsConfig);

  // SMSO
  const [smso, setSmso] = useState<SmsoConfig>(smsoConfig);
  const [savingSmso, startSmsoTransition] = useTransition();
  const [testSmsLoading, setTestSmsLoading] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState("");
  const [testSmsResult, setTestSmsResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null);
  const [savingNotif, startNotifTransition] = useTransition();
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null);

  // 2FA email
  const [mfaEnabled, setMfaEnabled] = useState(mfaEmailEnabled);
  const [mfaStep, setMfaStep] = useState<"idle" | "enabling" | "disabling">("idle");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSending, setMfaSending] = useState(false);
  const [mfaVerifying, setMfaVerifying] = useState(false);

  // Shipping
  const [shippingEnabled, setShippingEnabled] = useState(shippingConfig.shipping_enabled);
  const [freeThreshold, setFreeThreshold] = useState<string>(
    shippingConfig.free_shipping_threshold != null ? String(shippingConfig.free_shipping_threshold) : ""
  );
  const [shippingZones, setShippingZones] = useState<Record<string, ShippingMethodConfig>>(
    () => buildDefaultZones(shippingConfig.shipping_zones)
  );
  const [savingShipping, startShippingTransition] = useTransition();

  const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

  async function saveProfile() {
    setSavingName(true);
    const supabase = createClient();
    const { error } = await supabase.from("users_profile").update({ full_name: fullName }).eq("id", profile.id);
    setSavingName(false);
    if (error) toast.error("Nu am putut salva modificarile.");
    else toast.success("Profilul a fost actualizat.");
  }

  async function lookupCui() {
    if (!biz.cui.trim()) { toast.error("Introdu CUI-ul mai intai."); return; }
    setAnafLoading(true);
    try {
      const res = await fetch("/api/anaf/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cui: biz.cui }),
      });
      const data = await res.json() as { business_name?: string; county?: string; city?: string; address?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "CUI negasit in ANAF.");
      } else {
        setBiz(b => ({
          ...b,
          business_name: data.business_name ?? b.business_name,
          county: data.county ?? b.county,
          city: data.city ?? b.city,
          address: data.address ?? b.address,
        }));
        toast.success("Date completate automat din ANAF.");
      }
    } catch {
      toast.error("Eroare la interogarea ANAF.");
    } finally {
      setAnafLoading(false);
    }
  }

  function saveGeneral() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    if (!biz.business_name.trim()) { toast.error("Denumirea firmei este obligatorie."); return; }
    startGeneralTransition(async () => {
      const result = await updateGeneralSettings(businessId, biz, orderFormat);
      if ("error" in result) toast.error(result.error);
      else toast.success("Setarile au fost salvate.");
    });
  }

  function saveVat() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    const rate = parseFloat(vatRateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error("Cota TVA trebuie sa fie intre 0 si 100."); return; }
    const settings = { ...vat, vat_rate: rate };
    setVat(settings);
    startVatTransition(async () => {
      const result = await updateVatSettings(businessId, settings);
      if ("error" in result) toast.error(result.error);
      else toast.success("Setarile TVA au fost salvate.");
    });
  }

  function saveShipping() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    const threshold = freeThreshold.trim() ? parseFloat(freeThreshold) : null;
    if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
      toast.error("Pragul pentru transport gratuit trebuie sa fie un numar pozitiv.");
      return;
    }
    startShippingTransition(async () => {
      const result = await updateShippingConfig(businessId, {
        shipping_enabled: shippingEnabled,
        free_shipping_threshold: threshold,
        shipping_zones: shippingZones,
      });
      if ("error" in result) toast.error(result.error);
      else toast.success("Setarile de livrare au fost salvate.");
    });
  }

  async function sendTestEmail() {
    const emailToTest = notif.notification_email.trim() || email;
    setTestEmailLoading(true);
    setTestEmailResult(null);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToTest }),
      });
      const data = await res.json() as {
        success?: boolean; message_id?: string; from?: string; to?: string;
        error?: string; api_key_prefix?: string;
      };
      if (data.success) {
        setTestEmailResult({
          ok: true,
          message: `Email trimis cu succes catre ${data.to}`,
          details: `De la: ${data.from} | ID mesaj: ${data.message_id}`,
        });
      } else {
        setTestEmailResult({
          ok: false,
          message: data.error ?? "Eroare necunoscuta",
          details: data.api_key_prefix ? `Cheie API: ${data.api_key_prefix} | De la: ${data.from} | Catre: ${data.to}` : undefined,
        });
      }
    } catch (err) {
      setTestEmailResult({ ok: false, message: `Eroare retea: ${String(err)}` });
    } finally {
      setTestEmailLoading(false);
    }
  }

  function saveNotifications() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    if (!notif.notification_email.trim()) { toast.error("Adresa de email este obligatorie."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notif.notification_email.trim())) {
      toast.error("Adresa de email nu este valida.");
      return;
    }
    startNotifTransition(async () => {
      const result = await updateNotificationsSettings(businessId, notif);
      if ("error" in result) toast.error(result.error);
      else toast.success("Setarile de notificari au fost salvate.");
    });
  }

  function saveSmso() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    if (smso.enabled && !smso.api_key.trim()) { toast.error("Cheia API SMSO este obligatorie."); return; }
    if (smso.enabled && !smso.sender_id.trim()) { toast.error("Sender ID este obligatoriu."); return; }
    startSmsoTransition(async () => {
      const result = await updateSmsoConfig(businessId, smso);
      if ("error" in result) toast.error(result.error);
      else toast.success("Integrarea SMSO a fost salvata.");
    });
  }

  async function sendTestSms() {
    if (!testSmsPhone.trim()) { toast.error("Introdu un numar de telefon pentru test."); return; }
    setTestSmsLoading(true);
    setTestSmsResult(null);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: smso.api_key, sender_id: smso.sender_id, phone: testSmsPhone }),
      });
      const data = await res.json() as { success?: boolean; responseToken?: string; transaction_cost?: number; to?: string; error?: string };
      if (data.success) {
        setTestSmsResult({ ok: true, message: `SMS trimis cu succes catre ${data.to}`, details: `Cost: ${data.transaction_cost ?? "-"} | Token: ${data.responseToken}` });
      } else {
        setTestSmsResult({ ok: false, message: data.error ?? "Eroare necunoscuta" });
      }
    } catch (err) {
      setTestSmsResult({ ok: false, message: `Eroare retea: ${String(err)}` });
    } finally {
      setTestSmsLoading(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) { toast.error("Parolele nu coincid."); return; }
    if (newPassword.length < 8) { toast.error("Parola trebuie sa aiba cel putin 8 caractere."); return; }
    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) toast.error("Nu am putut schimba parola.");
    else {
      toast.success("Parola a fost schimbata cu succes.");
      setNewPassword(""); setConfirmPassword("");
    }
  }

  async function startEnableMfa() {
    setMfaSending(true);
    const result = await sendMfaOtp();
    setMfaSending(false);
    if ("error" in result) { toast.error(result.error); return; }
    setMfaStep("enabling");
    setMfaCode("");
  }

  async function confirmEnableMfa() {
    if (mfaCode.length < 6) return;
    setMfaVerifying(true);
    const result = await verifyAndEnableMfaEmail(mfaCode);
    setMfaVerifying(false);
    if ("error" in result) { toast.error(result.error); return; }
    toast.success("Autentificarea in doi pasi a fost activata.");
    setMfaEnabled(true); setMfaStep("idle"); setMfaCode("");
  }

  async function startDisableMfa() {
    setMfaSending(true);
    const result = await sendMfaOtp();
    setMfaSending(false);
    if ("error" in result) { toast.error(result.error); return; }
    setMfaStep("disabling");
    setMfaCode("");
  }

  async function confirmDisableMfa() {
    if (mfaCode.length < 6) return;
    setMfaVerifying(true);
    const result = await verifyAndDisableMfaEmail(mfaCode);
    setMfaVerifying(false);
    if ("error" in result) { toast.error(result.error); return; }
    toast.success("Autentificarea in doi pasi a fost dezactivata.");
    setMfaEnabled(false); setMfaStep("idle"); setMfaCode("");
  }

  function savePolicies() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    startPoliciesTransition(async () => {
      const result = await updateStorePolicies(businessId, policies);
      if ("error" in result) toast.error(result.error);
      else toast.success("Politicile au fost salvate.");
    });
  }

  const current = NAV_SECTIONS.find(s => s.id === activeSection)!;

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left nav */}
      <aside className="hidden lg:flex flex-col flex-shrink-0 w-52 border-r border-border py-6">
        <p className="px-4 mb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Setari</p>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-all ${
                activeSection === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile nav */}
      <div className="lg:hidden fixed top-[3.5rem] left-0 right-0 z-10 bg-background border-b border-border px-3 py-2 flex gap-1 overflow-x-auto">
        {NAV_SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeSection === id
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl px-8 py-8 lg:pt-8 pt-16">
          {/* Section heading */}
          <div className="flex items-center gap-2.5 mb-6">
            <current.icon className="h-5 w-5 text-foreground" />
            <h1 className="text-xl font-semibold text-foreground">{current.label}</h1>
          </div>

          {/* ── General ── */}
          {activeSection === "general" && (
            <div className="space-y-4">
              {/* Card 1: Cont */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Contul tau</p>
                </div>
                <div className="px-5 py-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Numele complet</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputCls}
                      placeholder="ex: Ion Popescu"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Adresa de email</label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className={inputCls + " opacity-60 cursor-not-allowed"}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Contactati suportul pentru schimbarea adresei de email.</p>
                  </div>
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={savingName}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-60"
                  >
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingName ? "Se salveaza..." : "Salveaza contul"}
                  </button>
                </div>
              </div>

              {/* Card 2: Datele magazinului */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Datele magazinului</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Apar pe documente, facturi si in footer-ul magazinului.</p>
                </div>
                <div className="px-5 py-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Denumirea firmei <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={biz.business_name}
                      onChange={(e) => setBiz(b => ({ ...b, business_name: e.target.value }))}
                      className={inputCls}
                      placeholder="ex: SC Firma Mea SRL"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Folosita pentru date legale si facturare. Numele afisat in magazin se editeaza din <strong>Editeaza magazinul</strong>.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">CUI / CIF</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={biz.cui}
                        onChange={(e) => setBiz(b => ({ ...b, cui: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: RO12345678"
                      />
                      <button
                        type="button"
                        onClick={lookupCui}
                        disabled={anafLoading || !biz.cui.trim()}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {anafLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        {anafLoading ? "Se cauta..." : "Completeaza automat"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Apare pe facturile emise catre tine. Butonul completeaza automat datele din ANAF.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Adresa</label>
                    <input
                      type="text"
                      value={biz.address}
                      onChange={(e) => setBiz(b => ({ ...b, address: e.target.value }))}
                      className={inputCls}
                      placeholder="ex: Str. Exemplu nr. 10"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Oras</label>
                      <input
                        type="text"
                        value={biz.city}
                        onChange={(e) => setBiz(b => ({ ...b, city: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: Bucuresti"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Judet</label>
                      <input
                        type="text"
                        value={biz.county}
                        onChange={(e) => setBiz(b => ({ ...b, county: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: Ilfov"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Telefon</label>
                      <input
                        type="tel"
                        value={biz.phone}
                        onChange={(e) => setBiz(b => ({ ...b, phone: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: 0722 123 456"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Email contact</label>
                      <input
                        type="email"
                        value={biz.email}
                        onChange={(e) => setBiz(b => ({ ...b, email: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: comenzi@firma.ro"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Formatul comenzilor */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Formatul numarului de comanda</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Alege cum vor fi numerotate comenzile in magazinul tau.</p>
                </div>
                <div className="px-5 py-5 space-y-3">
                  <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    orderFormat === "sequential" ? "border-primary bg-primary/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                  }`}>
                    <input
                      type="radio"
                      name="order_format"
                      value="sequential"
                      checked={orderFormat === "sequential"}
                      onChange={() => setOrderFormat("sequential")}
                      className="mt-0.5 accent-primary flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Hash className="h-4 w-4 text-foreground flex-shrink-0" />
                        <p className="text-sm font-semibold text-foreground">Secvential</p>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">Comenzile primesc numere in ordine crescatoare.</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {["#0001", "#0002", "#0003"].map(n => (
                          <span key={n} className="px-2 py-0.5 bg-muted text-foreground text-xs font-mono rounded">{n}</span>
                        ))}
                      </div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    orderFormat === "random" ? "border-primary bg-primary/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                  }`}>
                    <input
                      type="radio"
                      name="order_format"
                      value="random"
                      checked={orderFormat === "random"}
                      onChange={() => setOrderFormat("random")}
                      className="mt-0.5 accent-primary flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Shuffle className="h-4 w-4 text-foreground flex-shrink-0" />
                        <p className="text-sm font-semibold text-foreground">Random</p>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">Comenzile primesc un cod unic generat aleatoriu.</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {["X8SAD-213F", "A2KMP-991C", "Z7TRQ-445B"].map(n => (
                          <span key={n} className="px-2 py-0.5 bg-muted text-foreground text-xs font-mono rounded">{n}</span>
                        ))}
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={saveGeneral}
                disabled={savingGeneral || !businessId}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-60"
              >
                {savingGeneral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingGeneral ? "Se salveaza..." : "Salveaza setarile generale"}
              </button>
            </div>
          )}

          {/* ── Plan ── */}
          {activeSection === "plan" && (
            <div className="space-y-5">
              {/* Plan curent */}
              <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Plan activ</p>
                  <p className="text-base font-bold text-foreground">{PLAN_LABELS[profile.plan] ?? "Gratuit"}</p>
                  {profile.plan_expires_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Expira pe {new Date(profile.plan_expires_at).toLocaleDateString("ro-RO")}
                    </p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${PLAN_COLORS[profile.plan] ?? PLAN_COLORS.free}`}>
                  {PLAN_LABELS[profile.plan] ?? "Gratuit"}
                </span>
              </div>

              {/* Carduri planuri */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PLANS.map((plan) => {
                  const Icon = plan.icon;
                  const isActive = profile.plan === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col bg-surface border rounded-xl p-5 transition-all ${
                        isActive
                          ? "border-primary ring-2 ring-primary/20"
                          : plan.highlight
                            ? "border-border shadow-sm"
                            : "border-border"
                      }`}
                    >
                      {isActive ? (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold text-white bg-primary rounded-full whitespace-nowrap">
                          Plan activ
                        </span>
                      ) : plan.badge ? (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold text-white bg-foreground rounded-full whitespace-nowrap">
                          {plan.badge}
                        </span>
                      ) : null}

                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-4">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <p className="text-sm font-semibold text-foreground mb-1">{plan.label}</p>
                      <div className="flex items-baseline gap-1 mb-4">
                        <p className="text-2xl font-black text-foreground">{plan.price}</p>
                        <p className="text-sm text-muted-foreground">lei/luna</p>
                      </div>

                      <ul className="space-y-2 mb-6 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isActive ? (
                        <div className="py-2 text-center text-xs font-medium text-primary border border-primary/30 rounded-lg bg-primary/5">
                          Plan activ
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={checkoutLoading === plan.id}
                          onClick={() => startCheckout(plan.id)}
                          className="py-2 text-xs font-semibold text-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                        >
                          {checkoutLoading === plan.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          {checkoutLoading === plan.id ? "Se redirectioneaza..." : `Alege ${plan.label}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Pentru upgrade sau mai multe informatii contactati-ne la{" "}
                <a href="mailto:contact@edinio.ro" className="text-primary font-medium hover:underline">
                  contact@edinio.ro
                </a>
              </p>
            </div>
          )}

          {/* ── Facturare ── */}
          {activeSection === "facturare" && (
            <BillingSection plan={profile.plan} planExpiresAt={profile.plan_expires_at} />
          )}
          {activeSection === "livrare" && (
            <div className="space-y-6">
              {!businessId && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</p>
                </div>
              )}

              {/* Global toggle */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-surface">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Livrare activata</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permite clientilor sa aleaga o metoda de livrare la comanda</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShippingEnabled(v => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${shippingEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${shippingEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* Methods list */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Metode de livrare</p>
                <div className="space-y-2">
                  {SHIPPING_METHODS.map((method) => {
                    const isIntegrated = activeCourierIds.includes(method.id);
                    const zone = shippingZones[method.id] ?? { enabled: false, price: method.defaultPrice };
                    return (
                      <div key={method.id} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${!isIntegrated ? "opacity-50 bg-surface border-border" : zone.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-surface"}`}>
                        {/* Logo or icon */}
                        <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-background border border-border">
                          {method.logo ? (
                            <img src={method.logo} alt={method.label} className="w-6 h-6 object-contain" style={method.filter ? { filter: method.filter } : undefined} />
                          ) : (
                            <Truck className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        {/* Label + not configured hint */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{method.label}</p>
                          {!isIntegrated && method.id !== "own" && method.id !== "pickup" && (
                            <a href="/dashboard/features" className="text-[10px] text-primary hover:underline whitespace-nowrap">
                              Configureaza integrarea
                            </a>
                          )}
                        </div>

                        {/* Price input */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={zone.price}
                            onChange={(e) => {
                              const price = parseFloat(e.target.value) || 0;
                              setShippingZones(z => ({ ...z, [method.id]: { ...zone, price } }));
                            }}
                            disabled={!zone.enabled || !isIntegrated}
                            className="w-20 px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground text-right focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <span className="text-xs text-muted-foreground w-6">lei</span>
                        </div>

                        {/* Toggle */}
                        <button
                          type="button"
                          disabled={!isIntegrated}
                          onClick={() => setShippingZones(z => ({ ...z, [method.id]: { ...zone, enabled: !zone.enabled } }))}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed ${zone.enabled && isIntegrated ? "bg-primary" : "bg-muted-foreground/30"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${zone.enabled && isIntegrated ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Free shipping threshold */}
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Transport gratuit de la</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Clientii nu vor plati livrarea daca comanda depaseste aceasta valoare. Lasa gol pentru a dezactiva.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="ex: 200"
                    value={freeThreshold}
                    onChange={(e) => setFreeThreshold(e.target.value)}
                    className={`${inputCls} w-40`}
                  />
                  <span className="text-sm text-muted-foreground">lei</span>
                </div>
              </div>

              {/* Save button */}
              <div className="flex justify-end">
                <button
                  onClick={saveShipping}
                  disabled={savingShipping || !businessId}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingShipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salveaza
                </button>
              </div>
            </div>
          )}

          {/* ── Taxe / TVA ── */}
          {activeSection === "taxe" && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <Percent className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Daca esti platitor de TVA, activeaza aceasta sectiune. TVA-ul va fi aplicat la totalul comenzii si afisat clientilor. Daca nu esti platitor de TVA, lasa aceasta sectiune dezactivata.
                </p>
              </div>

              {!businessId && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</p>
                </div>
              )}

              {/* Toggle platitor TVA */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Platitor de TVA</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Activeaza daca firma ta este inregistrata ca platitor de TVA</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVat(v => ({ ...v, vat_enabled: !v.vat_enabled }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                      vat.vat_enabled ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      vat.vat_enabled ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {vat.vat_enabled && (
                  <>
                    {/* Cota TVA */}
                    <div className="space-y-3 pt-4 border-t border-border">
                      <label className="block text-sm font-medium text-foreground">Cota TVA (%)</label>
                      <div className="flex gap-2 flex-wrap">
                        {["19", "9", "5"].map(rate => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => { setVat(v => ({ ...v, vat_rate: Number(rate) })); setVatRateInput(rate); }}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                              String(vat.vat_rate) === rate && vatRateInput === rate
                                ? "bg-primary text-white border-primary"
                                : "border-border text-muted-foreground hover:border-primary/40 bg-background"
                            }`}
                          >
                            {rate}%
                          </button>
                        ))}
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={vatRateInput}
                            onChange={e => { setVatRateInput(e.target.value); setVat(v => ({ ...v, vat_rate: parseFloat(e.target.value) || 0 })); }}
                            className={`w-24 px-3 py-2 text-sm border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${
                              !["19", "9", "5"].includes(vatRateInput) ? "border-primary ring-2 ring-primary/20" : "border-border"
                            }`}
                            placeholder="Alta cota"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Preturi cu sau fara TVA */}
                    <div className="space-y-3 pt-4 border-t border-border">
                      <label className="block text-sm font-medium text-foreground">Preturile produselor includ TVA?</label>
                      <p className="text-xs text-muted-foreground">Alege daca preturile introduse in catalog includ deja TVA sau sunt fara TVA.</p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setVat(v => ({ ...v, prices_include_vat: true }))}
                          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold border transition-all ${
                            vat.prices_include_vat
                              ? "bg-primary text-white border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 bg-background"
                          }`}
                        >
                          Da, preturile includ TVA
                        </button>
                        <button
                          type="button"
                          onClick={() => setVat(v => ({ ...v, prices_include_vat: false }))}
                          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold border transition-all ${
                            !vat.prices_include_vat
                              ? "bg-primary text-white border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 bg-background"
                          }`}
                        >
                          Nu, preturile sunt fara TVA
                        </button>
                      </div>
                    </div>

                    {/* Arata defalcarea TVA */}
                    <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Afiseaza defalcarea TVA in cos</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Clientii vor vedea valoarea TVA separat in sumar</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setVat(v => ({ ...v, show_vat_breakdown: !v.show_vat_breakdown }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                          vat.show_vat_breakdown ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          vat.show_vat_breakdown ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Previzualizare */}
              {vat.vat_enabled && (
                <div className="bg-surface border border-border rounded-xl p-5 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Previzualizare cos cumparaturi</p>
                  {(() => {
                    const exPrice = 100;
                    const rate = vat.vat_rate / 100;
                    const vatAmt = vat.prices_include_vat
                      ? exPrice - exPrice / (1 + rate)
                      : exPrice * rate;
                    const total = vat.prices_include_vat ? exPrice : exPrice + vatAmt;
                    return (
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{vat.prices_include_vat ? "100 lei" : "100 lei"}</span>
                        </div>
                        {vat.show_vat_breakdown && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>TVA ({vat.vat_rate}%){vat.prices_include_vat ? " inclus" : ""}</span>
                            <span>{vatAmt.toFixed(2)} lei</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1.5">
                          <span>Total</span>
                          <span>{total.toFixed(2)} lei</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveVat}
                  disabled={savingVat || !businessId}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingVat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingVat ? "Se salveaza..." : "Salveaza setarile TVA"}
                </button>
              </div>
            </div>
          )}
          {activeSection === "domeniu" && <ComingSoon title="Domeniu" />}

          {/* ── Notificari ── */}
          {activeSection === "notificari" && (
            <div className="space-y-6">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                <Bell className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Configureaza pe ce adresa de email primesti notificari despre activitatea magazinului tau. Notificarile sunt trimise in timp real.
                </p>
              </div>

              {!businessId && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</p>
                </div>
              )}

              {/* Email destinatie */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Adresa de email pentru notificari</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Toate notificarile vor fi trimise pe aceasta adresa</p>
                </div>
                <input
                  type="email"
                  value={notif.notification_email}
                  onChange={e => setNotif(n => ({ ...n, notification_email: e.target.value }))}
                  placeholder={email}
                  className={inputCls}
                  disabled={!businessId}
                />
              </div>

              {/* Evenimente */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-0 divide-y divide-border">
                <p className="text-sm font-semibold text-foreground pb-4">Evenimente</p>

                {/* Comanda noua */}
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Comanda noua</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Primesti un email imediat cand un client plaseaza o comanda</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotif(n => ({ ...n, new_order: !n.new_order }))}
                    disabled={!businessId}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
                      notif.new_order ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      notif.new_order ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

              </div>

              {/* Test email */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Testeaza notificarile</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Trimite un email de test la adresa configurata mai sus pentru a verifica ca totul functioneaza
                  </p>
                </div>

                {testEmailResult && (
                  <div className={`rounded-lg p-3 text-sm space-y-1 ${
                    testEmailResult.ok
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-red-50 border border-red-200 text-red-800"
                  }`}>
                    <p className="font-semibold">{testEmailResult.ok ? "Succes" : "Eroare"}: {testEmailResult.message}</p>
                    {testEmailResult.details && (
                      <p className="text-xs opacity-80 font-mono">{testEmailResult.details}</p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={testEmailLoading || !businessId}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testEmailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  {testEmailLoading ? "Se trimite..." : "Trimite email de test"}
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveNotifications}
                  disabled={savingNotif || !businessId}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingNotif ? "Se salveaza..." : "Salveaza notificarile"}
                </button>
              </div>
            </div>
          )}

          {/* ── Politici ── */}
          {activeSection === "politici" && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Conform legislatiei romane, esti obligat sa afisezi aceste politici. Ele vor aparea in footer-ul magazinului tau. Politicile dezactivate nu vor fi vizibile clientilor.
                </p>
              </div>

              {!businessId && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</p>
                </div>
              )}

              <div className="space-y-3">
                {POLICIES.map(({ key, label, placeholder }) => {
                  const entry = policies[key] ?? { content: "", enabled: true };
                  const isEnabled = entry.enabled;
                  return (
                    <div key={key} className="bg-surface border border-border rounded-xl overflow-hidden">
                      {/* Card header with toggle */}
                      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isEnabled
                            ? <Eye className="h-4 w-4 text-primary flex-shrink-0" />
                            : <EyeOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          }
                          <p className={`text-sm font-semibold ${isEnabled ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
                          {!isEnabled && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground rounded">
                              Dezactivata
                            </span>
                          )}
                        </div>
                        {/* Toggle */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          disabled={!businessId}
                          onClick={() => setPolicies(p => ({
                            ...p,
                            [key]: { ...entry, enabled: !isEnabled },
                          }))}
                          className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none flex-shrink-0 disabled:opacity-40 ${
                            isEnabled ? "bg-primary" : "bg-muted-foreground/30"
                          }`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            isEnabled ? "translate-x-4" : "translate-x-0"
                          }`} />
                        </button>
                      </div>

                      {/* Editor - hidden when disabled */}
                      {isEnabled && (
                        <div className="p-4">
                          <RichTextEditor
                            content={entry.content}
                            onChange={(html) => setPolicies(p => ({
                              ...p,
                              [key]: { ...entry, content: html },
                            }))}
                            disabled={!businessId}
                            placeholder={placeholder}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={savePolicies}
                disabled={savingPolicies || !businessId}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-60"
              >
                {savingPolicies ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingPolicies ? "Se salveaza..." : "Salveaza politicile"}
              </button>
            </div>
          )}

          {/* ── Securitate ── */}
          {activeSection === "securitate" && (
            <div className="space-y-4">
              {/* Schimba parola */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Schimba parola</p>
                </div>
                <div className="px-5 py-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Parola noua</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={inputCls}
                      placeholder="Minim 8 caractere"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Confirma parola noua</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={savingPassword || !newPassword || !confirmPassword}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-60"
                  >
                    {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                    {savingPassword ? "Se schimba..." : "Schimba parola"}
                  </button>
                </div>
              </div>

              {/* 2FA */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Autentificare in doi pasi (2FA)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">La autentificare vei primi un cod de verificare pe email.</p>
                  </div>
                  {mfaEnabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-green-700 bg-green-100 rounded-full border border-green-200 flex-shrink-0">
                      <ShieldCheck className="h-3 w-3" />Activ
                    </span>
                  )}
                </div>

                <div className="px-5 py-5">
                  {/* Disabled — idle */}
                  {!mfaEnabled && mfaStep === "idle" && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                        <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          La fiecare autentificare vei primi un cod de 6 cifre pe adresa <strong className="text-foreground">{email}</strong>. Introduce-l pentru a confirma ca esti tu.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void startEnableMfa()}
                        disabled={mfaSending}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
                      >
                        {mfaSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {mfaSending ? "Se trimite codul..." : "Activeaza 2FA"}
                      </button>
                    </div>
                  )}

                  {/* Enabling — enter code sent to email */}
                  {mfaStep === "enabling" && (
                    <div className="space-y-4">
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-foreground leading-relaxed">
                        Am trimis un cod de verificare la <strong>{email}</strong>. Introdu-l mai jos pentru a activa 2FA.
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">Cod de verificare</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          autoFocus
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => { if (e.key === "Enter") void confirmEnableMfa(); }}
                          placeholder="000000"
                          className={`${inputCls} w-36 text-center text-lg font-mono tracking-widest`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmEnableMfa()}
                          disabled={mfaVerifying || mfaCode.length < 6}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
                        >
                          {mfaVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Verifica si activeaza
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMfaStep("idle"); setMfaCode(""); }}
                          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          Anuleaza
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Enabled — idle */}
                  {mfaEnabled && mfaStep === "idle" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 rounded-xl border border-green-200 bg-green-50">
                        <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <p className="text-sm text-green-800 leading-relaxed">
                          Contul tau este protejat. La autentificare vei primi un cod pe adresa <strong>{email}</strong>.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void startDisableMfa()}
                        disabled={mfaSending}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-60"
                      >
                        {mfaSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                        {mfaSending ? "Se trimite codul..." : "Dezactiveaza 2FA"}
                      </button>
                    </div>
                  )}

                  {/* Disabling — enter code sent to email */}
                  {mfaEnabled && mfaStep === "disabling" && (
                    <div className="space-y-4">
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 leading-relaxed">
                        Am trimis un cod de verificare la <strong>{email}</strong>. Introdu-l mai jos pentru a dezactiva 2FA.
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">Cod de verificare</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          autoFocus
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => { if (e.key === "Enter") void confirmDisableMfa(); }}
                          placeholder="000000"
                          className={`${inputCls} w-36 text-center text-lg font-mono tracking-widest`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmDisableMfa()}
                          disabled={mfaVerifying || mfaCode.length < 6}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors disabled:opacity-60"
                        >
                          {mfaVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                          Confirma dezactivarea
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMfaStep("idle"); setMfaCode(""); }}
                          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          Anuleaza
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Zona periculoasa */}
              <div className="bg-surface border border-destructive/30 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-destructive/20">
                  <p className="text-sm font-semibold text-destructive">Zona periculoasa</p>
                </div>
                <div className="px-5 py-5 space-y-4">
                  {!showDeleteConfirm ? (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Sterge contul</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Aceasta actiune este ireversibila. Toate datele tale, inclusiv magazinele si comenzile, vor fi sterse definitiv.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors"
                      >
                        Sterge contul
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                        <p className="text-sm font-semibold text-destructive mb-1">Confirma stergerea contului</p>
                        <p className="text-xs text-muted-foreground">
                          Aceasta actiune va sterge permanent contul tau, magazinele, produsele si toate comenzile. Nu poate fi anulata.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          Introdu adresa de email <span className="font-semibold">{email}</span> pentru confirmare
                        </label>
                        <input
                          type="email"
                          value={deleteConfirmEmail}
                          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                          className={inputCls}
                          placeholder={email}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail(""); }}
                          className="px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          Anuleaza
                        </button>
                        <button
                          type="button"
                          disabled={deletingAccount || deleteConfirmEmail !== email}
                          onClick={() => {
                            startDeleteTransition(async () => {
                              const result = await deleteAccount();
                              if (result && "error" in result) toast.error(result.error);
                            });
                          }}
                          className="px-3 py-1.5 text-sm font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {deletingAccount && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {deletingAccount ? "Se sterge..." : "Confirma stergerea"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
