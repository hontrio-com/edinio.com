"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Ticket {
  id: string; subject: string; category: string; priority: string;
  status: string; has_unread_reply: boolean; created_at: string; updated_at: string;
  user_id: string; user_name: string; user_email: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Deschis", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In lucru", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Rezolvat", color: "bg-green-100 text-green-700" },
  closed: { label: "Inchis", color: "bg-zinc-100 text-zinc-500" },
};
const PRIORITY_CONFIG: Record<string, { label: string; dot: string }> = {
  low: { label: "Scazuta", dot: "bg-zinc-400" },
  normal: { label: "Normala", dot: "bg-blue-500" },
  high: { label: "Mare", dot: "bg-orange-500" },
  urgent: { label: "Urgenta", dot: "bg-red-500" },
};
const CATEGORY_LABELS: Record<string, string> = {
  technical: "Tehnic", billing: "Facturare", feature: "Functionalitate", other: "Altele",
};

const PAGE_SIZE = 25;

export function AdminSupportClient({ tickets }: { tickets: Ticket[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);

  const open = tickets.filter((t) => t.status === "open").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const unread = tickets.filter((t) => !t.has_unread_reply && ["open", "in_progress"].includes(t.status)).length;

  const filtered = useMemo(() => {
    let list = [...tickets];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.subject.toLowerCase().includes(q) || t.user_name.toLowerCase().includes(q) || t.user_email.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    return list;
  }, [tickets, query, statusFilter, priorityFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Suport</h1>
        <p className="text-sm text-zinc-500 mt-1">{tickets.length} tichete totale</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Deschise", value: open, color: "text-blue-600" },
          { label: "In lucru", value: inProgress, color: "text-amber-600" },
          { label: "Fara raspuns admin", value: unread, color: "text-red-600" },
          { label: "Totale", value: tickets.length, color: "text-zinc-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className={cn("text-2xl font-black", color)}>{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa subiect sau utilizator..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate statusurile</option>
          <option value="open">Deschis</option>
          <option value="in_progress">In lucru</option>
          <option value="resolved">Rezolvat</option>
          <option value="closed">Inchis</option>
        </select>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate prioritatile</option>
          <option value="urgent">Urgenta</option>
          <option value="high">Mare</option>
          <option value="normal">Normala</option>
          <option value="low">Scazuta</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Subiect</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Categorie</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Prioritate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Actualizat</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-sm text-zinc-400">
                  <LifeBuoy className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                  Niciun tichet gasit
                </td></tr>
              ) : paged.map((t) => {
                const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.open;
                const pc = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.normal;
                const needsReply = ["open", "in_progress"].includes(t.status) && !t.has_unread_reply;
                return (
                  <tr key={t.id} className={cn("hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors", needsReply && "bg-red-50/30 dark:bg-red-950/10")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {needsReply && <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white max-w-xs truncate">{t.subject}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/utilizatori/${t.user_id}`} className="hover:underline">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">{t.user_name}</p>
                        <p className="text-xs text-zinc-400">{t.user_email}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{CATEGORY_LABELS[t.category] ?? t.category}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <span className={cn("w-1.5 h-1.5 rounded-full", pc.dot)} />
                        {pc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", sc.color)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{new Date(t.updated_at).toLocaleDateString("ro-RO")}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/suport/${t.id}`} className={cn("text-xs font-semibold hover:underline", needsReply ? "text-red-600" : "text-primary")}>
                        {needsReply ? "Raspunde" : "Deschide"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} din {filtered.length}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
