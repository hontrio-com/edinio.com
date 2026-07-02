"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, Loader2, Plug, Check, CircleCheck, Clock, X, RefreshCw,
  Link2, ExternalLink, Users, MousePointerClick, Eye, Zap, Timer,
  Target, ShoppingCart, BadgeDollarSign, Radio, Globe, FileText,
  Layers, Share2, Monitor, Smartphone, Tablet, Package, ArrowUpRight,
  ArrowDownRight, AlertTriangle,
} from "lucide-react";
import {
  startGoogleAnalyticsOAuth, listGaProperties, selectGaProperty,
  disconnectGoogleAnalytics, setGaTracking, getGaDashboard, getGaRealtime,
  type GaStatus, type GaPropertyGroup, type GaDashboardData, type GaRealtimeData, type GaTotals,
} from "@/lib/actions/google-analytics.actions";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Switch } from "@/components/ui/switch";

/* ─── Romanian labels for GA-reported values ──────────────────────────────── */

const CHANNEL_RO: Record<string, string> = {
  "Direct": "Direct",
  "Organic Search": "Căutare organică",
  "Paid Search": "Căutare plătită",
  "Organic Social": "Social organic",
  "Paid Social": "Social plătit",
  "Organic Shopping": "Shopping organic",
  "Paid Shopping": "Shopping plătit",
  "Organic Video": "Video organic",
  "Paid Video": "Video plătit",
  "Referral": "Referral",
  "Email": "Email",
  "Display": "Display",
  "Affiliates": "Afiliați",
  "Cross-network": "Cross-network",
  "Unassigned": "Nealocat",
};

const DEVICE_RO: Record<string, { label: string; icon: React.ElementType }> = {
  desktop: { label: "Desktop", icon: Monitor },
  mobile: { label: "Mobil", icon: Smartphone },
  tablet: { label: "Tabletă", icon: Tablet },
  "smart tv": { label: "Smart TV", icon: Monitor },
};

const COUNTRY_RO: Record<string, string> = {
  "Romania": "România", "Moldova": "Moldova", "Germany": "Germania", "Italy": "Italia",
  "Spain": "Spania", "France": "Franța", "United Kingdom": "Marea Britanie",
  "United States": "Statele Unite", "Hungary": "Ungaria", "Austria": "Austria",
  "Belgium": "Belgia", "Netherlands": "Olanda", "Poland": "Polonia", "Bulgaria": "Bulgaria",
  "Greece": "Grecia", "Portugal": "Portugalia", "Ireland": "Irlanda", "Switzerland": "Elveția",
  "Sweden": "Suedia", "Denmark": "Danemarca", "Norway": "Norvegia", "Finland": "Finlanda",
  "Czechia": "Cehia", "Slovakia": "Slovacia", "(not set)": "Nespecificat",
};

const PERIODS: { value: 7 | 28 | 90; label: string }[] = [
  { value: 7, label: "7 zile" },
  { value: 28, label: "28 zile" },
  { value: 90, label: "90 zile" },
];

