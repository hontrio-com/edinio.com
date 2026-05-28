"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Shield, Mail, Calendar, Store, ShoppingCart,
  Receipt, LifeBuoy, UserCheck, Loader2, ExternalLink, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";

const PLAN_OPTIONS = ["free", "basic", "premium", "ultra"] as const;
const PLAN_LABELS: Record<string, string> = { free: "Gratuit", basic: "Basic", premium: "Premium", ultra: "Ultra" };
const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-zinc-100 text-zinc-600",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

interface Profile {
  id: string; full_name: string; plan: string; role: string;
  created_at: string; avatar_url: string | null; stripe_customer_id: string | null;
}
interface AuthUser {
  email: string; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null;
}

export function AdminUserDetail({ profile, authUser, businesses, invoices, tickets, orders, totalRevenue }: {
  profile: Profile;
  authUser: AuthUser;
  businesses: { id: string; business_name: string; store_name: string | null; slug: string; type: string; is_published: boolean; created_at: string; primary_color: string }[];
  invoices: { id: string; amount: number; plan: string; status: string; created_at: string }[];
  tickets: { id: string; subject: string; status: string; priority: string; created_at: string }[];
  orders: { id: string; order_number: string; total: number; status: string; created_at: string; business_id: string }[];
  totalRevenue: number;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(profile.plan);
  const [role, setRole] = useState(profile.role);
  const [savingPlan, setSavingPlan] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  async function handleSavePlan() {
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, role }),
      });
      if (!res.ok) throw new Error();
      toast.success("Modificarile au fost salvate");
      router.refresh();
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleImpersonate() {
    setImpersonating(true);
    try {
      const res = await fetch(`/api/admin/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Eroare");
      window.open(data.url, "_blank");
      toast.success("Sesiune deschisa intr-un tab nou");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la impersonare");
    } finally {
      setImpersonating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/admin/utilizatori" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" /> Inapoi la utilizatori
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-black text-primary flex-shrink-0">
              {profile.full_name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-zinc-900 dark:text-white">{profile.full_name}</h1>
                {profile.role === "admin" && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <Shield className="h-3 w-3" /> Admin
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Mail className="h-3.5 w-3.5" /> {authUser.email}
                </div>
                {authUser.email_confirmed_at && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Email confirmat
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-400">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Inregistrat {new Date(authUser.created_at).toLocaleDateString("ro-RO")}</span>
                {authUser.last_sign_in_at && (
                  <span>Ultima accesare: {new Date(authUser.last_sign_in_at).toLocaleDateString("ro-RO")}</span>
                )}
              </div>
            </div>
          </div>

          {/* Impersonate button */}
          <button
            onClick={handleImpersonate}
            disabled={impersonating}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {impersonating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            {impersonating ? "Se proceseaza..." : "Conectare ca acest utilizator"}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
          {[
            { label: "Magazine", value: businesses.length, icon: Store },
            { label: "Comenzi", value: orders.length, icon: ShoppingCart },
            { label: "Facturi platite", value: invoices.filter((i) => i.status === "paid").length, icon: Receipt },
            { label: "Venituri generate", value: `${totalRevenue} lei`, icon: Receipt },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center">
              <Icon className="h-5 w-5 text-zinc-400 mx-auto mb-1" />
              <p className="text-lg font-black text-zinc-900 dark:text-white">{value}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Edit plan & role */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4">Gestionare cont</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Plan abonament</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="user">Utilizator</option>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSavePlan}
            disabled={savingPlan || (plan === profile.plan && role === profile.role)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salveaza modificarile
          </button>
        </div>
      </div>

      {/* Businesses */}
      {businesses.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Magazine ({businesses.length})</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {businesses.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: b.primary_color }}>
                  {(b.store_name ?? b.business_name)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{b.store_name ?? b.business_name}</p>
                  <p className="text-xs text-zinc-400">/{b.slug} · {b.type}</p>
                </div>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  b.is_published ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                )}>{b.is_published ? "Publicat" : "Draft"}</span>
                <a href={`/${b.slug}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-primary transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <Link href={`/admin/magazine/${b.id}`} className="text-xs font-semibold text-primary hover:underline">Detalii</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Support tickets */}
      {tickets.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Tichete suport ({tickets.length})</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {tickets.map((t) => (
              <Link key={t.id} href={`/admin/suport/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <LifeBuoy className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{t.subject}</p>
                  <p className="text-xs text-zinc-400">{new Date(t.created_at).toLocaleDateString("ro-RO")}</p>
                </div>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[t.status] ?? STATUS_COLORS.open)}>
                  {t.status === "open" ? "Deschis" : t.status === "in_progress" ? "In lucru" : t.status === "resolved" ? "Rezolvat" : "Inchis"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Facturi ({invoices.length})</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-5 py-3">
                <Receipt className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white capitalize">{PLAN_LABELS[inv.plan] ?? inv.plan}</p>
                  <p className="text-xs text-zinc-400">{new Date(inv.created_at).toLocaleDateString("ro-RO")}</p>
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{inv.amount} lei</p>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-600"
                )}>{inv.status === "paid" ? "Platit" : inv.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
