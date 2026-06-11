"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Search, ArrowUpDown, Store, CheckCircle2, XCircle, Shield,
  ChevronLeft, ChevronRight, AlertTriangle, Ban, Download, Loader2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PLANS, PLAN_LABELS, PLAN_BADGE_CLASSES, ROLE_LABELS } from "@/lib/plans";
import { toast } from "sonner";

interface User {
  id: string;
  full_name: string;
  email: string;
  plan: string;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  businesses_count: number;
  plan_expires_at: string | null;
  suspended_until: string | null;
  onboarding_step: string;
  onboarding_completed: boolean;
}

const STEP_LABELS: Record<string, { label: string; color: string }> = {
  registered: { label: "Doar cont creat", color: "text-red-500" },
  details: { label: "Blocat la detalii", color: "text-orange-500" },
  customize: { label: "Blocat la personalizare", color: "text-amber-500" },
  plan: { label: "Blocat la alegere plan", color: "text-blue-500" },
  completed: { label: "Finalizat", color: "text-green-600" },
};
// Note: "customize" kept for backward compat with old data

type StatusFilter = "all" | "active" | "past_due" | "suspended" | "unconfirmed";

const PAGE_SIZE = 20;
type SortKey = "full_name" | "created_at" | "last_sign_in_at" | "plan" | "businesses_count";

function isPastDue(u: User) {
  if (u.plan === "free") return false;
  if (!u.plan_expires_at) return false;
  return new Date(u.plan_expires_at) < new Date();
}

function isSuspended(u: User) {
  if (!u.suspended_until) return false;
  return new Date(u.suspended_until) > new Date();
}

