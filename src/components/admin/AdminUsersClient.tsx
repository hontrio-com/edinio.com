"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ArrowUpDown, Store, CheckCircle2, XCircle, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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
}

const PLAN_CONFIG: Record<string, { label: string; color: string }> = {
  free: { label: "Gratuit", color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  basic: { label: "Basic", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  premium: { label: "Premium", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  ultra: { label: "Ultra", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
};

const PAGE_SIZE = 20;

type SortKey = "full_name" | "created_at" | "last_sign_in_at" | "plan" | "businesses_count";

export function AdminUsersClient({ users }: { users: User[] }) {
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    let list = [...users];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (planFilter !== "all") list = list.filter((u) => u.plan === planFilter);
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    list.sort((a, b) => {
      let av = a[sortKey] ?? "";
      let bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [users, query, planFilter, roleFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Utilizatori</h1>
        <p className="text-sm text-zinc-500 mt-1">{users.length} utilizatori inregistrati</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa nume sau email..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Toate planurile</option>
          <option value="free">Gratuit</option>
          <option value="basic">Basic</option>
          <option value="premium">Premium</option>
          <option value="ultra">Ultra</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Toate rolurile</option>
          <option value="user">Utilizator</option>
          <option value="admin">Admin</option>
          <option value="moderator">Moderator</option>
        </select>
        {(query || planFilter !== "all" || roleFilter !== "all") && (
          <span className="text-xs text-zinc-500">{filtered.length} rezultate</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <SortTh label="Utilizator" k="full_name" />
                <SortTh label="Plan" k="plan" />
                <SortTh label="Magazine" k="businesses_count" />
                <SortTh label="Inregistrat" k="created_at" />
                <SortTh label="Ultima accesare" k="last_sign_in_at" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm text-zinc-400">Niciun utilizator gasit</td>
                </tr>
              ) : paged.map((u) => {
                const planConf = PLAN_CONFIG[u.plan] ?? PLAN_CONFIG.free;
                return (
                  <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
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
                      <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", planConf.color)}>{planConf.label}</span>
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
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("ro-RO") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.email_confirmed
                        ? <div className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmat</div>
                        : <div className="flex items-center gap-1 text-xs text-zinc-400"><XCircle className="h-3.5 w-3.5" /> Neconfirmat</div>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/utilizatori/${u.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
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
