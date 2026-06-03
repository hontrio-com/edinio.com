"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, AlertCircle, Info, ChevronLeft, ChevronRight, Search, RefreshCw } from "lucide-react";

interface LogEntry {
  id: string;
  created_at: string;
  action: string;
  message: string;
  details: Record<string, unknown>;
  user_id: string | null;
  user_email: string | null;
  business_id: string | null;
  severity: "info" | "warning" | "error" | "critical";
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: typeof AlertCircle }> = {
  critical: { bg: "bg-red-50 border-red-200", text: "text-red-700", icon: AlertTriangle },
  error: { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", icon: AlertCircle },
  warning: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: AlertTriangle },
  info: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", icon: Info },
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (severity) params.set("severity", severity);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/logs?${params}`);
      if (res.status === 403) {
        setError("Acces interzis. Nu ai permisiuni de administrator.");
        setLoading(false);
        return;
      }
      const data = await res.json() as { logs: LogEntry[]; total: number; error?: string };
      if (data.error) {
        setError(data.error);
      } else {
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch {
      setError("Eroare de retea.");
    }
    setLoading(false);
  }, [page, severity, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);

  if (error === "Acces interzis. Nu ai permisiuni de administrator.") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Acces interzis</h1>
          <p className="text-gray-500">Nu ai permisiuni de administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Error Logs</h1>
            <p className="text-sm text-gray-500 mt-1">{total} erori inregistrate</p>
          </div>
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Reincarca
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cauta dupa actiune sau mesaj..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Toate severitatile</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>

        {/* Table */}
        {loading && logs.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
        ) : logs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <Info className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">Nicio eroare inregistrata</p>
            <p className="text-xs text-gray-500 mt-1">Erorile din actiunile platformei vor aparea aici.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Data</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Severitate</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actiune</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mesaj</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Detalii</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const style = SEVERITY_STYLES[log.severity] ?? SEVERITY_STYLES.error;
                    const Icon = style.icon;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("ro-RO", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit", second: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${style.bg} ${style.text}`}>
                            <Icon className="h-3 w-3" />
                            {log.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-900">{log.action}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 max-w-xs truncate" title={log.message}>{log.message}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                          {log.details && Object.keys(log.details).length > 0 ? (
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] break-all">
                              {JSON.stringify(log.details)}
                            </code>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {log.user_email ?? log.user_id?.slice(0, 8) ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Pagina {page} din {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