function nr(n: number): string {
  return n.toLocaleString("ro-RO");
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function delta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/* ─── Root component ──────────────────────────────────────────────────────── */

export function GoogleAnalyticsClient({ businessId, status, available = true, initialDashboard, initialRealtime }: {
  businessId: string;
  status: GaStatus | null;
  available?: boolean;
  initialDashboard: GaDashboardData | null;
  initialRealtime: GaRealtimeData | null;
}) {
  const [busy, startBusy] = useTransition();

  // Surface the OAuth callback result.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("ga");
    if (!p) return;
    if (p === "connected") toast.success("Google Analytics conectat.");
    else if (p === "choose") toast.message("Alege proprietatea Google Analytics.");
    else if (p === "norefresh") toast.error("Reconectează-te și acceptă accesul offline.");
    else if (p === "error") toast.error("Conectarea Google a eșuat. Încearcă din nou.");
    window.history.replaceState({}, "", "/dashboard/features/google-analytics");
  }, []);

  if (!status) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Nu am putut încărca starea. Reîncarcă pagina.</div>;
  }

  // Not yet live for the public (OAuth verification pending), or platform
  // hasn't configured Google OAuth credentials yet.
  if (!available || !status.configured) {
    return (
      <EmptyState icon={Clock} title="Disponibil în curând">
        Integrarea Google Analytics se activează în curând pentru magazinul tău. Revino mai târziu.
      </EmptyState>
    );
  }

  if (!status.connected && status.needsProperty) {
    return <PropertyPicker businessId={businessId} />;
  }

  if (!status.connected) {
    return (
      <EmptyState icon={BarChart3} title="Conectează Google Analytics">
        Vezi statisticile magazinului direct în Edinio: vizitatori, surse de trafic, conversii și venituri.
        Măsurarea pornește automat, fără cod.
        <ul className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Tag-ul GA4 se instalează automat pe magazin</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Evenimente e-commerce: vizualizări, coș, achiziții</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Statistici și vizitatori în timp real, aici în dashboard</li>
        </ul>
        <Button
          size="lg"
          className="mt-6"
          onClick={() => startBusy(async () => {
            const res = await startGoogleAnalyticsOAuth(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            window.location.href = res.url;
          })}
          disabled={busy}
        >
          {busy ? <><Loader2 className="animate-spin" /> Se deschide Google...</> : <><Plug /> Conectează Google Analytics</>}
        </Button>
      </EmptyState>
    );
  }

  return (
    <ConnectedDashboard
      businessId={businessId}
      status={status}
      initialDashboard={initialDashboard}
      initialRealtime={initialRealtime}
    />
  );
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

/* ─── Property picker (after OAuth, multiple properties) ──────────────────── */

function PropertyPicker({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [groups, setGroups] = useState<GaPropertyGroup[] | null>(null);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    listGaProperties(businessId).then((res) => {
      setGroups("error" in res ? [] : res.groups);
      setLoading(false);
      if ("error" in res) toast.error(res.error);
    });
  }, [businessId]);

  function pick(propertyId: string, name?: string, account?: string) {
    startSave(async () => {
      const res = await selectGaProperty(businessId, propertyId, name, account);
      if ("error" in res) { toast.error(res.error); return; }
      if (res.measurementId) toast.success("Proprietate conectată. Măsurarea este activă.");
      else toast.message("Proprietate conectată, dar fără flux de date web. Vezi indicațiile de pe pagină.");
      router.refresh();
    });
  }

  return (
    <EmptyState icon={BarChart3} title="Alege proprietatea Google Analytics">
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="mx-auto mt-4 max-w-sm space-y-4 text-left">
          {(groups ?? []).length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Contul Google conectat nu are nicio proprietate GA4. Creează una pe
              {" "}<a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="font-medium underline">analytics.google.com</a>,
              apoi introdu ID-ul mai jos.
            </p>
          )}
          {(groups ?? []).map((g) => (
            <div key={g.account} className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{g.account}</p>
              {g.properties.map((p) => (
                <button key={p.id} onClick={() => pick(p.id, p.name, g.account)} disabled={saving}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{p.name || `Proprietate ${p.id}`}</span><span className="block text-xs text-muted-foreground">ID: {p.id}</span></span>
                  <Link2 className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          ))}
          <div className="pt-2">
            <label className="mb-1 block text-xs font-medium text-foreground">Sau introdu ID-ul proprietății manual</label>
            <div className="flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} placeholder="ex: 123456789" />
              <Button onClick={() => manual && pick(manual)} disabled={saving || !manual} className="shrink-0">
                {saving ? <Loader2 className="animate-spin" /> : "Conectează"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </EmptyState>
  );
}

/* ─── Connected dashboard ─────────────────────────────────────────────────── */

function ConnectedDashboard({ businessId, status, initialDashboard, initialRealtime }: {
  businessId: string;
  status: GaStatus;
  initialDashboard: GaDashboardData | null;
  initialRealtime: GaRealtimeData | null;
}) {
  const router = useRouter();
  const [dash, setDash] = useState<GaDashboardData | null>(initialDashboard);
  const [realtime, setRealtime] = useState<GaRealtimeData | null>(initialRealtime);
  const [period, setPeriod] = useState<7 | 28 | 90>(initialDashboard?.days === 7 || initialDashboard?.days === 90 ? initialDashboard.days : 28);
  const [loadingDash, startDash] = useTransition();
  const [togglingTracking, startTracking] = useTransition();
  const [rescanning, startRescan] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const rtTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadDashboard(days: 7 | 28 | 90, force = false) {
    startDash(async () => {
      const res = await getGaDashboard(businessId, days, force);
      if ("error" in res) { toast.error(res.error); return; }
      setDash(res.data);
    });
  }

  // Realtime auto-refresh (60s, only while the tab is visible).
  useEffect(() => {
    rtTimer.current = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      getGaRealtime(businessId).then((res) => {
        if (!("error" in res)) setRealtime(res.data);
      });
    }, 60_000);
    return () => { if (rtTimer.current) clearInterval(rtTimer.current); };
  }, [businessId]);

  const gaUrl = `https://analytics.google.com/analytics/web/#/p${status.propertyId}`;

  return (
    <div className="space-y-6">
      {/* Connection banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"><CircleCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Conectat la Google Analytics</p>
            <p className="truncate text-xs text-muted-foreground">
              {status.propertyName || `Proprietate ${status.propertyId}`} (ID: {status.propertyId}) · {status.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={gaUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><ExternalLink /> Deschide în GA</Button>
          </a>
          <Button size="sm" onClick={() => loadDashboard(period, true)} disabled={loadingDash}>
            {loadingDash ? <Loader2 className="animate-spin" /> : <RefreshCw />} Actualizează
          </Button>
        </div>
      </div>

      {/* Tracking status */}
      {status.measurementId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Măsurare pe magazin</p>
            <p className="text-xs text-muted-foreground">
              Tag-ul <span className="font-mono font-medium text-foreground">{status.measurementId}</span> se încarcă automat pe magazin
              (după consimțământul cookie) și trimite evenimentele: vizualizare produs, adăugare în coș, checkout, achiziție.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{status.trackingEnabled ? "Activă" : "Oprită"}</span>
            <Switch
              checked={status.trackingEnabled}
              disabled={togglingTracking}
              onCheckedChange={(v) => startTracking(async () => {
                const res = await setGaTracking(businessId, v);
                if ("error" in res) { toast.error(res.error); return; }
                toast.success(v ? "Măsurarea pe magazin este activă." : "Măsurarea pe magazin a fost oprită.");
                router.refresh();
              })}
            />
          </label>
        </div>
      ) : (
        <Callout variant="warning" icon={AlertTriangle}>
          Proprietatea conectată nu are un <strong>flux de date web</strong> (Measurement ID), așa că măsurarea automată nu poate porni.
          Deschide <a href={gaUrl} target="_blank" rel="noreferrer" className="font-medium underline">Google Analytics</a> → Administrare → Fluxuri de date → Adaugă flux web, apoi{" "}
          <button
            className="font-medium underline disabled:opacity-50"
            disabled={rescanning}
            onClick={() => startRescan(async () => {
              const res = await selectGaProperty(businessId, status.propertyId ?? "");
              if ("error" in res) { toast.error(res.error); return; }
              if (res.measurementId) { toast.success("Flux de date găsit. Măsurarea este activă."); router.refresh(); }
              else toast.message("Încă nu am găsit un flux de date web.");
            })}
          >
            caută din nou{rescanning ? "..." : ""}
          </button>.
        </Callout>
      )}

      {/* Realtime */}
      <RealtimeCard realtime={realtime} />

      {/* Period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); loadDashboard(p.value); }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                period === p.value ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {dash && (
          <p className="text-[11px] text-muted-foreground">
            Datele Google Analytics pot avea o întârziere de 24-48h.
          </p>
        )}
      </div>

      {!dash ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          {loadingDash ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">Nu am putut încărca statisticile. Apasă „Actualizează”.</p>
          )}
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", loadingDash && "pointer-events-none opacity-50")}>
          {dash.totals.sessions === 0 && dash.totals.activeUsers === 0 && (
            <Callout variant="info" icon={Clock}>
              Încă nu există date în această perioadă. După activarea măsurării, Google procesează datele în 24-48 de ore.
            </Callout>
          )}

          {/* KPIs */}
          <KpiGrid totals={dash.totals} prev={dash.prevTotals} />

          {/* Timeseries */}
          <TimeseriesChart data={dash.timeseries} />

          {/* Breakdown grids */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard icon={Layers} title="Canale de achiziție"
              rows={dash.channels.map((c) => ({ label: CHANNEL_RO[c.name] ?? c.name, value: c.sessions }))} unit="sesiuni" />
            <BreakdownCard icon={Share2} title="Surse de trafic"
              rows={dash.sources.map((s) => ({ label: s.name === "(direct)" ? "Direct" : s.name, value: s.sessions }))} unit="sesiuni" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard icon={FileText} title="Top pagini" mono
              rows={dash.pages.map((p) => ({ label: p.path, value: p.views }))} unit="afișări" />
            <BreakdownCard icon={Globe} title="Țări"
              rows={dash.countries.map((c) => ({ label: COUNTRY_RO[c.name] ?? c.name, value: c.users }))} unit="utilizatori" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DevicesCard devices={dash.devices} />
            <ProductsCard products={dash.products} />
          </div>
        </div>
      )}

      {/* Disconnect */}
      <div className="flex justify-end">
        <button
          onClick={() => startDisconnect(async () => {
            const res = await disconnectGoogleAnalytics(businessId);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Google Analytics deconectat.");
            router.refresh();
          })}
          disabled={disconnecting}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50">
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Deconectează Google Analytics
        </button>
      </div>
    </div>
  );
}

