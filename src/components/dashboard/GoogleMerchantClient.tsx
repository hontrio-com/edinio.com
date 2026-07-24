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
  disconnectMerchant, setMerchantSettings, queueSyncAll, setCategoryMap, getMerchantAccountIssues,
  type MerchantStatus, type MerchantProductRow, type MerchantAccountIssueRow,
} from "@/lib/actions/google-merchant.actions";
import { GOOGLE_CATEGORIES } from "@/lib/google-merchant/taxonomy";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { selectCls } from "@/lib/ui";

export function GoogleMerchantClient({ businessId, status, products, categories, available = true }: {
  businessId: string;
  status: MerchantStatus | null;
  products: MerchantProductRow[];
  categories: string[];
  available?: boolean;
}) {
  const [busy, startBusy] = useTransition();

  // Surface the OAuth callback result.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("gmc");
    if (!p) return;
    if (p === "connected") toast.success("Google Merchant conectat.");
    else if (p === "choose") toast.message("Alege contul Merchant Center.");
    else if (p === "norefresh") toast.error("Reconectează-te și acceptă accesul offline.");
    else if (p === "noscope") toast.error("Nu ai acordat permisiunea pentru Google Shopping. Reconectează-te și lasă bifată permisiunea de gestionare a produselor Shopping.");
    else if (p === "error") toast.error("Conectarea Google a eșuat. Încearcă din nou.");
    window.history.replaceState({}, "", "/dashboard/features/google-merchant");
  }, []);

  if (!status) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Nu am putut încărca starea. Reîncarcă pagina.</div>;
  }

  // Not yet live for the public (OAuth verification pending), or platform
  // hasn't configured Google OAuth credentials yet.
  if (!available || !status.configured) {
    return (
      <EmptyState icon={Clock} title="Disponibil în curând">
        Integrarea Google Merchant se activează în curând pentru magazinul tău. Revino mai târziu.
      </EmptyState>
    );
  }

  // Google requires product links on a claimed domain (edinio.com/slug can't be
  // claimed). We don't block — we warn — so the merchant can connect & demo.
  const domainWarning = !status.hasDomain ? (
    <Callout variant="warning" icon={Globe}>
      Pentru ca produsele să fie aprobate de Google, magazinul are nevoie de un <strong>domeniu propriu</strong> conectat
      (Google nu acceptă listarea pe adresa edinio.com/numele-tău). Te poți conecta și acum, dar produsele nu vor fi
      aprobate până nu adaugi un domeniu. <Link href="/dashboard/settings" className="font-medium underline">Conectează un domeniu</Link>.
    </Callout>
  ) : null;

  let body: React.ReactNode;
  if (!status.connected && status.needsAccount) {
    body = <AccountPicker businessId={businessId} />;
  } else if (!status.connected) {
    body = (
      <EmptyState icon={ShoppingBag} title="Conectează Google Merchant Center">
        Listează-ți produsele gratuit pe Google (Shopping + free listings) și pregătește campaniile Google Ads.
        Sincronizăm automat produsele, stocul și prețurile.
        <ul className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Sincronizare produse, stoc și preț</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Statusuri și diagnoză în timp real</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Conectezi propriul cont Merchant Center</li>
        </ul>
        <Button
          size="lg"
          className="mt-6"
          onClick={() => startBusy(async () => {
            const res = await startGoogleMerchantOAuth(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            window.location.href = res.url;
          })}
          disabled={busy}
        >
          {busy ? <><Loader2 className="animate-spin" /> Se deschide Google...</> : <><Plug /> Conectează Google Merchant</>}
        </Button>
      </EmptyState>
    );
  } else {
    body = <ConnectedDashboard businessId={businessId} status={status} products={products} categories={categories} />;
  }

  return <div className="space-y-4">{domainWarning}{body}</div>;
}

