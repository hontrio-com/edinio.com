"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import {
  Loader2, Save, FileText, Settings, Zap, Receipt,
  Truck, Percent, Globe, Bell, Lock, Clock, Hash, Shuffle, Eye, EyeOff,
  Check, Sparkles, Crown, Rocket, Search, MessageSquare, ExternalLink, Phone,
  ShieldCheck, ShieldOff, Mail, CreditCard, Wallet, ArrowUp, ArrowDown, Cookie, BarChart2, Package,
  AlertTriangle, Infinity as InfinityIcon,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { createClient } from "@/lib/supabase/client";
import { updateStorePolicies, updateGeneralSettings, updateVatSettings, updateNotificationsSettings, updateSmsoConfig, updateShippingConfig, updateProfileName, updatePaymentMethods, updateCardDiscount, updateCookieBannerConfig, updatePageContent } from "@/lib/actions/store.actions";
import { type CookieBannerConfig, type CookieBannerPosition, type ConsentCategory } from "@/lib/cookie-consent";
import { PAYMENT_METHOD_DEFAULT_LABELS, type PaymentMethodEntry, type PaymentMethodType, type CardDiscountConfig } from "@/lib/payment-methods";
import { deleteAccount, sendMfaOtp, verifyAndEnableMfaEmail, verifyAndDisableMfaEmail } from "@/lib/actions/auth.actions";
import { BillingSection } from "@/components/dashboard/BillingSection";
import { DomainSection } from "@/components/dashboard/DomainSection";
import type { Database } from "@/types/database.types";
import { buildPolicyTemplates } from "@/lib/policy-templates";
import { PLAN_LABELS, PLAN_PRICES, type BillingInterval, getAnnualPrice, getAnnualMonthlyEquivalent, ANNUAL_FREE_MONTHS } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";
import { SeoImageField } from "@/components/dashboard/SeoImageField";
import { type StoreSeo, SEO_TITLE_MAX, SEO_DESCRIPTION_MAX, SEO_TITLE_IDEAL_MIN, SEO_DESCRIPTION_IDEAL_MIN } from "@/lib/seo";
import { GooglePreview, CharCounter } from "@/components/dashboard/SeoFields";
import { type StoreMode } from "@/lib/storefront/store-mode";

type UserProfile = Database["public"]["Tables"]["users_profile"]["Row"];

type SectionId =
  | "general" | "tip-magazin" | "plan" | "facturare" | "livrare"
  | "taxe" | "plati" | "domeniu" | "seo" | "notificari" | "politici" | "cookies" | "securitate";

const NAV_SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general",    label: "General",     icon: Settings  },
  { id: "tip-magazin", label: "Tip magazin", icon: Package  },
  { id: "plan",       label: "Plan",        icon: Zap       },
  { id: "facturare",  label: "Facturare",   icon: Receipt   },
  { id: "livrare",    label: "Livrare",     icon: Truck     },
  { id: "taxe",       label: "Taxe",        icon: Percent   },
  { id: "plati",      label: "Metode de plata", icon: Wallet },
  { id: "domeniu",    label: "Domeniu",     icon: Globe     },
  { id: "seo",        label: "SEO",         icon: Search    },
  { id: "notificari", label: "Notificari",  icon: Bell      },
  { id: "politici",   label: "Politici",    icon: FileText  },
  { id: "cookies",    label: "Banner Cookies", icon: Cookie },
  { id: "securitate", label: "Securitate",  icon: Lock      },
];

const COOKIE_POSITIONS: { id: CookieBannerPosition; label: string; desc: string }[] = [
  { id: "bottom-bar",   label: "Bara jos (subtil)", desc: "Bara discreta pe toata latimea, jos. Ocupa minim de spatiu." },
  { id: "bottom-left",  label: "Card stanga-jos",   desc: "Card compact in coltul din stanga-jos." },
  { id: "bottom-right", label: "Card dreapta-jos",  desc: "Card compact in coltul din dreapta-jos." },
  { id: "center",       label: "Modal centrat",     desc: "Fereastra centrata cu fundal intunecat. Maxim de vizibilitate." },
];

const PAYMENT_TYPE_NAMES: Record<PaymentMethodType, string> = {
  cash_on_delivery: "Ramburs",
  netopia: "Netopia",
  stripe: "Stripe",
  ipay: "BT iPay",
  klarna: "Klarna",
  revolut: "Revolut",
};

// PLAN_LABELS, PLAN_PRICES imported from @/lib/plans

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground border-border",
  trial: "bg-success/10 text-success border-success/20",
  basic: "bg-info/10 text-info border-info/20",
  premium: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  ultra: "bg-warning/10 text-warning border-warning/20",
};

