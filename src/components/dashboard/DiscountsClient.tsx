"use client";

import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Ticket,
  Percent, Banknote, Truck, Copy, Check, RefreshCw, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import {
  createDiscount, updateDiscount, deleteDiscount, toggleDiscount,
  type DiscountData,
} from "@/lib/actions/discount.actions";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Discount = Database["public"]["Tables"]["discounts"]["Row"];

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const TYPE_CONFIG = {
  percent:      { label: "Procent",           icon: Percent,  color: "text-info bg-info/10 border-info/20" },
  fixed:        { label: "Suma fixa",          icon: Banknote, color: "text-success bg-success/10 border-success/20" },
  free_shipping:{ label: "Transport gratuit", icon: Truck,    color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
};

const EMPTY_FORM: DiscountData = {
  code: "",
  type: "percent",
  value: 10,
  min_order_amount: null,
  max_uses: null,
  is_active: true,
  expires_at: null,
};

const fieldCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/* ── Overlay wrapper shared by modals ─────────────────────────────────────── */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      {children}
    </div>
  );
}

/* ── Create / Edit modal ──────────────────────────────────────────────────── */
interface ModalProps {
  businessId: string;
  editing: Discount | null;
  onClose: () => void;
}

function DiscountModal({ businessId, editing, onClose }: ModalProps) {
  const [form, setForm] = useState<DiscountData>(
    editing
      ? {
          code: editing.code,
          type: editing.type as DiscountData["type"],
          value: editing.value,
          min_order_amount: editing.min_order_amount,
          max_uses: editing.max_uses,
          is_active: editing.is_active,
          expires_at: editing.expires_at ? editing.expires_at.slice(0, 10) : null,
        }
      : { ...EMPTY_FORM, code: "" }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function validate() {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Codul este obligatoriu";
    else if (!/^[A-Z0-9_-]{3,20}$/i.test(form.code.trim())) e.code = "3-20 caractere, doar litere, cifre, - si _";
    if (form.type !== "free_shipping" && form.value <= 0) e.value = "Valoarea trebuie sa fie pozitiva";
    if (form.type === "percent" && form.value > 100) e.value = "Procentul nu poate depasi 100%";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: DiscountData = {
      ...form,
      code: form.code.trim().toUpperCase(),
      value: form.type === "free_shipping" ? 0 : Number(form.value),
      min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at || null,
    };
    // Close modal immediately for instant feel
    toast.success(editing ? "Discount actualizat." : "Discount creat.");
    onClose();
    startTransition(async () => {
      const result = editing
        ? await updateDiscount(editing.id, businessId, payload)
        : await createDiscount(businessId, payload);
      if ("error" in result) { toast.error(result.error); }
    });
  }

  return (
    <Overlay>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {editing ? "Editeaza discount" : "Discount nou"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Code */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Cod discount
            </label>
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="ex: VARA20"
                className={cn(fieldCls, "flex-1 font-mono tracking-widest", errors.code && "border-destructive")}
              />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, code: generateCode() }))}
                className="px-2.5 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
                title="Genereaza cod aleatoriu"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {errors.code && <p className="text-xs text-destructive mt-1">{errors.code}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Tip discount
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["percent", "fixed", "free_shipping"] as const).map(t => {
                const cfg = TYPE_CONFIG[t];
                const Icon = cfg.icon;
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 text-xs font-medium transition-all",
                      active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Value */}
          {form.type !== "free_shipping" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {form.type === "percent" ? "Procent reducere" : "Suma reducere (lei)"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={form.type === "percent" ? 100 : undefined}
                  step="0.01"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className={cn(fieldCls, "pr-12", errors.value && "border-destructive")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  {form.type === "percent" ? "%" : "lei"}
                </span>
              </div>
              {errors.value && <p className="text-xs text-destructive mt-1">{errors.value}</p>}
            </div>
          )}

          {/* Min order amount */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Valoare minima comanda (optional)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.min_order_amount ?? ""}
                onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value ? Number(e.target.value) : null }))}
                placeholder="Fara minim"
                className={cn(fieldCls, "pr-12")}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">lei</span>
            </div>
          </div>

          {/* Max uses */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Numar maxim de utilizari (optional)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={form.max_uses ?? ""}
              onChange={e => setForm(f => ({ ...f, max_uses: e.target.value ? Number(e.target.value) : null }))}
              placeholder="Nelimitat"
              className={fieldCls}
            />
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Data expirare (optional)
            </label>
            <input
              type="date"
              lang="ro"
              value={form.expires_at ?? ""}
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value || null }))}
              min={new Date().toISOString().slice(0, 10)}
              className={fieldCls}
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/50">
            <div>
              <p className="text-sm font-medium text-foreground">Discount activ</p>
              <p className="text-xs text-muted-foreground mt-0.5">Clientii pot folosi acest cod</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className="flex-shrink-0"
            >
              {form.is_active
                ? <ToggleRight className="h-7 w-7 text-primary" />
                : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Anuleaza
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Se salveaza..." : editing ? "Salveaza" : "Creeaza"}
            </Button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

/* ── Delete confirmation dialog ───────────────────────────────────────────── */
interface DeleteDialogProps {
  discount: Discount;
  businessId: string;
  onClose: () => void;
}

function DeleteDialog({ discount, businessId, onClose }: DeleteDialogProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDiscount(discount.id, businessId);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Discount sters.");
      onClose();
    });
  }

  return (
    <Overlay>
      <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl border border-border p-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Sterge discount</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Esti sigur ca vrei sa stergi codul{" "}
          <span className="font-mono font-bold text-foreground">{discount.code}</span>?
          Actiunea nu poate fi anulata.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Anuleaza
          </Button>
          <Button type="button" onClick={handleDelete} disabled={isPending} className="flex-1 bg-destructive text-white hover:bg-destructive/90">
            {isPending ? "Se sterge..." : "Sterge"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function DiscountsClient({ discounts, businessId }: {
  discounts: Discount[];
  businessId: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState<Discount | null>(null);
  const [, startToggle] = useTransition();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function handleEdit(d: Discount) {
    setEditing(d);
    setModalOpen(true);
  }

  function handleNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function handleToggle(d: Discount) {
    startToggle(async () => {
      const result = await toggleDiscount(d.id, businessId, !d.is_active);
      if ("error" in result) toast.error(result.error);
    });
  }

  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Cod copiat!");
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 500);
  }, []);

  const isExpired = (d: Discount) => !!d.expires_at && new Date(d.expires_at) < new Date();

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Discounturi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Creeaza si gestioneaza coduri promotionale</p>
        </div>
        <Button onClick={handleNew}>
          <Plus />
          <span className="hidden xs:inline sm:inline">Cod nou</span>
          <span className="xs:hidden sm:hidden">Nou</span>
        </Button>
      </div>

      {/* Empty state */}
      {discounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Ticket className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">Niciun cod de discount</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Creeaza primul tau cod promotional pentru a oferi reduceri clientilor.
          </p>
          <Button onClick={handleNew}>
            <Plus />
            Creeaza primul discount
          </Button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cod</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Valoare</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Utilizari</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Expira</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {discounts.map(d => {
                    const cfg = TYPE_CONFIG[d.type as keyof typeof TYPE_CONFIG];
                    const Icon = cfg.icon;
                    const expired = isExpired(d);
                    const usedUp = d.max_uses !== null && d.uses_count >= d.max_uses;
                    const effectivelyActive = d.is_active && !expired && !usedUp;

                    return (
                      <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground tracking-wider">{d.code}</span>
                            <button
                              type="button"
                              onClick={() => copyCode(d.code)}
                              className={cn("transition-colors", copiedCode === d.code ? "text-success" : "text-muted-foreground hover:text-foreground")}
                            >
                              {copiedCode === d.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {d.min_order_amount && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">Min. {d.min_order_amount} lei</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium", cfg.color)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          <span className="font-semibold text-foreground">
                            {d.type === "percent" && `${d.value}%`}
                            {d.type === "fixed" && `${d.value} lei`}
                            {d.type === "free_shipping" && "-"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          <span className={cn("text-sm", usedUp && "text-destructive font-semibold")}>
                            {d.uses_count}{d.max_uses !== null ? ` / ${d.max_uses}` : ""}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          {d.expires_at ? (
                            <span className={cn("text-sm", expired && "text-destructive")}>
                              {expired ? "Expirat" : formatDate(new Date(d.expires_at))}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Nelimitat</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => handleToggle(d)}
                            className="flex items-center gap-1.5"
                          >
                            {effectivelyActive ? (
                              <>
                                <ToggleRight className="h-5 w-5 text-primary" />
                                <span className="text-xs font-medium text-primary">Activ</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  {expired ? "Expirat" : usedUp ? "Epuizat" : "Inactiv"}
                                </span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => handleEdit(d)}
                              className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(d)}
                              className="p-1.5 rounded-lg hover:bg-destructive/5 transition-colors text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[
              { label: "Total coduri", value: discounts.length },
              { label: "Active", value: discounts.filter(d => d.is_active && !isExpired(d) && (d.max_uses === null || d.uses_count < d.max_uses)).length },
              { label: "Total utilizari", value: discounts.reduce((s, d) => s + d.uses_count, 0) },
              { label: "Expirate / Epuizate", value: discounts.filter(d => isExpired(d) || (d.max_uses !== null && d.uses_count >= d.max_uses)).length },
            ].map(stat => (
              <div key={stat.label} className="bg-surface border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      {modalOpen && (
        <DiscountModal
          businessId={businessId}
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}
      {deleting && (
        <DeleteDialog
          discount={deleting}
          businessId={businessId}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
