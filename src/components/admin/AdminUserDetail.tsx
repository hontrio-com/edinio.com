"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Shield, Mail, Calendar, Store, ShoppingCart,
  Receipt, LifeBuoy, UserCheck, Loader2, ExternalLink, CheckCircle2,
  Trash2, Ban, BellRing, Pencil, Save, X, AlertTriangle, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";

const PLAN_OPTIONS = ["free", "starter", "pro", "business"] as const;
const PLAN_LABELS: Record<string, string> = { free: "Gratuit", starter: "Starter", pro: "Pro", business: "Business" };
const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-zinc-100 text-zinc-600",
  pending: "bg-yellow-100 text-yellow-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

interface Profile {
  id: string; full_name: string; plan: string; role: string;
  created_at: string; avatar_url: string | null; stripe_customer_id: string | null;
  suspended_until: string | null; admin_notes: string | null;
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

  // Account management state
  const [plan, setPlan] = useState(profile.plan);
  const [role, setRole] = useState(profile.role);
  const [savingPlan, setSavingPlan] = useState(false);

  // Edit details state
  const [editingDetails, setEditingDetails] = useState(false);
  const [editName, setEditName] = useState(profile.full_name);
  const [editEmail, setEditEmail] = useState(authUser.email);
  const [savingDetails, setSavingDetails] = useState(false);