function EmptyState({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-6 w-6" /></div>
      <h2 className="mb-2 text-lg font-bold text-foreground">{title}</h2>
      <div className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
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
    <EmptyState icon={ShoppingBag} title="Alege contul Merchant Center">
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="mx-auto mt-4 max-w-sm space-y-2 text-left">
          {(accounts ?? []).map((a) => (
            <button key={a.id} onClick={() => pick(a.id, a.name)} disabled={saving}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{a.name || `Cont ${a.id}`}</span><span className="block text-xs text-muted-foreground">ID: {a.id}</span></span>
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
            </button>
          ))}
          <div className="pt-2">
            <label className="mb-1 block text-xs font-medium text-foreground">Sau introdu ID-ul contului manual</label>
            <div className="flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} placeholder="ex: 1234567890" />
              <Button onClick={() => manual && pick(manual)} disabled={saving || !manual} className="shrink-0">
                {saving ? <Loader2 className="animate-spin" /> : "Conectează"}
              </Button>
            </div>
          </div>
          <div className="mt-1 border-t border-border pt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Primești o eroare de permisiuni (&bdquo;insufficient scopes&rdquo;)? Reconectează contul Google și lasă
              <strong> bifată</strong> permisiunea pentru Google Shopping.
            </p>
            <Button
              variant="outline" size="sm" className="w-full" disabled={saving}
              onClick={() => startSave(async () => {
                const res = await startGoogleMerchantOAuth(businessId);
                if ("error" in res) { toast.error(res.error); return; }
                window.location.href = res.url;
              })}
            >
              <Plug className="h-4 w-4" /> Reconectează contul Google
            </Button>
          </div>
        </div>
      )}
    </EmptyState>
  );
}

