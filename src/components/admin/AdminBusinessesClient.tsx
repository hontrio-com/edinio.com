"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ArrowUpDown, ExternalLink, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";

interface Business {
  id: string; business_name: string; store_name: string | null; slug: string;
  type: string; is_published: boolean; created_at: string; primary_color: string;
  user_id: string; orders_count: number;
  owner: { id: string; full_name: string; plan: string } | null;
}

const PAGE_SIZE = 20;
type SortKey = "business_name" | "created_at" | "orders_count" | "type";

export function AdminBusinessesClient({ businesses: initialBusinesses }: { businesses: Business[] }) {
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleTogglePublish(id: string, currentlyPublished: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/admin/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !currentlyPublished }),
      });
      if (!res.ok) throw new Error();
      setBusinesses((prev) => prev.map((b) => b.id === id ? { ...b, is_published: !currentlyPublished } : b));
      toast.success(currentlyPublished ? "Magazin dezpublicat" : "Magazin publicat");
    } catch { toast.error("Eroare la actualizare"); }
    finally { setTogglingId(null); }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    let list = [...businesses];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((b) =>
        (b.store_name ?? b.business_name).toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.owner?.full_name ?? "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") list = list.filter((b) => b.type === typeFilter);
    if (statusFilter === "published") list = list.filter((b) => b.is_published);
    if (statusFilter === "draft") list = list.filter((b) => !b.is_published);
    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [businesses, query, typeFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const types = [...new Set(businesses.map((b) => b.type))];

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
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Magazine</h1>
        <p className="text-sm text-zinc-500 mt-1">{businesses.length} magazine create</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: businesses.length },
          { label: "Publicate", value: businesses.filter((b) => b.is_published).length },
          { label: "Draft", value: businesses.filter((b) => !b.is_published).length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-zinc-900 dark:text-white">{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa nume, slug sau proprietar..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate tipurile</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">Toate statusurile</option>
          <option value="published">Publicate</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <SortTh label="Magazin" k="business_name" />
                <SortTh label="Tip" k="type" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Proprietar</th>
                <SortTh label="Comenzi" k="orders_count" />
                <SortTh label="Creat" k="created_at" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paged.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-sm text-zinc-400">Niciun magazin gasit</td></tr>
              ) : paged.map((b) => (
                <tr key={b.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: b.primary_color }}>
                        {(b.store_name ?? b.business_name)[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{b.store_name ?? b.business_name}</p>
                        <p className="text-xs text-zinc-400">/{b.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500 capitalize">{b.type}</td>
                  <td className="px-4 py-3">
                    {b.owner ? (
                      <Link href={`/admin/utilizatori/${b.owner.id}`} className="text-sm text-primary hover:underline">
                        {b.owner.full_name}
                      </Link>
                    ) : <span className="text-zinc-400 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{b.orders_count}</td>
                  <td className="px-4 py-3 text-sm text-zinc-500">{new Date(b.created_at).toLocaleDateString("ro-RO")}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full",
                      b.is_published ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                    )}>{b.is_published ? "Publicat" : "Draft"}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleTogglePublish(b.id, b.is_published)} disabled={togglingId === b.id}
                        title={b.is_published ? "Dezpublica" : "Publica"}
                        className={cn("p-1.5 rounded-lg transition-colors disabled:opacity-40",
                          b.is_published
                            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            : "text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                        )}>
                        {togglingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                          b.is_published ? <ToggleLeft className="h-3.5 w-3.5" /> : <ToggleRight className="h-3.5 w-3.5" />}
                      </button>
                      <a href={`/${b.slug}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-primary transition-colors">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Link href={`/admin/magazine/${b.id}`} className="text-xs font-semibold text-primary hover:underline">Detalii</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} din {filtered.length}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