/* ─── Realtime card ───────────────────────────────────────────────────────── */

function RealtimeCard({ realtime }: { realtime: GaRealtimeData | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
          <Radio className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-success">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          </span>
        </span>
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none text-foreground">{realtime ? nr(realtime.total) : "–"}</p>
          <p className="mt-1 text-xs text-muted-foreground">vizitatori acum pe site (ultimele 30 min)</p>
        </div>
      </div>
      {realtime && realtime.countries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {realtime.countries.slice(0, 3).map((c) => (
            <span key={c.name} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {COUNTRY_RO[c.name] ?? c.name} · {nr(c.users)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── KPI grid ────────────────────────────────────────────────────────────── */

function KpiGrid({ totals, prev }: { totals: GaTotals; prev: GaTotals }) {
  const cards: { label: string; value: string; trend: number | null; icon: React.ElementType }[] = [
    { label: "Utilizatori activi", value: nr(totals.activeUsers), trend: delta(totals.activeUsers, prev.activeUsers), icon: Users },
    { label: "Sesiuni", value: nr(totals.sessions), trend: delta(totals.sessions, prev.sessions), icon: MousePointerClick },
    { label: "Afișări de pagină", value: nr(totals.pageViews), trend: delta(totals.pageViews, prev.pageViews), icon: Eye },
    { label: "Rată de implicare", value: `${(totals.engagementRate * 100).toFixed(1)}%`, trend: delta(totals.engagementRate, prev.engagementRate), icon: Zap },
    { label: "Durată medie sesiune", value: fmtDuration(totals.avgSessionDuration), trend: delta(totals.avgSessionDuration, prev.avgSessionDuration), icon: Timer },
    { label: "Evenimente cheie", value: nr(totals.keyEvents), trend: delta(totals.keyEvents, prev.keyEvents), icon: Target },
    { label: "Tranzacții", value: nr(totals.transactions), trend: delta(totals.transactions, prev.transactions), icon: ShoppingCart },
    { label: "Venit", value: formatPrice(totals.revenue), trend: delta(totals.revenue, prev.revenue), icon: BadgeDollarSign },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-4 w-4" /></span>
            {c.trend !== null && (
              <span className={cn(
                "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                c.trend >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              )}>
                {c.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(c.trend)}%
              </span>
            )}
          </div>
          <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">{c.value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Timeseries chart ────────────────────────────────────────────────────── */

const USERS_COLOR = "#1AB554";
const SESSIONS_COLOR = "#F9AB00";

function TimeseriesChart({ data }: { data: GaDashboardData["timeseries"] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Utilizatori și sesiuni</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: USERS_COLOR }} /> Utilizatori</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SESSIONS_COLOR }} /> Sesiuni</span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="gaUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={USERS_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={USERS_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gaSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SESSIONS_COLOR} stopOpacity={0.2} />
                <stop offset="100%" stopColor={SESSIONS_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <RechartsTooltip content={<SeriesTooltip />} />
            <Area type="monotone" dataKey="sessions" name="Sesiuni" stroke={SESSIONS_COLOR} strokeWidth={2} fill="url(#gaSessions)" />
            <Area type="monotone" dataKey="users" name="Utilizatori" stroke={USERS_COLOR} strokeWidth={2} fill="url(#gaUsers)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SeriesTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.name}: <span className="font-bold text-foreground">{nr(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Breakdown cards ─────────────────────────────────────────────────────── */

function BreakdownCard({ icon: Icon, title, rows, unit, mono }: {
  icon: React.ElementType; title: string; rows: { label: string; value: number }[]; unit: string; mono?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Fără date în această perioadă.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 text-sm">
              <span className={cn("w-2/5 shrink-0 truncate text-muted-foreground", mono && "font-mono text-xs")} title={r.label}>{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total > 0 ? Math.max(2, Math.round((r.value / total) * 100)) : 0}%` }} />
              </div>
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-foreground">{nr(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DevicesCard({ devices }: { devices: { name: string; sessions: number }[] }) {
  const total = devices.reduce((s, d) => s + d.sessions, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Monitor className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Dispozitive</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">sesiuni</span>
      </div>
      {devices.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Fără date în această perioadă.</p>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => {
            const info = DEVICE_RO[d.name.toLowerCase()] ?? { label: d.name, icon: Monitor };
            const DevIcon = info.icon;
            const pctVal = total > 0 ? Math.round((d.sessions / total) * 100) : 0;
            return (
              <div key={d.name} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><DevIcon className="h-4 w-4" /></span>
                <span className="w-20 shrink-0 text-foreground">{info.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pctVal}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground"><span className="font-semibold text-foreground">{nr(d.sessions)}</span> · {pctVal}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductsCard({ products }: { products: { name: string; quantity: number; revenue: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Top produse (după venit)</h3>
      </div>
      {products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Fără achiziții măsurate în această perioadă.</p>
      ) : (
        <div className="divide-y divide-border">
          {products.map((p) => (
            <div key={p.name} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <span className="min-w-0 flex-1 truncate text-foreground" title={p.name}>{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{nr(p.quantity)} buc</span>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-foreground">{formatPrice(p.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