const PLAN_CARDS = [
  {
    id: "basic",
    label: PLAN_LABELS.basic,
    price: PLAN_PRICES.basic,
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
    label: PLAN_LABELS.premium,
    price: PLAN_PRICES.premium,
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
    label: PLAN_LABELS.ultra,
    price: PLAN_PRICES.ultra,
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
  custom_domain: string | null;
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
  auto_price?: boolean;
  label?: string;
}

interface ShippingConfig {
  shipping_enabled: boolean;
  free_shipping_threshold: number | null;
  min_order_amount: number | null;
  shipping_zones: Record<string, ShippingMethodConfig>;
}

const SHIPPING_METHODS: { id: string; label: string; logo: string; defaultPrice: number; filter?: string }[] = [
  { id: "fan-courier",  label: "Fan Courier",       logo: "/integrations/fan-courier.svg",  defaultPrice: 20 },
  { id: "dpd",          label: "DPD",               logo: "/integrations/dpd.svg",          defaultPrice: 18 },
  { id: "cargus",       label: "Cargus",            logo: "/integrations/cargus.svg",       defaultPrice: 17 },
  { id: "sameday",      label: "Sameday",           logo: "/integrations/sameday.webp",      defaultPrice: 19 },
  { id: "woot",         label: "Woot",              logo: "/integrations/woot.webp",         defaultPrice: 16 },
  { id: "colete",       label: "Colete Online",     logo: "/integrations/colete-online.svg", defaultPrice: 15 },
  { id: "own",          label: "Curier propriu",    logo: "",                               defaultPrice: 10 },
  { id: "pickup",       label: "Ridicare personala", logo: "",                              defaultPrice: 0  },
];

// Placeholder shown in the "display name" field — mirrors the default label the
// checkout uses when no custom name is set (see shipping.actions.ts).
const DEFAULT_CHECKOUT_LABELS: Record<string, string> = {
  "fan-courier": "Livrare prin FAN Courier",
  sameday: "Livrare prin Sameday",
  dpd: "DPD",
  cargus: "Cargus",
  woot: "Woot",
  colete: "Colete Online",
  own: "Curier propriu",
  pickup: "Ridicare personala",
};

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
  paymentMethods: PaymentMethodEntry[];
  paymentReadiness: { netopia: boolean; stripe: boolean; ipay: boolean; klarna: boolean; revolut: boolean };
  cardDiscount: CardDiscountConfig;
  cookieBanner: CookieBannerConfig;
  cookieCategories: ConsentCategory[];
  storeSeo: StoreSeo;
  seoDefaults: { title: string; description: string; ogImage: string | null };
  seoPreviewUrl: string;
  storeMode: StoreMode;
  oneProductId: string | null;
  products: { id: string; name: string }[];
  mfaEmailEnabled: boolean;
  planSuccess?: boolean;
  domainSuccess?: boolean;
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

export function SettingsClient({ profile, email, businessId, businessData, storePolicies, orderNumberFormat, vatSettings, notificationsConfig, smsoConfig, shippingConfig, activeCourierIds, paymentMethods, paymentReadiness, cardDiscount, cookieBanner, cookieCategories, storeSeo, seoDefaults, seoPreviewUrl, storeMode, oneProductId, products, mfaEmailEnabled, planSuccess, domainSuccess }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>(planSuccess ? "plan" : domainSuccess ? "domeniu" : "general");

  useEffect(() => {
    if (planSuccess) {
      toast.success("Plata a fost procesata! Planul tau a fost actualizat.");
    }
    if (domainSuccess) {
      toast.success("Plata a fost procesata! Comanda ta de domeniu a fost inregistrata si va fi activata in maximum 24 de ore.");
    }
  }, [planSuccess, domainSuccess]);

  useEffect(() => {
    if (planSuccess || domainSuccess) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const hashMap: Partial<Record<string, SectionId>> = {
      abonament: "plan",
      facturare: "facturare",
      plan: "plan",
    };
    const mapped = hashMap[hash] ?? (NAV_SECTIONS.some(s => s.id === hash) ? hash as SectionId : null);
    if (mapped) setActiveSection(mapped);
  }, [planSuccess, domainSuccess]);


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
  // Planul si intervalul curent (abonamentele legacy fara interval = lunare).
  const isPaidPlan = profile.plan === "basic" || profile.plan === "premium" || profile.plan === "ultra";
  const currentInterval: BillingInterval = profile.plan_interval === "annual" ? "annual" : "monthly";
  // Toggle-ul porneste pe intervalul curent al clientului platitor (ca planul lui
  // sa apara ca "activ", nu ca invitatie la downgrade); altfel implicit lunar.
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(isPaidPlan ? currentInterval : "monthly");

  async function startCheckout(planId: string) {
    setCheckoutLoading(planId);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId, interval: billingInterval }),
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.error || !data.url) {
      toast.error(data.error ?? "Eroare la initializarea platii.");
      setCheckoutLoading(null);
      return;
    }
    window.location.href = data.url;
  }

  // Policies — inject templates for any empty policy
  const [policies, setPolicies] = useState<PoliciesMap>(() => {
    const parsed = parsePolicies(storePolicies);
    const templates = buildPolicyTemplates({
      businessName: businessData?.business_name ?? null,
      cui:          businessData?.cui ?? null,
      address:      businessData?.address ?? null,
      city:         businessData?.city ?? null,
      county:       businessData?.county ?? null,
      phone:        businessData?.phone ?? null,
      email:        businessData?.email ?? null,
    });
    for (const { key } of POLICIES) {
      if (!parsed[key]?.content?.trim()) {
        parsed[key] = { content: templates[key] ?? "", enabled: true };
      }
    }
    return parsed;
  });
  const [savingPolicies, startPoliciesTransition] = useTransition();

  // VAT
  const [vat, setVat] = useState<VatSettings>(vatSettings);
  const [vatRateInput, setVatRateInput] = useState(String(vatSettings.vat_rate));
  const [savingVat, startVatTransition] = useTransition();

  // Notifications
  const [notif, setNotif] = useState<NotificationsConfig>(notificationsConfig);

  // SEO (Settings > SEO)
  const [seo, setSeo] = useState<StoreSeo>(storeSeo);
  const [savingSeo, startSeoTransition] = useTransition();

  // Store mode (Settings > Tip magazin) — One Product Store toggle + main product
  const [opsEnabled, setOpsEnabled] = useState(storeMode === "one_product");
  const [opsProductId, setOpsProductId] = useState(oneProductId ?? "");
  const [savingOps, startOpsTransition] = useTransition();

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
  const [minOrder, setMinOrder] = useState<string>(
    shippingConfig.min_order_amount != null ? String(shippingConfig.min_order_amount) : ""
  );
  const [shippingZones, setShippingZones] = useState<Record<string, ShippingMethodConfig>>(
    () => buildDefaultZones(shippingConfig.shipping_zones)
  );
  const [savingShipping, startShippingTransition] = useTransition();

  // Mirrors the <Input> primitive so every native input in Settings matches the
  // rest of the dashboard (border-input, transparent bg, focus-visible ring).
  const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

  // Payment methods ("Metode de plata")
  const [methods, setMethods] = useState<PaymentMethodEntry[]>(paymentMethods);
  const [savingMethods, startMethodsTransition] = useTransition();

  function moveMethod(i: number, dir: -1 | 1) {
    setMethods((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function toggleMethod(i: number) {
    setMethods((prev) => {
      const next = prev.map((m, j) => (j === i ? { ...m, enabled: !m.enabled } : m));
      if (!next.some((m) => m.enabled)) {
        toast.error("Trebuie sa ramana cel putin o metoda de plata activa.");
        return prev;
      }
      return next;
    });
  }
  function renameMethod(i: number, label: string) {
    setMethods((prev) => prev.map((m, j) => (j === i ? { ...m, label } : m)));
  }
  function saveMethods() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    startMethodsTransition(async () => {
      const result = await updatePaymentMethods(businessId, methods);
      if ("error" in result) toast.error(result.error);
      else toast.success("Metodele de plata au fost salvate.");
    });
  }

  // Discount la plata cu cardul (Netopia / Stripe / BT iPay) — nu se aplica la ramburs.
  const [cardDisc, setCardDisc] = useState<CardDiscountConfig>(cardDiscount);
  const [savingCardDisc, startCardDiscTransition] = useTransition();
  function saveCardDiscount() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    if (cardDisc.enabled && (!Number.isFinite(cardDisc.value) || cardDisc.value <= 0)) {
      toast.error("Introdu o valoare mai mare ca 0 pentru discount.");
      return;
    }
    if (cardDisc.enabled && cardDisc.type === "percent" && cardDisc.value > 100) {
      toast.error("Procentul nu poate depasi 100%.");
      return;
    }
    startCardDiscTransition(async () => {
      const result = await updateCardDiscount(businessId, cardDisc);
      if ("error" in result) toast.error(result.error);
      else toast.success("Discountul la plata cu cardul a fost salvat.");
    });
  }

  // Banner de cookie-uri (GDPR) — apare automat pe magazin; categoriile se
  // adapteaza la integrarile active. Aici se configureaza doar aparenta.
  const [cookieCfg, setCookieCfg] = useState<CookieBannerConfig>(cookieBanner);
  const [savingCookie, startCookieTransition] = useTransition();
  function saveCookieBanner() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    startCookieTransition(async () => {
      const result = await updateCookieBannerConfig(businessId, cookieCfg);
      if ("error" in result) toast.error(result.error);
      else toast.success("Bannerul de cookie-uri a fost salvat.");
    });
  }

  async function saveProfile() {
    setSavingName(true);
    const result = await updateProfileName(fullName);
    setSavingName(false);
    if ("error" in result) toast.error(result.error);
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
    const minOrderValue = minOrder.trim() ? parseFloat(minOrder) : null;
    if (minOrderValue !== null && (isNaN(minOrderValue) || minOrderValue < 0)) {
      toast.error("Comanda minima trebuie sa fie un numar pozitiv.");
      return;
    }
    startShippingTransition(async () => {
      const result = await updateShippingConfig(businessId, {
        shipping_enabled: shippingEnabled,
        free_shipping_threshold: threshold,
        min_order_amount: minOrderValue,
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

  function saveSeo() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    // Store only meaningful values; empty fields fall back to the auto-derived
    // defaults at render time (see @/lib/seo).
    const cleaned: StoreSeo = {};
    const t = seo.title?.trim();
    const d = seo.description?.trim();
    const og = seo.ogImage?.trim();
    if (t) cleaned.title = t;
    if (d) cleaned.description = d;
    if (og) cleaned.ogImage = og;
    if (seo.noindex) cleaned.noindex = true;
    startSeoTransition(async () => {
      const result = await updatePageContent(businessId, { seo: cleaned });
      if ("error" in result) toast.error(result.error);
      else toast.success("Setarile SEO au fost salvate.");
    });
  }

  function saveStoreMode() {
    if (!businessId) { toast.error("Nu exista un magazin asociat."); return; }
    if (opsEnabled && !opsProductId) {
      toast.error("Alege produsul principal inainte de a activa modul One Product Store.");
      return;
    }
    startOpsTransition(async () => {
      // updatePageContent merges, so we keep one_product_id even in catalog mode
      // (remembers the choice); parseStoreMode ignores it unless store_mode says so.
      const result = await updatePageContent(businessId, {
        store_mode: opsEnabled ? "one_product" : "catalog",
        one_product_id: opsProductId || null,
      });
      if ("error" in result) toast.error(result.error);
      else toast.success(opsEnabled
        ? "Magazinul afiseaza acum un singur produs."
        : "Magazinul afiseaza catalogul cu toate produsele.");
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
    <div className="flex min-h-[calc(100vh-3.5rem)]">
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

      {/* Content */}
      <main className="flex-1 min-w-0">
        {/* Mobile nav — sticky under the topbar, in normal flow so it respects the
            trial / grace-period banner above the topbar instead of overlapping it. */}
        <div className="lg:hidden sticky top-14 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 flex gap-1 overflow-x-auto">
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

        <div className="max-w-2xl px-8 py-8">
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
                  <Button onClick={saveProfile} disabled={savingName}>
                    {savingName ? <Loader2 className="animate-spin" /> : <Save />}
                    {savingName ? "Se salveaza..." : "Salveaza contul"}
                  </Button>
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
                      <Button type="button" variant="outline" onClick={lookupCui} disabled={anafLoading || !biz.cui.trim()} className="shrink-0 whitespace-nowrap">
                        {anafLoading ? <Loader2 className="animate-spin" /> : <Search />}
                        {anafLoading ? "Se cauta..." : "Completeaza automat"}
                      </Button>
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

              <Button onClick={saveGeneral} disabled={savingGeneral || !businessId}>
                {savingGeneral ? <Loader2 className="animate-spin" /> : <Save />}
                {savingGeneral ? "Se salveaza..." : "Salveaza setarile generale"}
              </Button>
            </div>
          )}

          {/* ── Tip magazin (One Product Store) ── */}
          {activeSection === "tip-magazin" && (
            <div className="space-y-4">
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">One Product Store</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Transforma magazinul intr-o pagina dedicata unui singur produs. Pagina principala devine landing page-ul produsului ales, iar catalogul, categoriile si cautarea sunt ascunse.
                  </p>
                </div>
                <div className="px-5 py-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Afiseaza un singur produs</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cand e activ, vizitatorii ajung direct pe produsul principal.
                      </p>
                    </div>
                    <Switch
                      checked={opsEnabled}
                      disabled={!businessId}
                      onCheckedChange={setOpsEnabled}
                      aria-label="Activeaza One Product Store"
                      className="mt-1 shrink-0"
                    />
                  </div>

                  {products.length === 0 ? (
                    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Nu ai inca niciun produs activ. Adauga un produs din <strong>Produse</strong> ca sa poti activa acest mod.
                      </p>
                    </div>
                  ) : opsEnabled ? (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Produsul principal <span className="text-destructive">*</span>
                      </label>
                      <select
                        value={opsProductId}
                        onChange={(e) => setOpsProductId(e.target.value)}
                        className={inputCls}
                        aria-label="Produsul principal"
                      >
                        <option value="">Alege un produs...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {opsProductId && !products.some((p) => p.id === opsProductId) && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          Produsul selectat anterior nu mai este activ. Alege altul din lista.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        Continutul paginii (descriere, beneficii, FAQ, variante) se editeaza din <strong>Produse</strong>, la produsul ales. Comanda se face direct, fara cos.
                      </p>
                    </div>
                  ) : null}

                  <Button onClick={saveStoreMode} disabled={savingOps || !businessId}>
                    {savingOps ? <Loader2 className="animate-spin" /> : <Save />}
                    {savingOps ? "Se salveaza..." : "Salveaza"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Plan ── */}
          {activeSection === "plan" && (
            <div className="space-y-5">
              {/* Plan curent */}
              <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Plan activ</p>
                  <p className="text-base font-bold text-foreground">
                    {PLAN_LABELS[profile.plan] ?? "Gratuit"}
                    {isPaidPlan && (
                      <span className="text-sm font-medium text-muted-foreground"> · plata {currentInterval === "annual" ? "anuala" : "lunara"}</span>
                    )}
                  </p>
                  {profile.plan_expires_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPaidPlan ? "Urmatoarea plata pe " : "Expira pe "}
                      {new Date(profile.plan_expires_at).toLocaleDateString("ro-RO")}
                    </p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${PLAN_BADGE_COLORS[profile.plan] ?? PLAN_BADGE_COLORS.free}`}>
                  {PLAN_LABELS[profile.plan] ?? "Gratuit"}
                </span>
              </div>

              {/* Toggle facturare lunar / anual */}
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setBillingInterval("monthly")}
                    className={`px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                      billingInterval === "monthly" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Lunar
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingInterval("annual")}
                    className={`px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
                      billingInterval === "annual" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Anual
                    <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">
                      {ANNUAL_FREE_MONTHS} luni gratis
                    </span>
                  </button>
                </div>
              </div>

              {/* Carduri planuri */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PLAN_CARDS.map((plan) => {
                  const Icon = plan.icon;
                  const isCurrentTier = profile.plan === plan.id;
                  const isExactCurrent = isCurrentTier && isPaidPlan && billingInterval === currentInterval;
                  const isIntervalSwitch = isCurrentTier && isPaidPlan && billingInterval !== currentInterval;
                  const perMonth = billingInterval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : plan.price;
                  const annualTotal = getAnnualPrice(plan.id);

                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col bg-surface border rounded-xl p-5 transition-all ${
                        isExactCurrent
                          ? "border-primary ring-2 ring-primary/20"
                          : isIntervalSwitch
                            ? "border-primary/40"
                            : plan.highlight
                              ? "border-border shadow-sm"
                              : "border-border"
                      }`}
                    >
                      {isExactCurrent ? (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold text-white bg-primary rounded-full whitespace-nowrap">
                          Plan activ
                        </span>
                      ) : isIntervalSwitch ? (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold text-primary bg-primary/10 border border-primary/30 rounded-full whitespace-nowrap">
                          Planul tau
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
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-black text-foreground">{perMonth}</p>
                          <p className="text-sm text-muted-foreground">lei/luna</p>
                        </div>
                        {billingInterval === "annual" ? (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Facturat anual: {annualTotal} lei.{" "}
                            <span className="text-primary font-semibold">{ANNUAL_FREE_MONTHS} luni gratis</span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground mt-1">Facturat lunar</p>
                        )}
                      </div>

                      <ul className="space-y-2 mb-6 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isExactCurrent ? (
                        <div className="py-2 text-center text-xs font-medium text-primary border border-primary/30 rounded-lg bg-primary/5">
                          Plan activ
                        </div>
                      ) : (
                        <Button type="button" variant={isIntervalSwitch ? "default" : "outline"} className="w-full" disabled={checkoutLoading === plan.id} onClick={() => startCheckout(plan.id)}>
                          {checkoutLoading === plan.id && <Loader2 className="animate-spin" />}
                          {checkoutLoading === plan.id
                            ? "Se redirectioneaza..."
                            : isIntervalSwitch
                              ? (billingInterval === "annual" ? "Treci pe plata anuala" : "Treci pe plata lunara")
                              : `Alege ${plan.label}`}
                        </Button>
                      )}
                      {isIntervalSwitch && billingInterval === "annual" && (
                        <p className="mt-2 text-[11px] text-muted-foreground text-center leading-snug">
                          Creditul din planul curent se aplica automat.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Garantii */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
                  Anulezi oricand, fara costuri
                </span>
                <span className="flex items-center gap-2">
                  <InfinityIcon className="h-4 w-4 text-primary flex-shrink-0" />
                  Pretul tau ramane fix pe viata
                </span>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Pentru upgrade sau mai multe informatii contactati-ne la{" "}
                <a href="mailto:contact@edinio.com" className="text-primary font-medium hover:underline">
                  contact@edinio.com
                </a>
              </p>
            </div>
          )}

          {/* ── Facturare ── */}
          {activeSection === "facturare" && (
            <BillingSection plan={profile.plan as "basic" | "premium" | "ultra" | "trial" | "free"} planExpiresAt={profile.plan_expires_at} interval={currentInterval} paymentFailed={!!profile.payment_failed_at} />
          )}
          {activeSection === "livrare" && (
            <div className="space-y-6">
              {!businessId && (
                <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>
              )}

              {/* Global toggle */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-surface">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Livrare activata</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permite clientilor sa aleaga o metoda de livrare la comanda</p>
                </div>
                <Switch checked={shippingEnabled} onCheckedChange={setShippingEnabled} />
              </div>

              {/* Methods list */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Metode de livrare</p>
                <div className="space-y-2">
                  {SHIPPING_METHODS.map((method) => {
                    const needsIntegration = method.id !== "own" && method.id !== "pickup";
                    const isIntegrated = activeCourierIds.includes(method.id);
                    const canToggle = isIntegrated || !needsIntegration;
                    const zone = shippingZones[method.id] ?? { enabled: false, price: method.defaultPrice };
                    const autoPrice = zone.auto_price ?? true;
                    return (
                      <div key={method.id} className={`rounded-xl border transition-colors ${!canToggle ? "opacity-50 bg-surface border-border" : zone.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-surface"}`}>
                        <div className="flex items-center gap-3 p-3.5">
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
                            {needsIntegration && !isIntegrated && (
                              <a href="/dashboard/features" className="text-[10px] text-primary hover:underline whitespace-nowrap">
                                Configureaza integrarea
                              </a>
                            )}
                          </div>

                          {/* Toggle */}
                          <Switch
                            checked={!!(zone.enabled && canToggle)}
                            disabled={!canToggle}
                            onCheckedChange={(v) => setShippingZones(z => ({ ...z, [method.id]: { ...zone, enabled: v } }))}
                          />
                        </div>

                        {/* Price mode selector — only for enabled couriers with API integration */}
                        {zone.enabled && canToggle && isIntegrated && (
                          <div className="px-3.5 pb-3 space-y-2">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`price-mode-${method.id}`}
                                  checked={autoPrice}
                                  onChange={() => setShippingZones(z => ({ ...z, [method.id]: { ...zone, auto_price: true } }))}
                                  className="accent-primary w-3.5 h-3.5"
                                />
                                <span className="text-xs text-foreground">Pret automat (din contract)</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`price-mode-${method.id}`}
                                  checked={!autoPrice}
                                  onChange={() => setShippingZones(z => ({ ...z, [method.id]: { ...zone, auto_price: false } }))}
                                  className="accent-primary w-3.5 h-3.5"
                                />
                                <span className="text-xs text-foreground">Pret fix</span>
                              </label>
                              {!autoPrice && (
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
                                    className="w-20 px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground text-right focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                                  />
                                  <span className="text-xs text-muted-foreground">lei</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Price input for non-API couriers */}
                        {zone.enabled && canToggle && !isIntegrated && (
                          <div className="px-3.5 pb-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Pret:</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={zone.price}
                                onChange={(e) => {
                                  const price = parseFloat(e.target.value) || 0;
                                  setShippingZones(z => ({ ...z, [method.id]: { ...zone, price } }));
                                }}
                                className="w-20 px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground text-right focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                              />
                              <span className="text-xs text-muted-foreground">lei</span>
                            </div>
                          </div>
                        )}

                        {/* Custom checkout display name — any enabled courier */}
                        {zone.enabled && canToggle && (
                          <div className="px-3.5 pb-3.5">
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Nume afisat la checkout</label>
                            <input
                              type="text"
                              value={zone.label ?? ""}
                              maxLength={60}
                              onChange={(e) => setShippingZones(z => ({ ...z, [method.id]: { ...zone, label: e.target.value } }))}
                              placeholder={DEFAULT_CHECKOUT_LABELS[method.id] ?? "ex: Livrare prin curier"}
                              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Asa apare metoda in formularul de comanda. Lasa gol pentru numele implicit.</p>
                          </div>
                        )}
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

              {/* Minimum order value */}
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Comanda minima</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Valoarea minima a produselor pentru a putea plasa o comanda. Clientii nu vor putea finaliza comanda sub aceasta suma. Lasa gol pentru a dezactiva.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="ex: 50"
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                    className={`${inputCls} w-40`}
                  />
                  <span className="text-sm text-muted-foreground">lei</span>
                </div>
              </div>

              {/* Save button */}
              <div className="flex justify-end">
                <Button size="lg" onClick={saveShipping} disabled={savingShipping || !businessId}>
                  {savingShipping ? <Loader2 className="animate-spin" /> : <Save />}
                  Salveaza
                </Button>
              </div>
            </div>
          )}

          {/* ── Taxe / TVA ── */}
          {activeSection === "taxe" && (
            <div className="space-y-6">
              <Callout variant="warning" icon={Percent}>
                Daca esti platitor de TVA, activeaza aceasta sectiune. TVA-ul va fi aplicat la totalul comenzii si afisat clientilor. Daca nu esti platitor de TVA, lasa aceasta sectiune dezactivata.
              </Callout>

              {!businessId && (
                <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>
              )}

              {/* Toggle platitor TVA */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Platitor de TVA</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Activeaza daca firma ta este inregistrata ca platitor de TVA</p>
                  </div>
                  <Switch checked={vat.vat_enabled} onCheckedChange={(v) => setVat(prev => ({ ...prev, vat_enabled: v }))} />
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
                      <Switch checked={vat.show_vat_breakdown} onCheckedChange={(v) => setVat(prev => ({ ...prev, show_vat_breakdown: v }))} />
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
                <Button size="lg" onClick={saveVat} disabled={savingVat || !businessId}>
                  {savingVat ? <Loader2 className="animate-spin" /> : <Save />}
                  {savingVat ? "Se salveaza..." : "Salveaza setarile TVA"}
                </Button>
              </div>
            </div>
          )}
          {activeSection === "cookies" && (
            <div className="space-y-6">
              <Callout variant="info" icon={Cookie}>
                Bannerul de cookie-uri este obligatoriu prin lege (GDPR). Apare automat pe magazinul tau, in culoarea magazinului, si cere acordul vizitatorilor inainte de a incarca instrumentele de analiza si marketing. Continutul se actualizeaza singur dupa integrarile pe care le ai active.
              </Callout>

              {!businessId && (
                <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>
              )}

              {/* Activare banner */}
              <div className="bg-surface border border-border rounded-xl p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Afiseaza bannerul de cookie-uri</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Recomandat sa ramana activ pentru conformitate legala.</p>
                  </div>
                  <Switch checked={cookieCfg.enabled} onCheckedChange={(v) => setCookieCfg(c => ({ ...c, enabled: v }))} />
                </div>
              </div>

              {!cookieCfg.enabled && cookieCategories.length > 0 && (
                <Callout variant="warning" icon={AlertTriangle} title="Instrumentele de marketing se incarca fara consimtamant">
                  Cu bannerul dezactivat, pixelii (Facebook, TikTok) si Google Analytics se incarca pentru toti vizitatorii, fara sa le ceara acordul. Astfel pixelul e vizibil imediat in Pixel Helper, dar <span className="font-medium">raspunderea conformitatii GDPR iti apartine</span>. Recomandam sa lasi bannerul activ.
                </Callout>
              )}

              {/* Pozitionare */}
              <div className={`bg-surface border border-border rounded-xl p-5 space-y-4 ${cookieCfg.enabled ? "" : "opacity-50 pointer-events-none"}`}>
                <div>
                  <p className="text-sm font-semibold text-foreground">Pozitionare</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Unde apare bannerul pe magazin.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {COOKIE_POSITIONS.map(pos => {
                    const active = cookieCfg.position === pos.id;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setCookieCfg(c => ({ ...c, position: pos.id }))}
                        className={`text-left p-3.5 rounded-xl border transition-all ${active ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border hover:border-primary/40 bg-background"}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">{pos.label}</span>
                          {active && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">{pos.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Categorii detectate automat */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Categorii afisate in banner</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Se adapteaza automat la integrarile active. Nu trebuie sa configurezi nimic aici.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Esentiale (mereu active)
                  </span>
                  {cookieCategories.includes("analytics") && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground">
                      <BarChart2 className="h-3.5 w-3.5 text-info" /> Analiza (Google)
                    </span>
                  )}
                  {cookieCategories.includes("marketing") && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground">
                      <Zap className="h-3.5 w-3.5 text-purple-500" /> Marketing (Facebook, TikTok)
                    </span>
                  )}
                </div>
                {cookieCategories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Momentan nu ai integrari de analiza sau marketing active, asa ca bannerul informeaza doar despre cookie-urile esentiale. Cand activezi Facebook Pixel, TikTok Pixel sau Google Analytics din <span className="font-medium text-foreground">Functii</span>, categoriile apar automat aici si in banner.
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button size="lg" onClick={saveCookieBanner} disabled={savingCookie || !businessId}>
                  {savingCookie ? <Loader2 className="animate-spin" /> : <Save />}
                  {savingCookie ? "Se salveaza..." : "Salveaza bannerul"}
                </Button>
              </div>
            </div>
          )}
          {activeSection === "plati" && (
            <div className="space-y-4">
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Metode de plata</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Activeaza, reordoneaza si redenumeste metodele afisate clientilor in formularul de comanda.
                    Ramburs la curier este activ implicit. Cand integrezi Netopia, Stripe sau BT iPay din Integrari, apar automat si aici.
                  </p>
                </div>
                <div className="px-5 py-5 space-y-3">
                  {methods.map((m, i) => {
                    const isCod = m.type === "cash_on_delivery";
                    const ready = isCod || paymentReadiness[m.type as "netopia" | "stripe" | "ipay" | "klarna" | "revolut"];
                    return (
                      <div key={m.type} className="border border-border rounded-xl p-3 flex items-start gap-3">
                        <div className="flex flex-col gap-1 pt-1 flex-shrink-0">
                          <button type="button" onClick={() => moveMethod(i, -1)} disabled={i === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Muta mai sus">
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => moveMethod(i, 1)} disabled={i === methods.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Muta mai jos">
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {isCod ? <Wallet className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                            <span className="text-xs font-semibold text-muted-foreground">{PAYMENT_TYPE_NAMES[m.type]}</span>
                          </div>
                          <input type="text" value={m.label} maxLength={40}
                            onChange={(e) => renameMethod(i, e.target.value)}
                            placeholder={PAYMENT_METHOD_DEFAULT_LABELS[m.type]} className={inputCls} />
                          {!ready && !isCod && (
                            <p className="text-[11px] text-warning mt-1">Neconfigurat. Nu apare la checkout pana nu il configurezi in Integrari.</p>
                          )}
                        </div>
                        <Switch checked={m.enabled} onCheckedChange={() => toggleMethod(i)} className="mt-1 shrink-0" aria-label={m.enabled ? "Dezactiveaza" : "Activeaza"} />
                      </div>
                    );
                  })}
                  <Button onClick={saveMethods} disabled={savingMethods} className="mt-2">
                    {savingMethods ? <Loader2 className="animate-spin" /> : <Save />}
                    Salveaza
                  </Button>
                </div>
              </div>

              {/* Discount la plata cu cardul */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Discount la plata cu cardul</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ofera clientilor o reducere automata cand platesc online cu cardul (Netopia, Stripe sau BT iPay). Nu se aplica la ramburs.
                    </p>
                  </div>
                  <Switch checked={cardDisc.enabled} onCheckedChange={(v) => setCardDisc(c => ({ ...c, enabled: v }))} className="mt-1 shrink-0" aria-label={cardDisc.enabled ? "Dezactiveaza" : "Activeaza"} />
                </div>
                {cardDisc.enabled && (
                  <div className="px-5 py-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tip discount</label>
                      <div className="grid grid-cols-2 gap-2 max-w-sm">
                        <button type="button" onClick={() => setCardDisc(c => ({ ...c, type: "percent" }))}
                          className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${cardDisc.type === "percent" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>
                          Procent (%)
                        </button>
                        <button type="button" onClick={() => setCardDisc(c => ({ ...c, type: "fixed" }))}
                          className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${cardDisc.type === "fixed" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>
                          Suma fixa (lei)
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        {cardDisc.type === "percent" ? "Valoare discount (%)" : "Valoare discount (lei)"}
                      </label>
                      <input
                        type="number" min={0} max={cardDisc.type === "percent" ? 100 : undefined} step="0.01"
                        value={cardDisc.value || ""}
                        onChange={e => setCardDisc(c => ({ ...c, value: Math.max(0, Number(e.target.value) || 0) }))}
                        className={`${inputCls} max-w-[200px]`}
                        placeholder={cardDisc.type === "percent" ? "ex: 5" : "ex: 20"}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {cardDisc.type === "percent"
                          ? "Se aplica la valoarea produselor (fara transport), dupa eventualul cod de reducere."
                          : "Se scade din valoarea produselor (fara transport), dupa eventualul cod de reducere."}
                      </p>
                    </div>
                  </div>
                )}
                <div className="px-5 py-4 border-t border-border">
                  <Button onClick={saveCardDiscount} disabled={savingCardDisc}>
                    {savingCardDisc ? <Loader2 className="animate-spin" /> : <Save />}
                    Salveaza
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "domeniu" && (
            <DomainSection
              businessId={businessId}
              businessName={businessData?.business_name ?? ""}
              phone={businessData?.phone ?? null}
              address={businessData?.address ?? null}
              city={businessData?.city ?? null}
              county={businessData?.county ?? null}
              profileFullName={profile.full_name}
              email={email}
              initialCustomDomain={businessData?.custom_domain ?? null}
            />
          )}

          {/* ── Notificari ── */}
          {activeSection === "seo" && (
            <div className="space-y-6">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                <Search className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Controleaza cum apare pagina principala a magazinului in Google si la distribuirea pe retele sociale. Daca lasi campurile goale, folosim automat numele si descrierea magazinului.
                </p>
              </div>

              {!businessId && (
                <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>
              )}

              <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
                {/* Titlu meta */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold text-foreground">Titlu meta</label>
                    <CharCounter len={(seo.title ?? "").length} idealMin={SEO_TITLE_IDEAL_MIN} max={SEO_TITLE_MAX} />
                  </div>
                  <input
                    value={seo.title ?? ""}
                    onChange={(e) => setSeo(s => ({ ...s, title: e.target.value }))}
                    placeholder={seoDefaults.title}
                    className={inputCls}
                    disabled={!businessId}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Recomandat pana in {SEO_TITLE_MAX} de caractere. Apare ca titlu albastru in Google si in tab-ul browserului.</p>
                </div>

                {/* Descriere meta */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold text-foreground">Descriere meta</label>
                    <CharCounter len={(seo.description ?? "").length} idealMin={SEO_DESCRIPTION_IDEAL_MIN} max={SEO_DESCRIPTION_MAX} />
                  </div>
                  <textarea
                    value={seo.description ?? ""}
                    onChange={(e) => setSeo(s => ({ ...s, description: e.target.value }))}
                    placeholder={seoDefaults.description}
                    rows={3}
                    className={`${inputCls} resize-none`}
                    disabled={!businessId}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Recomandat 150-160 de caractere. Nu schimba direct pozitia, dar creste rata de click.</p>
                </div>

                {/* Previzualizare Google */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Previzualizare in Google</p>
                  <GooglePreview
                    title={seo.title?.trim() || seoDefaults.title}
                    description={seo.description?.trim() || seoDefaults.description}
                    url={seoPreviewUrl}
                  />
                </div>
              </div>

              {/* Imagine la distribuire */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Imagine la distribuire</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Apare cand cineva distribuie magazinul pe Facebook, WhatsApp etc. Daca lipseste, folosim coperta magazinului. Ideal 1200×630px.</p>
                </div>
                <SeoImageField value={seo.ogImage ?? null} onChange={(v) => setSeo(s => ({ ...s, ogImage: v }))} folder="store-og" />
              </div>

              {/* Avansat: noindex */}
              <div className="bg-surface border border-border rounded-xl p-5">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={!!seo.noindex} disabled={!businessId} onChange={(e) => setSeo(s => ({ ...s, noindex: e.target.checked }))} className="w-4 h-4 mt-0.5 rounded accent-green-600" />
                  <span>
                    <span className="block text-sm font-medium text-foreground">Ascunde magazinul din Google (noindex)</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">Optiune avansata. Activeaza doar daca NU vrei ca pagina principala sa apara in motoarele de cautare. Lasa dezactivat pentru SEO normal.</span>
                  </span>
                </label>
              </div>

              <div className="flex justify-end">
                <Button size="lg" onClick={saveSeo} disabled={savingSeo || !businessId}>
                  {savingSeo ? <Loader2 className="animate-spin" /> : <Save />}
                  {savingSeo ? "Se salveaza..." : "Salveaza SEO"}
                </Button>
              </div>
            </div>
          )}

          {activeSection === "notificari" && (
            <div className="space-y-6">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                <Bell className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Configureaza pe ce adresa de email primesti notificari despre activitatea magazinului tau. Notificarile sunt trimise in timp real.
                </p>
              </div>

              {!businessId && (
                <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>
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
                  <Switch checked={notif.new_order} disabled={!businessId} onCheckedChange={(v) => setNotif(n => ({ ...n, new_order: v }))} />
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
                  <div className={`space-y-1 rounded-lg border p-3 text-sm ${
                    testEmailResult.ok
                      ? "border-success/20 bg-success/5 text-success"
                      : "border-destructive/20 bg-destructive/5 text-destructive"
                  }`}>
                    <p className="font-semibold">{testEmailResult.ok ? "Succes" : "Eroare"}: {testEmailResult.message}</p>
                    {testEmailResult.details && (
                      <p className="text-xs opacity-80 font-mono">{testEmailResult.details}</p>
                    )}
                  </div>
                )}

                <Button variant="outline" onClick={sendTestEmail} disabled={testEmailLoading || !businessId}>
                  {testEmailLoading ? <Loader2 className="animate-spin" /> : <Bell />}
                  {testEmailLoading ? "Se trimite..." : "Trimite email de test"}
                </Button>
              </div>

              <div className="flex justify-end">
                <Button size="lg" onClick={saveNotifications} disabled={savingNotif || !businessId}>
                  {savingNotif ? <Loader2 className="animate-spin" /> : <Save />}
                  {savingNotif ? "Se salveaza..." : "Salveaza notificarile"}
                </Button>
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
                <Callout variant="warning">Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.</Callout>
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
                        <Switch
                          checked={isEnabled}
                          disabled={!businessId}
                          onCheckedChange={(v) => setPolicies(p => ({
                            ...p,
                            [key]: { ...entry, enabled: v },
                          }))}
                          className="shrink-0"
                        />
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

              <Button onClick={savePolicies} disabled={savingPolicies || !businessId}>
                {savingPolicies ? <Loader2 className="animate-spin" /> : <Save />}
                {savingPolicies ? "Se salveaza..." : "Salveaza politicile"}
              </Button>
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
                  <Button onClick={changePassword} disabled={savingPassword || !newPassword || !confirmPassword}>
                    {savingPassword && <Loader2 className="animate-spin" />}
                    {savingPassword ? "Se schimba..." : "Schimba parola"}
                  </Button>
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
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
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
                      <Button onClick={() => void startEnableMfa()} disabled={mfaSending}>
                        {mfaSending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                        {mfaSending ? "Se trimite codul..." : "Activeaza 2FA"}
                      </Button>
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
                        <Button onClick={() => void confirmEnableMfa()} disabled={mfaVerifying || mfaCode.length < 6}>
                          {mfaVerifying ? <Loader2 className="animate-spin" /> : <Check />}
                          Verifica si activeaza
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { setMfaStep("idle"); setMfaCode(""); }}>
                          Anuleaza
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Enabled — idle */}
                  {mfaEnabled && mfaStep === "idle" && (
                    <div className="space-y-4">
                      <Callout variant="success" icon={ShieldCheck}>
                        Contul tau este protejat. La autentificare vei primi un cod pe adresa <strong>{email}</strong>.
                      </Callout>
                      <Button variant="destructive" onClick={() => void startDisableMfa()} disabled={mfaSending}>
                        {mfaSending ? <Loader2 className="animate-spin" /> : <ShieldOff />}
                        {mfaSending ? "Se trimite codul..." : "Dezactiveaza 2FA"}
                      </Button>
                    </div>
                  )}

                  {/* Disabling — enter code sent to email */}
                  {mfaEnabled && mfaStep === "disabling" && (
                    <div className="space-y-4">
                      <Callout variant="danger">
                        Am trimis un cod de verificare la <strong>{email}</strong>. Introdu-l mai jos pentru a dezactiva 2FA.
                      </Callout>
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
                        <Button onClick={() => void confirmDisableMfa()} disabled={mfaVerifying || mfaCode.length < 6} className="bg-destructive text-white hover:bg-destructive/90">
                          {mfaVerifying ? <Loader2 className="animate-spin" /> : <ShieldOff />}
                          Confirma dezactivarea
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { setMfaStep("idle"); setMfaCode(""); }}>
                          Anuleaza
                        </Button>
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
                      <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} className="shrink-0">
                        Sterge contul
                      </Button>
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
                        <Button type="button" variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail(""); }}>
                          Anuleaza
                        </Button>
                        <Button
                          size="sm"
                          disabled={deletingAccount || deleteConfirmEmail !== email}
                          onClick={() => {
                            startDeleteTransition(async () => {
                              const result = await deleteAccount();
                              if (result && "error" in result) toast.error(result.error);
                            });
                          }}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          {deletingAccount && <Loader2 className="animate-spin" />}
                          {deletingAccount ? "Se sterge..." : "Confirma stergerea"}
                        </Button>
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
