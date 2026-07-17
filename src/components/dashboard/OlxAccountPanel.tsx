"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Wallet, Loader2, ChevronDown, Package, Megaphone, MessageSquare, ExternalLink, ShoppingCart,
} from "lucide-react";
import {
  getOlxAccountInfo, getOlxPackets, buyOlxCategoryPacket,
  getOlxPaidFeatures, buyOlxPaidFeature, getOlxThreads,
  type OlxAdvertRow, type OlxAccountInfo,
} from "@/lib/actions/olx.actions";
import type { OlxBoughtPacket, OlxPacket, OlxPaidFeature, OlxPaymentMethod, OlxThread } from "@/lib/olx/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/lib/ui";

function money(value: number, currency: string): string {
  return `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function OlxAccountPanel({ businessId, adverts }: { businessId: string; adverts: OlxAdvertRow[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<OlxAccountInfo | null>(null);
  const [packets, setPackets] = useState<{ available: OlxPacket[]; bought: OlxBoughtPacket[] } | null>(null);
  const [features, setFeatures] = useState<OlxPaidFeature[] | null>(null);
  const [threads, setThreads] = useState<OlxThread[] | null>(null);

  async function loadAll() {
    setLoading(true);
    const [acc, pk, ft, th] = await Promise.all([
      getOlxAccountInfo(businessId), getOlxPackets(businessId), getOlxPaidFeatures(businessId), getOlxThreads(businessId),
    ]);
    if (!("error" in acc)) setAccount(acc);
    if (!("error" in pk)) setPackets(pk);
    if (!("error" in ft)) setFeatures(ft.features);
    if (!("error" in th)) setThreads(th.threads);
    if ("error" in acc) toast.error(acc.error);
    setLoading(false);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && account === null && !loading) void loadAll();
  }

  const methods = account?.paymentMethods ?? [];
  const activeAdverts = adverts.filter((a) => a.olx_advert_id && ["active", "limited"].includes(a.status));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left">
        <span className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Cont OLX: sold, pachete și promovări</span>
        </span>
        <span className="flex items-center gap-2">
          {account?.balance && <span className="text-sm font-semibold tabular-nums text-foreground">{money(account.balance.sum, account.balance.currency)}</span>}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border p-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Balance */}
              {account?.balance ? (
                <div className="grid grid-cols-3 gap-3">
                  <BalanceTile label="Sold total" value={money(account.balance.sum, account.balance.currency)} strong />
                  <BalanceTile label="Portofel" value={money(account.balance.wallet, account.balance.currency)} />
                  <BalanceTile label="Bonus" value={money(account.balance.bonus, account.balance.currency)} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nu am putut încărca soldul contului OLX.</p>
              )}
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Plățile se fac din creditul contului tău OLX. Alimentarea portofelului cu cardul se face pe olx.ro (nu prin API);
                cumpărarea pachetelor și a promovărilor de mai jos se face direct de aici.
                {methods.includes("postpaid") && " Ai activată și plata pe factură (postpaid)."}
              </p>

              {/* Bought packets */}
              {packets && packets.bought.length > 0 && (
                <div>
                  <SectionLabel icon={Package}>Pachete active</SectionLabel>
                  <div className="space-y-1.5">
                    {packets.bought.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">{p.name ?? `Pachet ${p.size ?? ""}`}{p.categories_labels?.length ? ` · ${p.categories_labels.join(", ")}` : ""}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{p.left != null ? `${p.left} rămase` : ""}{p.active_to ? ` · până ${p.active_to.slice(0, 10)}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buy category packet */}
              <BuyPacket businessId={businessId} packets={packets?.available ?? []} methods={methods} />

              {/* Promote advert */}
              <PromoteAdvert businessId={businessId} adverts={activeAdverts} features={features ?? []} methods={methods} />

              {/* Inbox */}
              <div>
                <SectionLabel icon={MessageSquare}>Mesaje de la cumpărători</SectionLabel>
                {threads && threads.length > 0 ? (
                  <div className="space-y-1.5">
                    {threads.slice(0, 8).map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="text-foreground">Conversație #{t.id}{t.advert_id ? ` · anunț ${t.advert_id}` : ""}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {t.unread_count ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{t.unread_count} noi</span> : null}
                          {t.total_count ?? 0} mesaje
                        </span>
                      </div>
                    ))}
                    <a href="https://www.olx.ro/mesaje/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline">
                      Deschide toate mesajele pe OLX <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nicio conversație încă.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BuyPacket({ businessId, packets, methods }: { businessId: string; packets: OlxPacket[]; methods: OlxPaymentMethod[] }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [selected, setSelected] = useState<string>("");
  const [method, setMethod] = useState<OlxPaymentMethod>(methods[0] ?? "account");

  if (packets.length === 0) return null;
  // Group by a stable key of category+size+type.
  const options = packets.map((p, i) => ({ key: `${p.category_id}:${p.size}:${p.type ?? "base"}:${i}`, p }));
  const chosen = options.find((o) => o.key === selected)?.p;

  return (
    <div>
      <SectionLabel icon={ShoppingCart}>Cumpără pachet de anunțuri</SectionLabel>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select aria-label="Pachet" value={selected} onChange={(e) => setSelected(e.target.value)} className={cn(selectCls, "flex-1")}>
          <option value="">— alege pachet —</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {(o.p.name ?? `${o.p.size} anunțuri`)}{o.p.price != null ? ` — ${o.p.price} RON` : ""}
            </option>
          ))}
        </select>
        {methods.length > 1 && (
          <select aria-label="Metodă de plată" value={method} onChange={(e) => setMethod(e.target.value as OlxPaymentMethod)} className={selectCls}>
            {methods.map((m) => <option key={m} value={m}>{m === "account" ? "Din credit" : "Pe factură"}</option>)}
          </select>
        )}
        <Button
          disabled={saving || !chosen}
          onClick={() => chosen && startSave(async () => {
            const res = await buyOlxCategoryPacket(businessId, chosen.category_id, chosen.size, method, (chosen.type as "base" | "mega") ?? "base");
            if ("error" in res) { toast.error(res.error); return; }
            toast.success("Pachet cumpărat.");
            router.refresh();
          })}>
          {saving ? <Loader2 className="animate-spin" /> : "Cumpără"}
        </Button>
      </div>
    </div>
  );
}

