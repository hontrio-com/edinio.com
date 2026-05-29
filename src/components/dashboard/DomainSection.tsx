"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Globe, Loader2, Copy, Check, X,
  AlertCircle, ShoppingCart, ExternalLink, Clock,
  CheckCircle2, XCircle, Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type DomainRow = {
  id: string;
  domain: string;
  status: string;
  expiry_date: string | null;
  auto_renew: boolean;
  source: string;
  created_at: string;
};

type DomainOrder = {
  id: string;
  domain: string;
  tld: string;
  period: number;
  total_price: number;
  status: string;
  created_at: string;
};

type ContactForm = {
  firstname: string;
  lastname: string;
  companyname: string;
  email: string;
  phonenumber: string;
  address1: string;
  city: string;
  state: string;
  postcode: string;
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  businessId: string | null;
  businessName: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  profileFullName: string;
  email: string;
  initialCustomDomain: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 " +
  "focus:ring-primary/20 transition-colors";

function splitName(fullName: string): [string, string] {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0]];
  return [parts[0], parts.slice(1).join(" ")];
}

// Hardcoded TLD pricing (lei/an) — updated manually from reseller panel
const TLD_OPTIONS = [
  { tld: ".ro",  price: 60, label: ".ro" },
  { tld: ".com", price: 99, label: ".com" },
];

