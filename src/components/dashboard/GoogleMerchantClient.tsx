"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ShoppingBag, Globe, Loader2, RefreshCw, Link2, Check, AlertTriangle, X,
  CircleCheck, Clock, CircleX, Settings as SettingsIcon, Plug,
} from "lucide-react";
import {
  startGoogleMerchantOAuth, listMerchantAccounts, selectMerchantAccount,
  disconnectMerchant, setMerchantSettings, queueSyncAll, setCategoryMap,
  type MerchantStatus, type MerchantProductRow,
} from "@/lib/actions/google-merchant.actions";
import { GOOGLE_CATEGORIES } from "@/lib/google-merchant/taxonomy";

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export function GoogleMerchantClient({ businessId, status, products, categories }: {
  businessId: string;
  status: MerchantStatus | null;
  products: MerchantProductRow[];
  categories: string[];
}) {
  const [busy, startBusy] = useTransition();

  // Surface the OAuth callback result.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("gmc");
    if (!p) return;
    if (p === "connected") toast.success("Google Merchant conectat.");
    else if (p === "choose") toast.message("Alege contul Merchant Center.");
    else if (p === "norefresh") toast.error("Reconectează-te și acceptă accesul offline.");
    else if (p === "error") toast.error("Conectarea Google a eșuat. Încearcă din nou.");
    window.history.replaceState({}, "", "/dashboard/features/google-merchant");
  }, []);

  if (!status) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Nu am putut încărca starea. Reîncarcă pagina.</div>;
  }

  // Platform hasn't configured Google OAuth credentials yet.
  if (!status.configured) {
    return (
      <Panel icon={Clock} title="Disponibil în curând">
        Integrarea Google Merchant se activează în curând pentru magazinul tău. Revino mai târziu.
      </Panel>
    );
  }

  // Google requires product links on a claimed domain (edinio.com/slug can't be
  // claimed). We don't block — we warn — so the merchant can connect & demo.
  const domainWarning = !status.hasDomain ? (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-2.5">
      <Globe className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
        Pentru ca produsele să fie aprobate de Google, magazinul are nevoie de un <strong>domeniu propriu</strong> conectat
        (Google nu acceptă listarea pe adresa edinio.com/numele-tău). Te poți conecta și acum, dar produsele nu vor fi
        aprobate până nu adaugi un domeniu. <Link href="/dashboard/settings" className="underline font-medium">Conectează un domeniu</Link>.
      </p>
    </div>
  ) : null;

  let body: React.ReactNode;
  if (!status.connected && status.needsAccount) {
    body = <AccountPicker businessId={businessId} />;
  } else if (!status.connected) {
    body = (
      <Panel icon={ShoppingBag} title="Conectează Google Merchant Center">
        Listează-ți produsele gratuit pe Google (Shopping + free listings) și pregătește campaniile Google Ads.
        Sincronizăm automat produsele, stocul și prețurile.
        <ul className="text-sm text-muted-foreground mt-4 space-y-1.5 text-left max-w-sm mx-auto">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sincronizare produse, stoc și preț</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Statusuri și diagnoză în timp real</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Conectezi propriul cont Merchant Center</li>
        </ul>
        <button
          onClick={() => startBusy(async () => {
            const res = await startGoogleMerchantOAuth(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            window.location.href = res.url;
          })}
          disabled={busy}
          className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-primary rounded-xl hover:opacity-90 transition-all disabled:opacity-60"
        >
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Se deschide Google...</> : <><Plug className="h-4 w-4" /> Conectează Google Merchant</>}
        </button>
      </Panel>
    );
  } else {
    body = <ConnectedDashboard businessId={businessId} status={status} products={products} categories={categories} />;
  }

  return <div className="space-y-4">{domainWarning}{body}</div>;
}

function Panel({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5"><Icon className="h-6 w-6" /></div>
      <h2 className="text-lg font-bold text-foreground mb-2">{title}</h2>
      <div className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">{children}</div>
    </div>
  );
}