function relativeTime(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "acum";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}z`;
  return null;
}

export function AdminUsersClient({ users }: { users: User[] }) {
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Stats
  const pastDueCount = users.filter(isPastDue).length;
  const suspendedCount = users.filter(isSuspended).length;
  const paidCount = users.filter((u) => u.plan !== "free").length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    let list = [...users];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    }
    if (planFilter !== "all") list = list.filter((u) => u.plan === planFilter);
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (statusFilter === "past_due") list = list.filter(isPastDue);
    if (statusFilter === "suspended") list = list.filter(isSuspended);
    if (statusFilter === "unconfirmed") list = list.filter((u) => !u.email_confirmed);
    if (statusFilter === "active") list = list.filter((u) => u.email_confirmed && !isPastDue(u) && !isSuspended(u));
    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [users, query, planFilter, roleFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allPageSelected = paged.length > 0 && paged.every((u) => selected.has(u.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paged.forEach((u) => next.delete(u.id));
      } else {
        paged.forEach((u) => next.add(u.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const handleBulkAction = useCallback(async () => {
    if (!bulkAction || !bulkValue || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: Array.from(selected),
          action: bulkAction,
          value: bulkValue,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { affected: number };
      toast.success(`${data.affected} utilizatori actualizati`);
      setSelected(new Set());
      setBulkAction("");
      setBulkValue("");
      window.location.reload();
    } catch { toast.error("Eroare la actiunea in masa"); }
    finally { setBulkLoading(false); }
  }, [bulkAction, bulkValue, selected]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export/users");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `utilizatori_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export descarcat");
    } catch { toast.error("Eroare la export"); }
    finally { setExporting(false); }
  }

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
        <button className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white transition-colors" onClick={() => toggleSort(k)}>
          {label}
          <ArrowUpDown className={cn("h-3 w-3", sortKey === k ? "text-primary" : "opacity-40")} />
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Utilizatori</h1>
          <p className="text-sm text-zinc-500 mt-1">{users.length} utilizatori inregistrati</p>
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50">
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export CSV
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: users.length, color: "text-zinc-700 dark:text-white" },
          { label: "Platitori", value: paidCount, color: "text-primary" },
          { label: "Past-due", value: pastDueCount, color: pastDueCount > 0 ? "text-red-600" : "text-zinc-400" },
          { label: "Suspendati", value: suspendedCount, color: suspendedCount > 0 ? "text-amber-600" : "text-zinc-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center">
            <p className={cn("text-xl font-black", color)}>{value}</p>
            <p className="text-[11px] text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Past-due alert */}
      {pastDueCount > 0 && (
        <button onClick={() => { setStatusFilter("past_due"); setPage(1); }}
          className="w-full flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 hover:border-red-400 transition-colors text-left">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{pastDueCount} {pastDueCount === 1 ? "utilizator are" : "utilizatori au"} abonamentul expirat</span>
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa nume, email sau ID..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate planurile</option>
          {Object.entries(PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate rolurile</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate statusurile</option>
          <option value="active">Activ</option>
          <option value="past_due">Past-due</option>
          <option value="suspended">Suspendat</option>
          <option value="unconfirmed">Neconfirmat</option>
        </select>
        {(query || planFilter !== "all" || roleFilter !== "all" || statusFilter !== "all") && (
          <span className="text-xs text-zinc-500">{filtered.length} rezultate</span>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{selected.size} selectati</span>
          <select value={bulkAction} onChange={(e) => { setBulkAction(e.target.value); setBulkValue(""); }}
            className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">Alege actiune...</option>
            <option value="change_plan">Schimba planul</option>
            <option value="change_role">Schimba rolul</option>
          </select>
          {bulkAction === "change_plan" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">Plan...</option>
              {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
            </select>
          )}
          {bulkAction === "change_role" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">Rol...</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          <button onClick={handleBulkAction} disabled={bulkLoading || !bulkAction || !bulkValue}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Aplica
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 ml-auto">
            Deselecteaza tot
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
                    className="accent-primary rounded" />
                </th>
                <SortTh label="Utilizator" k="full_name" />
                <SortTh label="Plan" k="plan" />
                <SortTh label="Magazine" k="businesses_count" />
                <SortTh label="Inregistrat" k="created_at" />
                <SortTh label="Ultima accesare" k="last_sign_in_at" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Onboarding</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-sm text-zinc-400">Niciun utilizator gasit</td>
                </tr>
              ) : paged.map((u) => {
                const planLabel = PLAN_LABELS[u.plan] ?? u.plan;
                const planBadge = PLAN_BADGE_CLASSES[u.plan] ?? PLAN_BADGE_CLASSES.free;
                const pastDue = isPastDue(u);
                const suspended = isSuspended(u);
                const lastSeenRel = relativeTime(u.last_sign_in_at);
                return (
                  <tr key={u.id} className={cn(
                    "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors",
                    pastDue && "bg-red-50/30 dark:bg-red-950/10",
                    suspended && "bg-amber-50/30 dark:bg-amber-950/10",
                  )}>
                    <td className="w-10 px-4 py-3">
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)}
                        className="accent-primary rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {u.full_name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{u.full_name}</p>
                            {u.role === "admin" && <Shield className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <p className="text-xs text-zinc-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", planBadge)}>{planLabel}</span>
                        {pastDue && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                            Expirat
                          </span>
                        )}
                      </div>
                      {u.plan === "free" && u.plan_expires_at && (() => {
                        const days = Math.ceil((new Date(u.plan_expires_at).getTime() - Date.now()) / 86400000);
                        if (days > 365) return null;
                        if (days <= 0) return <p className="text-[10px] text-red-500 font-medium mt-0.5">Expirat</p>;
                        return <p className={cn("text-[10px] font-medium mt-0.5", days <= 3 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-zinc-400")}>{days} {days === 1 ? "zi ramasa" : "zile ramase"}</p>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                        <Store className="h-3.5 w-3.5" />
                        {u.businesses_count}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {new Date(u.created_at).toLocaleDateString("ro-RO")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                        {u.last_sign_in_at ? (
                          <>
                            {lastSeenRel ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span title={new Date(u.last_sign_in_at).toLocaleString("ro-RO")}>{lastSeenRel}</span>
                              </span>
                            ) : (
                              new Date(u.last_sign_in_at).toLocaleDateString("ro-RO")
                            )}
                          </>
                        ) : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {suspended ? (
                          <div className="flex items-center gap-1 text-xs text-amber-600"><Ban className="h-3.5 w-3.5" /> Suspendat</div>
                        ) : pastDue ? (
                          <div className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Past-due</div>
                        ) : u.email_confirmed ? (
                          <div className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Activ</div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-zinc-400"><XCircle className="h-3.5 w-3.5" /> Neconfirmat</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const step = STEP_LABELS[u.onboarding_step] ?? STEP_LABELS.registered;
                        return u.onboarding_completed
                          ? <span className="text-xs text-green-600 font-medium">Finalizat</span>
                          : <span className={cn("text-xs font-medium", step.color)}>{step.label}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/utilizatori/${u.id}`}
                        className="text-xs font-semibold text-primary hover:underline">
                        Detalii
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} din {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
