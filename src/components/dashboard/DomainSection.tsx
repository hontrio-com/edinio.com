"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Search, Globe, Check, X, Loader2, Copy,
  AlertCircle, ShoppingCart, ExternalLink, Clock,
  CheckCircle2, XCircle,
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

type LookupResult = {
  domain: string;
  status: "available" | "unavailable" | "unknown";
  price?: number; // lei/an, period 1
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

// Parse TLD pricing response — handles various Reseller.ro response shapes
function parseTldPricing(data: unknown): Record<string, number> {
  const pricing: Record<string, number> = {};
  if (!data || typeof data !== "object") return pricing;

  const root = data as Record<string, unknown>;
  const p = root.pricing ?? root.tlds ?? root;
  if (!p || typeof p !== "object") return pricing;

  for (const [tld, val] of Object.entries(p as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    const regPrices =
      (v.register as Record<string, number> | undefined) ??
      (v.registration as Record<string, number> | undefined);
    const price = regPrices?.["1"] ?? (v.register_price as number | undefined);
    if (price) pricing[tld.startsWith(".") ? tld : `.${tld}`] = Number(price);
  }
  return pricing;
}

// Parse lookup response
function parseLookupResults(
  data: unknown,
  tldPricing: Record<string, number>
): LookupResult[] {
  let raw: unknown[] = [];
  if (Array.isArray(data)) {
    raw = data;
  } else if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    if (Array.isArray(root.domains)) raw = root.domains;
    else if (root.domains && typeof root.domains === "object") {
      const inner = (root.domains as Record<string, unknown>).domain;
      if (Array.isArray(inner)) raw = inner;
    }
  }

  return raw.map((item) => {
    const d = item as Record<string, unknown>;
    const domain = String(d.domainName ?? d.domain ?? "");
    const available = d.isAvailable === true ||
      String(d.legacyStatus ?? "").toLowerCase() === "available";
    const tld = "." + domain.split(".").slice(1).join(".");
    const price = tldPricing[tld];

    return {
      domain,
      status: available ? "available" : "unavailable",
      price: price ? Number(price) : undefined,
    } as LookupResult;
  });
}

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

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [tldPricing, setTldPricing] = useState<Record<string, number>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Domains list
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);

  // Domain orders
  const [orders, setOrders] = useState<DomainOrder[]>([]);

  // Connected domain
  const [customDomain, setCustomDomain] = useState<string | null>(initialCustomDomain);

  // Buy modal
  const [buyTarget, setBuyTarget] = useState<LookupResult | null>(null);
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

    // Fetch purchased domains
    supabase
      .from("domains")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDomains(data ?? []);
        setLoadingDomains(false);
      });

    // Fetch domain orders
    supabase
      .from("domain_orders")
      .select("id, domain, tld, period, total_price, status, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data ?? []);
      });

    // Fetch currently connected domain
    supabase
      .from("businesses")
      .select("custom_domain")
      .eq("id", businessId)
      .single()
      .then(({ data }) => {
        if (data?.custom_domain) setCustomDomain(data.custom_domain);
      });

    fetch("/api/domains/pricing")
      .then((r) => r.json())
      .then((data: unknown) => setTldPricing(parseTldPricing(data)))
      .catch(() => {});
  }, [businessId]);

  // ── Domain search ─────────────────────────────────────────────────────────────

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const clean = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/\.[a-z]+$/, "");

    if (clean.length < 2) { setResults([]); return; }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/domains/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchTerm: clean }),
        });
        const data = await res.json() as unknown;
        if (!res.ok) {
          const msg = (data as Record<string, unknown>).error as string | undefined;
          const details = (data as Record<string, unknown>).details as string | undefined;
          console.error("[lookup]", msg, details);
          toast.error(msg ?? "Eroare la verificarea disponibilitatii.");
          return;
        }
        setResults(parseLookupResults(data, tldPricing));
      } catch (err) {
        console.error("[lookup] fetch error:", err);
        toast.error("Eroare la verificarea disponibilitatii.");
      } finally {
        setSearching(false);
      }
    }, 700);
  }

  // ── Buy flow ──────────────────────────────────────────────────────────────────

  async function handleBuy() {
    if (!buyTarget || !businessId) return;

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

    setBuying(true);
    try {
      const res = await fetch("/api/domains/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain:       buyTarget.domain,
          regperiod:    buyPeriod,
          businessId,
          pricePerYear: buyTarget.price ?? 0,
          contact:      { ...contact, country: "RO" },
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string; orderId?: string };

      if (!data.success) {
        toast.error(data.error ?? "Comanda nu a putut fi plasata.");
        return;
      }

      toast.success(`Comanda pentru ${buyTarget.domain} a fost plasata! Vei fi notificat cand domeniul este activ.`);
      setBuyTarget(null);

      // Refresh orders list
      const supabase = createClient();
      const { data: fresh } = await supabase
        .from("domain_orders")
        .select("id, domain, tld, period, total_price, status, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      setOrders(fresh ?? []);
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
    } finally {
      setBuying(false);
    }
  }

  // ── Connect external domain ───────────────────────────────────────────────────

  async function handleConnectExternal() {
    if (!externalInput.trim() || !businessId) return;
    setSavingExternal(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("businesses")
      .update({ custom_domain: externalInput.trim() })
      .eq("id", businessId);

    if (error) {
      toast.error("Nu am putut salva domeniul.");
    } else {
      setCustomDomain(externalInput.trim());
      toast.success("Domeniu salvat. Configureaza DNS-ul conform instructiunilor.");
    }
    setSavingExternal(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copiat!")).catch(() => {});
  }

  // Active (non-terminal) orders
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
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="Cauta un domeniu (ex: magazinul-tau)"
              className={cn(inputCls, "pl-10 pr-10")}
              disabled={!businessId}
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search results */}
          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.domain}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border transition-colors",
                    r.status === "available"
                      ? "bg-surface border-border"
                      : "bg-muted/40 border-border opacity-55"
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                      r.status === "available" ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    {r.status === "available" ? (
                      <Check className="h-3 w-3 text-primary" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground font-mono">
                      {r.domain}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        r.status === "available" ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {r.status === "available" ? "Disponibil" : "Indisponibil"}
                    </p>
                  </div>

                  {r.status === "available" && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {r.price && (
                        <span className="text-sm font-semibold text-foreground">
                          {r.price} lei<span className="text-xs font-normal text-muted-foreground">/an</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => { setBuyTarget(r); setBuyPeriod(1); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                      >
                        <ShoppingCart className="h-3 w-3" />
                        Comanda
                      </button>
                    </div>
                  )}
                </div>
              ))}
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
          {!loadingDomains && domains.length === 0 && !results.length && activeOrders.length === 0 && (
            <div className="text-center py-10">
              <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                Nu ai niciun domeniu
              </p>
              <p className="text-xs text-muted-foreground">
                Cauta un domeniu mai sus pentru a-l comanda direct din Edinio.
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
                {/* Table header */}
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
      {buyTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex-shrink-0">
              <p className="text-base font-semibold text-foreground">
                Comanda {buyTarget.domain}
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
                  Dupa plasarea comenzii, domeniul va fi inregistrat si conectat automat
                  la magazinul tau in maximum 24 de ore. Vei primi o notificare cand este activ.
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
                      {buyTarget.price && (
                        <span className="block text-[11px] font-normal opacity-80 mt-0.5">
                          {buyTarget.price * p} lei
                        </span>
                      )}
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
              {buyTarget.price && (
                <div className="flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="text-base font-bold text-foreground">
                    {buyTarget.price * buyPeriod} lei
                  </p>
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setBuyTarget(null)}
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
                    ? "Se plaseaza..."
                    : `Plaseaza comanda${buyTarget.price ? ` — ${buyTarget.price * buyPeriod} lei` : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