function AccountIssuesBanner({ businessId }: { businessId: string }) {
  const [issues, setIssues] = useState<MerchantAccountIssueRow[]>([]);
  useEffect(() => {
    let alive = true;
    getMerchantAccountIssues(businessId).then((rows) => { if (alive) setIssues(rows); });
    return () => { alive = false; };
  }, [businessId]);
  if (issues.length === 0) return null;
  return (
    <Callout variant="warning" icon={AlertTriangle}>
      <p className="font-semibold">Probleme la nivel de cont Merchant Center</p>
      <p className="mt-0.5 text-xs">Acestea pot bloca aprobarea tuturor produselor până le rezolvi în Merchant Center:</p>
      <ul className="mt-2 space-y-1.5">
        {issues.map((i, idx) => (
          <li key={idx} className="text-xs">
            <span className="font-medium">{i.title}</span>
            {i.detail ? ` — ${i.detail}` : ""}
            {i.documentationUri && (
              <> <a href={i.documentationUri} target="_blank" rel="noreferrer" className="font-medium underline">soluție</a></>
            )}
          </li>
        ))}
      </ul>
    </Callout>
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

  // The cron drains the queue asynchronously — poll while items are queued so
  // the counts + product table update without a manual page reload.
  useEffect(() => {
    if (c.queued <= 0) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [c.queued, router]);

  return (
    <div className="space-y-6">
      <AccountIssuesBanner businessId={businessId} />
      {/* Connection banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"><CircleCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Conectat la Merchant Center</p>
            <p className="truncate text-xs text-muted-foreground">{status.accountName || `Cont ${status.accountId}`} · {status.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)}>
            <SettingsIcon /> Setări
          </Button>
          <Button
            onClick={() => startSync(async () => {
              const res = await queueSyncAll(businessId);
              if ("error" in res) { toast.error(res.error); return; }
              toast.success(res.queued > 0 ? `${res.queued} produse adăugate la sincronizare.` : "Niciun produs activ de sincronizat.");
              router.refresh();
            })}
            disabled={syncing}>
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizează acum
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Produse active" value={c.synced} />
        <Kpi label="Aprobate" value={c.active} tone="success" icon={CircleCheck} />
        <Kpi label="În așteptare" value={c.pending} tone="warning" icon={Clock} />
        <Kpi label="Respinse" value={c.disapproved} tone="danger" icon={CircleX} />
      </div>
      {c.queued > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {c.queued} produse în coada de sincronizare (se procesează automat).</p>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Setări feed</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <SettingField label="Feed label"><Input value={feedLabel} onChange={(e) => setFeedLabel(e.target.value)} /></SettingField>
            <SettingField label="Limbă"><Input value={language} onChange={(e) => setLanguage(e.target.value)} /></SettingField>
            <SettingField label="Țară"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></SettingField>
            <SettingField label="Brand implicit"><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="numele magazinului" /></SettingField>
            <SettingField label="Stare produse">
              <select aria-label="Stare produse" value={condition} onChange={(e) => setCondition(e.target.value)} className={selectCls}>
                <option value="new">Nou</option>
                <option value="refurbished">Recondiționat</option>
                <option value="used">Folosit</option>
              </select>
            </SettingField>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5">
              <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="h-4 w-4 accent-primary" />
              <span className="text-sm text-foreground">Sincronizare automată</span>
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={() => startSettings(async () => {
                const res = await setMerchantSettings(businessId, { feed_label: feedLabel, content_language: language, country, brand_default: brand, condition_default: condition as "new" | "refurbished" | "used", auto_sync: autoSync });
                if ("error" in res) { toast.error(res.error); return; }
                toast.success("Setări salvate.");
                router.refresh();
              })}
              disabled={savingSettings}>
              {savingSettings ? <><Loader2 className="animate-spin" /> Se salvează...</> : "Salvează setările"}
            </Button>
          </div>
        </div>
      )}

      {/* Category mapping */}
      <CategoryMapping businessId={businessId} categories={categories} initialMap={status.categoryMap} />

      {/* Product status table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Produse în Google</h3>
          <span className="text-xs text-muted-foreground">({products.length})</span>
        </div>
        {products.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">Încă niciun produs sincronizat. Apasă pe „Sincronizează acum” ca să trimiți produsele în Google.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {products.map((p) => (
              <div key={p.product_id} className="flex items-start gap-3 px-5 py-3">
                <StatusBadge status={p.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  {p.issues.length > 0 ? (
                    <IssueList issues={p.issues} />
                  ) : p.error ? (
                    <p className="truncate text-xs text-destructive">{p.error}</p>
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
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50">
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Deconectează Google Merchant
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: number; tone?: "success" | "warning" | "danger"; icon?: React.ElementType }) {
  const toneCls =
    tone === "success" ? "bg-success/10 text-success"
    : tone === "warning" ? "bg-warning/10 text-warning"
    : tone === "danger" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneCls)}>
          {Icon ? <Icon className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    active: { label: "Aprobat", cls: "bg-success/10 text-success", icon: CircleCheck },
    pending: { label: "În așteptare", cls: "bg-warning/10 text-warning", icon: Clock },
    disapproved: { label: "Respins", cls: "bg-destructive/10 text-destructive", icon: CircleX },
    error: { label: "Eroare", cls: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.icon;
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", s.cls)}><Icon className="h-3 w-3" /> {s.label}</span>;
}

function IssueList({ issues }: { issues: MerchantProductRow["issues"] }) {
  return (
    <ul className="mt-0.5 space-y-1">
      {issues.map((iss, idx) => {
        const sev = String(iss.severity ?? "").toUpperCase();
        const cls = sev === "DISAPPROVED" ? "text-destructive" : sev === "DEMOTED" ? "text-warning" : "text-muted-foreground";
        return (
          <li key={idx} className="text-xs leading-snug">
            <span className={cn("font-medium", cls)}>{iss.description ?? iss.code ?? "Problemă"}</span>
            {iss.detail ? <span className="text-muted-foreground"> — {iss.detail}</span> : null}
            {iss.documentationUri ? <> <a href={iss.documentationUri} target="_blank" rel="noreferrer" className="font-medium text-primary underline">cum rezolv</a></> : null}
          </li>
        );
      })}
    </ul>
  );
}

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-medium text-foreground">{label}</label>{children}</div>;
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
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Mapare categorii</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Asociază categoriile tale cu cele Google pentru o listare corectă ({mapped}/{categories.length} mapate).</p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-3">
            <span className="w-2/5 truncate text-sm text-foreground" title={cat}>{cat}</span>
            <select aria-label={`Categorie Google pentru ${cat}`} value={map[cat] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [cat]: e.target.value }))}
              className={cn(selectCls, "flex-1")}>
              <option value="">— alege categoria Google —</option>
              {GOOGLE_CATEGORIES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => startSave(async () => {
            const res = await setCategoryMap(businessId, map);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Mapare salvată. Re-sincronizează pentru a aplica.");
            router.refresh();
          })}
          disabled={saving}>
          {saving ? <><Loader2 className="animate-spin" /> Se salvează...</> : "Salvează maparea"}
        </Button>
      </div>
    </div>
  );
}
