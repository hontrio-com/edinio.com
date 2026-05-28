"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  History, User, Store, Receipt, LifeBuoy, Settings, Bell,
  ChevronDown, ChevronUp, Search, Filter,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: unknown;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  "user.plan_change": "A schimbat planul",
  "user.role_change": "A schimbat rolul",
  "user.suspend": "A suspendat utilizatorul",
  "user.unsuspend": "A reactivat utilizatorul",
  "user.delete": "A sters contul",
  "user.edit": "A editat detaliile",
  "user.impersonate": "S-a conectat ca utilizator",
  "user.notify": "A trimis notificare",
  "user.bulk_plan_change": "Schimbare plan in masa",
  "business.publish": "A publicat magazinul",
  "business.unpublish": "A dezpublicat magazinul",
  "invoice.cancel": "A anulat factura",
  "invoice.delete": "A sters factura",
  "invoice.reissue": "A reemis factura",
  "ticket.delete": "A sters tichetul",
  "ticket.status_change": "A schimbat statusul tichetului",
  "ticket.reply": "A raspuns la tichet",
  "settings.update": "A modificat setarile platformei",
  "broadcast.send": "A trimis notificare broadcast",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  user: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  business: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-400", border: "border-green-200 dark:border-green-800" },
  invoice: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  ticket: { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-400", border: "border-purple-200 dark:border-purple-800" },
  settings: { bg: "bg-zinc-50 dark:bg-zinc-800/30", text: "text-zinc-700 dark:text-zinc-400", border: "border-zinc-200 dark:border-zinc-700" },
  broadcast: { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800" },
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  user: User,
  business: Store,
  invoice: Receipt,
  ticket: LifeBuoy,
  settings: Settings,
  broadcast: Bell,
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  user: "Utilizator",
  business: "Magazin",
  invoice: "Factura",
  ticket: "Tichet",
  settings: "Setari",
  broadcast: "Broadcast",
};

const PAGE_SIZE = 25;

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const ts = new Date(dateStr).getTime();
  const diffMs = now - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "acum cateva secunde";
  if (diffMin < 60) return `acum ${diffMin} min`;
  if (diffHr < 24) return `acum ${diffHr} ${diffHr === 1 ? "ora" : "ore"}`;
  if (diffDays === 1) return "ieri";
  if (diffDays < 7) return `acum ${diffDays} zile`;
  return new Date(dateStr).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTargetHref(targetType: string, targetId: string | null): string | null {
  if (!targetId) return null;
  switch (targetType) {
    case "user":
      return `/admin/utilizatori/${targetId}`;
    case "business":
      return `/admin/magazine/${targetId}`;
    case "ticket":
      return `/admin/suport/${targetId}`;
    case "invoice":
      return `/admin/facturi`;
    default:
      return null;
  }
}

function getCategory(action: string): string {
  return action.split(".")[0] ?? "settings";
}

export function AdminActivityClient({
  logs,
  adminNames,
}: {
  logs: AuditLog[];
  adminNames: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allActions = useMemo(() => {
    const s = new Set(logs.map((l) => l.action));
    return Array.from(s).sort();
  }, [logs]);

  const allTargetTypes = useMemo(() => {
    const s = new Set(logs.map((l) => l.target_type));
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    let list = [...logs];

    if (query) {
      const q = query.toLowerCase();
      list = list.filter((l) => {
        const adminName = (adminNames[l.admin_id] ?? "").toLowerCase();
        const targetId = (l.target_id ?? "").toLowerCase();
        return adminName.includes(q) || targetId.includes(q);
      });
    }

    if (actionFilter !== "all") {
      list = list.filter((l) => l.action === actionFilter);
    }

    if (targetTypeFilter !== "all") {
      list = list.filter((l) => l.target_type === targetTypeFilter);
    }

    if (dateFrom) {
      const fromTs = new Date(dateFrom + "T00:00:00").getTime();
      list = list.filter((l) => new Date(l.created_at).getTime() >= fromTs);
    }

    if (dateTo) {
      const toTs = new Date(dateTo + "T23:59:59").getTime();
      list = list.filter((l) => new Date(l.created_at).getTime() <= toTs);
    }

    return list;
  }, [logs, query, actionFilter, targetTypeFilter, dateFrom, dateTo, adminNames]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Activitate</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Jurnal de actiuni ale administratorilor ({logs.length} inregistrari)
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Cauta dupa admin sau ID tinta..."
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-zinc-400 flex-shrink-0" />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">Toate actiunile</option>
            {allActions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
        </div>

        <select
          value={targetTypeFilter}
          onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Toate tipurile</option>
          {allTargetTypes.map((t) => (
            <option key={t} value={t}>{TARGET_TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-xs text-zinc-400">-</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />

        {(query || actionFilter !== "all" || targetTypeFilter !== "all" || dateFrom || dateTo) && (
          <span className="text-xs text-zinc-500">{filtered.length} rezultate</span>
        )}
      </div>

      {/* Log entries */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <History className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400">Nicio inregistrare gasita</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {paged.map((log) => {
              const category = getCategory(log.action);
              const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.settings;
              const IconComp = CATEGORY_ICONS[category] ?? History;
              const actionLabel = ACTION_LABELS[log.action] ?? log.action;
              const adminName = adminNames[log.admin_id] ?? log.admin_id.slice(0, 8);
              const targetHref = getTargetHref(log.target_type, log.target_id);
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    {/* Icon */}
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", colors.bg)}>
                      <IconComp className={cn("h-4 w-4", colors.text)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {adminName}
                        </span>
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          colors.bg, colors.text, colors.border,
                        )}>
                          {actionLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                        <span>{getRelativeTime(log.created_at)}</span>
                        {log.target_id && (
                          <>
                            <span>-</span>
                            {targetHref ? (
                              <Link
                                href={targetHref}
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline truncate max-w-48"
                              >
                                {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}: {log.target_id.slice(0, 8)}...
                              </Link>
                            ) : (
                              <span className="truncate max-w-48">
                                {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}: {log.target_id.slice(0, 8)}...
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <div className="flex-shrink-0 text-zinc-400">
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />
                      }
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && log.details != null && typeof log.details === "object" && !Array.isArray(log.details) && Object.keys(log.details).length > 0 && (
                    <div className="px-4 sm:px-5 pb-4 pl-[4.25rem]">
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 overflow-x-auto">
                        <p className="text-xs font-semibold text-zinc-500 mb-1.5">Detalii</p>
                        <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-all">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
                        <span>ID: {log.id}</span>
                        <span>Admin ID: {log.admin_id}</span>
                        <span>
                          {new Date(log.created_at).toLocaleDateString("ro-RO", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} din {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