const ORDER_STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending:    { label: "In asteptare",  icon: Clock,        color: "bg-amber-50 text-amber-700 border-amber-200" },
  processing: { label: "Se proceseaza", icon: Loader2,      color: "bg-blue-50 text-blue-700 border-blue-200" },
  completed:  { label: "Finalizata",    icon: CheckCircle2, color: "bg-green-50 text-green-700 border-green-200" },
  cancelled:  { label: "Anulata",       icon: XCircle,      color: "bg-red-50 text-red-700 border-red-200" },
  refunded:   { label: "Rambursata",    icon: XCircle,      color: "bg-zinc-50 text-zinc-500 border-zinc-200" },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function DomainSection({
  businessId,
  businessName,
  phone,
  address,
  city,
  county,
  profileFullName,
  email,
  initialCustomDomain,
}: Props) {
  const [tab, setTab] = useState<"buy" | "connect">("buy");

  // Domain search + availability
  const [domainName, setDomainName] = useState("");
  const [selectedTld, setSelectedTld] = useState<typeof TLD_OPTIONS[number] | null>(null);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<Record<string, boolean | null>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Domains list
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);

  // Domain orders
  const [orders, setOrders] = useState<DomainOrder[]>([]);

  // Connected domain
  const [customDomain, setCustomDomain] = useState<string | null>(initialCustomDomain);

  // Buy modal
  const [buyPeriod, setBuyPeriod] = useState(1);
  const [buying, setBuying] = useState(false);
  const [contact, setContact] = useState<ContactForm>(() => {
    const [first, last] = splitName(profileFullName);
    return {
      firstname:   first,
      lastname:    last,
      companyname: businessName,
      email,
      phonenumber: phone?.replace(/\s+/g, "") ?? "",
      address1:    address ?? "",
      city:        city ?? "",
      state:       county ?? "",
      postcode:    "",
    };
  });

  // Connect external domain
  const [externalInput, setExternalInput] = useState("");
  const [savingExternal, setSavingExternal] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!businessId) { setLoadingDomains(false); return; }

    const supabase = createClient();

    supabase
      .from("domains")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDomains(data ?? []);
        setLoadingDomains(false);
      });

    supabase
      .from("domain_orders")
      .select("id, domain, tld, period, total_price, status, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data ?? []);
      });

    supabase
      .from("businesses")
      .select("custom_domain")
      .eq("id", businessId)
      .single()
      .then(({ data }) => {
        if (data?.custom_domain) setCustomDomain(data.custom_domain);
      });
  }, [businessId]);

  // ── Cleaned domain name ────────────────────────────────────────────────────

  const cleanName = domainName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/\.[a-z]+$/, "");

  const isValidName = cleanName.length >= 2;

  // ── Availability check (debounced) ─────────────────────────────────────────

  function handleDomainInput(value: string) {
    setDomainName(value);
    setAvailability({});
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const clean = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/\.[a-z]+$/, "");

    if (clean.length < 2) return;

    searchTimer.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/domains/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchTerm: clean }),
        });
        const data = await res.json() as { domain: string; tld: string; available: boolean | null }[];
        if (Array.isArray(data)) {
          const map: Record<string, boolean | null> = {};
          for (const r of data) map[r.tld] = r.available;
          setAvailability(map);
        }
      } catch {
        // Silent fail — user can still order, admin verifies manually
      } finally {
        setChecking(false);
      }
    }, 800);
  }

  // ── Buy flow ──────────────────────────────────────────────────────────────────

  async function handleBuy() {
    if (!selectedTld || !businessId || !isValidName) return;

    const required: (keyof ContactForm)[] = [
      "firstname", "lastname", "email", "phonenumber",
      "address1", "city", "state", "postcode",
    ];
    for (const f of required) {
      if (!contact[f].trim()) {
        toast.error("Completeaza toate campurile marcate cu *.");
        return;
      }
    }

    const fullDomain = `${cleanName}${selectedTld.tld}`;

    setBuying(true);
    try {
      const res = await fetch("/api/stripe/domain-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain:       fullDomain,
          tld:          selectedTld.tld,
          period:       buyPeriod,
          pricePerYear: selectedTld.price,
          businessId,
          contact:      { ...contact, country: "RO" },
        }),
      });
      const data = await res.json() as { url?: string; error?: string };

      if (!data.url) {
        toast.error(data.error ?? "Nu am putut initia plata.");
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
      setBuying(false);
    }
  }

  // ── Connect external domain ───────────────────────────────────────────────────

  async function handleConnectExternal() {
    if (!externalInput.trim() || !businessId) return;
    setSavingExternal(true);

    try {
      const res = await fetch("/api/domains/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: externalInput.trim(), businessId }),
      });
      const data = await res.json() as { success?: boolean; domain?: string; error?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Nu am putut conecta domeniul.");
      } else {
        setCustomDomain(data.domain ?? externalInput.trim());
        setExternalInput("");
        toast.success("Domeniu conectat cu succes. Configureaza DNS-ul conform instructiunilor.");
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
    }
    setSavingExternal(false);
  }

  async function handleDisconnectDomain() {
    if (!businessId || !customDomain) return;
    setSavingExternal(true);

    try {
      const res = await fetch("/api/domains/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json() as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Nu am putut deconecta domeniul.");
      } else {
        setCustomDomain(null);
        toast.success("Domeniu deconectat.");
      }
    } catch {
      toast.error("Eroare de retea.");
    }
    setSavingExternal(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copiat!")).catch(() => {});
  }

  const activeOrders = orders.filter((o) => o.status === "pending" || o.status === "processing");

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* No business warning */}
      {!businessId && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800">
            Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.
          </p>
        </div>
      )}

      {/* Active domain banner */}
      {customDomain && (
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Domeniu conectat</p>
            <p className="text-sm font-semibold text-primary font-mono">{customDomain}</p>
          </div>
          <a
            href={`https://${customDomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 hover:text-primary transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
          <button
            type="button"
            onClick={handleDisconnectDomain}
            disabled={savingExternal}
            className="flex-shrink-0 hover:text-destructive transition-colors"
            title="Deconecteaza domeniul"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex bg-muted rounded-xl p-1 gap-1">
        {(["buy", "connect"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "buy" ? "Cumpara domeniu" : "Conecteaza domeniu"}
          </button>
        ))}
      </div>

      {/* ── Tab: Cumpara ── */}
      {tab === "buy" && (
        <div className="space-y-4">
          {/* Domain name input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={domainName}
              onChange={(e) => handleDomainInput(e.target.value)}
              placeholder="Cauta un domeniu (ex: magazinul-meu)"
              className={cn(inputCls, "pl-10 pr-10")}
              disabled={!businessId}
            />
            {checking && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {domainName && !isValidName && (
            <p className="text-xs text-destructive -mt-2">Minim 2 caractere (litere, cifre, cratima).</p>
          )}

          {/* TLD options with availability */}
          {isValidName && (
            <div className="space-y-2">
              {TLD_OPTIONS.map((opt) => {
                const avail = availability[opt.tld];
                const isAvailable = avail === true;
                const isUnavailable = avail === false;
                const isUnknown = avail === null || avail === undefined;

                return (
                  <div
                    key={opt.tld}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border transition-colors",
                      isUnavailable
                        ? "bg-muted/40 border-border opacity-55"
                        : "bg-surface border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                        isAvailable ? "bg-primary/10" :
                        isUnavailable ? "bg-muted" : "bg-muted"
                      )}
                    >
                      {checking ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : isAvailable ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : isUnavailable ? (
                        <X className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Globe className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground font-mono">
                        {cleanName}{opt.tld}
                      </p>
                      <p className={cn(
                        "text-xs",
                        isAvailable ? "text-primary" :
                        isUnavailable ? "text-muted-foreground" :
                        checking ? "text-muted-foreground" : "text-muted-foreground"
                      )}>
                        {checking ? "Se verifica..." :
                         isAvailable ? "Disponibil" :
                         isUnavailable ? "Indisponibil" :
                         "Verifica disponibilitatea"}
                      </p>
                    </div>

                    {!isUnavailable && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          {opt.price} lei<span className="text-xs font-normal text-muted-foreground">/an</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedTld(opt); setBuyPeriod(1); }}
                          disabled={checking}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Comanda
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending orders */}
          {activeOrders.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Comenzi in curs</p>
              </div>
              <div className="divide-y divide-border">
                {activeOrders.map((o) => {
                  const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                      <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground font-mono">
                          {o.domain}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {o.period} {o.period === 1 ? "an" : "ani"} &middot; {o.total_price} lei
                          &middot; {new Date(o.created_at).toLocaleDateString("ro-RO")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                          cfg.color
                        )}
                      >
                        <Icon className={cn("h-3 w-3", o.status === "processing" && "animate-spin")} />
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Domeniul va fi activat in maximum 24 de ore de la plasarea comenzii.
                </p>
              </div>
            </div>
          )}

          {/* Owned domains list */}
          {!loadingDomains && domains.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Domeniile tale</p>
              </div>
              <div className="divide-y divide-border">
                {domains.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground font-mono">
                        {d.domain}
                      </p>
                      {d.expiry_date && (
                        <p className="text-xs text-muted-foreground">
                          Expira:{" "}
                          {new Date(d.expiry_date).toLocaleDateString("ro-RO")}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        d.status === "active"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {d.status === "active" ? "Activ" : d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed/cancelled orders history */}
          {orders.filter((o) => o.status !== "pending" && o.status !== "processing").length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Istoric comenzi domenii</p>
              </div>
              <div className="divide-y divide-border">
                {orders
                  .filter((o) => o.status !== "pending" && o.status !== "processing")
                  .map((o) => {
                    const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pending;
                    return (
                      <div key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                        <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground font-mono">{o.domain}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString("ro-RO")}
                          </p>
                        </div>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border", cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loadingDomains && domains.length === 0 && activeOrders.length === 0 && !isValidName && (
            <div className="text-center py-10">
              <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                Nu ai niciun domeniu
              </p>
              <p className="text-xs text-muted-foreground">
                Introdu numele domeniului dorit mai sus pentru a plasa o comanda.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Conecteaza ── */}
      {tab === "connect" && (
        <div className="space-y-5">
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ai deja un domeniu cumparat de la alt registrar? Introdu-l mai jos,
              apoi adauga inregistrarile DNS la registrarul tau.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={externalInput}
              onChange={(e) => setExternalInput(e.target.value)}
              placeholder="ex: magazinul-tau.ro"
              className={cn(inputCls, "flex-1")}
              disabled={!businessId}
            />
            <button
              type="button"
              onClick={handleConnectExternal}
              disabled={!externalInput.trim() || savingExternal || !businessId}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingExternal && <Loader2 className="h-4 w-4 animate-spin" />}
              Salveaza
            </button>
          </div>

          {/* DNS instructions */}
          {customDomain && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">
                  Inregistrari DNS necesare
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Adauga aceste inregistrari la registrarul tau pentru{" "}
                  <span className="font-mono font-semibold">{customDomain}</span>
                </p>
              </div>

              <div className="px-5 py-4 space-y-2">
                <div className="grid grid-cols-[64px_64px_1fr_32px] gap-2 px-3 mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tip</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nume</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Valoare</span>
                </div>
                {[
                  { type: "A",     name: "@",   value: "76.76.21.21" },
                  { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
                ].map((rec) => (
                  <div
                    key={rec.type + rec.name}
                    className="grid grid-cols-[64px_64px_1fr_32px] gap-2 items-center p-3 bg-muted/50 rounded-lg"
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono text-center">
                      {rec.type}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {rec.name}
                    </span>
                    <span className="text-xs font-mono text-foreground truncate">
                      {rec.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(rec.value)}
                      className="flex items-center justify-center hover:text-primary transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Propagarea DNS poate dura pana la 48 de ore. Verifica statusul pe{" "}
                  <a
                    href={`https://dnschecker.org/#A/${customDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    DNSChecker
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Buy modal ── */}
      {selectedTld && isValidName && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex-shrink-0">
              <p className="text-base font-semibold text-foreground font-mono">
                {cleanName}{selectedTld.tld}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Completeaza datele titularului. Domeniul va fi activat in max. 24h.
              </p>
            </div>

            {/* Scrollable body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {/* Info banner */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Dupa finalizarea platii, domeniul va fi inregistrat si conectat automat
                  la magazinul tau in maximum 24 de ore. Plata se proceseaza securizat prin Stripe.
                </p>
              </div>

              {/* Period picker */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">
                  Perioada de inregistrare
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBuyPeriod(p)}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-semibold border transition-all",
                        buyPeriod === p
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 bg-background"
                      )}
                    >
                      {p} {p === 1 ? "an" : "ani"}
                      <span className="block text-[11px] font-normal opacity-80 mt-0.5">
                        {selectedTld.price * p} lei
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact form */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Date titular
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Prenume <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.firstname}
                      onChange={(e) => setContact((c) => ({ ...c, firstname: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Nume <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.lastname}
                      onChange={(e) => setContact((c) => ({ ...c, lastname: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Firma (optional)
                    </label>
                    <input
                      type="text"
                      value={contact.companyname}
                      onChange={(e) => setContact((c) => ({ ...c, companyname: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Email <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Telefon <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="tel"
                      value={contact.phonenumber}
                      onChange={(e) => setContact((c) => ({ ...c, phonenumber: e.target.value }))}
                      className={inputCls}
                      placeholder="07XXXXXXXX"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Adresa <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.address1}
                      onChange={(e) => setContact((c) => ({ ...c, address1: e.target.value }))}
                      className={inputCls}
                      placeholder="Strada, nr."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Oras <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.city}
                      onChange={(e) => setContact((c) => ({ ...c, city: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Judet <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.state}
                      onChange={(e) => setContact((c) => ({ ...c, state: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Cod postal <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.postcode}
                      onChange={(e) => setContact((c) => ({ ...c, postcode: e.target.value }))}
                      className={inputCls}
                      placeholder="ex: 010101"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Tara
                    </label>
                    <input
                      type="text"
                      value="Romania"
                      disabled
                      className={cn(inputCls, "opacity-60 cursor-not-allowed")}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center gap-3 bg-muted/20 flex-shrink-0">
              <div className="flex-shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                <p className="text-base font-bold text-foreground">
                  {selectedTld.price * buyPeriod} lei
                </p>
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedTld(null)}
                  disabled={buying}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Anuleaza
                </button>
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={buying}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
                >
                  {buying && <Loader2 className="h-4 w-4 animate-spin" />}
                  {buying
                    ? "Redirectare la plata..."
                    : `Plateste ${selectedTld.price * buyPeriod} lei`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
