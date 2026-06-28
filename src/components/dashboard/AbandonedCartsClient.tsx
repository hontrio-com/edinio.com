"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  ShoppingBag, TrendingDown, Percent, RotateCcw, Mail, MessageSquare,
  Clock, Package, Trash2, X, Sparkles, Send, Banknote, ShieldCheck, Bell, Loader2, Lock,
} from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { AbandonedAutomationsTab } from "./AbandonedAutomationsTab";
import {
  setAbandonedCartEnabled, sendAbandonedCartEmail, sendAbandonedCartSms, deleteAbandonedCart,
} from "@/lib/actions/abandoned-cart.actions";
import { standardRecoveryTemplate, interpolateRecoveryMessage } from "@/lib/abandoned-cart";
import type { AbandonedCartsData, AbandonedCartRow } from "@/lib/abandoned-cart";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60000));
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ${h === 1 ? "ora" : "ore"}`;
  const d = Math.floor(h / 24);
  return `acum ${d} ${d === 1 ? "zi" : "zile"}`;
}

export function AbandonedCartsClient({ businessId, data }: { businessId: string; data: AbandonedCartsData | null }) {
  const router = useRouter();
  const [activating, startActivate] = useTransition();
  const [tab, setTab] = useState<"carts" | "automation">("carts");

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
        Nu am putut incarca datele. Reincarca pagina.
      </div>
    );
  }

  // ── Activation gate (opt-in) ─────────────────────────────────────────────────
  if (!data.enabled) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-4 min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-primary/10 text-primary">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Recuperează coșurile abandonate</h1>
        <p className="text-muted-foreground max-w-md mb-8">
          Clienții care încep o comandă dar nu o finalizează sunt vânzări pierdute. Activează funcția
          și începem să salvăm aceste coșuri ca să le poți recupera prin mail sau SMS.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 max-w-2xl w-full mb-8">
          {[
            { icon: TrendingDown, title: "Vezi ce pierzi", desc: "KPI-uri și valoarea coșurilor abandonate" },
            { icon: Send, title: "Recuperează rapid", desc: "Trimite mail sau SMS dintr-un click" },
            { icon: ShieldCheck, title: "Activat doar de tine", desc: "Oprit implicit, pornești când vrei" },
          ].map((b) => (
            <div key={b.title} className="rounded-xl border border-border bg-card p-4 text-left">
              <b.icon className="h-5 w-5 mb-2 text-primary" />
              <p className="text-sm font-semibold text-foreground">{b.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => startActivate(async () => {
            const res = await setAbandonedCartEnabled(businessId, true);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Functia a fost activata. Coșurile vor apărea pe măsură ce clienții le abandonează.");
            router.refresh();
          })}
          disabled={activating}
          className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-bold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-primary/30 bg-primary"
        >
          {activating ? <><Loader2 className="h-5 w-5 animate-spin" /> Se activează...</> : <><Sparkles className="h-5 w-5" /> ACTIVEAZĂ FUNCȚIA</>}
        </button>
        <p className="text-xs text-muted-foreground mt-4 max-w-sm">
          Salvăm datele de contact doar pentru clienții care le completează în finalizare, pentru a-i putea contacta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-border">
        <button onClick={() => setTab("carts")}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${tab === "carts" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          Coșuri
        </button>
        <button onClick={() => setTab("automation")}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors inline-flex items-center gap-1.5 ${tab === "automation" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          Automatizări{!data.isPremium && <Lock className="h-3 w-3" />}
        </button>
      </div>
      {tab === "carts"
        ? <ActiveDashboard businessId={businessId} data={data} />
        : <AbandonedAutomationsTab businessId={businessId} data={data} />}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  accent?: string; // hex for semantic colors, "primary" for the platform accent, omit for neutral
}) {
  const isPrimary = accent === "primary";
  const isHex = !!accent && accent !== "primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPrimary ? "bg-primary/10 text-primary" : isHex ? "" : "bg-muted text-muted-foreground"}`}
          style={isHex ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ActiveDashboard({ businessId, data }: { businessId: string; data: AbandonedCartsData }) {
  const router = useRouter();
  const { kpis } = data;

  const [recover, setRecover] = useState<{ cart: AbandonedCartRow; channel: "email" | "sms" } | null>(null);
  const [message, setMessage] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [sending, startSend] = useTransition();
  const [togglingOff, startToggleOff] = useTransition();

  function openRecover(cart: AbandonedCartRow, channel: "email" | "sms") {
    setRecover({ cart, channel });
    setDiscountCode("");
    // Pre-fill the actual standard message so the merchant sees exactly what's sent
    // (the restore link is appended by the server).
    setMessage(interpolateRecoveryMessage(standardRecoveryTemplate(channel), { name: cart.customer_name, store: data.storeName }));
  }

  function send() {
    if (!recover) return;
    const { cart, channel } = recover;
    const code = discountCode.trim() || undefined;
    startSend(async () => {
      const res = channel === "email"
        ? await sendAbandonedCartEmail(businessId, cart.id, message.trim() || undefined, code)
        : await sendAbandonedCartSms(businessId, cart.id, message.trim() || undefined, code);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(channel === "email" ? "Email trimis." : "SMS trimis.");
      setRecover(null);
      router.refresh();
    });
  }

  function remove(cart: AbandonedCartRow) {
    startSend(async () => {
      const res = await deleteAbandonedCart(businessId, cart.id);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Coșuri abandonate</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recuperează vânzările pierdute prin mail și SMS.</p>
        </div>
        <button
          onClick={() => startToggleOff(async () => {
            const res = await setAbandonedCartEnabled(businessId, false);
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Functia a fost dezactivata.");
            router.refresh();
          })}
          disabled={togglingOff}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline disabled:opacity-50 shrink-0"
        >
          Dezactivează
        </button>
      </div>

      {/* Motivational banner */}
      <div className="relative overflow-hidden rounded-2xl p-6 text-white bg-gradient-to-br from-primary to-primary/85">
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" />
        <div className="absolute right-10 bottom-[-3rem] w-40 h-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 text-white/80 text-sm font-medium">
            <Sparkles className="h-4 w-4" /> Potențial de recuperat luna aceasta
          </div>
          <p className="text-lg sm:text-xl font-semibold leading-snug max-w-2xl">
            Dacă ai fi recuperat toate coșurile abandonate luna aceasta, ai fi încasat încă{" "}
            <span className="text-2xl sm:text-3xl font-extrabold whitespace-nowrap">{formatPrice(data.potentialRevenueThisMonth)}</span>.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={ShoppingBag} label="Coșuri abandonate" value={String(kpis.abandonedCount)} accent="primary" />
        <KpiCard icon={Banknote} label="Valoare abandonată" value={formatPrice(kpis.abandonedValue)} accent="#ef4444" />
        <KpiCard icon={Percent} label="Rată abandon" value={`${kpis.abandonRate}%`} sub="luna aceasta" accent="#f59e0b" />
        <KpiCard icon={RotateCcw} label="Recuperate" value={String(kpis.recoveredCount)} sub={formatPrice(kpis.recoveredValue)} accent="#16a34a" />
        <KpiCard icon={TrendingDown} label="Valoare medie coș" value={formatPrice(kpis.avgCartValue)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Abandoned products */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Cele mai abandonate produse</h2>
          </div>
          {data.abandonedProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Niciun produs abandonat încă.</p>
          ) : (
            <div className="space-y-3">
              {data.abandonedProducts.map((p, i) => (
                <div key={`${p.name}-${i}`} className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                    {p.image_url
                      ? <Image src={p.image_url} alt={p.name} fill sizes="40px" className="object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.quantity} buc · {p.carts} {p.carts === 1 ? "coș" : "coșuri"}</p>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">{formatPrice(p.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Activitate recentă</h2>
          </div>
          {data.carts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nicio activitate încă.</p>
          ) : (
            <ol className="relative border-l border-border ml-1 space-y-4">
              {data.carts.slice(0, 8).map((c) => (
                <li key={c.id} className="ml-4">
                  <span className="absolute -left-1.5 w-3 h-3 rounded-full border-2 border-card bg-primary" />
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{c.customer_name || "Client anonim"}</span>{" "}
                    a lăsat {c.item_count} {c.item_count === 1 ? "produs" : "produse"} ({formatPrice(c.subtotal)})
                  </p>
                  <p className="text-xs text-muted-foreground">{timeAgo(c.last_activity_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Coșuri abandonate</h2>
          <span className="text-xs text-muted-foreground">({data.carts.length})</span>
        </div>

        {data.carts.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Niciun coș abandonat momentan</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Pe măsură ce clienții încep comenzi fără să le finalizeze, vor apărea aici (după ~1 oră de inactivitate).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.carts.map((c) => (
              <div key={c.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{c.customer_name || "Client anonim"}</p>
                    {c.source === "buy_now" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Cumpără acum</span>}
                    {c.recovery_email_sent_at && <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/10 text-info font-medium">Mail trimis</span>}
                    {c.recovery_sms_sent_at && <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">SMS trimis</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "Fără contact"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.item_count} {c.item_count === 1 ? "produs" : "produse"} · <span className="font-semibold text-foreground">{formatPrice(c.subtotal)}</span> · {timeAgo(c.last_activity_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openRecover(c, "email")}
                    disabled={!c.email}
                    title={c.email ? "Trimite email" : "Clientul nu a lăsat email"}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Mail className="h-3.5 w-3.5" /> Mail
                  </button>
                  {data.smsEnabled && (
                    <button
                      onClick={() => openRecover(c, "sms")}
                      disabled={!c.phone}
                      title={c.phone ? "Trimite SMS" : "Clientul nu a lăsat telefon"}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-white bg-primary transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> SMS
                    </button>
                  )}
                  <button
                    onClick={() => remove(c)}
                    title="Șterge"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!data.smsEnabled && data.carts.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-xl border border-border bg-muted/40 p-3">
          <Bell className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Activează SMSO sau notice.ro (coș abandonat) din Integrări ca să poți recupera coșurile și prin SMS, nu doar prin email.</span>
        </div>
      )}

      {/* Recovery modal */}
      {recover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !sending && setRecover(null)} />
          <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                {recover.channel === "email" ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                {recover.channel === "email" ? "Trimite email de recuperare" : "Trimite SMS de recuperare"}
              </h3>
              <button onClick={() => !sending && setRecover(null)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              Către <span className="font-medium text-foreground">{recover.cart.customer_name || "client"}</span>
              {" · "}{recover.channel === "email" ? recover.cart.email : recover.cart.phone}
            </p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={recover.channel === "sms" ? 4 : 5}
              placeholder={recover.channel === "email"
                ? "Mesaj opțional (lasă gol pentru textul standard cu produsele și butonul de finalizare)."
                : "Mesajul SMS..."}
              className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
            />
            {recover.channel === "sms" && (
              <p className="text-[11px] text-muted-foreground mt-1">{message.length} caractere · {Math.max(1, Math.ceil(message.length / 160))} SMS (+ linkul de recuperare)</p>
            )}

            <div className="mt-3">
              <label className="block text-xs font-medium text-foreground mb-1">Cod reducere (opțional)</label>
              <select
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
              >
                <option value="">Fără cod reducere</option>
                {data.discounts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code}{d.type === "percent" ? ` (${d.value}%)` : d.type === "fixed" ? ` (${d.value} lei)` : " (transport gratuit)"}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {data.discounts.length === 0
                  ? <>Niciun cod activ. Creează unul în <Link href="/dashboard/discounts" className="text-primary underline underline-offset-2">Discounturi</Link>.</>
                  : "Apare în mesaj și se aplică automat când clientul revine prin link."}
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRecover(null)} disabled={sending}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50">
                Anulează
              </button>
              <button onClick={send} disabled={sending || (recover.channel === "sms" && !message.trim())}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg transition-all hover:opacity-90 disabled:opacity-60">

                {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Se trimite...</> : <><Send className="h-4 w-4" /> Trimite</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