function PromoteAdvert({ businessId, adverts, features, methods }: {
  businessId: string; adverts: OlxAdvertRow[]; features: OlxPaidFeature[]; methods: OlxPaymentMethod[];
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [advertId, setAdvertId] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [method, setMethod] = useState<OlxPaymentMethod>(methods[0] ?? "account");

  if (adverts.length === 0 || features.length === 0) return null;

  return (
    <div>
      <SectionLabel icon={Megaphone}>Promovează un anunț</SectionLabel>
      <div className="flex flex-col gap-2">
        <select aria-label="Anunț" value={advertId} onChange={(e) => setAdvertId(e.target.value)} className={selectCls}>
          <option value="">— alege anunțul —</option>
          {adverts.map((a) => <option key={a.offer_id} value={String(a.olx_advert_id)}>{a.name}</option>)}
        </select>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select aria-label="Promovare" value={code} onChange={(e) => setCode(e.target.value)} className={cn(selectCls, "flex-1")}>
            <option value="">— alege promovarea —</option>
            {features.map((f) => <option key={f.code} value={f.code}>{f.name ?? f.code}{f.duration ? ` (${f.duration} zile)` : ""}</option>)}
          </select>
          {methods.length > 1 && (
            <select aria-label="Metodă de plată" value={method} onChange={(e) => setMethod(e.target.value as OlxPaymentMethod)} className={selectCls}>
              {methods.map((m) => <option key={m} value={m}>{m === "account" ? "Din credit" : "Pe factură"}</option>)}
            </select>
          )}
          <Button
            disabled={saving || !advertId || !code}
            onClick={() => startSave(async () => {
              const res = await buyOlxPaidFeature(businessId, Number(advertId), code, method);
              if ("error" in res) { toast.error(res.error); return; }
              toast.success("Promovare activată.");
              router.refresh();
            })}>
            {saving ? <Loader2 className="animate-spin" /> : "Promovează"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BalanceTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums text-foreground", strong ? "text-lg font-bold" : "text-sm font-semibold")}>{value}</p>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {children}
    </p>
  );
}