function AccountPicker({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    listMerchantAccounts(businessId).then((res) => {
      setAccounts("error" in res ? [] : res.accounts);
      setLoading(false);
      if ("error" in res) toast.error(res.error);
    });
  }, [businessId]);

  function pick(accountId: string, name?: string) {
    startSave(async () => {
      const res = await selectMerchantAccount(businessId, accountId.trim(), name);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Cont Merchant Center conectat.");
      router.refresh();
    });
  }

  return (
    <Panel icon={ShoppingBag} title="Alege contul Merchant Center">
      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="mt-4 space-y-2 text-left max-w-sm mx-auto">
          {(accounts ?? []).map((a) => (
            <button key={a.id} onClick={() => pick(a.id, a.name)} disabled={saving}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left disabled:opacity-60">
              <span className="min-w-0"><span className="block text-sm font-medium text-foreground truncate">{a.name || `Cont ${a.id}`}</span><span className="block text-xs text-muted-foreground">ID: {a.id}</span></span>
              <Link2 className="h-4 w-4 text-primary shrink-0" />
            </button>
          ))}
          <div className="pt-2">
            <label className="block text-xs font-medium text-foreground mb-1">Sau introdu ID-ul contului manual</label>
            <div className="flex gap-2">
              <input value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} placeholder="ex: 1234567890" className={inputCls} />
              <button onClick={() => manual && pick(manual)} disabled={saving || !manual}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conectează"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ConnectedDashboard({ businessId, status, products, categories }: {
  businessId: string; status: MerchantStatus; products: MerchantProductRow[]; categories: string[];
}) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [savingSettings, startSettings] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [showSettings, setShowSettings] = useState(false);

  const [feedLabel, setFeedLabel] = useState(status.feedLabel);
  const [language, setLanguage] = useState(status.contentLanguage);
  const [country, setCountry] = useState(status.country);
  const [brand, setBrand] = useState(status.brandDefault ?? "");
  const [condition, setCondition] = useState(status.conditionDefault);
  const [autoSync, setAutoSync] = useState(status.autoSync);

  const c = status.counts;

  return (
    <div className="space-y-6">
      {/* Connection banner */}
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-green-100 text-green-600 dark:bg-green-950/40 flex items-center justify-center shrink-0"><CircleCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Conectat la Merchant Center</p>
            <p className="text-xs text-muted-foreground truncate">{status.accountName || `Cont ${status.accountId}`} · {status.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings((s) => !s)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors">
            <SettingsIcon className="h-4 w-4" /> Setări
          </button>
          <button
            onClick={() => startSync(async () => {
              const res = await queueSyncAll(businessId);
              if ("error" in res) { toast.error(res.error); return; }
              toast.success(res.queued > 0 ? `${res.queued} produse adăugate la sincronizare.` : "Niciun produs activ de sincronizat.");
              router.refresh();
            })}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-60">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizează acum
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Produse active" value={c.synced} />
        <Kpi label="Aprobate" value={c.active} accent="#16a34a" icon={CircleCheck} />
        <Kpi label="În așteptare" value={c.pending} accent="#f59e0b" icon={Clock} />
        <Kpi label="Respinse" value={c.disapproved} accent="#ef4444" icon={CircleX} />
      </div>
      {c.queued > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> {c.queued} produse în coada de sincronizare (se procesează automat).</p>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Setări feed</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Feed label"><input value={feedLabel} onChange={(e) => setFeedLabel(e.target.value)} className={inputCls} /></Field>
            <Field label="Limbă"><input value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls} /></Field>
            <Field label="Țară"><input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} /></Field>
            <Field label="Brand implicit"><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="numele magazinului" className={inputCls} /></Field>
            <Field label="Stare produse">
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className={`${inputCls} bg-background`}>
                <option value="new">Nou</option>
                <option value="refurbished">Recondiționat</option>
                <option value="used">Folosit</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 cursor-pointer self-end pb-2.5">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
              <span className="text-sm text-foreground">Sincronizare automată</span>
            </label>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => startSettings(async () => {
                const res = await setMerchantSettings(businessId, { feed_label: feedLabel, content_language: language, country, brand_default: brand, condition_default: condition as "new" | "refurbished" | "used", auto_sync: autoSync });
                if ("error" in res) { toast.error(res.error); return; }
                toast.success("Setări salvate.");
                router.refresh();
              })}
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-60">
              {savingSettings ? <><Loader2 className="h-4 w-4 animate-spin" /> Se salvează...</> : "Salvează setările"}
            </button>
          </div>
        </div>
      )}

      {/* Category mapping */}
      <CategoryMapping businessId={businessId} categories={categories} initialMap={status.categoryMap} />

      {/* Product status table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Produse în Google</h3>
          <span className="text-xs text-muted-foreground">({products.length})</span>
        </div>
        {products.length === 0 ? (
          <div className="py-12 text-center px-4">
            <p className="text-sm text-muted-foreground">Încă niciun produs sincronizat. Apasă pe „Sincronizează acum” ca să trimiți produsele în Google.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {products.map((p) => (
              <div key={p.product_id} className="px-5 py-3 flex items-center gap-3">
                <StatusBadge status={p.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  {p.issues.length > 0 ? (
                    <p className="text-xs text-amber-600 truncate">{p.issues[0]?.description ?? p.issues[0]?.code}</p>
                  ) : p.error ? (
                    <p className="text-xs text-destructive truncate">{p.error}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{p.last_synced_at ? "Sincronizat" : "În coadă"}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disconnect */}
      <div className="flex justify-end">
        <button
          onClick={() => startDisconnect(async () => {
            const res = await disconnectMerchant(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Google Merchant deconectat.");
            router.refresh();
          })}
          disabled={disconnecting}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Deconectează Google Merchant
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, icon: Icon }: { label: string; value: number; accent?: string; icon?: React.ElementType }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={accent ? { backgroundColor: `${accent}1a`, color: accent } : undefined}>
          {Icon ? <Icon className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4 text-muted-foreground" />}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    active: { label: "Aprobat", cls: "bg-green-50 text-green-600 dark:bg-green-950/40", icon: CircleCheck },
    pending: { label: "În așteptare", cls: "bg-amber-50 text-amber-600 dark:bg-amber-950/40", icon: Clock },
    disapproved: { label: "Respins", cls: "bg-red-50 text-red-600 dark:bg-red-950/40", icon: CircleX },
    error: { label: "Eroare", cls: "bg-red-50 text-red-600 dark:bg-red-950/40", icon: AlertTriangle },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 ${s.cls}`}><Icon className="h-3 w-3" /> {s.label}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-foreground mb-1">{label}</label>{children}</div>;
}

function CategoryMapping({ businessId, categories, initialMap }: {
  businessId: string; categories: string[]; initialMap: Record<string, string>;
}) {
  const router = useRouter();
  const [map, setMap] = useState<Record<string, string>>(initialMap);
  const [saving, startSave] = useTransition();
  if (categories.length === 0) return null;

  const mapped = categories.filter((c) => map[c]).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Mapare categorii</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Asociază categoriile tale cu cele Google pentru o listare corectă ({mapped}/{categories.length} mapate).</p>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-3">
            <span className="text-sm text-foreground w-2/5 truncate" title={cat}>{cat}</span>
            <select value={map[cat] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [cat]: e.target.value }))}
              className={`${inputCls} flex-1 bg-background`}>
              <option value="">— alege categoria Google —</option>
              {GOOGLE_CATEGORIES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => startSave(async () => {
            const res = await setCategoryMap(businessId, map);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Mapare salvată. Re-sincronizează pentru a aplica.");
            router.refresh();
          })}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-60">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Se salvează...</> : "Salvează maparea"}
        </button>
      </div>
    </div>
  );
}
