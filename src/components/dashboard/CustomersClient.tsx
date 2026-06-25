"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users, Search, Phone, Mail, MapPin, ShoppingBag, TrendingUp, Repeat,
  X, ChevronRight, Calendar, ExternalLink, ArrowUpDown,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { normalizePhone, type Customer, type CustomersSummary } from "@/lib/customers";
import { orderStatus } from "@/lib/orders/status";

type SortKey = "recent" | "spent" | "orders" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Activitate recenta" },
  { key: "spent",  label: "Total cheltuit" },
  { key: "orders", label: "Numar comenzi" },
  { key: "name",   label: "Nume (A-Z)" },
];

function StatCard({ icon: Icon, label, value, tint }: {
  icon: typeof Users; label: string; value: string; tint: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center", tint)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function CustomersClient({ customers, summary }: { customers: Customer[]; summary: CustomersSummary }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qPhone = normalizePhone(search);
    let list = customers;
    if (q) {
      list = customers.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (qPhone.length >= 3 && normalizePhone(c.phone).includes(qPhone))
      );
    }
    const out = list.slice();
    switch (sort) {
      case "spent": out.sort((a, b) => b.totalSpent - a.totalSpent); break;
      case "orders": out.sort((a, b) => b.orderCount - a.orderCount); break;
      case "name": out.sort((a, b) => a.name.localeCompare(b.name, "ro")); break;
      case "recent": default: out.sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime()); break;
    }
    return out;
  }, [customers, search, sort]);

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Clienti</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Toti clientii care au comandat din magazin, grupati automat dupa numarul de telefon.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Users} label="Clienti" value={String(summary.totalCustomers)} tint="bg-primary/10 text-primary" />
        <StatCard icon={Repeat} label="Clienti fideli" value={String(summary.returningCustomers)} tint="bg-info/10 text-info" />
        <StatCard icon={ShoppingBag} label="Venit total" value={formatPrice(summary.totalRevenue)} tint="bg-success/10 text-success" />
        <StatCard icon={TrendingUp} label="Valoare medie comanda" value={formatPrice(summary.averageOrderValue)} tint="bg-warning/10 text-warning" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cauta dupa nume, telefon sau email..."
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none w-full sm:w-auto pl-10 pr-9 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:border-primary cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">
            {search ? "Niciun client gasit" : "Niciun client inca"}
          </p>
          <p className="text-sm text-muted-foreground">
            {search ? "Incearca alta cautare." : "Clientii apar aici dupa prima comanda din magazin."}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
          {filtered.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelected(c)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                {c.name[0]?.toUpperCase() ?? "C"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  {c.paidOrderCount > 1 && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-info bg-info/10 border border-info/20 rounded-full px-1.5 py-0.5">
                      <Repeat className="h-2.5 w-2.5" /> Fidel
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {c.phone}{c.email ? ` · ${c.email}` : ""}
                </p>
              </div>
              <div className="hidden sm:block text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">{c.orderCount} {c.orderCount === 1 ? "comanda" : "comenzi"}</p>
                <p className="text-[11px] text-muted-foreground/70">{formatDate(c.lastOrderAt)}</p>
              </div>
              <div className="text-right flex-shrink-0 w-24">
                <p className="text-sm font-bold text-foreground tabular-nums">{formatPrice(c.totalSpent)}</p>
                <p className="text-[11px] text-muted-foreground">cheltuit</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const addressParts = [customer.address, customer.city, customer.county].filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start gap-3 flex-shrink-0">
          <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
            {customer.name[0]?.toUpperCase() ?? "C"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground truncate">{customer.name}</h2>
              {customer.paidOrderCount > 1 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-info bg-info/10 border border-info/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
                  <Repeat className="h-2.5 w-2.5" /> Fidel
                </span>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="h-3 w-3" /> {customer.email}
                </a>
              )}
              {addressParts.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" /> {addressParts.join(", ")}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{customer.orderCount}</p>
              <p className="text-[11px] text-muted-foreground">Comenzi</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.totalSpent)}</p>
              <p className="text-[11px] text-muted-foreground">Total cheltuit</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(customer.aov)}</p>
              <p className="text-[11px] text-muted-foreground">Valoare medie</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Prima comanda: <span className="text-foreground font-medium">{formatDate(customer.firstOrderAt)}</span>
            </span>
            <span className="text-muted-foreground">Ultima: <span className="text-foreground font-medium">{formatDate(customer.lastOrderAt)}</span></span>
          </div>

          {/* Order history */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Istoric comenzi</p>
            <div className="space-y-1.5">
              {customer.orders.map((o) => {
                const st = orderStatus(o.status);
                return (
                  <Link
                    key={o.id}
                    href={`/dashboard/orders/${o.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">#{o.order_number}</p>
                        <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-0.5", st.className)}>{st.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(o.created_at)} · {o.item_count} {o.item_count === 1 ? "produs" : "produse"}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-foreground tabular-nums flex-shrink-0">{formatPrice(o.total)}</p>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