  // Suspend state
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendDays, setSuspendDays] = useState("30");
  const [suspending, setSuspending] = useState(false);
  const [isSuspended, setIsSuspended] = useState(
    profile.suspended_until ? new Date(profile.suspended_until) > new Date() : false
  );

  // Notify state
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [notifySubject, setNotifySubject] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Notes state
  const [notes, setNotes] = useState(profile.admin_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    } catch { toast.error("Eroare la salvare"); }
    finally { setSavingPlan(false); }
  }

  async function handleSaveDetails() {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: editName, email: editEmail }),
      });
      if (!res.ok) throw new Error();
      toast.success("Detalii actualizate");
      setEditingDetails(false);
      router.refresh();
    } catch { toast.error("Eroare la actualizare"); }
    finally { setSavingDetails(false); }
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
    } catch (err) { toast.error(err instanceof Error ? err.message : "Eroare la impersonare"); }
    finally { setImpersonating(false); }
  }

  async function handleSuspend() {
    setSuspending(true);
    try {
      const until = isSuspended ? null : new Date(Date.now() + Number(suspendDays) * 86400000).toISOString();
      const res = await fetch(`/api/admin/users/${profile.id}/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended_until: until }),
      });
      if (!res.ok) throw new Error();
      setIsSuspended(!isSuspended);
      setShowSuspendDialog(false);
      toast.success(isSuspended ? "Suspendare ridicata" : `Utilizator suspendat pentru ${suspendDays} zile`);
      router.refresh();
    } catch { toast.error("Eroare"); }
    finally { setSuspending(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/delete`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Utilizator sters");
      router.push("/admin/utilizatori");
    } catch { toast.error("Eroare la stergere"); }
    finally { setDeleting(false); }
  }

  async function handleSendNotification() {
    if (!notifySubject.trim() || !notifyMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: notifySubject, message: notifyMessage }),
      });
      if (!res.ok) throw new Error();
      toast.success("Notificare trimisa");
      setShowNotifyDialog(false);
      setNotifySubject(""); setNotifyMessage("");
    } catch { toast.error("Eroare la trimitere"); }
    finally { setSending(false); }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: notes }),
      });
      if (!res.ok) throw new Error();
      toast.success("Note salvate");
    } catch { toast.error("Eroare la salvare"); }
    finally { setSavingNotes(false); }
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link href="/admin/utilizatori" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" /> Inapoi la utilizatori
      </Link>

      {/* Header card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-black text-primary flex-shrink-0">
              {profile.full_name?.[0]?.toUpperCase() ?? "?"}
            </div>
            {editingDetails ? (
              <div className="flex-1 space-y-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Nume complet" />
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Email" type="email" />
                <div className="flex gap-2">
                  <button onClick={handleSaveDetails} disabled={savingDetails}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {savingDetails ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salveaza
                  </button>
                  <button onClick={() => { setEditingDetails(false); setEditName(profile.full_name); setEditEmail(authUser.email); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                    <X className="h-3.5 w-3.5" /> Anuleaza
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black text-zinc-900 dark:text-white">{profile.full_name}</h1>
                  {profile.role === "admin" && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      <Shield className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {isSuspended && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                      <Ban className="h-3 w-3" /> Suspendat
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="flex items-center gap-1.5 text-sm text-zinc-500"><Mail className="h-3.5 w-3.5" /> {authUser.email}</span>
                  {authUser.email_confirmed_at && (
                    <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmat</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-400 flex-wrap">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(authUser.created_at).toLocaleDateString("ro-RO")}</span>
                  {authUser.last_sign_in_at && <span>Ultima accesare: {new Date(authUser.last_sign_in_at).toLocaleDateString("ro-RO")}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!editingDetails && (
            <div className="flex flex-wrap gap-2">
              <button onClick={handleImpersonate} disabled={impersonating}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {impersonating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                Conectare ca utilizator
              </button>
              <button onClick={() => setEditingDetails(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Editeaza
              </button>
              <button onClick={() => setShowNotifyDialog(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-xl text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors">
                <BellRing className="h-3.5 w-3.5" /> Notificare
              </button>
              <button onClick={() => setShowSuspendDialog(true)}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
                  isSuspended
                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-100"
                    : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100"
                )}>
                <Ban className="h-3.5 w-3.5" />
                {isSuspended ? "Ridica suspendare" : "Suspenda"}
              </button>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Sterge cont
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          {[
            { label: "Magazine", value: businesses.length, icon: Store },
            { label: "Comenzi", value: orders.length, icon: ShoppingCart },
            { label: "Facturi platite", value: invoices.filter((i) => i.status === "paid").length, icon: Receipt },
            { label: "Venituri", value: `${(totalRevenue / 100).toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei`, icon: Receipt },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center">
              <Icon className="h-5 w-5 text-zinc-400 mx-auto mb-1" />
              <p className="text-lg font-black text-zinc-900 dark:text-white">{value}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Plan & role */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-4">Gestionare cont</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Plan abonament</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="user">Utilizator</option>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={handleSavePlan} disabled={savingPlan || (plan === profile.plan && role === profile.role)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salveaza modificarile
          </button>
        </div>
      </div>

      {/* Admin notes */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white mb-3">Note interne (vizibile doar adminilor)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Adauga note despre acest utilizator..."
          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <div className="mt-2 flex justify-end">
          <button onClick={handleSaveNotes} disabled={savingNotes || notes === (profile.admin_notes ?? "")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:opacity-80 disabled:opacity-40 transition-opacity">
            {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salveaza note
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
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                  b.is_published ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                )}>{b.is_published ? "Publicat" : "Draft"}</span>
                <a href={`/${b.slug}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-primary transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <Link href={`/admin/magazine/${b.id}`} className="text-xs font-semibold text-primary hover:underline flex-shrink-0">Detalii</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tickets */}
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
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0", STATUS_COLORS[t.status] ?? STATUS_COLORS.open)}>
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
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{(inv.amount / 100).toLocaleString("ro-RO")} lei</p>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                  inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-600"
                )}>{inv.status === "paid" ? "Platit" : inv.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suspend dialog */}
      {showSuspendDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2">
              {isSuspended ? "Ridica suspendarea" : "Suspenda utilizator"}
            </h3>
            {!isSuspended && (
              <>
                <p className="text-sm text-zinc-500 mb-4">Alege perioada de suspendare. Utilizatorul nu va putea accesa contul.</p>
                <div className="space-y-2 mb-4">
                  {[{ value: "7", label: "7 zile" }, { value: "30", label: "30 zile" }, { value: "90", label: "90 zile" }, { value: "365", label: "1 an" }].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name="suspendDays" value={opt.value} checked={suspendDays === opt.value} onChange={(e) => setSuspendDays(e.target.value)} className="accent-primary" />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {isSuspended && (
              <p className="text-sm text-zinc-500 mb-4">Utilizatorul va putea accesa din nou contul imediat.</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowSuspendDialog(false)} className="flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Anuleaza</button>
              <button onClick={handleSuspend} disabled={suspending}
                className={cn("flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50",
                  isSuspended ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"
                )}>
                {suspending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSuspended ? "Ridica suspendarea" : "Suspenda"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notify dialog */}
      {showNotifyDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Trimite notificare</h3>
              <button onClick={() => setShowNotifyDialog(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs text-zinc-500 mb-4">Se va trimite un email catre <strong>{authUser.email}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Subiect</label>
                <input value={notifySubject} onChange={(e) => setNotifySubject(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Subiectul emailului" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Mesaj</label>
                <textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} rows={5}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Scrie mesajul..." />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowNotifyDialog(false)} className="flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition-colors">Anuleaza</button>
              <button onClick={handleSendNotification} disabled={sending || !notifySubject.trim() || !notifyMessage.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Trimite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Sterge contul?</h3>
            </div>
            <p className="text-sm text-zinc-500 mb-1">Aceasta actiune este <strong>ireversibila</strong>. Toate datele utilizatorului vor fi sterse permanent:</p>
            <ul className="text-sm text-zinc-500 mb-4 list-disc list-inside space-y-0.5">
              <li>Cont si sesiuni</li>
              <li>Magazine ({businesses.length})</li>
              <li>Tichete suport ({tickets.length})</li>
              <li>Facturi ({invoices.length})</li>
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Anuleaza</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Sterge definitiv
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
